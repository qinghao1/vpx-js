// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'

export async function loadPuppeteer() {
	for (const specifier of ['puppeteer-core', 'puppeteer']) {
		try {
			const mod = await import(specifier)
			return mod.default ?? mod
		} catch {}
	}
	throw new Error('puppeteer-core not found')
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Predicate poll: resolves true as soon as `fn` returns truthy, false on
// timeout. Prefer over a fixed sleep when waiting for page/viewer state.
export async function waitFor(fn, { timeoutMs = 5000, intervalMs = 100 } = {}) {
	const start = Date.now()
	for (;;) {
		try {
			if (await fn()) return true
		} catch {}
		if (Date.now() - start >= timeoutMs) return false
		await sleep(intervalMs)
	}
}

const _browsers = new Set()
const _vites = new Set()
const _profileDirs = new Map()
// Isolation: this module never kills by pattern (no pkill). Cleanup is scoped
// to PIDs this process spawned (tracked in _browsers/_vites) plus the profile
// dirs those browsers created, so parallel harness runs — and unrelated user
// chrome/vite processes — are never touched.
let _cleanupRegistered = false
const CHROME_CANDIDATES = [
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
function resolveChromePath() {
	const override = process.env.CHROME_PATH
	if (override && existsSync(override)) return override
	for (const candidate of CHROME_CANDIDATES) {
		if (existsSync(candidate)) return candidate
	}
	return undefined
}
function trackProfileDir(browser) {
	try {
		const arg = browser.process()?.spawnargs?.find(a => a.startsWith('--user-data-dir='))
		if (arg) _profileDirs.set(browser, arg.slice('--user-data-dir='.length))
	} catch {}
}
function removeOwnProfileDir(browser) {
	const dir = _profileDirs.get(browser)
	_profileDirs.delete(browser)
	if (!dir || !dir.includes('puppeteer_dev_chrome')) return
	try {
		rmSync(dir, { recursive: true, force: true })
	} catch {}
}
function registerCleanup() {
	if (_cleanupRegistered) return
	_cleanupRegistered = true
	// Tracked PIDs only: reap browsers/vites this process spawned, then drop
	// their own profile dirs. Never pattern-match host processes.
	const _cleanup = () => {
		for (const b of _browsers) {
			try {
				const proc = b.process?.()
				const pid = proc?.pid
				if (pid)
					try {
						process.kill(pid, 'SIGKILL')
					} catch {}
				try {
					proc?.kill('SIGKILL')
				} catch {}
			} catch {}
			removeOwnProfileDir(b)
		}
		_browsers.clear()
		for (const p of _vites) {
			try {
				process.kill(p.pid, 'SIGKILL')
			} catch {}
			try {
				p.kill('SIGKILL')
			} catch {}
			try {
				p.kill('SIGTERM')
			} catch {}
		}
		_vites.clear()
	}
	process.once('exit', _cleanup)
	process.once('beforeExit', _cleanup)
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
		process.once(signal, () => {
			_cleanup()
			process.exit(1)
		})
	}
	for (const [event, label] of [
		['uncaughtException', 'uncaught'],
		['unhandledRejection', 'unhandled'],
	]) {
		process.on(event, error => {
			console.error(`[harness] ${label}`, error)
			_cleanup()
			process.exit(1)
		})
	}
}
if (typeof process !== 'undefined') {
	registerCleanup()
}
function resolveGpuArgs(gpu) {
	if (gpu === 'gl') return ['--enable-gpu', '--use-gl=angle', '--use-angle=gl']
	if (gpu) return ['--enable-gpu', '--use-gl=angle', '--use-angle=vulkan']
	return [
		'--enable-unsafe-webgpu',
		'--enable-features=Vulkan',
		'--use-angle=vulkan',
		'--disable-vulkan-surface',
		'--enable-unsafe-swiftshader',
		'--use-gl=angle',
		'--use-angle=swiftshader',
	]
}
export async function launchBrowser(puppeteer, opts = {}) {
	registerCleanup()
	// No proactive reaping: a second concurrent run must never SIGKILL the
	// browser this run (or any other process) already has open.
	const { gpu, ...rest } = opts
	const gpuArgs = resolveGpuArgs(gpu)
	const chromePath = resolveChromePath()
	const browser = await puppeteer.launch({
		...(chromePath ? { executablePath: chromePath } : {}),
		headless: 'new',
		ignoreHTTPSErrors: true,
		acceptInsecureCerts: true,
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--ignore-certificate-errors',
			'--allow-insecure-localhost',
			...gpuArgs,
			'--window-size=1280,900',
			'--disable-gpu-sandbox',
			'--autoplay-policy=no-user-gesture-required',
		],
		...rest,
	})
	_browsers.add(browser)
	trackProfileDir(browser)
	const pid = browser.process()?.pid
	const autoKill = setTimeout(() => {
		try {
			browser.close().catch(() => {})
		} catch {}
		try {
			if (pid) process.kill(pid, 'SIGKILL')
		} catch {}
		try {
			browser.process()?.kill('SIGKILL')
		} catch {}
	}, opts.autoKillMs ?? 300_000)
	if (autoKill.unref) autoKill.unref()
	const origClose = browser.close.bind(browser)
	browser.close = async (...args) => {
		clearTimeout(autoKill)
		try {
			_browsers.delete(browser)
		} catch {}
		try {
			return await origClose(...args)
		} finally {
			try {
				if (pid) process.kill(pid, 'SIGKILL')
			} catch {}
			try {
				browser.process()?.kill?.('SIGKILL')
			} catch {}
			removeOwnProfileDir(browser)
		}
	}
	try {
		browser.process()?.once?.('exit', () => _browsers.delete(browser))
	} catch {}
	try {
		browser.process()?.once?.('disconnect', () => _browsers.delete(browser))
	} catch {}
	return browser
}

export async function newPage(browser) {
	const page = await browser.newPage()
	await page.setViewport({ width: 1280, height: 900 })
	try {
		await page.bringToFront()
	} catch {}
	// Allow self-signed vite cert
	try {
		await page.setBypassCSP(true)
	} catch {}
	return page
}

export function attachLogging(page, { filter = /./, prefix = '[c]' } = {}) {
	const logs = []
	page.on('console', msg => {
		const text = msg.text()
		logs.push(text)
		if (filter.test(text)) console.log(`${prefix} ${text.slice(0, 500)}`)
	})
	page.on('pageerror', error => console.log('[pageerror]', error.message.slice(0, 1000)))
	return logs
}

export function isCertError(error) {
	const msg = String(error?.message || error)
	return (
		msg.includes('self-signed') || msg.includes('DEPTH_ZERO') || msg.includes('CERT') || msg.includes('certificate')
	)
}

async function fetchOk(url, method = 'HEAD') {
	// Self-signed local vite cert: disable TLS verification for the probe only, then restore.
	// Bound the probe: sandboxed localhost dials can blackhole instead of
	// refusing, and an unbounded fetch would stall the harness silently.
	const prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	try {
		if ((await fetch(url, { method, signal: AbortSignal.timeout(5000) })).ok) return true
	} catch (e) {
		if (isCertError(e)) return true
	} finally {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTlsReject ?? ''
	}
	return false
}

export async function ensureVite(
	url,
	{ cwd = new URL('../../demo-browser', import.meta.url).pathname, label = 'vite' } = {},
) {
	registerCleanup()
	// Port isolation: derive the wanted port from the requested URL so
	// concurrent harness runs on distinct --port values probe AND spawn on
	// their own port instead of all colliding on 3000.
	const wantedPort = (() => {
		try {
			return new URL(url.replace(/\?.*$/, '')).port || '3000'
		} catch {
			return '3000'
		}
	})()
	const candidates = [`https://localhost:${wantedPort}/`, `http://localhost:${wantedPort}/`]
	for (let attempt = 0; attempt < 3; attempt++) {
		for (const u of candidates) {
			if (await fetchOk(u, 'HEAD')) return null
			if (await fetchOk(u, 'GET')) return null
		}
		if (attempt < 2) {
			console.log(`[${label}] vite not ready, retry ${attempt + 1}/3…`)
			await sleep(800)
		}
	}
	console.log(`[${label}] starting vite in ${cwd}…`)
	const proc = spawn('npx', ['vite', '--host', '--port', wantedPort, '--clearScreen', 'false'], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	_vites.add(proc)
	proc.once('exit', () => _vites.delete(proc))
	const killViteProc = () => {
		try {
			proc.kill('SIGTERM')
		} catch {}
		try {
			proc.kill('SIGKILL')
		} catch {}
		try {
			process.kill(proc.pid, 'SIGKILL')
		} catch {}
		_vites.delete(proc)
	}
	// Spawned-vite watchdog: a harness-spawned server must outlive the longest
	// leg (multi-minute SwiftShader phases), not the old 120 s budget, which
	// murdered the server mid-run. Process-exit cleanup still reaps it.
	const viteAutoKill = setTimeout(killViteProc, 3_600_000)
	if (viteAutoKill.unref) viteAutoKill.unref()
	const origKill = proc.kill.bind(proc)
	proc.kill = (...args) => {
		clearTimeout(viteAutoKill)
		_vites.delete(proc)
		return origKill(...args)
	}
	if (typeof process !== 'undefined') {
		process.once('exit', killViteProc)
		process.once('SIGINT', killViteProc)
		process.once('SIGTERM', killViteProc)
		process.once('SIGHUP', killViteProc)
	}
	proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`))
	proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`))
	for (let i = 0; i < 60; i++) {
		await sleep(1000)
		// Vite serves https (basicSsl) in this repo; probe both schemes with
		// the same TLS-tolerant check as the pre-spawn candidates above.
		// 60 s: cold plugin + dep optimization on a loaded box exceeds 30 s.
		for (const u of candidates) {
			if (await fetchOk(u, 'HEAD')) {
				console.log(`[${label}] vite ready (${u})`)
				return proc
			}
		}
	}
	throw new Error('vite not ready in 60s')
}

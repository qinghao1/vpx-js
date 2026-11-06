// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { spawn } from 'node:child_process'
import { existsSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'

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
		for (const p of _vites) killGroup(p)
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

// One vite per tree root per process, on an OS-assigned free port. A server
// this process did not spawn is never reused: it may serve another checkout,
// and a sibling run's server dies when that run exits.
const _viteByRoot = new Map()

function freePort() {
	return new Promise((resolve, reject) => {
		const server = createServer()
		server.once('error', reject)
		server.listen(0, () => {
			const { port } = server.address()
			server.close(() => resolve(port))
		})
	})
}

// `npx vite` forks sh + node: spawned detached, the tree is its own process
// group, so signalling -pid reaps the server rather than orphaning it.
function killGroup(proc, signal = 'SIGKILL') {
	try {
		process.kill(-proc.pid, signal)
	} catch {}
}

async function startVite(root, protocol, label) {
	for (let attempt = 1; ; attempt++) {
		const port = await freePort()
		console.log(`[${label}] starting vite in ${root} on :${port}…`)
		const proc = spawn(
			'npx',
			['vite', '--host', '--port', String(port), '--strictPort', '--clearScreen', 'false'],
			{
				cwd: root,
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: true,
			},
		)
		_vites.add(proc)
		proc.once('exit', () => _vites.delete(proc))
		proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`))
		proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`))
		// 60 s: cold plugin + dep optimization on a loaded box exceeds 30 s.
		for (let i = 0; i < 60 && proc.exitCode === null; i++) {
			await sleep(1000)
			if (await fetchOk(`${protocol}//localhost:${port}/`)) return { proc, port }
		}
		const exited = proc.exitCode !== null
		killGroup(proc)
		// --strictPort exits when something grabbed the port between freePort()
		// and vite's bind: retry on a fresh port; a hang is a real failure.
		if (!exited || attempt === 3) throw new Error(`[${label}] vite did not start on :${port}`)
	}
}

/**
 * Serve `cwd` (default: demo-browser) with this process's own vite and return
 * `url` re-pointed at it. Navigate to the returned `url`, never the requested
 * one: the port is chosen per run so parallel runs cannot collide.
 */
export async function ensureVite(
	url,
	{ cwd = new URL('../../demo-browser', import.meta.url).pathname, label = 'vite' } = {},
) {
	const requested = new URL(url)
	const root = realpathSync(cwd)
	let server = _viteByRoot.get(root)
	if (!server) {
		server = startVite(root, requested.protocol, label)
		_viteByRoot.set(root, server)
		server.catch(() => _viteByRoot.delete(root))
	}
	const { proc, port } = await server
	requested.port = String(port)
	return {
		url: requested.href,
		get killed() {
			return proc.exitCode !== null
		},
		kill(signal = 'SIGKILL') {
			_viteByRoot.delete(root)
			killGroup(proc, signal)
		},
	}
}

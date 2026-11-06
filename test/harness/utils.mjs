// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
const _viteByPort = new Map()
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
		// p.kill is the startOwnVite override: group-kills the whole npx/sh/node
		// tree, then the direct pid as fallback.
		for (const p of _vites) {
			try {
				p.kill('SIGKILL')
			} catch {}
			try {
				process.kill(p.pid, 'SIGKILL')
			} catch {}
		}
		_vites.clear()
		_viteByPort.clear()
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

// Per-port ownership lock: records which tree root the server answering on a
// port was started for, and by which PID. An HTTP probe alone cannot tell our
// vite apart from a foreign one — any server answers 200 on / — so reuse
// requires a live lock for this same root. Never reuse silently: a foreign
// server means falling back to a free per-run port.
const viteLockPath = port => join(tmpdir(), `vpx-harness-vite-${port}.json`)
function readViteLock(port) {
	try {
		const raw = JSON.parse(readFileSync(viteLockPath(port), 'utf8'))
		if (!raw || typeof raw.root !== 'string' || typeof raw.pid !== 'number') return null
		let alive = false
		try {
			process.kill(raw.pid, 0)
			alive = true
		} catch {}
		return { root: raw.root, pid: raw.pid, alive }
	} catch {
		return null
	}
}
function claimViteLock(port, root, pid) {
	try {
		writeFileSync(viteLockPath(port), JSON.stringify({ root, pid, startedAt: Date.now() }))
	} catch {}
}
function releaseViteLock(port, pid) {
	try {
		const lock = readViteLock(port)
		if (lock && lock.pid === pid) unlinkSync(viteLockPath(port))
	} catch {}
}
// Vite spawns detached (own process group) so cleanup can reap the whole
// tree: `npx vite` forks `sh -c` + node, and signaling the npx pid alone
// orphans the server (verified: node vite survives SIGTERM/SIGKILL to its
// npx parent). The group id equals the child pid and is ours alone.
function sameRoot(a, b) {
	try {
		return realpathSync(a) === realpathSync(b)
	} catch {
		return a === b
	}
}
function viteCandidates(port) {
	return [`https://localhost:${port}/`, `http://localhost:${port}/`]
}
async function portAnswers(port) {
	// Vite serves https (basicSsl) in this repo; probe both schemes with the
	// TLS-tolerant check. Bound by fetchOk's AbortSignal timeout.
	for (const u of viteCandidates(port)) {
		if (await fetchOk(u, 'HEAD')) return true
		if (await fetchOk(u, 'GET')) return true
	}
	return false
}
// True when the server answering on `port` provably serves `cwd`: spawned by
// this process for that root, or claimed by a live lock for the same root.
function viteServesRoot(port, cwd) {
	const key = String(port)
	const own = _viteByPort.get(key)
	if (own && own.proc.exitCode === null && !own.proc.killed && sameRoot(own.root, cwd)) return true
	const lock = readViteLock(port)
	return !!lock && lock.alive && sameRoot(lock.root, cwd)
}
// Lowest port at/after `from` safe to use for `cwd`: a port whose occupant (if
// any) is ours is reused; ports answering HTTP from a foreign server, or held
// by a live foreign lock, are skipped. Never returns a foreign-occupied port.
async function findVitePort(from, cwd, label) {
	let port = from
	for (let i = 0; i < 64; i++, port++) {
		const key = String(port)
		const entry = _viteByPort.get(key)
		if (entry) {
			if (entry.proc.exitCode === null && !entry.proc.killed) {
				if (sameRoot(entry.root, cwd)) return { port, reuse: true }
				continue
			}
			_viteByPort.delete(key)
			_vites.delete(entry.proc)
		}
		if (await portAnswers(port)) {
			if (viteServesRoot(port, cwd)) return { port, reuse: true }
			continue
		}
		const lock = readViteLock(port)
		if (lock?.alive && !sameRoot(lock.root, cwd)) continue
		return { port, reuse: false }
	}
	const free = await new Promise((resolve, reject) => {
		const s = createServer()
		s.once('error', reject)
		s.listen(0, '127.0.0.1', () => {
			const p = s.address()?.port
			s.close(() => resolve(p))
		})
	})
	console.log(`[${label}] port range busy, using OS-assigned :${free}`)
	return { port: free, reuse: false }
}
function withPort(url, fromPort, toPort) {
	if (String(fromPort) === String(toPort)) return url
	const prefix = `://localhost:${fromPort}`
	if (url.includes(prefix)) return url.replace(prefix, `://localhost:${toPort}`)
	try {
		const u = new URL(url)
		u.port = String(toPort)
		return u.toString()
	} catch {
		throw new Error(`cannot remap vite port in URL: ${url}`)
	}
}
// Return shape: { proc, url, port, reused, pid, killed, kill }. `url` is the
// effective server URL — use it for navigation, since a foreign occupant can
// move the server to a per-run fallback port. `proc` is null when reusing a
// server owned by another process; kill() then no-ops. The handle quacks like
// the old ChildProcess-or-null return for `vite?.kill()` / `!proc.killed`.
function viteHandle(proc, url, port, reused) {
	return {
		proc,
		url,
		port: String(port),
		reused,
		get pid() {
			return proc?.pid
		},
		get killed() {
			return !proc || proc.killed || proc.exitCode !== null
		},
		kill: (...args) => {
			if (!proc) return false
			return proc.kill(...args)
		},
	}
}
function dropVite(port, proc) {
	_vites.delete(proc)
	if (_viteByPort.get(String(port))?.proc === proc) _viteByPort.delete(String(port))
	releaseViteLock(port, proc.pid)
}
async function startOwnVite(port, finalUrl, cwd, label) {
	console.log(`[${label}] starting vite in ${cwd}…`)
	// --strictPort: refuse to bind rather than silently bumping to another
	// port, which would desync the lock claim and the URL below.
	const proc = spawn('npx', ['vite', '--host', '--port', String(port), '--strictPort', '--clearScreen', 'false'], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
	})
	let root = cwd
	try {
		root = realpathSync(cwd)
	} catch {}
	_vites.add(proc)
	_viteByPort.set(String(port), { proc, root })
	claimViteLock(port, root, proc.pid)
	proc.once('exit', () => dropVite(port, proc))
	const origKill = proc.kill.bind(proc)
	const treeKill = signal => {
		try {
			if (proc.pid) process.kill(-proc.pid, signal)
		} catch {}
		try {
			origKill(signal)
		} catch {}
		try {
			if (proc.pid) process.kill(proc.pid, signal)
		} catch {}
	}
	const killViteProc = () => {
		treeKill('SIGTERM')
		treeKill('SIGKILL')
		dropVite(port, proc)
	}
	// Spawned-vite watchdog: a harness-spawned server must outlive the longest
	// leg (multi-minute SwiftShader phases), not the old 120 s budget, which
	// murdered the server mid-run. Process-exit cleanup still reaps it.
	const viteAutoKill = setTimeout(killViteProc, 3_600_000)
	if (viteAutoKill.unref) viteAutoKill.unref()
	proc.kill = (...args) => {
		clearTimeout(viteAutoKill)
		dropVite(port, proc)
		treeKill(args[0] ?? 'SIGTERM')
		return false
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
		// 60 s: cold plugin + dep optimization on a loaded box exceeds 30 s.
		if (proc.exitCode !== null) {
			dropVite(port, proc)
			throw new Error(`[${label}] vite on :${port} exited during startup (code ${proc.exitCode})`)
		}
		// Only our --strictPort vite can hold this port (we probed it free),
		// so an answer here is ours — a foreign grab would fail our bind and
		// trip the exit check above instead of serving the wrong tree.
		if (await portAnswers(port)) {
			console.log(`[${label}] vite ready (port ${port})`)
			return viteHandle(proc, finalUrl, port, false)
		}
	}
	dropVite(port, proc)
	try {
		proc.kill('SIGKILL')
	} catch {}
	throw new Error('vite not ready in 60s')
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
	const wanted = Number(wantedPort)
	for (let attempt = 0; attempt < 3; attempt++) {
		if (await portAnswers(wantedPort)) break
		if (attempt < 2) {
			console.log(`[${label}] vite not ready, retry ${attempt + 1}/3…`)
			await sleep(800)
		}
	}
	if (await portAnswers(wantedPort)) {
		if (viteServesRoot(wantedPort, cwd)) {
			console.log(`[${label}] reusing vite on :${wantedPort} (serves this tree)`)
			return viteHandle(_viteByPort.get(String(wantedPort))?.proc ?? null, url, wantedPort, true)
		}
		// A foreign server (stale vite from another checkout, a dev server,
		// anything else answering 200): never reuse it — fall back to a free
		// per-run port instead of serving the wrong tree.
		console.log(`[${label}] :${wantedPort} answers but serves another tree — not reusing`)
		const found = await findVitePort(wanted + 1, cwd, label)
		const finalUrl = withPort(url, wantedPort, found.port)
		if (found.reuse) {
			console.log(`[${label}] reusing own vite on :${found.port} (serves this tree)`)
			return viteHandle(_viteByPort.get(String(found.port))?.proc ?? null, finalUrl, found.port, true)
		}
		console.log(`[${label}] falling back to per-run port :${found.port}`)
		return startOwnVite(found.port, finalUrl, cwd, label)
	}
	const pending = readViteLock(wantedPort)
	if (pending?.alive && sameRoot(pending.root, cwd)) {
		// A same-tree sibling run just spawned its server and it is still
		// starting: wait for it instead of spawning a second vite on the
		// same port (which --strictPort would refuse).
		for (let i = 0; i < 60; i++) {
			await sleep(1000)
			if ((await portAnswers(wantedPort)) && viteServesRoot(wantedPort, cwd)) {
				console.log(`[${label}] reusing vite on :${wantedPort} (serves this tree)`)
				return viteHandle(_viteByPort.get(String(wantedPort))?.proc ?? null, url, wantedPort, true)
			}
		}
	}
	return startOwnVite(wanted, url, cwd, label)
}

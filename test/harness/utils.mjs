// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { existsSync, realpathSync } from 'node:fs'
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

// Cleanup is scoped to handles this process created: launched browsers and
// in-process vite servers. Never pattern-match host processes, so parallel
// runs — and unrelated user chrome/vite processes — are never touched.
// Chrome runs with pipe:true and vite runs in-process, so both die with this
// process even on SIGKILL; the handlers below only fast-path that.
const _browsers = new Set()
const _servers = new Set()
let _cleanupRegistered = false
function _cleanup() {
	for (const b of _browsers) {
		try {
			b.process()?.kill('SIGKILL')
		} catch {}
	}
	_browsers.clear()
	for (const s of _servers) {
		try {
			s.close().catch(() => {})
		} catch {}
	}
	_servers.clear()
}
function registerCleanup() {
	if (_cleanupRegistered) return
	_cleanupRegistered = true
	process.once('exit', _cleanup)
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
		process.once(signal, () => {
			_cleanup()
			process.exit(1)
		})
	}
}
if (typeof process !== 'undefined') {
	registerCleanup()
}
const CHROME_CANDIDATES = [
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
export function resolveChromePath() {
	const override = process.env.CHROME_PATH
	if (override && existsSync(override)) return override
	for (const candidate of CHROME_CANDIDATES) {
		if (existsSync(candidate)) return candidate
	}
	return undefined
}
function resolveGpuArgs(gpu) {
	if (gpu === 'gl') return ['--enable-gpu', '--use-gl=angle', '--use-angle=gl']
	if (gpu) return ['--enable-gpu', '--use-gl=angle', '--use-angle=vulkan']
	return [
		'--enable-unsafe-webgpu',
		'--enable-features=Vulkan',
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
	// autoKillMs is ours (watchdog below), not a puppeteer launch option.
	const { gpu, autoKillMs = 1_200_000, ...rest } = opts
	const gpuArgs = resolveGpuArgs(gpu)
	const chromePath = resolveChromePath()
	const browser = await puppeteer.launch({
		...(chromePath ? { executablePath: chromePath } : {}),
		// Piped chrome exits when this process dies, even on SIGKILL.
		pipe: true,
		headless: true,
		acceptInsecureCerts: true,
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			...gpuArgs,
			'--window-size=1280,900',
			'--disable-gpu-sandbox',
			'--autoplay-policy=no-user-gesture-required',
		],
		...rest,
	})
	_browsers.add(browser)
	const autoKill = setTimeout(() => {
		try {
			browser.close().catch(() => {})
		} catch {}
	}, autoKillMs)
	if (autoKill.unref) autoKill.unref()
	const origClose = browser.close.bind(browser)
	browser.close = async (...args) => {
		clearTimeout(autoKill)
		_browsers.delete(browser)
		return origClose(...args)
	}
	return browser
}

export async function newPage(browser) {
	const page = await browser.newPage()
	await page.setViewport({ width: 1280, height: 900 })
	try {
		await page.bringToFront()
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

// One vite per tree root per process, served in-process on an OS-assigned
// port: no child to orphan, no port race, and the server dies with this
// process. Close the returned handle (or exit) when done — the listening
// server keeps the event loop alive.
const _viteByRoot = new Map()

async function startVite(root, label) {
	const { createServer } = await import('vite')
	const server = await createServer({
		root,
		configFile: join(root, 'vite.config.ts'),
		server: { port: 0, host: '127.0.0.1' },
		clearScreen: false,
	})
	await server.listen()
	const local = server.resolvedUrls?.local?.[0]
	if (!local) {
		await server.close().catch(() => {})
		throw new Error(`[${label}] vite has no local URL (root ${root})`)
	}
	console.log(`[${label}] vite in-process at ${new URL(local).origin} (root ${root})`)
	_servers.add(server)
	return server
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
	let pending = _viteByRoot.get(root)
	if (!pending) {
		pending = startVite(root, label)
		_viteByRoot.set(root, pending)
		pending.catch(() => {
			if (_viteByRoot.get(root) === pending) _viteByRoot.delete(root)
		})
	}
	const server = await pending
	const origin = new URL(server.resolvedUrls.local[0])
	requested.protocol = origin.protocol
	requested.hostname = origin.hostname
	requested.port = origin.port
	let closed = false
	const drop = () => {
		closed = true
		if (_viteByRoot.get(root) === pending) _viteByRoot.delete(root)
		_servers.delete(server)
	}
	return {
		url: requested.href,
		get killed() {
			return closed
		},
		kill() {
			if (!closed) {
				drop()
				server.close().catch(() => {})
			}
		},
		async close() {
			if (!closed) {
				drop()
				await server.close().catch(() => {})
			}
		},
	}
}

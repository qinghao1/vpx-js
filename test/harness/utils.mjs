// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

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

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export const findChrome = () => CHROME_CANDIDATES.find(candidate => candidate && existsSync(candidate))

const DEMO_ROOT = fileURLToPath(new URL('../../demo-browser', import.meta.url))
export const ENGINE_ARTIFACT = `${DEMO_ROOT}/public/wasm/vpinball-headless.wasm`

// Best-effort reaping: a Ctrl+C between legs must not strand vite servers
// (ports) or piped-chrome watchdogs. Handlers re-raise the signal after
// cleanup so the process still dies with the right disposition.
const liveCloseables = new Set()
let signalsArmed = false
function armSignalCleanup() {
	if (signalsArmed) return
	signalsArmed = true
	for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
		process.once(sig, () => {
			for (const close of liveCloseables) {
				try {
					close()
				} catch {}
			}
			liveCloseables.clear()
			process.kill(process.pid, sig)
		})
	}
}

/** Exit 77 (skip) unless the engine artifact and Chrome are both present. */
export function requireEngineAndChrome() {
	const missing = !existsSync(ENGINE_ARTIFACT)
		? 'engine artifact (npm run build:wasm:headless)'
		: !findChrome()
			? 'Chrome (set CHROME_PATH)'
			: ''
	if (!missing) return
	console.log(`SKIP: no ${missing}`)
	process.exit(77)
}

/**
 * The host GPU (Vulkan) when the machine has one, else null (SwiftShader).
 * Legs that play a table need it: SwiftShader frames run past the engine's
 * 100 ms stall threshold, so game time stops. USE_SWIFTSHADER=1 forces software GL.
 */
export const hostGpu = () =>
	process.env.USE_SWIFTSHADER !== '1' && existsSync('/dev/dri/renderD128') ? 'vulkan' : null

function gpuArgs(gpu) {
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

/**
 * Launch Chrome over a pipe, so it exits with this process. `gpu` picks the
 * backend (SwiftShader by default); the watchdog kills a browser that is
 * still open after `autoKillMs` (default 5 min). Other options go to
 * puppeteer.launch.
 */
export async function launchBrowser(puppeteer, { gpu, autoKillMs = 300_000, args = [], ...launchOptions } = {}) {
	const browser = await puppeteer.launch({
		executablePath: findChrome(),
		headless: true,
		pipe: true,
		acceptInsecureCerts: true,
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--disable-gpu-sandbox',
			'--window-size=1280,900',
			'--autoplay-policy=no-user-gesture-required',
			...gpuArgs(gpu),
			...args,
		],
		...launchOptions,
	})
	const watchdog = setTimeout(() => {
		console.error(`[harness] browser still open after ${autoKillMs} ms: killing it`)
		browser.process()?.kill('SIGKILL')
	}, autoKillMs)
	watchdog.unref()
	const closeBrowser = () => {
		clearTimeout(watchdog)
		browser.close().catch(() => {})
	}
	liveCloseables.add(closeBrowser)
	armSignalCleanup()
	browser.once('disconnected', () => {
		clearTimeout(watchdog)
		liveCloseables.delete(closeBrowser)
	})
	return browser
}

export async function newPage(browser) {
	const page = await browser.newPage()
	await page.setViewport({ width: 1280, height: 900 })
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

const servers = new Map()

/**
 * Serve `root` (default: demo-browser) with an in-process vite dev server on a
 * free localhost port, shared per root, and return `url` re-pointed at it.
 * The server dies with this process; `close()` stops it earlier.
 */
export async function ensureVite(url = '/', { root = DEMO_ROOT } = {}) {
	if (!servers.has(root))
		servers.set(
			root,
			createServer({
				root,
				configFile: `${root}/vite.config.ts`,
				server: { host: '127.0.0.1', port: 0 },
				clearScreen: false,
				logLevel: 'warn',
			}).then(server => server.listen()),
		)
	const server = await servers.get(root)
	const local = server.resolvedUrls?.local?.[0]
	if (!local) {
		servers.delete(root)
		await server.close().catch(() => {})
		throw new Error(`[vite] no local URL for root ${root}`)
	}
	const closeServer = () => server.close().catch(() => {})
	liveCloseables.add(closeServer)
	armSignalCleanup()
	const origin = new URL(local).origin
	const requested = new URL(url, origin)
	return {
		origin,
		url: `${origin}${requested.pathname}${requested.search}`,
		close: () => {
			liveCloseables.delete(closeServer)
			servers.delete(root)
			return server.close()
		},
	}
}

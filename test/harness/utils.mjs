import { execSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
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
const _profileDirs = new Map()
// Host-wide reaping is opt-in (VPX_HARNESS_REAP=1): parallel harness runs must not
// SIGKILL each other's chrome/vite. Default scope is tracked PIDs + own profile dirs.
const HOST_REAP = process.env.VPX_HARNESS_REAP === '1'
let _cleanupRegistered = false
const CHROME_PKILL = 'pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true'
const VITE_PKILL = 'pkill -9 -f "vite.*--port" 2>/dev/null || true'
function pkillSync(cmd) {
	try {
		execSync(cmd, { timeout: 2000, stdio: 'ignore' })
	} catch {}
}
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
function cleanChromeTmpDirs(onlyStale) {
	try {
		const tmp = '/tmp'
		for (const name of readdirSync(tmp)) {
			if (!name.startsWith('puppeteer_dev_chrome')) continue
			const full = join(tmp, name)
			try {
				if (onlyStale) {
					const st = statSync(full)
					if (Date.now() - st.mtimeMs <= 60 * 1000) continue
				}
				rmSync(full, { recursive: true, force: true })
			} catch {}
		}
	} catch {}
}
export function killStaleChromeSync() {
	if (!HOST_REAP) return
	pkillSync(CHROME_PKILL)
	cleanChromeTmpDirs(true)
}
function killStaleViteSync() {
	if (!HOST_REAP) return
	pkillSync(VITE_PKILL)
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
	try {
		killStaleChromeSync()
	} catch {}
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
		if (HOST_REAP) {
			killStaleChromeSync()
			killStaleViteSync()
			cleanChromeTmpDirs(false)
		}
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
	setInterval(() => {
		if (!HOST_REAP) return
		if (_browsers.size === 0) {
			killStaleChromeSync()
		}
		if (_vites.size === 0) {
			killStaleViteSync()
		}
	}, 30000).unref?.()
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
	try {
		killStaleChromeSync()
	} catch {}
	const { gpu, ...rest } = opts
	const gpuArgs = resolveGpuArgs(gpu)
	const chromePath = resolveChromePath()
	const browser = await puppeteer.launch({
		...(chromePath ? { executablePath: chromePath } : {}),
		headless: 'new',
		ignoreHTTPSErrors: true,
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--ignore-certificate-errors',
			'--allow-insecure-localhost',
			...gpuArgs,
			'--window-size=1280,900',
			'--disable-gpu-sandbox',
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
		if (HOST_REAP) pkillSync(CHROME_PKILL)
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
			if (HOST_REAP) {
				pkillSync(CHROME_PKILL)
				cleanChromeTmpDirs(false)
			}
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
	const prevTlsReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	try {
		if ((await fetch(url, { method })).ok) return true
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
	const candidates = [url.replace(/\?.*$/, ''), 'https://localhost:3000/', 'http://localhost:3000/']
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
	const proc = spawn('npx', ['vite', '--host', '--port', '3000', '--clearScreen', 'false'], {
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
	const viteAutoKill = setTimeout(killViteProc, 120_000)
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
	for (let i = 0; i < 30; i++) {
		await sleep(1000)
		// Vite serves https (basicSsl) in this repo; probe both schemes with
		// the same TLS-tolerant check as the pre-spawn candidates above.
		for (const u of ['https://localhost:3000/', 'http://localhost:3000/']) {
			if (await fetchOk(u, 'HEAD')) {
				console.log(`[${label}] vite ready (${u})`)
				return proc
			}
		}
	}
	throw new Error('vite not ready in 30s')
}

const oneLine = (text, len) => text.slice(0, len).replace(/\n/g, ' | ')

async function waitViewerReady(page, { timeoutMs, label, log }) {
	const rounds = Math.max(1, Math.round(timeoutMs / 1000))
	for (let round = 0; round < rounds; round++) {
		await sleep(1000)
		const state = await page.evaluate(() => ({
			title: document.getElementById('load-title')?.innerText || '',
			stats: document.getElementById('stats')?.innerText || '',
			dmdMeshes: window.viewer?.dmdMeshes?.length || 0,
			hasPlayer: !!window.viewer?.player,
			emu: window.viewer?.player?.getPhysics?.()?.emu?.constructor.name || 'none',
		}))
		const ready = state.title === 'Ready' || state.title.includes('Ready') || state.stats.includes('Ready')
		if (ready) {
			log(
				`[${label}] viewer Ready at ${round}s dmd=${state.dmdMeshes} emu=${state.emu} stats=${oneLine(state.stats, 120)}`,
			)
			return true
		}
		if (round % 5 === 0)
			log(`[${label}] ${round}s title=${state.title} dmd=${state.dmdMeshes} stats=${oneLine(state.stats, 80)}`)
	}
	return false
}

async function switchToPlayMode(page) {
	await page.evaluate(() => {
		const sel = document.getElementById('mode')
		if (sel) {
			sel.value = 'play'
			sel.dispatchEvent(new Event('change', { bubbles: true }))
		}
		if (window.viewer) window.viewer.viewerMode = 'play'
	})
}

async function waitPlayReady(page, { timeoutMs, label, log }) {
	const rounds = Math.max(1, Math.round(timeoutMs / 1000))
	for (let round = 0; round < rounds; round++) {
		await sleep(1000)
		const state = await page.evaluate(() => ({
			stats: document.getElementById('stats')?.innerText || '',
			dmdMeshes: window.viewer?.dmdMeshes?.length || 0,
			emu: (window.viewer?.player || window.player)?.getPhysics?.()?.emu?.constructor.name || 'none',
			emuInit: (window.viewer?.player || window.player)?.getPhysics?.()?.emu?.isInitialized?.(),
		}))
		if (state.stats.includes('PLAY') && state.emu !== 'none') {
			log(
				`[${label}] play Ready at ${round}s emu=${state.emu} init=${state.emuInit} dmd=${state.dmdMeshes} stats=${oneLine(state.stats, 120)}`,
			)
			return true
		}
		if (round % 5 === 0)
			log(
				`[${label}] ${round}s play waiting emu=${state.emu} dmd=${state.dmdMeshes} stats=${oneLine(state.stats, 80)}`,
			)
	}
	return false
}

// One browser session: new page, goto table URL, wait for viewer Ready, switch to play mode,
// optionally wait for play/emu readiness. Returns the page plus readiness flags.
export async function openTablePage(
	browser,
	url,
	{ readyTimeoutMs = 30000, playTimeoutMs = 20000, label = 'harness', log = console.log, onPage = null } = {},
) {
	const page = await newPage(browser)
	if (onPage) await onPage(page)
	log(`[${label}] goto ${url}`)
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
	log(`[${label}] waiting for viewer Ready (up to ${Math.round(readyTimeoutMs / 1000)}s)`)
	const viewerReady = await waitViewerReady(page, { timeoutMs: readyTimeoutMs, label, log })
	if (!viewerReady) log(`[${label}] viewer not ready, continuing anyway`)
	log(`[${label}] switching to play mode`)
	await switchToPlayMode(page)
	// Predicate poll (was: fixed sleep(2000)): proceed as soon as the viewer
	// reports play mode, wait up to 5s on slow loads, then continue anyway.
	await waitFor(() => page.evaluate(() => window.viewer?.viewerMode === 'play'), { timeoutMs: 5000 })
	let playReady = false
	if (playTimeoutMs > 0) {
		log(`[${label}] waiting for play emu (up to ${Math.round(playTimeoutMs / 1000)}s)`)
		playReady = await waitPlayReady(page, { timeoutMs: playTimeoutMs, label, log })
	}
	return { page, viewerReady, playReady }
}

// Injects a visible 128x32 amber DMD test pattern by monkey-patching the emulator's
// getDmdFrame/getDmdDimensions and forcing a viewer re-render. Returns injection info.
export async function injectDmdPattern(page) {
	return page.evaluate(() => {
		try {
			const viewer = window.viewer
			const emu = window.viewer?.player?.getPhysics?.()?.emu ?? window.player?.getPhysics?.()?.emu
			if (!viewer) return { ok: false, error: 'no viewer' }
			if (!emu) return { ok: false, error: 'no emu' }
			const width = 128
			const height = 32
			const frame = new Uint8Array(width * height)
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					let value = 0
					if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) value = 15
					else if (Math.abs(x - y * 4) < 1) value = 10
					else if (x > 20 && x < 108 && y > 8 && y < 24) {
						value = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 15 : 6
						if (y > 12 && y < 20) {
							if ((x > 30 && x < 38) || (x > 50 && x < 58) || (x > 70 && x < 78) || (x > 90 && x < 98))
								value = 15
						}
					} else if (x % 16 === 0 || y % 8 === 0) value = 2
					frame[y * width + x] = value
				}
			}
			try {
				if (emu.emulatorState?.setDmd) emu.emulatorState.setDmd(frame)
				emu.getDmdFrame = () => frame
				emu.getDmdDimensions = () => ({ x: width, y: height, isVector2: true })
			} catch (err) {
				console.log('setDmd monkey err', err.message)
			}
			try {
				viewer.dmdW = width
				viewer.dmdH = height
				viewer._dmdLastHash = -1
			} catch {}
			try {
				viewer._ensureDmdTexture?.()
				viewer._renderDmd?.()
				viewer._pollPinmame?.()
				viewer.dmd?.render?.()
			} catch (err) {
				console.log('render err', err.message)
			}
			if (viewer.dmdTexture) viewer.dmdTexture.needsUpdate = true
			let max = 0
			for (const value of frame) if (value > max) max = value
			return {
				ok: true,
				length: frame.length,
				max,
				emu: emu.constructor.name,
				dmdMeshes: viewer.dmdMeshes?.length ?? 0,
				texture: !!viewer.dmdTexture,
				canvas: !!viewer.dmdCanvas,
			}
		} catch (err) {
			return { ok: false, error: err.message }
		}
	})
}

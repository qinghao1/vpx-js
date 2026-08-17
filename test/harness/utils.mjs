import { spawn } from 'node:child_process'
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export async function loadPuppeteer() {
	for (const s of ['puppeteer-core', 'puppeteer']) {
		try {
			const m = await import(s)
			return m.default ?? m
		} catch {}
	}
	throw new Error('puppeteer-core not found')
}

const _browsers = new Set()
const _vites = new Set()
let _cleanupRegistered = false

function killStaleChromeSync() {
	try {
		const tmp = '/tmp'
		for (const name of readdirSync(tmp)) {
			if (!name.startsWith('puppeteer_dev_chrome')) continue
			const full = join(tmp, name)
			try {
				const st = statSync(full)
				if (Date.now() - st.mtimeMs > 600 * 1000) rmSync(full, { recursive: true, force: true })
			} catch {}
		}
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
	process.once('SIGINT', () => {
		_cleanup()
		process.exit(1)
	})
	process.once('SIGTERM', () => {
		_cleanup()
		process.exit(1)
	})
	process.once('SIGHUP', () => {
		_cleanup()
		process.exit(1)
	})
	process.on('uncaughtException', e => {
		console.error('[harness] uncaught', e)
		_cleanup()
		process.exit(1)
	})
	process.on('unhandledRejection', e => {
		console.error('[harness] unhandled', e)
		_cleanup()
		process.exit(1)
	})
}

if (typeof process !== 'undefined') {
	registerCleanup()
}

export async function launchBrowser(puppeteer, opts = {}) {
	registerCleanup()
	try {
		killStaleChromeSync()
	} catch {}
	const { gpu, timeout, ...rest } = opts
	const gpuArgs = gpu
		? gpu === 'gl'
			? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl']
			: ['--enable-gpu', '--use-gl=angle', '--use-angle=vulkan']
		: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
	const browser = await puppeteer.launch({
		executablePath: '/usr/bin/google-chrome',
		headless: 'new',
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--js-flags=--max-old-space-size=4096',
			...gpuArgs,
			'--window-size=1280,900',
			'--disable-gpu-sandbox',
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--disable-backgrounding-occluded-windows',
			'--disable-features=CalculateNativeWinOcclusion',
		],
		...rest,
	})
	_browsers.add(browser)
	const pid = browser.process()?.pid
	const timeoutMs = timeout ?? 300_000
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
	}, timeoutMs)
	if (autoKill.unref) autoKill.unref()
	const origClose = browser.close.bind(browser)
	browser.close = async (...a) => {
		clearTimeout(autoKill)
		try {
			_browsers.delete(browser)
		} catch {}
		try {
			return await origClose(...a)
		} finally {
			try {
				if (pid) process.kill(pid, 'SIGKILL')
			} catch {}
			try {
				browser.process()?.kill?.('SIGKILL')
			} catch {}
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
	return page
}

export function attachLogging(page, { filter = /./, prefix = '[c]' } = {}) {
	const logs = []
	page.on('console', m => {
		const t = m.text()
		logs.push(t)
		if (filter.test(t)) console.log(`${prefix} ${t.slice(0, 500)}`)
	})
	page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 1000)))
	return logs
}

export async function ensureVite(
	url,
	{ cwd = new URL('../../demo-browser', import.meta.url).pathname, label = 'vite' } = {},
) {
	registerCleanup()
	const candidates = [url.replace(/\?.*$/, ''), 'http://localhost:3000/']
	for (let attempt = 0; attempt < 3; attempt++) {
		for (const u of candidates) {
			try {
				if ((await fetch(u, { method: 'HEAD' })).ok) return null
			} catch {}
			try {
				if ((await fetch(u, { method: 'GET' })).ok) return null
			} catch {}
		}
		if (attempt < 2) {
			console.log(`[${label}] vite not ready, retry ${attempt + 1}/3…`)
			await new Promise(r => setTimeout(r, 400))
		}
	}
	console.log(`[${label}] starting vite in ${cwd}…`)
	const proc = spawn('npx', ['vite', '--port', '3000'], {
		cwd,
		stdio: 'pipe',
		shell: true,
	})
	_vites.add(proc)
	proc.stdout?.on('data', d => {
		const s = d.toString()
		if (s.includes('ready') || s.includes('Local:')) console.log(`[${label}]`, s.trim())
	})
	proc.stderr?.on('data', d => console.error(`[${label}:err]`, d.toString().trim()))
	proc.once('exit', () => _vites.delete(proc))
	for (let i = 0; i < 40; i++) {
		await new Promise(r => setTimeout(r, 250))
		try {
			if ((await fetch('http://localhost:3000/', { method: 'HEAD' })).ok) {
				console.log(`[${label}] vite ready`)
				return proc
			}
		} catch {}
	}
	throw new Error(`vite did not become ready within 10s`)
}

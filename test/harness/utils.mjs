import { execSync, spawn } from 'node:child_process'
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
		execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', { timeout: 2000, stdio: 'ignore' })
	} catch {}
	try {
		const tmp = '/tmp'
		for (const name of readdirSync(tmp)) {
			if (!name.startsWith('puppeteer_dev_chrome')) continue
			const full = join(tmp, name)
			try {
				const st = statSync(full)
				if (Date.now() - st.mtimeMs > 60 * 1000) rmSync(full, { recursive: true, force: true })
			} catch {}
		}
	} catch {}
}
function killStaleViteSync() {
	try {
		execSync('pkill -9 -f "vite.*--port" 2>/dev/null || true', { timeout: 2000, stdio: 'ignore' })
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
		try {
			execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
				timeout: 2000,
				stdio: 'ignore',
			})
		} catch {}
		try {
			execSync('pkill -9 -f "vite.*--port" 2>/dev/null || true', { timeout: 2000, stdio: 'ignore' })
		} catch {}
		try {
			const tmp = '/tmp'
			for (const name of readdirSync(tmp)) {
				if (!name.startsWith('puppeteer_dev_chrome')) continue
				const full = join(tmp, name)
				try {
					rmSync(full, { recursive: true, force: true })
				} catch {}
			}
		} catch {}
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
	setInterval(() => {
		if (_browsers.size === 0) {
			try {
				execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
					timeout: 2000,
					stdio: 'ignore',
				})
			} catch {}
			try {
				const tmp = '/tmp'
				for (const name of readdirSync(tmp)) {
					if (!name.startsWith('puppeteer_dev_chrome')) continue
					const full = join(tmp, name)
					try {
						const st = statSync(full)
						if (Date.now() - st.mtimeMs > 60 * 1000) rmSync(full, { recursive: true, force: true })
					} catch {}
				}
			} catch {}
		}
		if (_vites.size === 0) {
			try {
				execSync('pkill -9 -f "vite.*--port" 2>/dev/null || true', { timeout: 2000, stdio: 'ignore' })
			} catch {}
		}
	}, 30000).unref?.()
}
if (typeof process !== 'undefined') {
	registerCleanup()
}
export async function launchBrowser(puppeteer, opts = {}) {
	registerCleanup()
	try {
		killStaleChromeSync()
	} catch {}
	const { gpu, ...rest } = opts
	const gpuArgs = gpu
		? gpu === 'gl'
			? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl']
			: ['--enable-gpu', '--use-gl=angle', '--use-angle=vulkan']
		: [
				'--enable-unsafe-webgpu',
				'--enable-features=Vulkan',
				'--use-angle=vulkan',
				'--disable-vulkan-surface',
				'--enable-unsafe-swiftshader',
				'--use-gl=angle',
				'--use-angle=swiftshader',
			]
	const browser = await puppeteer.launch({
		executablePath: '/usr/bin/google-chrome',
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
		try {
			execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
				timeout: 2000,
				stdio: 'ignore',
			})
		} catch {}
	}, 90_000)
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
			try {
				execSync('pkill -9 -f "chrome.*headless.*puppeteer" 2>/dev/null || true', {
					timeout: 2000,
					stdio: 'ignore',
				})
			} catch {}
			try {
				const tmp = '/tmp'
				for (const name of readdirSync(tmp)) {
					if (!name.startsWith('puppeteer_dev_chrome')) continue
					const full = join(tmp, name)
					try {
						rmSync(full, { recursive: true, force: true })
					} catch {}
				}
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
	// Allow self-signed vite cert
	try {
		await page.setBypassCSP(true)
	} catch {}
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

export function isCertError(e) {
	const msg = String(e?.message || e)
	return (
		msg.includes('self-signed') || msg.includes('DEPTH_ZERO') || msg.includes('CERT') || msg.includes('certificate')
	)
}

async function fetchOk(url, method = 'HEAD') {
	try {
		if ((await fetch(url, { method })).ok) return true
	} catch (e) {
		if (isCertError(e)) return true
	}
	return false
}

export async function ensureVite(
	url,
	{ cwd = new URL('../../demo-browser', import.meta.url).pathname, label = 'vite' } = {},
) {
	registerCleanup()
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
	const candidates = [url.replace(/\?.*$/, ''), 'https://localhost:3000/', 'http://localhost:3000/']
	for (let attempt = 0; attempt < 3; attempt++) {
		for (const u of candidates) {
			if (await fetchOk(u, 'HEAD')) return null
			if (await fetchOk(u, 'GET')) return null
		}
		if (attempt < 2) {
			console.log(`[${label}] vite not ready, retry ${attempt + 1}/3…`)
			await new Promise(r => setTimeout(r, 800))
		}
	}
	console.log(`[${label}] starting vite in ${cwd}…`)
	const proc = spawn('npx', ['vite', '--host', '--port', '3000', '--clearScreen', 'false'], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	_vites.add(proc)
	proc.once('exit', () => _vites.delete(proc))
	const viteAutoKill = setTimeout(() => {
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
	}, 120_000)
	if (viteAutoKill.unref) viteAutoKill.unref()
	const origKill = proc.kill.bind(proc)
	proc.kill = (...a) => {
		clearTimeout(viteAutoKill)
		_vites.delete(proc)
		return origKill(...a)
	}
	if (typeof process !== 'undefined') {
		const _kill = () => {
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
		process.once('exit', _kill)
		process.once('SIGINT', _kill)
		process.once('SIGTERM', _kill)
		process.once('SIGHUP', _kill)
	}
	proc.stdout.on('data', d => process.stdout.write(`[${label}] ${d}`))
	proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`))
	for (let i = 0; i < 30; i++) {
		await new Promise(r => setTimeout(r, 1000))
		try {
			if ((await fetch('http://localhost:3000/', { method: 'HEAD' })).ok) {
				console.log(`[${label}] vite ready`)
				return proc
			}
		} catch {}
	}
	throw new Error('vite not ready in 30s')
}

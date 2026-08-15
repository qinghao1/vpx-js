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
		: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
	const browser = await puppeteer.launch({
		executablePath: '/usr/bin/google-chrome',
		headless: 'new',
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
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

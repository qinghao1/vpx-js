import { spawn } from 'node:child_process'

export async function loadPuppeteer() {
	for (const s of ['puppeteer-core', 'puppeteer']) {
		try {
			const m = await import(s)
			return m.default ?? m
		} catch {}
	}
	throw new Error('puppeteer-core not found')
}

export async function launchBrowser(puppeteer, opts = {}) {
	return puppeteer.launch({
		executablePath: '/usr/bin/google-chrome',
		headless: 'new',
		args: [
			'--no-sandbox',
			'--disable-dev-shm-usage',
			'--enable-unsafe-swiftshader',
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--window-size=1280,900',
			'--disable-gpu-sandbox',
		],
		...opts,
	})
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

export async function ensureVite(url, { cwd = import.meta.dirname, label = 'vite' } = {}) {
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

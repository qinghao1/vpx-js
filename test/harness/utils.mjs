import { spawn } from 'node:child_process'

export async function loadPuppeteer() {
	for (const s of ['puppeteer-core', 'puppeteer']) {
		try {
			const m = await import(s)
			return m.default ?? m
		} catch {}
	}
	throw new Error('puppeteer-core not found; run npm install -D puppeteer-core')
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
	page.on('console', (m) => {
		const t = m.text()
		logs.push(t)
		if (filter.test(t)) console.log(`${prefix} ${t.slice(0, 500)}`)
	})
	page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 1000)))
	return logs
}

export async function ensureVite(url, { cwd = import.meta.dirname, label = 'vite' } = {}) {
	try {
		if ((await fetch(url.replace(/\?.*$/, ''), { method: 'HEAD' })).ok) return null
	} catch {}
	console.log(`[${label}] starting vite in ${cwd}...`)
	const proc = spawn('npx', ['vite', '--host', '--port', '3000'], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	proc.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`))
	proc.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`))
	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 1000))
		try {
			if ((await fetch('http://localhost:3000/', { method: 'HEAD' })).ok) {
				console.log(`[${label}] vite ready`)
				return proc
			}
		} catch {}
	}
	throw new Error('vite not ready in 30s')
}

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function loadPuppeteer() {
	for (const spec of ['puppeteer-core', 'puppeteer']) {
		try {
			const m = await import(spec)
			return m.default ?? m
		} catch {}
	}
	const roots = [
		process.cwd(),
		path.join(import.meta.dirname, '../..'),
		path.join(import.meta.dirname, '../../demo-browser'),
	]
	for (const root of roots) {
		const p = path.join(root, 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')
		if (fs.existsSync(p)) return (await import(pathToFileURL(p).href)).default
	}
	throw new Error('puppeteer-core not found; run npm install -D puppeteer-core')
}

export const CHROME_ARGS = [
	'--no-sandbox',
	'--disable-dev-shm-usage',
	'--enable-unsafe-swiftshader',
	'--use-gl=angle',
	'--use-angle=swiftshader',
	'--window-size=1280,900',
	'--disable-gpu-sandbox',
]

export async function launchBrowser(puppeteer, opts = {}) {
	return puppeteer.launch({
		executablePath: '/usr/bin/google-chrome',
		headless: 'new',
		args: CHROME_ARGS,
		...opts,
	})
}

export async function newPage(browser, viewport = { width: 1280, height: 900 }) {
	const page = await browser.newPage()
	await page.setViewport(viewport)
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

export async function waitForReady(
	page,
	{ timeout = 90, interval = 1000, logFilter = (log) => log.includes('Ready') } = {},
) {
	for (let i = 0; i < timeout; i++) {
		await new Promise((r) => setTimeout(r, interval))
		const log = await page.evaluate(() => document.getElementById('log')?.innerText || '').catch(() => '')
		if (logFilter(log)) return { ready: true, log, at: i }
		if (log.includes('Failed')) return { ready: false, log, at: i }
		if (i % 5 === 0) console.log(`[wait] ${i}s log=${log.slice(0, 80).replace(/\n/g, ' | ')}`)
	}
	const log = await page.evaluate(() => document.getElementById('log')?.innerText || '').catch(() => '')
	return { ready: false, log, at: timeout }
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

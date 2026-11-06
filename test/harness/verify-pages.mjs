// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Static-hosting E2E (GitHub Pages): serves a VITE_COI_SW=1 demo bundle from a
 * plain static server — no COOP/COEP, under a /vpx-js/ subpath, like Pages —
 * and asserts the service worker makes the page cross-origin isolated and the
 * threaded engine boots a table.
 *
 * Run: node test/harness/verify-pages.mjs [--dist=demo-browser/dist]
 *   Without --dist it builds the bundle into a temp dir first.
 * Exit: 0 pass, 77 skip (no engine artifact), 1 fail.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { launchBrowser, loadPuppeteer, newPage, resolveChromePath, waitFor } from './utils.mjs'

const demo = resolve('demo-browser')
if (!existsSync(join(demo, 'public/wasm/vpinball-headless.wasm'))) {
	console.log('SKIP: no engine artifact (npm run build:wasm:headless)')
	process.exit(77)
}
try {
	await loadPuppeteer()
} catch {
	console.log('SKIP: puppeteer not installed')
	process.exit(77)
}
if (!resolveChromePath() && !process.env.CHROME_PATH) {
	console.log('SKIP: no Chrome (standard install path or CHROME_PATH)')
	process.exit(77)
}
const distArg = process.argv.find(a => a.startsWith('--dist='))?.slice(7)
const dist = distArg ? resolve(distArg) : mkdtempSync(join(tmpdir(), 'vpx-pages-'))
if (!distArg) {
	execFileSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
		cwd: demo,
		env: { ...process.env, VITE_COI_SW: '1' },
		stdio: 'inherit',
	})
}

const BASE_PATH = '/vpx-js/'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
	const file = path.startsWith(BASE_PATH) ? join(dist, path.slice(BASE_PATH.length) || 'index.html') : ''
	if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
		res.writeHead(404).end()
		return
	}
	res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
	res.end(readFileSync(file))
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://localhost:${server.address().port}${BASE_PATH}?vpx=test/fixtures/table-empty.vpx`

const checks = []
const check = (ok, name, detail = '') => {
	checks.push(ok)
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

let browser
try {
	browser = await launchBrowser(await loadPuppeteer())
} catch (error) {
	console.log(`SKIP: browser launch failed (${String(error?.message ?? error).slice(0, 200)})`)
	server.close()
	if (!distArg) rmSync(dist, { recursive: true, force: true })
	process.exit(77)
}
try {
	const page = await newPage(browser)
	const errors = []
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(url, { waitUntil: 'load' })
	// First visit registers the worker and reloads once; poll across the reload.
	const isolated = await waitFor(() => page.evaluate(() => crossOriginIsolated && !!window.vpx), { timeoutMs: 30000 })
	check(isolated, 'service worker makes the page cross-origin isolated')
	const engine = isolated
		? await page.evaluate(async () => {
				await window.vpx.whenReady(60000)
				return window.vpx.state
			})
		: null
	check(engine?.wasmReady === true, 'threaded engine boots on the static host', `catalog=${engine?.catalogSize}`)
	check(engine?.scriptErrors === 0, 'no script errors', `errors=${engine?.scriptErrors}`)
	check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
} finally {
	await browser.close().catch(() => {})
	server.close()
	if (!distArg) rmSync(dist, { recursive: true, force: true })
}
console.log(`${checks.filter(Boolean).length}/${checks.length} pages checks passed`)
process.exit(checks.every(Boolean) ? 0 : 1)

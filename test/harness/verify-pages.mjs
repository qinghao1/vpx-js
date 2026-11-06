// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Static-hosting E2E (GitHub Pages): serves a VITE_COI_SW=1 demo bundle from a
 * plain static server — no COOP/COEP, under a /vpx-js/ subpath, like Pages —
 * and asserts the service worker makes the page cross-origin isolated with one
 * reload, a second visit needs none, and the threaded engine boots a table.
 *
 * Run: node test/harness/verify-pages.mjs [--dist=demo-browser/dist]
 *   Without --dist it builds the bundle into a temp dir first.
 * Exit: 0 pass, 77 skip (no engine artifact or Chrome), 1 fail.
 */
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { build } from 'vite'
import { launchBrowser, loadPuppeteer, newPage, requireEngineAndChrome, sleep, waitFor } from './utils.mjs'

requireEngineAndChrome()

const distArg = process.argv.find(a => a.startsWith('--dist='))?.slice(7)
const dist = distArg ? resolve(distArg) : mkdtempSync(join(tmpdir(), 'vpx-pages-'))
if (!distArg) {
	process.env.VITE_COI_SW = '1'
	const demo = resolve('demo-browser')
	await build({ root: demo, configFile: join(demo, 'vite.config.ts'), build: { outDir: dist, emptyOutDir: true } })
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

// Open `url` in a new tab; `loads()` counts the main-frame navigations so far.
async function visit(browser, errors) {
	const page = await newPage(browser)
	let navigations = 0
	page.on('framenavigated', frame => {
		if (frame === page.mainFrame()) navigations++
	})
	page.on('pageerror', error => errors.push(error.message))
	await page.goto(url, { waitUntil: 'load' })
	const isolated = await waitFor(() => page.evaluate(() => crossOriginIsolated && !!window.vpx), { timeoutMs: 30000 })
	return { page, isolated, loads: () => navigations }
}

const browser = await launchBrowser(await loadPuppeteer())
try {
	const errors = []
	const first = await visit(browser, errors)
	check(first.isolated, 'service worker makes the page cross-origin isolated')
	const engine = first.isolated
		? await first.page.evaluate(async () => {
				await window.vpx.whenReady(60000)
				return window.vpx.state
			})
		: null
	check(engine?.wasmReady === true, 'threaded engine boots on the static host', `catalog=${engine?.catalogSize}`)
	check(engine?.scriptErrors === 0, 'no script errors', `errors=${engine?.scriptErrors}`)
	await sleep(2000)
	check(first.loads() === 2, 'first visit reloads exactly once', `${first.loads()} loads`)
	const second = await visit(browser, errors)
	await sleep(2000)
	check(
		second.isolated && second.loads() === 1,
		'second visit is isolated without a reload',
		`${second.loads()} loads`,
	)
	check(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '))
} finally {
	await browser.close()
	server.close()
}
console.log(`${checks.filter(Boolean).length}/${checks.length} pages checks passed`)
process.exit(checks.every(Boolean) ? 0 : 1)

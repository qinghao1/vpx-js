import { launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
import { waitReady } from './lib/helpers.mjs'
const puppeteer = await loadPuppeteer()
async function test(url, expected) {
	console.log(`[webgpu] ${url} expect=${expected}`)
	const browser = await launchBrowser(puppeteer)
	const page = await newPage(browser)
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
	const log = await waitReady(page, 25000)
	const ok = log.includes('Ready')
	console.log(`${expected} ${ok ? 'PASS' : 'FAIL'}`)
	await browser.close()
	return ok
}
await test('http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=viewer', 'webgl')
await test('http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=viewer&renderer=webgpu', 'webgpu')

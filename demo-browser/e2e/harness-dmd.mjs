import { launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
import { dmdChecks, waitReady } from './lib/helpers.mjs'
const url =
	process.argv.find(a => a.startsWith('--url='))?.slice(6) ||
	'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx'
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await waitReady(page)
const dmd = await dmdChecks(page)
console.log('[harness-dmd]', JSON.stringify(dmd, null, 2))
await browser.close()
console.log(dmd.meshes?.length ? 'PASS' : 'FAIL')

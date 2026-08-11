import { launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
import { physicsChecks, waitReady } from './lib/helpers.mjs'
const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) || 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play'
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await waitReady(page)
const phys = await physicsChecks(page)
console.log('[harness-play]', JSON.stringify(phys, null, 2))
await browser.close()
console.log(phys.flipper?.pass && phys.coin?.pass ? 'PASS' : 'FAIL')

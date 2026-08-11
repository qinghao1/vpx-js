import { launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
import { waitReady } from './lib/helpers.mjs'
const url = 'http://127.0.0.1:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play'
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await new Promise(r => setTimeout(r, 12000))
const log = await waitReady(page, 15000).catch(() => '')
console.log(log.slice(-4000))
await page.screenshot({ path: '/tmp/play_check.png' })
await browser.close()

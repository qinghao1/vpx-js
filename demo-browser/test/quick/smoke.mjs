import { launchBrowser, loadPuppeteer, newPage } from '../../../test/harness/utils.mjs'

const mode = process.argv.find(a => a.startsWith('--mode='))?.slice(7) || 'viewer'
const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) || `http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=${mode}`

const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)

console.log(`[smoke] goto ${url} mode=${mode}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

const wait = async (needle, timeout = 60000) => {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		const txt = await page.evaluate(() => document.getElementById('log')?.innerText || '').catch(() => '')
		if (txt.includes(needle)) return txt
		await new Promise(r => setTimeout(r, 500))
	}
	return ''
}

let log = await wait('Ready', 60000)
console.log(`[smoke] Ready=${log.includes('Ready')}`)
if (log.includes('streaming') || log.includes('deferred')) {
	log = await wait('Done ', 60000)
	console.log(`[smoke] Done=${log.includes('Done ')}`)
}
console.log(log.slice(-3000))
await browser.close()
console.log(`[smoke] ${log.includes('Ready') ? 'PASS' : 'FAIL'}`)

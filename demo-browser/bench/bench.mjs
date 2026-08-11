import fs from 'node:fs'
import { attachLogging, launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'

const url = process.argv[2] || 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx'
const out = process.argv[3] || '/tmp/bench.json'

const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)

await page.evaluateOnNewDocument(() => {
	window.__bench = { marks: {}, texTimes: [] }
	window.__benchMark = k => (window.__bench.marks[k] = performance.now())
})

const logs = attachLogging(page, { filter: /Parsed|Scene|Textures|Ready|Loaded/, prefix: '[c]' })
console.log(`[bench] goto ${url}`)
const t0 = Date.now()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

let ready = false
for (let i = 0; i < 90; i++) {
	await new Promise(r => setTimeout(r, 1000))
	ready = await page.evaluate(() => document.getElementById('log')?.innerText.includes('Ready') ?? false).catch(() => false)
	if (ready) break
}
if (!ready) { console.error('not Ready'); await browser.close(); process.exit(1) }

const m = await page.evaluate(() => {
	const v = window.viewer
	let tris = 0, draws = 0
	v.tableGroup.traverse(o => { if (o.isMesh && o.geometry?.attributes?.position) { tris += o.geometry.attributes.position.count/3; draws++ }})
	const mats = new Set()
	v.tableGroup.traverse(o => { if (o.isMesh && o.material) for (const mm of Array.isArray(o.material) ? o.material : [o.material]) mats.add(mm.uuid) })
	return { tris: Math.round(tris), draws, mats: mats.size, triangles: v.renderer.info.render.triangles, calls: v.renderer.info.render.calls }
})
console.log('metrics', m)

const parsed = {}
for (const l of logs) {
	const a = l.match(/Parsed in (\d+)ms/); if (a) parsed.parse = Number(a[1])
	const c = l.match(/Scene generated in (\d+)ms/); if (c) parsed.sceneGen = Number(c[1])
	const e = l.match(/Textures in scene: (\d+) ~([\d.]+) MB/); if (e) parsed.texScene = { c: Number(e[1]), mb: Number(e[2]) }
}
console.log('parsed', parsed)

await page.screenshot({ path: '/tmp/bench.png' })
await browser.close()
fs.writeFileSync(out, JSON.stringify({ parsed, m, at: new Date().toISOString() }, null, 2))
console.log(`[bench] done -> ${out}`)

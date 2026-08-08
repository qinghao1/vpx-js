import path from 'node:path'
import { ensureVite, launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

const DEFAULT_URL = 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx'

const url = process.argv.find(a => a.startsWith('--url='))?.slice('--url='.length) || DEFAULT_URL
const balls = Number(process.argv.find(a => a.startsWith('--balls='))?.slice('--balls='.length) ?? 10)
const duration = Number(process.argv.find(a => a.startsWith('--duration='))?.slice('--duration='.length) ?? 5000)

const puppeteer = await loadPuppeteer()
const vite = await ensureVite(url, { cwd: path.resolve(import.meta.dirname, '../../demo-browser'), label: 'bench' })
const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
for (let i = 0; i < 30; i++) {
	await new Promise(r => setTimeout(r, 500))
	const ready = await page
		.evaluate(() => document.getElementById('log')?.innerText.includes('Ready'))
		.catch(() => false)
	if (ready) break
}
await page.evaluate(() => {
	const sel = document.getElementById('mode')
	if (sel) {
		sel.value = 'play'
		sel.dispatchEvent(new Event('change', { bubbles: true }))
	}
	window.viewer.viewerMode = 'play'
	try {
		window.viewer.enterPlayMode()
	} catch {}
})

await new Promise(r => setTimeout(r, 1500))

if (balls > 0) {
	await page.evaluate(async n => {
		const p = window.viewer?.player
		const w = p.table?.gameData?.width ?? 1000
		const h = p.table?.gameData?.height ?? 2000
		const T = window.THREE
		const proto = T.Vector3.prototype
		if (!proto.subAndRelease)
			proto.subAndRelease = function (o) {
				this.sub(o)
				try {
					o.release?.()
				} catch {}
				return this
			}
		if (!proto.addAndRelease)
			proto.addAndRelease = function (o) {
				this.add(o)
				try {
					o.release?.()
				} catch {}
				return this
			}
		if (!proto.dotAndRelease)
			proto.dotAndRelease = function (o) {
				const d = this.dot(o)
				try {
					o.release?.()
				} catch {}
				return d
			}
		if (!proto.setAndRelease)
			proto.setAndRelease = function (o) {
				this.set(o.x, o.y, o.z)
				try {
					o.release?.()
				} catch {}
				return this
			}
		if (!proto.normalizeSafe)
			proto.normalizeSafe = function () {
				return this.lengthSq() > 0 ? this.normalize() : this
			}
		if (!proto.release) proto.release = () => {}
		for (let i = 0; i < n; i++) {
			p.createBall(
				{
					getBallCreationPosition: () =>
						new T.Vector3(w / 2 + (Math.random() - 0.5) * 60, h / 2 + (Math.random() - 0.5) * 60, 30),
					getBallCreationVelocity: () =>
						new T.Vector3((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, 50),
					onBallCreated: () => {},
				},
				25,
				1,
			)
		}
	}, balls)
}

const result = await page.evaluate(async d => {
	const viewer = window.viewer
	const start = performance.now()
	let frames = 0
	await new Promise(r => {
		const id = setInterval(() => {
			if (performance.now() - start >= d) {
				clearInterval(id)
				r(null)
			}
		}, 100)
		function raf() {
			if (performance.now() - start < d) {
				frames++
				requestAnimationFrame(raf)
			}
		}
		requestAnimationFrame(raf)
	})
	const elapsed = performance.now() - start
	return {
		frames,
		fps: Math.round((frames * 1000) / elapsed),
		elapsed: Math.round(elapsed),
		balls: viewer.player?.balls?.length ?? 0,
		tris: (() => {
			let c = 0
			viewer.tableGroup.traverse(o => {
				if (o.isMesh && o.geometry?.attributes?.position) c += o.geometry.attributes.position.count / 3
			})
			return Math.round(c)
		})(),
		draws: viewer.renderer.info.render.calls,
		heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
	}
}, duration)

console.log(JSON.stringify({ url, balls, duration, ...result, at: new Date().toISOString() }, null, 2))
await browser.close()
vite?.kill()

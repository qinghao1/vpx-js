import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

const args = process.argv.slice(2)
const getArg = (name, def) => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def
const hasFlag = name => args.includes(`--${name}`)

const DEFAULT_EMPTY = '/test/fixtures/table-empty.vpx'
const exists = p => {
	try {
		return fs.existsSync(p) && fs.statSync(p).size > 1024
	} catch {
		return false
	}
}

function resolveVpxToUrl(vpxPath) {
	const abs = path.resolve(vpxPath)
	if (!exists(abs)) throw new Error(`VPX not found: ${abs}`)
	const st = fs.statSync(abs)
	console.log(`[bench] VPX ${abs} ${(st.size / 1024 / 1024).toFixed(1)} MB`)
	const pubLink = path.resolve('demo-browser/public', path.basename(abs))
	try {
		if (exists(pubLink) && fs.realpathSync(pubLink) === fs.realpathSync(abs)) {
			return `http://localhost:3000/?vpx=/${path.basename(abs)}`
		}
	} catch {}
	if (abs.includes('/test/fixtures/')) return `http://localhost:3000/?vpx=${abs.slice(path.resolve('.').length)}`
	return `http://localhost:3000/?vpx=/@fs${abs}`
}

const home = process.env.HOME ?? '/home/qinghao1'
const candidates = [
	path.resolve('walking_dead.vpx'),
	path.join(home, 'Downloads/walking_dead.vpx'),
	path.resolve('test/fixtures/table-empty.vpx'),
]

let url = getArg('url', null)
const vpxArg = getArg('vpx', null)
if (!url) {
	if (vpxArg) url = resolveVpxToUrl(vpxArg)
	else {
		const found = candidates.find(exists)
		url = found ? resolveVpxToUrl(found) : `http://localhost:3000/?vpx=${DEFAULT_EMPTY}`
		if (found) console.log(`[bench] auto-detected ${found}`)
	}
}

const balls = Number(getArg('balls', url.includes('walking_dead') ? '0' : '10'))
const duration = Number(getArg('duration', '5000'))
const warmup = Number(getArg('warmup', url.includes('walking_dead') ? '2000' : '800'))
const outPath = getArg('out', null)
const profile = hasFlag('profile') || hasFlag('breakdown')
const headed = hasFlag('headed')
const gpu = getArg('gpu', hasFlag('gpu') ? 'vulkan' : null)

console.log(
	`[bench] url=${url} balls=${balls} duration=${duration} warmup=${warmup} profile=${profile} gpu=${gpu ?? false} headed=${headed}`,
)

const puppeteer = await loadPuppeteer()
const vite = await ensureVite(url, {
	cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo-browser'),
	label: 'bench',
})
const browser = await launchBrowser(puppeteer, { ...(headed ? { headless: false } : {}), ...(gpu ? { gpu } : {}) })
const page = await newPage(browser)
page.setDefaultTimeout(120000)

const logs = attachLogging(page, {
	filter: /Parsed|Scene|Textures|Ready|Loaded|physics|VPX|GameName|FPS|stream|Visuals/,
	prefix: '[c]',
})

console.log(`[bench] goto ${url}`)
const tNavStart = performance.now()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })

let readyMs = null
for (let i = 0; i < 90; i++) {
	await new Promise(r => setTimeout(r, 1000))
	const ready = await page.evaluate(() => document.getElementById('log')?.innerText.includes('Ready') ?? false)
	if (ready) {
		readyMs = Math.round(performance.now() - tNavStart)
		console.log(`[bench] Ready after ${readyMs}ms`)
		break
	}
	if (i % 5 === 0) console.log(`[bench] waiting ${i}s…`)
}
if (readyMs == null) {
	console.error('[bench] not Ready within 90s')
	await page.screenshot({ path: '/tmp/bench-not-ready.png' }).catch(() => {})
	await browser.close()
	vite?.kill()
	process.exit(1)
}

function collectMetrics() {
	const v = window.viewer
	let tris = 0
	let meshes = 0
	try {
		v.tableGroup.traverse(o => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				meshes++
			}
		})
	} catch {}
	const info = v.renderer?.info?.render ?? {}
	return {
		tris: Math.round(tris),
		meshes,
		calls: info.calls ?? 0,
		triangles: info.triangles ?? 0,
		balls: v.player?.balls?.length ?? 0,
	}
}

const preMetrics = await page.evaluate(collectMetrics)
console.log('[bench] pre-metrics', preMetrics)

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

let playReady = false
for (let i = 0; i < 30; i++) {
	await new Promise(r => setTimeout(r, 1000))
	const s = await page.evaluate(() => ({
		hasPlayer: !!window.viewer?.player,
		stats: document.getElementById('stats')?.innerText ?? '',
	}))
	if (s.hasPlayer && s.stats.includes('PLAY')) {
		playReady = true
		console.log(`[bench] PLAY ready after ${(i + 1) * 1000}ms`)
		break
	}
	if (i % 3 === 0) console.log(`[bench] waiting PLAY ${i}s hasPlayer=${s.hasPlayer}`)
}
if (!playReady) console.log('[bench] PLAY not confirmed, continuing')

await new Promise(r => setTimeout(r, warmup))

const glInfo = await page.evaluate(() => {
	try {
		const c = document.createElement('canvas')
		const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')
		if (!gl) return { error: 'no gl' }
		const dbg = gl.getExtension('WEBGL_debug_renderer_info')
		return {
			vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : '?',
			renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '?',
			version: gl.getParameter(gl.VERSION),
		}
	} catch (e) {
		return { error: e.message }
	}
})
console.log('[bench] GL', glInfo)
if (gpu && glInfo.renderer?.includes('SwiftShader')) console.warn('[bench] warning: requested gpu but got SwiftShader')
if (!gpu && glInfo.renderer?.includes('Vulkan') && !glInfo.renderer?.includes('SwiftShader')) {
	console.warn('[bench] warning: got Vulkan without --gpu flag')
}

if (url.includes('walking_dead')) {
	console.log('[bench] waiting for streaming textures…')
	let done = false
	for (let i = 0; i < 60; i++) {
		const txt = await page.evaluate(() => document.getElementById('log')?.innerText ?? '')
		if (txt.includes('[stream] Done') || txt.includes('Visuals ready')) {
			console.log(`[bench] stream done after ${i}s`)
			done = true
			break
		}
		if (i % 5 === 0) console.log(`[bench] streaming wait ${i}s`)
		await new Promise(r => setTimeout(r, 1000))
	}
	if (!done) console.log('[bench] stream not done after 60s')
	await new Promise(r => setTimeout(r, 500))
}

console.log('[bench] waiting for PinMAME…')
for (let i = 0; i < 20; i++) {
	const s = await page.evaluate(() => {
		try {
			const emu = window.viewer?.player?.getPhysics?.()?.emu
			if (!emu) return { hasEmu: false, running: false }
			return { hasEmu: true, running: emu.isMock ? true : emu.api?.isRunning?.() === 1, mock: !!emu.isMock }
		} catch {
			return { hasEmu: false, running: false }
		}
	})
	if (!s.hasEmu || s.running) {
		console.log(
			`[bench] PinMAME ${s.hasEmu ? (s.mock ? 'mock' : s.running ? 'running' : 'loading') : 'none'} after ${i}s`,
		)
		break
	}
	if (i % 5 === 0) console.log(`[bench] PinMAME wait ${i}s`)
	await new Promise(r => setTimeout(r, 1000))
}

const isolation = await page.evaluate(() => ({
	hasSAB: typeof SharedArrayBuffer !== 'undefined',
	isolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
	waitAsync: typeof Atomics !== 'undefined' && typeof Atomics.waitAsync === 'function',
	threaded: !!globalThis.viewer?._physicsWorker || !!globalThis.viewer?._physicsSab,
}))
console.log('[bench] isolation', isolation)
if (!isolation.hasSAB || !isolation.isolated)
	console.warn('[bench] fallback: SAB unavailable or not isolated — threaded disabled')
else if (!isolation.waitAsync) console.warn('[bench] fallback: Atomics.waitAsync unavailable')
else console.log('[bench] threaded capable')
await page.evaluate(() => window.viewer?.renderer?.render?.(window.viewer.scene, window.viewer.camera))
const postPlayMetrics = await page.evaluate(collectMetrics)
console.log('[bench] post-play metrics', postPlayMetrics)

if (balls > 0) {
	await page.evaluate(async n => {
		const p = window.viewer?.player
		if (!p) return
		const w = p.table?.data?.width ?? 1000
		const h = p.table?.data?.height ?? 2000
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
		if (!proto.setZero)
			proto.setZero = function () {
				return this.set(0, 0, 0)
			}
		if (!proto.release) proto.release = () => {}
		if (!proto.applyMatrix2D)
			proto.applyMatrix2D = function (m) {
				const e = m.elements
				return this.set(
					e[0] * this.x + e[3] * this.y + e[6] * this.z,
					e[1] * this.x + e[4] * this.y + e[7] * this.z,
					e[2] * this.x + e[5] * this.y + e[8] * this.z,
				)
			}
		if (!proto.cloneAndRelease)
			proto.cloneAndRelease = function () {
				return this.clone()
			}
		for (let i = 0; i < n; i++) {
			p.createBall(
				{
					getBallCreationPosition: () =>
						(() => {
							try {
								const k = Object.values(p.table?.kickers ?? {})[0]
								const d = k?.data
								if (d) {
									const x = d.center?.x ?? d.position?.x ?? d.vCenter?.x
									const y = d.center?.y ?? d.position?.y ?? d.vCenter?.y
									if (Number.isFinite(x) && Number.isFinite(y)) return new T.Vector3(x, y, 45)
								}
							} catch {}
							return new T.Vector3(w * 0.5 + (Math.random() - 0.5) * 40, h * 0.85, 30)
						})(),
					getBallCreationVelocity: () =>
						new T.Vector3((Math.random() - 0.5) * 80, -480 - Math.random() * 120, 40),
					onBallCreated: () => {},
				},
				25,
				1,
			)
		}
	}, balls)
	await new Promise(r => setTimeout(r, 500))
}

const result = await page.evaluate(
	async (d, doProfile) => {
		const viewer = window.viewer
		const player = viewer.player
		const renderer = viewer.renderer
		const physicsMs = []
		const animMs = []
		const renderMs = []
		const frameMs = []
		let renders = 0
		const start = performance.now()
		let last = start
		let startFrame = 0
		try {
			startFrame = renderer.info?.render?.frame ?? 0
		} catch {}

		let origPhys
		let origAnim
		if (doProfile && player) {
			try {
				origPhys = player.updatePhysics.bind(player)
				origAnim = player.updateAnimations.bind(player)
				player.updatePhysics = (...a) => {
					const t = performance.now()
					const r = origPhys(...a)
					physicsMs.push(performance.now() - t)
					return r
				}
				player.updateAnimations = (...a) => {
					const t = performance.now()
					const r = origAnim(...a)
					animMs.push(performance.now() - t)
					return r
				}
			} catch {}
		}
		if (renderer) {
			try {
				const origRender = renderer.render.bind(renderer)
				renderer.render = (...a) => {
					renders++
					const t = performance.now()
					const r = origRender(...a)
					if (doProfile) renderMs.push(performance.now() - t)
					return r
				}
			} catch {}
		}

		await new Promise(r => {
			const id = setInterval(() => {
				if (performance.now() - start >= d) {
					clearInterval(id)
					r(null)
				}
			}, 50)
			function raf() {
				const now = performance.now()
				if (now - start < d) {
					frameMs.push(now - last)
					last = now
					requestAnimationFrame(raf)
				}
			}
			requestAnimationFrame(raf)
		})
		const elapsed = performance.now() - start
		frameMs.shift()

		function stats(arr) {
			if (!arr.length) return null
			const s = [...arr].sort((a, b) => a - b)
			const avg = s.reduce((a, b) => a + b, 0) / s.length
			return {
				avg: +avg.toFixed(2),
				p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
				p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
				p99: +s[Math.floor(s.length * 0.99)].toFixed(2),
				min: +Math.min(...arr).toFixed(2),
				max: +Math.max(...arr).toFixed(2),
				count: arr.length,
			}
		}

		let tris = 0
		try {
			viewer.tableGroup.traverse(o => {
				if (o.isMesh && o.geometry?.attributes?.position) tris += o.geometry.attributes.position.count / 3
			})
		} catch {}
		const draws = renderer.info.render.calls
		let endFrame = 0
		try {
			endFrame = renderer.info?.render?.frame ?? 0
		} catch {}
		const frameDelta = endFrame - startFrame
		if (!renders && frameDelta) renders = frameDelta
		const fpsByRender = renders ? Math.round((renders * 1000) / elapsed) : null
		const fpsByRaf = frameMs.length ? Math.round((frameMs.length * 1000) / elapsed) : null
		return {
			frames: renders,
			rafFrames: frameMs.length,
			fps: fpsByRender ?? fpsByRaf,
			fpsRender: fpsByRender,
			fpsRaf: fpsByRaf,
			elapsed: Math.round(elapsed),
			frameStats: stats(frameMs),
			physicsStats: stats(physicsMs),
			animStats: stats(animMs),
			renderStats: stats(renderMs),
			draws,
			tris: Math.round(tris),
			balls: player?.balls?.length ?? 0,
			heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
		}
	},
	duration,
	profile,
)

const parsed = {}
for (const l of logs) {
	const a = l.match(/Parsed in (\d+)ms/)
	if (a) parsed.parseMs = Number(a[1])
	const c = l.match(/Scene generated in (\d+)ms/)
	if (c) parsed.sceneGenMs = Number(c[1])
	const e = l.match(/Textures in scene:\s*(\d+)\s*~([\d.]+)\s*MB/)
	if (e) parsed.texScene = { count: Number(e[1]), mb: Number(e[2]) }
}

const payload = {
	url,
	vpx: vpxArg ?? candidates.find(exists) ?? DEFAULT_EMPTY,
	balls,
	duration,
	warmup,
	readyMs,
	glInfo,
	preMetrics,
	postPlayMetrics,
	result,
	parsed,
	at: new Date().toISOString(),
}

if (outPath) {
	fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
	console.log(`[bench] wrote ${outPath}`)
}
console.log(JSON.stringify(payload, null, 2))

await browser.close()
vite?.kill()

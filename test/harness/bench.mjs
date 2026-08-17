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

const home = process.env.HOME ?? '/home/qinghao1'
const vpxCandidates = [
	path.join(home, 'Downloads/walking_dead.vpx'),
	path.resolve('walking_dead.vpx'),
	path.resolve('test/fixtures/table-empty.vpx'),
]
const romCandidates = [
	path.join(home, '.pinmame/roms/twd_160h.zip'),
	path.join(home, 'Downloads/twd_160h.zip'),
	path.resolve('twd_160h.zip'),
]

function resolvePathToParam(filePath) {
	const abs = path.resolve(filePath)
	if (!exists(abs)) return null
	const pubLink = path.resolve('demo-browser/public', path.basename(abs))
	try {
		if (exists(pubLink) && fs.realpathSync(pubLink) === fs.realpathSync(abs)) {
			return `/${path.basename(abs)}`
		}
	} catch {}
	if (abs.includes('/test/fixtures/')) return abs.slice(path.resolve('.').length)
	return `/@fs${abs}`
}

function resolveUrl(vpxPath, romPath) {
	const vpxParam = resolvePathToParam(vpxPath)
	if (!vpxParam) throw new Error(`VPX not found: ${vpxPath}`)
	const abs = path.resolve(vpxPath)
	const st = fs.statSync(abs)
	console.log(`[bench] VPX ${abs} ${(st.size / 1024 / 1024).toFixed(1)} MB`)
	let u = `http://localhost:3000/?vpx=${vpxParam}`
	if (romPath) {
		const romParam = resolvePathToParam(romPath)
		if (romParam) {
			console.log(`[bench] ROM ${romPath}`)
			u += `&rom=${romParam}`
		}
	}
	return `${u}&mode=play`
}

let url = getArg('url', null)
const vpxArg = getArg('vpx', null)
const romArg = getArg('rom', null)
if (!url) {
	const vpxPath = vpxArg ?? vpxCandidates.find(exists) ?? DEFAULT_EMPTY
	const romPath = romArg ?? (vpxPath.includes('walking_dead') ? romCandidates.find(exists) : null)
	url = resolveUrl(vpxPath, romPath)
	if (!vpxArg && vpxCandidates.find(exists)) console.log(`[bench] auto-detected table: ${vpxPath}`)
}

const balls = Number(getArg('balls', '-1'))
const duration = Number(getArg('duration', '3000'))
const warmup = Number(getArg('warmup', url.includes('walking_dead') ? '2000' : '800'))
const outPath = getArg('out', null)
const profile = hasFlag('profile') || hasFlag('breakdown') || !hasFlag('no-profile')
const interactive = !hasFlag('no-interact') && !hasFlag('passive')
const headed = hasFlag('headed')
const gpu = getArg('gpu', hasFlag('gpu') ? 'vulkan' : null)

console.log(
	`[bench] url=${url} balls=${balls} duration=${duration} warmup=${warmup} interactive=${interactive} profile=${profile} gpu=${gpu ?? false} headed=${headed}`,
)

const puppeteer = await loadPuppeteer()
const vite = await ensureVite(url, {
	cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo-browser'),
	label: 'bench',
})
const browser = await launchBrowser(puppeteer, {
	...(headed ? { headless: false } : {}),
	...(gpu ? { gpu } : {}),
	timeout: 300_000,
})
const page = await newPage(browser)
page.setDefaultTimeout(180000)

const logs = attachLogging(page, {
	filter: /./,
	prefix: '[c]',
})

// === 1. LOAD JOURNEY ===
console.log(`[bench] === 1. LOAD JOURNEY ===`)
const tNavStart = performance.now()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
const navMs = Math.round(performance.now() - tNavStart)

let readyMs = null
for (let i = 0; i < 90; i++) {
	await new Promise(r => setTimeout(r, 1000))
	const s = await page.evaluate(() => {
		const txt = document.getElementById('log')?.innerText ?? ''
		const v = window.viewer
		const hasPlayer = !!v?.player
		const isReady =
			txt.includes('Ready') ||
			txt.includes('Player init OK') ||
			txt.includes('PLAY: Enter=plunger') ||
			txt.includes('VIEWER: drag to orbit') ||
			hasPlayer
		const lastLines = txt.split('\n').filter(Boolean).slice(-2).join(' | ')
		return { isReady, hasPlayer, lastLines }
	})
	if (s.isReady && s.hasPlayer) {
		readyMs = Math.round(performance.now() - tNavStart)
		console.log(`[bench] Ready after ${readyMs}ms (nav: ${navMs}ms)`)
		break
	}
	if (i % 5 === 0) console.log(`[bench] waiting ready ${i}s… [${s.lastLines}]`)
}
if (readyMs == null) {
	console.error('[bench] not Ready within 90s')
	await browser.close()
	vite?.kill()
	process.exit(1)
}

// Await background texture streaming / pre-loading if present
let streamMs = 0
for (let i = 0; i < 60; i++) {
	const status = await page.evaluate(() => {
		const txt = document.getElementById('log')?.innerText ?? ''
		const isStreaming = txt.includes('Streaming') || txt.includes('Enhancing visuals')
		const isDone = txt.includes('[stream] Done') || txt.includes('Visuals ready')
		return { isStreaming, isDone }
	})
	if (status.isDone) {
		streamMs = (i + 1) * 500
		console.log(`[bench] texture streaming complete (${streamMs}ms)`)
		break
	}
	if (!status.isStreaming && i > 3) break
	await new Promise(r => setTimeout(r, 500))
}

// Collect complete table & WebGL state
const loadState = await page.evaluate(() => {
	const v = window.viewer
	if (!v) return null
	let tris = 0
	let meshes = 0
	try {
		v.tableGroup?.traverse(o => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				meshes++
			}
		})
	} catch {}
	const info = v.renderer?.info?.render ?? {}
	const emu = v.player?.getPhysics()?.emu

	let glVendor = '?'
	let glRenderer = '?'
	let glVersion = '?'
	try {
		const gl = v.renderer?.getContext()
		if (gl) {
			glVendor = gl.getParameter(gl.VENDOR) ?? '?'
			glRenderer = gl.getParameter(gl.RENDERER) ?? '?'
			glVersion = gl.getParameter(gl.VERSION) ?? '?'
		}
	} catch {}

	return {
		tris: Math.round(tris),
		meshes,
		draws: info.calls ?? 0,
		balls: v.player?.balls?.length ?? 0,
		hasEmu: !!emu,
		emuRunning: emu ? (emu.isMock ? true : emu.api?.isRunning?.() === 1) : false,
		emuMock: !!emu?.isMock,
		gameName: v.table?.data?.gameName ?? v.table?.info?.TableName ?? null,
		gl: { vendor: glVendor, renderer: glRenderer, version: glVersion },
		isolation: {
			hasSAB: typeof SharedArrayBuffer !== 'undefined',
			isolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
			waitAsync: typeof Atomics !== 'undefined' && typeof Atomics.waitAsync === 'function',
			threaded: !!v._physicsWorker || !!v._physicsSab,
		},
	}
})

const totalLoadMs = Math.round(performance.now() - tNavStart)
console.log(`[bench] === Total Load Journey: ${totalLoadMs}ms ===\n`)

// === 2. PLAY JOURNEY (User Simulation & Active Performance) ===
console.log(`[bench] === 2. PLAY JOURNEY (User Simulation) ===`)

const journeyResult = await page.evaluate(
	async opt => {
		const v = window.viewer
		const p = v?.player
		const r = v?.renderer
		const play = {
			coin: { pass: false, responseMs: 0 },
			start: { pass: false, responseMs: 0 },
			plunge: { pass: false, responseMs: 0 },
			flippers: { flipsCount: 0, leftAngleDelta: 0, rightAngleDelta: 0 },
			nudge: { pass: false, mag: 0 },
			ballsInPlay: 0,
		}

		if (opt.interactive && p) {
			// Step 1: Insert Coin (Key 5)
			const t0 = performance.now()
			p.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() })
			await new Promise(res => setTimeout(res, 180))
			p.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() })
			play.coin = { pass: true, responseMs: Math.round(performance.now() - t0) }

			// Step 2: Press Start (Key 1)
			const t1 = performance.now()
			p.onKeyDown({ code: 'Digit1', key: '1', ts: Date.now() })
			await new Promise(res => setTimeout(res, 180))
			p.onKeyUp({ code: 'Digit1', key: '1', ts: Date.now() })
			play.start = { pass: true, responseMs: Math.round(performance.now() - t1) }

			// Step 3: Plunge ball (Key Enter)
			await new Promise(res => setTimeout(res, 400))
			const t2 = performance.now()
			p.onKeyDown({ code: 'Enter', key: 'Enter', ts: Date.now() })
			await new Promise(res => setTimeout(res, 500))
			p.onKeyUp({ code: 'Enter', key: 'Enter', ts: Date.now() })
			play.plunge = { pass: true, responseMs: Math.round(performance.now() - t2) }

			// Step 4: Ensure ball in play if needed
			const ballCount = p.balls?.length ?? 0
			if ((opt.balls > 0 || ballCount === 0) && opt.balls !== 0) {
				const count = opt.balls > 0 ? opt.balls : 1
				const kicker = Object.values(v.table?.kickers ?? {})[0]
				if (kicker?.getApi?.()?.CreateBall) {
					for (let i = 0; i < count; i++) kicker.getApi().CreateBall()
				} else if (kicker?.createBall) {
					for (let i = 0; i < count; i++) kicker.createBall()
				}
			}

			// Step 5: Test flippers & nudge
			const lf = v.table?.flippers?.LeftFlipper || Object.values(v.table?.flippers ?? {})[0]
			const rf = v.table?.flippers?.RightFlipper || Object.values(v.table?.flippers ?? {})[1]
			if (lf) {
				const b = lf.getState().angle
				p.onKeyDown({ code: 'ShiftLeft', key: 'Shift', ts: Date.now(), location: 1 })
				await new Promise(res => setTimeout(res, 150))
				play.flippers.leftAngleDelta = +Math.abs(lf.getState().angle - b).toFixed(3)
				p.onKeyUp({ code: 'ShiftLeft', key: 'Shift', ts: Date.now(), location: 1 })
			}
			if (rf) {
				const b = rf.getState().angle
				p.onKeyDown({ code: 'ShiftRight', key: 'Shift', ts: Date.now(), location: 2 })
				await new Promise(res => setTimeout(res, 150))
				play.flippers.rightAngleDelta = +Math.abs(rf.getState().angle - b).toFixed(3)
				p.onKeyUp({ code: 'ShiftRight', key: 'Shift', ts: Date.now(), location: 2 })
			}
			try {
				p.nudge(75, 2.5)
				const acc = p.getPhysics()?.getCabinetAcceleration?.() ?? { x: 0, y: 0 }
				play.nudge = { pass: true, mag: +Math.hypot(acc.x, acc.y).toFixed(3) }
			} catch {
				play.nudge = { pass: false, mag: 0 }
			}
		}

		await new Promise(res => setTimeout(res, opt.warmup))

		// === 3. ACTIVE PROFILING LOOP ===
		const physicsMs = []
		const animMs = []
		const renderMs = []
		const frameMs = []
		let renders = 0
		let flipsCount = 0
		const start = performance.now()
		let last = start
		let startFrame = 0
		try {
			startFrame = r?.info?.render?.frame ?? 0
		} catch {}

		if (opt.profile && p) {
			const origPhys = p.updatePhysics.bind(p)
			const origAnim = p.updateAnimations.bind(p)
			p.updatePhysics = (...a) => {
				const t = performance.now()
				const res = origPhys(...a)
				physicsMs.push(performance.now() - t)
				return res
			}
			p.updateAnimations = (...a) => {
				const t = performance.now()
				const res = origAnim(...a)
				animMs.push(performance.now() - t)
				return res
			}
		}

		const targetRenderer = v?.composer ?? r
		if (targetRenderer) {
			const origRender = targetRenderer.render.bind(targetRenderer)
			targetRenderer.render = (...a) => {
				renders++
				const t = performance.now()
				const res = origRender(...a)
				if (opt.profile) renderMs.push(performance.now() - t)
				return res
			}
		}

		let actorTimer = null
		if (opt.interactive && p) {
			let cycle = 0
			actorTimer = setInterval(() => {
				const now = Date.now()
				cycle++
				const code = cycle % 2 === 1 ? 'ShiftLeft' : 'ShiftRight'
				const loc = cycle % 2 === 1 ? 1 : 2
				p.onKeyDown({ code, key: 'Shift', ts: now, location: loc })
				setTimeout(() => p.onKeyUp({ code, key: 'Shift', ts: Date.now(), location: loc }), 160)
				flipsCount++
				if (cycle % 4 === 0) {
					try {
						p.nudge(45, 1.8)
					} catch {}
				}
			}, 500)
		}

		await new Promise(resolve => {
			const id = setInterval(() => {
				if (performance.now() - start >= opt.duration) {
					clearInterval(id)
					if (actorTimer) clearInterval(actorTimer)
					resolve(null)
				}
			}, 30)
			function raf() {
				const now = performance.now()
				if (now - start < opt.duration) {
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
			return {
				avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
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
			v?.tableGroup?.traverse(o => {
				if (o.isMesh && o.geometry?.attributes?.position) tris += o.geometry.attributes.position.count / 3
			})
		} catch {}
		const endFrame = r?.info?.render?.frame ?? 0
		const delta = endFrame - startFrame
		if (!renders && delta) renders = delta
		const fpsRender = renders ? Math.round((renders * 1000) / elapsed) : null
		const fpsRaf = frameMs.length ? Math.round((frameMs.length * 1000) / elapsed) : null

		play.flippers.flipsCount = flipsCount
		play.ballsInPlay = p?.balls?.length ?? 0

		return {
			play,
			performance: {
				durationMs: Math.round(elapsed),
				fps: fpsRender ?? fpsRaf,
				fpsRender,
				fpsRaf,
				draws: r?.info?.render?.calls ?? 0,
				tris: Math.round(tris),
				jankFrames: frameMs.filter(f => f > 33.3).length,
				heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
				frameStats: stats(frameMs),
				physicsStats: stats(physicsMs),
				animStats: stats(animMs),
				renderStats: stats(renderMs),
			},
		}
	},
	{ duration, warmup, balls, interactive, profile },
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
	vpx: vpxArg ?? vpxCandidates.find(exists) ?? DEFAULT_EMPTY,
	rom: romArg ?? (url.includes('rom=') ? decodeURIComponent(url.match(/rom=([^&]+)/)?.[1] ?? '') : null),
	loadJourney: {
		navMs,
		readyMs,
		parseMs: parsed.parseMs ?? null,
		sceneGenMs: parsed.sceneGenMs ?? null,
		streamMs,
		totalLoadMs,
		textures: parsed.texScene ?? null,
		emu: {
			hasEmu: loadState?.hasEmu ?? false,
			running: loadState?.emuRunning ?? false,
			mock: loadState?.emuMock ?? false,
			gameName: loadState?.gameName ?? null,
		},
		isolation: loadState?.isolation ?? null,
	},
	playJourney: journeyResult.play,
	performance: journeyResult.performance,
	glInfo: loadState?.gl ?? null,
	metrics: {
		tris: loadState?.tris ?? 0,
		meshes: loadState?.meshes ?? 0,
		draws: loadState?.draws ?? 0,
	},
	at: new Date().toISOString(),
}

if (outPath) {
	fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
	console.log(`[bench] wrote ${outPath}`)
}
console.log(`\n[bench] === BENCHMARK REPORT ===`)
console.log(JSON.stringify(payload, null, 2))

await browser.close()
vite?.kill()
process.exit(0)

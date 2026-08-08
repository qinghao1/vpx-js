import fs from 'node:fs'
import path from 'node:path'
import { ensureVite, launchBrowser, loadPuppeteer, newPage } from '../test/harness/utils.mjs'

const DEFAULT_URL = 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx'
const DEFAULT_OUT = '/tmp/profile.json'
const DEFAULT_DURATION = 5000

const puppeteer = await loadPuppeteer()

const url =
	process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ||
	process.argv.find((a) => a.startsWith('http')) ||
	DEFAULT_URL
const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] || DEFAULT_OUT
const duration = Number(process.argv.find((a) => a.startsWith('--duration='))?.split('=')[1] || DEFAULT_DURATION)

const viteProc = await ensureVite(url, { cwd: import.meta.dirname, label: 'profile' })

const browser = await launchBrowser(puppeteer)
const page = await newPage(browser)

await page.evaluateOnNewDocument(() => {
	window.__profile = { marks: {}, measures: [] }
	const obs = new PerformanceObserver((list) => {
		for (const e of list.getEntries())
			window.__profile.measures.push({
				name: e.name,
				entryType: e.entryType,
				start: e.startTime,
				duration: e.duration,
				detail: e.detail,
			})
	})
	try {
		obs.observe({ entryTypes: ['mark', 'measure', 'longtask', 'paint', 'navigation'] })
	} catch {}
	performance.mark('nav-start')
	window.__mark = (k) => performance.mark(k)
	window.__measure = (a, b, n) => {
		try {
			performance.measure(n || `${a}->${b}`, a, b)
		} catch {}
	}
})

const logs = []
page.on('console', (m) => {
	const t = m.text()
	logs.push(t)
	if (/Parsed|Scene generated|Textures|Ready|Failed|PLAY|physics|Player init|PinMAME|Error/.test(t))
		console.log(`[c] ${t.slice(0, 300)}`)
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 1000)))

const outPath = out.endsWith('.json') ? out : path.join(out, 'profile.json')
const tracePath = path.join(path.dirname(outPath), 'trace.json')
let tracing = false
try {
	await page.tracing.start({
		path: tracePath,
		screenshots: false,
		categories: ['devtools.timeline', 'v8.execute', 'blink.user_timing', 'disabled-by-default-devtools.timeline.frame'],
	})
	tracing = true
	console.log('[profile] tracing started', tracePath)
} catch (e) {
	console.log('[profile] tracing not available', e.message)
}

try {
	await page.coverage.startJSCoverage({ resetOnNavigation: false })
} catch {}

const tNav0 = performance.now()
console.log(`[profile] goto ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.evaluate(() => {
	performance.mark('domcontentloaded')
	try {
		performance.measure('nav->dom', 'nav-start', 'domcontentloaded')
	} catch {}
})
const tDom = performance.now()

try {
	await page.evaluate(() => {
		performance.mark('force-play-start')
		const sel = document.getElementById('mode')
		if (sel) {
			sel.value = 'play'
			sel.dispatchEvent(new Event('change', { bubbles: true }))
		}
		if (window.viewer) {
			window.viewer.viewerMode = 'play'
			try {
				window.viewer.enterPlayMode()
			} catch {}
		}
		performance.mark('force-play-end')
		try {
			performance.measure('force-play', 'force-play-start', 'force-play-end')
		} catch {}
	})
} catch {}

let ready = false,
	lastLog = '',
	elapsedReady = 0
for (let i = 0; i < 90; i++) {
	await new Promise((r) => setTimeout(r, 1000))
	const s = await page
		.evaluate(() => {
			const log = document.getElementById('log')?.innerText || ''
			return { log, hasPlayer: !!window.viewer?.player, viewerMode: window.viewer?.viewerMode || '' }
		})
		.catch(() => ({ log: '', hasPlayer: false }))
	if (s.log.includes('Ready')) {
		ready = true
		lastLog = s.log
		elapsedReady = performance.now() - tNav0
		await page.evaluate(() => {
			performance.mark('ready')
			try {
				performance.measure('nav->ready', 'nav-start', 'ready')
			} catch {}
		})
		break
	}
	if (s.log.includes('Failed')) {
		lastLog = s.log
		break
	}
	lastLog = s.log
	if (i % 5 === 0) console.log(`[profile] wait ${i}s hasPlayer=${s.hasPlayer} mode=${s.viewerMode}`)
}
if (!ready) {
	console.log(lastLog.slice(-6000))
	if (tracing)
		try {
			await page.tracing.stop()
		} catch {}
	await browser.close()
	if (viteProc) viteProc.kill()
	process.exit(1)
}
console.log(`[profile] Ready in ${elapsedReady.toFixed(0)}ms (dom ${(tDom - tNav0).toFixed(0)}ms)`)

const parsedTimes = (() => {
	const txt = logs.join('\n')
	const m = {}
	let a = txt.match(/Parsed in (\d+)ms/)
	if (a) m.parseMs = Number(a[1])
	let b = txt.match(/Scene generated in (\d+)ms/)
	if (b) m.sceneGenMs = Number(b[1])
	let c = txt.match(/High-prio textures ready in (\d+)ms/)
	if (c) m.highTexMs = Number(c[1])
	let d = txt.match(/Fetched .* in ([\d.]+)s/)
	if (d) m.fetchS = Number(d[1])
	let e = txt.match(/Loaded \d+\/\d+ textures in (\d+)ms/)
	if (e) m.texLoadMs = Number(e[1])
	let f = txt.match(/Textures in scene: (\d+) ~([\d.]+) MB/)
	if (f) m.texScene = { count: Number(f[1]), mb: Number(f[2]) }
	return m
})()

let playSwitchMs = 0
const beforePlay = performance.now()
const playState = await page.evaluate(
	() =>
		`mode=${document.getElementById('mode')?.value} viewerMode=${window.viewer?.viewerMode} hasPlayer=${!!window.viewer?.player}`,
)
console.log('[profile] before play switch', playState)
if (!playState.includes('viewerMode=play') || playState.includes('hasPlayer=false')) {
	console.log('[profile] switching to play...')
	await page.evaluate(() => performance.mark('play-switch-start'))
	await page.evaluate(async () => {
		const sel = document.getElementById('mode')
		if (sel) {
			sel.value = 'play'
			sel.dispatchEvent(new Event('change', { bubbles: true }))
		}
		try {
			if (window.viewer) {
				window.viewer.viewerMode = 'play'
				window.viewer.enterPlayMode?.()
			}
		} catch {}
		if (!window.viewer?.player && window.viewer?.load)
			try {
				await window.viewer.load()
			} catch {}
	})
	for (let i = 0; i < 15; i++) {
		await new Promise((r) => setTimeout(r, 500))
		const s = await page
			.evaluate(() => ({ hasPlayer: !!window.viewer?.player, mode: window.viewer?.viewerMode }))
			.catch(() => ({ hasPlayer: false }))
		if (s.hasPlayer) break
	}
	await page.evaluate(() => {
		performance.mark('play-switch-end')
		try {
			performance.measure('play-switch', 'play-switch-start', 'play-switch-end')
		} catch {}
	})
	playSwitchMs = performance.now() - beforePlay
	console.log(`[profile] play switch ${playSwitchMs.toFixed(0)}ms`)
}

const initial = await page.evaluate(() => {
	const v = window.viewer
	let tris = 0,
		draws = 0
	try {
		v.tableGroup.traverse((o) => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				draws++
			}
		})
	} catch {}
	const mats = new Set()
	try {
		v.tableGroup.traverse((o) => {
			if (o.isMesh && o.material) {
				for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.add(m.uuid)
			}
		})
	} catch {}
	let heap = null
	try {
		if (performance.memory)
			heap = {
				used: Math.round(performance.memory.usedJSHeapSize / 1048576),
				total: Math.round(performance.memory.totalJSHeapSize / 1048576),
			}
	} catch {}
	const emu = v?.player?.getPhysics?.()?.emu
	return {
		tris: Math.round(tris),
		draws,
		mats: mats.size,
		heap,
		calls: v.renderer.info.render.calls,
		triangles: v.renderer.info.render.triangles,
		balls: v?.player?.balls?.length ?? 0,
		emu: emu?.constructor?.name || null,
		viewerMode: v.viewerMode,
		isPaused: v.isPaused,
	}
})
console.log('[profile] initial', initial)
const ballsArg = process.argv.find((a) => a.startsWith('--balls='))?.split('=')[1]
const desiredBalls = ballsArg !== undefined ? Number(ballsArg) : initial.balls === 0 ? 10 : 0
if (desiredBalls > 0) {
	const created = await page.evaluate(async (n) => {
		const p = window.viewer?.player
		if (!p) return 'no player'
		const width = p.table?.gameData?.width ?? 1000
		const height = p.table?.gameData?.height ?? 2000
		const THREE = window.THREE
		if (!THREE?.Vector3) return 'no THREE'
		if (!THREE.Vector3.prototype.subAndRelease) {
			THREE.Vector3.prototype.subAndRelease = function (o) {
				this.sub(o)
				try {
					o.release?.()
				} catch {}
				return this
			}
		}
		if (!THREE.Vector3.prototype.addAndRelease) {
			THREE.Vector3.prototype.addAndRelease = function (o) {
				this.add(o)
				try {
					o.release?.()
				} catch {}
				return this
			}
		}
		let ok = 0
		for (let i = 0; i < n; i++) {
			const x = width / 2 + (Math.random() - 0.5) * 60
			const y = height / 2 + (Math.random() - 0.5) * 60
			const z = 30
			const vx = (Math.random() - 0.5) * 600
			const vy = (Math.random() - 0.5) * 600
			const vz = 50 + Math.random() * 100
			try {
				p.createBall(
					{
						getBallCreationPosition: () => new THREE.Vector3(x, y, z),
						getBallCreationVelocity: () => new THREE.Vector3(vx, vy, vz),
						onBallCreated: () => {},
					},
					25,
					1,
				)
				ok++
			} catch (e) {
				return 'create err ' + (e?.message ?? String(e))
			}
		}
		return `created ${ok}/${n} total ${p.balls.length}`
	}, desiredBalls)
	console.log(`[profile] ensure balls ${created}`)
}
let metricsMid = {}
try {
	metricsMid = await page.metrics()
} catch {}

await page.evaluate(() => {
	window.__fps = { frames: 0, last: performance.now(), fps: 0 }
	const loop = () => {
		window.__fps.frames++
		const now = performance.now()
		if (now - window.__fps.last >= 1000) {
			window.__fps.fps = Math.round((window.__fps.frames * 1000) / (now - window.__fps.last))
			window.__fps.frames = 0
			window.__fps.last = now
		}
		requestAnimationFrame(loop)
	}
	requestAnimationFrame(loop)
})

console.log(`[profile] sampling physics+render for ${duration}ms...`)
const samples = []
const tSample0 = performance.now()
while (performance.now() - tSample0 < duration) {
	await new Promise((r) => setTimeout(r, 400))
	const s = await page
		.evaluate(() => {
			const v = window.viewer
			const stats = document.getElementById('stats')?.innerText || ''
			const tM = stats.match(/t\s+(\d+)ms/)
			const t = tM ? Number(tM[1]) : undefined
			const fpsM = stats.match(/(\d+)\s*fps/)
			const fps = fpsM ? Number(fpsM[1]) : window.__fps?.fps
			const phys = v?.player?.getPhysics?.()
			return {
				t,
				fps,
				pt: v?.player?.getGameTime?.() ?? phys?.timeMsec,
				balls: v?.player?.balls?.length ?? 0,
				draws: v.renderer.info.render.calls,
				triangles: v.renderer.info.render.triangles,
				physPeriod: phys?.physPeriod,
				lastFrameDuration: phys?.lastFrameDuration,
				heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : undefined,
			}
		})
		.catch(() => ({}))
	samples.push({ ...s, at: Math.round(performance.now() - tSample0) })
	console.log(`[sample] t=${s.t ?? s.pt} fps=${s.fps} balls=${s.balls} draws=${s.draws} heap=${s.heap}MB`)
}

const perfEntries = await page
	.evaluate(() => {
		try {
			return {
				marks: performance
					.getEntriesByType('mark')
					.slice(-30)
					.map((e) => ({ name: e.name, start: e.startTime })),
				measures: performance
					.getEntriesByType('measure')
					.map((e) => ({ name: e.name, duration: e.duration, start: e.startTime })),
				observer: window.__profile?.measures?.slice(-30),
			}
		} catch {
			return {}
		}
	})
	.catch(() => ({}))

let metricsAfter = {}
try {
	metricsAfter = await page.metrics()
} catch {}
let coverage = null
try {
	const c = await page.coverage.stopJSCoverage()
	coverage = { entries: c.length, used: c.reduce((a, e) => a + e.text.length, 0) }
} catch {}

if (tracing) {
	try {
		await page.tracing.stop()
		console.log(
			'[profile] trace saved',
			tracePath,
			fs.existsSync(tracePath) ? fs.statSync(tracePath).size + ' bytes' : 'missing',
		)
	} catch (e) {
		console.log('[profile] trace stop err', e.message)
	}
}

const physicsTicking =
	samples.length >= 2 &&
	typeof samples[0].t === 'number' &&
	typeof samples[samples.length - 1].t === 'number' &&
	samples[samples.length - 1].t > samples[0].t
const result = {
	url,
	at: new Date().toISOString(),
	timings: {
		domMs: Math.round(tDom - tNav0),
		readyMs: Math.round(elapsedReady),
		playSwitchMs: Math.round(playSwitchMs),
		...parsedTimes,
	},
	initial,
	metrics: { before: metricsMid, after: metricsAfter },
	perfEntries,
	coverage,
	samples,
	physicsTicking,
	duration,
	trace: tracing && fs.existsSync(tracePath) ? tracePath : null,
	logTail: logs.slice(-30).join('\n').slice(0, 4000),
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
console.log(`[profile] wrote ${outPath} ${fs.statSync(outPath).size} bytes`)
console.log(
	`[profile] physics ticking: ${physicsTicking ? 'PASS' : 'FAIL'} (${samples[0]?.t} -> ${samples[samples.length - 1]?.t})`,
)
try {
	const shotPath = path.join(path.dirname(outPath), 'profile-play.png')
	await page.screenshot({ path: shotPath })
	console.log(`[profile] screenshot ${shotPath} ${fs.statSync(shotPath).size} bytes`)
} catch {}
await browser.close()
if (viteProc) viteProc.kill()
console.log('[profile] done')

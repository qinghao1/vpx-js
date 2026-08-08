// Profiling harness — full gamut: load app, parse vpx, build scene, mount, play, physics + render.
// Usage: node harness-profile.mjs [--url=http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx] [--out=/tmp/profile.json] [--duration=5000]

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_URL = 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx'
const DEFAULT_OUT = '/tmp/profile.json'
const DEFAULT_DURATION = 5000

function pickPuppeteer() {
	const cands = [
		'/home/qinghao1/projects/vpx-js/demo-browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
		'/home/qinghao1/projects/vpx-js/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
	]
	for (const p of cands) if (fs.existsSync(p)) return p
	throw new Error('puppeteer-core not found')
}
const puppeteer = (await import(pickPuppeteer())).default

const url =
	process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ||
	process.argv.find((a) => a.startsWith('http')) ||
	DEFAULT_URL
const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] || DEFAULT_OUT
const duration = Number(process.argv.find((a) => a.startsWith('--duration='))?.split('=')[1] || DEFAULT_DURATION)

let viteProc = null
async function ensureVite() {
	try {
		const r = await fetch(url.replace(/\?.*$/, ''), { method: 'HEAD' })
		if (r.ok) return
	} catch {}
	console.log('[profile] starting vite...')
	viteProc = spawn('npx', ['vite', '--host', '--port', '3000'], {
		cwd: '/home/qinghao1/projects/vpx-js/demo-browser',
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	viteProc.stdout.on('data', (d) => process.stdout.write('[vite] ' + d))
	viteProc.stderr.on('data', (d) => process.stderr.write('[vite] ' + d))
	for (let i = 0; i < 30; i++) {
		await new Promise((r) => setTimeout(r, 1000))
		try {
			const r = await fetch('http://localhost:3000/', { method: 'HEAD' })
			if (r.ok) {
				console.log('[profile] vite ready')
				return
			}
		} catch {}
	}
	throw new Error('vite not ready')
}
await ensureVite()

const browser = await puppeteer.launch({
	executablePath: '/usr/bin/google-chrome',
	headless: 'new',
	args: [
		'--no-sandbox',
		'--disable-dev-shm-usage',
		'--enable-unsafe-swiftshader',
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--window-size=1280,900',
		'--disable-gpu-sandbox',
	],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })

await page.evaluateOnNewDocument(() => {
	window.__profile = { t0: performance.now(), marks: {}, nav0: Date.now() }
	window.__mark = (k) => (window.__profile.marks[k] = performance.now())
	window.__measure = (a, b) => (window.__profile.marks[b] ?? 0) - (window.__profile.marks[a] ?? 0)
})

const logs = []
page.on('console', (m) => {
	const t = m.text()
	logs.push(t)
	if (/Parsed|Scene generated|Textures|Ready|Failed|PLAY|physics|Player init|PinMAME|Error/.test(t))
		console.log(`[c] ${t.slice(0, 300)}`)
})
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 1000)))

const tNav0 = performance.now()
console.log(`[profile] goto ${url}`)
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
const tDom = performance.now()

try {
	await page.evaluate(() => {
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
	await browser.close()
	if (viteProc) viteProc.kill()
	process.exit(1)
}
console.log(`[profile] Ready in ${(elapsedReady).toFixed(0)}ms (dom ${(tDom - tNav0).toFixed(0)}ms)`)

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
	window.__physSamples = []
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

const physicsTicking =
	samples.length >= 2 &&
	typeof samples[0].t === 'number' &&
	typeof samples[samples.length - 1].t === 'number' &&
	samples[samples.length - 1].t > samples[0].t

const pth = path.join(
	out.endsWith('.json') ? path.dirname(out) : out,
	out.endsWith('.json') ? path.basename(out) : 'profile.json',
)
const outPath = out.endsWith('.json') ? out : path.join(out, 'profile.json')
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
	samples,
	physicsTicking,
	duration,
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

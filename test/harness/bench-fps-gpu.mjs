// Minimal GPU FPS harness — one page per leg (viewer + play), rAF + renderer
// frame deltas over a fixed window, plus the UNMASKED_RENDERER_WEBGL string so
// the rasterizer (real GPU vs SwiftShader) is on the record.
// Run: DISPLAY=:99 node test/harness/bench-fps-gpu.mjs --vpx=/path/to/table.vpx [--gpu=gl] [--duration=5000] [--warmup=2000]
// Exit: 0 pass (both legs measured), 1 failure.
import path from 'node:path'
import { ensureVite, launchBrowser, loadPuppeteer, newPage, sleep } from './utils.mjs'

const getArg = (args, name, dflt = null) => {
	const hit = args.find(a => (a === `--${name}` ? false : a.startsWith(`--${name}=`)))
	return hit ? hit.slice(name.length + 3) : dflt
}
const hasFlag = (args, name) => args.includes(`--${name}`)

const args = process.argv.slice(2)
const vpxArg = getArg(args, 'vpx', '/home/qinghao1/Downloads/walking_dead.vpx')
const gpu = getArg(args, 'gpu', hasFlag(args, 'gpu') ? 'vulkan' : 'gl')
const duration = Number(getArg(args, 'duration', '5000'))
const warmup = Number(getArg(args, 'warmup', '2000'))

const vpxParam = path.isAbsolute(vpxArg) ? `/@fs${vpxArg}` : vpxArg
const legs = ['viewer', 'play']

await ensureVite('https://localhost:3000/', { label: 'fps-gpu' })
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { ...(gpu ? { gpu } : {}), timeout: 300_000 })

async function runLeg(mode) {
	const page = await newPage(browser)
	const url = `https://localhost:3000/?vpx=${vpxParam}&mode=${mode}`
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
	let ready = false
	for (let i = 0; i < 120; i++) {
		await sleep(1000)
		const s = await page
			.evaluate(() => ({
				ready: (document.getElementById('log')?.innerText ?? '').includes('Ready') || !!window.viewer?.player,
			}))
			.catch(() => ({ ready: false }))
		if (s.ready) {
			ready = true
			break
		}
	}
	if (!ready) {
		await page.close().catch(() => {})
		return { mode, ok: false, reason: 'not ready in 120s' }
	}
	// Let background texture streaming / visual enhancement settle: measuring
	// mid-stream yields upload-stalled frames, not the render rate (bench.mjs
	// waits the same way). Tables with nothing to stream fall through fast.
	for (let i = 0; i < 90; i++) {
		const s = await page
			.evaluate(() => {
				const txt = document.getElementById('log')?.innerText ?? ''
				return {
					streaming: txt.includes('Streaming') || txt.includes('Enhancing visuals'),
					done: txt.includes('[stream] Done') || txt.includes('Visuals ready'),
				}
			})
			.catch(() => ({ streaming: false, done: true }))
		if (s.done || (!s.streaming && i > 4)) break
		await sleep(2000)
	}
	await sleep(warmup)
	const m = await page
		.evaluate(
			durMs =>
				new Promise(resolve => {
					const r = window.viewer?.renderer
					// WebGPURenderer (current backend): counters live on info.frame /
					// info.render.{drawCalls,triangles}; info.render.calls counts render
					// contexts, not draws. Legacy WebGLRenderer nests frame under
					// info.render.frame. Support both.
					const frameOf = () => r?.info?.frame ?? r?.info?.render?.frame ?? null
					const f0 = frameOf()
					let frames = 0
					const t0 = performance.now()
					const tick = () => {
						frames++
						if (performance.now() - t0 < durMs) requestAnimationFrame(tick)
						else {
							const elapsed = performance.now() - t0
							const f1 = frameOf()
							const ren = r?.info?.render ?? {}
							resolve({
								frames,
								elapsedMs: Math.round(elapsed),
								f0,
								f1,
								calls: ren.drawCalls ?? ren.calls ?? r?.info?.calls ?? 0,
								tris: ren.triangles ?? 0,
							})
						}
					}
					requestAnimationFrame(tick)
				}),
			duration,
		)
		.catch(e => ({ error: String(e?.message ?? e) }))
	const gl = await page
		.evaluate(() => {
			try {
				const cvs = document.createElement('canvas')
				const gl2 = cvs.getContext('webgl2') || cvs.getContext('webgl')
				const ext = gl2.getExtension('WEBGL_debug_renderer_info')
				return String((ext && gl2.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl2.getParameter(gl2.RENDERER))
			} catch (e) {
				return `err:${e.message}`
			}
		})
		.catch(() => 'unknown')
	await page.close().catch(() => {})
	if (m.error) return { mode, ok: false, reason: m.error }
	const fpsRaf = Math.round((m.frames * 1000) / m.elapsedMs)
	const fpsInfo = m.f0 != null && m.f1 != null ? +(((m.f1 - m.f0) * 1000) / m.elapsedMs).toFixed(1) : null
	return {
		mode,
		ok: true,
		fpsRaf,
		fpsInfo,
		frames: m.frames,
		elapsedMs: m.elapsedMs,
		draws: m.calls,
		tris: m.tris,
		gl,
	}
}

const results = []
for (const mode of legs) {
	const r = await runLeg(mode)
	console.log(
		`[fps-gpu] leg=${r.mode} ${r.ok ? `fpsRaf=${r.fpsRaf} fpsInfo=${r.fpsInfo} frames=${r.frames}/${r.elapsedMs}ms draws=${r.draws} tris=${r.tris}` : `FAIL ${r.reason}`} gl=${r.gl ?? ''}`,
	)
	results.push(r)
}
await browser.close().catch(() => {})
const ok = results.every(r => r.ok)
console.log(
	`\n# fps-gpu ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results.map(r => ({ mode: r.mode, fps: r.fpsRaf ?? null })))}`,
)
process.exit(ok ? 0 : 1)

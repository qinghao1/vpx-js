// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import fs from 'node:fs'
import path from 'node:path'
import { exists, VPX_CANDIDATES } from './bench-shared.ts'
import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage, sleep } from './utils.mjs'
import { findRomForGameName, getArg, hasFlag } from './vpinball-resolver.ts'

const args = process.argv.slice(2)

const DEFAULT_EMPTY = '/test/fixtures/table-empty.vpx'

function resolvePathToParam(filePath) {
	const abs = path.resolve(filePath)
	if (!exists(abs)) return null
	const pubLink = path.resolve('demo-browser/public', path.basename(abs))
	try {
		if (exists(pubLink) && fs.realpathSync(pubLink) === fs.realpathSync(abs)) {
			return `/${path.basename(abs)}`
		}
	} catch {
		// Expected: fs.realpathSync throws ENOENT when public symlink not present — fall through to /@fs.
	}
	if (abs.includes('/test/fixtures/')) return abs.slice(path.resolve('.').length)
	return `/@fs${abs}`
}

function resolveUrl(vpxPath, romPath) {
	const vpxParam = resolvePathToParam(vpxPath)
	if (!vpxParam) throw new Error(`VPX not found: ${vpxPath}`)
	const abs = path.resolve(vpxPath)
	const st = fs.statSync(abs)
	console.log(`[bench] VPX ${abs} ${(st.size / 1024 / 1024).toFixed(1)} MB`)
	let u = `/?vpx=${vpxParam}`
	if (romPath) {
		const romParam = resolvePathToParam(romPath)
		if (romParam) {
			console.log(`[bench] ROM ${romPath}`)
			u += `&rom=${romParam}`
		}
	}
	return `${u}&mode=play`
}

let url = getArg(args, 'url', null)
const vpxArg = getArg(args, 'vpx', null)
const romArg = getArg(args, 'rom', null)
const autoVpx = VPX_CANDIDATES.find(candidate => exists(candidate)) ?? null
if (!url) {
	const vpxPath = vpxArg ?? autoVpx ?? DEFAULT_EMPTY
	const romPath =
		romArg ?? (vpxPath.includes('walking_dead') ? findRomForGameName('twd_160h', path.dirname(vpxPath)) : null)
	url = resolveUrl(vpxPath, romPath)
	if (!vpxArg && autoVpx) console.log(`[bench] auto-detected table: ${vpxPath}`)
}

const duration = Number(getArg(args, 'duration', '3000'))
const warmup = Number(getArg(args, 'warmup', url.includes('walking_dead') ? '2000' : '800'))
const outPath = getArg(args, 'out', null)
const profile = hasFlag(args, 'profile') || hasFlag(args, 'breakdown') || !hasFlag(args, 'no-profile')
// Breakdown assumes the WASM seam (syncAll sink, stepFrame) and a
// TSL-composer WebGPU renderer (pipeline.render total). Other tables reuse
// it unchanged; another backend/seam needs new wraps, not new flags.
const breakdown = hasFlag(args, 'breakdown')
const interactive = !hasFlag(args, 'no-interact') && !hasFlag(args, 'passive')
const headed = hasFlag(args, 'headed')
const gpu = getArg(args, 'gpu', hasFlag(args, 'gpu') ? 'vulkan' : null)

console.log(
	`[bench] url=${url} duration=${duration} warmup=${warmup} interactive=${interactive} profile=${profile} gpu=${gpu ?? false} headed=${headed}`,
)

const puppeteer = await loadPuppeteer()
const vite = await ensureVite(url)
url = vite.url
const browser = await launchBrowser(puppeteer, {
	...(headed ? { headless: false } : {}),
	...(gpu ? { gpu } : {}),
	timeout: 300_000,
})
const page = await newPage(browser)
// Worst-case journey: 20s boot + ~40s plunge retries + warmup + duration.
// 180s covered defaults but timed out --duration 120000 runs; 300s covers both.
page.setDefaultTimeout(300000)

const logs = attachLogging(page, { filter: /./, prefix: '[c]' })

let exitCode = 0
// biome-ignore format: file-spanning try/finally kept flat so the tracing block stays byte-identical
try {

// === TRACING (optional, enabled with --trace) ===
let tracePath = null
let tracingClient = null
const doTrace = hasFlag(args, 'trace')
if (doTrace) {
	tracePath = path.resolve(`trace-${Date.now()}.json`)
	try {
		const client = await page.createCDPSession()
		tracingClient = client
		await client.send('Tracing.start', {
			categories: 'devtools.timeline,blink.user_timing,loading,cc,rail,gpu,disabled-by-default-v8.gc',
			transferMode: 'ReturnAsStream',
		})
		console.log(`[bench] tracing started -> ${tracePath}`)
	} catch (error) {
		console.warn(`[bench] tracing not available: ${error.message}`)
	}
}

// === PERFORMANCE OBSERVER (capture User Timing) ===
try {
	await page.evaluateOnNewDocument(() => {
		// keep marks for bench to collect later
		window.__benchMarks = []
		if (typeof PerformanceObserver !== 'undefined') {
			try {
				new PerformanceObserver(list => {
					for (const e of list.getEntries())
						window.__benchMarks.push({
							name: e.name,
							entryType: e.entryType,
							duration: e.duration,
							startTime: e.startTime,
						})
				}).observe({ entryTypes: ['measure', 'mark'] })
			} catch {
				// Expected: ReferenceError if PerformanceObserver missing or TypeError for unsupported entryTypes — bench can run without observer.
			}
		}
	})
} catch {
	// Expected: Puppeteer may throw if page closed before script injected — bench continues without user-timing observer.
}

// === 1. LOAD JOURNEY ===
console.log(`[bench] === 1. LOAD JOURNEY ===`)
const tNavStart = performance.now()
async function safeMetrics() {
	try {
		return await page.metrics()
	} catch {
		// Expected: CDP Metrics error if target detached or session closed — no metrics.
		return null
	}
}
const metricsBefore = await safeMetrics()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
const navMs = Math.round(performance.now() - tNavStart)

let readyMs = null
let readyHeap = null
for (let i = 0; i < 90; i++) {
	await sleep(1000)
	const s = await page.evaluate(() => {
		const txt = window.vpx?.log() ?? ''
		const isReady = window.vpx?.state.loadState === 'ready'
		const hasPlayer = !!window.vpx?.state.wasmReady
		const lastLines = txt.split('\n').filter(Boolean).slice(-2).join(' | ')
		const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
		const measures = (() => {
			try {
				const ms = performance.getEntriesByType('measure')
				return ms
					.slice(-10)
					.map(m => `${m.name}:${Math.round(m.duration)}ms`)
					.join(' | ')
			} catch {
				// Expected: TypeError if Performance API unavailable in this context.
				return ''
			}
		})()
		return { isReady, hasPlayer, lastLines, heap, measures }
	})
	if (i % 5 === 0)
		console.log(
			`[bench] waiting ready ${i}s… [${s.lastLines}] heap ${s.heap}MB ${s.measures ? `| ${s.measures}` : ''}`,
		)
	if (s.isReady && s.hasPlayer) {
		readyMs = Math.round(performance.now() - tNavStart)
		readyHeap = s.heap
		console.log(`[bench] Ready after ${readyMs}ms (nav: ${navMs}ms) heap ${s.heap}MB`)
		break
	}
}
if (readyMs === null) {
	console.error('[bench] not Ready within 90s')
	exitCode = 1
} else {

// Await background texture streaming / pre-loading if present
let streamMs = 0
let streamDone = false
let pollHeap = readyHeap
for (let i = 0; i < 80; i++) {
	const status = await page.evaluate(() => {
		const txt = window.vpx?.log() ?? ''
		const isStreaming = txt.includes('Streaming') || txt.includes('Enhancing visuals')
		const isDone = txt.includes('[stream] Done') || txt.includes('Visuals ready')
		const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
		return { isStreaming, isDone, heap }
	})
	pollHeap = status.heap ?? pollHeap
	if (status.isDone) {
		streamMs = (i + 1) * 500
		streamDone = true
		console.log(`[bench] texture streaming complete (${streamMs}ms) heap ${pollHeap}MB`)
		break
	}
	if (!status.isStreaming && i > 4) break
	if (i % 5 === 0 && status.isStreaming) console.log(`[bench] streaming ${i * 0.5}s… heap ${pollHeap}MB`)
	await sleep(500)
}
if (!streamDone) console.log(`[bench] streaming not done within timeout — partial ${pollHeap}MB`)
// Passed into the play journey: if streaming never settled, the profile
// window overlaps it and render/frame + jankFrames carry streaming cost.
const streamSettled = streamDone

// Collect User Timing measures after load
const userTiming = await page
	.evaluate(() => {
		try {
			const out = {}
			for (const e of performance.getEntriesByType('measure')) out[e.name] = Math.round(e.duration)
			for (const e of performance.getEntriesByType('mark')) out[`mark:${e.name}`] = Math.round(e.startTime)
			if (window.__benchMarks?.length) out.__observer = window.__benchMarks.slice(-20)
			return out
		} catch {
			// Expected: TypeError if Performance API unavailable — bench continues without measures.
			return {}
		}
	})
	.catch(() => {
		// Expected: page.evaluate CDP error if page detached mid-evaluate — bench can continue without user timing.
		return {}
	})

// Collect CDP metrics
const metricsAfterLoad = await safeMetrics()
let perfEntries = []
try {
	perfEntries = await page.evaluate(() => {
		try {
			return performance
				.getEntriesByType('navigation')
				.map(n => ({ type: n.entryType, duration: Math.round(n.duration), transferSize: n.transferSize }))
		} catch {
			// Expected: TypeError if Performance API unavailable or ReferenceError if performance undefined — bench continues without navigation entries.
			return []
		}
	})
} catch {
	// Expected: Puppeteer may throw if page closed before script injected — bench continues without user-timing observer.
}

// Collect complete table & WebGL state
const loadState = await page.evaluate(() => {
	const v = window.viewer
	if (!v) return null
	let tris = 0
	let meshes = 0
	let visibleMeshes = 0
	try {
		v.tableGroup?.traverse(o => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				meshes++
				// Draw-call upper bound: renderer.info.render.calls is not
				// meaningful under the WebGPU backend (reads 0 per tick with
				// autoReset, mid-composer partial sums otherwise), so count
				// effectively visible meshes instead. Frustum culling can only
				// lower the real draw count from here.
				if (o.visible) {
					let hidden = false
					for (let p = o.parent; p; p = p.parent) {
						if (!p.visible) {
							hidden = true
							break
						}
						if (p === v.tableGroup) break
					}
					if (!hidden) visibleMeshes++
				}
			}
		})
	} catch {
		// Expected: TypeError if tableGroup not yet mounted.
	}
	// WASM path: the PinMAME emu lives inside the headless engine, so
	// "running" is engine readiness (no mock engine exists in the page).
	const emuRunning = !!v?.wasmEngine && v.wasmEngine.ready

	let glVendor = '?'
	let glRenderer = '?'
	let glVersion = '?'
	let glParams = {}
	try {
		const gl = v.renderer?.getContext()
		if (gl) {
			glVendor = gl.getParameter(gl.VENDOR) ?? '?'
			glRenderer = gl.getParameter(gl.RENDERER) ?? '?'
			glVersion = gl.getParameter(gl.VERSION) ?? '?'
			const unmasked = key => {
				try {
					const ext = gl.getExtension('WEBGL_debug_renderer_info')
					return ext ? gl.getParameter(ext[key]) : null
				} catch {
					// Expected: SecurityError if WEBGL_debug_renderer_info blocked or TypeError if WebGL context lost — renderer info is optional.
					return null
				}
			}
			glParams = {
				MAX_TEXTURE_SIZE: gl.getParameter(gl.MAX_TEXTURE_SIZE),
				MAX_VERTEX_ATTRIBS: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
				UNMASKED_VENDOR: unmasked('UNMASKED_VENDOR_WEBGL'),
				UNMASKED_RENDERER: unmasked('UNMASKED_RENDERER_WEBGL'),
			}
		}
	} catch {
		// Expected: TypeError/InvalidStateError if WebGL context lost or getContext returns null — GL diagnostics are optional.
	}

	return {
		tris: Math.round(tris),
		meshes,
		// Upper bound on draw calls (effectively visible meshes; frustum
		// culling only lowers it). Named plainly: renderer.info calls are
		// not meaningful under the WebGPU backend.
		visibleMeshes,
		triangles: Math.round(tris),
		programs: null,
		// WASM ball count includes unlaunched trough balls (4 on TWD from boot).
		balls: v?.wasmEngine?.ballCount ?? 0,
		hasEmu: !!v?.wasmEngine,
		emuRunning,
		emuMock: false,
		gameName: v.table?.data?.gameName ?? v.table?.info?.TableName ?? null,
		gl: { vendor: glVendor, renderer: glRenderer, version: glVersion, params: glParams },
		isolation: {
			hasSAB: typeof SharedArrayBuffer !== 'undefined',
			isolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
			waitAsync: typeof Atomics !== 'undefined' && typeof Atomics.waitAsync === 'function',
			threaded: false,
		},
		memory: performance.memory
			? {
					used: Math.round(performance.memory.usedJSHeapSize / 1048576),
					total: Math.round(performance.memory.totalJSHeapSize / 1048576),
					limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576),
				}
			: null,
		timing: (() => {
			try {
				return performance.getEntriesByType('navigation')[0]
					? {
							domContentLoaded: Math.round(
								performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
							),
						}
					: null
			} catch {
				// Expected: TypeError if performance.timing is unavailable (deprecated) or navigation entry missing — timing is optional.
				return null
			}
		})(),
	}
})

const totalLoadMs = Math.round(performance.now() - tNavStart)
console.log(`[bench] === Total Load Journey: ${totalLoadMs}ms (ready ${readyMs}ms + stream ${streamMs}ms) ===\n`)

// === 2. PLAY JOURNEY (User Simulation & Active Performance) ===
console.log(`[bench] === 2. PLAY JOURNEY (User Simulation) ===`)

const journeyResult = await page.evaluate(
	async opt => {
		const v = window.viewer
		const w = v?.wasmEngine
		const r = v?.renderer
		const play = {
			coin: { pass: false, responseMs: 0 },
			start: { pass: false, responseMs: 0 },
			plunge: { pass: false, responseMs: 0 },
			flippers: { flipsCount: 0, leftAngleDelta: 0, rightAngleDelta: 0 },
			nudge: { pass: false, mag: 0, moved: false },
			ballsInPlay: 0,
			romBoot: false,
			inputDrops: 0,
		}
		// Input + observation go through the WASM seam: viewer._sendKey/_nudge
		// for input, engine ballCount/flipperAngles/ballPoses for state.
		const sendKey = (code, down) => {
			// _sendKey drops silently when not ready, and drops presses while
			// paused (releases still go through); count both here so pass
			// rates stay honest. Returns whether the key was delivered.
			if (!w?.ready || (v.isPaused && down)) {
				play.inputDrops++
				return false
			}
			v._sendKey(code, down)
			return true
		}
		const doNudge = (angle, force) => v._nudge(angle, force)
		// WASM ball count includes unlaunched trough balls (4 on TWD from
		// boot), so a failed launch reads ~4, never 0.
		const ballCount = () => w?.ballCount ?? 0
		const logText = () => window.vpx?.log() ?? ''
		const keyDropped = code => logText().includes(`no SDL scancode for ${code}`)
		// Flipper angles via the public engine accessor (no private reach-through).
		const flipperAngles = () => w?.flipperAngles?.() ?? []

		// Ball MOTION is the launch ground truth: only a launched ball moves
		// (resting rows are bit-identical frame to frame).
		const ballPose = () => w?.ballPoses?.() ?? []
		const maxMotion = async ms => {
			const a = ballPose()
			await new Promise(res => setTimeout(res, ms))
			const b = new Map(ballPose().map(pos => [pos.id, pos]))
			let m = 0
			for (const pos of a) {
				const q = b.get(pos.id)
				// A brand-new id after the snapshot is a launch by definition.
				if (!q) return MOTION_LAUNCHED
				m = Math.max(m, Math.hypot(q.x - pos.x, q.y - pos.y, q.z - pos.z))
			}
			return m
		}
		// 1/5 ball diameter: resting balls are static, a rolling ball moves
		// hundreds of units per second.
		const MOTION_LAUNCHED = 1e9
		const MOTION_MIN = 10

		if (opt.interactive && w?.ready) {
			// Step 0: wait for the ROM to boot. DMD frames OR attract-mode
			// lamp activity mean the emu is alive; a coin inserted before that
			// is swallowed and the whole journey tests nothing. DMD alone is
			// not universal (non-forwarding scripts never advance frameId),
			// so either signal counts; the 20s cap bounds non-DMD tables.
			{
				const fid = () => w.dmdFrame?.frameId ?? -1
				const lid = () => w.lightActivity ?? 0
				const tBoot = performance.now()
				let lastF = fid()
				let lastL = lid()
				let dmdChanges = 0
				let lightChanges = 0
				while (performance.now() - tBoot < 20000) {
					await new Promise(res => setTimeout(res, 500))
					const f = fid()
					const l = lid()
					if (f !== lastF) {
						dmdChanges++
						lastF = f
					}
					if (l !== lastL) {
						lightChanges++
						lastL = l
					}
					if ((f >= 0 && dmdChanges >= 2) || lightChanges >= 2) {
						play.romBoot = true
						break
					}
				}
			}
			// Step 1: Insert Coin (Key 5). Pass = sent while ready AND the code
			// mapped (no drop warning). Credit registration itself is not
			// observable through the current bridge — no switch/credit getter
			// exists — so this asserts delivery, not game state.
			const dropsBeforeCoin = play.inputDrops
			const t0 = performance.now()
			sendKey('Digit5', true)
			await new Promise(res => setTimeout(res, 180))
			sendKey('Digit5', false)
			play.coin = {
				pass: play.inputDrops === dropsBeforeCoin && !keyDropped('Digit5'),
				responseMs: Math.round(performance.now() - t0),
			}

			// Step 2: Press Start (Key 1) — same delivery-only semantics.
			const dropsBeforeStart = play.inputDrops
			const t1 = performance.now()
			sendKey('Digit1', true)
			await new Promise(res => setTimeout(res, 180))
			sendKey('Digit1', false)
			play.start = {
				pass: play.inputDrops === dropsBeforeStart && !keyDropped('Digit1'),
				responseMs: Math.round(performance.now() - t1),
			}

			// Step 3: launch a ball. The ROM may still be settling (credit →
			// game → ball in lane), so retry coin/start/plunge as a cycle and
			// watch for MOTION, not count: only a launched ball moves.
			const t2 = performance.now()
			let launched = false
			for (let attempt = 0; attempt < 6 && !launched; attempt++) {
				if (attempt > 0) {
					sendKey('Digit5', true)
					await new Promise(res => setTimeout(res, 200))
					sendKey('Digit5', false)
					await new Promise(res => setTimeout(res, 800))
					sendKey('Digit1', true)
					await new Promise(res => setTimeout(res, 200))
					sendKey('Digit1', false)
					await new Promise(res => setTimeout(res, 1500))
				} else {
					await new Promise(res => setTimeout(res, 3000))
				}
				sendKey('Enter', true)
				await new Promise(res => setTimeout(res, 1500))
				sendKey('Enter', false)
				launched = (await maxMotion(2500)) > MOTION_MIN
			}
			play.plunge = {
				pass: launched,
				responseMs: Math.round(performance.now() - t2),
			}

			// Step 4: Test flippers while each key is held; the engine row
			// only moves while a game is live. Aligned by partIdx; rows that
			// appear mid-measure have no baseline and are skipped rather than
			// diffed against zero (a fresh row at rest would read as moved).
			const measure = async code => {
				const before = new Map(flipperAngles().map(f => [f.partIdx, f.angle]))
				sendKey(code, true)
				await new Promise(res => setTimeout(res, 300))
				const after = flipperAngles()
				sendKey(code, false)
				let d = 0
				for (const f of after) {
					const b = before.get(f.partIdx)
					if (b === undefined) continue
					d = Math.max(d, Math.abs(f.angle - b))
				}
				return +d.toFixed(4)
			}
			play.flippers.leftAngleDelta = await measure('ShiftLeft')
			play.flippers.rightAngleDelta = await measure('ShiftRight')
			// Step 5: nudge. No cabinet-acceleration signal exists on the WASM
			// seam, so pass means "delivered without throwing" and moved reports
			// whether any ball deviated in the following second.
			try {
				doNudge(75, 2.5)
				play.nudge = { pass: true, mag: 0, moved: (await maxMotion(1000)) > MOTION_MIN }
			} catch {
				// Expected: Error if nudge called before emu start — interactive test is best-effort.
				play.nudge = { pass: false, mag: 0, moved: false }
			}
		}

		await new Promise(res => setTimeout(res, opt.warmup))

		// Overlap tag: streaming Settled at the gate AND still showing Done in
		// the log now. Conservative toward flagging overlap (a rotated-out Done
		// line reads as overlapped) — the tag only contextualizes render variance.
		const streamSettledAtProfileStart = !!opt.streamSettled && logText().includes('[stream] Done')

		// === 3. ACTIVE PROFILING LOOP ===
		const physicsMs = []
		const animMs = []
		const engineMs = []
		const frameMs = []
		const frameEndMs = []
		// Breakdown-only: per-step sync phases + applied rows, heap trend. renderFrameMs holds one composer total per viewer frame
		// (see the pipeline wrap below); renderCalls counts every interior
		// renderer.render entry for calls/frame breadth.
		const breakdownRows = []
		const heapSamples = []
		const renderFrameMs = []
		let renderCalls = 0
		let flipsCount = 0
		const start = performance.now()
		let last = start
		let startFrame = 0
		try {
			startFrame = r?.info?.render?.frame ?? 0
		} catch {
			// Expected: TypeError if renderer info not initialised (e.g., before first frame) — frame delta is optional.
		}

		// Patch ledger: every wrap below is restored after stats so
		// sampling arrays (and patched methods) never grow past the profile.
		const patches = []
		const patchable = (target, method) => typeof target?.[method] === 'function'
		const timeInto = (target, method, samples) => {
			const orig = target[method]
			const bound = orig.bind(target)
			target[method] = (...args) => {
				const start = performance.now()
				const result = bound(...args)
				samples.push(performance.now() - start)
				return result
			}
			patches.push(() => {
				target[method] = orig
			})
		}
		if (opt.profile && w?.ready) {
			// WASM seam: whole-step cost (quanta + sync) as physics;
			// the lightmap fanout is _syncWasmTransforms minus the step, paired
			// per frame below (single-threaded, one step per sync, same order;
			// the lengths are asserted equal before pairing — see the jank block).
			if (patchable(w, 'step')) timeInto(w, 'step', physicsMs)
			if (patchable(v, '_syncWasmTransforms')) timeInto(v, '_syncWasmTransforms', animMs)
			if (patchable(w.engine, 'stepFrame')) timeInto(w.engine, 'stepFrame', engineMs)
		}
		if (opt.breakdown && w?.ready) {
			// Core-loop decomposition: per-phase scene-sync timings through
			// the optional syncAll sink. w.sync is a TS-private reach-through, same class as
			// v._syncWasmTransforms above — the bench is a white-box profiler.
			const syncTarget = w.sync
			if (patchable(syncTarget, 'syncAll')) {
				const origSyncAll = syncTarget.syncAll
				const boundSyncAll = origSyncAll.bind(syncTarget)
				syncTarget.syncAll = (...args) => {
					const phases = { balls: 0, movers: 0, lights: 0, prims: 0, flashers: 0 }
					const result = boundSyncAll(...args, phases) ?? {}
					// Applied-row counts ride in the same row: cost per phase
					// only means something next to how many rows applied.
					breakdownRows.push({
						ms: phases,
						applied: {
							balls: result.ballsMoved ?? 0,
							movers: result.movers ?? 0,
							lights: result.lights ?? 0,
							prims: result.prims ?? 0,
							flashers: result.flashers ?? 0,
						},
					})
					return result
				}
				patches.push(() => {
					syncTarget.syncAll = origSyncAll
				})
			}
		}

		// Render totals: the TSL composer re-enters renderer.render per
		// interior pass (quads, bloom mips), so per-entry timings nest and
		// must not be summed. Count every entry for calls/frame breadth; the
		// per-frame total comes from the once-per-frame pipeline.render call,
		// which also covers composer-graph overhead outside renderer.render.
		if (opt.profile && patchable(r, 'render')) {
			const origRender = r.render
			const boundRender = origRender.bind(r)
			r.render = (...a) => {
				renderCalls++
				return boundRender(...a)
			}
			patches.push(() => {
				r.render = origRender
			})
		}
		// The viewer dirty-gates presents (idle frames skip render), so these
		// totals cover presented frames only — exactly the frames that cost.
		if (opt.profile && v?.renderPipeline && patchable(v.renderPipeline, 'render'))
			timeInto(v.renderPipeline, 'render', renderFrameMs)

		let actorTimer = null
		if (opt.interactive && w?.ready) {
			let cycle = 0
			actorTimer = setInterval(() => {
				cycle++
				const left = cycle % 2 === 1
				const code = left ? 'ShiftLeft' : 'ShiftRight'
				if (sendKey(code, true)) flipsCount++
				setTimeout(() => sendKey(code, false), 160)
				if (cycle % 4 === 0) {
					try {
						doNudge(45, 1.8)
					} catch {
						// Expected: TypeError if physics not ready mid-profiling — nudge is best-effort, profiling continues.
					}
				}
			}, 500)
		}

		await new Promise(resolve => {
			const id = setInterval(() => {
				// Timestamped heap samples: correlated with jank frames below
				// to separate GC pauses (heap drops across the spike) from
				// slow work (heap flat, one phase spiked).
				if (opt.breakdown && performance.memory)
					heapSamples.push({
						t: Math.round(performance.now() - start),
						mb: Math.round(performance.memory.usedJSHeapSize / 1048576),
					})
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
					// frameEndMs[i] always matches frameMs[i]: same tick,
					// same shift below — end minus length is the frame start.
					frameEndMs.push(now - start)
					last = now
					requestAnimationFrame(raf)
				}
			}
			requestAnimationFrame(raf)
		})
		const elapsed = performance.now() - start
		frameMs.shift()
		frameEndMs.shift()
		// Restore every patched method: sampling stops here, arrays stay bounded.
		for (const restore of patches) restore()
		// animMs (whole _syncWasmTransforms) contains physicsMs (whole step):
		// pair per frame and subtract for the lightmap-fanout-only cost.
		// Single-threaded, one step per sync, same order — pair by index.
		const fanoutPairs = Math.min(animMs.length, physicsMs.length)
		const fanoutMs = []
		for (let i = 0; i < fanoutPairs; i++) fanoutMs.push(Math.max(0, animMs[i] - physicsMs[i]))
		// Breakdown: decompose each step into bridge engine time, five sync
		// phases, and the residual step overhead (buffer views +
		// light-name mapping). All arrays push once per step in call order —
		// pair by index, but only over pools that actually sampled: a missing
		// wrap (no stepFrame) must shrink n, never zero it.
		// Steps pair with rAF frames only while counts agree; when they
		// diverge the jank rows are marked approximate.
		let breakdown = null
		if (opt.breakdown && breakdownRows.length) {
			const pools = [physicsMs, breakdownRows]
			if (engineMs.length) pools.push(engineMs)
			const n = Math.min(...pools.map(a => a.length))
			const rows = breakdownRows.slice(0, n)
			const phase = key => rows.map(r => r.ms[key])
			const residualMs = []
			let clipped = 0
			for (let i = 0; i < n; i++) {
				const m = rows[i].ms
				const syncTotal = m.balls + m.movers + m.lights + m.prims + m.flashers
				const raw = physicsMs[i] - (engineMs[i] ?? 0) - syncTotal
				if (raw < 0) clipped++
				residualMs.push(Math.max(0, raw))
			}
			const applied = key => rows.map(r => r.applied[key])
			const approxSteps = Math.abs(physicsMs.length - frameMs.length) / Math.max(1, frameMs.length) > 0.1
			// Jank attribution: for the longest frames, take the step at the
			// same index (one step call per rAF, same order) and bracket the
			// frame with timestamped heap samples. A multi-MB heap drop
			// across the spike reads as a GC pause (heap only falls on
			// collection); a flat heap with one hot phase reads as slow work.
			// Heap polls every 30ms, so the bracket is ±1 sample, not exact.
			const worst = frameMs
				.map((ms, i) => ({ ms, i }))
				.sort((a, b) => b.ms - a.ms)
				.slice(0, 5)
			const heapAt = (t, dir) => {
				if (dir > 0) {
					for (const s of heapSamples) if (s.t >= t) return s
					return null
				}
				let best = null
				for (const s of heapSamples) {
					if (s.t <= t) best = s
					else break
				}
				return best
			}
			const jank = worst.map(({ ms, i }) => {
				const end = frameEndMs[i]
				const before = heapAt(end - ms, -1)
				const after = heapAt(end, 1)
				const k = Math.min(i, n - 1)
				const m = rows[k]?.ms
				return {
					frameMs: +ms.toFixed(2),
					heapDeltaMb: before && after ? after.mb - before.mb : null,
					engineMs: engineMs[k] != null ? +engineMs[k].toFixed(2) : null,
					syncMs: m ? +(m.balls + m.movers + m.lights + m.prims + m.flashers).toFixed(2) : null,
					stepIndexApproximate: approxSteps,
				}
			})
			breakdown = {
				steps: n,
				engine: stats(engineMs.slice(0, n)),
				balls: stats(phase('balls')),
				movers: stats(phase('movers')),
				lights: stats(phase('lights')),
				prims: stats(phase('prims')),
				flashers: stats(phase('flashers')),
				stepOverhead: stats(residualMs),
				stepOverheadClipped: clipped,
				renderCallsPerFrame: renderFrameMs.length ? +(renderCalls / renderFrameMs.length).toFixed(1) : null,
				applied: {
					balls: stats(applied('balls')),
					movers: stats(applied('movers')),
					lights: stats(applied('lights')),
					prims: stats(applied('prims')),
					flashers: stats(applied('flashers')),
				},
				heapStartMb: heapSamples.length ? heapSamples[0].mb : null,
				heapEndMb: heapSamples.length ? heapSamples[heapSamples.length - 1].mb : null,
				jank,
			}
		}

		function stats(arr) {
			if (!arr.length) return null
			const s = [...arr].sort((a, b) => a - b)
			return {
				avg: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(2),
				p50: +s[Math.floor(s.length * 0.5)].toFixed(2),
				p95: +s[Math.floor(s.length * 0.95)].toFixed(2),
				p99: +s[Math.floor(s.length * 0.99)].toFixed(2),
				min: +s[0].toFixed(2),
				max: +s[s.length - 1].toFixed(2),
				count: arr.length,
			}
		}

		let tris = 0
		let visibleMeshes = 0
		try {
			v?.tableGroup?.traverse(o => {
				if (o.isMesh && o.geometry?.attributes?.position) {
					tris += o.geometry.attributes.position.count / 3
					if (o.visible) {
						let hidden = false
						for (let p = o.parent; p; p = p.parent) {
							if (!p.visible) {
								hidden = true
								break
							}
							if (p === v.tableGroup) break
						}
						if (!hidden) visibleMeshes++
					}
				}
			})
		} catch {
			// Expected: TypeError if tableGroup not mounted or geometry missing — tris remains 0, not fatal.
		}
		const endFrame = r?.info?.render?.frame ?? 0
		const delta = endFrame - startFrame
		if (!renderCalls && delta) renderCalls = delta
		// fpsRender is composer-entry rate (calls/sec), not frames/sec: the
		// TSL composer re-enters renderer.render per interior pass, so only
		// fpsRaf reads as true frames per second.
		const fpsRender = renderCalls ? Math.round((renderCalls * 1000) / elapsed) : null
		const fpsRaf = frameMs.length ? Math.round((frameMs.length * 1000) / elapsed) : null

		play.flippers.flipsCount = flipsCount
		play.ballsInPlay = ballCount()

		return {
			play,
			performance: {
				durationMs: Math.round(elapsed),
				fps: fpsRaf ?? fpsRender,
				fpsRender,
				fpsRaf,
				visibleMeshes,
				tris: Math.round(tris),
				jankFrames: frameMs.filter(f => f > 33.3).length,
				heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
				frameStats: stats(frameMs),
				physicsStats: stats(physicsMs),
				animStats: stats(fanoutMs),
				engineStats: stats(engineMs),
				renderFrameStats: stats(renderFrameMs),
				streamOverlapped: !streamSettledAtProfileStart,
				breakdown,
			},
		}
	},
	{ duration, warmup, interactive, profile, breakdown, streamSettled },
)

const parsed = {}
const logPatterns = [
	[
		/Parsed in (\d+)ms/,
		match => {
			parsed.parseMs = Number(match[1])
		},
	],
	[
		/Scene generated in (\d+)ms/,
		match => {
			parsed.sceneGenMs = Number(match[1])
		},
	],
	[
		/Textures in scene:\s*(\d+)\s*~([\d.]+)\s*MB/,
		match => {
			parsed.texScene = { count: Number(match[1]), mb: Number(match[2]) }
		},
	],
	[
		/Fetched .* in ([\d.]+)s/,
		match => {
			parsed.fetchMs = Math.round(Number(match[1]) * 1000)
		},
	],
	[
		/\[stream\] Done .* in (\d+)ms/,
		match => {
			parsed.streamLogMs = Number(match[1])
		},
	],
	[
		/Pre-loading .* (\d+) textures/,
		match => {
			parsed.streamTextures = Number(match[1])
		},
	],
	[
		/\[IDB\] hit/,
		() => {
			parsed.idbHit = true
		},
	],
]
for (const line of logs) {
	for (const [pattern, apply] of logPatterns) {
		const match = line.match(pattern)
		if (match) apply(match)
	}
}

// try to get streaming final mem
const streamMem = await page
	.evaluate(() => {
		try {
			return performance.memory
				? {
						used: Math.round(performance.memory.usedJSHeapSize / 1048576),
						total: Math.round(performance.memory.totalJSHeapSize / 1048576),
					}
				: null
		} catch {
			// Expected: ReferenceError if performance.memory unavailable (non-Chrome) or TypeError if memory API blocked — heap info optional.
			return null
		}
	})
	.catch(() => {
		// Expected: page.evaluate fails if execution context destroyed (navigation) — treat as no memory.
		return null
	})

const metricsAfterPlay = await safeMetrics()

// stop tracing if started; Tracing.start used ReturnAsStream, so drain the
// stream from Tracing.tracingComplete into the trace file.
if (tracingClient) {
	try {
		const completed = new Promise(resolve => tracingClient.once('Tracing.tracingComplete', resolve))
		await tracingClient.send('Tracing.end')
		const { stream } = await completed
		let data = ''
		let eof = false
		while (!eof) {
			const chunk = await tracingClient.send('IO.read', { handle: stream, size: 1_048_576 })
			data += Buffer.from(chunk.data ?? '', 'base64').toString('utf8')
			eof = chunk.eof
		}
		await tracingClient.send('IO.close', { handle: stream }).catch(() => {})
		fs.writeFileSync(tracePath, data)
		console.log(`[bench] tracing ended -> ${tracePath}`)
	} catch (error) {
		console.warn(`[bench] tracing end failed: ${error.message}`)
	}
}

const payload = {
	url,
	vpx: vpxArg ?? autoVpx ?? DEFAULT_EMPTY,
	rom: romArg ?? (url.includes('rom=') ? decodeURIComponent(url.match(/rom=([^&]+)/)?.[1] ?? '') : null),
	loadJourney: {
		navMs,
		readyMs,
		readyHeap,
		parseMs: parsed.parseMs ?? null,
		sceneGenMs: parsed.sceneGenMs ?? null,
		fetchMs: parsed.fetchMs ?? null,
		streamMs,
		streamLogMs: parsed.streamLogMs ?? null,
		streamDone,
		totalLoadMs,
		textures: parsed.texScene ?? null,
		texMemAfterStream: streamMem ? { heapUsed: streamMem.used, heapTotal: streamMem.total } : null,
		idbHit: !!parsed.idbHit,
		emu: {
			hasEmu: loadState?.hasEmu ?? false,
			running: loadState?.emuRunning ?? false,
			mock: loadState?.emuMock ?? false,
			gameName: loadState?.gameName ?? null,
		},
		isolation: loadState?.isolation ?? null,
		userTiming,
		perfEntries,
	},
	playJourney: journeyResult.play,
	performance: journeyResult.performance,
	glInfo: loadState?.gl ?? null,
	metrics: {
		tris: loadState?.tris ?? 0,
		meshes: loadState?.meshes ?? 0,
		visibleMeshes: loadState?.visibleMeshes ?? 0,
		triangles: loadState?.triangles ?? 0,
		programs: loadState?.programs ?? null,
		memory: loadState?.memory ?? null,
	},
	timing: loadState?.timing ?? null,
	at: new Date().toISOString(),
	meta: {
		trace: tracePath,
		metricsBefore,
		metricsAfterLoad,
		metricsAfterPlay,
	},
}

if (outPath) {
	fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
	console.log(`[bench] wrote ${outPath}`)
}
console.log(`\n[bench] === BENCHMARK REPORT ===`)
console.log(JSON.stringify(payload, null, 2))

// === ANALYSIS & SUGGESTIONS ===
function fmt(n) {
	return typeof n === 'number' ? `${n}ms` : String(n)
}
console.log(`\n[bench] === ANALYSIS & SUGGESTIONS ===`)
{
	const lj = payload.loadJourney
	const pf = payload.performance
	if (breakdown && !pf.breakdown)
		console.warn('[bench] breakdown requested but no phase data sampled (syncAll sink not installed?)')
	console.log(
		`Load: ready ${fmt(lj.readyMs)} (nav ${fmt(lj.navMs)} fetch ${fmt(lj.fetchMs)} parse ${fmt(lj.parseMs)} scene ${fmt(lj.sceneGenMs)}) + stream ${fmt(lj.streamMs)} (log ${fmt(lj.streamLogMs)}) = total ${fmt(lj.totalLoadMs)} heapReady ${lj.readyHeap}MB streamDone=${lj.streamDone}`,
	)
	console.log(
		`GPU: ${payload.glInfo?.renderer ?? '?'} vendor ${payload.glInfo?.vendor ?? '?'} :: ${JSON.stringify(payload.glInfo?.params ?? {})}`,
	)
	console.log(
		`Scene: ${payload.metrics.tris} tris ${payload.metrics.meshes} meshes ~${payload.metrics.visibleMeshes} visible (upper-bound draws) textures=${lj.textures?.count ?? '?'} ~${lj.textures?.mb ?? '?'}MB`,
	)
	console.log(
		`Play: fps ${pf.fps} (composer calls/s ${pf.fpsRender} raf ${pf.fpsRaf}) jank ${pf.jankFrames} heap ${pf.heapMb}MB duration ${pf.durationMs}ms`,
	)
	if (pf.frameStats)
		console.log(
			`  frame avg ${pf.frameStats.avg}ms p95 ${pf.frameStats.p95} p99 ${pf.frameStats.p99} min ${pf.frameStats.min} max ${pf.frameStats.max}`,
		)
	if (pf.physicsStats)
		console.log(`  physics avg ${pf.physicsStats.avg}ms p95 ${pf.physicsStats.p95} max ${pf.physicsStats.max}`)
	if (pf.animStats) console.log(`  anim avg ${pf.animStats.avg}ms p95 ${pf.animStats.p95} max ${pf.animStats.max}`)
	if (pf.renderFrameStats)
		console.log(
			`  render/frame total avg ${pf.renderFrameStats.avg}ms p95 ${pf.renderFrameStats.p95} max ${pf.renderFrameStats.max} calls/frame ~${pf.breakdown?.renderCallsPerFrame ?? pf.fpsRender}`,
		)
	if (pf.breakdown) {
		const b = pf.breakdown
		const row = s => (s ? `avg ${s.avg}ms p95 ${s.p95} max ${s.max}` : 'n/a')
		console.log(`  step split (${b.steps} steps; residual overhead after engine + phases):`)
		console.log(`    engine ${row(pf.engineStats)} | overhead ${row(b.stepOverhead)}${b.stepOverheadClipped ? ` (clipped ${b.stepOverheadClipped})` : ''}`)
		console.log(
			`    balls ${row(b.balls)} | movers ${row(b.movers)} | lights ${row(b.lights)} | prims ${row(b.prims)} | flashers ${row(b.flashers)}`,
		)
		if (b.applied) {
			const a = b.applied
			const avg = s => (s ? s.avg : '?')
			console.log(
				`    applied rows/step: balls ${avg(a.balls)} movers ${avg(a.movers)} lights ${avg(a.lights)} prims ${avg(a.prims)} flashers ${avg(a.flashers)}`,
			)
		}
		if (b.heapStartMb != null) console.log(`    heap ${b.heapStartMb}MB -> ${b.heapEndMb}MB during profile`)
		if (b.jank?.length) {
			console.log(`    worst frames (frame | heapΔ | engine | sync):`)
			for (const j of b.jank)
				console.log(
					`      ${j.frameMs}ms | ${j.heapDeltaMb ?? '?'}MB | ${j.engineMs ?? '?'}ms | ${j.syncMs ?? '?'}ms${j.stepIndexApproximate ? ' ~approx' : ''}`,
				)
		}
	}
	if (lj.streamLogMs && lj.streamLogMs > 5000) {
		console.log(
			`- STREAMING BOTTLENECK: ${lj.streamMs}ms for ~${payload.metrics.meshes} meshes. LDR decodes already run worker-first with an IDB bitmap cache, so the remainder is upload + bake, not decode.`,
		)
		console.log(
			`  Suggestion: defer large bakes >1M px (still ${lj.textures?.mb ?? '?'}MB), stream playfield+inserts first and lazy-load cab/VR after play start, yield between uploads via scheduler.yield().`,
		)
	}
	if (lj.parseMs && lj.parseMs > 800) {
		console.log(
			`- PARSE: ${lj.parseMs}ms. LZW decompression on main thread per texture, OLE reads via copyFromBrowser still copies Uint8Array.`,
		)
		console.log(
			`  Suggestion: increase GameItems concurrency 4->8, use streaming OLE parser, skip invisible items already optional, parallelize Texture LZW via Workers, zero-copy where possible (avoid subarray copies in ole-doc).`,
		)
	}
	if (lj.sceneGenMs && lj.sceneGenMs > 800) {
		console.log(
			`- SCENE GEN: ${lj.sceneGenMs}ms for ${payload.metrics.tris} tris. ThreeMeshGenerator creates BufferGeometry per mesh synchronously, postProcess traverses scene multiple times.`,
		)
		console.log(
			`  Suggestion: generate meshes in workers (via Comlink), batchStaticOpaques only 1 BatchedMesh currently—extend to all opaques, instance rubbers/primitives, dispose hidden geometries earlier (postProcess hides lightmaps but keeps geometry).`,
		)
	}
	if (pf.fps && pf.fps < 50) {
		console.log(
			`- FPS: ${pf.fps} (target 60) — SwiftShader (${payload.glInfo?.renderer?.includes('SwiftShader') || payload.glInfo?.renderer?.includes('WebKit')}) + ${payload.metrics.tris} tris + ${lj.textures?.mb ?? '?'}MB textures + per-frame updateAnimations for all animatables + popStates diff + applyChangedStates matrix decomposes.`,
		)
		console.log(
			`  Suggestion: ensure GPU acceleration (--gpu=vulkan or --gpu=gl) not SwiftShader, reduce texture resolution, lower DPR to 1 in play mode already done, batch / instance more, stepping is one stepFrame per rAF already so physics can only shrink per step, not per loop.`,
		)
	}
	if (payload.metrics.memory?.used && payload.metrics.memory.used > 1200) {
		const vpxMb =
			payload.vpx && fs.existsSync(payload.vpx) ? (fs.statSync(payload.vpx).size / 1048576).toFixed(1) : '?'
		const romMb =
			payload.rom && fs.existsSync(payload.rom) ? (fs.statSync(payload.rom).size / 1048576).toFixed(1) : '?'
		console.log(
			`- MEMORY: heap ${payload.metrics.memory.used}MB / ${payload.metrics.memory.limit}MB — ${vpxMb}MB VPX + ${romMb}MB ROM + ${lj.textures?.mb ?? '?'}MB GPU textures + retained Uint8Arrays before _clearRawTextures.`,
		)
		console.log(
			`  Suggestion: eagerly clear raw binaries already done but heap still high -> dispose hidden geometries, limit concurrency to 4, call gc() after stream, consider texture compression (KTX2/Basis) to halve GPU memory.`,
		)
	}
	if (lj.idbHit === false && lj.fetchMs > 300) {
		console.log(
			`- FETCH: ${lj.fetchMs}ms for ${fs.existsSync(payload.vpx) ? (fs.statSync(payload.vpx).size / 1024 / 1024).toFixed(1) : '?'}MB over /@fs — Vite serves via fs allow, no HTTP cache. With a warm IDB bitmap cache, repeat texture loads skip decode.`,
		)
	}
	console.log(
		`- BENCH COVERAGE: Load (fetch/parse/scene/stream) + Play (coin/start/plunge/flipper/nudge + physics/anim/render fps) measured. Re-run with --duration 5000 --warmup 2000 for stable FPS, compare --low vs --high quality, add --breakdown for the per-phase step split, and with --trace to capture chrome trace at ${tracePath ?? 'trace-*.json'}.`,
	)
}
if (tracePath) console.log(`[bench] trace at ${tracePath} — open in chrome://tracing or about://tracing`)
}
} catch (error) {
	exitCode = 1
	console.error('[bench] failed:', error?.message ?? error)
} finally {
	try {
		await browser.close()
	} catch {}
	try {
		await vite.close()
	} catch {}
	process.exit(exitCode)
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const balls = Number(getArg(args, 'balls', '-1'))
const duration = Number(getArg(args, 'duration', '3000'))
const warmup = Number(getArg(args, 'warmup', url.includes('walking_dead') ? '2000' : '800'))
const outPath = getArg(args, 'out', null)
const profile = hasFlag(args, 'profile') || hasFlag(args, 'breakdown') || !hasFlag(args, 'no-profile')
const interactive = !hasFlag(args, 'no-interact') && !hasFlag(args, 'passive')
const headed = hasFlag(args, 'headed')
const gpu = getArg(args, 'gpu', hasFlag(args, 'gpu') ? 'vulkan' : null)

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
			categories: 'devtools.timeline,blink.user_timing,loading,cc,rail,gpu',
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
		const txt = document.getElementById('log')?.innerText ?? ''
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
	try {
		v.tableGroup?.traverse(o => {
			if (o.isMesh && o.geometry?.attributes?.position) {
				tris += o.geometry.attributes.position.count / 3
				meshes++
			}
		})
	} catch {
		// Expected: TypeError if tableGroup not yet mounted.
	}
	const info = v.renderer?.info?.render ?? {}
	const prog = v.renderer?.info?.programs ?? null
	const emu = v.player?.getPhysics()?.emu

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
		draws: info.calls ?? 0,
		triangles: info.triangles ?? 0,
		programs: prog?.length ?? null,
		balls: v.player?.balls?.length ?? 0,
		hasEmu: !!emu,
		emuRunning: emu ? (emu.isMock ? true : emu.api?.isRunning?.() === 1) : false,
		emuMock: !!emu?.isMock,
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
				// Expected: TypeError if getPhysics is undefined (player not ready) or Error if nudge called before emu start — interactive test is best-effort.
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
		} catch {
			// Expected: TypeError if renderer info not initialised (e.g., before first frame) — frame delta is optional.
		}

		const timeInto = (target, method, samples) => {
			const orig = target[method].bind(target)
			target[method] = (...args) => {
				const start = performance.now()
				const result = orig(...args)
				samples.push(performance.now() - start)
				return result
			}
		}
		if (opt.profile && p) {
			timeInto(p, 'updatePhysics', physicsMs)
			timeInto(p, 'updateAnimations', animMs)
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
				const left = cycle % 2 === 1
				const code = left ? 'ShiftLeft' : 'ShiftRight'
				const loc = left ? 1 : 2
				p.onKeyDown({ code, key: 'Shift', ts: now, location: loc })
				setTimeout(() => p.onKeyUp({ code, key: 'Shift', ts: Date.now(), location: loc }), 160)
				flipsCount++
				if (cycle % 4 === 0) {
					try {
						p.nudge(45, 1.8)
					} catch {
						// Expected: TypeError if physics not ready mid-profiling — nudge is best-effort, profiling continues.
					}
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
		} catch {
			// Expected: TypeError if tableGroup not mounted or geometry missing — tris remains 0, not fatal.
		}
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
		/Table script transpiled and executed in (\d+)ms/,
		match => {
			parsed.transpileMs = Number(match[1])
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
		transpileMs: parsed.transpileMs ?? null,
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
		draws: loadState?.draws ?? 0,
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
	console.log(
		`Load: ready ${fmt(lj.readyMs)} (nav ${fmt(lj.navMs)} fetch ${fmt(lj.fetchMs)} parse ${fmt(lj.parseMs)} scene ${fmt(lj.sceneGenMs)} transpile ${fmt(lj.transpileMs)}) + stream ${fmt(lj.streamMs)} (log ${fmt(lj.streamLogMs)}) = total ${fmt(lj.totalLoadMs)} heapReady ${lj.readyHeap}MB streamDone=${lj.streamDone}`,
	)
	console.log(
		`GPU: ${payload.glInfo?.renderer ?? '?'} vendor ${payload.glInfo?.vendor ?? '?'} :: ${JSON.stringify(payload.glInfo?.params ?? {})}`,
	)
	console.log(
		`Scene: ${payload.metrics.tris} tris ${payload.metrics.meshes} meshes ${payload.metrics.draws} draws programs=${payload.metrics.programs} textures=${lj.textures?.count ?? '?'} ~${lj.textures?.mb ?? '?'}MB`,
	)
	console.log(
		`Play: fps ${pf.fps} (render ${pf.fpsRender} raf ${pf.fpsRaf}) jank ${pf.jankFrames} heap ${pf.heapMb}MB duration ${pf.durationMs}ms`,
	)
	if (pf.frameStats)
		console.log(
			`  frame avg ${pf.frameStats.avg}ms p95 ${pf.frameStats.p95} p99 ${pf.frameStats.p99} min ${pf.frameStats.min} max ${pf.frameStats.max}`,
		)
	if (pf.physicsStats)
		console.log(`  physics avg ${pf.physicsStats.avg}ms p95 ${pf.physicsStats.p95} max ${pf.physicsStats.max}`)
	if (pf.animStats) console.log(`  anim avg ${pf.animStats.avg}ms p95 ${pf.animStats.p95} max ${pf.animStats.max}`)
	if (pf.renderStats)
		console.log(
			`  render avg ${pf.renderStats.avg}ms p95 ${pf.renderStats.p95} max ${pf.renderStats.max} draws ${pf.draws} tris ${pf.tris}`,
		)
	if (lj.streamLogMs && lj.streamLogMs > 5000) {
		console.log(
			`- STREAMING BOTTLENECK: ${lj.streamMs}ms for ~${payload.metrics.meshes} meshes. Decodes on main thread with concurrency 16, EXR/HDR worker timeouts, no Worker ImageDecoder, IDB cache broken (deleteObjectStore without exists check).`,
		)
		console.log(
			`  Suggestion: defer large bakes >1M px, cap effectiveMax to 1024 for VLM/nestmap already but still ${lj.textures?.mb ?? '?'}MB; reduce concurrency to 4, yield via scheduler.yield(), use OffscreenCanvas/ImageDecoder in workers, fix IDB (exist check), stream only playfield+inserts first, lazy-load cab/VR after play start, cache decoded textures via createImageBitmap cache + idbSet(texCacheKey).`,
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
	if (lj.transpileMs && lj.transpileMs > 1500) {
		console.log(
			`- TRANSPILATION: ${lj.transpileMs}ms — VBScript -> JS via escodegen pipeline (8 transformers) on worker but still blocks ready -> play transition.`,
		)
		console.log(
			`  Suggestion: cache transpiled JS in IDB via vbsCacheKey, pre-compile server-side, or reuse worker pool warm-up (currently creates new worker per load).`,
		)
	}
	if (pf.fps && pf.fps < 50) {
		console.log(
			`- FPS: ${pf.fps} (target 60) — SwiftShader (${payload.glInfo?.renderer?.includes('SwiftShader') || payload.glInfo?.renderer?.includes('WebKit')}) + ${payload.metrics.tris} tris + ${lj.textures?.mb ?? '?'}MB textures + per-frame updateAnimations for all animatables + popStates diff + applyChangedStates matrix decomposes.`,
		)
		console.log(
			`  Suggestion: ensure GPU acceleration (--gpu=vulkan or --gpu=gl) not SwiftShader, reduce texture resolution (effectiveMax already 1024 for VLM but still high), lower DPR to 1 in play mode already done, throttle controls.update, batch / instance more, frustum cull (three-mesh-bvh already installed but buildBvhIdle idle—make eager), avoid full state sync every 300 frames (frameCount%300), use CSS nudge transform not mesh translate, separate physicsLoop (setTimeout 16ms) and renderLoop (rAF) already decoupled but both still on main thread.`,
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
			`- FETCH: ${lj.fetchMs}ms for ${fs.existsSync(payload.vpx) ? (fs.statSync(payload.vpx).size / 1024 / 1024).toFixed(1) : '?'}MB over /@fs — Vite serves via fs allow, no HTTP cache. After IDB fix, subsequent loads should be <100ms.`,
		)
	}
	console.log(
		`- BENCH COVERAGE: Load (fetch/parse/scene/transpile/stream) + Play (coin/start/plunge/flipper/nudge + physics/anim/render fps) measured. Re-run with --duration 5000 --warmup 2000 for stable FPS, compare --low vs --high quality, and with --trace to capture chrome trace at ${tracePath ?? 'trace-*.json'}.`,
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
		vite?.kill()
	} catch {}
	process.exit(exitCode)
}

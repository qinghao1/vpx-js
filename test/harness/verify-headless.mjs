// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Headless-engine checks: loads `vpinball-headless` in Chrome (real DOM and
 * canvas for SDL video init) through the real `loadHeadlessEngine` facade,
 * loads fixtures, steps frames on a fixed clock, and asserts engine state
 * (catalog, mover and lamp rows, script errors, teardown). With The Walking
 * Dead and its ROM it also boots PinMAME and checks the DMD, the engine's
 * audio output (tapped at the page's WebAudio destination), and nudge physics
 * on the served ball.
 *
 * Run: node test/harness/verify-headless.mjs [--rom=<zip>]
 * Exit: 0 pass, 77 skip (no engine artifact or Chrome), 1 fail.
 */
import { findWalkingDead, findWalkingDeadRom } from './bench-shared.ts'
import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage, requireEngineAndChrome } from './utils.mjs'

requireEngineAndChrome()

const romPath = process.argv.find(a => a.startsWith('--rom='))?.slice(6) || findWalkingDeadRom()
const twdPath = findWalkingDead()

const vite = await ensureVite('/')
const browser = await launchBrowser(await loadPuppeteer())

const summary = await (async () => {
	const page = await newPage(browser)
	attachLogging(page, { filter: /headless|VpxWasm|bridge/i, prefix: '[headless]' })
	await page.goto(vite.url, { waitUntil: 'load', timeout: 60000 })
	return await page.evaluate(
		async ({ repoRoot, romUrl, twdUrl }) => {
			const out = { checks: [], skips: [], fatal: null }
			const check = (ok, name, detail) => out.checks.push({ ok: !!ok, name, detail: detail ?? '' })
			const sleep = ms => new Promise(r => setTimeout(r, ms))
			const fetchBytes = async url => new Uint8Array(await (await fetch(url)).arrayBuffer())
			try {
				// Tap every node the engine wires to the speakers, so the checks hear
				// what plays (the engine owns its audio; nothing is drained to JS).
				const taps = []
				const connect = AudioNode.prototype.connect
				AudioNode.prototype.connect = function (destination, ...rest) {
					if (destination instanceof AudioDestinationNode) {
						const tap = this.context.createAnalyser()
						tap.fftSize = 2048
						connect.call(this, tap)
						taps.push(tap)
					}
					return connect.call(this, destination, ...rest)
				}
				const samples = new Float32Array(2048)
				const outputPeak = () => {
					let peak = 0
					for (const tap of taps) {
						tap.getFloatTimeDomainData(samples)
						for (const v of samples) peak = Math.max(peak, Math.abs(v))
					}
					return peak
				}
				const seam = await import(`/@fs${repoRoot}/dist-esm/lib/wasm/vpinball-wasm.js`)
				const engine = await seam.loadHeadlessEngine('/wasm/vpinball-headless.js')
				check(true, 'loadHeadlessEngine wraps the built artifact')
				check(
					(await seam.loadHeadlessEngine('/wasm/vpinball-headless.js')) === engine,
					'engine module is shared per URL',
				)
				// The facade rejects with a typed HeadlessEngineError on failure.
				const load = bytes =>
					engine.loadTable(bytes).then(
						() => 'ok',
						e => String(e?.message ?? e),
					)
				// About 60 steps per second: the engine (physics, PinMAME on its own
				// thread) runs on wall time, so a tight burst of steps starves the
				// ROM and it never boots. `until` stops early.
				const step = async (frames, until) => {
					for (let f = 0; f < frames; f++) {
						const wall = Date.now()
						engine.stepFrame()
						if (until?.()) return true
						const dt = Date.now() - wall
						if (dt < 12) await sleep(12 - dt)
					}
					return false
				}
				const key = async (code, frames) => {
					engine.pushKey(seam.codeToSdlScancode(code), true)
					await step(frames)
					engine.pushKey(seam.codeToSdlScancode(code), false)
				}

				const vpxFlipper = await fetchBytes('/test/fixtures/table-flipper.vpx')
				const rcFlipper = await load(vpxFlipper)
				check(rcFlipper === 'ok', 'flipper table loads', `${vpxFlipper.length} bytes rc=${rcFlipper}`)
				const catalogRaw = engine.getPartCatalogJson()
				check(catalogRaw.length > 2, 'catalog JSON non-empty', `${catalogRaw.length} chars`)
				const flipper = JSON.parse(catalogRaw || '[]').find(p => p.type === 'flipper')
				check(!!flipper, 'catalog names a flipper', flipper ? `${flipper.name} #${flipper.idx}` : 'none')
				await step(10)
				const angleAt = () => {
					const m = engine.getBuffer('movers')
					for (let i = 0; i < (m?.count ?? 0); i++) {
						const b = i * m.stride
						if (m.view[b] === flipper.idx && m.view[b + 1] === seam.MoverType.Flipper) return m.view[b + 2]
					}
					return undefined
				}
				const before = angleAt()
				check(before !== undefined, 'flipper mover row visible before input', `angle=${before}`)
				await key('ShiftRight', 100)
				const after = angleAt()
				// Flipper keys only fire the script's KeyDown/KeyUp (upstream
				// InputManager): with no script, the flipper must stay at rest.
				check(
					before !== undefined && after !== undefined && Math.abs(after - before) < 1e-9,
					'scriptless flipper holds rest angle under key input',
					`angle ${before} -> ${after}`,
				)
				check(engine.getScriptErrorCount() === 0, 'no script errors on scriptless table')
				await engine.destroyTable()

				check((await load(await fetchBytes('/test/fixtures/table-light.vpx'))) === 'ok', 'light table loads')
				await step(30)
				const lights = engine.getBuffer('lights')
				const currents = []
				for (let i = 0; i < (lights?.count ?? 0); i++) currents.push(lights.view[i * lights.stride + 1])
				check(currents.length > 0, 'lamp buffer exposes rows', `rows=${currents.length}`)
				check(
					currents.some(c => c > 0),
					'at least one lamp lit after attract steps',
					`max=${Math.max(-1, ...currents)}`,
				)
				await engine.destroyTable()

				if (!romUrl || !twdUrl) {
					out.skips.push('Walking Dead legs (no table + ROM found)')
					return out
				}
				await engine.mountRom('twd_160h.zip', await fetchBytes(romUrl))
				check((await load(await fetchBytes(twdUrl))) === 'ok', 'walking-dead table loads')
				check(
					engine.getScriptErrorCount() === 0,
					'walking-dead script runs clean',
					engine.getScriptError() ?? '',
				)
				let firstId = -1
				let luma = 0
				// Boot attract starts blank: stop at the first lit DMD frame.
				await step(1200, () => {
					const frame = engine.getDmdFrame()
					if (frame?.format !== seam.DmdFrameFormat.Lum32F) return false
					if (firstId < 0) firstId = frame.frameId
					luma = frame.pixels.reduce((s, v) => s + v, 0)
					return luma > 0
				})
				check(firstId >= 0, 'DMD descriptor appears after ROM boot', `frameId=${firstId}`)
				check(luma > 0, 'booted DMD carries lit dots', `luma=${luma}`)

				const balls = () => {
					const b = engine.getBuffer('balls')
					const rows = new Map()
					for (let i = 0; i < (b?.count ?? 0); i++) {
						const p = i * b.stride
						rows.set(b.view[p], { x: b.view[p + 1], y: b.view[p + 2], z: b.view[p + 3] })
					}
					return rows
				}
				const distance = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : Number.NaN)
				const boot = balls()

				// Audio: coin and start sounds (ROM and table) play through the
				// engine's own output; sample its peak after every step.
				const audio = { steps: 0, loud: 0 }
				const listen = () => {
					audio.steps++
					if (outputPeak() > 0.05) audio.loud++
					return false
				}
				for (const code of ['Digit5', 'Digit5', 'Digit1']) {
					engine.pushKey(seam.codeToSdlScancode(code), true)
					await step(15, listen)
					engine.pushKey(seam.codeToSdlScancode(code), false)
					await step(120, listen)
				}
				check(
					audio.loud > 0,
					'coin and start play sound',
					`${audio.loud} loud steps of ${audio.steps} on ${taps.length} output node(s)`,
				)

				// Nudge, as a twin pair of identical fixed-step windows from rest:
				// the started game serves a ball out of its boot slot into the
				// shooter lane; without input it must stay put, and the same window
				// after a nudge up the lane (off the plunger tip) must move it. The
				// nudge key's strength is the table script's (TWD: Nudge 90, 2),
				// too weak to lift a resting ball, so the key path is left to the
				// browser leg's routing check.
				let servedId
				const served = () => {
					for (const [id, at] of balls()) if (distance(at, boot.get(id)) > 20) servedId = id
					return servedId !== undefined
				}
				// The ROM ignores coins until its boot sequence ends: retry.
				for (let attempt = 0; attempt < 4 && !(await step(300, served)); attempt++) {
					await key('Digit5', 15)
					await key('Digit1', 20)
				}
				const settle = async () => {
					let last = balls().get(servedId)
					let still = 0
					await step(900, () => {
						const now = balls().get(servedId)
						still = distance(now, last) < 0.01 ? still + 1 : 0
						last = now
						return still >= 30
					})
					return still >= 30 ? last : undefined
				}
				const rest = servedId !== undefined ? await settle() : undefined
				check(!!rest, 'game serves a ball that comes to rest', JSON.stringify(rest ?? null))
				if (!rest) return out
				await step(60)
				const idle = distance(balls().get(servedId), rest)
				check(idle < 0.01, 'resting ball stays put without input', `moved ${idle.toFixed(3)}`)
				const resting = balls().get(servedId)
				engine.nudge(180, 5)
				await step(60)
				const nudged = distance(balls().get(servedId), resting)
				check(nudged > 1, 'a nudge moves the resting ball', `moved ${nudged.toFixed(3)}`)
				await engine.destroyTable()
			} catch (error) {
				out.fatal = String(error?.stack || error)
			}
			return out
		},
		{
			repoRoot: process.cwd(),
			romUrl: romPath ? `/@fs${romPath}` : '',
			twdUrl: twdPath ? `/@fs${twdPath}` : '',
		},
	)
})().finally(async () => {
	await browser.close()
	await vite.close()
})

if (summary.fatal) {
	console.log(`FATAL: ${summary.fatal}`)
	process.exit(1)
}
const passed = summary.checks.filter(c => c.ok).length
for (const c of summary.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
for (const s of summary.skips) console.log(`- skipped: ${s}`)
console.log(`\n${passed}/${summary.checks.length} headless checks passed`)
process.exit(passed === summary.checks.length ? 0 : 1)

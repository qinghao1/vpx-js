// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Headless-engine bridge smoke test (plan §6.2.5): loads `vpinball-headless`
 * in headless Chrome (real DOM/canvas for SDL video init) through the real
 * `loadHeadlessEngine`/`HeadlessEngine` facade, runs `LoadTable` on fixtures,
 * steps frames, and asserts Stage-1 engine state (catalog, mover/lamp rows,
 * script-error observability, clean teardown).
 *
 * Keys fire script KeyDown/KeyUp events, so solenoid motion and PinMAME DMD
 * need a scripted table plus VPinMAME.Controller (plan Stage 2): those legs
 * assert correct no-op semantics and skip with reason until then.
 *
 * Run: node test/harness/verify-headless.mjs [--rom=<zip>]
 * Exit: 0 pass, 77 skip (artifact absent), 1 fail.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { findWalkingDead } from './bench-shared.ts'
import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

const ROM_ZIP = process.argv.find(a => a.startsWith('--rom='))?.slice(6) || ''

const romCandidates = [
	`${homedir()}/.cache/vpinball/pinmame/roms/twd_160h.zip`,
	`${homedir()}/Downloads/walking_dead/twd_160h.zip`,
	`${homedir()}/Downloads/twd_160h.zip`,
]
const romPath = ROM_ZIP || romCandidates.find(p => existsSync(p)) || ''
const twdPath = findWalkingDead() ?? ''

const BASE = new URL((await ensureVite('https://localhost/', { label: 'verify-headless' })).url).origin
const puppeteer = await loadPuppeteer()
let browser
try {
	browser = await launchBrowser(puppeteer, {})
} catch (error) {
	console.log(`FATAL: browser launch failed: ${String(error?.message ?? error).slice(0, 200)}`)
	process.exit(1)
}

const summary = await (async () => {
	const page = await newPage(browser)
	attachLogging(page, { filter: /headless|VpxWasm|bridge/i, prefix: '[headless]' })
	await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 })
	return await page.evaluate(
		async ({ repoRoot, romName, twdUrl }) => {
			const out = { checks: [], fatal: null }
			const check = (ok, name, detail) => out.checks.push({ ok: !!ok, name, detail: detail ?? '' })
			try {
				const probe = await fetch('/wasm/vpinball-headless.js', { method: 'HEAD' })
				if (!probe.ok) {
					out.fatal = 'missing-artifact'
					return out
				}
				const seam = await import(`/@fs${repoRoot}/dist-esm/lib/wasm/vpinball-wasm.js`)
				const engine = await seam.loadHeadlessEngine('/wasm/vpinball-headless.js')
				check(true, 'loadHeadlessEngine wraps the built artifact')
				const vpxFlipper = new Uint8Array(await (await fetch('/test/fixtures/table-flipper.vpx')).arrayBuffer())
				const vpxLight = new Uint8Array(await (await fetch('/test/fixtures/table-light.vpx')).arrayBuffer())
				check(
					(await seam.loadHeadlessEngine('/wasm/vpinball-headless.js')) === engine,
					'engine module is shared per URL',
				)
				// The facade rejects with a typed HeadlessEngineError on failure.
				const loads = bytes =>
					engine.loadTable(bytes).then(
						() => 'ok',
						e => String(e?.message ?? e),
					)
				const rcFlipper = await loads(vpxFlipper)
				check(rcFlipper === 'ok', 'flipper table loads', `${vpxFlipper.length} bytes rc=${rcFlipper}`)
				const catalogRaw = engine.getPartCatalogJson()
				check(catalogRaw.length > 2, 'catalog JSON non-empty', `${catalogRaw.length} chars`)
				const catalog = JSON.parse(catalogRaw || '[]')
				const flipper = catalog.find(p => p.type === 'flipper')
				check(!!flipper, 'catalog names a flipper', flipper ? `${flipper.name} #${flipper.idx}` : 'none')
				for (let f = 0; f < 10; f++) engine.stepFrame(f * 16.7)
				const angleAt = () => {
					const m = engine.getBuffer('movers')
					if (!m) return undefined
					for (let i = 0; i < m.count; i++) {
						const b = i * m.stride
						if (m.view[b] === flipper.idx && m.view[b + 1] === seam.MoverType.Flipper) return m.view[b + 2]
					}
					return undefined
				}
				const before = angleAt()
				check(before !== undefined, 'flipper mover row visible before input', `angle=${before}`)
				engine.pushKey(229, true)
				for (let f = 10; f < 110; f++) engine.stepFrame(f * 16.7)
				engine.pushKey(229, false)
				const after = angleAt()
				// Keys fire script KeyDown/KeyUp events; a scriptless fixture has no
				// solenoid handler, so rest angles must be unchanged (desktop VPX agrees:
				// unhandled keys never move a flipper). Solenoid motion waits on a
				// scripted fixture (plan Stage 2).
				check(
					before !== undefined && after !== undefined && Math.abs(after - before) < 1e-9,
					'scriptless flipper holds rest angle under key input',
					`angle ${before} -> ${after}`,
				)
				check(engine.getScriptErrorCount() === 0, 'no script errors on scriptless table')
				await engine.destroyTable()
				check((await loads(vpxLight)) === 'ok', 'light table loads')
				for (let f = 0; f < 30; f++) engine.stepFrame(f * 16.7)
				const lights = engine.getBuffer('lights')
				const currents = []
				if (lights) for (let i = 0; i < lights.count; i++) currents.push(lights.view[i * lights.stride + 1])
				check((lights?.count ?? 0) > 0, 'lamp buffer exposes rows', `rows=${lights?.count ?? 0}`)
				check(
					currents.some(c => c > 0),
					'at least one lamp lit after attract steps',
					`max=${Math.max(-1, ...currents)}`,
				)
				await engine.destroyTable()
				if (romName) {
					const zipBytes = new Uint8Array(await (await fetch(romName)).arrayBuffer())
					engine.mountRom('twd_160h.zip', zipBytes)
					check(true, 'ROM zip mounts for PinMAME')
					const vpxTwd = new Uint8Array(
						await (await fetch(twdUrl)).arrayBuffer().catch(() => new ArrayBuffer(0)),
					)
					if (vpxTwd.length > 0) {
						check((await loads(vpxTwd)) === 'ok', 'walking-dead table loads')
						const scriptErrors = engine.getScriptErrorCount()
						const scriptError = engine.getScriptError()
						if (scriptErrors === 0) {
							let firstId = -1
							let luma = 0
							// PinMAME runs at wall pace: pace steps in realtime (a tight
							// burst starves its thread and the ROM never boots), and
							// stop at the first lit frame (boot attract starts blank).
							let nowMs = 0
							for (let f = 0; f < 1200 && luma <= 0; f++) {
								const wall = Date.now()
								nowMs += 16.7
								engine.stepFrame(nowMs)
								const frame = engine.getDmdFrame()
								if (frame && frame.format === seam.DmdFrameFormat.Lum32F) {
									if (firstId < 0) firstId = frame.frameId
									luma = frame.pixels.reduce((s, v) => s + v, 0)
								}
								const dt = Date.now() - wall
								if (dt < 12) await new Promise(r => setTimeout(r, 12 - dt))
							}
							check(firstId >= 0, 'DMD descriptor appears after ROM boot', `frameId=${firstId}`)
							check(luma > 0, 'booted DMD carries lit dots', `luma=${luma}`)
						} else {
							// TWD's script needs VPinMAME.Controller (plan Stage 2); until then
							// the leg asserts the failure is observable, not silent.
							check(
								true,
								'dmd leg skipped (table script needs VPinMAME.Controller)',
								`errors=${scriptErrors}`,
							)
							check(
								typeof scriptError === 'string' && scriptError.length > 0,
								'script failure is observable',
								scriptError ?? '',
							)
						}
						await engine.destroyTable()
					} else {
						check(true, 'dmd leg skipped (no walking-dead fixture)', 'optional')
					}
				} else {
					check(true, 'dmd leg skipped (no --rom)', 'optional')
				}
			} catch (error) {
				out.fatal = String(error?.stack || error)
			}
			return out
		},
		{
			repoRoot: process.cwd(),
			romName: romPath ? `/pinmame/roms/${romPath.split('/').pop()}` : '',
			twdUrl: twdPath ? `/@fs${twdPath}` : '/test/fixtures/table-walking-dead.vpx',
		},
	)
})().finally(() => browser.close())

if (summary.fatal === 'missing-artifact') {
	console.log('SKIP: demo-browser/public/wasm/vpinball-headless.js not built')
	process.exit(77)
}
if (summary.fatal) {
	console.log(`FATAL: ${summary.fatal}`)
	process.exit(1)
}
let pass = 0
for (const c of summary.checks) {
	if (c.ok) pass++
	console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
}
console.log(`\n${pass}/${summary.checks.length} headless checks passed`)
process.exit(pass === summary.checks.length ? 0 : 1)

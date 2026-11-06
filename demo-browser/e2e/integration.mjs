// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findWalkingDead, findWalkingDeadRom } from '../../test/harness/bench-shared.ts'
import {
	attachLogging,
	ensureVite,
	launchBrowser,
	loadPuppeteer,
	newPage,
	resolveChromePath,
} from '../../test/harness/utils.mjs'
import {
	backboxChecks,
	ballChecks,
	cameraTransitionChecks,
	DEFAULT_URL,
	diagnostics,
	dmdLiveChecks,
	dmdVisibleChecks,
	glRendererInfo,
	hideOverlays,
	INSERT_NAME_PATTERN,
	nudgeChecks,
	physicsChecks,
	playfieldLightsCheck,
	playfieldLightsCheckAfterLamp,
	plungerChecks,
	pollLog,
	shot,
	soundChecks,
	waitReady,
	wasmEngineChecks,
} from './helpers.mjs'

// Environmental probes first: a missing engine artifact or browser is an
// honest SKIP (exit 77), never a failure.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
if (!existsSync(join(repoRoot, 'demo-browser/public/wasm/vpinball-headless.wasm'))) {
	console.log('SKIP: no engine artifact (npm run build:wasm:headless)')
	process.exit(77)
}
let puppeteer
try {
	puppeteer = await loadPuppeteer()
} catch {
	console.log('SKIP: puppeteer not installed')
	process.exit(77)
}
if (!resolveChromePath() && !process.env.CHROME_PATH) {
	console.log('SKIP: no Chrome (standard install path or CHROME_PATH)')
	process.exit(77)
}

function upgradeLocalhost(u) {
	if (u.startsWith('http://localhost:3000')) {
		const upgraded = u.replace('http://localhost:3000', 'https://localhost:3000')
		console.log(`[integration] http -> https (vite serves TLS): ${upgraded}`)
		return upgraded
	}
	return u
}

const url = upgradeLocalhost(
	process.argv.find(a => a.startsWith('--url='))?.slice(6) ||
		(process.argv[2]?.startsWith('http') ? process.argv[2] : null) ||
		'',
)
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || '/tmp'
// GPU: --gpu=vulkan|gl|--gpu or USE_GPU=...; otherwise the host GPU when it
// has one (the playable table kills SwiftShader tabs), else SwiftShader.
// USE_SWIFTSHADER=1 forces software GL.
const gpuArg =
	process.argv.find(a => a.startsWith('--gpu='))?.slice(6) || (process.argv.includes('--gpu') ? 'vulkan' : null)
const hostGpu = process.env.USE_SWIFTSHADER !== '1' && existsSync('/dev/dri/renderD128') ? 'vulkan' : null
const gpu = gpuArg || process.env.USE_GPU || process.env.GPU || hostGpu
console.log(`[integration] ${gpu ? `gpu=${gpu}` : 'SwiftShader (software GL)'}`)
const readyTimeoutMs = Number(process.env.E2E_READY_TIMEOUT_MS) || 60000
const autoKillMs = Number(process.env.E2E_AUTOKILL_MS) || undefined

// Leg results are tri-state: true (pass), false (fail), 'skip' (fixture cannot
// support the check). Skips pass only for legs the fixture manifest marks
// optional; a skip on a required leg is a FAIL.
const legStatus = v => (v === 'skip' ? 'SKIP' : v ? 'PASS' : 'FAIL')
// Gameplay legs that need script/ROM/DMD. Static fixtures (no table script)
// may skip them; the playable fixture must genuinely pass them.
const OPTIONAL_GAMEPLAY_LEGS = new Set(['ball', 'plunger', 'physics', 'nudge', 'dmd', 'dmdVisible', 'backbox', 'sound'])
// table-empty has no bake mesh, inserts, or lit scene: playfield is
// uncheckable by construction and an empty-scene orbit is unstable under
// software rendering, so both are manifest-optional there — never on a
// playable table.
const OPTIONAL_EMPTY_FIXTURE_LEGS = new Set([...OPTIONAL_GAMEPLAY_LEGS, 'playfield', 'camera'])
// A page booting a ROM runs table script: everything except the
// manifest-optional backbox leg is required (no skip-is-pass). Derived from
// the URL, never the table name.
const requiresGameplay = targetUrl => {
	try {
		return new URL(targetUrl).searchParams.has('rom')
	} catch {
		return false
	}
}
const optionalLegsFor = targetUrl => (requiresGameplay(targetUrl) ? new Set(['backbox']) : OPTIONAL_EMPTY_FIXTURE_LEGS)
// The headless-WASM engine is unconditional: the wasmEngine leg asserts on
// every run (it never reports 'skip'), and the gameplay legs below drive it
// through window.vpx.
const legOkFor = (targetUrl, leg, v) => v === true || (v === 'skip' && optionalLegsFor(targetUrl).has(leg))

// E2E drives play entry explicitly through window.vpx: the timed
// auto-switch to play would race ensurePlayMode, so force it off here
// rather than clearing timers after load.
function withAutoplayOff(u) {
	try {
		const uu = new URL(u)
		if (!uu.searchParams.has('autoplay')) uu.searchParams.set('autoplay', '0')
		return uu.toString()
	} catch {
		return u
	}
}

function labelFromUrl(u) {
	try {
		const uu = new URL(u)
		const p = uu.searchParams.get('vpx') || uu.searchParams.get('table') || uu.searchParams.get('rom') || 'primary'
		const base =
			p
				.split('/')
				.pop()
				?.replace(/\.vpx$/i, '')
				?.replace(/\.zip$/i, '') || 'primary'
		return (
			base
				.replace(/[^a-z0-9]+/gi, '_')
				.toLowerCase()
				.slice(0, 24) || 'primary'
		)
	} catch {
		return 'primary'
	}
}

// ensureVite serves this tree in-process on a per-run port, so navigate to
// the URL it returns. Close the handle on every exit: the listening server
// keeps the event loop alive.
const vite = await ensureVite(url || DEFAULT_URL, { label: 'integration' })
const serverUrl = vite.url
let browser
try {
	browser = await launchBrowser(puppeteer, {
		...(gpu ? { gpu } : {}),
		...(autoKillMs ? { autoKillMs } : {}),
	})
} catch (error) {
	console.log(`SKIP: browser launch failed (${String(error?.message ?? error).slice(0, 200)})`)
	await vite.close().catch(() => {})
	process.exit(77)
}

async function runOne(targetUrl, label) {
	targetUrl = withAutoplayOff(upgradeLocalhost(targetUrl))
	const page = await newPage(browser)
	const logs = attachLogging(page, {
		filter: /Ready|Failed|Parsed|filter|Skipped|VLM|VR|cabinet|glass|mem|heap|THREE|Texture|DMD|emu|PinMAME/i,
		prefix: `[${label}]`,
	})
	// Loud pageerror gate: every uncaught page exception is recorded with its
	// phase (load+settle vs later legs). Load-phase errors fail the gate —
	// attachLogging only prints them, so without this collector they pass
	// silently.
	const pageErrors = []
	let loadPhase = true
	page.on('pageerror', err => {
		pageErrors.push({
			phase: loadPhase ? 'load' : 'run',
			message: String(err?.message ?? err).slice(0, 500),
			stack: String(err?.stack ?? '').slice(0, 800),
		})
	})
	page.on('requestfailed', req => {
		console.log(`[integration:${label}] requestfailed ${req.url().slice(0, 200)} ${req.failure()?.errorText || ''}`)
	})
	console.log(`[integration:${label}] goto ${targetUrl}`)
	await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
	// Ready is the test API's load promise, never a log substring (a log
	// containing "Ready final" reads ready while the load state is error).
	let log = ''
	let ready = false
	try {
		log = await waitReady(page, readyTimeoutMs)
		ready = true
	} catch (error) {
		log = await page.evaluate(() => document.getElementById('log')?.innerText || '').catch(() => '')
		console.log(`[integration:${label}] not ready: ${String(error?.message ?? error).slice(0, 200)}`)
	}
	console.log(`[integration:${label}] Ready=${ready}`)
	if (!ready) {
		console.log(log.slice(-6000))
		for (const e of pageErrors.slice(0, 10))
			console.log(`[integration:${label}] pageerror[${e.phase}] ${e.message}\n${e.stack}`)
		await page.close().catch(() => {})
		return { ok: false, reason: 'not ready' }
	}
	if (log.includes('streaming') || log.includes('deferred')) {
		// Legs below (diagnostics, playfield, …) must observe the settled
		// scene: multi-10s EXR bakes arrive long after Ready. pollLog returns
		// at once when Done already logged; empty tables never stream.
		console.log(`[integration:${label}] wait stream Done…`)
		log = await pollLog(page, '[stream] Done', 180000, 'stream-done')
		console.log(`[integration:${label}] stream settled (${log.includes('[stream] Done') ? 'done' : 'timeout'})`)
	}
	try {
		const gl = await glRendererInfo(page)
		console.log(`[integration:${label}] GL renderer: ${gl.renderer} software=${gl.software}`)
	} catch (e) {
		console.log(`[integration:${label}] GL renderer probe failed: ${e.message}`)
	}
	await new Promise(r => setTimeout(r, 1200))
	await hideOverlays(page)
	// No timer cleanup: ?autoplay=0 (appended above) disables the timed
	// auto-switch, and legs drive play entry through window.vpx instead.
	loadPhase = false
	const results = {}
	// Load+settle pageerror gate: any uncaught page exception during table
	// load and settle fails loudly. Run-phase errors gate at the end too
	// (see runErrors below): uncaught script errors during play are never
	// intentional.
	const loadErrors = pageErrors.filter(e => e.phase === 'load')
	results.pageerrors = loadErrors.length === 0
	if (!results.pageerrors) {
		console.log(`[integration:${label}] FAIL ${loadErrors.length} pageerror(s) during load+settle:`)
		for (const e of loadErrors.slice(0, 10))
			console.log(`[integration:${label}] pageerror[load] ${e.message}\n${e.stack}`)
	} else {
		console.log(`[integration:${label}] pageerrors PASS (0 during load+settle)`)
	}
	// Every gameplay leg runs against the headless-WASM engine through
	// window.vpx (input via sendKey, positions from the movers/balls
	// buffers). Static fixtures skip what they cannot support; the playable
	// fixture must genuinely pass each leg.
	console.log(`[integration:${label}] wasm engine legs active (window.vpx)`)
	const diag = await diagnostics(page)
	const hasWarnings = diag.includes('WARN visible pending') || diag.includes('WARN cab emissive')
	results.diagnostics = !hasWarnings
	if (!results.diagnostics) console.log(`[integration:${label}] WARN diagnostics:\n${diag}`)
	// playfield bake & insert lights — generic
	try {
		const pf = await playfieldLightsCheck(page)
		console.log(`[playfield:${label}]`, JSON.stringify(pf))
		if (pf.bake && pf.bake.count === 0) {
			results.playfield = 'skip'
			console.log(`[playfield:${label}] skip — no bake mesh (empty table)`)
		} else {
			results.playfield = pf.pass === 'skip' ? 'skip' : !!pf.pass
			console.log(
				`[integration:${label}] playfield ${legStatus(results.playfield)} bake=${JSON.stringify(pf.bake)} inserts=${JSON.stringify(pf.inserts)} reason=${pf.reason}`,
			)
			if (results.playfield === false) console.log(`[playfield:${label}] FAIL details ${JSON.stringify(pf)}`)
		}
		try {
			const hasInsertTable = await page.evaluate(insertPattern => {
				const insertRe = new RegExp(insertPattern, 'i')
				const v = window.viewer
				if (!v || !v.table) return false
				try {
					const hasLight = v.table.lights && Object.keys(v.table.lights).length > 0
					const hasInsert = Object.keys(v.table.primitives || {}).some(k => insertRe.test(k))
					const hasColl = !!(
						v.table.collections &&
						(v.table.collections.InsertOn ||
							v.table.collections.InsertOff ||
							v.table.collections.InsertLights)
					)
					return hasLight || hasInsert || hasColl
				} catch {
					return false
				}
			}, INSERT_NAME_PATTERN)
			if (hasInsertTable) {
				console.log(`[playfield:${label}] table has inserts/lights — checking lamp-driven inserts…`)
				const lampRes = await playfieldLightsCheckAfterLamp(page)
				console.log(`[playfield-lamp:${label}]`, JSON.stringify(lampRes))
				results.playfieldLamp = lampRes.pass === 'skip' ? 'skip' : !!lampRes.pass
				if (results.playfieldLamp === false)
					console.log(
						`[playfield-lamp:${label}] FAIL insert lights not working maxI=${lampRes.maxI} samples=${JSON.stringify(lampRes.samples)}`,
					)
				const parts = [results.playfield, results.playfieldLamp].filter(r => r !== 'skip')
				results.playfield = parts.length === 0 ? 'skip' : parts.every(Boolean)
				console.log(`[integration:${label}] playfield combined ${legStatus(results.playfield)}`)
			} else {
				console.log(`[playfield:${label}] skip lamp check — no inserts/lights in table`)
				results.playfieldLamp = 'skip'
				// Bake leg (if it ran) keeps its verdict in results.playfield.
			}
		} catch (e) {
			console.log(`[playfield-lamp:${label}] error ${e.message}`)
			results.playfieldLamp = false
		}
	} catch (e) {
		console.log(`[playfield:${label}] error ${e.message}`)
		results.playfield = false
	}
	let ball = null
	try {
		ball = await ballChecks(page)
		console.log(`[ball:${label}]`, JSON.stringify(ball))
		results.ball = ball.pass === 'skip' ? 'skip' : !!ball.pass
		console.log(
			`[integration:${label}] ball ${legStatus(results.ball)} moved=${ball.moved} kickPos=${JSON.stringify(ball.kickPos)} balls=${ball.balls} troughKickers=${ball.troughCount} kickers=${JSON.stringify(ball.kickerNames)}`,
		)
		if (results.ball === 'skip') console.log(`[integration:${label}] ball SKIP — ${ball.skipReason}`)
		if (results.ball === false)
			console.log(
				`[integration:${label}] FAIL ball did not eject — ${ball.reason} (scripted trough kick needs ROM)`,
			)
	} catch (e) {
		console.log(`[ball:${label}] error ${e.message}`)
		results.ball = false
	}
	try {
		const plunger = await plungerChecks(page)
		console.log(`[plunger:${label}]`, JSON.stringify(plunger))
		results.plunger = plunger.pass === 'skip' ? 'skip' : !!plunger.pass
		console.log(`[integration:${label}] plunger ${legStatus(results.plunger)} — ${plunger.reason}`)
		if (results.plunger === 'skip') console.log(`[integration:${label}] plunger SKIP — ${plunger.reason}`)
		if (results.plunger === false)
			console.log(`[integration:${label}] FAIL plunger did not move or launch (travel=${plunger.travel})`)
	} catch (e) {
		console.log(`[plunger:${label}] error ${e.message}`)
		results.plunger = false
	}
	const phys = await physicsChecks(page)
	console.log(`[physics:${label}]`, JSON.stringify(phys))
	// No ball-moved override: every sub-leg stands on its own verdict. Skipped
	// sub-legs (no flipper, no script output) are neutral, but at least one
	// sub-leg must genuinely pass (flipper motion or the advancing game clock)
	// for the leg to pass.
	const physParts = [phys.flipper?.pass, phys.coin?.pass, phys.start?.pass, phys.clock?.pass]
	const physPass = physParts.every(p => p === true || p === 'skip') && physParts.some(p => p === true)
	results.physics = physPass
	console.log(`[integration:${label}] physics ${results.physics ? 'PASS' : 'FAIL'}`)
	try {
		const nudge = await nudgeChecks(page)
		console.log(`[nudge:${label}]`, JSON.stringify(nudge))
		results.nudge = nudge.pass === 'skip' ? 'skip' : !!nudge.pass
		console.log(
			`[integration:${label}] nudge ${legStatus(results.nudge)} api=${nudge.viaApi} key=${nudge.viaKey} — ${nudge.reason}`,
		)
		if (results.nudge === 'skip') console.log(`[integration:${label}] nudge SKIP — ${nudge.reason}`)
		if (results.nudge === false) console.log(`[nudge:${label}] WARN nudge not detected — ${nudge.reason}`)
	} catch (e) {
		console.log(`[nudge:${label}] error ${e.message}`)
		results.nudge = false
	}
	const dmd = await dmdLiveChecks(page)
	console.log(`[dmd:${label}]`, JSON.stringify(dmd))
	results.dmd = dmd.pass === 'skip' ? 'skip' : !!dmd.pass
	console.log(`[dmd:${label}] dmd ${legStatus(results.dmd)} — ${dmd.reason}`)
	try {
		const bb = await backboxChecks(page)
		console.log(`[backbox:${label}]`, JSON.stringify(bb))
		results.backbox = bb.pass === 'skip' ? 'skip' : !!bb.pass
		console.log(`[integration:${label}] backbox ${legStatus(results.backbox)} — ${bb.reason}`)
	} catch (e) {
		console.log(`[backbox:${label}] error ${e.message}`)
		results.backbox = false
	}
	try {
		const dv = await dmdVisibleChecks(page)
		console.log(`[dmd-visible:${label}]`, JSON.stringify(dv))
		results.dmdVisible = dv.pass === 'skip' ? 'skip' : !!dv.pass
		console.log(`[integration:${label}] dmdVisible ${legStatus(results.dmdVisible)} — ${dv.reason}`)
	} catch (e) {
		console.log(`[dmd-visible:${label}] error ${e.message}`)
		results.dmdVisible = false
	}
	try {
		const camTrans = await cameraTransitionChecks(page)
		console.log(`[camera:${label}]`, JSON.stringify(camTrans))
		results.camera = camTrans.pass === 'skip' ? 'skip' : !!camTrans.pass
		console.log(`[integration:${label}] camera ${legStatus(results.camera)} ${camTrans.reason}`)
		if (results.camera === false) console.log(`[camera:${label}] FAIL ${JSON.stringify(camTrans)}`)
	} catch (e) {
		console.log(`[camera:${label}] error ${e.message}`)
		results.camera = false
	}
	try {
		const sound = await soundChecks(page)
		console.log(`[sound:${label}]`, JSON.stringify(sound))
		results.sound = sound.pass === 'skip' ? 'skip' : !!sound.pass
		console.log(`[integration:${label}] sound ${legStatus(results.sound)} — ${sound.reason}`)
		if (results.sound === 'skip') console.log(`[integration:${label}] sound SKIP — ${sound.reason}`)
		if (results.sound === false) console.log(`[sound:${label}] FAIL ${JSON.stringify(sound)}`)
	} catch (e) {
		console.log(`[sound:${label}] error ${e.message}`)
		results.sound = false
	}
	try {
		const w = await wasmEngineChecks(page)
		console.log(`[wasmEngine:${label}]`, JSON.stringify(w))
		results.wasmEngine = w.pass === 'skip' ? 'skip' : !!w.pass
		console.log(
			`[integration:${label}] wasmEngine ${legStatus(results.wasmEngine)} ready=${w.ready} catalog=${w.catalogSize} scriptErrors=${w.scriptErrors} balls=${w.ballCountAfter ?? w.ballCount} tick=${w.tickOk} advanced=${w.gameAdvanced} input=${w.inputOk}${w.reason ? ` — ${w.reason}` : ''}`,
		)
		if (results.wasmEngine === false) console.log(`[wasmEngine:${label}] FAIL ${JSON.stringify(w)}`)
	} catch (e) {
		console.log(`[wasmEngine:${label}] error ${e.message}`)
		results.wasmEngine = false
	}
	const cam = await page
		.evaluate(() => {
			const c = window.camera,
				t = window.controls?.target,
				vm = window.viewer?.viewerMode
			return {
				pos: c ? [c.position.x, c.position.y, c.position.z] : null,
				target: t ? [t.x, t.y, t.z] : null,
				mode: vm,
				playApplied: window.viewer?._playCameraApplied,
			}
		})
		.catch(() => null)
	console.log(`[cam:${label}]`, JSON.stringify(cam))
	const roomExists = await page
		.evaluate(() => !!window.scene?.getObjectByName('vr_procedural_room'))
		.catch(() => false)
	const cab = await page
		.evaluate(() => {
			const g = window.tableGroup
			if (!g) return { vis: 0, hid: 0 }
			let vis = 0,
				hid = 0
			g.traverse(o => {
				if (
					o.isMesh &&
					(o.name.toLowerCase().includes('vrcab') ||
						o.name.toLowerCase().includes('vr_') ||
						o.name.toLowerCase().includes('pincab'))
				) {
					if (o.visible) vis++
					else hid++
				}
			})
			return { vis, hid }
		})
		.catch(() => ({ vis: 0, hid: 0 }))
	console.log(`[room:${label}] procedural=${roomExists} cab vis=${cab.vis} hid=${cab.hid}`)
	const isPlay = cam?.mode === 'play'
	const hasVisibleRoomOrCab = roomExists || cab.vis > 0
	console.log(`[generic:${label}] mode play=${isPlay} room/cab visible=${hasVisibleRoomOrCab}`)
	// Screenshots below are review artifacts for humans, not assertions: shot()
	// never feeds a leg verdict and its failures never fail the gate.
	for (const [n, cp, tg] of [
		[`framed_${label}`, null, null],
		[`playfield_top_${label}`, [0, 190, 300], [0, -3, 6]],
		[`side_${label}`, [350, -80, 120], [0, -3, 6]],
		[`lower_close_${label}`, [0, 5, 35], [0, -5, 0]],
	]) {
		try {
			await shot(page, n, cp, tg, out)
		} catch (e) {
			console.log(`[shot:${label}:${n}] failed ${e.message}`)
		}
	}
	console.log(`[integration:${label}] shots -> ${out}`)
	const runErrors = pageErrors.filter(e => e.phase === 'run')
	// Run-phase gate: an uncaught exception or script error during play legs
	// fails loudly. Real tables (walking_dead timers, GI, cannon capture)
	// execute script on every frame; warn-and-continue hid live breakage.
	const runScriptErrors = logs.filter(t => /Uncaught (VbsError|Error)|VbsError:/.test(t))
	results.runErrors = runErrors.length === 0 && runScriptErrors.length === 0
	if (!results.runErrors) {
		console.log(
			`[integration:${label}] FAIL ${runErrors.length} run-phase pageerror(s), ${runScriptErrors.length} console script error(s):`,
		)
		for (const e of runErrors.slice(0, 10)) console.log(`[integration:${label}] pageerror[run] ${e.message}`)
		for (const t of runScriptErrors.slice(0, 10))
			console.log(`[integration:${label}] console[run] ${t.slice(0, 300)}`)
	} else {
		console.log(`[integration:${label}] runErrors PASS (0 run-phase page/script errors)`)
	}
	await page.close().catch(() => {})
	// Every leg counts — including dmd, backbox, and the load
	// pageerror gate. No mock overrides: legs the fixture cannot support
	// report 'skip' (neutral only when the manifest marks them optional),
	// everything else must genuinely pass.
	const legs = {
		pageerrors: results.pageerrors,
		diagnostics: results.diagnostics,
		playfield: results.playfield,
		ball: results.ball,
		plunger: results.plunger,
		physics: results.physics,
		nudge: results.nudge,
		dmd: results.dmd,
		backbox: results.backbox,
		dmdVisible: results.dmdVisible,
		camera: results.camera,
		sound: results.sound,
		wasmEngine: results.wasmEngine,
		runErrors: results.runErrors,
	}
	const ok = Object.entries(legs).every(([leg, v]) => legOkFor(targetUrl, leg, v))
	console.log(`\n# integration ${label} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results)}`)
	return { ok, results }
}
if (url) {
	const label = labelFromUrl(url)
	let res
	try {
		res = await runOne(serverUrl, label)
	} catch (e) {
		console.error('[integration] runOne error', e)
		res = { ok: false }
	} finally {
		try {
			await browser.close()
		} catch {}
		await vite.close().catch(() => {})
	}
	process.exit(res?.ok ? 0 : 1)
} else {
	// Default run: the empty fixture, plus the playable table with its ROM when
	// both exist locally. Only that run boots PinMAME, so it is what catches
	// engine aborts on real tables. EXTRA_URLS (comma list) adds more pages,
	// moved onto this run's server.
	const { origin } = new URL(serverUrl)
	const urls = [[serverUrl, 'primary']]
	const twd = findWalkingDead()
	const rom = findWalkingDeadRom()
	if (twd && rom) {
		const query = new URLSearchParams({ vpx: `/@fs${twd}`, rom: `/@fs${rom}`, mode: 'play' })
		urls.push([`${origin}/?${query}`, 'twd'])
	} else console.log('[integration] no Walking Dead table + ROM found: playable-table run skipped')
	for (const extra of (process.env.EXTRA_URLS ?? '').split(',').filter(s => s.trim())) {
		const page = new URL(extra.trim(), origin)
		const onServer = `${origin}${page.pathname}${page.search}`
		if (!urls.some(([u]) => u === onServer)) urls.push([onServer, labelFromUrl(onServer)])
	}
	let overallOk = true
	for (const [u, l] of urls) {
		try {
			const r = await runOne(u, l)
			overallOk = overallOk && r.ok
		} catch (e) {
			console.log(`[integration:${l}] error ${e.message}`)
			overallOk = false
		}
	}
	try {
		await browser.close()
	} catch {}
	await vite.close().catch(() => {})
	console.log(`\n# overall ${overallOk ? 'PASS' : 'FAIL'}`)
	process.exit(overallOk ? 0 : 1)
}

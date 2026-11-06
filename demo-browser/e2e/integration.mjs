import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'
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
// GPU selection (same convention as bench.mjs): --gpu=vulkan|--gpu=gl|--gpu,
// USE_GPU=..., or legacy USE_SWIFTSHADER=1 (default when no gpu is set).
const gpuArg =
	process.argv.find(a => a.startsWith('--gpu='))?.slice(6) || (process.argv.includes('--gpu') ? 'vulkan' : null)
const gpu = gpuArg || process.env.USE_GPU || process.env.GPU || null
const useSwift = process.env.USE_SWIFTSHADER === '1'
if (useSwift && !gpu) console.log('[integration] USE_SWIFTSHADER=1 (default SwiftShader flags)')
if (gpu) console.log(`[integration] gpu=${gpu}`)
const readyTimeoutMs = Number(process.env.E2E_READY_TIMEOUT_MS) || 60000
const autoKillMs = Number(process.env.E2E_AUTOKILL_MS) || undefined

// Leg results are tri-state: true (pass), false (fail), 'skip' (fixture cannot
// support the check). Skips pass only for legs the fixture manifest marks
// optional; a skip on a required leg is a FAIL (plan §6.2.1).
const legStatus = v => (v === 'skip' ? 'SKIP' : v ? 'PASS' : 'FAIL')
// Gameplay legs that need script/ROM/DMD. Static fixtures (no table script)
// may skip them; the playable fixture must genuinely pass them.
const OPTIONAL_GAMEPLAY_LEGS = new Set(['ball', 'plunger', 'physics', 'nudge', 'dmd', 'dmdVisible', 'backbox', 'sound'])
// table-empty has no bake mesh, inserts, or lit scene: playfield is
// uncheckable by construction and an empty-scene orbit is unstable under
// software rendering, so both are manifest-optional there — never on a
// playable table.
const OPTIONAL_EMPTY_FIXTURE_LEGS = new Set([...OPTIONAL_GAMEPLAY_LEGS, 'playfield', 'camera'])
// Labels whose tables boot a ROM and run table script: everything except the
// manifest-optional backbox leg is required (no skip-is-pass).
const isPlayableLabel = label => /walking_dead|twd/i.test(label)
const optionalLegsFor = label => (isPlayableLabel(label) ? new Set(['backbox']) : OPTIONAL_EMPTY_FIXTURE_LEGS)
// The headless-WASM engine is unconditional: the wasmEngine leg asserts on
// every run, and the TS-player legs below skip honestly when it is active.
const legOkFor = (label, leg, v) =>
	v === true || (v === 'skip' && (leg === 'wasmEngine' || optionalLegsFor(label).has(leg)))

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

// Shared harness helpers (same as bench.mjs): ensureVite probes/starts the dev
// server and registers process cleanup for vite + chrome, so no bespoke
// ensureServer/_forceKillChrome/signal handlers are needed here.
await ensureVite(url || DEFAULT_URL, { label: 'integration' })
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, {
	...(gpu ? { gpu } : {}),
	...(autoKillMs ? { autoKillMs } : {}),
})

async function runOne(targetUrl, label) {
	targetUrl = upgradeLocalhost(targetUrl)
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
	let log = await waitReady(page, readyTimeoutMs)
	const ready = log.includes('Ready')
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
	await page.evaluate(() => {
		try {
			clearTimeout(window.viewer._autoPlayTimer)
			window.viewer._autoPlayTimer = null
		} catch {}
		try {
			window.viewer._scheduleAutoPlay = () => {}
		} catch {}
		try {
			clearTimeout(window.viewer._fallbackBallTimer)
			window.viewer._fallbackBallTimer = null
		} catch {}
	})
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
	// TS-player machinery legs (ball, physics) cannot run when the
	// headless-WASM engine owns the table: no TS player exists. They skip
	// honestly below; the wasmEngine leg asserts the WASM guarantees instead.
	let wasmActive = false
	try {
		wasmActive = await page.evaluate(() => !!window.viewer?.wasmEngine?.ready && !window.viewer?.player)
	} catch {}
	if (wasmActive) console.log(`[integration:${label}] wasm engine active — TS-player legs skip`)
	const diag = await diagnostics(page)
	const isTableEmpty = targetUrl.includes('empty') || label.includes('empty')
	const hasWarnings =
		diag.includes('WARN visible pending') ||
		diag.includes('WARN cab emissive') ||
		(diag.includes('WARN luminance') && !isTableEmpty)
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
		ball = wasmActive
			? {
					pass: 'skip',
					skipReason: 'wasm engine: ejection needs scripted trough kick (Stage 2)',
					moved: false,
					kickPos: null,
					solFired: false,
					isMock: false,
					troughPos: null,
					kickerNames: [],
				}
			: await ballChecks(page)
		console.log(`[ball:${label}]`, JSON.stringify(ball))
		results.ball = ball.pass === 'skip' ? 'skip' : !!ball.pass
		console.log(
			`[integration:${label}] ball ${legStatus(results.ball)} moved=${ball.moved} kickPos=${JSON.stringify(ball.kickPos)} solFired=${ball.solFired} isMock=${ball.isMock} trough=${JSON.stringify(ball.troughPos)} kickers=${JSON.stringify(ball.kickerNames)}`,
		)
		if (results.ball === 'skip') console.log(`[integration:${label}] ball SKIP — ${ball.skipReason}`)
		if (results.ball === false)
			console.log(
				`[integration:${label}] FAIL ball did not eject - trough kick failed (generic trough / Not Is / CBool)`,
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
	const phys = wasmActive ? { wasmSkip: true } : await physicsChecks(page)
	console.log(`[physics:${label}]`, JSON.stringify(phys))
	if (wasmActive) {
		// No TS player clock on the WASM path: stepping is asserted by the
		// wasmEngine leg; flipper/coin/start need script execution (Stage 2).
		results.physics = 'skip'
		console.log(`[integration:${label}] physics SKIP — wasm engine owns the clock (see wasmEngine leg)`)
	} else {
		// No ball-moved override: every sub-leg stands on its own verdict. Skipped
		// sub-legs (no flipper, mock emu) are neutral, but at least one sub-leg must
		// genuinely pass (the advancing physics clock) for the leg to pass.
		const physParts = [phys.flipper?.pass, phys.coin?.pass, phys.start?.pass, phys.clock?.pass]
		const physPass = physParts.every(p => p === true || p === 'skip') && physParts.some(p => p === true)
		results.physics = physPass
		console.log(`[integration:${label}] physics ${results.physics ? 'PASS' : 'FAIL'}`)
	}
	try {
		const nudge = await nudgeChecks(page)
		console.log(`[nudge:${label}]`, JSON.stringify(nudge))
		results.nudge = nudge.pass === 'skip' ? 'skip' : !!nudge.pass
		console.log(
			`[integration:${label}] nudge ${legStatus(results.nudge)} api=${nudge.viaApi} key=${nudge.viaKey} visual=${nudge.visual}`,
		)
		if (results.nudge === false) console.log(`[nudge:${label}] WARN nudge not detected`)
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
			`[integration:${label}] wasmEngine ${legStatus(results.wasmEngine)} ready=${w.ready} catalog=${w.catalogSize} scriptErrors=${w.scriptErrors} balls=${w.ballCountAfter ?? w.ballCount} tick=${w.tickOk} input=${w.inputOk}${w.reason ? ` — ${w.reason}` : ''}`,
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
	const ok = Object.entries(legs).every(([leg, v]) => legOkFor(label, leg, v))
	console.log(`\n# integration ${label} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results)}`)
	return { ok, results }
}
if (url) {
	const label = labelFromUrl(url)
	let res
	try {
		res = await runOne(url, label)
	} catch (e) {
		console.error('[integration] runOne error', e)
		res = { ok: false }
	} finally {
		try {
			await browser.close()
		} catch {}
	}
	process.exit(res?.ok ? 0 : 1)
} else {
	const primaryUrl = DEFAULT_URL
	const urls = [[primaryUrl, 'primary']]
	const extraUrls = []
	const singleExtra = process.env.EXTRA_URL || process.env.TEST_URL || process.env.URL
	if (singleExtra) extraUrls.push(singleExtra)
	const multiExtra = process.env.EXTRA_URLS || process.env.TEST_URLS
	if (multiExtra)
		extraUrls.push(
			...multiExtra
				.split(',')
				.map(s => s.trim())
				.filter(Boolean),
		)
	for (const eu of extraUrls) {
		if (!urls.some(([u]) => u === eu)) urls.push([eu, labelFromUrl(eu)])
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
	console.log(`\n# overall ${overallOk ? 'PASS' : 'FAIL'}`)
	process.exit(overallOk ? 0 : 1)
}

import { readFileSync } from 'node:fs'
import path from 'node:path'
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
	waitReady,
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
// support the check). Only true/'skip' legs let the gate pass; skips are honest
// non-coverage, never pseudo-passes.
const legStatus = v => (v === 'skip' ? 'SKIP' : v ? 'PASS' : 'FAIL')
const legOk = v => v === true || v === 'skip'

// Repo-relative inputs for the transpile probe: no hardcoded checkout path.
const TRANSPILER_URL = `/@fs${path.resolve('dist-esm/lib/scripting/transpiler.js')}`
const VBS_CONSTRUCTS_PATH = path.resolve('test/harness/__snapshots__/vpinball-compat/vbs-constructs.vbs')

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
	try {
		// Full-pipeline probe: the same VBS-construct fixture the AST gate pins,
		// transpiled in-page through the viewer's Transpiler (not just one-liners).
		const vbs = readFileSync(VBS_CONSTRUCTS_PATH, 'utf-8')
		const tp = await page.evaluate(
			async ({ transpilerUrl, fixture }) => {
				try {
					const { Transpiler } = await import(transpilerUrl)
					const v = window.viewer
					const t = new Transpiler(v.table, v.player)
					const notIs = t.transpile('If Not cb Is Nothing Then\n  x=1\nEnd If')
					const cbool = t.transpile('bstate=CBool(state>=0.5)')
					const fixtureJs = t.transpile(fixture)
					let syntaxOk = false
					try {
						new Function(fixtureJs)
						syntaxOk = true
					} catch {}
					return {
						// Correct shape: __vbs.is(<cb...>, ...) with the Not outside.
						// Regression: the old bug pushed the negation inside (__vbs.is(!...)).
						notIsCorrect:
							notIs.includes('__vbs.is(') && notIs.includes("'cb'") && !notIs.includes('__vbs.is(!'),
						cboolOk: cbool.includes('CBool'),
						fixtureLen: fixtureJs.length,
						fixtureMarkers: ['AddScore', 'DoubleIt', 'TestLogic', 'TestWith'].every(m =>
							fixtureJs.includes(m),
						),
						syntaxOk,
					}
				} catch (e) {
					return { err: String(e?.message ?? e) }
				}
			},
			{ transpilerUrl: TRANSPILER_URL, fixture: vbs },
		)
		console.log(`[transpile:${label}]`, JSON.stringify(tp))
		results.transpile =
			!tp.err &&
			tp.notIsCorrect === true &&
			tp.cboolOk === true &&
			tp.fixtureLen > 500 &&
			tp.fixtureMarkers === true &&
			tp.syntaxOk === true
		if (!results.transpile) console.log(`[transpile:${label}] FAIL transpilation probe failed`)
	} catch (e) {
		console.log(`[transpile:${label}] error ${e.message}`)
		results.transpile = false
	}
	let ball = null
	try {
		ball = await ballChecks(page)
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
	const phys = await physicsChecks(page)
	console.log(`[physics:${label}]`, JSON.stringify(phys))
	// No ball-moved override: every sub-leg stands on its own verdict. Skipped
	// sub-legs (no flipper, mock emu) are neutral, but at least one sub-leg must
	// genuinely pass (the advancing physics clock) for the leg to pass.
	const physParts = [phys.flipper?.pass, phys.coin?.pass, phys.start?.pass, phys.clock?.pass]
	const physPass = physParts.every(p => p === true || p === 'skip') && physParts.some(p => p === true)
	results.physics = physPass
	console.log(`[integration:${label}] physics ${results.physics ? 'PASS' : 'FAIL'}`)
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
	const hasRoom = await page
		.evaluate(() => !!window.scene?.getObjectByName('vr_procedural_room') || !!window.tableGroup?.traverse)
		.catch(() => false)
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
	// Every leg counts — including transpile, dmd, backbox, and the load
	// pageerror gate. No mock overrides: legs the fixture cannot support
	// report 'skip' (neutral), everything else must genuinely pass.
	const ok = [
		results.pageerrors,
		results.diagnostics,
		results.playfield,
		results.transpile,
		results.ball,
		results.plunger,
		results.physics,
		results.nudge,
		results.dmd,
		results.backbox,
		results.dmdVisible,
		results.camera,
		results.runErrors,
	].every(legOk)
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

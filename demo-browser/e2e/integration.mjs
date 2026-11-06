// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Browser E2E over the dev viewer (window.vpx). Without --url it runs the
 * empty fixture, plus The Walking Dead with its ROM when both are found
 * locally; EXTRA_URLS (comma list of paths) adds pages.
 *
 * Run: node demo-browser/e2e/integration.mjs [--url=/?vpx=...&rom=...] [--out=/tmp] [--gpu[=vulkan|gl]]
 * Exit: 0 pass, 77 skip (no engine artifact or Chrome), 1 fail.
 */
import { existsSync } from 'node:fs'
import { findWalkingDead, findWalkingDeadRom } from '../../test/harness/bench-shared.ts'
import {
	attachLogging,
	ensureVite,
	launchBrowser,
	loadPuppeteer,
	newPage,
	requireEngineAndChrome,
} from '../../test/harness/utils.mjs'
import {
	backboxChecks,
	ballChecks,
	cameraTransitionChecks,
	DEFAULT_PAGE,
	diagnostics,
	dmdLitChecks,
	dmdVisibleChecks,
	glRendererInfo,
	hideOverlays,
	pageLog,
	physicsChecks,
	playfieldLightsCheck,
	playfieldLightsCheckAfterLamp,
	plungerChecks,
	pollLog,
	shot,
	soundChecks,
	tableHasInserts,
	waitReady,
	wasmEngineChecks,
} from './helpers.mjs'

requireEngineAndChrome()

const url = process.argv.find(a => a.startsWith('--url='))?.slice(6) ?? ''
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || '/tmp'
// GPU: --gpu=vulkan|gl|--gpu or USE_GPU=...; otherwise the host GPU when it
// has one (the playable table kills SwiftShader tabs), else SwiftShader.
// USE_SWIFTSHADER=1 forces software GL.
const gpuArg =
	process.argv.find(a => a.startsWith('--gpu='))?.slice(6) || (process.argv.includes('--gpu') ? 'vulkan' : null)
const hostGpu = process.env.USE_SWIFTSHADER !== '1' && existsSync('/dev/dri/renderD128') ? 'vulkan' : null
const gpu = gpuArg || process.env.USE_GPU || hostGpu
console.log(`[integration] ${gpu ? `gpu=${gpu}` : 'SwiftShader (software GL)'}`)
const readyTimeoutMs = Number(process.env.E2E_READY_TIMEOUT_MS) || 180_000
// A ROM table run takes minutes; the watchdog only catches a hung browser.
const autoKillMs = Number(process.env.E2E_AUTOKILL_MS) || 20 * 60_000

// Leg results are tri-state: true (pass), false (fail), 'skip' (the page
// cannot support the check). A page with a ROM boots PinMAME and runs the
// table script, so every leg but backbox is required there. A page without
// one cannot eject, light inserts, or drive a DMD, and the empty fixture has
// no bake or stable orbit, so those legs may skip.
const legStatus = v => (v === 'skip' ? 'SKIP' : v ? 'PASS' : 'FAIL')
const OPTIONAL_WITH_ROM = new Set(['backbox'])
const OPTIONAL_WITHOUT_ROM = new Set([
	'ball',
	'plunger',
	'physics',
	'dmd',
	'dmdVisible',
	'backbox',
	'sound',
	'playfield',
	'camera',
])
const hasRom = pageUrl => !!new URL(pageUrl).searchParams.get('rom')

function labelFromUrl(pageUrl) {
	const params = new URL(pageUrl).searchParams
	const file = params.get('vpx') || params.get('table') || params.get('rom') || 'primary'
	return (
		(file.split('/').pop() ?? '')
			.replace(/\.(vpx|zip)$/i, '')
			.replace(/[^a-z0-9]+/gi, '_')
			.toLowerCase()
			.slice(0, 24) || 'primary'
	)
}

// Run a leg, log its verdict, and fold an exception into a FAIL.
async function leg(label, name, check, verdict = r => (r.pass === 'skip' ? 'skip' : !!r.pass)) {
	try {
		const r = await check()
		const v = verdict(r)
		console.log(`[integration:${label}] ${name} ${legStatus(v)} ${JSON.stringify(r)}`)
		return v
	} catch (e) {
		console.log(`[integration:${label}] ${name} FAIL ${e.message}`)
		return false
	}
}

const vite = await ensureVite(url || DEFAULT_PAGE)
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { gpu, autoKillMs })

async function runOne(targetUrl, label) {
	const page = await newPage(browser)
	const logs = attachLogging(page, {
		filter: /Ready|Failed|Parsed|filter|Skipped|VLM|VR|cabinet|glass|mem|heap|THREE|Texture|DMD|emu|PinMAME/i,
		prefix: `[${label}]`,
	})
	// Every uncaught page exception is recorded with its phase: load+settle
	// errors and run-phase errors both fail the page.
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
	const { ready, error } = await waitReady(page, readyTimeoutMs)
	console.log(`[integration:${label}] ready=${ready}${error ? ` (${error})` : ''}`)
	if (!ready) {
		console.log((await pageLog(page)).slice(-6000))
		for (const e of pageErrors.slice(0, 10))
			console.log(`[integration:${label}] pageerror[${e.phase}] ${e.message}\n${e.stack}`)
		await page.close().catch(() => {})
		return false
	}
	if (/streaming|deferred/.test(await pageLog(page))) {
		// Legs must observe the settled scene: multi-10s EXR bakes arrive long
		// after ready. Empty tables never stream.
		const log = await pollLog(page, '[stream] Done', 180000)
		console.log(`[integration:${label}] stream ${log.includes('[stream] Done') ? 'done' : 'timeout'}`)
	}
	const gl = await glRendererInfo(page)
	console.log(`[integration:${label}] GL renderer: ${gl.renderer} software=${gl.software}`)
	await new Promise(r => setTimeout(r, 1200))
	await hideOverlays(page)
	loadPhase = false
	const results = {}
	const loadErrors = pageErrors.filter(e => e.phase === 'load')
	results.pageerrors = loadErrors.length === 0
	for (const e of loadErrors.slice(0, 10))
		console.log(`[integration:${label}] pageerror[load] ${e.message}\n${e.stack}`)
	const diag = await diagnostics(page)
	results.diagnostics = !diag.includes('WARN visible pending') && !diag.includes('WARN cab emissive')
	console.log(`[integration:${label}] diagnostics ${legStatus(results.diagnostics)}\n${diag}`)
	const bake = await leg(
		label,
		'playfield',
		() => playfieldLightsCheck(page),
		r => (r.bake?.count === 0 || r.pass === 'skip' ? 'skip' : !!r.pass),
	)
	const lamp = (await tableHasInserts(page))
		? await leg(label, 'playfieldLamp', () => playfieldLightsCheckAfterLamp(page))
		: 'skip'
	const parts = [bake, lamp].filter(r => r !== 'skip')
	results.playfield = parts.length === 0 ? 'skip' : parts.every(Boolean)
	results.ball = await leg(label, 'ball', () => ballChecks(page))
	results.plunger = await leg(label, 'plunger', () => plungerChecks(page))
	// Skipped physics sub-legs (no flipper, no script output) are neutral,
	// but at least one must genuinely pass (flipper motion or the game clock).
	results.physics = await leg(
		label,
		'physics',
		() => physicsChecks(page),
		phys => {
			const subs = [phys.flipper?.pass, phys.coin?.pass, phys.start?.pass, phys.clock?.pass]
			return subs.every(p => p === true || p === 'skip') && subs.some(p => p === true)
		},
	)
	results.dmd = await leg(label, 'dmd', () => dmdLitChecks(page))
	results.backbox = await leg(label, 'backbox', () => backboxChecks(page))
	results.dmdVisible = await leg(label, 'dmdVisible', () => dmdVisibleChecks(page))
	results.camera = await leg(label, 'camera', () => cameraTransitionChecks(page))
	results.sound = await leg(label, 'sound', () => soundChecks(page))
	results.wasmEngine = await leg(label, 'wasmEngine', () => wasmEngineChecks(page))
	// Screenshots are review artifacts for humans, never assertions.
	for (const [name, position, target] of [
		[`framed_${label}`, null, null],
		[`playfield_top_${label}`, [0, 190, 300], [0, -3, 6]],
		[`side_${label}`, [350, -80, 120], [0, -3, 6]],
		[`lower_close_${label}`, [0, 5, 35], [0, -5, 0]],
	])
		await shot(page, name, position, target, out)
	console.log(`[integration:${label}] shots -> ${out}`)
	// Real tables run script every frame: an uncaught exception or script
	// error during the legs fails the page.
	const runErrors = pageErrors.filter(e => e.phase === 'run')
	const scriptErrors = logs.filter(t => /Uncaught (VbsError|Error)|VbsError:/.test(t))
	results.runErrors = runErrors.length === 0 && scriptErrors.length === 0
	for (const e of runErrors.slice(0, 10)) console.log(`[integration:${label}] pageerror[run] ${e.message}`)
	for (const t of scriptErrors.slice(0, 10)) console.log(`[integration:${label}] console[run] ${t.slice(0, 300)}`)
	await page.close().catch(() => {})
	const optional = hasRom(targetUrl) ? OPTIONAL_WITH_ROM : OPTIONAL_WITHOUT_ROM
	const ok = Object.entries(results).every(([name, v]) => v === true || (v === 'skip' && optional.has(name)))
	console.log(`\n# integration ${label} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results)}`)
	return ok
}

const pages = [vite.url]
if (!url) {
	const twd = findWalkingDead()
	const rom = findWalkingDeadRom()
	if (twd && rom) pages.push(`${vite.origin}/?${new URLSearchParams({ vpx: `/@fs${twd}`, rom: `/@fs${rom}` })}`)
	else console.log('[integration] no Walking Dead table + ROM found: playable-table run skipped')
	for (const extra of (process.env.EXTRA_URLS ?? '').split(',').filter(s => s.trim()))
		pages.push((await ensureVite(extra.trim())).url)
}
let overallOk = true
try {
	for (const pageUrl of pages) {
		const label = labelFromUrl(pageUrl)
		try {
			overallOk = (await runOne(pageUrl, label)) && overallOk
		} catch (e) {
			console.log(`[integration:${label}] error ${e.message}`)
			overallOk = false
		}
	}
} finally {
	await browser.close().catch(() => {})
	await vite.close()
}
console.log(`\n# overall ${overallOk ? 'PASS' : 'FAIL'}`)
process.exit(overallOk ? 0 : 1)

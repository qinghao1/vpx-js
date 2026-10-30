// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

// Viewer-mode (?worker=render, NO mode=play) render-worker guard: the worker
// owns present in viewer mode too — the bridge attaches, frame versions
// advance, the backing-store readback is lit, and an orbit drag changes the
// presented pixels (the main-thread camera rides the shared view rows, so a
// fresh worker readback after the orbit must differ from the boot framing).
// Run: node test/harness/verify-worker-view-mode.mjs
// Exit: 0 pass (TAP ok lines), 1 fail.

import { waitReady } from '../../demo-browser/e2e/helpers.mjs'
import { ensureVite, launchBrowser, loadPuppeteer, newPage, sleep } from './utils.mjs'

const results = []
const check = (name, cond, detail = '') => {
	results.push({ name, ok: !!cond, detail })
	console.log(`${cond ? 'ok' : 'not ok'} - ${name}${detail ? ` (${detail})` : ''}`)
}

await ensureVite('https://localhost:3000/', { label: 'verify-worker-view-mode' })
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { autoKillMs: 300_000 })
const pageerrors = []
try {
	const page = await newPage(browser)
	page.on('pageerror', e => pageerrors.push(String(e?.message ?? e).slice(0, 200)))
	await page.goto('https://localhost:3000/?vpx=/test/fixtures/table-flipper.vpx&mode=viewer&worker=render', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	})
	await waitReady(page, 240_000)
	const mode = await page.evaluate(() => window.viewer?.viewerMode)
	check('viewer mode (no mode=play)', mode === 'viewer', `${mode}`)
	await page.waitForFunction(() => !!window.viewer?._workerBridge, { timeout: 240_000 })
	check('worker bridge attached', true)
	await page.waitForFunction(() => !!window.__workerStats, { timeout: 240_000 })
	const v0 = await page.evaluate(() => window.__workerStats.version)
	await sleep(2000)
	const v1 = await page.evaluate(() => window.__workerStats.version)
	check('frame version advances', v1 > v0, `${v0} -> ${v1}`)
	await page.waitForFunction(() => typeof window.__workerStats?.lit === 'number', { timeout: 240_000 })
	const lit = await page.evaluate(() => window.__workerStats.lit)
	check('readback lit>0.05', lit > 0.05, `${lit}`)
	// Orbit drag then a fresh worker readback: headless never presents the
	// worker canvas to the compositor (page screenshots only see DOM), so the
	// backing-store `lit` probe is the pixel signal. lit1 is the boot framing.
	const lit1 = lit
	const camBefore = await page.evaluate(() => window.viewer?.camera?.position?.toArray?.())
	// Drag endpoints must both miss the table: the viewer click-to-play fires
	// when press+release hit the table, which would flip to play mode. Probe
	// with the viewer's own raycaster (zero intersections can't hit-test).
	const drag = await page.evaluate(() => {
		const v = window.viewer
		const rect = document.getElementById('canvas')?.getBoundingClientRect?.()
		if (!v || !rect || !v.tableGroup) return null
		const dx = 250
		const dy = 40
		for (const fx of [0.05, 0.1, 0.9, 0.2, 0.8, 0.5]) {
			for (const fy of [0.06, 0.12, 0.88, 0.25, 0.75, 0.5]) {
				const sx = rect.x + rect.width * fx
				const sy = rect.y + rect.height * fy
				const ex = sx + dx
				const ey = sy + dy
				if (ex > rect.x + rect.width - 2 || ey > rect.y + rect.height - 2) continue
				let hits = 0
				for (const [px, py] of [
					[sx, sy],
					[ex, ey],
				]) {
					v._mouse.x = ((px - rect.left) / rect.width) * 2 - 1
					v._mouse.y = -((py - rect.top) / rect.height) * 2 + 1
					v._raycaster.setFromCamera(v._mouse, v.camera)
					hits += v._raycaster.intersectObject(v.tableGroup, true).length
				}
				if (hits === 0) return { sx, sy, ex, ey }
			}
		}
		return null
	})
	check(
		'found table-miss drag path',
		!!drag,
		drag ? `${Math.round(drag.sx)},${Math.round(drag.sy)}` : 'table fills view',
	)
	if (drag) {
		await page.mouse.move(drag.sx, drag.sy)
		await page.mouse.down()
		await page.mouse.move(drag.ex, drag.ey, { steps: 25 })
		await page.mouse.up()
	}
	await sleep(1500)
	const camAfter = await page.evaluate(() => window.viewer?.camera?.position?.toArray?.())
	const camMoved =
		Array.isArray(camBefore) && Array.isArray(camAfter)
			? Math.hypot(camAfter[0] - camBefore[0], camAfter[1] - camBefore[1], camAfter[2] - camBefore[2])
			: 0
	check('orbit drag moves camera', camMoved > 1, `moved=${camMoved.toFixed(1)}`)
	const modeAfter = await page.evaluate(() => window.viewer?.viewerMode)
	check('still viewer mode after drag', modeAfter === 'viewer', `${modeAfter}`)
	// Fresh readback at the post-orbit pose; the worker image must differ from
	// the boot framing (deterministic probe: any nonzero delta is real change;
	// gate at 1% of samples for margin).
	await page.evaluate(() => window.viewer?._workerBridge?.requestReadback?.())
	await page.waitForFunction(l1 => window.__workerStats?.lit !== l1, { timeout: 120_000 }, lit1)
	const lit2 = await page.evaluate(() => window.__workerStats.lit)
	const delta = Math.abs(lit2 - lit1)
	check('readback pixels change after orbit drag', delta > 0.01, `lit ${lit1} -> ${lit2}`)
	check('no pageerrors', pageerrors.length === 0, pageerrors.slice(0, 2).join(' | '))
} catch (e) {
	check('harness completed', false, String(e).slice(0, 200))
} finally {
	try {
		await browser.close()
	} catch {}
}
const failed = results.filter(r => !r.ok).length
console.log(failed === 0 ? 'WORKER VIEW MODE PASS' : `WORKER VIEW MODE FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)

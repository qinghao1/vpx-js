// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
/**
 * Space Cadet live checks — JP's Space Cadet (FlexDMD, no ROM) on the real
 * headless engine + viewer:
 *  1. the force-hidden playfield decoy must stay hidden once the live sync
 *     runs (the engine reports it visible; showing it covers the base slab
 *     with a white quad and z-fights it),
 *  2. the DMD overlay stays hidden while no DMD frame has arrived, and
 *     presents the script's FlexDMD stage once one has (patch 0012),
 *  3. the lamp path must go live after coin+start (table lights work),
 *  4. the digit flashers must show live script score images, applied to
 *     the scene: the script sets UseFlexDMD=False when ShowDT=True, so
 *     no FlexDMD instance exists in desktop mode and scores go through
 *     script `Flasher.ImageA` writes on 41 digit flashers (patch 0013).
 *
 * Run: node test/harness/verify-cadet.mjs [--vpx=/path/to/space_cadet.vpx]
 *   (or SPACE_CADET_VPX; default ~/Downloads/space_cadet*.vpx)
 * Exit: 0 pass, 1 failure, 77 skip (no table, engine artifact, or Chrome).
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ensureVite, launchBrowser, loadPuppeteer, newPage, requireEngineAndChrome, sleep } from './utils.mjs'

function resolveVpx() {
	const cli = process.argv.find(a => a.startsWith('--vpx='))
	if (cli) return existsSync(cli.slice(6)) ? cli.slice(6) : null
	const env = process.env.SPACE_CADET_VPX
	if (env && existsSync(env)) return env
	const dl = join(homedir(), 'Downloads')
	const candidates = [join(dl, 'space_cadet.vpx')]
	try {
		for (const f of readdirSync(dl)) {
			if (/space.?cadet.*\.vpx$/i.test(f)) candidates.push(join(dl, f))
		}
	} catch {}
	return candidates.find(p => existsSync(p)) ?? null
}

const vpxPath = resolveVpx()
if (!vpxPath) {
	console.log('SKIP: Space Cadet VPX not provisioned (expected ~/Downloads/space_cadet.vpx)')
	process.exit(77)
}
requireEngineAndChrome()

const checks = []
const check = (ok, name, detail = '') => {
	checks.push({ ok: !!ok, name, detail })
	console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const vite = await ensureVite(`/?${new URLSearchParams({ vpx: `/@fs${vpxPath}` })}`)
let browser
try {
	browser = await launchBrowser(await loadPuppeteer())
	const page = await newPage(browser)
	await page.goto(vite.url, { waitUntil: 'load', timeout: 90000 })
	await page.waitForFunction(() => window.vpx, { timeout: 90000 })
	await page.evaluate(async () => {
		await window.vpx.whenReady(240000)
		await window.vpx.setMode('play')
	})
	await page.waitForFunction(() => window.vpx.state.wasmReady, { timeout: 240000 })
	const snap = await page.evaluate(() => {
		const v = window.viewer
		const worldVisible = name => {
			let found = null
			window.vpx.three.tableGroup?.traverse(o => {
				if (found || !o.isMesh) return
				if (String(o.name || '').toLowerCase() !== name) return
				let p = o
				let vis = true
				while (p) {
					if (!p.visible) {
						vis = false
						break
					}
					p = p.parent
				}
				found = vis
			})
			return found
		}
		const eng = v.wasmEngine?.engine
		let decoyRowVisible = null
		try {
			const prims = eng?.getBuffer?.('prims')
			if (prims?.view) {
				for (const [idx, n] of v.wasmEngine.partNames ?? []) {
					if (String(n).toLowerCase() !== 'playfield_mesh') continue
					for (let i = 0; i < prims.count; i++) {
						if (prims.view[i * prims.stride] === idx)
							decoyRowVisible = prims.view[i * prims.stride + 16] !== 0
					}
				}
			}
		} catch {}
		const dmd = eng?.getDmdFrame?.()
		return {
			scriptErrors: v.wasmEngine?.scriptErrorCount,
			decoyRowVisible,
			decoyVisible: worldVisible('primitive-playfield_mesh'),
			baseVisible: worldVisible('playfield_base'),
			dmdFrame: dmd ? `${dmd.width}x${dmd.height}#${dmd.frameId}` : null,
			dmdLast: v.dmd?.lastDmdFrameId,
			dmdVisible: (v.dmdMeshes || []).map(m => !!m.visible),
		}
	})
	check(snap.scriptErrors === 0, 'engine boots with zero script errors', `errors=${snap.scriptErrors}`)
	check(snap.baseVisible === true, 'playfield base renders', `visible=${snap.baseVisible}`)
	check(
		snap.decoyVisible === false,
		'live sync keeps the force-hidden playfield decoy hidden',
		`scene=${snap.decoyVisible} engine-row=${snap.decoyRowVisible}`,
	)
	// Artifact-aware DMD gate: pre-FlexDMD-bridge artifacts serve no frame
	// (overlay must stay hidden); rebuilt artifacts mirror the script's
	// FlexDMD stage through getDmdFrame (overlay must show it).
	const bridged = snap.dmdFrame !== null
	const dmdOk = bridged
		? (snap.dmdVisible || []).some(x => x === true) && (snap.dmdLast ?? -1) >= 0
		: (snap.dmdVisible || []).every(x => x === false)
	check(
		dmdOk,
		bridged ? 'FlexDMD DMD frame presented on the overlay' : 'DMD overlay stays hidden with no DMD source',
		`frame=${snap.dmdFrame} last=${snap.dmdLast} meshVisible=[${(snap.dmdVisible || []).join(',')}]`,
	)
	// Coin + start + plunge: the lamp buffer must go live on this table.
	await page.keyboard.press('Digit5')
	await sleep(1500)
	await page.keyboard.press('Digit1')
	await sleep(5000)
	const lamps = await page.evaluate(() => {
		const v = window.viewer
		const lb = v.wasmEngine?.engine?.getBuffer?.('lights')
		if (!lb?.view) return { count: 0, nonzero: 0, med: 0 }
		const vals = []
		for (let i = 0; i < lb.count; i++) {
			const v = lb.view[i * lb.stride + 1]
			if (v !== 0) vals.push(v)
		}
		vals.sort((a, b) => a - b)
		return { count: lb.count, nonzero: vals.length, med: vals.length ? vals[(vals.length / 2) | 0] : 0 }
	})
	// Magnitude as well as count: nonzero-only rows pass even when every
	// lamp sits at a frozen near-zero residual; a started game holds inserts
	// at base scale (median 120 on this table).
	check(
		lamps.nonzero > 0 && lamps.med >= 50,
		'lamps go live after coin+start',
		`${lamps.nonzero}/${lamps.count} lit, med=${Number(lamps.med).toFixed(1)}`,
	)
	// Digit-image set the script serves (Chars() mapping): d_0..d_9,
	// d_empty, d_plus, d_minus, d_dot. Digits(40) may serve 'bkborder' and
	// Chars() may serve '', so the check is intentionally existential, and
	// it also requires the sync to have applied the names to the scene.
	const pollDigits = () =>
		page.evaluate(() => {
			const eng = window.viewer?.wasmEngine?.engine
			if (!eng || typeof eng.getFlasherImage !== 'function') return null
			let catalog = []
			try {
				catalog = JSON.parse(eng.getPartCatalogJson() || '[]')
			} catch {
				return null
			}
			const live = []
			for (const part of catalog) {
				if (!part || part.type !== 'flasher') continue
				const image = eng.getFlasherImage(part.idx)
				if (typeof image === 'string' && image.startsWith('d_'))
					live.push({ idx: part.idx, name: `${part.name}=${image}` })
			}
			const applied = window.viewer?.wasmEngine?.sync?.lastFlasherImages
			const missing = applied instanceof Map ? live.filter(d => !applied.has(d.idx)) : live.slice()
			return { live: live.map(d => d.name), missing: missing.map(d => d.name) }
		})
	let digits = await pollDigits()
	for (
		let attempt = 1;
		attempt < 3 && (!digits || digits.live.length === 0 || digits.missing.length > 0);
		attempt++
	) {
		await sleep(2000)
		digits = await pollDigits()
	}
	check(
		!!digits && digits.live.length > 0 && digits.missing.length === 0,
		'digit flashers show live script score images, applied to the scene',
		digits
			? `${digits.live.length} live, ${digits.missing.length} unapplied (${digits.live.slice(0, 4).join(', ')}${digits.live.length > 4 ? ', …' : ''})`
			: 'no engine facade',
	)
} catch (error) {
	console.log(`FATAL: ${String(error?.message ?? error).slice(0, 300)}`)
	process.exit(1)
} finally {
	await browser?.close?.()
}

const failed = checks.filter(c => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} cadet checks passed`)
process.exit(failed.length ? 1 : 0)

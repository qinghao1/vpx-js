// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Main-thread vs OffscreenCanvas-worker pixel A/B: both renderers must
// present EXACTLY the same pixels. Same table, same viewport, same boot
// framing (shared assembly), same scripted poses; main pixels come from the
// backing store (canvas.toDataURL, no compositor in the loop), worker pixels
// from full-frame readback-png posts. Comparison runs in-page (zero node
// image deps): both PNGs decoded, per-pixel diff count + FNV-1a hashes.
// Coverage: boot pose, scripted orbit pose, and settled lamp states (insert
// overlays + GI point light) driven through the real per-side consumer
// (applyChangedStates vs _encodeWorkerDeltas) — the worker board-animation
// path. Run: node test/harness/verify-worker-ab.mjs. Exit 0 pass, 1 fail.

import { writeFileSync } from 'node:fs'
import { waitReady } from '../../demo-browser/e2e/helpers.mjs'
import { ensureVite, launchBrowser, loadPuppeteer, newPage, sleep } from './utils.mjs'

const results = []
const check = (name, cond, detail = '') => {
	results.push({ name, ok: !!cond, detail })
	console.log(`${cond ? 'ok' : 'not ok'} - ${name}${detail ? ` (${detail})` : ''}`)
}

const VIEW = 'https://localhost:3000/'

async function openTable(browser, vpx, worker) {
	const page = await newPage(browser)
	const pageerrors = []
	page.on('pageerror', e => pageerrors.push(String(e?.message ?? e).slice(0, 200)))
	// The worker never batches (per-mesh lookups feed deltas + ball/DMD), so
	// the main side runs unbatched too: same geometry path, bit-comparable.
	// Batching parity (a deliberate FP-arithmetic change) is out of scope.
	const url = `${VIEW}?vpx=${vpx}&mode=viewer${worker ? '&worker=render' : '&nobatched=1'}`
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
	await waitReady(page, 240_000)
	if (worker) {
		await page.waitForFunction(() => !!window.viewer?._workerBridge, { timeout: 240_000 })
		const t0 = Date.now()
		await page.waitForFunction(() => typeof window.__workerStats?.lit === 'number', { timeout: 240_000 })
		console.log(`# worker first stats after ${((Date.now() - t0) / 1000).toFixed(1)}s`)
		const failed = await page.evaluate(() => window.__workerFailed ?? null)
		check('worker booted without timeout kill', failed === null, failed ?? '')
	}
	await page.waitForFunction(() => !!window.viewer?.tableGroup, { timeout: 240_000 })
	const settled = await settlePose(page)
	return { page, pageerrors, settled }
}

// Main backing-store pixels (no compositor): render synchronously then read
// the drawing buffer in the same task — a bare toDataURL races the
// compositor's buffer handoff and comes back blank under WebGPU/SwiftShader.
async function mainPNG(page) {
	return page.evaluate(() => {
		const v = window.viewer
		const canvas = v?.renderer?.domElement
		if (!v || !canvas) return null
		if (v.renderPipeline) v.renderPipeline.render()
		else v.renderer.render(v.scene, v.camera)
		return { url: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }
	})
}

async function workerPNG(page) {
	return page.evaluate(async () => {
		const bridge = window.viewer?._workerBridge
		if (!bridge) return null
		const bytes = await bridge.requestPixels()
		let bin = ''
		const CH = 0x8000
		for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH))
		return { b64: btoa(bin), n: bytes.length }
	})
}

// Decodes both PNGs, diffs pixels, FNV-1a hashes each side plus a solid
// scene-background reference (catches both-blank false passes).
async function compareInPage(page, b64a, b64b) {
	return page.evaluate(
		async (a, b) => {
			const decode = async b64 => {
				const bin = atob(b64)
				const bytes = new Uint8Array(bin.length)
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
				const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
				const c = document.createElement('canvas')
				c.width = bmp.width
				c.height = bmp.height
				const g = c.getContext('2d', { willReadFrequently: true })
				g.drawImage(bmp, 0, 0)
				return { w: bmp.width, h: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data }
			}
			const A = await decode(a)
			const B = await decode(b)
			const fnv = data => {
				let h1 = 0x811c9dc5
				for (let i = 0; i < data.length; i++) {
					h1 ^= data[i]
					h1 = Math.imul(h1, 0x01000193)
				}
				return (h1 >>> 0).toString(16).padStart(8, '0')
			}
			if (A.w !== B.w || A.h !== B.h) return { match: false, reason: `size ${A.w}x${A.h} vs ${B.w}x${B.h}` }
			let diff = 0
			let maxAbs = 0
			const cols = 16
			const rows = 9
			const cells = new Array(cols * rows).fill(0)
			for (let i = 0; i < A.data.length; i += 4) {
				const px = (i / 4) | 0
				let pd = 0
				for (let k = 0; k < 4; k++) {
					const d = Math.abs(A.data[i + k] - B.data[i + k])
					if (d > 0) {
						diff++
						pd = 1
						if (d > maxAbs) maxAbs = d
					}
				}
				if (pd) {
					const x = px % A.w
					const y = ((px / A.w) | 0) % A.h
					const cx = Math.min(cols - 1, ((x / A.w) * cols) | 0)
					const cy = Math.min(rows - 1, ((y / A.h) * rows) | 0)
					cells[cy * cols + cx]++
				}
			}
			const top = cells
				.map((c, i) => [c, i])
				.sort((x, y) => y[0] - x[0])
				.slice(0, 5)
				.filter(([c]) => c > 0)
				.map(([c, i]) => `(${(i % cols) | 0},${(i / cols) | 0}:${c}`)
				.join(' ')
			const samples = []
			if (diff > 0) {
				for (let i = 0; i < A.data.length && samples.length < 6; i += 4) {
					if (
						A.data[i] !== B.data[i] ||
						A.data[i + 1] !== B.data[i + 1] ||
						A.data[i + 2] !== B.data[i + 2] ||
						A.data[i + 3] !== B.data[i + 3]
					) {
						const pxx = (i / 4) | 0
						samples.push(
							`${pxx % A.w},${(pxx / A.w) | 0}:[${A.data[i]},${A.data[i + 1]},${A.data[i + 2]},${A.data[i + 3]}]/[${B.data[i]},${B.data[i + 1]},${B.data[i + 2]},${B.data[i + 3]}]`,
						)
						i += 79996
					}
				}
			}
			const bg = document.createElement('canvas')
			bg.width = A.w
			bg.height = A.h
			const g = bg.getContext('2d')
			g.fillStyle = '#121a2b'
			g.fillRect(0, 0, A.w, A.h)
			const bgHash = fnv(g.getImageData(0, 0, A.w, A.h).data)
			const hashA = fnv(A.data)
			const hashB = fnv(B.data)
			// Visual diff overlay (red = any channel differs): written to disk
			// on mismatch so a failing A/B can be read at a glance.
			let diffUrl = null
			if (diff > 0) {
				const dc = document.createElement('canvas')
				dc.width = A.w
				dc.height = A.h
				const dg = dc.getContext('2d')
				const out = dg.createImageData(A.w, A.h)
				for (let i = 0; i < A.data.length; i += 4) {
					const same =
						A.data[i] === B.data[i] && A.data[i + 1] === B.data[i + 1] && A.data[i + 2] === B.data[i + 2]
					out.data[i] = same ? A.data[i] : 255
					out.data[i + 1] = same ? A.data[i + 1] : 0
					out.data[i + 2] = same ? A.data[i + 2] : 0
					out.data[i + 3] = 255
				}
				dg.putImageData(out, 0, 0)
				diffUrl = dc.toDataURL('image/png')
			}
			return { match: diff === 0, diff, maxAbs, hashA, hashB, bgHash, w: A.w, h: A.h, top, diffUrl, samples }
		},
		b64a,
		b64b,
	)
}

async function cameraPose(page) {
	return page.evaluate(() => ({
		pos: window.viewer.camera.position.toArray(),
		tgt: window.viewer.controls.target.toArray(),
		fov: window.viewer.camera.fov,
	}))
}

async function setPose(page, pos, tgt) {
	await page.evaluate(
		(p, t) => {
			const v = window.viewer
			v.controls.enableDamping = false
			v.camera.position.set(p[0], p[1], p[2])
			v.controls.target.set(t[0], t[1], t[2])
			v.controls.update()
		},
		pos,
		tgt,
	)
	await settlePose(page)
	const after = await cameraPose(page)
	const dPos = Math.hypot(after.pos[0] - pos[0], after.pos[1] - pos[1], after.pos[2] - pos[2])
	const dTgt = Math.hypot(after.tgt[0] - tgt[0], after.tgt[1] - tgt[1], after.tgt[2] - tgt[2])
	console.log(`# pose hold: dPos=${dPos.toFixed(2)} dTgt=${dTgt.toFixed(2)}`)
	return dPos < 1 && dTgt < 1
}

// Camera-animation races make fixed sleeps flaky: poll the pose until it
// stops moving (or time out loudly — a perpetually drifting camera is a
// product bug, not harness noise).
async function settlePose(page, timeoutMs = 30000) {
	let prev = await cameraPose(page)
	const start = Date.now()
	for (;;) {
		await sleep(500)
		const cur = await cameraPose(page)
		const moved =
			Math.hypot(cur.pos[0] - prev.pos[0], cur.pos[1] - prev.pos[1], cur.pos[2] - prev.pos[2]) +
			Math.hypot(cur.tgt[0] - prev.tgt[0], cur.tgt[1] - prev.tgt[1], cur.tgt[2] - prev.tgt[2])
		if (moved < 0.05) return true
		prev = cur
		if (Date.now() - start > timeoutMs) return false
	}
}

// Frame-hash for settle polling: main toDataURL bytes hashed in node,
// worker PNG bytes hashed in node. Equal consecutive hashes = settled. For
// the worker the version must also advance during the window: a stalled
// worker serves the same stale frame forever, which hashes "stable".
async function settle(page, worker, timeoutMs = 60000) {
	const hashMain = async () => {
		const shot = await mainPNG(page)
		if (!shot?.url) return 'none'
		let h = 0x811c9dc5
		const s = shot.url
		for (let i = 0; i < s.length; i += 4096) {
			for (let j = i; j < Math.min(i + 4096, s.length); j++) {
				h ^= s.charCodeAt(j)
				h = Math.imul(h, 0x01000193)
			}
		}
		return (h >>> 0).toString(16)
	}
	const hashWorker = async () => {
		const shot = await workerPNG(page)
		if (!shot?.b64) return 'none'
		let h = 0x811c9dc5
		const s = shot.b64
		for (let i = 0; i < s.length; i += 4096) {
			for (let j = i; j < Math.min(i + 4096, s.length); j++) {
				h ^= s.charCodeAt(j)
				h = Math.imul(h, 0x01000193)
			}
		}
		return (h >>> 0).toString(16)
	}
	const hash = worker ? hashWorker : hashMain
	const readVersion = () => page.evaluate(() => window.__workerStats?.version ?? -1)
	const versions = new Set()
	let prev = await hash()
	if (worker) versions.add(await readVersion())
	const start = Date.now()
	for (;;) {
		await sleep(1000)
		const cur = await hash()
		if (worker) versions.add(await readVersion())
		if (cur === prev && cur !== 'none' && (!worker || versions.size > 1)) return true
		prev = cur
		if (Date.now() - start > timeoutMs) return false
	}
}

// Same lamp pose on both sides: mutate the live lamp state, then apply it.
// A synthetic staged-only delta would be overwritten by the full live lamp
// levels riding every frame; mutating live carries the pose through the real
// path (popStates picks it up, worker publishes it, fan-out re-evaluates
// overlays from the new value). The pose holds until changed.
async function injectLamp(page, worker, lamp, intensity) {
	return page.evaluate(
		(l, v) => {
			const viewer = window.viewer
			if (!viewer) return { ok: false, detail: 'no viewer' }
			try {
				const st = viewer.table?.lights?.[l]?.getState?.()
				if (!st) return { ok: false, detail: 'no lamp state' }
				st.intensity = v
				viewer.applyChangedStates({ changedStates: { [l]: { intensity: v } }, isEmpty: false, release() {} })
				return { ok: true, detail: '' }
			} catch (e) {
				return { ok: false, detail: String(e?.message ?? e).slice(0, 160) }
			}
		},
		lamp,
		intensity,
	)
}

async function lampDataIntensity(page, lamp) {
	return page.evaluate(l => window.viewer?.table?.lights?.[l]?.data?.intensity, lamp)
}

function dataUrlToB64(dataUrl) {
	return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

function saveMismatch(tag, mainB64, workerB64, diffUrl) {
	try {
		writeFileSync(`/tmp/ab-${tag}-main.png`, Buffer.from(mainB64, 'base64'))
		writeFileSync(`/tmp/ab-${tag}-worker.png`, Buffer.from(workerB64, 'base64'))
		if (diffUrl) writeFileSync(`/tmp/ab-${tag}-diff.png`, Buffer.from(dataUrlToB64(diffUrl), 'base64'))
	} catch {}
}

async function abCase(browser, cmpPage, tag, vpx, pose, lampOps = []) {
	// Sequential pages: a backgrounded page's rAF loop freezes, so its
	// canvas goes stale. Each side poses, settles, and captures while its
	// own page is active, then closes before the other side opens.
	const runSide = async isWorker => {
		const handle = await openTable(browser, vpx, isWorker)
		try {
			check(`${tag}: ${isWorker ? 'worker' : 'main'} camera settled`, handle.settled)
			const { page } = handle
			if (!pose && lampOps.length === 0) {
				const bootPose = await cameraPose(page)
				const v0 = await page.evaluate(() => window.__workerStats?.version ?? -1)
				await sleep(1500)
				const v1 = await page.evaluate(() => window.__workerStats?.version ?? -1)
				if (isWorker) check(`${tag}: worker consumes frames`, v1 > v0, `version ${v0} -> ${v1}`)
				const shotSettled = await settle(page, isWorker, isWorker ? 120000 : 60000)
				check(`${tag}: ${isWorker ? 'worker' : 'main'} boot settled`, shotSettled)
				const shot = isWorker ? await workerPNG(page) : await mainPNG(page)
				return { bootPose, shot, pageerrors: handle.pageerrors }
			}
			if (pose) {
				const boot = await cameraPose(page)
				const pos = [boot.pos[0] + pose[0], boot.pos[1] + pose[1], boot.pos[2] + pose[2]]
				const held = await setPose(page, pos, boot.tgt)
				check(`${tag}: ${isWorker ? 'worker' : 'main'} scripted pose holds`, held)
			}
			for (const [lamp, level] of lampOps) {
				const inj = await injectLamp(page, isWorker, lamp, level)
				check(`${tag}: ${isWorker ? 'worker' : 'main'} inject ${lamp}=${level} accepted`, inj.ok, inj.detail)
				const shotSettled = await settle(page, isWorker, 120000)
				check(`${tag}: ${isWorker ? 'worker' : 'main'} settled ${lamp}=${level}`, shotSettled)
			}
			const shot = isWorker ? await workerPNG(page) : await mainPNG(page)
			return { bootPose: null, shot, pageerrors: handle.pageerrors }
		} finally {
			// Prompt per-page teardown: page.close alone leaves the worker
			// thread + GPU state to GC, which accumulates across sequential
			// heavyweight pages until the renderer process dies.
			try {
				await handle.page.evaluate(() => window.viewer?.destroy?.())
			} catch {}
			try {
				await handle.page.close()
			} catch {}
		}
	}
	const mainData = await runSide(false)
	const workerData = await runSide(true)
	const pm = mainData.bootPose
	const pw = workerData.bootPose
	if (pm && pw) {
		const dPos = Math.hypot(pm.pos[0] - pw.pos[0], pm.pos[1] - pw.pos[1], pm.pos[2] - pw.pos[2])
		const dTgt = Math.hypot(pm.tgt[0] - pw.tgt[0], pm.tgt[1] - pw.tgt[1], pm.tgt[2] - pw.tgt[2])
		check(
			`${tag}: boot framing matches`,
			dPos < 1 && dTgt < 1 && Math.abs(pm.fov - pw.fov) < 0.01,
			`dPos=${dPos.toFixed(2)} dTgt=${dTgt.toFixed(2)} fov=${pm.fov}/${pw.fov}`,
		)
	}
	const mainShot = mainData.shot
	const workerShot = workerData.shot
	check(
		`${tag}: pixels captured`,
		!!mainShot?.url && !!workerShot?.b64,
		`main=${mainShot?.w}x${mainShot?.h} workerBytes=${workerShot?.n}`,
	)
	if (!mainShot?.url || !workerShot?.b64) return
	const cmp = await compareInPage(cmpPage, dataUrlToB64(mainShot.url), workerShot.b64)
	if (!cmp.match) saveMismatch(tag, dataUrlToB64(mainShot.url), workerShot.b64, cmp.diffUrl)
	const bgNote = cmp.hashA === cmp.bgHash || cmp.hashB === cmp.bgHash ? ' BLANK!' : ''
	check(
		`${tag}: pixels exactly match`,
		cmp.match === true && cmp.hashA !== cmp.bgHash && cmp.hashB !== cmp.bgHash,
		`diff=${cmp.diff} maxAbs=${cmp.maxAbs} hash=${cmp.hashA?.slice(0, 8)}/${cmp.hashB?.slice(0, 8)}${cmp.top ? ` top=${cmp.top}` : ''}${cmp.samples?.length ? ` samp=${cmp.samples.join(' ')}` : ''}${bgNote}${cmp.reason ? ` ${cmp.reason}` : ''}`,
	)
	check(
		`${tag}: no pageerrors`,
		mainData.pageerrors.length === 0 && workerData.pageerrors.length === 0,
		[...mainData.pageerrors, ...workerData.pageerrors].slice(0, 2).join(' | '),
	)
}

await ensureVite('https://localhost:3000/', { label: 'verify-worker-ab' })
const puppeteer = await loadPuppeteer()
const browser = await launchBrowser(puppeteer, { autoKillMs: 600_000 })
// Blank scratch page for pixel comparison (both table pages are closed by
// compare time; a blank page has no rAF loop to freeze).
const cmpPage = await newPage(browser)
try {
	const FLIP = '/test/fixtures/table-flipper.vpx'
	const TWD = '/test/fixtures/walking_dead.vpx'
	// AB_ONLY=boot runs just the boot cases (fast iteration on capture bugs).
	const ONLY = (process.env.AB_ONLY ?? '').toLowerCase()
	const run = (tag, ...args) => (!ONLY || tag.includes(ONLY) ? abCase(browser, cmpPage, tag, ...args) : null)
	await run('flipper-boot', FLIP)
	await run('flipper-orbit', FLIP, [220, 0, 120])

	// TWD lamp levels from authored data (read once, reused for both sides).
	const probe = await openTable(browser, TWD, false)
	const on032 = await lampDataIntensity(probe.page, '032')
	const giLamp = '106'
	const onGI = await lampDataIntensity(probe.page, giLamp)
	try {
		await probe.page.evaluate(() => window.viewer?.destroy?.())
	} catch {}
	try {
		await probe.page.close()
	} catch {}
	check('twd lamp data readable', Number.isFinite(on032) && Number.isFinite(onGI), `032=${on032} ${giLamp}=${onGI}`)

	await run('twd-boot', TWD)
	await run('twd-orbit', TWD, [260, 0, 160])
	if (Number.isFinite(on032)) {
		await run('twd-insrt-on', TWD, null, [['032', on032]])
		await run('twd-insrt-off', TWD, null, [['032', 0]])
	}
	if (Number.isFinite(onGI)) {
		await run('twd-gi-off', TWD, null, [[giLamp, 0]])
		await run('twd-gi-on', TWD, null, [[giLamp, onGI]])
	}
} catch (e) {
	check('harness completed', false, String(e).slice(0, 200))
} finally {
	try {
		await browser.close()
	} catch {}
}
const failed = results.filter(r => !r.ok).length
console.log(failed === 0 ? 'WORKER AB PASS' : `WORKER AB FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)

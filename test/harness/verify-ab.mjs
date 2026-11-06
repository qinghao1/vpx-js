// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * A/B parity harness: SAME table+ROM, SAME scripted match, both engines.
 *
 * NEW = working tree (WASM engine: headless seam + viewer `wasmEngine`).
 * OLD = pre-rescope tree at git HEAD, reconstructed read-only to --old-dir
 * (default /tmp/vpx-js-old) via `git archive HEAD`; its viewer serves through
 * the NEW vite server (`fs.strict:false` admits /@fs/tmp/...), so no second
 * server and no tree edits to either engine. OLD PinMAME is mock-only: ROM
 * phases (coins/start/eject) are staged identically-but-inertly and compared
 * as explicable deviations, never asserted equal.
 *
 * Scripted match (both sides, paced stepping): boot -> 6x coin -> start ->
 * full plunger -> free-roll -> timed flipper taps (both flippers, 150 ms per
 * ~2 s, up to 15) with drain watch + up to 2 relaunches.
 *
 * Gates: scene structure, GI lit count, settle-gated screenshots, gameplay
 * events (eject/launch/drains/relaunches), physics (plunge min-y, drain-line
 * corridor, NaN/frozen/teleport, flipper excursion), DMD lit frames, audio
 * (attract silence + coin/start bursts, single-scheduling, no double-play),
 * plus input trusted-key flipper gates (shift/arrowL/arrowR-new,
 * TOL.flipperKey; no OLD gate — mock-OLD ships no emulation, so the
 * script-only input contract cannot move OLD flippers), render
 * drain-triangle-set-new (zero visible 3-index
 * meshes on NEW; OLD leftover noted, not gated), render
 * showcase-dmd-shown-new/old (DMD panel present; visible once the same
 * leg's DMD texture is lit), plus the four named regression gates:
 * gi-color, ball-visible, audio-single-scheduling, physics-steps-per-sec.
 *
 * Run: node test/harness/verify-ab.mjs [--vpx=...] [--rom=...]
 *   [--old-dir=/tmp/vpx-js-old] [--out=/tmp/ab]
 *   [--phase=A|B|C|all] [--port=3199] [--old-port=3200] [--seed=1337]
 * Legs: A = NEW headless paced match, B = NEW viewer, C = OLD viewer+match
 * (served by the OLD tree's own vite on --old-port, default port+1).
 * Default `all` runs A->B->C and takes a host-wide full-run lock; single legs
 * skip it but MUST use a distinct --port AND --out so concurrent runs cannot
 * collide on the vite servers, screenshots, or report JSON (keep --port
 * values 2 apart so the OLD server never collides either).
 * Exit: 0 pass, 77 skip (no VPX/ROM, no puppeteer, artifact or OLD missing), 1 fail.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { attachLogging, ensureVite, launchBrowser, loadPuppeteer, newPage } from './utils.mjs'

const arg = name => {
	const hit = process.argv.find(a => a === name || a.startsWith(`${name}=`))
	if (!hit) return undefined
	if (hit.includes('=')) return hit.slice(name.length + 1)
	const i = process.argv.indexOf(hit)
	return process.argv[i + 1]
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---- leg selection + isolation ---------------------------------------------
// --phase=A|B|C (comma list) runs legs independently; default `all` runs
// A->B->C and takes a host-wide full-run lock so two full runs cannot share
// vite servers, profile, or OUT dir. Single-leg validation runs bypass the
// lock and MUST pass a distinct --port AND --out (ports 2 apart).
const PHASES = (() => {
	const raw = (arg('--phase') || 'all').toUpperCase()
	const parts = raw
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
	if (parts.includes('ALL')) return ['A', 'B', 'C']
	for (const p of parts) {
		if (!['A', 'B', 'C'].includes(p)) {
			console.error(`usage: --phase=A|B|C|all (comma list); got "${arg('--phase')}"`)
			process.exit(2)
		}
	}
	return [...new Set(parts)]
})()
const wantPhase = l => PHASES.includes(l)
const FULL_RUN = PHASES.length === 3
const PORT = arg('--port') || process.env.VPX_AB_PORT || '3000'
const BASE = `https://localhost:${PORT}`
// OLD viewer runs on its own vite (old tree, old aliases, old dist-esm) so the
// NEW server config can never break it; defaults to the next port. Concurrent
// runs need distinct --port values at least 2 apart plus distinct --out.
const OLD_PORT = arg('--old-port') || String(Number(PORT) + 1)
const OLD_BASE = `https://localhost:${OLD_PORT}`
const SEED = Number(arg('--seed') ?? 1337)
// Browser watchdog budget: viewer legs + ball gates exceed the 5 min launcher
// default under SwiftShader (sibling drain probes use 40 min); the exit-cleanup
// in utils.mjs still reaps the browser, so a generous budget only moves the
// kill past the last gate instead of into the middle of a leg.
const BROWSER_BUDGET_MS = 1800000
const FULL_LOCK = join(process.env.TMPDIR || '/tmp', 'verify-ab-full.lock')
function acquireFullLock() {
	try {
		const prev = readFileSync(FULL_LOCK, 'utf8').trim().split(/\s+/)[0]
		if (prev && prev !== String(process.pid)) {
			try {
				process.kill(Number(prev), 0)
				return { ok: false, pid: prev }
			} catch {}
		}
	} catch {}
	try {
		writeFileSync(FULL_LOCK, `${process.pid} ${new Date().toISOString()}\n`)
	} catch {}
	return { ok: true }
}
function releaseFullLock() {
	try {
		const prev = readFileSync(FULL_LOCK, 'utf8').trim().split(/\s+/)[0]
		if (prev === String(process.pid)) rmSync(FULL_LOCK, { force: true })
	} catch {}
}

// Explicit tolerances: every quantitative gate names its bound here.
const TOL = {
	plungeMinY: 75, // VPX units, NEW vs OLD plunge min-y (cross-engine spring spread; launch gate still requires minY<1500)
	giLitRatio: 0.25, // |new-old| GI lit fraction of max
	giBlueShift: 12, // (B-R) ceiling on NEW playfield-top mean, 0-255
	giBlueShiftParity: 15, // |(B-R)new - (B-R)old| ceiling
	shotSettle: 6.0, // consecutive-capture mean-abs-diff ceiling, 0-255
	shotNonBlank: 1.0, // capture mean-brightness floor (dark room-wide reads ~2.1 both sides; black-frame refusal is 0.5)
	audioSilenceRms: 0.005, // attract-window RMS ceiling
	audioBurstRms: 0.005, // burst-window RMS floor (or peak, below)
	audioBurstPeak: 0.05, // burst-window peak floor
	audioFramesRatio: [0.5, 1.5], // drained/nominal frames per step during bursts
	stepsPerSec: 2, // live-loop floor: the loop must keep stepping under SwiftShader jank (unit specs + paced probes pin the quanta; absolute 60 Hz is unobservable headless)
	stepsParityRatio: [0.1, 4], // NEW/OLD cadence ratio (SwiftShader starvation x intentional catch-up clamp; floors + paced match pin correctness)
	flipperExcursion: 0.1, // native angle units, per-side min range during taps
	flipperKey: 0.001, // trusted-key hold excursion floor (pre-fix arrows read exactly 0; post-fix ~0.01-0.09 at 1 fps)
	// Geometry bands below are TWD-tuned; re-derive per table.
	drainCorridor: [50, 750], // last-in-play x band at a drain transition (left outlane drains at ~89; breaches drain far outside)
	inPlayX: [30, 950], // in-play ball x bounds (left outlane rattle reaches ~40 center; escapes go negative/huge or teleport)
	teleportGap: 600, // single-sample displacement flag, VPX units (plunger-launch peaks hit ~500u per 5-step sample; gross teleports are thousands)
	frozenSteps: 180, // unmoved (<0.5u) in-play span flag
	frozenEps: 0.5,
	inPlayY: 1900, // trough slots rest at y in [1940,2080]
	launchY: 1500,
}

const OUT = resolve(arg('--out') || '/tmp/ab')
mkdirSync(OUT, { recursive: true })
const tapLines = []
let tapTotal = 0
let tapFailed = 0
const tap = (ok, name, detail) => {
	tapTotal++
	if (!ok) tapFailed++
	tapLines.push(`${ok ? 'ok' : 'not ok'} ${tapTotal} - ${name}${detail ? ` -- ${detail}` : ''}`)
}
const skip = (name, reason) => {
	tapTotal++
	tapLines.push(`ok ${tapTotal} - ${name} # SKIP ${reason}`)
}
// Gate with missing-input guard: full runs always have every leg's data, so
// `ready` is true and the TAP line is identical; single-leg runs SKIP the
// gates they cannot evaluate instead of throwing (which would append an
// extra ab-fatal line and break the gate contract).
const gate = (ready, ok, name, detail) => {
	if (ready) tap(ok, name, detail)
	else skip(name, 'phase not run')
}
const comment = msg => console.log(`# ${String(msg).slice(0, 400)}`)

function finish(report) {
	releaseFullLock()
	// Persist the TAP verdicts inside the report: teardown hangs and kills
	// lose piped stdout, but the JSON on disk must still say pass/fail.
	writeFileSync(
		join(OUT, 'verify-ab.json'),
		JSON.stringify({ ...report, tap: { total: tapTotal, failed: tapFailed, lines: tapLines } }, null, 1),
	)
	for (const line of tapLines) console.log(line)
	console.log(`1..${tapTotal}`)
	process.exitCode = tapFailed === 0 ? 0 : 1
}

function skipAll(reason) {
	console.log('TAP version 13')
	console.log(`# vpx-js A/B parity -- ${new Date().toISOString()}`)
	console.log(`# SKIP: ${reason}`)
	console.log('1..0')
	process.exit(77)
}

// ---- OLD worktree (read-only: verify, never modify) ------------------------
function ensureOldTree() {
	try {
		if (!existsSync(OLD_DIR)) {
			mkdirSync(OLD_DIR, { recursive: true })
			execSync(`git archive HEAD | tar -x -C ${OLD_DIR}`, { cwd: process.cwd(), timeout: 180000, stdio: 'pipe' })
		}
		for (const f of ['package.json', 'demo-browser/src/viewer.ts', 'lib/game/player.ts']) {
			const want = execSync(`git show HEAD:${f}`, { encoding: 'buffer', timeout: 30000, stdio: 'pipe' })
			const got = readFileSync(join(OLD_DIR, f))
			if (!want.equals(got)) {
				return {
					ok: false,
					reason: `OLD worktree ${f} differs from HEAD ${headSha}; remove ${OLD_DIR} to re-provision`,
				}
			}
		}
		if (!existsSync(join(OLD_DIR, 'dist-esm'))) {
			return {
				ok: false,
				reason: `OLD worktree has no dist-esm (provision: npm ci && npm run build:esm in ${OLD_DIR})`,
			}
		}
		if (!existsSync(join(OLD_DIR, 'node_modules'))) {
			return { ok: false, reason: `OLD worktree has no node_modules (provision: npm ci in ${OLD_DIR})` }
		}
		return { ok: true }
	} catch (e) {
		return { ok: false, reason: `OLD worktree provisioning failed: ${String(e?.message ?? e).slice(0, 200)}` }
	}
}

// ---- scripted match driver (identical phase shape, both engines) -----------
async function runScriptedMatch(driver) {
	const traj = {}
	const notes = driver.notes
	const C = async (label, opts) => {
		const r = await driver.chunk(label, opts)
		traj[label] = r
		comment(
			`${driver.side} ${label}: steps=${r.steps} balls=${JSON.stringify((r.finalBalls ?? []).map(b => b.slice(0, 3)))}${r.dmdBoot ? ` dmdBoot@${r.dmdBoot[0]}` : ''}${r.servedAt !== undefined ? ` served@${r.servedAt}` : ''}${r.playAt !== undefined ? ` play@${r.playAt}` : ''}`,
		)
		return r
	}
	await C('boot', driver.bootOpts)
	for (let c = 1; c <= 6; c++) await C(`coin${c}`, { press: ['Digit5'], holdSteps: 15, steps: 135, dmdEvery: 60 })
	await C('start', { press: ['Digit1'], holdSteps: 20, steps: 320, sampleEvery: 20, dmdEvery: 40 })
	if (driver.stage) {
		const staged = await driver.stage('plunge', notes)
		traj['plunge-stage'] = {
			steps: 0,
			samples: [],
			dmd: [],
			flips: [],
			plungers: [],
			events: [],
			finalBalls: staged ?? [],
			staged: staged !== null,
		}
	}
	await C('serve', { steps: 400, sampleEvery: 20, stopWhenShooter: true })
	await C('plunge', { press: ['Enter'], holdSteps: 60, steps: 460, sampleEvery: 5, dmdEvery: 40, plungerTrace: true })
	await C('freeroll', { steps: 600, sampleEvery: 5, dmdEvery: 20 })
	const taps = []
	const relaunches = []
	const doRelaunch = async () => {
		const n = relaunches.length
		notes.push(`relaunch${n}: start pressed`)
		await C(`relaunch${n}-start`, { press: ['Digit1'], holdSteps: 20, steps: 200, sampleEvery: 20 })
		if (driver.stage) {
			const staged = await driver.stage(`relaunch${n}`, notes)
			traj[`relaunch${n}-stage`] = {
				steps: 0,
				samples: [],
				dmd: [],
				flips: [],
				plungers: [],
				events: [],
				finalBalls: staged ?? [],
				staged: staged !== null,
			}
		}
		const serve = await C(`relaunch${n}-serve`, { steps: 400, sampleEvery: 20, stopWhenShooter: true })
		const rp = await C(`relaunch${n}-plunge`, { press: ['Enter'], holdSteps: 60, steps: 400, sampleEvery: 5 })
		const ok = rp.finalBalls.some(inPlayRow) || (rp.samples ?? []).some(s => s[1].some(inPlayRow))
		relaunches.push({ n, ok, served: serve.servedAt !== undefined })
		notes.push(`relaunch${n}: ${ok ? 'ok' : 'FAILED'} served=${serve.servedAt !== undefined}`)
		comment(`${driver.side} relaunch${n}: ${ok ? 'ok' : 'FAILED'}`)
		return ok
	}
	for (let t = 0; t < 15; t++) {
		const r = await C(`tap${t}`, {
			press: ['ShiftLeft', 'ShiftRight'],
			holdSteps: 9,
			steps: 14,
			sampleEvery: 1,
			flipTrace: true,
			dmdEvery: 7,
		})
		const inPlay = r.finalBalls.some(inPlayRow)
		taps.push({ tap: t, inPlay, n: r.finalBalls.length })
		if (inPlay) {
			await C(`tap${t}-gap`, { steps: 120, sampleEvery: 10, dmdEvery: 30 })
			continue
		}
		const w = await C(`tap${t}-watch`, { steps: 120, sampleEvery: 10, dmdEvery: 30 })
		if (w.finalBalls.some(inPlayRow)) continue
		notes.push(`drain suspected after tap${t}`)
		if (relaunches.length < 2) {
			if (!(await doRelaunch())) break
		} else {
			notes.push('drains with no relaunches left; ending tap phase')
			break
		}
	}
	const finals = Object.values(traj).filter(c => c?.finalBalls)
	const lastFinal = finals.length ? finals[finals.length - 1].finalBalls : []
	if (!lastFinal.some(inPlayRow) && relaunches.length < 2) {
		notes.push('final recovery attempt')
		await doRelaunch()
	}
	return { traj, taps, relaunches, notes }
}

// ---- inputs ---------------------------------------------------------------
const home = homedir()
function resolveInput(_kind, cli, candidates) {
	if (cli && existsSync(cli)) return resolve(cli)
	for (const c of candidates) if (existsSync(c)) return c
	return null
}
const vpxPath = resolveInput('vpx', arg('--vpx'), [
	resolve('demo-browser/public/ab-tmp/twd.vpx'),
	join(home, 'Downloads/walking_dead/walking_dead.vpx'),
	join(home, 'Downloads/walking_dead.vpx'),
	resolve('walking_dead.vpx'),
])
const romPath = resolveInput('rom', arg('--rom'), [
	join(home, 'Downloads/walking_dead/twd_160h.zip'),
	join(home, 'Downloads/twd_160h.zip'),
	'/tmp/twd_160h.zip',
	resolve('demo-browser/public/ab-tmp/twd.zip'),
])
// Mount name must be the game name PinMAME looks for, not the file basename:
// mirrors romMountFileName() in lib/wasm/vpinball-wasm.ts over the raw table
// script (stored uncompressed in the VPX), falling back to the ROM basename.
function resolveMountName() {
	if (!vpxPath || !romPath) return 'twd_160h.zip'
	try {
		const text = readFileSync(vpxPath, 'latin1')
		const literal = text.match(/(?<!\w)\.?\s*GameName\s*=\s*"([^"]+)"/i)?.[1]
		if (literal) return `${literal}.zip`
		const ident = text.match(/(?<!\w)\.?\s*GameName\s*=\s*([A-Za-z_]\w*)/i)?.[1]
		const game = ident && text.match(new RegExp(`Const\\s+${ident}\\s*=\\s*"([^"]+)"`, 'i'))?.[1]
		if (game) return `${game}.zip`
	} catch {}
	return basename(romPath)
}
const OLD_DIR = resolve(arg('--old-dir') || '/tmp/vpx-js-old')
const headSha = (() => {
	try {
		return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
	} catch {
		return null
	}
})()
// /@fs URLs serve any vite-admitted path (fs.strict:false); nothing is copied
// into either tree, so the run leaves both engines untouched.
const vpxUrl = vpxPath ? `/@fs${vpxPath}` : null
const romUrl = romPath ? `/@fs${romPath}` : null

// ---- engine-agnostic in-page probes (serialized into the page) -------------
// Scene structure: room/cabinet/playfield/DMD-mesh presence, GI lit count.
// Reads the scene graph + DMD texture mirror only, never player/wasm
// internals beyond the ball rows both engines expose.
function abStruct() {
	const out = { hasViewer: false }
	try {
		const v = window.viewer
		out.hasViewer = !!v
		if (!v) return out
		out.viewerMode = v.viewerMode ?? null
		const g = v.tableGroup || window.tableGroup
		if (!g) {
			out.noGroup = true
			return out
		}
		try {
			out.room = !!(
				window.scene?.getObjectByName?.('vr_procedural_room') || g.getObjectByName?.('vr_procedural_room')
			)
		} catch {
			out.room = false
		}
		let cabVis = 0
		let cabHid = 0
		let playReady = 0
		let playPending = 0
		let ballMeshes = 0
		const lm = { gi: { total: 0, lit: 0 } }
		try {
			const ballsGroup = g.getObjectByName?.('balls')
			if (ballsGroup)
				ballsGroup.traverse(o => {
					if (o.isMesh && o.visible) ballMeshes++
				})
			g.traverse(o => {
				if (!o.isMesh) return
				const n = (o.name || '').toLowerCase()
				if (n.includes('vrcab') || n.includes('vr_') || n.includes('pincab')) {
					if (o.visible) cabVis++
					else cabHid++
				}
				if (n.includes('playfield') || n.includes('bm_') || n.includes('vlm')) {
					const mats = Array.isArray(o.material) ? o.material : [o.material]
					for (const m of mats) {
						if (!m) continue
						if (m.map || m.userData?.__map) playReady++
						else if (m.userData?.pendingMap || m.userData?.__mapName) playPending++
					}
				}
				if (o.name === 'ball' && o.visible) ballMeshes++
				if (n.includes('lm_') && (n.includes('gi0') || n.includes('gi1') || n.includes('_gi'))) {
					lm.gi.total++
					const m = Array.isArray(o.material) ? o.material[0] : o.material
					if (o.visible && ((m?.emissiveIntensity ?? 0) > 0.01 || (m?.opacity ?? 1) > 0.01)) lm.gi.lit++
				}
			})
		} catch (e) {
			out.traverseErr = String(e?.message ?? e).slice(0, 160)
		}
		out.cab = { vis: cabVis, hid: cabHid }
		out.bake = { ready: playReady, pending: playPending }
		out.lights = lm
		out.dmdMeshes = (v.dmdMeshes || []).map(m => {
			let vis = !!m.visible
			for (let p = m.parent; p && p !== v.tableGroup; p = p.parent) vis = vis && !!p.visible
			return { name: m.name, vis, map: !!m.material?.map }
		})
		try {
			const img = v.dmdTexture?.image
			const data = img?.data
			if (data?.length) {
				let mx = 0
				let sum = 0
				const stride = Math.max(1, Math.floor(data.length / 4096))
				for (let i = 0; i < data.length; i += stride) {
					const x = data[i]
					if (x > mx) mx = x
					sum += x
				}
				out.dmdTex = { w: img.width || 0, h: img.height || 0, max: mx, lit: sum > 0 }
			} else out.dmdTex = null
		} catch (e) {
			out.dmdTex = { err: String(e?.message ?? e).slice(0, 120) }
		}
		try {
			const eng = v.wasmEngine?.engine
			const b = eng?.getBuffer?.('balls')
			let inPlay = 0
			if (b) for (let i = 0; i < b.count; i++) if (b.view[i * b.stride + 2] < 1900) inPlay++
			out.engineBalls = b ? { count: b.count, inPlay } : { count: 0, inPlay: 0 }
		} catch {
			try {
				const balls = v.player?.getBalls?.() ?? v.player?.balls ?? []
				out.engineBalls = { count: balls.length, inPlay: balls.filter(b => b?.state?.pos?.y < 1900).length }
			} catch {
				out.engineBalls = null
			}
		}
		out.ballMeshes = ballMeshes
	} catch (e) {
		out.err = String(e?.stack || e).slice(0, 300)
	}
	return out
}

// Render the CURRENT camera into a downscaled mean RGB (settle-gate input).
function abReadback() {
	const out = {}
	try {
		const v = window.viewer
		const r = v.renderer || window.renderer
		r.render(v.scene || window.scene, v.camera || window.camera)
		const c = document.createElement('canvas')
		c.width = 160
		c.height = 112
		const ctx = c.getContext('2d', { willReadFrequently: true })
		ctx.drawImage(r.domElement, 0, 0, 160, 112)
		const d = ctx.getImageData(0, 0, 160, 112).data
		let R = 0
		let G = 0
		let B = 0
		for (let i = 0; i < d.length; i += 4) {
			R += d[i]
			G += d[i + 1]
			B += d[i + 2]
		}
		const n = d.length / 4
		out.rgb = [+(R / n).toFixed(1), +(G / n).toFixed(1), +(B / n).toFixed(1)]
		out.mean = +((R + G + B) / n / 3).toFixed(1)
	} catch (e) {
		out.err = String(e?.stack || e).slice(0, 300)
	}
	return out
}

// Pin a matched camera, force one render, read back a downscaled mean RGB.
// Same numbers on both sides = matched camera state; the (B-R) delta is the
// gi-color gate input (no blue-shift vs the OLD baseline histogram).
function abRgb() {
	const out = {}
	try {
		const v = window.viewer
		const r = v.renderer || window.renderer
		const scene = v.scene || window.scene
		const cam = v.camera || window.camera
		const ctr = v.controls || window.controls
		try {
			if (v._cameraGen !== undefined) v._cameraGen = (v._cameraGen ?? 0) + 1
		} catch {}
		try {
			if (v._cameraRaf) {
				cancelAnimationFrame(v._cameraRaf)
				v._cameraRaf = null
			}
		} catch {}
		try {
			if (v.controls) v.controls.enabled = false
		} catch {}
		cam.position.set(0, 190, 300)
		ctr.target.set(0, -3, 6)
		cam.updateMatrixWorld()
		try {
			ctr.update()
		} catch {}
		r.render(scene, cam)
		const c = document.createElement('canvas')
		c.width = 160
		c.height = 112
		const ctx = c.getContext('2d', { willReadFrequently: true })
		ctx.drawImage(r.domElement, 0, 0, 160, 112)
		const d = ctx.getImageData(0, 0, 160, 112).data
		let R = 0
		let G = 0
		let B = 0
		for (let i = 0; i < d.length; i += 4) {
			R += d[i]
			G += d[i + 1]
			B += d[i + 2]
		}
		const n = d.length / 4
		out.rgb = [+(R / n).toFixed(1), +(G / n).toFixed(1), +(B / n).toFixed(1)]
	} catch (e) {
		out.err = String(e?.stack || e).slice(0, 300)
	}
	return out
}

function abPinCamera(camPos, target) {
	try {
		const v = window.viewer
		try {
			if (v._cameraGen !== undefined) v._cameraGen = (v._cameraGen ?? 0) + 1
		} catch {}
		try {
			if (v._cameraRaf) {
				cancelAnimationFrame(v._cameraRaf)
				v._cameraRaf = null
			}
		} catch {}
		try {
			if (v.controls) v.controls.enabled = false
		} catch {}
		const cam = v.camera || window.camera
		const ctr = v.controls || window.controls
		if (cam && camPos) cam.position.set(camPos[0], camPos[1], camPos[2])
		if (ctr && target) ctr.target.set(target[0], target[1], target[2])
		if (cam) cam.updateMatrixWorld()
		try {
			ctr?.update()
		} catch {}
		try {
			;(v.renderer || window.renderer)?.render(v.scene || window.scene, cam)
		} catch {}
	} catch {}
}

function abFreezeAutoplay() {
	try {
		const v = window.viewer
		try {
			clearTimeout(v._autoPlayTimer)
			v._autoPlayTimer = null
		} catch {}
		try {
			v._scheduleAutoPlay = () => {}
		} catch {}
		try {
			clearTimeout(v._fallbackBallTimer)
			v._fallbackBallTimer = null
		} catch {}
		try {
			const l = document.getElementById('log')
			if (l) l.style.display = 'none'
		} catch {}
	} catch {}
}

// ---- NEW headless paced match ---------------------------------------------
// Loads the real ROM + table through loadHeadlessEngine, then runs the
// scripted match with paced stepping: boot -> 6x coin -> start -> plunger ->
// free-roll -> flipper taps with drain watch + up to 2 relaunches. PinMAME
// runs at wall pace, so every step waits out a 12 ms floor (a tight burst
// starves its thread and the ROM never boots). One getAudio() drain per step:
// the drained/nominal ratio is the audio-single-scheduling gate input.
async function abNewSetup(page, repoRoot, mountName) {
	return await page.evaluate(
		async ({ repoRoot, vpxUrl, romUrl, mountName }) => {
			const o = { ok: false, error: '' }
			try {
				globalThis.__mountName = mountName
				const seam = await import(`/@fs${repoRoot}/dist-esm/lib/wasm/vpinball-wasm.js`)
				const { engine } = await seam.loadHeadlessEngine('/wasm/vpinball-headless.js')
				const get = async u => {
					const r = await fetch(u)
					if (!r.ok) throw new Error(`fetch ${u}: ${r.status}`)
					return new Uint8Array(await r.arrayBuffer())
				}
				globalThis.__seam = seam
				globalThis.__eng = engine
				globalThis.__nowMs = 0
				engine.init()
				const rom = await get(romUrl)
				const vpx = await get(vpxUrl)
				o.vpxBytes = vpx.length
				o.romBytes = rom.length
				o.mountName = globalThis.__mountName
				engine.mountRom(globalThis.__mountName, rom)
				o.mountRc = 0
				o.audioPre = engine.getAudioInfo()
				await engine.loadTable(vpx)
				o.audioPost = engine.getAudioInfo()
				o.scriptErrors = engine.getScriptErrorCount()
				o.scriptError = (engine.getScriptError() || '').slice(0, 200)
				try {
					const cat = JSON.parse(engine.getPartCatalogJson() || '[]')
					o.catalog = cat.length
				} catch {
					o.catalog = -1
				}
				o.ok = true
			} catch (e) {
				o.error = String(e?.stack || e).slice(0, 600)
			}
			return o
		},
		{ repoRoot, vpxUrl, romUrl, mountName },
	)
}

async function abNewChunk(page, label, opts) {
	return await page.evaluate(
		async ({ label, o }) => {
			const eng = globalThis.__eng
			const seam = globalThis.__seam
			const key = c => seam.codeToSdlScancode(c)
			const R = { label, reqSteps: o.steps, samples: [], dmd: [], flips: [], plungers: [], events: [] }
			const mkAudio = () => ({ frames: 0, steps: 0, rmsMax: 0, peakMax: 0, energetic: 0, rate: 0 })
			const audio = mkAudio()
			const audioEarly = mkAudio()
			const snapBalls = () => {
				const b = eng.getBuffer('balls')
				if (!b) return []
				const rows = []
				for (let i = 0; i < b.count; i++) {
					const p = i * b.stride
					const v = b.view
					if (!Number.isFinite(v[p + 1]) || !Number.isFinite(v[p + 2]))
						R.events.push(`NaN@${R.samples.length}`)
					rows.push([v[p], +v[p + 1].toFixed(2), +v[p + 2].toFixed(2), +v[p + 3].toFixed(2)])
				}
				return rows
			}
			const snapDmd = () => {
				const f = eng.getDmdFrame()
				if (!f) return null
				let s = 0
				for (let i = 0; i < f.pixels.length; i++) s += f.pixels[i]
				return { id: f.frameId, sum: +s.toFixed(1) }
			}
			const snapFlip = () => {
				const m = eng.getBuffer('movers')
				if (!m) return []
				const fl = []
				for (let i = 0; i < m.count; i++) {
					const p = i * m.stride
					if (m.view[p + 1] === seam.MoverType.Flipper) fl.push(+m.view[p + 2].toFixed(4))
				}
				return fl
			}
			const snapPlunger = () => {
				const m = eng.getBuffer('movers')
				if (!m) return null
				const out = []
				for (let i = 0; i < m.count; i++) {
					const p = i * m.stride
					if (m.view[p + 1] === seam.MoverType.Plunger) out.push(+m.view[p + 2].toFixed(2))
				}
				return out
			}
			const drainAudio = () => {
				let n = 0
				let sum = 0
				let peak = 0
				try {
					const a = eng.getAudio()
					if (a?.samples?.length) {
						n = a.samples.length
						for (let i = 0; i < a.samples.length; i++) {
							const x = a.samples[i] / 32768
							sum += x * x
							const av = Math.abs(x)
							if (av > peak) peak = av
						}
					}
				} catch {}
				const rms = n > 0 ? Math.sqrt(sum / n) : 0
				const tgt = o.audioMark && steps + 1 <= o.audioMark ? audioEarly : audio
				tgt.frames += n
				tgt.steps++
				if (rms > tgt.rmsMax) tgt.rmsMax = +rms.toFixed(4)
				if (peak > tgt.peakMax) tgt.peakMax = +peak.toFixed(3)
				if (rms > 0.005 || peak > 0.05) tgt.energetic++
				if (!tgt.rate) {
					try {
						tgt.rate = eng.getAudioInfo().sampleRate || 0
					} catch {}
				}
				return n
			}
			const isShooter = r => r[1] > 800 && r[2] > 1500 && r[2] < 2100
			if (o.press) for (const c of o.press) eng.pushKey(key(c), true)
			let steps = 0
			const holdN = o.holdSteps ?? 0
			const run = async n => {
				for (let i = 0; i < n; i++) {
					const w0 = Date.now()
					globalThis.__nowMs += 16.7
					eng.stepFrame(globalThis.__nowMs)
					drainAudio()
					steps++
					if (o.sampleEvery && steps % o.sampleEvery === 0) R.samples.push([steps, snapBalls()])
					if (o.flipTrace) R.flips.push(snapFlip())
					if (o.plungerTrace && steps % 5 === 0) R.plungers.push([steps, snapPlunger()])
					if (o.dmdEvery && steps % o.dmdEvery === 0) R.dmd.push([steps, snapDmd()])
					const dt = Date.now() - w0
					if (dt < 12) await new Promise(r => setTimeout(r, 12 - dt))
					if (o.stopWhenDmd && steps % 10 === 0) {
						const d = snapDmd()
						if (d && d.sum > 0) {
							R.dmdBoot = [steps, d]
							break
						}
					}
					if (o.stopWhenPlayfield && steps % 2 === 0) {
						if (snapBalls().some(r => r[2] < 1500)) {
							R.playAt = steps
							break
						}
					}
					if (o.stopWhenShooter && steps % 2 === 0) {
						if (snapBalls().some(isShooter)) {
							R.servedAt = steps
							break
						}
					}
				}
			}
			await run(holdN)
			if (o.press) for (const c of o.press) eng.pushKey(key(c), false)
			if (o.steps - holdN > 0) await run(o.steps - holdN)
			R.steps = steps
			R.finalBalls = snapBalls()
			R.finalDmd = snapDmd()
			R.finalFlips = snapFlip()
			R.audio = audio
			R.audioEarly = audioEarly
			return R
		},
		{ label, o: opts },
	)
}

async function abNewDrainTwice(page) {
	return await page.evaluate(async () => {
		const eng = globalThis.__eng
		const seam = globalThis.__seam
		const out = { first: -1, second: -1 }
		try {
			eng.pushKey(seam.codeToSdlScancode('Digit5'), true)
			for (let i = 0; i < 15; i++) {
				globalThis.__nowMs += 16.7
				eng.stepFrame(globalThis.__nowMs)
				eng.getAudio()
				await new Promise(r => setTimeout(r, 12))
			}
			eng.pushKey(seam.codeToSdlScancode('Digit5'), false)
			for (let i = 0; i < 60; i++) {
				globalThis.__nowMs += 16.7
				eng.stepFrame(globalThis.__nowMs)
				eng.getAudio()
				await new Promise(r => setTimeout(r, 12))
			}
			const a = eng.getAudio()
			out.first = a?.samples?.length ?? 0
			const b = eng.getAudio()
			out.second = b?.samples?.length ?? 0
		} catch (e) {
			out.err = String(e?.message ?? e).slice(0, 200)
		}
		return out
	})
}

// ---- OLD paced match (pre-rescope TS player, probe-owned clock) ------------
async function abOldFreeze(page) {
	return await page.evaluate(async () => {
		const v = window.viewer
		const p = v.player
		v.isPaused = true
		await new Promise(r => setTimeout(r, 2500))
		const g1 = p.getGameTime()
		await new Promise(r => setTimeout(r, 2500))
		const g2 = p.getGameTime()
		p.setPhysicsEnabled(true)
		p.getPhysics().isPaused = false
		const d0 = p.getDmdFrame()
		let s0 = 0
		if (d0) for (let i = 0; i < d0.length; i++) s0 += d0[i]
		return {
			frozen: g1 === g2,
			g1,
			g2,
			nballs: p.getBalls().length,
			dmdLen: d0?.length ?? null,
			dmdSum: s0,
			mock: !!p.getPhysics().emu?.isMock,
		}
	})
}

// One probe-level absolute monotonic target, seeded once from the physics
// internal cursor, never re-derived from getGameTime (documented pitfall:
// re-deriving lets wall-clock drift double-step or stall the comparison).
async function abOldChunk(page, label, opts) {
	return await page.evaluate(
		async ({ label, o }) => {
			const p = window.viewer.player
			const R = { label, reqSteps: o.steps, samples: [], dmd: [], flips: [], plungers: [], events: [] }
			if (globalThis.__PT === undefined) {
				globalThis.__PT = p.getPhysics().curPhysicsFrameTime / 1000 + 0.001
				R.seed = globalThis.__PT
			}
			const key = c => ({
				code: c,
				key: c.startsWith('Digit') ? c.slice(5) : c.startsWith('Shift') ? 'Shift' : c === 'Enter' ? 'Enter' : c,
			})
			const snapBalls = () => {
				const rows = []
				for (const b of p.getBalls()) {
					const q = b.state.pos
					const vv = b.hit.vel
					if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) R.events.push(`NaN@${R.samples.length}`)
					rows.push([
						b.id,
						+q.x.toFixed(2),
						+q.y.toFixed(2),
						+q.z.toFixed(2),
						+vv.x.toFixed(2),
						+vv.y.toFixed(2),
					])
				}
				return rows
			}
			const snapDmd = () => {
				const d = p.getDmdFrame()
				if (!d) return null
				let s = 0
				for (let i = 0; i < d.length; i++) s += d[i]
				return { sum: s, len: d.length }
			}
			const snapFlip = () =>
				Object.values(window.viewer.table?.flippers ?? {}).map(f => +f.getState().angle.toFixed(4))
			const snapPlunger = () =>
				Object.values(window.viewer.table?.plungers ?? {}).map(pl => +pl.getMover().pos.toFixed(2))
			if (o.press) for (const c of o.press) p.onKeyDown(key(c))
			let steps = 0
			const holdN = o.holdSteps ?? 0
			const run = n => {
				for (let i = 0; i < n; i++) {
					globalThis.__PT += 1000 / 60
					p.simulateTime(globalThis.__PT)
					steps++
					if (o.sampleEvery && steps % o.sampleEvery === 0) R.samples.push([steps, snapBalls()])
					if (o.flipTrace) R.flips.push(snapFlip())
					if (o.plungerTrace && steps % 5 === 0) R.plungers.push([steps, snapPlunger()])
					if (o.dmdEvery && steps % o.dmdEvery === 0) R.dmd.push([steps, snapDmd()])
					if (o.stopWhenPlayfield && steps % 2 === 0) {
						if (snapBalls().some(b => b[2] < 1500)) {
							R.playAt = steps
							return true
						}
					}
					if (o.stopWhenShooter && steps % 2 === 0) {
						if (snapBalls().some(b => b[1] > 800 && b[2] > 1500 && b[2] < 2100)) {
							R.servedAt = steps
							return true
						}
					}
				}
				return false
			}
			run(holdN)
			if (o.press) for (const c of o.press) p.onKeyUp(key(c))
			if (o.steps - holdN > 0) run(o.steps - holdN)
			R.steps = steps
			R.gameTime = p.getGameTime()
			R.finalBalls = snapBalls()
			R.finalDmd = snapDmd()
			R.finalFlips = snapFlip()
			return R
		},
		{ label, o: opts },
	)
}

// Staged eject: mimic the ROM solTrough eject (sw21.Kick(61,10)) + settle.
// The mock emu never fires it, so the harness stages it identically on the
// OLD side only and labels every staged phase as an explicable deviation.
async function abOldStageEject(page, tag, notes) {
	const cnt = await page
		.evaluate(() => {
			try {
				return window.viewer.table.kickers.sw21.getApi().BallCntOver
			} catch {
				return -1
			}
		})
		.catch(() => -1)
	notes.push(`${tag} sw21.BallCntOver=${cnt}`)
	if (cnt !== 1) {
		await abOldChunk(page, `${tag}-restage`, { steps: 300, sampleEvery: 30 })
		const cnt2 = await page
			.evaluate(() => {
				try {
					return window.viewer.table.kickers.sw21.getApi().BallCntOver
				} catch {
					return -1
				}
			})
			.catch(() => -1)
		if (cnt2 !== 1) {
			notes.push(`${tag} no ball staged; abort`)
			return null
		}
	}
	await page.evaluate(() => window.viewer.table.kickers.sw21.getApi().Kick(61, 10))
	const s = await abOldChunk(page, `${tag}-settle`, { steps: 300, sampleEvery: 10, dmdEvery: 60 })
	return s.finalBalls
}

// ---- viewer legs (render + live-loop cadence, both sides) ------------------
const VIEWS = {
	top: [
		[0, 190, 300],
		[0, -3, 6],
	],
	side: [
		[350, -80, 120],
		[0, -3, 6],
	],
	room: [
		[620, 380, 640],
		[0, 0, 0],
	],
}

async function abShot(page, side, name, camPos, target) {
	await page.evaluate(abPinCamera, camPos, target)
	// Settle loop: streaming textures keep the frame drifting after the
	// camera move, so re-sample until a consecutive pair agrees (or 3 tries,
	// reporting the last pair so the gate fails honestly on drift).
	await sleep(900)
	let first = await page.evaluate(abReadback)
	let second = null
	for (let i = 0; i < 3; i++) {
		await sleep(1500)
		second = await page.evaluate(abReadback)
		if (
			typeof first?.mean === 'number' &&
			typeof second?.mean === 'number' &&
			Math.abs(first.mean - second.mean) <= TOL.shotSettle
		)
			break
		first = second
	}
	const path = join(OUT, `ab-${side}-${name}.png`)
	await page.screenshot({ path })
	await sleep(400)
	return { path, first, second }
}

async function abDmdWorldPos(page) {
	return await page
		.evaluate(() => {
			try {
				const m = (window.viewer?.dmdMeshes || [])[0]
				if (!m) return null
				m.updateWorldMatrix(true, false)
				const e = m.matrixWorld.elements
				return [e[12], e[13], e[14]]
			} catch {
				return null
			}
		})
		.catch(() => null)
}

// Deterministic seeding: pin page-level Math.random (mulberry32) before any
// page script runs. Engine stepping uses fixed 16.7 ms quanta, so this only
// pins third-party jitter (fallback timers, texture noise); the ROM and the
// scripted match are untouched.
async function seedPage(page) {
	await page
		.evaluateOnNewDocument(s => {
			let a = s >>> 0 || 1
			Math.random = () => {
				a |= 0
				a = (a + 0x6d2b79f5) | 0
				let t = Math.imul(a ^ (a >>> 15), 1 | a)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}
		}, SEED)
		.catch(() => {})
}

async function openViewerPage(browser, url, side) {
	const page = await newPage(browser)
	await seedPage(page)
	page.setDefaultTimeout(0)
	attachLogging(page, { filter: /Ready|Failed|error|Error|PinMAME|stream Done|wasm|WASM/i, prefix: `[ab-${side}]` })
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
	const readyLog = await abPollLog(page, 'Ready', 420000)
	const ready = readyLog.includes('Ready')
	if (!ready) return { page, ready: false, logTail: readyLog.slice(-500) }
	await abPollLog(page, '[stream] Done', 180000)
	await page.evaluate(abFreezeAutoplay).catch(() => {})
	await sleep(8000)
	return { page, ready: true }
}

async function abRenderLegs(page, side) {
	const legs = { struct: null, shots: {}, rgb: null, settle: {} }
	legs.struct = await page.evaluate(abStruct).catch(e => ({ err: String(e).slice(0, 200) }))
	// Wait for the first lit frame: under SwiftShader load, shader compile
	// can leave the canvas black long after stream-Done. Measuring settle on
	// black frames would pass vacuously, so refuse instead.
	let lit = 0
	for (let i = 0; i < 20; i++) {
		const r = await page.evaluate(abReadback).catch(() => null)
		lit = r?.mean ?? 0
		if (lit > 0.5) break
		await sleep(6000)
	}
	if (!(lit > 0.5)) throw new Error('infra: first frame never lit')
	for (const [name, [camPos, target]] of Object.entries(VIEWS)) {
		const s = await abShot(
			page,
			side,
			{ top: '1-playfield-top', side: '2a-cabinet-side', room: '2b-room-wide' }[name],
			camPos,
			target,
		)
		legs.shots[name] = { path: s.path, first: s.first, second: s.second }
	}
	legs.rgb = await page.evaluate(abRgb).catch(e => ({ err: String(e).slice(0, 200) }))
	const dmdPos = await abDmdWorldPos(page)
	if (dmdPos)
		legs.shots.dmd = await abShot(page, side, '3-dmd-mesh', [dmdPos[0], dmdPos[1] + 18, dmdPos[2] + 45], dmdPos)
	else {
		legs.shots.dmd = await abShot(page, side, '3-dmd-mesh', [0, 47, 135], [0, -3, 6])
		legs.dmdMeshMissing = true
	}
	return legs
}

// NEW live play: 6x coin -> start -> full plunger through the real ROM path
// (TWD prices 3-6 coins/credit, so a single coin never earns a credit),
// then poll for an in-play ball. Retry start+plunge once (ROM state).
async function abNewBallGate(page) {
	// Deterministic game-time drive: the working headless path (direct
	// pushKey + 16.7ms quanta). Wall-clock _sendKey holds shrink under
	// SwiftShader (rAF ~1-2fps → ~0.2x game time) and never reach PinMAME
	// debounce, so the viewer rAF loop only idles while this steps.
	// Wall-paced like the scripted match (12ms/step): PinMAME runs on wall
	// time, so instant stepping starves ROM timers. Split into short phases.
	const drive = phase =>
		page.evaluate(async phase => {
			const diag = { phase, steps: 0, error: null }
			try {
				const v = window.viewer
				const eng = v.wasmEngine.engine
				// Pinned by lib/wasm/vpinball-wasm.spec.ts (SDL_scancode.h order).
				const key = c => ({ Digit5: 34, Digit1: 30, Enter: 40 })[c]
				const paced = async n => {
					let ms = v.wasmEngine.gameMs || 0
					for (let i = 0; i < n; i++) {
						const w0 = Date.now()
						ms += 16.7
						eng.stepFrame(ms)
						diag.steps++
						const dt = Date.now() - w0
						if (dt < 12) await new Promise(r => setTimeout(r, 12 - dt))
					}
					v.wasmEngine.gameMs = Math.max(v.wasmEngine.gameMs || 0, ms)
				}
				const tap = async (c, hold, gap) => {
					eng.pushKey(key(c), true)
					await paced(hold)
					eng.pushKey(key(c), false)
					await paced(gap)
				}
				const balls = () => {
					const b = eng.getBuffer('balls')
					const rows = []
					if (b)
						for (let i = 0; i < b.count; i++)
							rows.push([b.view[i * b.stride], b.view[i * b.stride + 1], b.view[i * b.stride + 2]])
					return rows
				}
				if (phase === 'boot-coins') {
					// Own stepping exclusively: interleaved rAF steps fork the
					// PinMAME fence clock and crash the target. Restored below.
					v.isPaused = true
					// Smoke the real input path once (mapping + bridge delivery).
					v._sendKey('Digit5', true)
					v._sendKey('Digit5', false)
					await paced(1500)
					for (let i = 0; i < 6; i++) await tap('Digit5', 15, 120)
				} else if (phase === 'start-serve') {
					await tap('Digit1', 20, 300)
					const isShooter = r => r[1] > 800 && r[2] > 1500 && r[2] < 2100
					for (let i = 0; i < 400 && !balls().some(isShooter); i++) await paced(1)
					diag.served = balls().some(isShooter)
				} else if (phase === 'plunge') {
					try {
						eng.pushKey(key('Enter'), true)
						await paced(60)
						eng.pushKey(key('Enter'), false)
						await paced(400)
					} finally {
						v.isPaused = false
					}
				}
				const d = v.wasmEngine.dmdFrame
				diag.dmd = d ? { id: d.frameId, lit: d.frame.reduce((a, b) => a + b, 0) } : null
			} catch (e) {
				try {
					v.isPaused = false
				} catch {}
				diag.error = String(e?.message ?? e).slice(0, 200)
			}
			return diag
		}, phase)
	// Reload-tolerant: each attempt re-waits for ready and re-drives all
	// phases, so an HMR reload or crash mid-drive retries cleanly.
	const ready = () =>
		page
			.waitForFunction(() => window.viewer?.wasmEngine?.ready === true, { timeout: 180000 })
			.then(() => true)
			.catch(() => false)
	const play = async attempt => {
		if (!(await ready())) return { attempt, error: 'viewer never ready' }
		for (const phase of ['boot-coins', 'start-serve', 'plunge']) {
			const diag = await drive(phase).catch(e => ({ phase, error: String(e).slice(0, 120) }))
			comment(`NEW ball play a${attempt} ${phase}: ${JSON.stringify(diag)}`)
			if (diag.error) return { ...diag, attempt }
		}
		return { ok: true, attempt }
	}
	for (let attempt = 1; attempt <= 3; attempt++) {
		comment(`NEW ball play result: ${JSON.stringify(await play(attempt))}`)
		for (let i = 0; i < 30; i++) {
			await sleep(2000)
			const s = await page.evaluate(abStruct).catch(() => null)
			if (s?.engineBalls && s.engineBalls.inPlay > 0) return { ok: true, struct: s, tries: attempt }
		}
	}
	const s = await page.evaluate(abStruct).catch(() => null)
	return { ok: false, struct: s, tries: 3 }
}

// OLD live play: staged trough eject (mock emu never fires the ROM one) +
// Enter through the real script Pullback/Fire path, then poll player balls.
async function abOldBallGate(page) {
	// Game-time driven exactly like the match leg: the viewer rAF loop
	// advances ~0.2x under SwiftShader, so wall-clock holds shrink past
	// debounce and the plunger never completes. The mock emu never fires
	// the ROM eject, so balls are staged via the kicker like the match leg.
	for (let i = 0; i < 6; i++)
		await abOldChunk(page, `ball-coin${i + 1}`, { press: ['Digit5'], holdSteps: 15, steps: 135 })
	await abOldChunk(page, 'ball-start', { press: ['Digit1'], holdSteps: 20, steps: 320 })
	const staged = await abOldStageEject(page, 'ball', [])
	if (!staged) {
		const s = await page.evaluate(abStruct).catch(() => null)
		return { ok: false, struct: s }
	}
	const rp = await abOldChunk(page, 'ball-plunge', {
		press: ['Enter'],
		holdSteps: 60,
		steps: 460,
		sampleEvery: 5,
		stopWhenPlayfield: true,
	})
	const ok =
		rp.playAt !== undefined ||
		(rp.finalBalls ?? []).some(inPlayRow) ||
		(rp.samples ?? []).some(s => s[1].some(inPlayRow))
	const s = await page.evaluate(abStruct).catch(() => null)
	return { ok, struct: s }
}

async function abNewCadence(page) {
	return await page.evaluate(async () => {
		const out = {}
		try {
			const eng = window.viewer?.wasmEngine?.engine
			if (!eng) {
				out.err = 'no-engine'
				return out
			}
			let n = 0
			const orig = eng.stepFrame.bind(eng)
			eng.stepFrame = (...a) => {
				n++
				return orig(...a)
			}
			const t0 = Date.now()
			await new Promise(r => setTimeout(r, 3000))
			eng.stepFrame = orig
			out.steps = n
			out.wallMs = Date.now() - t0
			out.sps = +(n / ((Date.now() - t0) / 1000)).toFixed(1)
		} catch (e) {
			out.err = String(e?.message ?? e).slice(0, 200)
		}
		return out
	})
}

async function abOldCadence(page) {
	const r = await page.evaluate(async () => {
		const out = { resets: 0 }
		try {
			const v = window.viewer
			v.isPaused = false
			// Game restarts (drain → game over → attract) reset the clock
			// mid-window; resample instead of reporting negative cadence.
			for (let w = 0; w < 3; w++) {
				const g0 = v.player.getGameTime()
				const t0 = Date.now()
				await new Promise(rr => setTimeout(rr, 3000))
				const g1 = v.player.getGameTime()
				if (g1 >= g0 || w === 2) {
					out.gt0 = g0
					out.gt1 = g1
					out.wallMs = Date.now() - t0
					out.sps = +((g1 - g0) / (1000 / 60) / ((Date.now() - t0) / 1000)).toFixed(1)
					break
				}
				out.resets = (out.resets ?? 0) + 1
			}
			v.isPaused = true
		} catch (e) {
			out.err = String(e?.message ?? e).slice(0, 200)
		}
		return out
	})
	return r
}

// Trusted-key flipper gate (NEW): real key events through input-manager +
// _sendKey, so the ArrowLeft/Right→Shift alias is exercised (the scripted
// match drives Shift scancodes directly and cannot see an alias break).
// Stern flippers are ROM-driven on wall time: hold each key 3 s and assert
// any motion. Pre-fix arrows read exactly 0; post-fix reads ~0.01-0.09 at
// 1 fps SwiftShader (0.89 deterministic direct-drive).
async function abFlipperGate(page) {
	const out = { ensured: false, keys: {} }
	// Name-keyed angles: table.flippers insertion order is not a contract.
	const angles = () =>
		page
			.evaluate(() => {
				const out = {}
				try {
					for (const [name, f] of Object.entries(window.viewer.table?.flippers ?? {}))
						out[name] = +f.getState().angle.toFixed(4)
				} catch {}
				return out
			})
			.catch(() => null)
	const press = async code => {
		await page.keyboard.down(code).catch(() => {})
		await sleep(250)
		await page.keyboard.up(code).catch(() => {})
		await sleep(1200)
	}
	for (let i = 0; i < 6; i++) await press('Digit5')
	await press('Digit1')
	out.ensured = true
	for (const [label, code, name, fallback] of [
		['shift', 'ShiftLeft', 'LeftFlipper', 1],
		['arrowL', 'ArrowLeft', 'LeftFlipper', 1],
		['arrowR', 'ArrowRight', 'RightFlipper', 0],
	]) {
		const rest = await angles()
		if (!rest) {
			out.keys[label] = { error: 'no-angles' }
			continue
		}
		const key = name in rest ? name : Object.keys(rest)[fallback]
		const at = rows => rows?.[key] ?? 0
		await page.keyboard.down(code).catch(() => {})
		await sleep(3000)
		const held = await angles()
		await page.keyboard.up(code).catch(() => {})
		await sleep(1000)
		const rest2 = await angles()
		out.keys[label] = {
			flipper: key,
			excursion: held ? +Math.abs(at(held) - at(rest)).toFixed(4) : null,
			drift: rest2 ? +Math.abs(at(rest2) - at(rest)).toFixed(4) : null,
		}
	}
	return out
}

// OLD parity: direct TS player key path (no Arrow alias on OLD); shift-only.
async function abOldFlipperGate(page) {
	const out = { ensured: false, keys: {} }
	const angles = () =>
		page
			.evaluate(() => {
				try {
					if (!window.viewer.player || !window.viewer.table?.flippers) return null
					const out = {}
					for (const [name, f] of Object.entries(window.viewer.table.flippers))
						out[name] = +f.getState().angle.toFixed(4)
					return out
				} catch {
					return null
				}
			})
			.catch(() => null)
	const press = async (code, holdMs, gapMs) => {
		await page.evaluate(c => window.viewer.player.onKeyDown({ code, key: c }), code).catch(() => {})
		await sleep(holdMs)
		await page.evaluate(c => window.viewer.player.onKeyUp({ code, key: c }), code).catch(() => {})
		await sleep(gapMs)
	}
	for (let i = 0; i < 6; i++) await press('Digit5', 250, 1200)
	await press('Digit1', 300, 1500)
	out.ensured = true
	const rest = await angles()
	if (rest) {
		const key = 'LeftFlipper' in rest ? 'LeftFlipper' : Object.keys(rest)[1]
		const at = rows => rows?.[key] ?? 0
		await page
			.evaluate(() => window.viewer.player.onKeyDown({ code: 'ShiftLeft', key: 'ShiftLeft' }))
			.catch(() => {})
		await sleep(3000)
		const held = await angles()
		await page.evaluate(() => window.viewer.player.onKeyUp({ code: 'ShiftLeft', key: 'ShiftLeft' })).catch(() => {})
		out.keys.shift = {
			flipper: key,
			excursion: held ? +Math.abs(at(held) - at(rest)).toFixed(4) : null,
		}
	} else out.keys.shift = { error: 'no-angles' }
	return out
}

// Drain-triangle census: every exactly-3-index mesh with its visibility
// chain. TWD ships one file-visible author leftover at the drain
// (surface.top-debug_BLW3: 3 drag points, no material/image; upstream renders
// its dummy-material triangle too), which the NEW viewer hides as an
// intentional deviation via the author-debug postprocess pass. The gate pins
// zero visible strays so any NEW triangle fails instead of hiding in a frame
// mean; OLD still shows the leftover (parity note below, not a gate).
async function abTriCensus(page) {
	return await page
		.evaluate(() => {
			const out = []
			try {
				const g = window.viewer?.tableGroup
				if (!g) return out
				g.traverse(o => {
					if (!o.isMesh) return
					const n = o.geometry?.index?.count ?? o.geometry?.attributes?.position?.count ?? 0
					if (n !== 3) return
					let vis = o.visible
					for (let p = o.parent; p && p !== g; p = p.parent) vis = vis && p.visible
					const m = Array.isArray(o.material) ? o.material[0] : o.material
					out.push({
						name: o.name,
						visible: !!vis,
						color: m?.color?.getHexString?.() ?? null,
						map: !!(m?.map || m?.userData?.__map),
					})
				})
			} catch {}
			return out
		})
		.catch(() => null)
}

// ---- metrics (node side) ----------------------------------------------------
const inPlayRow = r => r[2] < TOL.inPlayY
const isShooterRow = r => r[1] > 800 && r[2] > 1500 && r[2] < 2100
const dist2 = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2])

function walkPoints(traj) {
	// Ordered [chunkLabel, step, rows] points, finals included, for transitions.
	const pts = []
	for (const [label, c] of Object.entries(traj)) {
		if (!c || !Array.isArray(c.samples)) continue
		for (const [step, rows] of c.samples) pts.push({ label, step, rows })
		if (c.finalBalls) pts.push({ label: `${label}#final`, step: (c.steps ?? 0) + 0.5, rows: c.finalBalls })
	}
	return pts
}

function summarizeMatch(traj) {
	const m = {
		eject: { ok: false, detail: '' },
		launch: { ok: false, minY: null, firstAt: null },
		drains: [],
		vanished: 0,
		teleports: [],
		frozen: [],
		nanEvents: 0,
		bounds: [],
		dmdLit: false,
		dmdTransitions: 0,
		flipperExcursion: 0,
		plungerRange: 0,
	}
	const chunks = Object.entries(traj)
	const byLabel = Object.fromEntries(chunks)
	// Eject: shooter-lane ball served between boot and plunge (ROM serve on NEW,
	// staged Kick on OLD), or a ball displaced >100u over the same span.
	const bootFinal = byLabel.boot?.finalBalls ?? []
	const serveSeen = chunks.some(
		([l, c]) => /serve|settle/.test(l) && (c.servedAt !== undefined || (c.finalBalls ?? []).some(isShooterRow)),
	)
	const startFinal = byLabel.start?.finalBalls ?? []
	const displaced = startFinal.some(r => bootFinal.every(b => dist2(r, b) > 100))
	m.eject = {
		ok: serveSeen || displaced,
		detail: `served=${serveSeen} displaced=${displaced} ballsBoot=${bootFinal.length} ballsStart=${startFinal.length}`,
	}
	// Launch: plunge-phase min-y and first y<1500 sample.
	let minY = Infinity
	for (const [l, c] of chunks) {
		if (!/plunge/.test(l) || !c) continue
		for (const [step, rows] of c.samples ?? []) {
			for (const r of rows) {
				if (r[2] < minY) minY = r[2]
				if (r[2] < TOL.launchY && !m.launch.firstAt) m.launch.firstAt = `${l}@${step}`
			}
		}
		for (const r of c.finalBalls ?? []) if (r[2] < minY) minY = r[2]
	}
	if (minY < Infinity) {
		m.launch.minY = +minY.toFixed(1)
		m.launch.ok = minY < TOL.launchY
	}
	// Drains / bounds / teleports / frozen over the ordered stream.
	const pts = walkPoints(traj)
	const last = new Map()
	for (const p of pts) {
		const seen = new Set()
		for (const r of p.rows) {
			const id = String(r[0])
			seen.add(id)
			const ip = inPlayRow(r)
			if (r[1] < TOL.inPlayX[0] || r[1] > TOL.inPlayX[1]) {
				if (ip) m.bounds.push({ at: `${p.label}@${p.step}`, x: r[1], y: r[2] })
			}
			const prev = last.get(id)
			if (prev?.inPlay && !ip)
				m.drains.push({ at: `${p.label}@${p.step}`, lastX: +prev.x.toFixed(1), lastY: +prev.y.toFixed(1) })
			last.set(id, { x: r[1], y: r[2], inPlay: ip })
		}
		for (const [id, v] of last) if (!seen.has(id) && v.inPlay) m.vanished++
	}
	// Teleports: same-id consecutive-sample gaps, threshold scaled by sampling gap.
	for (const [, c] of chunks) {
		if (!c || !Array.isArray(c.samples) || c.samples.length < 2) continue
		const gap = Math.max(1, (c.samples[1][0] - c.samples[0][0]) / 5)
		for (let i = 1; i < c.samples.length; i++) {
			const prev = new Map(c.samples[i - 1][1].map(r => [String(r[0]), r]))
			for (const r of c.samples[i][1]) {
				const q = prev.get(String(r[0]))
				if (q && dist2(r, q) > TOL.teleportGap * gap) {
					m.teleports.push({ at: `${c.label}@${c.samples[i][0]}`, gap: +dist2(r, q).toFixed(0) })
				}
			}
		}
	}
	// Frozen: <0.5u over a 180-step span while in play (observable chunks only).
	for (const [, c] of chunks) {
		if (!c || !Array.isArray(c.samples) || c.samples.length < 3) continue
		const se = Math.max(1, c.samples[1][0] - c.samples[0][0])
		const w = Math.ceil(TOL.frozenSteps / se)
		if (c.samples.length < w + 1) continue
		for (let i = 0; i + w < c.samples.length; i++) {
			const ids = c.samples[i][1].filter(inPlayRow).map(r => String(r[0]))
			for (const id of ids) {
				const path = []
				let ok = true
				for (let k = i; k <= i + w; k++) {
					const r = c.samples[k][1].find(q => String(q[0]) === id)
					if (!r || !inPlayRow(r)) {
						ok = false
						break
					}
					path.push(r)
				}
				if (!ok || path.length < 2) continue
				let mx = 0
				for (let a = 1; a < path.length; a++) mx = Math.max(mx, dist2(path[a], path[0]))
				if (mx < TOL.frozenEps) m.frozen.push({ at: `${c.label}@${c.samples[i][0]}`, id })
			}
		}
	}
	for (const [, c] of chunks) {
		if (!c) continue
		m.nanEvents += (c.events ?? []).length
	}
	// DMD: lit descriptor + checksum transitions across coin/start phases.
	let trans = 0
	let prevSig = null
	for (const [l, c] of chunks) {
		if (!c || !Array.isArray(c.dmd)) continue
		for (const [, d] of c.dmd) {
			if (!d) continue
			const sig = JSON.stringify(d.sum !== undefined ? [d.id, Math.round(d.sum)] : d.sum)
			if (prevSig !== null && sig !== prevSig && /coin|start/.test(l)) trans++
			prevSig = sig
			if ((d.sum ?? 0) > 0) m.dmdLit = true
		}
		const fd = c.finalDmd
		if (fd && (fd.sum ?? 0) > 0) m.dmdLit = true
	}
	m.dmdTransitions = trans
	// Flipper excursion over tap traces; plunger range over plunge traces.
	let flipMx = 0
	for (const [l, c] of chunks) {
		if (!c || !Array.isArray(c.flips) || !/tap/.test(l)) continue
		const per = new Map()
		for (const arr of c.flips) {
			arr.forEach((a, i) => {
				if (!per.has(i)) per.set(i, [])
				per.get(i).push(a)
			})
		}
		for (const [, arr] of per) {
			if (arr.length > 1) flipMx = Math.max(flipMx, Math.max(...arr) - Math.min(...arr))
		}
	}
	m.flipperExcursion = +flipMx.toFixed(4)
	let plMx = 0
	for (const [l, c] of chunks) {
		if (!c || !Array.isArray(c.plungers) || !/plunge/.test(l)) continue
		// NEW traces a scalar per step, OLD an array (one entry per plunger).
		const vals = c.plungers.flatMap(p => (Array.isArray(p[1]) ? p[1] : [p[1]])).filter(v => typeof v === 'number')
		if (vals.length > 1) plMx = Math.max(plMx, Math.max(...vals) - Math.min(...vals))
	}
	m.plungerRange = +plMx.toFixed(2)
	return m
}

function summarizeAudio(traj) {
	const names = Object.keys(traj).filter(l => /^coin[1-6]$/.test(l) || l === 'start')
	let frames = 0
	let steps = 0
	let rate = 0
	let energetic = 0
	for (const l of names) {
		const a = traj[l]?.audio
		if (!a) continue
		frames += a.frames
		steps += a.steps
		energetic += a.energetic
		if (a.rate > rate) rate = a.rate
	}
	const early = traj.boot?.audioEarly ?? { frames: 0, steps: 0, rmsMax: 0, peakMax: 0, energetic: 0 }
	return { burst: { frames, steps, rate, energetic }, attract: early }
}

async function abPollLog(page, needle, timeoutMs) {
	const t0 = Date.now()
	for (;;) {
		try {
			const t = await page.evaluate(() => document.getElementById('log')?.textContent || '')
			if (t.includes(needle)) return t
		} catch {
			// Transient detached frame under SwiftShader load: keep polling
			// until the budget runs out instead of aborting the leg.
		}
		if (Date.now() - t0 > timeoutMs) return 'TIMEOUT'
		await sleep(2000)
	}
}

// ---- main -----------------------------------------------------------------
async function main() {
	console.log('TAP version 13')
	console.log(`# vpx-js A/B parity -- ${new Date().toISOString()}`)
	let puppeteer
	try {
		puppeteer = await loadPuppeteer()
	} catch {
		skipAll('puppeteer unavailable')
	}
	if (!vpxPath || !romPath) skipAll(`no VPX/ROM (vpx=${vpxPath ?? 'missing'} rom=${romPath ?? 'missing'})`)
	comment(`table=${basename(vpxPath)} rom=${basename(romPath)} head=${headSha?.slice(0, 12) ?? 'n/a'}`)
	if (!existsSync('demo-browser/public/wasm/vpinball-headless.js')) {
		skipAll('NEW headless artifact missing (demo-browser/public/wasm/vpinball-headless.js)')
	}
	if (!existsSync('dist-esm/lib/wasm/vpinball-wasm.js')) skipAll('dist-esm not built (npm run build:esm)')
	const oldTree = ensureOldTree()
	if (!oldTree.ok) skipAll(oldTree.reason)
	comment(`OLD worktree ok: ${OLD_DIR}`)
	if (FULL_RUN) {
		const lock = acquireFullLock()
		if (!lock.ok)
			skipAll(
				`another full verify:ab run live (pid ${lock.pid}); use --phase with --port/--out for isolated legs`,
			)
		comment(`full-run lock held; legs=${PHASES.join(',')} port=${PORT} seed=${SEED}`)
	} else {
		comment(`single-leg run; legs=${PHASES.join(',')} port=${PORT} seed=${SEED} out=${OUT}`)
	}

	await ensureVite(`${BASE}/`, { label: 'verify-ab' })
	const repoRoot = process.cwd()
	let browser = await launchBrowser(puppeteer, { protocolTimeout: 300_000, autoKillMs: BROWSER_BUDGET_MS })
	const report = { when: new Date().toISOString(), vpx: vpxPath, rom: romPath, headSha, tol: TOL, new: {}, old: {} }
	// Infra aborts (transport/transient puppeteer failures, never-ready under
	// load) retry once with a fresh browser; attempt-2 failure still throws,
	// so flakes cost one retry, never a silent pass. Own-assertion messages
	// (never ready, no player, infra:, TIMEOUT) are deliberately included:
	// under load those throws are usually starved-browser flakes, not parity
	// signal, and the capped retry keeps a genuine failure failing.
	const isInfraAbort = e =>
		/Target closed|detached frame|frame was detached|Protocol error|Session closed|Connection closed|Browser closed|Target crashed|Page crashed|never ready|no player|infra:|TIMEOUT|Navigation timeout|net::ERR|Execution context was destroyed/i.test(
			String(e?.message ?? e),
		)

	try {
		// Phase A: NEW headless paced match (physics + DMD + audio, quantitatively).
		// Retried once with a fresh page: setup fetch + ROM boot under load
		// can detach the frame, which is infra, not parity signal.
		if (wantPhase('A')) {
			comment('phase A: NEW headless paced match')
			const mountName = resolveMountName()
			comment(`mount=${mountName}`)
			let phaseAOk = false
			for (let aAttempt = 1; aAttempt <= 2 && !phaseAOk; aAttempt++) {
				comment(`phase A attempt ${aAttempt}: NEW headless paced match`)
				const pageA = await newPage(browser)
				await seedPage(pageA)
				pageA.setDefaultTimeout(0)
				try {
					await pageA.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 })
					const setup = await abNewSetup(pageA, repoRoot, mountName)
					report.new.setup = setup
					comment(`NEW setup: ${JSON.stringify({ ...setup, error: setup.error || undefined })}`)
					if (!setup.ok) throw new Error(`NEW headless setup failed: ${setup.error}`)
					if (setup.scriptErrors !== 0)
						throw new Error(`NEW script errors: ${setup.scriptErrors} ${setup.scriptError}`)
					const match = await runScriptedMatch({
						side: 'new',
						notes: [],
						chunk: (label, opts) => abNewChunk(pageA, label, opts),
						stage: null,
						bootOpts: { steps: 1500, stopWhenDmd: true, dmdEvery: 50, sampleEvery: 100, audioMark: 40 },
					})
					report.new.match = {
						traj: match.traj,
						taps: match.taps,
						relaunches: match.relaunches,
						notes: match.notes,
					}
					report.new.drainTwice = await abNewDrainTwice(pageA)
					comment(`NEW drain-twice: ${JSON.stringify(report.new.drainTwice)}`)
					phaseAOk = true
				} catch (e) {
					report.new.infraRetry = { attempt: aAttempt, error: String(e?.message ?? e).slice(0, 200) }
					comment(`phase A attempt ${aAttempt} aborted: ${report.new.infraRetry.error}`)
					if (!isInfraAbort(e) || aAttempt >= 2) throw e
				} finally {
					await pageA.close().catch(() => {})
				}
			}
			writeFileSync(
				join(OUT, 'verify-ab-phase-A.json'),
				JSON.stringify({ when: report.when, phase: 'A', new: report.new }, null, 1),
			)
		}

		// Phase B: NEW viewer (render + ball + cadence), retried once with a
		// fresh browser: black first frames and tab death under load are
		// infra, not parity signal.
		if (wantPhase('B')) {
			const newUrl = `${BASE}/?vpx=${encodeURIComponent(vpxUrl)}&rom=${encodeURIComponent(romUrl)}&mode=play`
			let phaseBOk = false
			for (let bAttempt = 1; bAttempt <= 2 && !phaseBOk; bAttempt++) {
				comment(`phase B attempt ${bAttempt}: NEW viewer render legs`)
				if (bAttempt > 1) {
					await browser.close().catch(() => {})
					browser = await launchBrowser(puppeteer, {
						protocolTimeout: 300_000,
						autoKillMs: BROWSER_BUDGET_MS,
					})
				}
				try {
					const { page: pageB, ready: readyB, logTail: tailB } = await openViewerPage(browser, newUrl, 'new')
					if (!readyB) throw new Error(`NEW viewer never ready: ${tailB}`)
					const wasmReady = await pageB.evaluate(() => !!window.viewer?.wasmEngine?.ready).catch(() => false)
					comment(`NEW wasmEngine ready=${wasmReady}`)
					report.new.viewer = await abRenderLegs(pageB, 'new')
					report.new.ball = await abNewBallGate(pageB)
					comment(
						`NEW ball gate: ${JSON.stringify({ ok: report.new.ball.ok, tries: report.new.ball.tries, eng: report.new.ball.struct?.engineBalls, meshes: report.new.ball.struct?.ballMeshes })}`,
					)
					report.new.cadence = await abNewCadence(pageB)
					comment(`NEW cadence: ${JSON.stringify(report.new.cadence)}`)
					report.new.flipperGate = await abFlipperGate(pageB)
					comment(`NEW flipper gate: ${JSON.stringify(report.new.flipperGate.keys)}`)
					report.new.tris = await abTriCensus(pageB)
					comment(`NEW tris: ${JSON.stringify(report.new.tris)}`)
					await pageB.close().catch(() => {})
					phaseBOk = true
				} catch (e) {
					report.new.infraRetry = { attempt: bAttempt, error: String(e?.message ?? e).slice(0, 200) }
					comment(`phase B attempt ${bAttempt} aborted: ${report.new.infraRetry.error}`)
					if (!isInfraAbort(e) || bAttempt >= 2) throw e
				}
			}
			writeFileSync(
				join(OUT, 'verify-ab-phase-B.json'),
				JSON.stringify({ when: report.when, phase: 'B', new: report.new }, null, 1),
			)
		}
		// Fresh process per heavyweight viewer: two SwiftShader viewers in one
		// browser process crash the second tab under memory pressure. Skipped
		// when phase C is not wanted (the finally still closes the browser).
		if (wantPhase('C')) {
			await browser.close().catch(() => {})
			browser = await launchBrowser(puppeteer, { protocolTimeout: 300_000, autoKillMs: BROWSER_BUDGET_MS })
		}

		// Phase C: OLD viewer (render legs live, then frozen paced match).
		// Served by the OLD tree's own vite so OLD aliases/dist-esm apply;
		// the NEW server's config (which no longer vendors the old scripting
		// shims) must not resolve OLD imports. Tab death under SwiftShader
		// memory pressure is retried once with a fresh browser.
		if (wantPhase('C')) {
			await ensureVite(`${OLD_BASE}/`, { cwd: join(OLD_DIR, 'demo-browser'), label: 'verify-ab-old' })
			const oldUrl = `${OLD_BASE}/index.html?vpx=${encodeURIComponent(vpxUrl)}&rom=${encodeURIComponent(romUrl)}&mode=play`
			let phaseCOk = false
			for (let cAttempt = 1; cAttempt <= 2 && !phaseCOk; cAttempt++) {
				comment(`phase C attempt ${cAttempt}: OLD viewer render legs + paced match`)
				if (cAttempt > 1) {
					await browser.close().catch(() => {})
					browser = await launchBrowser(puppeteer, {
						protocolTimeout: 300_000,
						autoKillMs: BROWSER_BUDGET_MS,
					})
				}
				try {
					const { page: pageC, ready: readyC, logTail: tailC } = await openViewerPage(browser, oldUrl, 'old')
					if (!readyC) throw new Error(`OLD viewer never ready: ${tailC}`)
					const hasPlayer = await pageC
						.waitForFunction(() => !!window.viewer?.player, { timeout: 60000 })
						.then(() => true)
						.catch(() => false)
					if (!hasPlayer) {
						const diag = await pageC
							.evaluate(() => ({
								hasViewer: !!window.viewer,
								mode: window.viewer?.viewerMode ?? null,
								hasTable: !!window.viewer?.table,
								keys: window.viewer ? Object.keys(window.viewer).slice(0, 20) : [],
							}))
							.catch(e => ({ err: String(e).slice(0, 120) }))
						throw new Error(`OLD viewer has no player after Ready: ${JSON.stringify(diag)}`)
					}
					report.old.viewer = await abRenderLegs(pageC, 'old')
					report.old.ball = await abOldBallGate(pageC)
					comment(
						`OLD ball gate: ${JSON.stringify({ ok: report.old.ball.ok, eng: report.old.ball.struct?.engineBalls, meshes: report.old.ball.struct?.ballMeshes })}`,
					)
					// Fresh page for the long match: one SwiftShader tab accumulating
					// legs + gate + freeze + match dies under memory pressure, while a
					// fresh tab per half passes. The match boots its own ROM state, so
					// the split changes no gate semantics.
					await pageC.close().catch(() => {})
					await browser.close().catch(() => {})
					browser = await launchBrowser(puppeteer, {
						protocolTimeout: 300_000,
						autoKillMs: BROWSER_BUDGET_MS,
					})
					const { page: pageM, ready: readyM, logTail: tailM } = await openViewerPage(browser, oldUrl, 'old')
					if (!readyM) throw new Error(`OLD viewer never ready (match page): ${tailM}`)
					const hasPlayerM = await pageM
						.waitForFunction(() => !!window.viewer?.player, { timeout: 60000 })
						.then(() => true)
						.catch(() => false)
					if (!hasPlayerM) throw new Error('OLD viewer has no player after Ready (match page)')
					const frozen = await abOldFreeze(pageM)
					report.old.frozen = frozen
					comment(`OLD frozen: ${JSON.stringify(frozen)}`)
					if (!frozen.frozen) throw new Error('OLD loop would not freeze; paced comparison invalid')
					if (!frozen.mock) comment('NOTE: OLD emu is not mock; ROM-driven deviations do not apply')
					const oldMatch = await runScriptedMatch({
						side: 'old',
						notes: frozen.mock
							? ['mock pinmame emu: coins/start are no-ops, DMD stays blank, ejects staged']
							: [],
						chunk: (label, opts) => abOldChunk(pageM, label, opts),
						stage: (tag, notes) => abOldStageEject(pageM, tag, notes),
						bootOpts: { steps: 1500, sampleEvery: 100, dmdEvery: 50 },
					})
					report.old.match = {
						traj: oldMatch.traj,
						taps: oldMatch.taps,
						relaunches: oldMatch.relaunches,
						notes: oldMatch.notes,
					}
					report.old.cadence = await abOldCadence(pageM)
					comment(`OLD cadence: ${JSON.stringify(report.old.cadence)}`)
					report.old.flipperGate = await abOldFlipperGate(pageM)
					comment(`OLD flipper gate: ${JSON.stringify(report.old.flipperGate.keys)}`)
					report.old.tris = await abTriCensus(pageM)
					comment(`OLD tris: ${JSON.stringify(report.old.tris)}`)
					await pageM.close().catch(() => {})
					phaseCOk = true
				} catch (e) {
					report.old.infraRetry = { attempt: cAttempt, error: String(e?.message ?? e).slice(0, 200) }
					comment(`phase C attempt ${cAttempt} aborted: ${report.old.infraRetry.error}`)
					if (!isInfraAbort(e) || cAttempt >= 2) throw e
				}
			}
			writeFileSync(
				join(OUT, 'verify-ab-phase-C.json'),
				JSON.stringify({ when: report.when, phase: 'C', old: report.old }, null, 1),
			)
		}
	} finally {
		await browser.close().catch(() => {})
	}

	// ---- gates ------------------------------------------------------------
	// Single-leg runs evaluate only the gates their legs feed; the rest SKIP
	// with 'phase not run'. Full runs have every input, so each gate keeps its
	// exact name, order, and pass/fail semantics.
	const N = report.new
	const O = report.old
	const hasNTraj = !!N.match?.traj
	const hasOTraj = !!O.match?.traj
	const hasNStruct = !!N.viewer?.struct
	const hasOStruct = !!O.viewer?.struct
	const hasStruct = hasNStruct && hasOStruct
	const hasViewer = !!N.viewer && !!O.viewer
	const hasMatch = hasNTraj && hasOTraj
	const nM = hasNTraj ? summarizeMatch(N.match.traj) : null
	const oM = hasOTraj ? summarizeMatch(O.match.traj) : null
	if (nM) report.new.metrics = nM
	if (oM) report.old.metrics = oM
	const nAudio = hasNTraj ? summarizeAudio(N.match.traj) : null
	if (nAudio) report.new.audio = { ...nAudio, drainTwice: N.drainTwice }
	if (nM)
		comment(
			`NEW metrics: eject=${nM.eject.ok} launch=${nM.launch.ok}@${nM.launch.minY} drains=${nM.drains.length} flip=${nM.flipperExcursion} dmd=${nM.dmdLit}/${nM.dmdTransitions}`,
		)
	if (oM)
		comment(
			`OLD metrics: eject=${oM.eject.ok} launch=${oM.launch.ok}@${oM.launch.minY} drains=${oM.drains.length} flip=${oM.flipperExcursion}`,
		)

	const structOk = s =>
		!!s && !s.err && (s.cab?.vis ?? 0) > 0 && (s.bake?.ready ?? 0) > 0 && (s.dmdMeshes?.length ?? 0) > 0
	gate(
		hasNStruct,
		structOk(N.viewer?.struct),
		'render structure-new',
		`cab=${N.viewer?.struct?.cab?.vis} bake=${N.viewer?.struct?.bake?.ready} dmdMeshes=${N.viewer?.struct?.dmdMeshes?.length}`,
	)
	gate(
		hasOStruct,
		structOk(O.viewer?.struct),
		'render structure-old',
		`cab=${O.viewer?.struct?.cab?.vis} bake=${O.viewer?.struct?.bake?.ready} dmdMeshes=${O.viewer?.struct?.dmdMeshes?.length}`,
	)
	gate(
		hasStruct,
		!!N.viewer?.struct?.room === !!O.viewer?.struct?.room,
		'render room-parity',
		`new=${N.viewer?.struct?.room} old=${O.viewer?.struct?.room}`,
	)
	gate(
		hasStruct,
		Math.abs((N.viewer?.struct?.cab?.vis ?? -1) - (O.viewer?.struct?.cab?.vis ?? -2)) <= 2,
		'render cabinet-parity',
		`new=${N.viewer?.struct?.cab?.vis} old=${O.viewer?.struct?.cab?.vis}`,
	)
	const giN = N.viewer?.struct?.lights?.gi ?? { lit: -1, total: 0 }
	const giO = O.viewer?.struct?.lights?.gi ?? { lit: -1, total: 0 }
	gate(hasNStruct, giN.lit > 0, 'render gi-lit-new', `${giN.lit}/${giN.total}`)
	gate(hasOStruct, giO.lit > 0, 'render gi-lit-old', `${giO.lit}/${giO.total}`)
	gate(
		hasStruct,
		Math.abs(giN.lit - giO.lit) <= Math.ceil(TOL.giLitRatio * Math.max(giN.lit, giO.lit, 1)),
		'render gi-parity',
		`new=${giN.lit} old=${giO.lit}`,
	)

	const settleOf = legs => {
		const bad = []
		for (const [name, s] of Object.entries(legs?.shots ?? {})) {
			if (!s?.first?.mean || !s?.second?.mean) {
				bad.push(`${name}=missing`)
				continue
			}
			const d = Math.abs(s.first.mean - s.second.mean)
			if (!(d <= TOL.shotSettle)) bad.push(`${name}=${d.toFixed(1)}`)
		}
		return bad
	}
	const setN = settleOf(N.viewer, 'new')
	const setO = settleOf(O.viewer, 'old')
	gate(!!N.viewer, setN.length === 0, 'render shots-settled-new', setN.join(',') || 'all views stable')
	gate(!!O.viewer, setO.length === 0, 'render shots-settled-old', setO.join(',') || 'all views stable')
	const means = []
	for (const [side, legs] of [
		['new', N.viewer],
		['old', O.viewer],
	]) {
		for (const [name, s] of Object.entries(legs?.shots ?? {}))
			means.push(`${side}/${name}=${s?.second?.mean ?? s?.first?.mean ?? 'n/a'}`)
	}
	const allMeans = []
	for (const [, legs] of [
		['new', N.viewer],
		['old', O.viewer],
	]) {
		for (const s of Object.values(legs?.shots ?? {})) {
			const m = s?.second?.mean ?? s?.first?.mean
			if (typeof m === 'number') allMeans.push(m)
		}
	}
	gate(
		hasViewer,
		allMeans.length === 8 && allMeans.every(m => m > TOL.shotNonBlank),
		'render shots-nonblank',
		means.join(' '),
	)

	const rgbN = N.viewer?.rgb?.rgb
	const rgbO = O.viewer?.rgb?.rgb
	const shiftN = rgbN ? rgbN[2] - rgbN[0] : null
	const shiftO = rgbO ? rgbO[2] - rgbO[0] : null
	gate(
		!!rgbN && !!rgbO,
		shiftN !== null &&
			shiftO !== null &&
			shiftN <= TOL.giBlueShift &&
			Math.abs(shiftN - shiftO) <= TOL.giBlueShiftParity,
		'render gi-color',
		`new(B-R)=${shiftN} old(B-R)=${shiftO} rgbNew=${rgbN} rgbOld=${rgbO}`,
	)
	comment(
		'known deviations (mock PinMAME on OLD): coins/start no-op, DMD blank, ejects staged via sw21.Kick; ROM audio absent',
	)
	gate(
		!!N.ball,
		!!N.ball?.ok && (N.ball?.struct?.ballMeshes ?? 0) > 0,
		'render ball-visible-new',
		`inPlay=${N.ball?.struct?.engineBalls?.inPlay} meshes=${N.ball?.struct?.ballMeshes}`,
	)
	gate(
		!!O.ball,
		!!O.ball?.ok && (O.ball?.struct?.ballMeshes ?? 0) > 0,
		'render ball-visible-old',
		`inPlay=${O.ball?.struct?.engineBalls?.inPlay} meshes=${O.ball?.struct?.ballMeshes}`,
	)
	gate(
		!!N.cadence,
		typeof N.cadence?.sps === 'number' && N.cadence.sps >= TOL.stepsPerSec,
		'physics steps-per-sec-new',
		`${N.cadence?.sps} steps/s over ${N.cadence?.wallMs}ms`,
	)
	gate(
		!!O.cadence,
		typeof O.cadence?.sps === 'number' && O.cadence.sps >= TOL.stepsPerSec,
		'physics steps-per-sec-old',
		`${O.cadence?.sps} steps/s over ${O.cadence?.wallMs}ms resets=${O.cadence?.resets ?? 0}`,
	)
	const spsRatio =
		typeof N.cadence?.sps === 'number' && typeof O.cadence?.sps === 'number' && O.cadence.sps > 0
			? N.cadence.sps / O.cadence.sps
			: null
	gate(
		!!N.cadence && !!O.cadence,
		spsRatio !== null && spsRatio >= TOL.stepsParityRatio[0] && spsRatio <= TOL.stepsParityRatio[1],
		'physics steps-parity-ratio',
		`new/old=${spsRatio}`,
	)

	gate(hasMatch, !!nM?.eject?.ok, 'gameplay eject-new', nM?.eject?.detail)
	gate(hasMatch, !!oM?.eject?.ok, 'gameplay eject-old-staged', `STAGED deviation: ${oM?.eject?.detail}`)
	gate(hasMatch, !!nM?.launch?.ok, 'gameplay launch-new', `minY=${nM?.launch?.minY} first=${nM?.launch?.firstAt}`)
	gate(hasMatch, !!oM?.launch?.ok, 'gameplay launch-old', `minY=${oM?.launch?.minY} first=${oM?.launch?.firstAt}`)
	const bothLaunch = !!nM?.launch?.ok && !!oM?.launch?.ok
	gate(
		hasMatch,
		bothLaunch && Math.abs((nM?.launch?.minY ?? 0) - (oM?.launch?.minY ?? 0)) <= TOL.plungeMinY,
		'physics plunge-miny-parity',
		`new=${nM?.launch?.minY} old=${oM?.launch?.minY}`,
	)
	gate(
		hasMatch,
		(nM?.nanEvents ?? 1) === 0 && (oM?.nanEvents ?? 1) === 0,
		'physics no-nan',
		`new=${nM?.nanEvents} old=${oM?.nanEvents}`,
	)
	gate(
		hasMatch,
		(nM?.frozen?.length ?? 1) === 0 && (oM?.frozen?.length ?? 1) === 0,
		'physics no-frozen',
		`new=${nM?.frozen?.length} old=${oM?.frozen?.length}`,
	)
	gate(
		hasMatch,
		(nM?.teleports?.length ?? 1) === 0 && (oM?.teleports?.length ?? 1) === 0,
		'physics no-teleport',
		`new=${JSON.stringify(nM?.teleports?.slice(0, 2))} old=${JSON.stringify(oM?.teleports?.slice(0, 2))}`,
	)
	const corridorBad = hasMatch ? [...nM.bounds, ...oM.bounds].length : 0
	const drainBad = hasMatch
		? [...nM.drains, ...oM.drains].filter(d => d.lastX < TOL.drainCorridor[0] || d.lastX > TOL.drainCorridor[1])
		: []
	gate(
		hasMatch,
		corridorBad === 0 && drainBad.length === 0,
		'physics drain-line-corridor',
		`bounds=${corridorBad} offCorridor=${drainBad.length} drainsNew=${nM?.drains?.length} drainsOld=${oM?.drains?.length}`,
	)
	if (hasMatch)
		comment(
			`drains: new=${JSON.stringify(nM.drains.map(d => `${d.at}x${d.lastX}`))} old=${JSON.stringify(oM.drains.map(d => `${d.at}x${d.lastX}`))}`,
		)
	gate(
		hasMatch,
		(nM?.flipperExcursion ?? 0) > TOL.flipperExcursion,
		'physics flipper-excursion-new',
		`${nM?.flipperExcursion}`,
	)
	gate(
		hasMatch,
		(oM?.flipperExcursion ?? 0) > TOL.flipperExcursion,
		'physics flipper-excursion-old',
		`${oM?.flipperExcursion}`,
	)
	// Census data lives next to the struct (same viewer leg); a missing census
	// with a present struct is a failure, never a vacuous pass. Legs that did
	// not run SKIP per the gate() contract.
	const nFlip = N.flipperGate?.keys
	gate(
		hasNStruct,
		(nFlip?.shift?.excursion ?? 0) > TOL.flipperKey,
		'input flipper-shift-new',
		`${nFlip?.shift?.excursion}`,
	)
	gate(
		hasNStruct,
		(nFlip?.arrowL?.excursion ?? 0) > TOL.flipperKey,
		'input flipper-arrowL-new',
		`${nFlip?.arrowL?.excursion}`,
	)
	gate(
		hasNStruct,
		(nFlip?.arrowR?.excursion ?? 0) > TOL.flipperKey,
		'input flipper-arrowR-new',
		`${nFlip?.arrowR?.excursion}`,
	)
	// No OLD flipper gate by design: the script-only input contract (never
	// drive flippers directly; rotation happens only via script-called
	// RotateToEnd/Start through the emulator) means mock-OLD, which ships no
	// emulation, cannot move flippers on any key path (measured excursion is
	// exactly 0). The NEW-side gates above carry the flipper regression
	// coverage; re-add an OLD gate only if OLD ever runs real emulation.
	const nTris = (Array.isArray(N.tris) ? N.tris : []).filter(t => t.visible).map(t => t.name)
	const oTris = (O.tris ?? []).filter(t => t.visible).map(t => t.name)
	gate(
		hasNStruct,
		Array.isArray(N.tris) && nTris.length === 0,
		'render drain-triangle-set-new',
		JSON.stringify(nTris),
	)
	if (hasOStruct)
		comment(
			`OLD tris: ${JSON.stringify(oTris)} (explicit deviation: OLD shows the file-visible leftover, NEW hides it via the author-debug pass)`,
		)
	// DMD panel presence is unconditional; visibility is required once the
	// same leg's DMD texture is lit (mock-OLD never lights it, so OLD pins
	// existence while NEW pins existence + visible panel).
	const nDmd = N.viewer?.struct?.dmdMeshes
	const oDmd = O.viewer?.struct?.dmdMeshes
	const nDmdLit = N.viewer?.struct?.dmdTex?.lit === true
	const oDmdLit = O.viewer?.struct?.dmdTex?.lit === true
	gate(
		hasNStruct,
		Array.isArray(nDmd) && nDmd.length > 0 && (!nDmdLit || nDmd.some(m => m.vis)),
		'render showcase-dmd-shown-new',
		`lit=${nDmdLit} meshes=${JSON.stringify((nDmd ?? []).map(m => m?.name))}`,
	)
	gate(
		hasOStruct,
		Array.isArray(oDmd) && oDmd.length > 0 && (!oDmdLit || oDmd.some(m => m.vis)),
		'render showcase-dmd-shown-old',
		`lit=${oDmdLit} meshes=${JSON.stringify((oDmd ?? []).map(m => m?.name))}`,
	)
	const nDrains = hasMatch && ((nM?.drains?.length ?? 0) > 0 || (N.match?.relaunches?.length ?? 0) > 0)
	const oDrains = hasMatch && ((oM?.drains?.length ?? 0) > 0 || (O.match?.relaunches?.length ?? 0) > 0)
	const nRec = !nDrains || (N.match?.relaunches ?? []).some(r => r.ok)
	const oRec = !oDrains || (O.match?.relaunches ?? []).some(r => r.ok)
	gate(
		hasMatch,
		nRec && oRec,
		'gameplay relaunch-protocol',
		`newAttempts=${JSON.stringify(N.match?.relaunches)} oldAttempts=${JSON.stringify(O.match?.relaunches)}`,
	)

	gate(
		hasNTraj,
		!!nM?.dmdLit && (nM?.dmdTransitions ?? 0) >= 1,
		'dmd lit-new',
		`lit=${nM?.dmdLit} transitions=${nM?.dmdTransitions}`,
	)
	const oldDmdMax = hasOTraj
		? Math.max(
				0,
				...Object.values(O.match.traj).flatMap(c => [
					...(c.dmd ?? []).map(([, d]) => d?.sum ?? 0),
					c.finalDmd?.sum ?? 0,
				]),
			)
		: 0
	if (O.frozen?.mock)
		gate(hasOTraj, oldDmdMax === 0, 'deviation mock-dmd-old', `EXPECTED blank (mock emu): maxSum=${oldDmdMax}`)
	else gate(hasOTraj && !!O.frozen, oldDmdMax > 0, 'dmd lit-old', `real emu: maxSum=${oldDmdMax}`)

	const rate = nAudio?.burst?.rate ?? 0
	if (!nAudio) {
		for (const name of [
			'audio attract-silence',
			'audio coin-burst',
			'audio start-burst',
			'audio single-scheduling',
			'audio no-double-play',
		]) {
			skip(name, 'phase not run')
		}
	} else if (!(rate > 0)) {
		for (const name of [
			'audio attract-silence',
			'audio coin-burst',
			'audio start-burst',
			'audio single-scheduling',
			'audio no-double-play',
		]) {
			skip(name, 'no audio rate from engine')
		}
	} else {
		const nominal = (rate * 16.7) / 1000
		const ratio = nAudio.burst.frames / Math.max(1, nAudio.burst.steps * nominal)
		report.new.audio.ratio = +ratio.toFixed(3)
		tap(
			nAudio.attract.energetic === 0 && nAudio.attract.rmsMax <= TOL.audioSilenceRms,
			'audio attract-silence',
			`rmsMax=${nAudio.attract.rmsMax} peakMax=${nAudio.attract.peakMax}`,
		)
		const coinEnergetic = Object.entries(N.match.traj)
			.filter(([l]) => /^coin[1-6]$/.test(l))
			.map(([, c]) => c.audio)
			.filter(a => a && (a.rmsMax > TOL.audioBurstRms || a.peakMax > TOL.audioBurstPeak)).length
		const startAudio = N.match.traj.start?.audio
		const startHit =
			!!startAudio && (startAudio.rmsMax > TOL.audioBurstRms || startAudio.peakMax > TOL.audioBurstPeak)
		tap(coinEnergetic >= 4, 'audio coin-burst', `${coinEnergetic}/6 coin windows energetic`)
		tap(startHit, 'audio start-burst', `rmsMax=${startAudio?.rmsMax} peakMax=${startAudio?.peakMax}`)
		tap(
			ratio >= TOL.audioFramesRatio[0] && ratio <= TOL.audioFramesRatio[1],
			'audio single-scheduling',
			`frames/step=${ratio.toFixed(2)}x nominal (${rate}Hz)`,
		)
		tap(
			N.drainTwice?.second === 0,
			'audio no-double-play',
			`drainTwice=${N.drainTwice?.first}/${N.drainTwice?.second}`,
		)
	}

	finish(report)
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main().catch(e => {
		tap(false, 'ab-fatal', String(e?.message ?? e).slice(0, 300))
		try {
			finish({ when: new Date().toISOString(), fatal: String(e?.stack || e).slice(0, 1000) })
		} catch {
			process.exitCode = 1
		}
	})
}

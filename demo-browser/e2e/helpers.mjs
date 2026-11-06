import path from 'node:path'

export const DEFAULT_URL = 'https://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=viewer'

// Single source of truth for "insert-like" names (mesh, material, primitive,
// collection keys). page.evaluate callbacks cannot close over module scope, so
// call sites pass this string in and build the RegExp inside the page.
export const INSERT_NAME_PATTERN = 'insert|round|rect|flasher|vrlight|switc'

export const pollLog = async (page, needle, timeout = 60000, label = needle) => {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		try {
			const txt = await page.evaluate(() => document.getElementById('log')?.innerText || '')
			if (txt.includes(needle)) return txt
		} catch {}
		await new Promise(r => setTimeout(r, 500))
	}
	return page.evaluate(() => document.getElementById('log')?.innerText || '').catch(() => '')
}

export const waitReady = async (page, timeout = 60000) => {
	// Load state lives on body.dataset (window.vpx.whenReady); the log poll
	// below is only a fallback for builds without the dev test API.
	try {
		await page.evaluate(t => window.vpx.whenReady(t), timeout)
	} catch {
		await pollLog(page, 'Ready', timeout, 'Ready')
	}
	return page.evaluate(() => document.getElementById('log')?.innerText || '')
}

export const hideOverlays = page =>
	page.evaluate(() => {
		const l = document.getElementById('log')
		if (l) l.style.display = 'none'
		const a = document.getElementById('harness-actions')
		if (a) a.style.display = 'none'
	})

export const diagnostics = page =>
	page.evaluate(() => {
		const out = []
		const g = window.tableGroup,
			r = window.renderer,
			cam = window.camera,
			ctr = window.controls
		out.push(`renderer ${r ? `${r.info.render.triangles} tris ${r.info.render.calls} draws` : 'no renderer'}`)
		if (cam)
			out.push(
				`cam ${cam.position.x.toFixed(0)},${cam.position.y.toFixed(0)},${cam.position.z.toFixed(0)} target ${ctr?.target.x.toFixed(0)},${ctr?.target.y.toFixed(0)},${ctr?.target.z.toFixed(0)}`,
			)
		if (!g) return out.join('\n')
		const list = []
		g.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (n.includes('playfield') || n.includes('bm_') || n.includes('vlm')) {
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const m of mats)
					list.push(
						`${o.name} mat=${m.name} map=${m.map?.name || ''} side=${m.side} emiss=${m.emissiveIntensity}`,
					)
			}
		})
		out.push(`playfield meshes (${list.length}):`)
		out.push(...list.slice(0, 20))
		const sides = {}
		g.traverse(o => {
			if (o.isMesh && o.material) {
				const m = Array.isArray(o.material) ? o.material[0] : o.material
				sides[m.side] = (sides[m.side] || 0) + 1
			}
		})
		out.push(`sides ${JSON.stringify(sides)}`)
		let visiblePending = 0,
			hiddenPending = 0,
			cab = 0,
			cabMapped = 0,
			cabPending = 0,
			cabEmissiveOk = 0,
			cabEmissiveMissing = 0
		g.traverse(o => {
			if (o.isMesh && o.material) {
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				// Node materials stash the wanted name in __mapName until __map binds.
				for (const m of mats)
					if (m.userData?.pendingMap || (!m.map && !m.userData?.__map && m.userData?.__mapName))
						o.visible ? visiblePending++ : hiddenPending++
			}
		})
		g.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (!(n.includes('vrcab') || n.includes('vr_') || n.includes('cabinet') || n.includes('lockbar'))) return
			cab++
			const m = Array.isArray(o.material) ? o.material[0] : o.material
			if (!m) return
			const hasMap = !!(m.map || m.userData?.__map)
			if (hasMap) {
				cabMapped++
				if (m.userData?.pendingMap) cabPending++
			}
			if (m.map && m.emissiveMap && m.emissiveIntensity > 0) cabEmissiveOk++
			else if (m.map) cabEmissiveMissing++
		})
		out.push(`pending visible=${visiblePending} hidden=${hiddenPending}`)
		out.push(
			`cab total=${cab} mapped=${cabMapped} pending=${cabPending} emissiveOk=${cabEmissiveOk} missing=${cabEmissiveMissing}`,
		)
		out.push(`cache ${window.renderApi?.getMapGenerator?.().getCache?.().size ?? -1}`)
		if (cab && cabMapped / cab < 0.5) out.push(`WARN dark cabinet: only ${cabMapped}/${cab} mapped`)
		if (cabEmissiveMissing > 5) out.push(`WARN cab emissive ${cabEmissiveMissing} missing`)
		if (visiblePending > 10) out.push(`WARN visible pending ${visiblePending}`)
		try {
			const cvs = r?.domElement || document.getElementById('canvas')
			if (cvs?.width) {
				if (r && window.scene && cam)
					try {
						r.render(window.scene, cam)
					} catch {}
				const tmp = document.createElement('canvas'),
					W = Math.min(160, cvs.width),
					H = Math.min(120, cvs.height)
				tmp.width = W
				tmp.height = H
				const ctx = tmp.getContext('2d', { willReadFrequently: true })
				if (ctx) {
					try {
						ctx.drawImage(cvs, 0, 0, W, H)
					} catch {}
					const sx = Math.floor(W * 0.25),
						sy = Math.floor(H * 0.55),
						sw = Math.floor(W * 0.5),
						sh = Math.floor(H * 0.3)
					try {
						const img = ctx.getImageData(sx, sy, sw, sh)
						let sum = 0,
							cnt = 0
						for (let i = 0; i < img.data.length; i += 4)
							if (img.data[i + 3] >= 10) {
								sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
								cnt++
							}
						const avg = cnt ? Math.round(sum / cnt) : 0
						out.push(`luminance avg=${avg} sample ${sx},${sy} ${sw}x${sh}`)
						// No WARN thresholds here: this samples whatever frame
						// happens to be presented (stale room view, any lamp
						// phase). The playfield brightness leg owns the
						// end-to-end light gate with a set camera + GI state.
					} catch (e) {
						out.push(`luminance err ${e.message}`)
					}
				}
			}
		} catch (e) {
			out.push(`luminance outer ${e.message}`)
		}
		return out.join('\n')
	})

export const physicsChecks = async page => {
	await ensurePlayMode(page)
	await new Promise(r => setTimeout(r, 1500))
	return page.evaluate(async () => {
		const api = window.vpx,
			out = {}
		const sleep = ms => new Promise(r => setTimeout(r, ms))
		if (!api) {
			const skip = { pass: 'skip', reason: 'no test api (window.vpx)' }
			return { flipper: skip, coin: skip, start: skip, clock: skip }
		}
		const angleOf = idx => api.state.flippers.find(f => f.partIdx === idx)?.angle
		// Flipper: the one mover row the seam exposes directly. Prefer the
		// left flipper by name so the ShiftLeft press drives the measured part.
		try {
			const flippers = api.state.flippers
			if (!flippers.length) {
				out.flipper = { before: 0, mid: 0, after: 0, pass: 'skip', reason: 'no flipper in table' }
			} else {
				const target = flippers.find(f => /left/i.test(f.name || '')) || flippers[0]
				const code =
					/right/i.test(target.name || '') && !/left/i.test(target.name || '') ? 'ShiftRight' : 'ShiftLeft'
				const before = target.angle
				api.sendKey(code, true)
				let mid = before
				const t0 = Date.now()
				while (Date.now() - t0 < 2000) {
					await sleep(50)
					mid = angleOf(target.partIdx) ?? mid
					if (Math.abs(mid - before) > 0.2) break
				}
				api.sendKey(code, false)
				await sleep(500)
				const after = angleOf(target.partIdx) ?? mid
				out.flipper = { before, mid, after, pass: Math.abs(mid - before) > 0.2 }
			}
		} catch (e) {
			out.flipper = { before: 0, mid: 0, after: 0, pass: false, error: String(e?.message ?? e) }
		}
		// Coin/start: the seam has no switch-input accessor, so a press is
		// judged by the script's observable response (DMD sum, lamp activity)
		// against pre-press jitter. No script output at all means the fixture
		// cannot answer — honest skip.
		const dmdSum = () => {
			try {
				const d = api.dmd()
				if (!d || !d.frame?.length) return { present: false, sum: 0 }
				let sum = 0
				for (let i = 0; i < d.frame.length; i++) sum += d.frame[i]
				return { present: true, sum }
			} catch {
				return { present: false, sum: 0 }
			}
		}
		const baseline = async () => {
			const sums = []
			for (let i = 0; i < 4; i++) {
				sums.push(dmdSum().sum)
				await sleep(250)
			}
			const mean = sums.reduce((a, b) => a + b, 0) / sums.length
			const sd = Math.sqrt(sums.reduce((a, b) => a + (b - mean) ** 2, 0) / sums.length)
			return { mean, sd, lights: api.state.lightActivity }
		}
		const pressForResponse = async code => {
			const pre = await baseline()
			const d0 = dmdSum()
			api.sendKey(code, true)
			await sleep(350)
			api.sendKey(code, false)
			const t0 = Date.now()
			let responded = false,
				post = { sum: d0.sum, lights: pre.lights }
			while (Date.now() - t0 < 4000 && !responded) {
				await sleep(100)
				const d = dmdSum()
				const lights = api.state.lightActivity
				post = { sum: d.sum, lights }
				// A response exceeds both the pre-press jitter band and an
				// absolute floor (a static attract frame jitters ~0).
				responded = Math.abs(d.sum - pre.mean) > Math.max(3 * pre.sd, 500) || lights > pre.lights
			}
			return { pre, post, responded, dmdPresent: d0.present || dmdSum().present }
		}
		for (const [key, code] of [
			['coin', 'Digit5'],
			['start', 'Digit1'],
		]) {
			try {
				const r = await pressForResponse(code)
				if (!r.dmdPresent && r.pre.lights === 0 && r.post.lights === 0) {
					out[key] = {
						before: 0,
						mid: 0,
						after: 0,
						pass: 'skip',
						reason: 'no DMD/lamp output: switch response unobservable',
					}
				} else {
					out[key] = {
						before: Math.round(r.pre.mean),
						mid: r.post.sum,
						after: r.post.sum,
						pass: r.responded,
						reason: r.responded
							? 'script responded to press'
							: 'press produced no DMD/lamp response (ROM required?)',
					}
				}
			} catch (e) {
				out[key] = { before: 0, mid: 0, after: 0, pass: false, error: String(e?.message ?? e) }
			}
			await sleep(400)
		}
		try {
			// Host game clock must advance while playing: the rAF loop steps it.
			const tBefore = api.state.gameMs
			await sleep(300)
			const tAfter = api.state.gameMs
			out.clock = { tBefore, tAfter, pass: Number.isFinite(tBefore) && tAfter > tBefore }
		} catch (e) {
			out.clock = { tBefore: -1, tAfter: -1, pass: false, error: String(e?.message ?? e) }
		}
		return out
	})
}

// WASM-engine leg: asserts the headless-bridge guarantees on every run
// (engine ready, part catalog, zero script errors, stepping advances the
// game clock, input routes without throwing). The WASM engine is
// unconditional — there is no TS player to skip for.
export const wasmEngineChecks = async page => {
	await ensurePlayMode(page)
	return page.evaluate(async () => {
		const api = window.vpx
		if (!api) return { pass: false, reason: 'no test api (window.vpx)' }
		try {
			await api.whenReady()
		} catch (e) {
			return { pass: false, reason: `load failed: ${e?.message ?? e}` }
		}
		const s = api.state
		const out = {
			ready: s.wasmReady,
			catalogSize: s.catalogSize,
			scriptErrors: s.scriptErrors,
			ballCount: s.ballCount,
		}
		if (!s.wasmReady) {
			out.pass = false
			out.reason = 'engine not ready'
			return out
		}
		try {
			const t0 = api.state.gameMs
			out.tickOk = api.step()
			await new Promise(r => setTimeout(r, 120))
			out.gameAdvanced = api.state.gameMs > t0
			out.ballCountAfter = api.state.ballCount
			api.sendKey('ArrowLeft', true)
			api.sendKey('ArrowLeft', false)
			api.nudge(75, 2.0)
			out.inputOk = true
		} catch (e) {
			out.error = String(e?.message ?? e).slice(0, 300)
		}
		out.pass = out.tickOk === true && out.inputOk === true && out.scriptErrors === 0 && out.gameAdvanced === true
		if (!out.pass && out.reason === undefined)
			out.reason = `tick=${out.tickOk} input=${out.inputOk} scriptErrors=${out.scriptErrors} advanced=${out.gameAdvanced}`
		return out
	})
}

// Plunger leg: hold Enter ~800ms (the viewer's plunger key), release, and
// assert the script actually pulled the plunger or launched the ball.
// Tables can carry several plungers (e.g. Walking Dead parses the ROM-fired
// auto `Plunger1` first and the script-driven manual `Plunger` second), so
// measure every plunger and judge the manual (non-auto) ones when the table
// has any — an auto plungers[0] never moves on Enter. Falls back to all
// plungers on auto-only tables. Skips honestly when there is no live
// script/physics to drive it (mock emu) or when the table has no plunger
// (e.g. table-empty).
// Plunger leg: hold Enter (the viewer's plunger key), release, and assert
// the engine pulled a plunger or launched a ball. Travel is judged on the
// normalized engine pull (0..1) across every catalog plunger — the old
// manual-vs-auto distinction lived on the deleted script API, and the leg
// already fell back to all plungers on auto-only tables. Skips honestly
// when the table has no plunger (e.g. table-empty).
export const plungerChecks = async page => {
	const play = await ensurePlayMode(page)
	return page.evaluate(async play => {
		const api = window.vpx
		const out = {}
		if (!api) {
			out.pass = 'skip'
			out.reason = 'no test api (window.vpx)'
			return out
		}
		if (!play?.ok) {
			out.pass = false
			out.reason = `play mode not entered: ${play?.reason ?? 'unknown'}`
			return out
		}
		try {
			const sleep = ms => new Promise(r => setTimeout(r, ms))
			const pulls = () => {
				const m = {}
				for (const p of api.state.plungers) m[p.name ?? `plunger${p.partIdx}`] = p.pull
				return m
			}
			const plungers = api.state.plungers
			if (!plungers.length) {
				out.pass = 'skip'
				out.reason = 'no plunger in table'
				return out
			}
			out.measured = plungers.map(p => p.name ?? `plunger${p.partIdx}`)
			const beforeAll = pulls()
			const ballsBefore = api.state.balls
			const base = new Map(ballsBefore.map(b => [b.id, b]))
			let best = null,
				bestTravel = 0
			const note = snap => {
				for (const k of Object.keys(snap)) {
					const travel = Math.abs(snap[k] - (beforeAll[k] ?? 0))
					if (!best || travel > bestTravel) {
						best = k
						bestTravel = travel
					}
				}
			}
			api.sendKey('Enter', true)
			let heldAll = {}
			const t0 = Date.now()
			while (Date.now() - t0 < 800) {
				await sleep(50)
				heldAll = pulls()
				note(heldAll)
			}
			api.sendKey('Enter', false)
			await sleep(800)
			const afterAll = pulls()
			note(afterAll)
			const ballsAfter = api.state.balls
			// A launch counts even with no visible pull (kicker-style eject).
			let launched = ballsAfter.length > ballsBefore.length
			for (const b of ballsAfter) {
				const prev = base.get(b.id)
				if (!prev || Math.hypot(b.x - prev.x, b.y - prev.y, b.z - prev.z) > 5) launched = true
			}
			out.plungers = { before: beforeAll, held: heldAll, after: afterAll }
			out.before = best ? beforeAll[best] : NaN
			out.held = best ? (heldAll[best] ?? NaN) : NaN
			out.after = best ? afterAll[best] : NaN
			out.travel = +bestTravel.toFixed(3)
			out.launched = launched
			out.best = best
			out.pass = bestTravel > 0.05 || launched
			out.reason = out.pass
				? `plunger ${best} travel ${bestTravel.toFixed(3)} launched=${launched}`
				: `no plunger motion (travel ${bestTravel.toFixed(3)}) and no launch`
			return out
		} catch (e) {
			out.pass = false
			out.error = String(e?.message ?? e)
			return out
		}
	}, play)
}

// Nudge leg: the seam exposes no cabinet-acceleration accessor, so a nudge
// is only observable through a live ball's deflection. Route one engine
// nudge (vpx.nudge) and one KeyZ press (the viewer's nudge key), and judge
// each by the ball's peak per-sample displacement against its pre-nudge
// drift. Skips honestly with no live ball; a resting ball that stays
// resting fails (the impulse never reached it).
export const nudgeChecks = async page => {
	const play = await ensurePlayMode(page)
	return page.evaluate(async play => {
		const api = window.vpx
		const out = {}
		if (!api) {
			out.pass = 'skip'
			out.reason = 'no test api (window.vpx)'
			return out
		}
		if (!play?.ok) {
			out.pass = false
			out.reason = `play mode not entered: ${play?.reason ?? 'unknown'}`
			return out
		}
		try {
			const sleep = ms => new Promise(r => setTimeout(r, ms))
			if (!api.state.balls.length) {
				out.pass = 'skip'
				out.reason = 'no live ball: nudge effect unobservable in WASM seam'
				return out
			}
			// Peak per-100ms displacement of any ball over a window: the
			// pre-nudge window measures idle drift, the post-nudge window
			// must clearly exceed it.
			const peakStep = async windowMs => {
				let peak = 0
				let prev = api.state.balls.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z }))
				const t0 = Date.now()
				while (Date.now() - t0 < windowMs) {
					await sleep(100)
					const cur = api.state.balls.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z }))
					for (const b of cur) {
						const p = prev.find(q => q.id === b.id)
						if (p) peak = Math.max(peak, Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z))
					}
					prev = cur
				}
				return peak
			}
			const drift = await peakStep(1000)
			const floor = 3
			const bar = Math.max(1.5 * drift, floor)
			const attempt = async (label, fire) => {
				fire()
				const peak = await peakStep(1000)
				return { label, peak: +peak.toFixed(2), pass: peak > bar }
			}
			const viaApi = await attempt('api', () => api.nudge(75, 2.6))
			await sleep(400)
			const viaKey = await attempt('key', () => {
				api.sendKey('KeyZ', true)
				return sleep(90).then(() => api.sendKey('KeyZ', false))
			})
			out.before = { drift: +drift.toFixed(2), bar: +bar.toFixed(2) }
			out.mid = { api: viaApi, key: viaKey }
			out.viaApi = viaApi.pass
			out.viaKey = viaKey.pass
			out.stillReady = api.state.wasmReady
			out.pass = (viaApi.pass || viaKey.pass) && api.state.wasmReady
			out.reason = out.pass
				? `nudge deflected ball (api ${viaApi.peak} key ${viaKey.peak} vs bar ${bar.toFixed(2)})`
				: `no deflection above drift (api ${viaApi.peak} key ${viaKey.peak} vs bar ${bar.toFixed(2)})`
			return out
		} catch (e) {
			out.pass = false
			out.error = String(e?.message ?? e)
			return out
		}
	}, play)
}

export const dmdChecks = page =>
	page.evaluate(() => {
		const v = window.viewer,
			emu = v.player.getPhysics().emu
		const frame = (() => {
			try {
				return v.player.getDmdFrame?.()
			} catch {
				return null
			}
		})()
		const dims = (() => {
			try {
				return v.player.getDmdDimensions?.()
			} catch {
				return null
			}
		})()
		let max = 0,
			sum = 0
		if (frame?.length)
			for (const x of frame) {
				if (x > max) max = x
				sum += x
			}
		const meshes = (v.dmdMeshes || []).map(m => ({ name: m.name, hasMap: !!m.material?.map }))
		return {
			emu: emu?.constructor.name || 'none',
			init: emu?.isInitialized?.() ?? null,
			mock: emu?.isMock ?? null,
			w: dims?.x || 0,
			h: dims?.y || 0,
			len: frame?.length || 0,
			max,
			sum,
			meshes,
		}
	})

export const ensurePlayMode = async page => {
	return page.evaluate(async () => {
		const api = window.vpx
		if (!api) return { ok: false, reason: 'no test api (window.vpx)' }
		try {
			await api.whenReady()
		} catch (e) {
			return { ok: false, reason: `not ready: ${e?.message ?? e}` }
		}
		if (api.state.mode !== 'play') {
			try {
				await api.setMode('play')
			} catch (e) {
				return { ok: false, reason: String(e?.message ?? e) }
			}
		}
		let tries = 0
		while (tries < 25) {
			if (api.state.wasmReady) break
			await new Promise(r => setTimeout(r, 400))
			tries++
		}
		const s = api.state
		return { ok: s.wasmReady, mode: s.mode, wasmReady: s.wasmReady, balls: s.ballCount, tries }
	})
}

export const ballChecks = async (page, timeout = 60000) => {
	await ensurePlayMode(page)
	await new Promise(r => setTimeout(r, 1500))
	// Wait briefly for script output (DMD/lit playfield): it tells a
	// no-ejection FAIL (engine runs script) apart from an honest SKIP
	// (fixture cannot eject — no script output at all).
	const settled = await page.evaluate(async () => {
		const api = window.vpx
		const sleep = ms => new Promise(r => setTimeout(r, ms))
		const litSum = () => {
			try {
				const d = api.dmd()
				if (!d || !d.frame?.length) return 0
				let sum = 0
				for (let i = 0; i < d.frame.length; i++) sum += d.frame[i]
				return sum
			} catch {
				return 0
			}
		}
		const t0 = Date.now()
		let sum = 0
		while (Date.now() - t0 < 20000) {
			sum = litSum()
			if (sum > 50000) break
			if (api.state.lightActivity > 0 && Date.now() - t0 > 5000) break
			await sleep(500)
		}
		return { dmdSum: sum, lightActivity: api.state.lightActivity }
	})
	return page.evaluate(async settled => {
		const api = window.vpx
		const out = { settled }
		if (!api) {
			out.pass = 'skip'
			out.skipReason = 'no test api (window.vpx)'
			return out
		}
		const sleep = ms => new Promise(r => setTimeout(r, ms))
		const dmdSum = () => {
			try {
				const d = api.dmd()
				if (!d || !d.frame?.length) return 0
				let sum = 0
				for (let i = 0; i < d.frame.length; i++) sum += d.frame[i]
				return sum
			} catch {
				return 0
			}
		}
		// Trough/drain kickers by engine catalog name (script kicks one of
		// these to eject); kicker inventory is logging context only.
		const names = api.state.partNames
		out.kickerNames = names.filter(n => /kicker/i.test(n || '')).slice(0, 12)
		out.kickerCount = out.kickerNames.length
		out.troughCount = names.filter(n => /trough|drain|ballrelease|outhole|release/i.test(n || '')).length
		const snap = () => api.state.balls.map(b => ({ id: b.id, x: b.x, y: b.y, z: b.z }))
		const before = snap()
		out.before = before
		out.balls = before.length
		let moved = false
		let kickPos = null
		let after = before
		const key = async (code, holdMs) => {
			api.sendKey(code, true)
			await sleep(holdMs)
			api.sendKey(code, false)
		}
		// Coin up, then start: the scripted trough kick ejects on game start.
		for (let attempt = 0; attempt < 3 && !moved; attempt++) {
			await key('Digit5', 500)
			await sleep(1000)
			await key('Digit5', 500)
			await sleep(800)
			await key('Digit1', 500)
			await sleep(800)
			const base = new Map(before.map(b => [b.id, b]))
			const t0 = Date.now()
			while (Date.now() - t0 < 10000 && !moved) {
				await sleep(150)
				const balls = snap()
				after = balls
				for (const b of balls) {
					const prev = base.get(b.id)
					if (!prev) {
						moved = true
						kickPos = { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z) }
						break
					}
					if (Math.hypot(b.x - prev.x, b.y - prev.y, b.z - prev.z) > 5) {
						moved = true
						kickPos = { x: Math.round(b.x), y: Math.round(b.y), z: Math.round(b.z) }
						break
					}
				}
			}
			if (!moved) await sleep(600)
		}
		out.after = after
		out.balls = after.length
		out.moved = moved
		out.kickPos = kickPos
		out.dmdSum = dmdSum()
		out.lightActivity = api.state.lightActivity
		if (moved) {
			out.pass = true
			return out
		}
		// No motion and no script output ever: the fixture cannot eject
		// (empty table, or no ROM driving the script) — honest skip.
		if (settled.dmdSum === 0 && settled.lightActivity === 0 && out.dmdSum === 0 && out.lightActivity === 0) {
			out.pass = 'skip'
			out.skipReason = 'no script output observed (no DMD/lamp activity): ejection unobservable'
			return out
		}
		out.pass = false
		out.reason = 'script output observed but no ball ejected (ROM trough kick required)'
		return out
	}, settled)
}

export const shot = async (page, name, camPos, target, outDir) => {
	try {
		await page.evaluate(
			(cp, tg) => {
				// NOTE: window.camera/window.controls are never assigned —
				// only window.viewer carries the live handles.
				const v = window.viewer
				if (!v) return
				try {
					window.vpx?.cancelCameraAnimation()
				} catch {}
				if (v.controls) v.controls.enabled = false
				const cam = v.camera,
					ctr = v.controls
				if (cp) cam.position.set(...cp)
				if (tg) ctr.target.set(...tg)
				cam.updateMatrixWorld()
				ctr.update()
				try {
					v.renderer.render(v.scene, cam)
				} catch {}
			},
			camPos,
			target,
		)
	} catch {}
	await new Promise(r => setTimeout(r, 700))
	const pth = path.join(outDir, `harness_${name}.png`)
	try {
		await page.screenshot({ path: pth })
	} catch (e) {
		console.log(`[shot:${name}] screenshot failed ${e.message}`)
		return pth
	}
	try {
		await page.evaluate(() => window.gc?.())
	} catch {}
	await new Promise(r => setTimeout(r, 300))
	return pth
}

export const playfieldLightsCheck = async page => {
	// Textures (esp. multi-10s EXR bakes) stream in long after Ready: probing
	// the bake before `[stream] Done` measures a half-built scene. Only wait
	// when streaming actually happened (empty tables never stream).
	try {
		const log = await page.evaluate(() => document.getElementById('log')?.innerText || '')
		if (/streaming|deferred|Pre-loading/i.test(log)) await pollLog(page, '[stream] Done', 150000, 'stream-done')
	} catch {}
	return page.evaluate(async insertPattern => {
		const insertRe = new RegExp(insertPattern, 'i')
		const out = { bake: null, inserts: null, glow: null, brightness: null, pass: true, reason: '' }
		const v = window.viewer
		if (!v || !v.tableGroup) {
			out.reason = 'no viewer/tableGroup'
			out.pass = false
			return out
		}
		const baked = (mesh, mat, map, flag) => {
			const isMat = flag || /bake/i.test(mat) || /bake|nestmap/i.test(map) || /bake|nestmap/i.test(mesh)
			const fam = mesh.includes('bm_') || mesh.includes('playfield')
			return {
				isMat,
				isMainBake: fam && isMat,
				isVlmBake: mesh.includes('playfield') && (/lm_/i.test(mesh) || isMat || mesh.includes('bm_')),
			}
		}
		const classifyBake = (mesh, mat, map, flag) => {
			const { isMat, isMainBake, isVlmBake } = baked(mesh, mat, map, flag)
			return { isMainBake, isBakedMat: isMat, isVlmBake, isBaked: isMainBake || isMat || isVlmBake }
		}
		const isInsertMesh = (mesh, matName) => insertRe.test(mesh) || insertRe.test(matName)
		const bakeInfos = []
		let bakeFail = false
		let pendingBakeFound = false
		let readyBakeFound = false
		v.tableGroup.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (!n.includes('playfield')) return
			const mats = Array.isArray(o.material) ? o.material : [o.material]
			for (const m of mats) {
				const matName = (m.name || '').toLowerCase()
				// Node materials (baked/primitive) carry the map in userData.__map
				// with the wanted name in __mapName — classic .map misses them.
				const nodeMap = m.userData?.__map ?? null
				const mapName = (m.map?.name || nodeMap?.name || '').toLowerCase()
				const pending = (
					m.userData?.pendingMap ??
					m.userData?.pendingmap ??
					(!nodeMap ? m.userData?.__mapName : '') ??
					''
				)
					.toString()
					.toLowerCase()
				const effMap = mapName || pending
				const c = classifyBake(n, matName, effMap, !!m.userData?.__isBaked)
				if (!c.isBaked) continue
				const hasPending = !!pending
				const hasMap = !!m.map || nodeMap != null
				const isNode = !!m.userData?.__bakedNode || !!m.userData?.__primitiveKind
				const emiss = m.emissive?.getHexString?.() ?? ''
				const emissI = m.emissiveIntensity
				const col = m.color?.getHexString?.() ?? ''
				const info = `${o.name} mat=${m.name} map=${m.map?.name || nodeMap?.name || 'null'} pending=${pending || 'none'} emiss=${emiss} I=${emissI} col=${col} vis=${o.visible} effMap=${effMap}`
				bakeInfos.push(info)
				const emissOk = isNode ? true : emiss === 'ffffff' && col === '000000' && emissI >= 0.8 && emissI <= 4.1
				if (o.visible) {
					if (hasPending && !hasMap) {
						pendingBakeFound = true
						if (!emissOk) {
							bakeFail = true
							bakeInfos.push(`FAIL ${info}`)
						}
					} else if (hasMap) {
						readyBakeFound = true
						if (!emissOk) {
							bakeFail = true
							bakeInfos.push(`FAIL ${info}`)
						}
					}
				} else if (hasPending && !hasMap) {
					pendingBakeFound = true
				} else if (hasMap) {
					readyBakeFound = true
				}
			}
		})
		out.bake = {
			infos: bakeInfos.slice(0, 5),
			pendingFound: pendingBakeFound,
			readyFound: readyBakeFound,
			fail: bakeFail,
			count: bakeInfos.length,
		}
		if (!bakeInfos.length) {
			out.bake.reason = 'no bake mesh found — skip (table-empty)'
		} else if (bakeFail) {
			out.pass = false
			out.reason = pendingBakeFound
				? 'bake pending not emissive 1 (fixBaked pending block failed — getBaked misclassify)'
				: 'bake map emissive wrong'
		}
		try {
			const insertSamples = []
			let foundInsert = false
			v.tableGroup.traverse(o => {
				if (!o.isMesh) return
				const n = (o.name || '').toLowerCase()
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const m of mats) {
					const matName = (m.name || '').toLowerCase()
					if (!isInsertMesh(n, matName)) continue
					foundInsert = true
					insertSamples.push(
						`${o.name} vis=${o.visible} emiss=${m.emissive?.getHexString?.()} I=${m.emissiveIntensity} col=${m.color?.getHexString?.()} map=${m.map?.name || 'null'} pending=${m.userData?.pendingMap || 'none'}`,
					)
					break
				}
			})
			out.inserts = {
				samples: insertSamples.slice(0, 6),
				found: foundInsert,
				pending: insertSamples.some(s => s.includes('pending')),
			}
			if (foundInsert === false) {
				try {
					const hasInserts = !!(
						v.table &&
						v.table.collections &&
						(v.table.collections.InsertOn || v.table.collections.InsertOff)
					)
					const hasAnyInsert = Object.keys(v.table?.primitives || {}).some(k => insertRe.test(k))
					if (hasInserts || hasAnyInsert)
						out.inserts.reason = 'no insert mesh matched (but table has inserts)'
				} catch {}
			}
		} catch (e) {
			out.inserts = { error: String(e) }
		}
		try {
			// Lamp glow quads must be visible exactly while their lamp is on
			// (white-wall pass hides build-time; the light updater owns live
			// visibility). A lit lamp with a hidden quad = lost table light.
			// Quads authored invisible stay hidden even when lit by design
			// (bulb-glow-visibility.spec.ts) — their light reaches the table
			// through lightmaps, so the gate skips them.
			let glowTotal = 0
			let glowOn = 0
			let glowVisibleOn = 0
			let glowAuthoredHidden = 0
			v.tableGroup.traverse(o => {
				if (!o.isMesh || o.geometry?.name !== 'bulb.glow') return
				if (o.userData?.__authoredVisible === false) {
					glowAuthoredHidden++
					return
				}
				glowTotal++
				const i = (Array.isArray(o.material) ? o.material[0] : o.material)?.userData?.__uIntensity?.value ?? 0
				if (i > 0.01) {
					glowOn++
					if (o.visible) glowVisibleOn++
				}
			})
			out.glow = { total: glowTotal, on: glowOn, visibleOn: glowVisibleOn, authoredHidden: glowAuthoredHidden }
			if (glowTotal > 0 && glowOn > 0 && glowVisibleOn !== glowOn) {
				out.pass = false
				out.reason = `glow quads hidden while lit (${glowVisibleOn}/${glowOn} visible)`
			}
		} catch (e) {
			out.glow = { error: String(e) }
		}
		try {
			// End-to-end light check: with GI lamps on, the playfield must
			// actually emit photons. Positions the camera deterministically
			// (viewer handles — window.camera is unset), renders, and samples
			// the playfield region in the same task. Restores controls after.
			const wasEnabled = v.controls?.enabled
			try {
				window.vpx?.cancelCameraAnimation()
			} catch {}
			if (v.controls) v.controls.enabled = false
			v.camera.position.set(0, 5, 35)
			v.controls.target.set(0, -5, 0)
			v.camera.updateMatrixWorld()
			v.controls.update()
			v.renderer.render(v.scene, v.camera)
			const src = v.renderer.domElement
			const c = document.createElement('canvas')
			c.width = 160
			c.height = 112
			const ctx = c.getContext('2d')
			ctx.drawImage(src, 0, 0, 160, 112)
			const d = ctx.getImageData(0, 0, 160, 112).data
			let sum = 0
			for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
			const mean = sum / (d.length / 4)
			let gi = 0
			v.tableGroup.traverse(o => {
				if (!o.isMesh || !/lm_gi0_playfield/i.test(o.name)) return
				const m = Array.isArray(o.material) ? o.material[0] : o.material
				const cur = m?.userData?.__uIntensity?.value ?? 0
				if (cur > gi) gi = cur
			})
			if (v.controls) v.controls.enabled = wasEnabled
			// Calibrated on walking_dead GL: buried-GI dark baseline ~10-20,
			// lit playfield ~110. GI<=1 means lamps are genuinely dim — a dark
			// frame is correct then, so only gate catastrophic black (<3).
			out.brightness = { mean: +mean.toFixed(1), gi: +gi.toFixed(2) }
			if (mean < 3) {
				out.pass = false
				out.reason = `playfield renders black (mean ${mean.toFixed(1)})`
			} else if (gi > 1 && mean < 25) {
				out.pass = false
				out.reason = `GI lamps on (${gi.toFixed(2)}) but playfield dark (mean ${mean.toFixed(1)})`
			}
		} catch (e) {
			out.brightness = { error: String(e) }
		}
		return out
	}, INSERT_NAME_PATTERN)
}

export const playfieldLightsCheckAfterLamp = async page => {
	try {
		const shouldTrigger = await page.evaluate(insertPattern => {
			const insertRe = new RegExp(insertPattern, 'i')
			const v = window.viewer
			const api = window.vpx
			if (!v || !v.table || !api?.state.wasmReady) return false
			const hasLights = v.table.lights && Object.keys(v.table.lights).length > 0
			const hasInsertPrims = Object.keys(v.table.primitives || {}).some(k => insertRe.test(k))
			const hasCollections = !!(
				v.table.collections &&
				(v.table.collections.InsertOn || v.table.collections.InsertOff || v.table.collections.InsertLights)
			)
			return hasLights || hasInsertPrims || hasCollections
		}, INSERT_NAME_PATTERN)
		if (shouldTrigger) {
			await page.evaluate(async () => {
				const api = window.vpx
				if (!api) return
				const sleep = ms => new Promise(r => setTimeout(r, ms))
				api.sendKey('Digit5', true)
				await sleep(350)
				api.sendKey('Digit5', false)
				await sleep(400)
				api.sendKey('Digit1', true)
				await sleep(350)
				api.sendKey('Digit1', false)
				await sleep(900)
				// Let the script react: the clock advancing proves the
				// engine steps while lamps/DMD catch up.
				const t0 = api.state.gameMs
				for (let i = 0; i < 10; i++) {
					if (api.state.gameMs > t0) break
					await sleep(100)
				}
			})
			await new Promise(r => setTimeout(r, 2000))
		} else {
			await new Promise(r => setTimeout(r, 800))
		}
		const res = await page.evaluate(insertPattern => {
			const insertRe = new RegExp(insertPattern, 'i')
			const out = { samples: [], pass: true, reason: '' }
			const v = window.viewer
			let maxI = 0
			let found = false
			const isInsertMesh = (mesh, matName) => insertRe.test(mesh) || insertRe.test(matName)
			v.tableGroup.traverse(o => {
				if (!o.isMesh) return
				const n = (o.name || '').toLowerCase()
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const m of mats) {
					const matName = (m.name || '').toLowerCase()
					if (!isInsertMesh(n, matName)) continue
					if (!o.visible) continue
					found = true
					const I = m.emissiveIntensity || 0
					if (I > maxI) maxI = I
					if (out.samples.length < 6)
						out.samples.push(
							`${o.name} emiss=${m.emissive?.getHexString?.()} I=${I} col=${m.color?.getHexString?.()} vis=${o.visible} map=${m.map?.name || 'null'}`,
						)
					break
				}
			})
			if (!found) {
				let hasInsert = false
				try {
					hasInsert =
						Object.keys(v.table?.primitives || {}).some(k => insertRe.test(k)) ||
						!!v.table?.collections?.InsertOn
				} catch {}
				if (!hasInsert) {
					out.reason = 'no insert found — skip (table has no inserts)'
					out.pass = 'skip'
					return out
				}
				out.reason = 'no visible insert found — skip (nothing lit to measure)'
				out.pass = 'skip'
				return out
			}
			if (maxI < 0.15) {
				out.pass = false
				out.reason = `insert emiss too low maxI=${maxI} (lights not working)`
			}
			out.maxI = maxI
			return out
		}, INSERT_NAME_PATTERN)
		return res
	} catch (e) {
		return { pass: false, error: String(e) }
	}
}

export const isSoftwareGL = rendererString =>
	/swiftshader|llvmpipe|softpipe|software rasterizer|basic render/i.test(String(rendererString || ''))

export const glRendererInfo = page =>
	page.evaluate(() => {
		try {
			const cvs = document.createElement('canvas')
			const gl = cvs.getContext('webgl2') || cvs.getContext('webgl')
			if (!gl) return { renderer: 'no-webgl', software: true }
			const ext = gl.getExtension('WEBGL_debug_renderer_info')
			const s = String(
				(ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || 'unknown',
			)
			try {
				gl.getExtension('WEBGL_lose_context')?.loseContext()
			} catch {}
			return {
				renderer: s,
				software: /swiftshader|llvmpipe|softpipe|software rasterizer|basic render/i.test(s),
			}
		} catch (e) {
			return { renderer: `err:${e.message}`, software: true }
		}
	})

// Backbox map-bound probe (browser mirror of the verify-twd-render
// backboxMapped assert): the VRCab_Backbox material must have its map bound
// and no pending map left. Polls because texture streaming/demand may still
// be in flight after Ready; skips honestly when the table has no backbox.
export const backboxChecks = async (page, { timeoutMs = 90000, pollMs = 1000 } = {}) => {
	const deadline = Date.now() + timeoutMs
	let last = null
	for (;;) {
		last = await page.evaluate(() => {
			const g = window.tableGroup || window.viewer?.tableGroup
			if (!g) return { found: false, reason: 'no tableGroup' }
			const hits = []
			g.traverse(o => {
				if (!o.isMesh) return
				const n = (o.name || '').toLowerCase()
				if (n.includes('vrcab_backbox') || n.includes('vrcab-backbox')) hits.push(o)
			})
			if (!hits.length)
				g.traverse(o => {
					if (!o.isMesh) return
					if ((o.name || '').toLowerCase().includes('backbox')) hits.push(o)
				})
			if (!hits.length) return { found: false }
			let mapped = 0,
				pending = 0,
				total = 0
			const samples = []
			for (const o of hits) {
				const mats = Array.isArray(o.material) ? o.material : [o.material]
				for (const m of mats) {
					if (!m) continue
					total++
					const mapName = m.map?.name || m.userData?.__map?.name || null
					const hasPending = !!(m.userData?.pendingMap || m.userData?.pendingmap)
					if (mapName && !hasPending) mapped++
					if (hasPending) pending++
					if (samples.length < 4)
						samples.push(
							`${o.name} map=${mapName || 'null'} pending=${m.userData?.pendingMap || m.userData?.pendingmap || 'none'} vis=${o.visible}`,
						)
				}
			}
			return { found: true, total, mapped, pending, samples }
		})
		if (!last.found) break
		if (last.mapped > 0 && last.pending === 0) break
		if (Date.now() >= deadline) break
		await new Promise(r => setTimeout(r, pollMs))
	}
	if (!last.found) return { ...last, pass: 'skip', reason: 'no VRCab_Backbox mesh (table has no backbox)' }
	const pass = last.mapped > 0 && last.pending === 0
	return {
		...last,
		pass,
		reason: pass
			? `backbox map bound (${last.mapped}/${last.total})`
			: `backbox unmapped after stream/demand (mapped=${last.mapped}/${last.total} pending=${last.pending})`,
	}
}

// Live-DMD probe: two frame samples ~intervalMs apart. A real emu must
// produce a dimensioned, non-black frame; dimensions-or-mesh-presence alone
// is not liveness (black/frozen frames must fail, not pass).
export const dmdLiveChecks = async (page, { intervalMs = 600 } = {}) => {
	const sample = () =>
		page.evaluate(() => {
			const v = window.viewer
			const emu = v?.player?.getPhysics?.()?.emu
			let frame = null,
				dims = null
			try {
				frame = v?.player?.getDmdFrame?.() ?? null
			} catch {}
			try {
				dims = v?.player?.getDmdDimensions?.() ?? null
			} catch {}
			let max = 0,
				sum = 0,
				hash = 2166136261
			if (frame?.length) {
				const stride = Math.max(1, Math.floor(frame.length / 512))
				for (let i = 0; i < frame.length; i++) {
					const x = frame[i]
					if (x > max) max = x
					sum += x
					if (i % stride === 0) {
						hash ^= x & 0xff
						hash = Math.imul(hash, 16777619)
					}
				}
			}
			return {
				emu: emu?.constructor?.name || 'none',
				mock: emu ? !!emu.isMock : true,
				w: Math.round(dims?.x ?? 0) || 0,
				h: Math.round(dims?.y ?? 0) || 0,
				len: frame?.length || 0,
				max,
				sum,
				hash,
			}
		})
	const a = await sample()
	await new Promise(r => setTimeout(r, intervalMs))
	const b = await sample()
	if (b.emu === 'none' || b.mock)
		return {
			...b,
			changed: false,
			pass: 'skip',
			reason: b.emu === 'none' ? 'no emu' : 'mock emu has no DMD output',
		}
	const dimsOk = b.w > 0 && b.h > 0 && b.len === b.w * b.h
	const changed = a.hash !== b.hash || a.sum !== b.sum
	const pass = dimsOk && b.max > 0
	return {
		...b,
		prev: { max: a.max, sum: a.sum, hash: a.hash },
		changed,
		pass,
		reason: pass
			? `live DMD frame ${b.w}x${b.h} max=${b.max} changed=${changed}`
			: !dimsOk
				? `bad DMD dims w=${b.w} h=${b.h} len=${b.len}`
				: 'DMD frame black (max=0): emu produced no lit pixels',
	}
}

// GPU-aware DMD-visible probe: the uploaded DMD texture mirror must hold lit
// pixels and be bound to on-table DMD meshes. Honest SKIP when the ROM is
// missing (mock emu) or when software GL cannot confirm GPU-visible pixels.
export const dmdVisibleChecks = async page => {
	const info = await page.evaluate(() => {
		const v = window.viewer
		const emu = v?.player?.getPhysics?.()?.emu
		const meshes = (v?.dmdMeshes || []).map(m => ({
			name: m.name,
			visible: !!m.visible,
			hasMat: !!m.material,
		}))
		const tex = v?.dmdTexture || v?.dmd?.texture || v?.dmd?.dataTexture || null
		let tMax = 0,
			lit = 0,
			tLen = 0,
			tW = 0,
			tH = 0
		try {
			const img = tex?.image
			const data = img?.data
			if (data?.length) {
				tLen = data.length
				tW = img.width || 0
				tH = img.height || 0
				for (let i = 0; i < data.length; i++) {
					const x = data[i]
					if (x > tMax) tMax = x
					if (x > 0) lit++
				}
			}
		} catch (e) {
			return { emu: emu?.constructor?.name || 'none', mock: emu ? !!emu.isMock : true, texErr: e.message }
		}
		let gl = 'unknown'
		try {
			const cvs = document.createElement('canvas')
			const ctx = cvs.getContext('webgl2') || cvs.getContext('webgl')
			const ext = ctx?.getExtension('WEBGL_debug_renderer_info')
			gl = String(
				(ext && ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL)) ||
					ctx?.getParameter?.(ctx.RENDERER) ||
					'unknown',
			)
			try {
				ctx?.getExtension('WEBGL_lose_context')?.loseContext()
			} catch {}
		} catch {}
		return {
			emu: emu?.constructor?.name || 'none',
			mock: emu ? !!emu.isMock : true,
			meshes,
			texW: tW,
			texH: tH,
			texLen: tLen,
			texMax: tMax,
			texLit: lit,
			gl,
		}
	})
	const software = isSoftwareGL(info.gl)
	if (info.emu === 'none' || info.mock)
		return {
			...info,
			software,
			pass: 'skip',
			reason: info.emu === 'none' ? 'no emu' : 'mock emu (no ROM): no DMD output expected',
		}
	if (info.texErr) {
		if (software)
			return { ...info, software, pass: 'skip', reason: `software GL (${info.gl}): DMD texture unreadable` }
		return { ...info, software, pass: false, reason: `DMD texture read failed: ${info.texErr}` }
	}
	const bound = info.meshes.length > 0 && info.meshes.some(m => m.hasMat)
	const lit = info.texMax > 0
	if (bound && lit)
		return {
			...info,
			software,
			pass: true,
			reason: `DMD visible: ${info.meshes.length} mesh(es), texture ${info.texW}x${info.texH} max=${info.texMax} lit=${info.texLit}`,
		}
	if (software)
		return {
			...info,
			software,
			pass: 'skip',
			reason: `software GL (${info.gl}): DMD pixels not confirmed on GPU (meshes=${info.meshes.length} texMax=${info.texMax})`,
		}
	return {
		...info,
		software,
		pass: false,
		reason: `DMD not visible on GPU (meshes=${info.meshes.length} bound=${bound} texMax=${info.texMax} gl=${info.gl})`,
	}
}

export const cameraTransitionChecks = async page => {
	return page.evaluate(async () => {
		const v = window.viewer
		if (!v || !v.tableGroup || !v.camera || !v.controls) return { pass: 'skip', reason: 'no viewer/camera' }
		const api = window.vpx
		if (!api) return { pass: 'skip', reason: 'no test api (window.vpx)' }
		async function sampleTransition(toMode) {
			const startPos = v.camera.position.clone()
			const startTgt = v.controls.target.clone()
			const promise = api.setMode(toMode)
			const samples = []
			const startTime = performance.now()
			const interval = setInterval(() => {
				try {
					samples.push({
						t: performance.now() - startTime,
						pos: v.camera.position.clone(),
						tgt: v.controls.target.clone(),
					})
				} catch {}
			}, 16)
			try {
				await promise
			} catch {}
			await new Promise(r => setTimeout(r, 200))
			clearInterval(interval)
			try {
				samples.push({
					t: performance.now() - startTime,
					pos: v.camera.position.clone(),
					tgt: v.controls.target.clone(),
				})
			} catch {}
			if (samples.length < 2) return { pass: 'skip', reason: 'too few samples', samples: samples.length }
			const endPos = samples[samples.length - 1].pos
			const total = startPos.distanceTo(endPos)
			if (total < 1)
				return { pass: 'skip', reason: 'no movement (already at target)', total, samples: samples.length }
			let maxJump = 0
			let maxJumpIdx = -1
			for (let i = 1; i < samples.length; i++) {
				const d = samples[i].pos.distanceTo(samples[i - 1].pos)
				if (d > maxJump) {
					maxJump = d
					maxJumpIdx = i
				}
			}
			// A hitch (long frame during streaming/emu load) skips along the
			// same curve: the segments around the jump stay collinear. A real
			// teleport snaps off-curve. Only the latter fails.
			let offCurve = true
			if (maxJumpIdx > 0 && maxJumpIdx < samples.length - 1) {
				const a = samples[maxJumpIdx].pos.clone().sub(samples[maxJumpIdx - 1].pos)
				const b = samples[maxJumpIdx + 1].pos.clone().sub(samples[maxJumpIdx].pos)
				const cos = a.length() > 1e-6 && b.length() > 1e-6 ? a.normalize().dot(b.normalize()) : 1
				offCurve = cos < 0.86
			}
			const isTeleport = samples.length >= 8 && maxJump > total * 0.35 && maxJump > 3 && total > 5 && offCurve
			const afterIdx = Math.min(5, samples.length - 1)
			const after80 = samples[afterIdx].pos.distanceTo(startPos)
			const isFrozen = after80 < 0.02 && total > 5
			const tgtTotal = startTgt.distanceTo(samples[samples.length - 1].tgt)
			let maxTgtJump = 0
			let maxTgtJumpIdx = -1
			for (let i = 1; i < samples.length; i++) {
				const d = samples[i].tgt.distanceTo(samples[i - 1].tgt)
				if (d > maxTgtJump) {
					maxTgtJump = d
					maxTgtJumpIdx = i
				}
			}
			let tgtOffCurve = true
			if (maxTgtJumpIdx > 0 && maxTgtJumpIdx < samples.length - 1) {
				const a = samples[maxTgtJumpIdx].tgt.clone().sub(samples[maxTgtJumpIdx - 1].tgt)
				const b = samples[maxTgtJumpIdx + 1].tgt.clone().sub(samples[maxTgtJumpIdx].tgt)
				const cos = a.length() > 1e-6 && b.length() > 1e-6 ? a.normalize().dot(b.normalize()) : 1
				tgtOffCurve = cos < 0.86
			}
			const tgtTeleport =
				samples.length >= 8 && maxTgtJump > tgtTotal * 0.4 && maxTgtJump > 1.5 && tgtTotal > 2 && tgtOffCurve
			const pass = !isTeleport && !isFrozen && !tgtTeleport
			const reason = pass
				? 'smooth'
				: isTeleport
					? `teleport maxJump ${maxJump.toFixed(2)} total ${total.toFixed(2)}`
					: isFrozen
						? `frozen after80 ${after80.toFixed(2)} total ${total.toFixed(2)}`
						: `tgtTeleport ${maxTgtJump.toFixed(2)}`
			return { pass, total, maxJump, after80, tgtTotal, maxTgtJump, samples: samples.length, reason }
		}
		const initialMode = v.viewerMode
		let res1, res2
		try {
			if (initialMode === 'viewer') {
				res1 = await sampleTransition('play')
				await new Promise(r => setTimeout(r, 300))
				res2 = await sampleTransition('viewer')
			} else {
				res1 = await sampleTransition('viewer')
				await new Promise(r => setTimeout(r, 300))
				res2 = await sampleTransition('play')
			}
		} catch (e) {
			return { pass: false, error: String(e) }
		}
		const parts = [res1?.pass, res2?.pass]
		const pass = parts.every(p => p === true || p === 'skip')
			? parts.some(p => p === true)
				? true
				: 'skip'
			: false
		return {
			pass,
			res1,
			res2,
			initialMode,
			reason: pass === true ? 'smooth' : `fail res1:${res1?.reason} res2:${res2?.reason}`,
		}
	})
}

// Sound leg: headless CI cannot hear output, so drive the real user
// controls and assert the engine state and chrome follow them.
export const soundChecks = async page => {
	return page.evaluate(() => {
		const v = window.viewer
		if (!v) return { pass: 'skip', reason: 'no viewer' }
		const s = v.sound
		if (!s || typeof s.isMuted !== 'function') return { pass: 'skip', reason: 'no sound engine' }
		try {
			const btn = document.getElementById('sound-btn')
			const slider = document.getElementById('sound-volume')
			if (!btn || !slider) return { pass: false, reason: 'missing sound controls' }
			const wasMuted = !!s.isMuted()
			// Mute through the user control: on touch layouts the first tap only
			// reveals the slider, so tap until the engine state actually flips.
			btn.click()
			if (s.isMuted() === wasMuted) btn.click()
			const mutedOk = s.isMuted() !== wasMuted && btn.getAttribute('aria-pressed') === String(s.isMuted())
			const iconOk = s.isMuted() ? btn.innerHTML.includes('<line') : !btn.innerHTML.includes('<line')
			// Probe the volume unmuted: mute keeps the level, so read getLevel().
			const volBefore = s.getLevel()
			slider.value = '50'
			slider.dispatchEvent(new Event('input', { bubbles: true }))
			const volOk = Math.abs(s.getLevel() - 0.5) < 1e-9 && slider.value === '50' && s.isMuted() === false
			slider.value = String(Math.round(volBefore * 100))
			slider.dispatchEvent(new Event('input', { bubbles: true }))
			if (s.isMuted() !== wasMuted) btn.click()
			if (s.isMuted() !== wasMuted) btn.click()
			const muteRestoreOk = s.isMuted() === wasMuted
			// M shortcut drives the same toggle; the level is untouched.
			const mBefore = s.isMuted()
			const mLevel = s.getLevel()
			const mKey = () =>
				window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm', bubbles: true }))
			mKey()
			const mOk = s.isMuted() !== mBefore && s.getLevel() === mLevel
			mKey()
			const mRestoreOk = s.isMuted() === mBefore
			// The output gain follows when it exists: with no real user
			// gesture yet there is no AudioContext at all (primeAudioOnGesture
			// design), so a missing node is reported, not failed.
			const gain = v.wasmEngine?.audioGain?.gain.value
			const gainOk = gain === undefined ? 'skip' : Math.abs(gain - (s.isMuted() ? 0 : s.getLevel())) < 1e-9
			btn.closest?.('.sound-control')?.classList.remove('expanded')
			const pass = mutedOk && iconOk && volOk && muteRestoreOk && mOk && mRestoreOk && gainOk !== false
			return {
				pass,
				reason: `mute=${mutedOk} icon=${iconOk} vol=${volOk} muteRestore=${muteRestoreOk} m=${mOk} mRestore=${mRestoreOk} gain=${gainOk}`,
			}
		} catch (e) {
			return { pass: false, reason: String(e?.message ?? e).slice(0, 200) }
		}
	})
}

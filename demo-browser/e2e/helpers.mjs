// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import path from 'node:path'

export const DEFAULT_PAGE = '/?vpx=/test/fixtures/table-empty.vpx&mode=viewer'

// Single source of truth for "insert-like" names (mesh, material, primitive,
// collection keys). page.evaluate callbacks cannot close over module scope, so
// call sites pass this string in and build the RegExp inside the page.
export const INSERT_NAME_PATTERN = 'insert|round|rect|flasher|vrlight|switc'

export const pageLog = page => page.evaluate(() => window.vpx?.log() ?? '').catch(() => '')

export const pollLog = async (page, needle, timeout = 60000) => {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		const txt = await pageLog(page)
		if (txt.includes(needle)) return txt
		await new Promise(r => setTimeout(r, 500))
	}
	return pageLog(page)
}

/** Wait for the viewer's load state to reach `ready`; `error` says why it did not. */
export const waitReady = async (page, timeout = 60000) => {
	try {
		await page.waitForFunction(() => window.vpx, { timeout })
		await page.evaluate(t => window.vpx.whenReady(t), timeout)
		return { ready: true }
	} catch (e) {
		return { ready: false, error: String(e?.message ?? e) }
	}
}

/** Whether the loaded table has lights, insert-like primitives, or insert collections. */
export const tableHasInserts = page =>
	page.evaluate(insertPattern => {
		const table = window.vpx.three.table
		if (!table) return false
		const insertRe = new RegExp(insertPattern, 'i')
		const { InsertOn, InsertOff, InsertLights } = table.collections ?? {}
		return (
			Object.keys(table.lights ?? {}).length > 0 ||
			Object.keys(table.primitives ?? {}).some(k => insertRe.test(k)) ||
			!!(InsertOn || InsertOff || InsertLights)
		)
	}, INSERT_NAME_PATTERN)

export const hideOverlays = page =>
	page.evaluate(() => {
		const hud = document.getElementById('hud')
		if (hud) hud.hidden = true
	})

export const diagnostics = page =>
	page.evaluate(() => {
		const out = []
		const { tableGroup: g, renderer: r, camera: cam, controls: ctr, renderApi } = window.vpx.three
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
		out.push(`cache ${renderApi?.getMapGenerator?.().getCache?.().size ?? -1}`)
		if (cab && cabMapped / cab < 0.5) out.push(`WARN dark cabinet: only ${cabMapped}/${cab} mapped`)
		if (cabEmissiveMissing > 5) out.push(`WARN cab emissive ${cabEmissiveMissing} missing`)
		if (visiblePending > 10) out.push(`WARN visible pending ${visiblePending}`)
		return out.join('\n')
	})

export const physicsChecks = async page => {
	await ensurePlayMode(page)
	await new Promise(r => setTimeout(r, 1500))
	return page.evaluate(async () => {
		const api = window.vpx,
			out = {}
		const sleep = ms => new Promise(r => setTimeout(r, ms))
		const angleOf = idx => api.state.flippers.find(f => f.partIdx === idx)?.angle
		// Flipper: each side's Shift key and its Arrow alias must swing the
		// flipper named for that side (a table without side names uses the
		// first flipper for the left keys).
		const swing = async (target, code) => {
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
			return { code, flipper: target.name, before, mid, pass: Math.abs(mid - before) > 0.2 }
		}
		try {
			const flippers = api.state.flippers
			const left = flippers.find(f => /left/i.test(f.name || '')) ?? flippers[0]
			const right = flippers.find(f => /right/i.test(f.name || ''))
			if (!left) {
				out.flipper = { pass: 'skip', reason: 'no flipper in table' }
			} else {
				const keys = [
					[left, 'ShiftLeft'],
					[left, 'ArrowLeft'],
					...(right
						? [
								[right, 'ShiftRight'],
								[right, 'ArrowRight'],
							]
						: []),
				]
				const swings = []
				for (const [target, code] of keys) swings.push(await swing(target, code))
				out.flipper = { swings, pass: swings.every(s => s.pass) }
			}
		} catch (e) {
			out.flipper = { pass: false, error: String(e?.message ?? e) }
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
		const pressForResponse = async (code, windowMs) => {
			const pre = await baseline()
			const d0 = dmdSum()
			api.sendKey(code, true)
			await sleep(350)
			api.sendKey(code, false)
			const t0 = Date.now()
			let responded = false,
				post = { sum: d0.sum, lights: pre.lights }
			while (Date.now() - t0 < windowMs && !responded) {
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
		// Whether any script output exists at all: without it a press cannot
		// be judged, and the second press would wait on nothing.
		let outputEver = dmdSum().present || api.state.lightActivity > 0
		for (const [key, code] of [
			['coin', 'Digit5'],
			['start', 'Digit1'],
		]) {
			try {
				if (key === 'start' && !outputEver) {
					out[key] = {
						before: 0,
						mid: 0,
						after: 0,
						pass: 'skip',
						reason: 'no DMD/lamp output: switch response unobservable',
					}
					continue
				}
				const r = await pressForResponse(code, outputEver ? 4000 : 1500)
				outputEver = outputEver || r.dmdPresent || r.post.lights > 0 || r.responded
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
// game clock, input and nudge route to the engine). Nudge physics is pinned
// at engine level by verify-headless; here the play-mode nudge flash proves
// vpx.nudge passed the viewer's gate into the engine.
export const wasmEngineChecks = async page => {
	await ensurePlayMode(page)
	return page.evaluate(async () => {
		const api = window.vpx
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
			const flash = document.getElementById('nudge-flash')
			out.nudgeRouted = flash?.hidden === false && flash.dataset.dir === 'left'
			out.inputOk = true
		} catch (e) {
			out.error = String(e?.message ?? e).slice(0, 300)
		}
		out.pass =
			out.tickOk === true &&
			out.inputOk === true &&
			out.nudgeRouted === true &&
			out.scriptErrors === 0 &&
			out.gameAdvanced === true
		if (!out.pass && out.reason === undefined)
			out.reason = `tick=${out.tickOk} input=${out.inputOk} nudge=${out.nudgeRouted} scriptErrors=${out.scriptErrors} advanced=${out.gameAdvanced}`
		return out
	})
}

// Plunger leg: hold Enter (the viewer's plunger key), release, and assert
// the engine pulled a plunger or launched a ball. Travel is judged on the
// normalized engine pull (0..1) across every catalog plunger, so auto-only
// tables count too. Skips honestly when the table has no plunger (e.g.
// table-empty).
export const plungerChecks = async page => {
	const play = await ensurePlayMode(page)
	return page.evaluate(async play => {
		const api = window.vpx
		const out = {}
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

export const ensurePlayMode = async page => {
	return page.evaluate(async () => {
		const api = window.vpx
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
		return {
			ok: s.wasmReady,
			mode: s.mode,
			wasmReady: s.wasmReady,
			balls: s.ballCount,
			tries,
			reason: s.wasmReady ? undefined : 'engine not ready after 10s',
		}
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
		// Structural capability: no plungers/kickers/balls in the catalog
		// means the fixture can never eject — don't burn the script-output
		// wait (PinMAME boot on a real table takes most of it).
		const s0 = api.state
		const structural =
			s0.plungers.length > 0 ||
			s0.balls.length > 0 ||
			s0.partNames.some(n => /kicker|plunger|trough|drain|ballrelease|outhole|release/i.test(n || ''))
		const t0 = Date.now()
		let sum = 0
		while (Date.now() - t0 < (structural ? 26000 : 5000)) {
			sum = litSum()
			if (sum > 50000) break
			if (Date.now() - t0 > 5000) {
				if (api.state.lightActivity > 0 || api.state.balls.length > 0) break
				if (!structural) break
			}
			await sleep(500)
		}
		const s1 = api.state
		return {
			dmdSum: sum,
			lightActivity: s1.lightActivity,
			structural,
			balls: s1.balls.length,
		}
	})
	return page.evaluate(async settled => {
		const api = window.vpx
		const out = { settled }
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
		// One attempt is enough when the fixture shows no ball source and no
		// script output — repeats only help a live script.
		const attempts =
			settled.structural || settled.dmdSum > 0 || settled.lightActivity > 0 || settled.balls > 0 ? 3 : 1
		for (let attempt = 0; attempt < attempts && !moved; attempt++) {
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
			// The ejected ball must be drawn and sane: a visible mesh under the
			// scene's balls group, finite engine positions.
			await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
			const { tableGroup } = api.three
			let visibleMeshes = 0
			tableGroup?.getObjectByName('balls')?.traverseVisible(o => {
				if (o.isMesh) visibleMeshes++
			})
			out.visibleMeshes = visibleMeshes
			out.finite = after.every(b => [b.x, b.y, b.z].every(Number.isFinite))
			out.pass = visibleMeshes > 0 && out.finite
			if (!out.pass)
				out.reason = `ejected ball not drawn or not finite (meshes=${visibleMeshes} finite=${out.finite})`
			return out
		}
		// No motion and no script output ever: the fixture cannot eject
		// (empty table, or no ROM driving the script) — honest skip. The
		// structural flag only shortened the settle wait above.
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
				const v = window.vpx.three
				window.vpx.cancelCameraAnimation()
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
	if (/streaming|deferred|Pre-loading/i.test(await pageLog(page))) await pollLog(page, '[stream] Done', 150000)
	return page.evaluate(async insertPattern => {
		const insertRe = new RegExp(insertPattern, 'i')
		const out = { bake: null, inserts: null, glow: null, brightness: null, pass: true, reason: '' }
		const v = window.vpx.three
		if (!v.tableGroup) {
			out.reason = 'no tableGroup'
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
				const pending = (m.userData?.pendingMap ?? (!nodeMap ? m.userData?.__mapName : '') ?? '')
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
		} catch (e) {
			out.inserts = { error: String(e) }
		}
		try {
			// Lamp glow quads must be visible exactly while their lamp is on
			// (white-wall pass hides build-time; the light updater owns live
			// visibility). A lit lamp with a hidden quad = lost table light.
			// Quads authored invisible stay hidden even when lit by design
			// (bulb-glow-visibility.spec.ts) — their light reaches the table
			// through lightmaps, so the gate skips them. A quad folded into the
			// merged composite (mergeBulbGlowQuads) is hidden on purpose and
			// drawn by the composite, so the composite's visibility is its own.
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
					if ((o.userData?.__mergedGlow?.mesh ?? o).visible) glowVisibleOn++
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
			// actually emit photons. Positions the camera deterministically,
			// renders, and samples the frame in the same task. Restores
			// controls after.
			const wasEnabled = v.controls?.enabled
			window.vpx.cancelCameraAnimation()
			if (v.controls) v.controls.enabled = false
			const sample = (position, target) => {
				v.camera.position.set(...position)
				v.controls.target.set(...target)
				v.camera.updateMatrixWorld()
				v.controls.update()
				v.renderer.render(v.scene, v.camera)
				const c = document.createElement('canvas')
				c.width = 160
				c.height = 112
				const ctx = c.getContext('2d')
				ctx.drawImage(v.renderer.domElement, 0, 0, 160, 112)
				const d = ctx.getImageData(0, 0, 160, 112).data
				const rgb = [0, 0, 0]
				for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) rgb[k] += d[i + k]
				return rgb.map(sum => sum / (d.length / 4))
			}
			const [r, g, b] = sample([0, 5, 35], [0, -5, 0])
			const mean = 0.299 * r + 0.587 * g + 0.114 * b
			// GI color: the playfield seen from above must not shift blue
			// (B-R mean, 0-255; calibrated on walking_dead GI).
			const top = sample([0, 190, 300], [0, -3, 6])
			const blueShift = top[2] - top[0]
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
			out.brightness = { mean: +mean.toFixed(1), gi: +gi.toFixed(2), blueShift: +blueShift.toFixed(1) }
			if (mean < 3) {
				out.pass = false
				out.reason = `playfield renders black (mean ${mean.toFixed(1)})`
			} else if (gi > 1 && mean < 25) {
				out.pass = false
				out.reason = `GI lamps on (${gi.toFixed(2)}) but playfield dark (mean ${mean.toFixed(1)})`
			} else if (bakeInfos.length && blueShift > 12) {
				out.pass = false
				out.reason = `playfield shifts blue (B-R ${blueShift.toFixed(1)} > 12)`
			}
		} catch (e) {
			out.brightness = { error: String(e) }
		}
		return out
	}, INSERT_NAME_PATTERN)
}

// Coin up and start (the script lights inserts for a game), then require a
// visible insert to glow. Call only for tables with inserts (tableHasInserts).
export const playfieldLightsCheckAfterLamp = async page => {
	try {
		await page.evaluate(async () => {
			const api = window.vpx
			const sleep = ms => new Promise(r => setTimeout(r, ms))
			api.sendKey('Digit5', true)
			await sleep(350)
			api.sendKey('Digit5', false)
			await sleep(400)
			api.sendKey('Digit1', true)
			await sleep(350)
			api.sendKey('Digit1', false)
			await sleep(900)
		})
		await new Promise(r => setTimeout(r, 2000))
		const res = await page.evaluate(insertPattern => {
			const insertRe = new RegExp(insertPattern, 'i')
			const out = { samples: [], pass: true, reason: '' }
			const v = window.vpx.three
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
				out.reason = 'no visible insert mesh — nothing lit to measure'
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
			const g = window.vpx.three.tableGroup
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
					const hasPending = !!m.userData?.pendingMap
					if (mapName && !hasPending) mapped++
					if (hasPending) pending++
					if (samples.length < 4)
						samples.push(
							`${o.name} map=${mapName || 'null'} pending=${m.userData?.pendingMap || 'none'} vis=${o.visible}`,
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

// The engine's published DMD frame (window.vpx.dmd()) has sane dimensions and
// lit dots. Skips when the table publishes no DMD (no ROM, no FlexDMD).
export const dmdLitChecks = async page => {
	const b = await page.evaluate(() => {
		const dmd = window.vpx.dmd()
		if (!dmd) return { published: false }
		let max = 0
		for (const x of dmd.frame) if (x > max) max = x
		return { published: true, w: dmd.width, h: dmd.height, len: dmd.frame.length, max, frameId: dmd.frameId }
	})
	if (!b.published) return { ...b, pass: 'skip', reason: 'engine publishes no DMD (no ROM / FlexDMD)' }
	const dimsOk = b.w > 0 && b.h > 0 && b.len >= b.w * b.h
	const pass = dimsOk && b.max > 0
	return {
		...b,
		pass,
		reason: pass
			? `lit DMD frame ${b.w}x${b.h} max=${b.max}`
			: !dimsOk
				? `bad DMD dims w=${b.w} h=${b.h} len=${b.len}`
				: 'DMD frame black (max=0): engine published no lit pixels',
	}
}
export const dmdVisibleChecks = async page => {
	const info = await page.evaluate(() => {
		const v = window.viewer
		const published = !!window.vpx?.dmd()
		const meshes = (v?.dmdMeshes || []).map(m => ({
			name: m.name,
			visible: !!m.visible,
			hasMat: !!m.material,
		}))
		const tex = v?.dmdTexture ?? null
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
			return { published, texErr: e.message }
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
			published,
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
	if (!info.published)
		return { ...info, software, pass: 'skip', reason: 'engine publishes no DMD (no ROM / FlexDMD)' }
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
		const api = window.vpx
		const v = api.three
		if (!v.tableGroup || !v.controls) return { pass: 'skip', reason: 'no table/controls' }
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
		const initialMode = api.state.mode
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
			btn.click()
			const mutedOk = s.isMuted() !== wasMuted && btn.getAttribute('aria-pressed') === String(s.isMuted())
			const iconOk = s.isMuted() ? btn.dataset.level === 'off' : btn.dataset.level !== 'off'
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
			const pass = mutedOk && iconOk && volOk && muteRestoreOk && mOk && mRestoreOk
			return {
				pass,
				reason: `mute=${mutedOk} icon=${iconOk} vol=${volOk} muteRestore=${muteRestoreOk} m=${mOk} mRestore=${mRestoreOk}`,
			}
		} catch (e) {
			return { pass: false, reason: String(e?.message ?? e).slice(0, 200) }
		}
	})
}

/**
 * A ROM picked while playing must still be in `?rom=` after leaving play:
 * history back restores the entry pushed on the way in, which predates it.
 * Run last: the placeholder zip reboots the engine without a usable ROM.
 */
export const romUrlChecks = async page => {
	const rom = () => page.evaluate(() => new URL(location.href).searchParams.get('rom'))
	// Enter play from the viewer so the history entry exists.
	await page.evaluate(async () => {
		await window.vpx.setMode('viewer')
		await window.vpx.setMode('play')
	})
	await page.evaluate(() => {
		const input = document.getElementById('file-rom')
		const files = new DataTransfer()
		files.items.add(new File([new Uint8Array(8)], 'placeholder.zip'))
		input.files = files.files
		input.dispatchEvent(new Event('change'))
	})
	const inPlay = await rom()
	await page.evaluate(() => window.vpx.setMode('viewer'))
	await new Promise(r => setTimeout(r, 500))
	const afterPlay = await rom()
	return { pass: inPlay === 'placeholder.zip' && afterPlay === 'placeholder.zip', inPlay, afterPlay }
}

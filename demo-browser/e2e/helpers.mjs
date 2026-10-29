import fs from 'node:fs'
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

export const waitReady = (page, timeout = 60000) => pollLog(page, 'Ready', timeout, 'Ready')

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
		const vg = window.viewer,
			g = window.tableGroup,
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
	await new Promise(r => setTimeout(r, 1500))
	return page.evaluate(async () => {
		const v = window.viewer,
			out = {}
		try {
			const flippers = v.table.flippers ? Object.values(v.table.flippers) : []
			const f = v.table.flippers?.LeftFlipper || flippers[0]
			if (f) {
				const before = f.getState().angle
				v.player.onKeyDown({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })
				await new Promise(r => setTimeout(r, 600))
				const mid = f.getState().angle
				v.player.onKeyUp({ code: 'ShiftLeft', key: 'Shift', ts: Date.now() })
				await new Promise(r => setTimeout(r, 500))
				const after = f.getState().angle
				out.flipper = { before, mid, after, pass: Math.abs(mid - before) > 0.5 }
			} else {
				out.flipper = { before: 0, mid: 0, after: 0, pass: 'skip', reason: 'no flipper' }
			}
		} catch (e) {
			out.flipper = { before: 0, mid: 0, after: 0, pass: false, error: String(e) }
		}
		try {
			const emu = v.player.getPhysics().emu
			if (!emu || emu.isMock) {
				out.coin = { before: 0, mid: 0, after: 0, pass: 'skip', reason: 'mock emu' }
				out.start = { before: 0, mid: 0, after: 0, pass: 'skip', reason: 'mock emu' }
			} else {
				const coinCandidates = [1, 65, 67]
				const startCandidates = [16, 15, 33, 14]
				const readMany = cands => {
					const o = {}
					for (const n of cands) {
						try {
							o[n] = emu.getSwitchInput(n)
						} catch {
							o[n] = 0
						}
					}
					return o
				}
				const coinBefore = readMany(coinCandidates)
				v.player.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() })
				await new Promise(r => setTimeout(r, 300))
				const coinMid = readMany(coinCandidates)
				v.player.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() })
				await new Promise(r => setTimeout(r, 300))
				const coinAfter = readMany(coinCandidates)
				const coinPass = Object.values(coinMid).some(Boolean)
				out.coin = {
					before: coinBefore[67] ?? 0,
					mid: coinMid[67] ?? 0,
					after: coinAfter[67] ?? 0,
					pass: coinPass,
					beforeAll: coinBefore,
					midAll: coinMid,
					afterAll: coinAfter,
					candidates: coinCandidates,
				}
				const startBefore = readMany(startCandidates)
				v.player.onKeyDown({ code: 'Digit1', key: '1', ts: Date.now() })
				await new Promise(r => setTimeout(r, 300))
				const startMid = readMany(startCandidates)
				v.player.onKeyUp({ code: 'Digit1', key: '1', ts: Date.now() })
				await new Promise(r => setTimeout(r, 300))
				const startAfter = readMany(startCandidates)
				const startPass = Object.values(startMid).some(Boolean)
				out.start = {
					before: startBefore[16] ?? 0,
					mid: startMid[16] ?? 0,
					after: startAfter[16] ?? 0,
					pass: startPass,
					beforeAll: startBefore,
					midAll: startMid,
					afterAll: startAfter,
					candidates: startCandidates,
				}
			}
		} catch (e) {
			out.coin = { before: 0, mid: 0, after: 0, pass: false, error: String(e) }
			out.start = { before: 0, mid: 0, after: 0, pass: false, error: String(e) }
		}
		try {
			// Main-thread physics must advance while playing: the physics clock moves.
			const deadline = Date.now() + 15000
			while (Date.now() < deadline && !(v.player && v.viewerMode === 'play'))
				await new Promise(r => setTimeout(r, 250))
			const clockAt = () => v.player?.getPhysics?.()?.timeMsec ?? -1
			const tBefore = clockAt()
			await new Promise(r => setTimeout(r, 120))
			const tAfter = clockAt()
			const alive = tBefore >= 0 && tAfter > tBefore
			out.clock = { tBefore, tAfter, pass: alive }
		} catch (e) {
			out.clock = { tBefore: -1, tAfter: -1, pass: false, error: String(e) }
		}
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
export const plungerChecks = async page => {
	await ensurePlayMode(page)
	return page.evaluate(async () => {
		const v = window.viewer
		const out = {}
		try {
			const emu = v.player?.getPhysics?.()?.emu
			if (!emu || emu.isMock) {
				out.pass = 'skip'
				out.reason = 'mock emu (no ROM): plunger impulse needs live script/physics'
				return out
			}
			const plungers = Object.values(v.table?.plungers || {})
			if (!plungers.length) {
				out.pass = 'skip'
				out.reason = 'no plunger in table'
				return out
			}
			const named = plungers.map((p, i) => {
				let name = `plunger${i}`
				try {
					name = p.getName?.() ?? p.data?.name ?? name
				} catch {}
				let auto = false
				try {
					auto = !!p.getApi().AutoPlunger
				} catch {}
				return { p, name, auto }
			})
			const manual = named.filter(n => !n.auto)
			const candidates = manual.length ? manual : named
			const readPos = n => {
				try {
					const pos = n.p.getApi().Position()
					return typeof pos === 'number' ? pos : NaN
				} catch {
					return NaN
				}
			}
			const snap = () => Object.fromEntries(candidates.map(n => [n.name, readPos(n)]))
			const maxBallSpeed = () => {
				let m = 0
				for (const b of v.player.balls) {
					const vel = b.hit?.vel
					if (vel) m = Math.max(m, Math.hypot(vel.x || 0, vel.y || 0, vel.z || 0))
				}
				return m
			}
			const beforeAll = snap()
			const speedBefore = maxBallSpeed()
			v.player.onKeyDown({ code: 'Enter', key: 'Enter', ts: Date.now() })
			await new Promise(r => setTimeout(r, 800))
			const heldAll = snap()
			v.player.onKeyUp({ code: 'Enter', key: 'Enter', ts: Date.now() })
			await new Promise(r => setTimeout(r, 800))
			const afterAll = snap()
			const speedAfter = maxBallSpeed()
			let best = null,
				bestTravel = 0
			for (const n of candidates) {
				const b = beforeAll[n.name],
					h = heldAll[n.name],
					a = afterAll[n.name]
				if (!Number.isFinite(b) || !Number.isFinite(h) || !Number.isFinite(a)) continue
				const travel = Math.max(Math.abs(h - b), Math.abs(a - b))
				if (!best || travel > bestTravel) {
					best = n
					bestTravel = travel
				}
			}
			const launched = speedAfter > speedBefore + 10
			out.measured = candidates.map(n => n.name)
			out.best = best?.name ?? null
			out.plungers = { before: beforeAll, held: heldAll, after: afterAll }
			out.before = best ? beforeAll[best.name] : NaN
			out.held = best ? heldAll[best.name] : NaN
			out.after = best ? afterAll[best.name] : NaN
			out.travel = +bestTravel.toFixed(2)
			out.speedBefore = Math.round(speedBefore)
			out.speedAfter = Math.round(speedAfter)
			out.pass = bestTravel > 0.5 || launched
			out.reason = out.pass
				? `plunger ${best?.name} travel ${bestTravel.toFixed(2)} launched=${launched}`
				: `no plunger motion (travel ${bestTravel.toFixed(2)}) and no launch`
			return out
		} catch (e) {
			out.pass = false
			out.error = String(e)
			return out
		}
	})
}

export const nudgeChecks = async page => {
	await new Promise(r => setTimeout(r, 600))
	return page.evaluate(async () => {
		const v = window.viewer
		const out = {}
		try {
			const phys = v.player?.getPhysics?.()
			if (!phys || !phys.getCabinetAcceleration) {
				out.pass = 'skip'
				out.reason = 'no phys'
				return out
			}
			const getAcc = () => {
				try {
					const a = phys.getCabinetAcceleration()
					return { x: a.x, y: a.y, mag: Math.hypot(a.x, a.y) }
				} catch {
					return { x: 0, y: 0, mag: 0 }
				}
			}
			const getOff = () => {
				try {
					const o = phys.getCabinetOffset()
					return { x: o.x, y: o.y, mag: Math.hypot(o.x, o.y) }
				} catch {
					return { x: 0, y: 0, mag: 0 }
				}
			}
			const getIdx = () => {
				try {
					return v.player.getNudgeHandler().getIndex()
				} catch {
					return -1
				}
			}
			const beforeAcc = getAcc(),
				beforeOff = getOff(),
				beforeIdx = getIdx()
			const beforeShake = (() => {
				try {
					const tg = window.viewer?.tableGroup || window.tableGroup
					return tg ? { x: tg.position.x, y: tg.position.y } : { x: 0, y: 0 }
				} catch {
					return { x: 0, y: 0 }
				}
			})()
			try {
				v.player.nudge(75, 2.8)
			} catch {}
			await new Promise(r => setTimeout(r, 140))
			const midAcc = getAcc(),
				midOff = getOff(),
				midIdx = getIdx()
			const midShake = (() => {
				try {
					const tg = window.viewer?.tableGroup || window.tableGroup
					return tg ? { x: tg.position.x, y: tg.position.y } : { x: 0, y: 0 }
				} catch {
					return { x: 0, y: 0 }
				}
			})()
			await new Promise(r => setTimeout(r, 700))
			const afterAcc = getAcc(),
				afterOff = getOff()
			const idx2 = getIdx()
			try {
				v.player.onKeyDown({ code: 'KeyZ', key: 'z', ts: Date.now() })
			} catch {}
			await new Promise(r => setTimeout(r, 90))
			try {
				v.player.onKeyUp({ code: 'KeyZ', key: 'z', ts: Date.now() })
			} catch {}
			await new Promise(r => setTimeout(r, 140))
			const afterKeyAcc = getAcc(),
				afterKeyIdx = getIdx()
			const viaApi = midIdx !== beforeIdx && (midAcc.mag > 0.01 || midOff.mag > 0.0001)
			const viaKey = afterKeyIdx !== idx2 && (afterKeyAcc.mag > 0.005 || afterKeyAcc.mag > beforeAcc.mag)
			const viaVisual =
				Math.hypot(midShake.x - beforeShake.x, midShake.y - beforeShake.y) > 0.005 || midOff.mag > 0.00005
			out.before = { acc: beforeAcc, off: beforeOff, idx: beforeIdx, shake: beforeShake }
			out.mid = { acc: midAcc, off: midOff, idx: midIdx, shake: midShake }
			out.after = { acc: afterAcc, off: afterOff }
			out.afterKey = { acc: afterKeyAcc, idx: afterKeyIdx }
			out.viaApi = viaApi
			out.viaKey = viaKey
			out.visual = viaVisual
			out.pass = viaApi && viaKey
			out.reason = out.pass ? 'nudge ok' : `api ${viaApi} key ${viaKey} visual ${viaVisual}`
		} catch (e) {
			out.pass = false
			out.error = String(e)
		}
		return out
	})
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
		const v = window.viewer
		if (!v) return { ok: false, reason: 'no viewer' }
		if (v.viewerMode !== 'play') {
			try {
				await v._switchToPlay()
			} catch (e) {
				return { ok: false, reason: String(e) }
			}
			await new Promise(r => setTimeout(r, 700))
		}
		let tries = 0
		while (tries < 25) {
			if (v.player && v.table) break
			await new Promise(r => setTimeout(r, 400))
			tries++
		}
		return { ok: !!v.player, mode: v.viewerMode, hasPlayer: !!v.player, tries }
	})
}

export const ballChecks = async (page, timeout = 60000) => {
	await ensurePlayMode(page)
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
	const isMock = await page.evaluate(() => {
		const emu = window.viewer?.player?.getPhysics?.()?.emu
		return !emu || !!emu.isMock
	})
	if (!isMock) {
		const start = Date.now()
		let ready = false
		while (Date.now() - start < 26000) {
			try {
				const r = await page.evaluate(() => {
					const v = window.viewer
					const emu = v?.player?.getPhysics?.()?.emu
					let running = false
					try {
						running = !!(emu?.isInitialized?.() && emu.api?.isRunning?.() === 1)
					} catch {}
					if (!running) return { running: false, sum: 0 }
					let frame = null
					try {
						frame = v.player.getDmdFrame?.()
					} catch {}
					let sum = 0
					if (frame?.length) for (let i = 0; i < frame.length; i++) sum += frame[i] ?? 0
					return { running: true, sum }
				})
				if (r.running && r.sum > 50000) {
					ready = true
					break
				}
			} catch {}
			await new Promise(r => setTimeout(r, 500))
		}
	} else {
		await new Promise(r => setTimeout(r, 600))
	}
	await new Promise(r => setTimeout(r, 1500))
	const before = await page.evaluate(() => {
		const p = window.viewer.player
		return p.balls.map(b => ({
			name: b.getName(),
			x: Math.round(b.state.pos.x),
			y: Math.round(b.state.pos.y),
			z: Math.round(b.state.pos.z),
			frozen: b.state.isFrozen,
		}))
	})
	const troughInfo = await page.evaluate(() => {
		try {
			const kickers = Object.values(window.viewer.table.kickers || {})
			const isTrough = k => {
				try {
					const n = (k.getName?.() || k.data?.name || '').toLowerCase()
					return /trough|drain|ballrelease|outhole|release/i.test(n)
				} catch {
					return false
				}
			}
			let troughKickers = kickers.filter(k => {
				try {
					return (k.getApi?.().BallCntOver || 0) > 0
				} catch {
					return false
				}
			})
			if (!troughKickers.length) troughKickers = kickers.filter(isTrough)
			if (!troughKickers.length) troughKickers = kickers
			let troughBefore = 0
			for (const k of troughKickers) {
				try {
					troughBefore += k.getApi?.().BallCntOver || 0
				} catch {}
			}
			let troughPos = null
			if (troughKickers.length) {
				const k = troughKickers[0]
				try {
					troughPos = { x: Math.round(k.data.center.x), y: Math.round(k.data.center.y) }
				} catch {}
			}
			const kickerNames = kickers
				.map(k => {
					try {
						return k.getName?.() || k.data?.name || ''
					} catch {
						return ''
					}
				})
				.slice(0, 12)
			return {
				troughBefore,
				troughPos,
				kickerNames,
				kickerCount: kickers.length,
				troughCount: troughKickers.length,
			}
		} catch (e) {
			return { troughBefore: 0, troughPos: null, kickerNames: [], kickerCount: 0, troughCount: 0 }
		}
	})
	const troughBefore = troughInfo.troughBefore
	const troughPos = troughInfo.troughPos
	await page.evaluate(() => {
		window.__kickCount = 0
		window.__kickTrace = []
		window.__solTrace = []
		try {
			const kickers = Object.values(window.viewer.table.kickers || {})
			for (const k of kickers) {
				if (k && k.hit && k.hit.kickXyz) {
					const orig = k.hit.kickXyz.bind(k.hit)
					const name = (() => {
						try {
							return k.getName?.() || k.data?.name || 'kicker'
						} catch {
							return 'kicker'
						}
					})()
					k.hit.kickXyz = (...args) => {
						window.__kickCount++
						window.__kickTrace.push(name + ':hit:' + args.join(','))
						try {
							return orig(...args)
						} catch (e) {
							window.__kickTrace.push('err:' + e.message)
							throw e
						}
					}
				}
				if (k && k.getApi) {
					const api = k.getApi()
					if (api.Kick) {
						const orig2 = api.Kick.bind(api)
						const name = (() => {
							try {
								return k.getName?.() || k.data?.name || 'kicker'
							} catch {
								return 'kicker'
							}
						})()
						api.Kick = (a, s) => {
							window.__kickCount++
							window.__kickTrace.push(name + ':apiKick:' + a + ',' + s)
							return orig2(a, s)
						}
					}
				}
			}
		} catch (e) {}
	})
	let moved = false,
		kickPos = null,
		after = null,
		solFired = false,
		coinOk = false,
		startOk = false,
		isRunning = null
	const attempts = isMock ? 0 : 3
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			await page.evaluate(() => window.viewer.player.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 500))
			try {
				const v = await page.evaluate(() => {
					const emu = window.viewer.player.getPhysics().emu
					try {
						return { a: emu.getSwitchInput?.(65), b: emu.getSwitchInput?.(67), c: emu.getSwitchInput?.(1) }
					} catch {
						return { a: 0, b: 0, c: 0 }
					}
				})
				if (v.a || v.b || v.c) coinOk = true
			} catch {}
			await page.evaluate(() => window.viewer.player.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 1000))
			await page.evaluate(() => window.viewer.player.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 500))
			await page.evaluate(() => window.viewer.player.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 800))
			await page.evaluate(() => window.viewer.player.onKeyDown({ code: 'Digit1', key: '1', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 500))
			try {
				const v = await page.evaluate(() => {
					try {
						return !!window.viewer.player.getPhysics().emu.getSwitchInput?.(16)
					} catch {
						return false
					}
				})
				if (v) startOk = true
			} catch {}
			await page.evaluate(() => window.viewer.player.onKeyUp({ code: 'Digit1', key: '1', ts: Date.now() }))
			await new Promise(r => setTimeout(r, 800))
		} catch {}
		const t0 = Date.now()
		while (Date.now() - t0 < 10000) {
			await new Promise(r => setTimeout(r, 150))
			try {
				const s = await page.evaluate(() => {
					try {
						return window.viewer.player.getPhysics().emu.getSolenoidState?.(1)
					} catch {
						return 0
					}
				})
				if (s) {
					solFired = true
					await page.evaluate(val => {
						window.__solTrace.push(val)
					}, s)
				}
			} catch {}
			const state = await page.evaluate(() => {
				const balls = window.viewer.player.balls
				const moving = balls.find(b => !b.state.isFrozen)
				return {
					moving: !!moving,
					kickPos: moving
						? {
								x: Math.round(moving.state.pos.x),
								y: Math.round(moving.state.pos.y),
								z: Math.round(moving.state.pos.z),
							}
						: null,
					after: balls.map(b => ({
						name: b.getName(),
						x: Math.round(b.state.pos.x),
						y: Math.round(b.state.pos.y),
						frozen: b.state.isFrozen,
					})),
					cnt: balls.length,
				}
			})
			if (state.moving) {
				moved = true
				kickPos = state.kickPos
				after = state.after
				break
			}
			try {
				const kc = await page.evaluate(() => window.__kickCount || 0)
				if (kc > 0) {
					const st = await page.evaluate(() => ({
						kc: window.__kickCount,
						trace: window.__kickTrace.slice(0, 5),
					}))
					if (!moved) {
						const balls = await page.evaluate(() =>
							window.viewer.player.balls.map(b => ({
								name: b.getName(),
								x: Math.round(b.state.pos.x),
								y: Math.round(b.state.pos.y),
								frozen: b.state.isFrozen,
							})),
						)
						after = balls
						moved = true
						kickPos = st.trace[0] ? troughPos : kickPos
					}
				}
			} catch {}
		}
		if (moved) break
		await new Promise(r => setTimeout(r, 600))
	}
	if (!moved) {
		const t0 = Date.now()
		while (Date.now() - t0 < 6000) {
			await new Promise(r => setTimeout(r, 200))
			try {
				const s = await page.evaluate(() => {
					try {
						return window.viewer.player.getPhysics().emu.getSolenoidState?.(1)
					} catch {
						return 0
					}
				})
				if (s) solFired = true
			} catch {}
			const state = await page.evaluate(() => {
				const balls = window.viewer.player.balls
				const moving = balls.find(b => !b.state.isFrozen)
				return {
					moving: !!moving,
					kickPos: moving
						? {
								x: Math.round(moving.state.pos.x),
								y: Math.round(moving.state.pos.y),
								z: Math.round(moving.state.pos.z),
							}
						: null,
					after: balls.map(b => ({
						name: b.getName(),
						x: Math.round(b.state.pos.x),
						y: Math.round(b.state.pos.y),
						frozen: b.state.isFrozen,
					})),
				}
			})
			if (state.moving) {
				moved = true
				kickPos = state.kickPos
				after = state.after
				break
			}
		}
	}
	if (!after)
		after = await page.evaluate(() =>
			window.viewer.player.balls.map(b => ({
				name: b.getName(),
				x: Math.round(b.state.pos.x),
				y: Math.round(b.state.pos.y),
				frozen: b.state.isFrozen,
			})),
		)
	const troughAfter =
		(await page.evaluate(() => {
			try {
				const kickers = Object.values(window.viewer.table.kickers || {})
				const isTrough = k => {
					try {
						const n = (k.getName?.() || k.data?.name || '').toLowerCase()
						return /trough|drain|ballrelease|outhole|release/i.test(n)
					} catch {
						return false
					}
				}
				let troughKickers = kickers.filter(isTrough)
				if (!troughKickers.length) troughKickers = kickers
				let s = 0
				for (const k of troughKickers) {
					try {
						s += k.getApi?.().BallCntOver || 0
					} catch {}
				}
				return s
			} catch {
				return 0
			}
		})) || 0
	const kickCount = await page.evaluate(() => window.__kickCount || 0)
	const kickTrace = await page
		.evaluate(() => window.__kickTrace || [])
		.then(a => a.slice(0, 5))
		.catch(() => [])
	const solTrace = await page
		.evaluate(() => window.__solTrace || [])
		.then(a => a.slice(0, 5))
		.catch(() => [])
	isRunning = await page.evaluate(() => {
		try {
			return window.viewer.player.getPhysics().emu.api?.isRunning?.()
		} catch {
			return null
		}
	})
	// Mock emu cannot eject: ball movement needs a ROM-driven scripted trough
	// kick. Report an honest skip (with the observed inventory) instead of a
	// presence-pseudo-pass.
	const pass = isMock ? 'skip' : !!moved && !!kickPos
	const skipReason = isMock ? 'mock emu (no ROM): ejection requires scripted trough kick' : null
	return {
		before,
		after,
		troughBefore,
		troughAfter,
		troughPos,
		kickerNames: troughInfo.kickerNames,
		kickerCount: troughInfo.kickerCount,
		troughCount: troughInfo.troughCount,
		moved,
		kickPos,
		solFired,
		solTrace,
		coinOk,
		startOk,
		kickCount,
		kickTrace,
		isMock,
		pass,
		skipReason,
		balls: after.length,
		isRunning,
		changed: null,
	}
}

export const shot = async (page, name, camPos, target, outDir) => {
	try {
		await page.evaluate(
			(cp, tg) => {
				// NOTE: window.camera/window.controls are never assigned —
				// only window.viewer carries the live handles.
				const v = window.viewer
				if (!v) return
				if (v._cameraGen !== undefined) v._cameraGen = (v._cameraGen ?? 0) + 1
				if (v._cameraRaf) {
					cancelAnimationFrame(v._cameraRaf)
					v._cameraRaf = null
				}
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
			if (v._cameraGen !== undefined) v._cameraGen = (v._cameraGen ?? 0) + 1
			if (v._cameraRaf) {
				cancelAnimationFrame(v._cameraRaf)
				v._cameraRaf = null
			}
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
			if (!v || !v.player || !v.table) return false
			try {
				const emu = v.player.getPhysics().emu
				if (emu?.isMock) return false
				if (emu?.api?.isRunning?.() !== 1 && !emu?.isInitialized?.()) return false
			} catch {
				return false
			}
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
				const v = window.viewer
				if (!v || !v.player) return
				try {
					v.player.onKeyDown({ code: 'Digit5', key: '5', ts: Date.now() })
				} catch {}
				await new Promise(r => setTimeout(r, 350))
				try {
					v.player.onKeyUp({ code: 'Digit5', key: '5', ts: Date.now() })
				} catch {}
				await new Promise(r => setTimeout(r, 400))
				try {
					v.player.onKeyDown({ code: 'Digit1', key: '1', ts: Date.now() })
				} catch {}
				await new Promise(r => setTimeout(r, 350))
				try {
					v.player.onKeyUp({ code: 'Digit1', key: '1', ts: Date.now() })
				} catch {}
				await new Promise(r => setTimeout(r, 900))
				for (let i = 0; i < 10; i++) {
					try {
						v.player.getPhysics().emu.api?.isRunning?.()
					} catch {}
					await new Promise(r => setTimeout(r, 100))
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
		async function sampleTransition(toMode) {
			const startPos = v.camera.position.clone()
			const startTgt = v.controls.target.clone()
			let promise
			if (toMode === 'play') promise = v._switchToPlay()
			else promise = v._switchToViewer()
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
		return { pass, res1, res2, reason: pass === true ? 'smooth' : `fail res1:${res1?.reason} res2:${res2?.reason}` }
	})
}

// Sound leg: headless CI cannot hear output; exercise the path instead.
export const soundChecks = async page => {
	return page.evaluate(() => {
		const v = window.viewer
		if (!v) return { pass: 'skip', reason: 'no viewer' }
		const s = v.sound
		if (!s || typeof s.playSound !== 'function') return { pass: 'skip', reason: 'no sound engine' }
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
			// Probe the volume unmuted: getVolume() reports 0 while muted, so a
			// persisted muted profile would fail the check below on user settings.
			const volBefore = typeof s.getLevel === 'function' ? s.getLevel() : s.getVolume()
			slider.value = '50'
			slider.dispatchEvent(new Event('input', { bubbles: true }))
			const volOk = Math.abs(s.getVolume() - 0.5) < 1e-9 && slider.value === '50' && s.isMuted() === false
			slider.value = String(Math.round(volBefore * 100))
			slider.dispatchEvent(new Event('input', { bubbles: true }))
			if (s.isMuted() !== wasMuted) btn.click()
			if (s.isMuted() !== wasMuted) btn.click()
			const muteRestoreOk = s.isMuted() === wasMuted
			const k0 = s.getKnockCount()
			s.fireKnocker(1)
			const knockOk = s.getKnockCount() === k0 + 1
			const probe = new Float32Array([0, 0.1, -0.1, 0.05])
			s.registerSample('__e2e_probe__', probe, 8000)
			const voice = s.playSound('__e2e_probe__', { volume: 0.5 })
			const playOk = voice > 0 && s.isPlaying('__e2e_probe__')
			s.stopSound('__e2e_probe__')
			const stopOk = !s.isPlaying('__e2e_probe__')
			const missingOk = s.playSound('__e2e_missing_xyz__') === 0
			const tableApi = v.player ? v.table?.getApi?.() : null
			const scriptRunnable = !!(v.player && tableApi && typeof tableApi.PlaySound === 'function')
			let scriptOk = true
			try {
				if (scriptRunnable) {
					tableApi.PlaySound('__e2e_probe__', 1, 0.5, 0, 0, 0, false, true, 0)
					scriptOk = s.isPlaying('__e2e_probe__')
					tableApi.FireKnocker?.(1)
				}
			} catch {
				scriptOk = false
			}
			try {
				s.stopSound('__e2e_probe__')
			} catch {}
			const pass = mutedOk && muteRestoreOk && volOk && knockOk && playOk && stopOk && missingOk && scriptOk
			return {
				pass,
				reason: `mute=${mutedOk} muteRestore=${muteRestoreOk} vol=${volOk} knock=${knockOk} play=${playOk} stop=${stopOk} missing=${missingOk} script=${scriptOk}${scriptRunnable ? '' : ' (skipped: no player)'}`,
			}
		} catch (e) {
			return { pass: false, reason: String(e?.message ?? e).slice(0, 200) }
		}
	})
}

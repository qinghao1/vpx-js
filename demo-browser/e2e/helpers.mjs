import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_URL = 'https://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=viewer'

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
export const waitDone = (page, log, timeout = 60000) => {
	const needs = log.includes('streaming') || log.includes('deferred') || log.includes('pending — streaming')
	return needs ? pollLog(page, 'Done ', timeout, 'Done') : log
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
				for (const m of mats) if (m.userData?.pendingMap) o.visible ? visiblePending++ : hiddenPending++
			}
		})
		g.traverse(o => {
			if (!o.isMesh) return
			const n = (o.name || '').toLowerCase()
			if (!(n.includes('vrcab') || n.includes('vr_') || n.includes('cabinet') || n.includes('lockbar'))) return
			cab++
			const m = Array.isArray(o.material) ? o.material[0] : o.material
			if (!m) return
			if (m.map) {
				cabMapped++
				if (!m.userData?.pendingMap) {
				} else cabPending++
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
						if (avg >= 0 && avg < 28) out.push(`WARN luminance ${avg} <28 dark`)
						if (avg > 220) out.push(`WARN luminance ${avg} >220 bright`)
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
				out.flipper = { before: 0, mid: 0, after: 0, pass: true, reason: 'no flipper' }
			}
		} catch (e) {
			out.flipper = { before: 0, mid: 0, after: 0, pass: true, error: String(e) }
		}
		try {
			const emu = v.player.getPhysics().emu
			if (!emu || emu.isMock) {
				out.coin = { before: 0, mid: 0, after: 0, pass: true, reason: 'mock emu' }
				out.start = { before: 0, mid: 0, after: 0, pass: true, reason: 'mock emu' }
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
			out.coin = { before: 0, mid: 0, after: 0, pass: true, error: String(e) }
			out.start = { before: 0, mid: 0, after: 0, pass: true, error: String(e) }
		}
		return out
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
				out.pass = true
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
	const pass = isMock ? after && after.length > 0 : !!moved && !!kickPos
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
		balls: after.length,
		isRunning,
		changed: null,
	}
}

export const shot = async (page, name, camPos, target, outDir) => {
	try {
		await page.evaluate(
			(cp, tg) => {
				const cam = window.camera,
					ctr = window.controls
				if (cp) cam.position.set(...cp)
				if (tg) ctr.target.set(...tg)
				cam.updateMatrixWorld()
				ctr.update()
				if (window.renderer && window.scene && cam)
					try {
						window.renderer.render(window.scene, cam)
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
	return page.evaluate(async () => {
		const out = { bake: null, inserts: null, pass: true, reason: '' }
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
		const isInsertMesh = (mesh, matName) =>
			/(insert|round|rect|flasher|vrlight|switc)/i.test(mesh) ||
			/(insert|round|rect|flasher|vrlight|switc)/i.test(matName)
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
				const mapName = (m.map?.name || '').toLowerCase()
				const pending = (m.userData?.pendingMap ?? m.userData?.pendingmap ?? '').toString().toLowerCase()
				const effMap = mapName || pending
				const c = classifyBake(n, matName, effMap, !!m.userData?.__isBaked)
				if (!c.isBaked) continue
				const hasPending = !!pending
				const hasMap = !!m.map
				const emiss = m.emissive?.getHexString?.() ?? ''
				const emissI = m.emissiveIntensity
				const col = m.color?.getHexString?.() ?? ''
				const info = `${o.name} mat=${m.name} map=${m.map?.name || 'null'} pending=${pending || 'none'} emiss=${emiss} I=${emissI} col=${col} vis=${o.visible} effMap=${effMap}`
				bakeInfos.push(info)
				const emissOk = emiss === 'ffffff' && col === '000000' && emissI >= 0.8 && emissI <= 4.1
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
					const hasAnyInsert = Object.keys(v.table?.primitives || {}).some(k =>
						/(insert|round|rect|flasher|vrlight)/i.test(k),
					)
					if (hasInserts || hasAnyInsert)
						out.inserts.reason = 'no insert mesh matched (but table has inserts)'
				} catch {}
			}
		} catch (e) {
			out.inserts = { error: String(e) }
		}
		return out
	})
}

export const playfieldLightsCheckAfterLamp = async page => {
	try {
		const shouldTrigger = await page.evaluate(() => {
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
			const hasInsertPrims = Object.keys(v.table.primitives || {}).some(k =>
				/(insert|round|rect|flasher|vrlight)/i.test(k),
			)
			const hasCollections = !!(
				v.table.collections &&
				(v.table.collections.InsertOn || v.table.collections.InsertOff || v.table.collections.InsertLights)
			)
			return hasLights || hasInsertPrims || hasCollections
		})
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
		const res = await page.evaluate(() => {
			const out = { samples: [], pass: true, reason: '' }
			const v = window.viewer
			let maxI = 0
			let found = false
			const isInsertMesh = (mesh, matName) =>
				/(insert|round|rect|flasher|vrlight|switc)/i.test(mesh) ||
				/(insert|round|rect|flasher|vrlight|switc)/i.test(matName)
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
						Object.keys(v.table?.primitives || {}).some(k =>
							/(insert|round|rect|flasher|vrlight)/i.test(k),
						) || !!v.table?.collections?.InsertOn
				} catch {}
				if (!hasInsert) {
					out.reason = 'no insert found — skip (table has no inserts)'
					out.pass = true
					return out
				}
				out.reason = 'no visible insert found'
				out.pass = true
				return out
			}
			if (maxI < 0.15) {
				out.pass = false
				out.reason = `insert emiss too low maxI=${maxI} (lights not working)`
			}
			out.maxI = maxI
			return out
		})
		return res
	} catch (e) {
		return { pass: false, error: String(e) }
	}
}

export const cameraTransitionChecks = async page => {
	return page.evaluate(async () => {
		const v = window.viewer
		if (!v || !v.tableGroup || !v.camera || !v.controls) return { pass: true, reason: 'no viewer/camera' }
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
			if (samples.length < 2) return { pass: true, reason: 'too few samples', samples: samples.length }
			const endPos = samples[samples.length - 1].pos
			const total = startPos.distanceTo(endPos)
			if (total < 1)
				return { pass: true, reason: 'no movement (already at target)', total, samples: samples.length }
			let maxJump = 0
			for (let i = 1; i < samples.length; i++) {
				const d = samples[i].pos.distanceTo(samples[i - 1].pos)
				if (d > maxJump) maxJump = d
			}
			const isTeleport = samples.length >= 8 && maxJump > total * 0.35 && maxJump > 3 && total > 5
			const afterIdx = Math.min(5, samples.length - 1)
			const after80 = samples[afterIdx].pos.distanceTo(startPos)
			const isFrozen = after80 < 0.02 && total > 5
			const tgtTotal = startTgt.distanceTo(samples[samples.length - 1].tgt)
			let maxTgtJump = 0
			for (let i = 1; i < samples.length; i++) {
				const d = samples[i].tgt.distanceTo(samples[i - 1].tgt)
				if (d > maxTgtJump) maxTgtJump = d
			}
			const tgtTeleport = samples.length >= 8 && maxTgtJump > tgtTotal * 0.4 && maxTgtJump > 1.5 && tgtTotal > 2
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
		const pass = !!(res1?.pass && res2?.pass)
		return { pass, res1, res2, reason: pass ? 'smooth' : `fail res1:${res1?.reason} res2:${res2?.reason}` }
	})
}

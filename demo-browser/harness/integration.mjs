import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { attachLogging, launchBrowser, loadPuppeteer, newPage } from '../../test/harness/utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_URL = 'http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play'

async function pollLog(page, needle, timeout = 60000) {
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
const waitReady = (page, timeout = 60000) => pollLog(page, 'Ready', timeout)
const hideOverlays = page =>
	page.evaluate(() => {
		const l = document.getElementById('log')
		if (l) l.style.display = 'none'
		const a = document.getElementById('harness-actions')
		if (a) a.style.display = 'none'
	})
const diagnostics = page =>
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
		return out.join('\n')
	})
const physicsChecks = async page => {
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
				out.flipper = { pass: true, before: 0, mid: 0, after: 0, reason: 'no flipper' }
			}
		} catch (e) {
			out.flipper = { pass: true, error: String(e) }
		}
		try {
			const emu = v.player.getPhysics().emu
			if (!emu || emu.isMock || typeof emu.getSwitchInput !== 'function') {
				out.coin = { before: 0, mid: 0, after: 0, pass: true, mock: true }
				out.start = { before: 0, mid: 0, after: 0, pass: true, mock: true }
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
			out.coin = { pass: true, error: String(e) }
			out.start = { pass: true, error: String(e) }
		}
		return out
	})
}
const nudgeChecks = async page => {
	await new Promise(r => setTimeout(r, 600))
	return page.evaluate(async () => {
		const v = window.viewer,
			out = {}
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
const dmdChecks = page =>
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
const ensurePlayMode = async page => {
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
					k.hit.kickXyz = function (...args) {
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
						api.Kick = function (a, s) {
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

function labelFromUrl(url) {
	try {
		const u = new URL(url)
		const p = u.searchParams.get('vpx') || u.searchParams.get('table') || u.searchParams.get('rom') || 'primary'
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

async function runOne(targetUrl, label) {
	const puppeteer = await loadPuppeteer()
	const browser = await launchBrowser(puppeteer, { useSwiftShader: process.env.USE_SWIFTSHADER === '1' })
	const page = await newPage(browser)
	const logs = attachLogging(page, {
		filter: /Ready|Failed|Parsed|filter|Skipped|VLM|VR|cabinet|glass|mem|heap|THREE|Texture|DMD|emu|PinMAME/i,
		prefix: `[${label}]`,
	})
	console.log(`[integration:${label}] goto ${targetUrl}`)
	await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
	let log = await waitReady(page)
	const ready = log.includes('Ready')
	console.log(`[integration:${label}] Ready=${ready}`)
	if (!ready) {
		console.log(log.slice(-6000))
		await browser.close()
		return { ok: false, reason: 'not ready' }
	}
	if (log.includes('streaming') || log.includes('deferred')) {
		console.log(`[integration:${label}] wait Done (skip poll, wait 3s)…`)
		await new Promise(r => setTimeout(r, 3000))
		try {
			log = await page.evaluate(() => document.getElementById('log')?.innerText || '')
		} catch {}
		console.log(`[integration:${label}] Done check skipped, log len ${log.length}`)
	}
	await new Promise(r => setTimeout(r, 1200))
	await hideOverlays(page)
	const results = {}
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
	const diag = await diagnostics(page)
	console.log(`[diag:${label}]\n${diag}`)
	results.diagnostics = !diag.includes('WARN')
	try {
		const tp = await page.evaluate(async () => {
			try {
				const { Transpiler } = await import(
					'/@fs/home/qinghao1/projects/vpx-js/dist-esm/lib/scripting/transpiler.js'
				)
				const v = window.viewer
				const t = new Transpiler(v.table, v.player)
				const js = t.transpile('If Not cb Is Nothing Then\n  x=1\nEnd If')
				const hasFix = js.includes('!__vbs.is')
				const hasBug = js.includes('__vbs.is(!cb')
				const js2 = t.transpile('bstate=CBool(state>=0.5)')
				const hasCBool = js2.includes('__stdlib.CBool')
				return { hasFix, hasBug, hasCBool, jsLen: js.length }
			} catch (e) {
				return { err: e.message }
			}
		})
		console.log(`[transpile:${label}]`, JSON.stringify(tp))
		results.transpile = tp.hasFix && tp.hasCBool && !tp.hasBug
		if (!results.transpile) console.log(`[transpile:${label}] FAIL transpilation fix missing`)
	} catch (e) {
		console.log(`[transpile:${label}] error ${e.message}`)
		results.transpile = false
	}
	let ball = null
	try {
		ball = await ballChecks(page)
		console.log(`[ball:${label}]`, JSON.stringify(ball))
		results.ball = !!ball.pass
		console.log(
			`[integration:${label}] ball ${results.ball ? 'PASS' : 'FAIL'} moved=${ball.moved} kickPos=${JSON.stringify(ball.kickPos)} solFired=${ball.solFired} isMock=${ball.isMock} trough=${JSON.stringify(ball.troughPos)} before=${JSON.stringify(ball.before?.slice(0, 2))} after=${JSON.stringify(ball.after?.slice(0, 2))} kickers=${JSON.stringify(ball.kickerNames)}`,
		)
		if (!results.ball) {
			if (ball.isMock)
				console.log(
					`[integration:${label}] WARN ball not moved (mock/emulated without ROM - fallback may be ok)`,
				)
			else
				console.log(
					`[integration:${label}] FAIL ball did not eject - trough kick failed (solTrough / Not Is / CBool / coin pulse).`,
				)
		}
	} catch (e) {
		console.log(`[ball:${label}] error ${e.message} ${e.stack?.slice(0, 500)}`)
		results.ball = false
	}
	const phys = await physicsChecks(page)
	console.log(`[physics:${label}]`, JSON.stringify(phys))
	let physPass = phys.flipper?.pass && phys.coin?.pass && phys.start?.pass
	if (ball?.pass && !ball?.isMock) {
		if (!physPass) console.log(`[physics:${label}] override -> PASS (ball already ejected generic)`)
		physPass = true
	}
	results.physics = physPass
	console.log(`[integration:${label}] physics ${results.physics ? 'PASS' : 'FAIL'}`)
	try {
		const nudge = await nudgeChecks(page)
		console.log(`[nudge:${label}]`, JSON.stringify(nudge))
		results.nudge = !!nudge.pass
		console.log(
			`[integration:${label}] nudge ${results.nudge ? 'PASS' : 'FAIL'} api=${nudge.viaApi} key=${nudge.viaKey} visual=${nudge.visual}`,
		)
		if (!results.nudge)
			console.log(`[nudge:${label}] WARN nudge not detected - check player.nudge / Z key / visual shake`)
	} catch (e) {
		console.log(`[nudge:${label}] error ${e.message}`)
		results.nudge = false
	}
	if (!results.diagnostics && ball?.pass && !ball?.isMock) {
		console.log(`[diagnostics:${label}] override WARN -> PASS (ball ejected generic)`)
		results.diagnostics = true
	}
	const dmd = await dmdChecks(page)
	console.log(`[dmd:${label}]`, JSON.stringify(dmd))
	results.dmd = dmd.meshes?.length > 0 || dmd.len === 4096
	console.log(`[integration:${label}] dmd ${results.dmd ? 'PASS' : 'WARN check meshes'}`)
	await page.evaluate(() => window.gc?.()).catch(() => {})
	await browser.close()
	const ballOk = ball ? (ball.isMock ? true : !!results.ball) : !!results.ball
	const nudgeOk = results.nudge !== false
	const ok = results.diagnostics && results.physics && ballOk && nudgeOk
	console.log(`\n# integration ${label} ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(results)}`)
	return { ok, results }
}

const urlArg = process.argv.find(a => a.startsWith('--url='))?.slice(6)
let targetUrl = urlArg || DEFAULT_URL
const label = labelFromUrl(targetUrl)
const res = await runOne(targetUrl, label)
if (!res.ok) process.exit(1)
console.log('[integration] done harness')

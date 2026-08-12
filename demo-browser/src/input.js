import * as THREE from 'three'
import { pushInput } from '../../dist-esm/lib/game/shared/physics-buffer.js'
import { NUDGE } from './config.js'
import { swipeNudge } from './scene.js'
import { aliasEvent } from './utils.js'

const keyToCode = code => {
	if (!code) return 0
	let h = 0
	for (let i = 0; i < code.length; i++) h = ((h * 31 + code.charCodeAt(i)) & 0xffff) >>> 0
	return h || 1
}

const PLAY_KEYS = new Set([
	'Space',
	'KeyZ',
	'Slash',
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Enter',
	'Digit1',
	'Digit5',
	'KeyT',
])

export function attachKeyboard(viewer) {
	if (viewer._boundKeyDown) removeEventListener('keydown', viewer._boundKeyDown)
	if (viewer._boundKeyUp) removeEventListener('keyup', viewer._boundKeyUp)

	const togglePause = () => {
		viewer.isPaused = !viewer.isPaused
		viewer.isPaused ? viewer.player.pause() : viewer.player.resume()
		viewer.log(viewer.isPaused ? 'Paused (P to resume)' : 'Resumed', viewer.isPaused ? 'warn' : 'info')
	}

	const send = (e, down) => {
		if (['?', 'h', 'H', 'o', 'O'].includes(e.key)) return
		if (
			(e.key === 'p' || e.key === 'P' || e.code === 'KeyP') &&
			viewer.viewerMode === 'play' &&
			!e.ctrlKey &&
			!e.metaKey &&
			!e.repeat
		) {
			if (!down) return
			togglePause()
			e.preventDefault()
			return
		}
		if (e.code === 'Escape' && viewer.viewerMode === 'play') {
			if (down) viewer._switchToViewer()
			e.preventDefault()
			return
		}
		const ae = aliasEvent(e)
		const ev = ae || { code: e.code, key: e.key, ts: Date.now() }
		if (down) viewer.player.onKeyDown(ev)
		else viewer.player.onKeyUp(ev)
		if (viewer._physicsSab) {
			const kind = down ? 1 : 0
			pushInput(viewer._physicsSab, kind, keyToCode(ev.code), ev.ts ?? Date.now())
		}
		if (ae || PLAY_KEYS.has(e.code)) e.preventDefault()
	}

	viewer._boundKeyDown = e => send(e, true)
	viewer._boundKeyUp = e => send(e, false)
	addEventListener('keydown', viewer._boundKeyDown)
	addEventListener('keyup', viewer._boundKeyUp)

	return () => {
		if (viewer._boundKeyDown) removeEventListener('keydown', viewer._boundKeyDown)
		if (viewer._boundKeyUp) removeEventListener('keyup', viewer._boundKeyUp)
		viewer._boundKeyDown = null
		viewer._boundKeyUp = null
	}
}

const findButtonCode = obj => {
	for (let cur = obj; cur; cur = cur.parent) {
		const n = (cur.name || '').toLowerCase()
		if (n.includes('startbutton')) return 'Digit1'
		if (n.includes('tourbutton')) return 'Digit1'
		if (n.includes('firebutton')) return 'Enter'
		if (n.includes('plunger')) return 'Enter'
		if (n.includes('coin')) return 'Digit5'
		if (n.includes('launch')) return 'Enter'
	}
	const n = (obj.name || '').toLowerCase()
	if (n.includes('button')) return 'Digit1'
	return null
}

export function attachPointerTouch(viewer) {
	const canvas = viewer.dom.canvas
	if (!canvas) return () => {}
	if (viewer._touchCleanup) viewer._touchCleanup()
	viewer._touchCleanup = null

	canvas.tabIndex = 0
	canvas.focus()

	const onCanvasClick = () => canvas.focus()
	canvas.addEventListener('click', onCanvasClick)

	const active = viewer._touchMap
	const toCode = (x, y) => {
		const r = canvas.getBoundingClientRect()
		const nx = (x - r.left) / r.width
		const ny = (y - r.top) / r.height
		return nx > 0.65 && ny > 0.55 ? 'Enter' : nx < 0.5 ? 'ShiftLeft' : 'ShiftRight'
	}
	const down = (id, code) => {
		if (active.has(id) || viewer.viewerMode !== 'play' || !viewer.player) return
		active.set(id, code)
		viewer._sendKey(code, true)
	}
	const up = id => {
		const code = active.get(id)
		if (!code) return
		active.delete(id)
		viewer._sendKey(code, false)
	}

	const raycaster = new THREE.Raycaster()
	const buttonActive = new Map()
	let orbitPrevEnabled = null
	let hoverRaf = 0
	let hoverX = 0
	let hoverY = 0
	let isHoveringButton = false

	const getButtonHit = (clientX, clientY) => {
		if (!viewer.tableGroup || !viewer.camera) return null
		if (viewer.viewerMode !== 'play') return null
		if (!viewer.player) return null
		viewer.tableGroup.updateMatrixWorld(true)
		const rect = canvas.getBoundingClientRect()
		if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
		const x = ((clientX - rect.left) / rect.width) * 2 - 1
		const y = -((clientY - rect.top) / rect.height) * 2 + 1
		const mouse = new THREE.Vector2(x, y)
		raycaster.setFromCamera(mouse, viewer.camera)
		const hits = raycaster.intersectObject(viewer.tableGroup, true)
		for (const h of hits) {
			const code = findButtonCode(h.object)
			if (code) return { code, object: h.object, distance: h.distance }
		}
		return null
	}

	const setButtonVisual = (hitObject, isDown) => {
		if (!hitObject) return
		let btnNode = null
		for (let cur = hitObject; cur; cur = cur.parent) {
			const n = (cur.name || '').toLowerCase()
			if (n.includes('button') || n.includes('coin') || n.includes('plunger') || n.includes('launch')) {
				btnNode = cur
				break
			}
		}
		if (!btnNode) btnNode = hitObject
		const meshes = []
		if (btnNode.isMesh) meshes.push(btnNode)
		else
			btnNode.traverse?.(o => {
				if (o.isMesh) meshes.push(o)
			})
		if (!meshes.length && hitObject.isMesh) meshes.push(hitObject)
		for (const mesh of meshes) {
			if (!mesh.material) continue
			const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			for (const mat of mats) {
				if (isDown) {
					if (mat.userData.__origEmissive === undefined) {
						mat.userData.__origEmissive = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000)
						mat.userData.__origEmissiveIntensity = mat.emissiveIntensity ?? 0
					}
					if (mat.emissive) {
						mat.emissive.setHex(0x666666)
						mat.emissiveIntensity = 0.7
					}
					mat.needsUpdate = true
				} else {
					if (mat.userData.__origEmissive !== undefined) {
						if (mat.emissive) mat.emissive.copy(mat.userData.__origEmissive)
						mat.emissiveIntensity = mat.userData.__origEmissiveIntensity
						mat.needsUpdate = true
					}
				}
			}
			if (isDown) {
				if (!mesh.userData.__origScale) mesh.userData.__origScale = mesh.scale.clone()
				mesh.scale.set(0.97, 0.97, 0.97)
			} else {
				if (mesh.userData.__origScale) mesh.scale.copy(mesh.userData.__origScale)
			}
		}
	}

	const disableOrbit = () => {
		if (viewer.controls) {
			orbitPrevEnabled = viewer.controls.enabled
			viewer.controls.enabled = false
		}
	}
	const restoreOrbitIfNoButtons = () => {
		if (buttonActive.size === 0 && orbitPrevEnabled !== null && viewer.controls) {
			viewer.controls.enabled = orbitPrevEnabled
			orbitPrevEnabled = null
		}
	}
	const clearButtonHover = () => {
		if (isHoveringButton) {
			canvas.classList.remove('is-pointer')
			canvas.style.cursor = ''
			isHoveringButton = false
		}
	}
	const flushHover = () => {
		hoverRaf = 0
		if (viewer.viewerMode !== 'play' || !viewer.tableGroup) {
			clearButtonHover()
			return
		}
		const hit = getButtonHit(hoverX, hoverY)
		if (hit) {
			if (!isHoveringButton) {
				canvas.classList.add('is-pointer')
				canvas.style.cursor = 'pointer'
				isHoveringButton = true
			}
		} else {
			clearButtonHover()
		}
	}
	const onPointerMoveHover = e => {
		hoverX = e.clientX
		hoverY = e.clientY
		if (hoverRaf) return
		hoverRaf = requestAnimationFrame(flushHover)
	}
	const onPointerLeave = () => {
		if (hoverRaf) {
			cancelAnimationFrame(hoverRaf)
			hoverRaf = 0
		}
		clearButtonHover()
	}

	const onDown = e => {
		if (e.pointerType === 'touch') return
		if (e.pointerType === 'mouse' && e.button !== 0) return
		const hit = getButtonHit(e.clientX, e.clientY)
		let code
		if (hit) {
			code = hit.code
			buttonActive.set(e.pointerId, { code, object: hit.object })
			setButtonVisual(hit.object, true)
			disableOrbit()
			try {
				e.stopImmediatePropagation()
			} catch {}
			try {
				e.stopPropagation()
			} catch {}
		} else {
			code = toCode(e.clientX, e.clientY)
		}
		down(e.pointerId, code)
		if (viewer.viewerMode === 'play') e.preventDefault()
		try {
			canvas.setPointerCapture(e.pointerId)
		} catch {}
	}
	const onUp = e => {
		if (e.pointerType === 'touch') return
		const btnInfo = buttonActive.get(e.pointerId)
		if (btnInfo) {
			setButtonVisual(btnInfo.object, false)
			buttonActive.delete(e.pointerId)
			restoreOrbitIfNoButtons()
		}
		up(e.pointerId)
		if (viewer.viewerMode === 'play') e.preventDefault()
		try {
			canvas.releasePointerCapture(e.pointerId)
		} catch {}
	}
	const onCancel = e => {
		if (e.pointerType !== 'touch') {
			const btnInfo = buttonActive.get(e.pointerId)
			if (btnInfo) {
				setButtonVisual(btnInfo.object, false)
				buttonActive.delete(e.pointerId)
				restoreOrbitIfNoButtons()
			}
			up(e.pointerId)
		}
	}
	const touchStarts = new Map()
	const onTouchStart = e => {
		for (const t of e.changedTouches) {
			const hit = getButtonHit(t.clientX, t.clientY)
			let code
			if (hit) {
				code = hit.code
				buttonActive.set(t.identifier + 1000, { code, object: hit.object })
				setButtonVisual(hit.object, true)
				disableOrbit()
			} else {
				code = toCode(t.clientX, t.clientY)
			}
			touchStarts.set(t.identifier + 1000, { x: t.clientX, y: t.clientY, t: performance.now() })
			down(t.identifier + 1000, code)
		}
	}
	const onTouchEnd = e => {
		for (const t of e.changedTouches) {
			const id = t.identifier + 1000
			const btnInfo = buttonActive.get(id)
			if (btnInfo) {
				setButtonVisual(btnInfo.object, false)
				buttonActive.delete(id)
			}
			const st = touchStarts.get(id)
			if (st) {
				const dx = t.clientX - st.x
				const dy = t.clientY - st.y
				const dt = performance.now() - st.t
				touchStarts.delete(id)
				if (dt < 600 && Math.hypot(dx, dy) > 50) {
					up(id)
					const ang = swipeNudge(dx, dy, NUDGE)
					if (ang !== null) {
						viewer._nudge(ang, ang === NUDGE.back ? 2.0 : NUDGE.force)
						continue
					}
				}
			}
			up(id)
		}
		if (buttonActive.size === 0) restoreOrbitIfNoButtons()
	}
	const onContext = e => {
		if (viewer.viewerMode === 'play') e.preventDefault()
	}
	canvas.addEventListener('click', onCanvasClick)
	canvas.addEventListener('pointerdown', onDown, true)
	canvas.addEventListener('pointerup', onUp, true)
	canvas.addEventListener('pointercancel', onCancel, true)
	canvas.addEventListener('pointermove', onPointerMoveHover)
	canvas.addEventListener('pointerleave', onPointerLeave)
	canvas.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
	canvas.addEventListener('touchend', onTouchEnd, { passive: true })
	canvas.addEventListener('touchcancel', onTouchEnd, { passive: true })
	canvas.addEventListener('contextmenu', onContext)
	const cleanup = () => {
		canvas.removeEventListener('click', onCanvasClick)
		canvas.removeEventListener('pointerdown', onDown, true)
		canvas.removeEventListener('pointerup', onUp, true)
		canvas.removeEventListener('pointercancel', onCancel, true)
		canvas.removeEventListener('pointermove', onPointerMoveHover)
		canvas.removeEventListener('pointerleave', onPointerLeave)
		canvas.removeEventListener('touchstart', onTouchStart, { capture: true })
		canvas.removeEventListener('touchend', onTouchEnd)
		canvas.removeEventListener('touchcancel', onTouchEnd)
		canvas.removeEventListener('contextmenu', onContext)
		if (hoverRaf) {
			cancelAnimationFrame(hoverRaf)
			hoverRaf = 0
		}
		for (const { object } of buttonActive.values()) setButtonVisual(object, false)
		buttonActive.clear()
		if (orbitPrevEnabled !== null && viewer.controls) {
			viewer.controls.enabled = orbitPrevEnabled
			orbitPrevEnabled = null
		}
		clearButtonHover()
	}
	viewer._touchCleanup = cleanup
	return cleanup
}

export function attachNudgeInput(viewer) {
	if (viewer._nudgeCleanup) viewer._nudgeCleanup()
	viewer._nudgeCleanup = null
	const cleanups = []
	const trigger = (angle, force = NUDGE.force) => viewer._nudge(angle, force)

	const pad = document.getElementById('nudge-pad')
	if (pad) {
		pad.hidden = false
		const handler = e => {
			const dir = e.currentTarget?.dataset?.nudge
			if (dir === 'left') trigger(NUDGE.left, 2.8)
			else if (dir === 'right') trigger(NUDGE.right, 2.8)
			else if (dir === 'center' || dir === 'up') trigger(NUDGE.forward, 2.8)
			e.preventDefault()
		}
		for (const btn of pad.querySelectorAll('[data-nudge]')) {
			btn.addEventListener('touchstart', handler, { passive: false })
			btn.addEventListener('mousedown', handler)
			cleanups.push(() => {
				btn.removeEventListener('touchstart', handler)
				btn.removeEventListener('mousedown', handler)
			})
		}
	}

	const canvas = viewer.dom.canvas
	if (canvas) {
		let startX = 0,
			startY = 0,
			startT = 0,
			activeId = null
		const onPtrDown = e => {
			if (e.pointerType === 'touch' || e.button !== 2) return
			startX = e.clientX
			startY = e.clientY
			startT = performance.now()
			activeId = e.pointerId
		}
		const onPtrUp = e => {
			if (activeId !== e.pointerId) return
			const dx = e.clientX - startX,
				dy = e.clientY - startY,
				dt = performance.now() - startT
			activeId = null
			if (dt > 600 || Math.hypot(dx, dy) < 45) return
			const ang = swipeNudge(dx, dy, NUDGE)
			if (ang !== null) trigger(ang, ang === NUDGE.back ? 1.8 : 2.5)
		}
		canvas.addEventListener('pointerdown', onPtrDown)
		canvas.addEventListener('pointerup', onPtrUp)
		cleanups.push(() => {
			canvas.removeEventListener('pointerdown', onPtrDown)
			canvas.removeEventListener('pointerup', onPtrUp)
		})
	}

	let lastShake = 0
	const onMotion = e => {
		const acc = e.accelerationIncludingGravity || e.acceleration
		if (!acc) return
		const mag = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0)
		if (mag < 18) return
		const now = performance.now()
		if (now - lastShake < 700) return
		lastShake = now
		trigger((acc.x ?? 0) > 0 ? 285 : 75, 3.0)
	}
	let motionActive = false
	if (typeof DeviceMotionEvent !== 'undefined' && 'requestPermission' in DeviceMotionEvent) {
		const btn = document.getElementById('enable-motion')
		if (btn) {
			btn.hidden = false
			btn.onclick = async () => {
				try {
					const perm = await DeviceMotionEvent.requestPermission()
					if (perm === 'granted') {
						addEventListener('devicemotion', onMotion)
						motionActive = true
						btn.hidden = true
						viewer.log('Motion nudge enabled', 'info')
					}
				} catch {}
			}
		}
	} else {
		addEventListener('devicemotion', onMotion)
		motionActive = true
	}
	cleanups.push(() => {
		if (motionActive) removeEventListener('devicemotion', onMotion)
	})

	let gpRaf = 0
	const lastBy = new Map()
	const pollGP = () => {
		const gps = navigator.getGamepads?.()
		if (gps) {
			for (const gp of gps) {
				if (!gp) continue
				const now = performance.now()
				const btnKey = `b${gp.index}`
				const axisKey = `a${gp.index}`
				let ang = null
				if (gp.buttons[4]?.pressed) ang = 75
				else if (gp.buttons[5]?.pressed) ang = 285
				else if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) ang = 0
				if (ang !== null) {
					const last = lastBy.get(btnKey) ?? 0
					if (now - last >= 180) {
						trigger(ang, 2.8)
						lastBy.set(btnKey, now)
					}
				}
				const ax0 = gp.axes[0] ?? 0
				const ax1 = gp.axes[1] ?? 0
				if (Math.abs(ax0) > 0.85 || Math.abs(ax1) > 0.85) {
					const last = lastBy.get(axisKey) ?? 0
					if (now - last >= 300) {
						if (Math.abs(ax0) > Math.abs(ax1)) trigger(ax0 < 0 ? 75 : 285, 2.5)
						else trigger(ax1 < 0 ? 0 : 180, 2.2)
						lastBy.set(axisKey, now)
					}
				}
			}
		}
		gpRaf = requestAnimationFrame(pollGP)
	}
	gpRaf = requestAnimationFrame(pollGP)
	cleanups.push(() => cancelAnimationFrame(gpRaf))

	viewer._nudgeCleanup = () => {
		for (const fn of cleanups) fn()
	}
	return viewer._nudgeCleanup
}

export function attachInput(viewer) {
	const cleanKB = attachKeyboard(viewer)
	const cleanPT = attachPointerTouch(viewer)
	const cleanNudge = attachNudgeInput(viewer)
	return () => {
		cleanKB()
		cleanPT()
		cleanNudge()
	}
}

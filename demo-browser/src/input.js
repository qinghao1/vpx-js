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
	const onDown = e => {
		if (e.pointerType === 'touch') return
		if (e.pointerType === 'mouse' && e.button !== 0) return
		down(e.pointerId, toCode(e.clientX, e.clientY))
		if (viewer.viewerMode === 'play') e.preventDefault()
		canvas.setPointerCapture(e.pointerId)
	}
	const onUp = e => {
		if (e.pointerType === 'touch') return
		up(e.pointerId)
		if (viewer.viewerMode === 'play') e.preventDefault()
		canvas.releasePointerCapture(e.pointerId)
	}
	const onCancel = e => {
		if (e.pointerType !== 'touch') up(e.pointerId)
	}
	const touchStarts = new Map()
	const onTouchStart = e => {
		for (const t of e.changedTouches) {
			touchStarts.set(t.identifier + 1000, { x: t.clientX, y: t.clientY, t: performance.now() })
			down(t.identifier + 1000, toCode(t.clientX, t.clientY))
		}
	}
	const onTouchEnd = e => {
		for (const t of e.changedTouches) {
			const id = t.identifier + 1000
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
	}
	const onContext = e => {
		if (viewer.viewerMode === 'play') e.preventDefault()
	}
	canvas.addEventListener('pointerdown', onDown)
	canvas.addEventListener('pointerup', onUp)
	canvas.addEventListener('pointercancel', onCancel)
	canvas.addEventListener('touchstart', onTouchStart, { passive: true })
	canvas.addEventListener('touchend', onTouchEnd, { passive: true })
	canvas.addEventListener('touchcancel', onTouchEnd, { passive: true })
	canvas.addEventListener('contextmenu', onContext)
	const cleanup = () => {
		canvas.removeEventListener('click', onCanvasClick)
		canvas.removeEventListener('pointerdown', onDown)
		canvas.removeEventListener('pointerup', onUp)
		canvas.removeEventListener('pointercancel', onCancel)
		canvas.removeEventListener('touchstart', onTouchStart)
		canvas.removeEventListener('touchend', onTouchEnd)
		canvas.removeEventListener('touchcancel', onTouchEnd)
		canvas.removeEventListener('contextmenu', onContext)
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

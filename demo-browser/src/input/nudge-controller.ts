// @ts-nocheck
import { NUDGE } from '../config.js'
import { swipeNudge } from '../../../dist-esm/lib/render/threejs/three-scene-postprocess.js'

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


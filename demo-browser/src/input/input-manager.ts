// @ts-nocheck
import * as THREE from 'three'
import { pushInput } from '../../../dist-esm/lib/game/shared/physics-buffer.js'
import { NUDGE } from '../config.js'
import { ensureBvh } from '../env.js'
import { swipeNudge } from '../../../dist-esm/lib/render/threejs/three-scene-postprocess.js'
import { aliasEvent } from '../utils.js'

const keyToCode = (code) => {
	if (!code) return 0
	let h = 0
	for (let i = 0; i < code.length; i++) h = ((h * 31 + code.charCodeAt(i)) & 0xffff) >>> 0
	return h || 1
}
const PLAY_KEYS = new Set(['Space','KeyZ','Slash','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Digit1','Digit5','KeyT'])

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
	ensureBvh()
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

	const emissiveOrig = new WeakMap()
	const emissiveIntOrig = new WeakMap()
	const scaleOrig = new WeakMap()

	const getButtonHit = (clientX, clientY) => {
		if (!viewer.tableGroup || !viewer.camera) return null
		if (viewer.viewerMode !== 'play') return null
		if (!viewer.player) return null
		const meshes = viewer._buttonMeshes
		const rect = canvas.getBoundingClientRect()
		if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null
		viewer.tableGroup.updateMatrixWorld(true)
		const x = ((clientX - rect.left) / rect.width) * 2 - 1
		const y = -((clientY - rect.top) / rect.height) * 2 + 1
		const mouse = new THREE.Vector2(x, y)
		raycaster.setFromCamera(mouse, viewer.camera)
		if (meshes?.length) {
			raycaster.firstHitOnly = true
			const hits = raycaster.intersectObjects(meshes, false)
			if (!hits.length) return null
			const h = hits[0]
			const code = h.object.userData?.buttonCode || h.object.userData?.__buttonCode
			if (!code) return null
			return { code, object: h.object, distance: h.distance }
		}
		raycaster.firstHitOnly = false
		const hits = raycaster.intersectObject(viewer.tableGroup, true)
		for (const h of hits) {
			for (let cur = h.object; cur; cur = cur.parent) {
				const code =
					cur.userData?.buttonCode ||
					cur.userData?.__buttonCode ||
					(cur.userData?.isCabinetButton ? cur.userData.buttonCode : null)
				if (code) return { code, object: h.object, distance: h.distance }
			}
		}
		return null
	}

	const setButtonVisual = (hitObject, isDown) => {
		if (!hitObject) return
		const meshes = []
		if (hitObject.isMesh) meshes.push(hitObject)
		else
			hitObject.traverse?.(o => {
				if (o.isMesh) meshes.push(o)
			})
		if (!meshes.length && hitObject.isMesh) meshes.push(hitObject)
		for (const mesh of meshes) {
			if (!mesh.material) continue
			if (isDown && !mesh.userData.__clonedMaterial) {
				if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(m => m.clone())
				else mesh.material = mesh.material.clone()
				mesh.userData.__clonedMaterial = true
			}
			const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
			for (const mat of mats) {
				if (isDown) {
					if (!emissiveOrig.has(mat)) {
						emissiveOrig.set(mat, mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000))
						emissiveIntOrig.set(mat, mat.emissiveIntensity ?? 0)
					}
					if (mat.emissive) {
						mat.emissive.setHex(0x666666)
						mat.emissiveIntensity = 0.7
					}
					mat.needsUpdate = true
				} else {
					if (emissiveOrig.has(mat)) {
						const orig = emissiveOrig.get(mat)
						if (mat.emissive && orig) mat.emissive.copy(orig)
						mat.emissiveIntensity = emissiveIntOrig.get(mat) ?? 0
						mat.needsUpdate = true
					}
				}
			}
			if (isDown) {
				if (!scaleOrig.has(mesh)) scaleOrig.set(mesh, mesh.scale.clone())
				mesh.scale.set(0.97, 0.97, 0.97)
			} else {
				const orig = scaleOrig.get(mesh)
				if (orig) mesh.scale.copy(orig)
			}
		}
	}

	const disableOrbit = () => {
		if (viewer.controls && orbitPrevEnabled === null) {
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
		canvas.removeEventListener('touchstart', onTouchStart, true)
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


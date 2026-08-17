import * as THREE from 'three'
import { keyEventToDirectInputKey } from '../../../dist-esm/lib/game/key-code.js'
import { pushInput } from '../../../dist-esm/lib/game/shared/physics-buffer.js'
import { swipeNudge } from '../../../dist-esm/lib/render/threejs/three-scene-postprocess.js'
import { CONTROL_SCHEME, NUDGE } from '../config.js'
import { ensureBvh } from '../env.js'

// Generic helpers used by any table: map physical code → logical key + location.
// Covers all codes from CONTROL_SCHEME and BUTTON_CODE_PATTERNS (Digit*/Key*/Shift*/Control*/Alt*).
export const keyForCode = (c: string): string =>
	c === 'Enter'
		? 'Enter'
		: c.startsWith('Digit')
			? c.slice(5)
			: c.startsWith('Key')
				? c.slice(3).toLowerCase()
				: c.startsWith('Shift')
					? 'Shift'
					: c.startsWith('Control')
						? 'Control'
						: c.startsWith('Alt')
							? 'Alt'
							: c === 'Space'
								? ' '
								: c

export const locationForCode = (code: string): number | undefined =>
	code.endsWith('Left') ? 1 : code.endsWith('Right') ? 2 : undefined

export interface InputHost {
	readonly canvas: HTMLCanvasElement
	readonly player: {
		onKeyDown: (e: { code: string; key: string; location?: number; ts: number }) => void
		onKeyUp: (e: { code: string; key: string; location?: number; ts: number }) => void
		nudge: (angle: number, force: number) => void
	} | null
	readonly viewerMode: 'viewer' | 'play'
	readonly controls: { enabled: boolean } | null
	readonly camera: THREE.Camera | null
	readonly tableGroup: THREE.Group | null
	readonly buttonMeshes: readonly THREE.Object3D[] | null
	readonly physicsSab: SharedArrayBuffer | null
	readonly enableMotionButton?: HTMLButtonElement | null
	log?(msg: string, level?: string): void
	enterPlayMode(): void
	exitPlayMode(): void
	togglePause(): void
	releaseKeys(codes: string[]): void
	requestMotionPermission?(): Promise<boolean>
}

const PLAY_CODES = new Set(CONTROL_SCHEME.flatMap(c => c.keys))

// Generic screen zones for touch fallback when no cabinet mesh is hit.
// These are not walking_dead-specific: left/right halves are flipper zones on any table,
// bottom-right quadrant is the conventional plunger/launch zone. Tables that provide real
// cabinet button meshes (via viewer._buttonMeshes / isCabinetButton) bypass this entirely
// through raycasting — this is only the low-cost fallback for VR-less or minimal tables.
const FALLBACK_ZONES = {
	plunger: { xMin: 0.65, yMin: 0.55 },
	flipperSplit: 0.5,
} as const

function toHost(viewer: any): InputHost {
	return {
		get canvas() {
			return viewer.dom?.canvas as HTMLCanvasElement
		},
		get player() {
			return viewer.player ?? null
		},
		get viewerMode() {
			return viewer.viewerMode as 'viewer' | 'play'
		},
		get controls() {
			return viewer.controls ?? null
		},
		get camera() {
			return viewer.camera ?? null
		},
		get tableGroup() {
			return viewer.tableGroup ?? null
		},
		get buttonMeshes() {
			return (viewer._buttonMeshes ?? null) as readonly THREE.Object3D[] | null
		},
		get physicsSab() {
			return (viewer._physicsSab ?? null) as SharedArrayBuffer | null
		},
		get enableMotionButton() {
			return typeof document !== 'undefined'
				? (document.getElementById('enable-motion') as HTMLButtonElement | null)
				: null
		},
		log(msg: string, level?: string) {
			try {
				viewer.log?.(msg, level)
			} catch {}
		},
		enterPlayMode() {
			try {
				viewer.viewerMode = 'play'
			} catch {}
			try {
				viewer.player?.setPhysicsEnabled?.(true)
			} catch {}
			try {
				viewer.enterPlayMode?.()
			} catch {}
			try {
				viewer._switchToPlay?.()
			} catch {}
		},
		exitPlayMode() {
			try {
				viewer._switchToViewer?.()
			} catch {}
			try {
				viewer.exitPlayMode?.()
			} catch {}
		},
		togglePause() {
			try {
				viewer.isPaused = !viewer.isPaused
				if (viewer.isPaused) viewer.player?.pause?.()
				else viewer.player?.resume?.()
				viewer.log?.(viewer.isPaused ? 'Paused (P to resume)' : 'Resumed', viewer.isPaused ? 'warn' : 'info')
			} catch {}
		},
		releaseKeys(codes: string[]) {
			for (const code of codes) {
				try {
					viewer._sendKey?.(code, false)
				} catch {}
				try {
					const key = keyForCode(code)
					const loc = locationForCode(code)
					const ev = { code, key, location: loc, ts: Date.now() } as any
					viewer.player?.onKeyUp?.(ev)
				} catch {}
			}
		},
		requestMotionPermission:
			typeof DeviceMotionEvent !== 'undefined' && 'requestPermission' in (DeviceMotionEvent as any)
				? async () => {
						try {
							const perm = await (DeviceMotionEvent as any).requestPermission()
							return perm === 'granted'
						} catch {
							return false
						}
					}
				: undefined,
	}
}

function attachKeyboardHost(host: InputHost, signal: AbortSignal): void {
	const pressed = new Set<number>()

	const onKey = (e: KeyboardEvent, down: boolean): void => {
		if (e.key === '?' || (e.key.length === 1 && ['h', 'o'].includes(e.key.toLowerCase()))) return

		if (down && host.viewerMode === 'viewer' && (PLAY_CODES.has(e.code) || PLAY_CODES.has(e.key))) {
			host.enterPlayMode()
		}

		if (host.viewerMode !== 'play') return

		if (e.code === 'Escape' && down) {
			host.exitPlayMode()
			e.preventDefault()
			return
		}

		if ((e.code === 'KeyP' || e.key.toLowerCase() === 'p') && down && !e.ctrlKey && !e.metaKey && !e.repeat) {
			host.togglePause()
			e.preventDefault()
			return
		}

		const dik = keyEventToDirectInputKey(e as any)
		if (dik) {
			if (down) {
				if (pressed.has(dik)) return
				pressed.add(dik)
			} else {
				pressed.delete(dik)
			}
		}

		const ev = {
			code: e.code || e.key,
			key: e.key,
			location: (e as any).location,
			keyCode: (e as any).keyCode,
			which: (e as any).which,
			ts: Date.now(),
		} as any

		if (host.player) {
			if (down) {
				try {
					host.player.onKeyDown(ev)
				} catch (err) {
					console.warn('[input] onKeyDown failed', err)
				}
			} else {
				try {
					host.player.onKeyUp(ev)
				} catch (err) {
					console.warn('[input] onKeyUp failed', err)
				}
			}
		}

		if (host.physicsSab && dik) {
			pushInput(host.physicsSab, down ? 1 : 0, dik, Date.now())
		}

		if (dik || PLAY_CODES.has(e.code) || PLAY_CODES.has(e.key)) {
			e.preventDefault()
		}
	}

	window.addEventListener('keydown', e => onKey(e, true), { signal })
	window.addEventListener('keyup', e => onKey(e, false), { signal })
	window.addEventListener(
		'blur',
		() => {
			pressed.clear()
			host.releaseKeys(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'])
		},
		{ signal },
	)
	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.hidden)
				host.releaseKeys(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'])
		},
		{ signal },
	)
}

function attachPointerHost(host: InputHost, signal: AbortSignal): void {
	ensureBvh()
	const canvas = host.canvas
	if (!canvas) return

	const active = new Map<number, string>()
	const raycaster = new THREE.Raycaster()
	const ndc = new THREE.Vector2()
	;(raycaster as any).firstHitOnly = true
	let rect: DOMRect | null = null
	let hoverRaf = 0
	let hoverX = 0
	let hoverY = 0
	const swipeStart = new Map<number, { x: number; y: number; t: number }>()

	let ro: ResizeObserver | null = null
	try {
		ro = new ResizeObserver(() => {
			rect = canvas.getBoundingClientRect()
		})
		ro.observe(canvas)
		signal.addEventListener('abort', () => ro?.disconnect(), { once: true })
	} catch {}

	window.addEventListener(
		'scroll',
		() => {
			rect = null
		},
		{ signal, passive: true } as any,
	)

	try {
		canvas.tabIndex = 0
	} catch {}
	const onCanvasClick = (): void => {
		try {
			canvas.focus()
		} catch {}
	}
	canvas.addEventListener('click', onCanvasClick, { signal })

	const zoneFor = (x: number, y: number): string => {
		const r = rect ?? (rect = canvas.getBoundingClientRect())
		if (!r || !r.width || !r.height) return 'ShiftLeft'
		const nx = (x - r.left) / r.width
		const ny = (y - r.top) / r.height
		// Generic fallback zones: works for any table orientation; real cabinet meshes take precedence
		if (nx > FALLBACK_ZONES.plunger.xMin && ny > FALLBACK_ZONES.plunger.yMin) return 'Enter'
		return nx < FALLBACK_ZONES.flipperSplit ? 'ShiftLeft' : 'ShiftRight'
	}

	const hitFor = (
		x: number,
		y: number,
		opts: { hover?: boolean } = {},
	): { code: string; obj: THREE.Object3D } | null => {
		if (!host.tableGroup || !host.camera || host.viewerMode !== 'play' || !host.player) return null
		const r = rect ?? (rect = canvas.getBoundingClientRect())
		if (!r || !r.width || !r.height) return null
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
		ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
		raycaster.setFromCamera(ndc, host.camera)
		const meshes = host.buttonMeshes
		if (meshes?.length) {
			const hits = raycaster.intersectObjects(meshes as THREE.Object3D[], false)
			const h = hits[0] as any
			if (h?.object) {
				for (let cur: any = h.object; cur; cur = cur.parent) {
					const code: string | null = cur.userData?.buttonCode ?? cur.userData?.__buttonCode ?? null
					if (code) return { code, obj: cur as THREE.Object3D }
				}
			}
			if (opts.hover) return null
		}
		if (opts.hover) return null
		// Generic fallback for any table: if no cabinet mesh list (or hit misses), walk the scene
		// once on pointerdown (rare) — not on hover (60 Hz). This catches tables where buttons are
		// plain primitives grouped under a cabinet node without isCabinetButton flag.
		try {
			const hits = raycaster.intersectObject(host.tableGroup, true)
			for (const h of hits) {
				for (let cur: any = (h as any).object; cur; cur = cur.parent) {
					const code: string | null =
						cur.userData?.buttonCode ??
						cur.userData?.__buttonCode ??
						(cur.userData?.isCabinetButton ? cur.userData.buttonCode : null)
					if (code) return { code, obj: (h as any).object as THREE.Object3D }
				}
			}
		} catch {}
		return null
	}

	const scheduleHover = (x: number, y: number): void => {
		hoverX = x
		hoverY = y
		if (hoverRaf) return
		hoverRaf = requestAnimationFrame(() => {
			hoverRaf = 0
			const hit = hitFor(hoverX, hoverY, { hover: true })
			canvas.classList.toggle('is-pointer', !!hit)
			if (hit) canvas.style.cursor = 'pointer'
			else canvas.style.cursor = ''
		})
	}

	canvas.addEventListener(
		'pointerdown',
		(e: PointerEvent) => {
			if (e.button !== 0 && e.button !== 2) return
			const isRightClick = e.button === 2
			const hit = hitFor(e.clientX, e.clientY, { hover: false })
			const code = isRightClick ? '__nudge' : (hit?.code ?? zoneFor(e.clientX, e.clientY))
			active.set(e.pointerId, code)
			swipeStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })

			if (!isRightClick) {
				const key = keyForCode(code)
				const location = locationForCode(code)
				const ev = { code, key, location, ts: Date.now() } as any
				try {
					host.player?.onKeyDown(ev)
				} catch (err) {
					console.warn('[input] onKeyDown failed', err)
				}
				if (host.physicsSab) {
					const dik = keyEventToDirectInputKey(ev)
					if (dik) pushInput(host.physicsSab, 1, dik, Date.now())
				}
			}

			if (hit) {
				canvas.setAttribute('data-pressed', code)
				try {
					e.stopPropagation()
				} catch {}
				if (host.controls) {
					const c: any = host.controls
					if (c._inputPrevEnabled == null) c._inputPrevEnabled = c.enabled
					c.enabled = false
				}
			}

			try {
				canvas.setPointerCapture(e.pointerId)
			} catch {}
			if (host.viewerMode === 'play') e.preventDefault()
			if (isRightClick) e.preventDefault()
		},
		{ signal },
	)

	const end = (e: PointerEvent): void => {
		const code = active.get(e.pointerId)
		if (!code) return
		active.delete(e.pointerId)

		if (code !== '__nudge') {
			const key = keyForCode(code)
			const location = locationForCode(code)
			const ev = { code, key, location, ts: Date.now() } as any
			try {
				host.player?.onKeyUp(ev)
			} catch (err) {
				console.warn('[input] onKeyUp failed', err)
			}
			if (host.physicsSab) {
				const dik = keyEventToDirectInputKey(ev)
				if (dik) pushInput(host.physicsSab, 0, dik, Date.now())
			}
		}

		if (active.size === 0) canvas.removeAttribute('data-pressed')

		if (active.size === 0 && host.controls) {
			const c: any = host.controls
			if (c._inputPrevEnabled != null) {
				c.enabled = c._inputPrevEnabled
				c._inputPrevEnabled = null
			}
		}

		const s = swipeStart.get(e.pointerId)
		swipeStart.delete(e.pointerId)
		if (s) {
			const dx = e.clientX - s.x
			const dy = e.clientY - s.y
			const dt = performance.now() - s.t
			if (dt < 600 && Math.hypot(dx, dy) > 50) {
				const ang = swipeNudge(dx, dy, NUDGE as any)
				if (ang !== null) {
					try {
						host.player?.nudge(ang, ang === NUDGE.back ? 2.0 : NUDGE.force)
					} catch {}
				}
			}
		}

		try {
			canvas.releasePointerCapture(e.pointerId)
		} catch {}
	}

	canvas.addEventListener('pointerup', end as any, { signal })
	canvas.addEventListener('pointercancel', end as any, { signal })
	canvas.addEventListener('pointermove', (e: PointerEvent) => scheduleHover(e.clientX, e.clientY), {
		signal,
		passive: true,
	} as any)
	canvas.addEventListener(
		'pointerleave',
		() => {
			if (hoverRaf) {
				cancelAnimationFrame(hoverRaf)
				hoverRaf = 0
			}
			canvas.classList.remove('is-pointer')
			canvas.style.cursor = ''
		},
		{ signal },
	)
	canvas.addEventListener(
		'contextmenu',
		(e: MouseEvent) => {
			if (host.viewerMode === 'play') e.preventDefault()
		},
		{ signal },
	)

	signal.addEventListener('abort', () => {
		if (hoverRaf) {
			cancelAnimationFrame(hoverRaf)
			hoverRaf = 0
		}
		canvas.classList.remove('is-pointer')
		canvas.style.cursor = ''
		canvas.removeAttribute('data-pressed')
		active.clear()
		swipeStart.clear()
		if (host.controls) {
			const c: any = host.controls
			if (c._inputPrevEnabled != null) {
				c.enabled = c._inputPrevEnabled
				c._inputPrevEnabled = null
			}
		}
	})
}

export function attachKeyboard(viewer: any): () => void {
	const host = toHost(viewer)
	const ctrl = new AbortController()

	if (viewer._keyboardCtrl) {
		try {
			viewer._keyboardCtrl.abort()
		} catch {}
	}
	viewer._keyboardCtrl = ctrl

	attachKeyboardHost(host, ctrl.signal)

	try {
		viewer.dom?.canvas?.focus?.()
	} catch {}
	try {
		if (viewer.dom?.canvas) viewer.dom.canvas.tabIndex = 0
	} catch {}

	return () => {
		try {
			ctrl.abort()
		} catch {}
		if (viewer._keyboardCtrl === ctrl) viewer._keyboardCtrl = null
	}
}

export function attachPointerTouch(viewer: any): () => void {
	const host = toHost(viewer)
	const ctrl = new AbortController()

	if (viewer._pointerCtrl) {
		try {
			viewer._pointerCtrl.abort()
		} catch {}
	}
	viewer._pointerCtrl = ctrl

	attachPointerHost(host, ctrl.signal)

	return () => {
		try {
			ctrl.abort()
		} catch {}
		if (viewer._pointerCtrl === ctrl) viewer._pointerCtrl = null
		try {
			viewer._touchCleanup = null
		} catch {}
	}
}

export function attachInputHost(host: InputHost, signal: AbortSignal): void {
	attachKeyboardHost(host, signal)
	attachPointerHost(host, signal)
}

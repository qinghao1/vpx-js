// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import * as THREE from 'three'
import { swipeNudge } from '../../../dist-esm/lib/render/threejs/three-scene-postprocess.js'
import { CONTROL_SCHEME, isTableHit, NUDGE } from '../config.js'
import { ensureBvh, isLowQuality } from '../env.js'
import { keyEventToDirectInputKey } from './key-code.js'

/** Touch and pen taps on the playfield work the flippers; a mouse orbits. */
const isTouchFlipper = (e: PointerEvent): boolean => e.pointerType === 'touch' || e.pointerType === 'pen'

/** Form fields own every key; buttons and links own the keys that activate them. */
export function ownsKey(target: EventTarget | null, code: string): boolean {
	if (!(target instanceof Element)) return false
	if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return true
	return (
		(code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && !!target.closest('button, a[href], summary')
	)
}

/**
 * Only the canvas or the page body auto-enters play: gameplay keys pressed
 * while a button, link, or panel has focus stay with that control.
 */
export function isPlaySurface(target: EventTarget | null): boolean {
	const tag = (target as { tagName?: unknown } | null)?.tagName
	if (typeof tag !== 'string') return false
	const lower = tag.toLowerCase()
	return lower === 'canvas' || lower === 'body'
}

// Every gameplay code that must never stick down across blur/hide/exit-play:
// modifiers, plunger (Enter), nudge keys, the coin-door/service cluster
// (7/8/9/0, End, Home) whose switches would otherwise latch the game in test
// menus, and Start/coin/arrow keys whose emu switches or pressed-set entry
// would otherwise stick. Toggles without emu or script switches (KeyA/KeyD
// for alternate bindings, Escape) are listed too so no pressed
// entry survives focus loss. Blur/hide/exit-play release this whole list so
// a key held during focus loss cannot stay logically down.
export const RELEASE_CODES = [
	'ShiftLeft',
	'ShiftRight',
	'ControlLeft',
	'ControlRight',
	'AltLeft',
	'AltRight',
	'Enter',
	'KeyZ',
	'Slash',
	'Space',
	'Digit7',
	'Digit8',
	'Digit9',
	'Digit0',
	'End',
	'Home',
	'Digit1',
	'Digit5',
	'ArrowLeft',
	'ArrowRight',
	'KeyA',
	'KeyD',
	'Escape',
]

export interface InputHost {
	readonly canvas: HTMLCanvasElement
	readonly engineReady: boolean
	sendKey(code: string, down: boolean): void
	readonly viewerMode: 'viewer' | 'play'
	readonly controls: { enabled: boolean } | null
	readonly camera: THREE.Camera | null
	readonly tableGroup: THREE.Group | null
	readonly buttonMeshes: readonly THREE.Object3D[] | null
	/** Step the engine now instead of waiting for the next frame (input latency). */
	tickImmediate(): void
	nudge(angle: number, force: number): void
	log?(msg: string, level?: string): void
	enterPlayMode(): void
	exitPlayMode(): void
	togglePause(): void
	releaseKeys(codes: string[]): void
}

const PLAY_CODES = new Set(CONTROL_SCHEME.flatMap(c => c.keys))

const FALLBACK_ZONES = { flipperSplit: 0.5 } as const

/** The viewer → InputHost adapter shared by the keyboard, pointer, and nudge attachers. */
export function makeHost(viewer: any): InputHost {
	return {
		get canvas() {
			return viewer.dom?.canvas as HTMLCanvasElement
		},
		get engineReady() {
			return viewer.wasmEngine?.ready ?? false
		},
		sendKey(code: string, down: boolean) {
			viewer._sendKey?.(code, down)
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
		tickImmediate() {
			if (!isLowQuality()) viewer.stepOnce()
		},
		nudge(angle: number, force: number) {
			viewer._nudge?.(angle, force)
		},
		log(msg: string, level?: string) {
			viewer.log?.(msg, level)
		},
		enterPlayMode() {
			void viewer._switchToPlay()
		},
		exitPlayMode() {
			void viewer._switchToViewer()
		},
		togglePause() {
			viewer.togglePause()
		},
		releaseKeys(codes: string[]) {
			for (const code of codes) {
				viewer._sendKey?.(code, false)
			}
		},
	}
}

export function attachKeyboard(host: InputHost, signal: AbortSignal): void {
	const pressed = new Set<number>()

	const onKey = (e: KeyboardEvent, down: boolean): void => {
		// A focused control keeps its keys, but releases always go through:
		// a key let go over a control still clears its switch.
		if (down && ownsKey(e.target, e.code)) return
		if (e.key === '?' || (e.key.length === 1 && ['h', 'o'].includes(e.key.toLowerCase()))) return

		if (down && host.viewerMode === 'viewer' && (PLAY_CODES.has(e.code) || PLAY_CODES.has(e.key))) {
			// Focused controls keep their keys: only a canvas/body target
			// auto-enters play, so keys on a button never start a game.
			if (!isPlaySurface(e.target)) return
			host.enterPlayMode()
		}

		// Track held switches above the play-mode gate: mode exits that
		// bypass Escape (Reset button, browser back, test API) must not
		// strand a held key in `pressed` and eat the next press.
		const dik = keyEventToDirectInputKey(e as any)
		if (dik) {
			if (down) {
				if (pressed.has(dik)) return
				pressed.add(dik)
			} else {
				pressed.delete(dik)
			}
		}

		if (host.viewerMode !== 'play') return

		if (e.code === 'Escape' && down) {
			pressed.clear()
			host.exitPlayMode()
			e.preventDefault()
			return
		}

		if ((e.code === 'KeyP' || e.key.toLowerCase() === 'p') && down && !e.ctrlKey && !e.metaKey && !e.repeat) {
			host.togglePause()
			e.preventDefault()
			return
		}

		const ev = {
			code: e.code || e.key,
			key: e.key,
			location: (e as any).location,
			keyCode: (e as any).keyCode,
			which: (e as any).which,
			ts: Date.now(),
		} as any

		if (host.engineReady) {
			host.sendKey(ev.code, down)
			host.tickImmediate()
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
			host.releaseKeys(RELEASE_CODES)
		},
		{ signal },
	)
	document.addEventListener(
		'visibilitychange',
		() => {
			if (document.hidden) {
				pressed.clear()
				host.releaseKeys(RELEASE_CODES)
			}
		},
		{ signal },
	)
}

export function attachPointer(host: InputHost, signal: AbortSignal): void {
	ensureBvh()
	const canvas = host.canvas
	if (!canvas) return

	const active = new Map<number, string>()
	const raycaster = new THREE.Raycaster()
	const ndc = new THREE.Vector2()
	;(raycaster as any).firstHitOnly = true
	let hoverRaf = 0
	let hoverX = 0
	let hoverY = 0
	const swipeStart = new Map<number, { x: number; y: number; t: number }>()
	// Orbit enablement saved while a button/flipper press owns the pointer.
	let controlsPrevEnabled: boolean | null = null
	const suspendControls = (): void => {
		if (host.controls && controlsPrevEnabled === null) {
			controlsPrevEnabled = host.controls.enabled
			host.controls.enabled = false
		}
	}
	const resumeControls = (): void => {
		if (host.controls && controlsPrevEnabled !== null) {
			host.controls.enabled = controlsPrevEnabled
			controlsPrevEnabled = null
		}
	}

	canvas.tabIndex = 0
	canvas.addEventListener('click', () => canvas.focus(), { signal })

	const zoneFor = (x: number, _y: number): string => {
		const r = canvas.getBoundingClientRect()
		if (!r.width) return 'ShiftLeft'
		return (x - r.left) / r.width < FALLBACK_ZONES.flipperSplit ? 'ShiftLeft' : 'ShiftRight'
	}

	const send = (code: string, down: boolean): void => {
		if (!host.engineReady) return
		host.sendKey(code, down)
		host.tickImmediate()
	}

	const hitFor = (
		x: number,
		y: number,
		opts: { hover?: boolean } = {},
	): { code: string; obj: THREE.Object3D } | null => {
		if (opts.hover && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches)
			return null
		if (!host.tableGroup || !host.camera || host.viewerMode !== 'play' || !host.engineReady) return null
		const r = canvas.getBoundingClientRect()
		if (!r.width || !r.height) return null
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
		}
		return null
	}

	const scheduleHover = (x: number, y: number): void => {
		if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches) return
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

	/** On-screen cabinet buttons (top bar Coin/Start, bottom bar Fire/Plunger), shown in touch play only. */
	function attachTouchKeys(): void {
		for (const btn of document.querySelectorAll('.touch-keys button[data-code]')) {
			const code = (btn as HTMLElement).getAttribute('data-code')!
			const onDown = (e: PointerEvent) => {
				e.preventDefault()
				e.stopPropagation()
				if ((btn as HTMLElement).hasAttribute('data-pressed')) return
				;(btn as HTMLElement).setAttribute('data-pressed', code)
				send(code, true)
				try {
					;(btn as HTMLElement).setPointerCapture((e as any).pointerId)
				} catch {}
			}
			const onUp = (e: PointerEvent) => {
				if (!(btn as HTMLElement).hasAttribute('data-pressed')) return
				;(btn as HTMLElement).removeAttribute('data-pressed')
				e.preventDefault()
				e.stopPropagation()
				send(code, false)
				try {
					;(btn as HTMLElement).releasePointerCapture((e as any).pointerId)
				} catch {}
			}
			btn.addEventListener('pointerdown', onDown as any, { signal, passive: false } as any)
			btn.addEventListener('pointerup', onUp as any, { signal } as any)
			btn.addEventListener('pointercancel', onUp as any, { signal } as any)
			btn.addEventListener('pointerleave', onUp as any, { signal } as any)
			btn.addEventListener('contextmenu', (e: Event) => e.preventDefault(), { signal } as any)
		}
	}

	attachTouchKeys()

	canvas.addEventListener(
		'pointerdown',
		(e: PointerEvent) => {
			if (e.button !== 0 && e.button !== 2) return
			if (host.viewerMode !== 'play') {
				if (!host.tableGroup || !host.camera) return
				const r = canvas.getBoundingClientRect()
				ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
				raycaster.setFromCamera(ndc, host.camera)
				const hits = raycaster.intersectObject(host.tableGroup, true)
				if (!hits.some((h: any) => isTableHit(h.object, host.tableGroup))) return
				host.enterPlayMode()
			}
			const isRightClick = e.button === 2
			if (!isRightClick) {
				const buttonHit = hitFor(e.clientX, e.clientY)
				if (buttonHit) {
					const code = buttonHit.code
					const already = active.has(e.pointerId)
					active.set(e.pointerId, code)
					swipeStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
					if (!already) send(code, true)
					canvas.setAttribute('data-pressed', code)
					suspendControls()
					try {
						canvas.setPointerCapture(e.pointerId)
					} catch {}
					e.preventDefault()
					e.stopPropagation()
					return
				}
				if (!isTouchFlipper(e)) {
					swipeStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
					try {
						canvas.setPointerCapture(e.pointerId)
					} catch {}
					return
				}
			}
			// Right button never drives a switch: it reserves the gesture for
			// swipe-nudge (see end()) while suspending orbit controls.
			const code = isRightClick ? '__nudge' : zoneFor(e.clientX, e.clientY)
			const already = active.has(e.pointerId)
			active.set(e.pointerId, code)
			swipeStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })

			if (!isRightClick && !already) send(code, true)

			canvas.setAttribute('data-pressed', code)
			suspendControls()
			try {
				canvas.setPointerCapture(e.pointerId)
			} catch {}
			e.preventDefault()
			e.stopPropagation()
		},
		{ signal, passive: false } as any,
	)

	const end = (e: PointerEvent): void => {
		const code = active.get(e.pointerId)
		if (code) {
			active.delete(e.pointerId)
			if (code !== '__nudge') send(code, false)
			if (active.size === 0) {
				canvas.removeAttribute('data-pressed')
				resumeControls()
			}
		}
		const s = swipeStart.get(e.pointerId)
		swipeStart.delete(e.pointerId)
		if (s && performance.now() - s.t < 400 && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 80) {
			const ang = swipeNudge(e.clientX - s.x, e.clientY - s.y, NUDGE as any)
			if (ang !== null) host.nudge(ang, ang === NUDGE.back ? 2.0 : NUDGE.force)
		}
		try {
			canvas.releasePointerCapture(e.pointerId)
		} catch {}
	}

	canvas.addEventListener('pointerup', end as any, { signal, passive: false } as any)
	canvas.addEventListener('pointercancel', end as any, { signal, passive: false } as any)
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
		resumeControls()
	})
}

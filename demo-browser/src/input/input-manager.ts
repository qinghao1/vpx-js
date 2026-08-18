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
	readonly tickImmediate?: () => void
	log?(msg: string, level?: string): void
	enterPlayMode(): void
	exitPlayMode(): void
	togglePause(): void
	releaseKeys(codes: string[]): void
	requestMotionPermission?(): Promise<boolean>
}

const PLAY_CODES = new Set(CONTROL_SCHEME.flatMap(c => c.keys))

const FALLBACK_ZONES = { flipperSplit: 0.5 } as const

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
		get tickImmediate() {
			return (viewer._tickPhysicsImmediate as (() => void) | undefined) ?? undefined
		},
		get enableMotionButton() {
			return typeof document !== 'undefined'
				? (document.getElementById('enable-motion') as HTMLButtonElement | null)
				: null
		},
		log(msg: string, level?: string) {
			viewer.log?.(msg, level)
		},
		enterPlayMode() {
			if (viewer._switchToPlay) {
				viewer._switchToPlay()
			} else {
				viewer.viewerMode = 'play'
				viewer.player?.setPhysicsEnabled?.(true)
				viewer.enterPlayMode?.()
			}
		},
		exitPlayMode() {
			viewer._switchToViewer?.()
			viewer.exitPlayMode?.()
		},
		togglePause() {
			viewer.isPaused = !viewer.isPaused
			if (viewer.isPaused) viewer.player?.pause?.()
			else viewer.player?.resume?.()
			viewer.log?.(viewer.isPaused ? 'Paused (P to resume)' : 'Resumed', viewer.isPaused ? 'warn' : 'info')
		},
		releaseKeys(codes: string[]) {
			for (const code of codes) {
				viewer._sendKey?.(code, false)
				const key = keyForCode(code)
				const loc = locationForCode(code)
				const ev = { code, key, location: loc, ts: Date.now() } as any
				viewer.player?.onKeyUp?.(ev)
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
				host.player.onKeyDown(ev)
			} else {
				host.player.onKeyUp(ev)
			}
			host.tickImmediate?.()
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
	let hoverRaf = 0
	let hoverX = 0
	let hoverY = 0
	const swipeStart = new Map<number, { x: number; y: number; t: number }>()

	canvas.tabIndex = 0
	canvas.addEventListener('click', () => canvas.focus(), { signal })

	const zoneFor = (x: number, _y: number): string => {
		const r = canvas.getBoundingClientRect()
		if (!r.width) return 'ShiftLeft'
		return (x - r.left) / r.width < FALLBACK_ZONES.flipperSplit ? 'ShiftLeft' : 'ShiftRight'
	}

	const send = (code: string, down: boolean): void => {
		const key = keyForCode(code)
		const loc = locationForCode(code)
		const ev = { code, key, location: loc, ts: Date.now() } as any
		if (down) host.player?.onKeyDown(ev)
		else host.player?.onKeyUp(ev)
		if (host.physicsSab) {
			const dik = keyEventToDirectInputKey(ev)
			if (dik) pushInput(host.physicsSab, down ? 1 : 0, dik, Date.now())
		}
		host.tickImmediate?.()
	}

	const hitFor = (
		x: number,
		y: number,
		opts: { hover?: boolean } = {},
	): { code: string; obj: THREE.Object3D } | null => {
		if (opts.hover && typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches)
			return null
		if (!host.tableGroup || !host.camera || host.viewerMode !== 'play' || !host.player) return null
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

	function attachMobileControls(): void {
		const wrap = document.getElementById('mobile-controls') as HTMLElement | null
		if (!wrap) return
		for (const btn of wrap.querySelectorAll('button[data-code]')) {
			const code = (btn as HTMLElement).getAttribute('data-code')!
			const onDown = (e: PointerEvent) => {
				if (host.viewerMode !== 'play') {
					host.enterPlayMode()
					return
				}
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

	attachMobileControls()

	if ('onpointerrawupdate' in window) {
		canvas.addEventListener(
			'pointerrawupdate' as any,
			(e: PointerEvent) => {
				if (host.viewerMode !== 'play') return
				if (e.button !== 0) return
				const code = zoneFor(e.clientX, e.clientY)
				if (!active.has(e.pointerId)) {
					active.set(e.pointerId, code)
					send(code, true)
				}
			},
			{ signal } as any,
		)
	}
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
				const hitTable = hits.some((h: any) => {
					for (let o: any = h.object; o; o = o.parent) {
						const n = String(o.name || '').toLowerCase()
						if (n.includes('playfield') || n.includes('bm_') || n.includes('apron')) return true
						if (/vrcab|cabinet|lockbar|pincab/i.test(o.name || '')) return true
						if (/VRCab_(Cabinet|Backbox|LegsFront|LegsBack)/.test(o.name || '')) return true
					}
					return false
				})
				if (!hitTable) return
				host.enterPlayMode()
			}
			const isRightClick = e.button === 2
			const code = isRightClick ? '__nudge' : zoneFor(e.clientX, e.clientY)
			const already = active.has(e.pointerId)
			active.set(e.pointerId, code)
			swipeStart.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })

			if (!isRightClick && !already) send(code, true)

			canvas.setAttribute('data-pressed', code)
			if (host.controls) {
				const c: any = host.controls
				if (c._inputPrevEnabled == null) c._inputPrevEnabled = c.enabled
				c.enabled = false
			}
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
		if (!code) return
		active.delete(e.pointerId)

		if (code !== '__nudge') send(code, false)

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
					host.player?.nudge(ang, ang === NUDGE.back ? 2.0 : NUDGE.force)
				}
			}
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
		viewer._keyboardCtrl.abort()
	}
	viewer._keyboardCtrl = ctrl

	attachKeyboardHost(host, ctrl.signal)

	viewer.dom?.canvas?.focus?.()
	if (viewer.dom?.canvas) viewer.dom.canvas.tabIndex = 0

	return () => {
		ctrl.abort()
		if (viewer._keyboardCtrl === ctrl) viewer._keyboardCtrl = null
	}
}

export function attachPointerTouch(viewer: any): () => void {
	const host = toHost(viewer)
	const ctrl = new AbortController()

	if (viewer._pointerCtrl) {
		viewer._pointerCtrl.abort()
	}
	viewer._pointerCtrl = ctrl

	attachPointerHost(host, ctrl.signal)

	return () => {
		ctrl.abort()
		if (viewer._pointerCtrl === ctrl) viewer._pointerCtrl = null
		viewer._touchCleanup = null
	}
}

export function attachInputHost(host: InputHost, signal: AbortSignal): void {
	attachKeyboardHost(host, signal)
	attachPointerHost(host, signal)
}

import { NUDGE } from '../config.js'
import type { InputHost } from './input-manager.js'

function toNudgeHost(viewer: any): InputHost {
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
			return (viewer._buttonMeshes ?? null) as any
		},
		get physicsSab() {
			return (viewer._physicsSab ?? null) as any
		},
		get enableMotionButton() {
			return typeof document !== 'undefined'
				? (document.getElementById('enable-motion') as HTMLButtonElement | null)
				: null
		},
		log(msg: string, level?: string) {
			viewer.log?.(msg, level)
		},
		enterPlayMode() {},
		exitPlayMode() {},
		togglePause() {},
		releaseKeys() {},
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

function attachNudgeHost(host: InputHost, signal: AbortSignal): void {
	const trigger = (angle: number, force = NUDGE.force): void => {
		if (!host.player || host.viewerMode !== 'play') return
		host.player.nudge(angle, force)
	}

	let lastShake = 0
	const onMotion = (e: DeviceMotionEvent): void => {
		const a: any = (e as any).accelerationIncludingGravity ?? (e as any).acceleration
		if (!a) return
		const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0)
		if (mag < 18) return
		const now = performance.now()
		if (now - lastShake < 700) return
		lastShake = now
		trigger((a.x ?? 0) > 0 ? 285 : 75, 3.0)
	}

	const hasMotion = typeof DeviceMotionEvent !== 'undefined'
	const needsPermission = hasMotion && 'requestPermission' in (DeviceMotionEvent as any)
	if (hasMotion && !needsPermission) {
		window.addEventListener('devicemotion', onMotion as any, { signal } as any)
	} else if (needsPermission && host.enableMotionButton) {
		const btn = host.enableMotionButton
		btn.hidden = false
		btn.onclick = async () => {
			const granted = host.requestMotionPermission
				? await host.requestMotionPermission()
				: typeof DeviceMotionEvent !== 'undefined' &&
					'requestPermission' in (DeviceMotionEvent as any) &&
					(await (DeviceMotionEvent as any).requestPermission()) === 'granted'
			if (granted) {
				window.addEventListener('devicemotion', onMotion as any, { signal } as any)
				btn.hidden = true
				host.log?.('Motion nudge enabled', 'info')
			}
		}
		signal.addEventListener('abort', () => {
			if (host.enableMotionButton) host.enableMotionButton.onclick = null
		})
	}

	let raf = 0
	let lastPoll = 0
	const hasPad = (): boolean => !!navigator.getGamepads?.()?.some(p => !!p)

	const lastBy = new Map<string, number>()

	const loop = (t: number): void => {
		raf = requestAnimationFrame(loop)
		if (t - lastPoll < 33) return
		if (!hasPad()) return
		lastPoll = t

		const pads = navigator.getGamepads?.()
		if (!pads) return
		for (const gp of pads) {
			if (!gp) continue
			const now = performance.now()
			const btnKey = `b${gp.index}`
			const axisKey = `a${gp.index}`
			let ang: number | null = null
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

	if (hasPad()) raf = requestAnimationFrame(loop)
	window.addEventListener(
		'gamepadconnected',
		() => {
			if (!raf) raf = requestAnimationFrame(loop)
		},
		{ signal } as any,
	)
	signal.addEventListener('abort', () => {
		if (raf) cancelAnimationFrame(raf)
		raf = 0
	})
}

export function attachNudgeInput(viewer: any): () => void {
	const host = toNudgeHost(viewer)
	const ctrl = new AbortController()

	if (viewer._nudgeCtrl) {
		viewer._nudgeCtrl.abort()
	}
	viewer._nudgeCtrl = ctrl

	attachNudgeHost(host, ctrl.signal)

	return () => {
		ctrl.abort()
		if (viewer._nudgeCtrl === ctrl) viewer._nudgeCtrl = null
		viewer._nudgeCleanup = null
	}
}

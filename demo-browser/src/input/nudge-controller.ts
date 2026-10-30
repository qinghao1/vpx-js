import { NUDGE } from '../config.js'
import { type InputHost, makeHost } from './input-manager.js'

// The nudge host only shakes the cabinet: it never switches modes, pauses,
// or releases keys, so it carries the InputHost subset it actually uses.
type NudgeHost = Omit<InputHost, 'enterPlayMode' | 'exitPlayMode' | 'togglePause' | 'releaseKeys'>

function trigger(host: NudgeHost, angle: number, force = NUDGE.force): void {
	if (!host.player || host.viewerMode !== 'play') return
	host.player.nudge(angle, force)
}

function attachNudgeHost(host: NudgeHost, signal: AbortSignal): void {
	let lastShake = 0
	const onMotion = (e: DeviceMotionEvent): void => {
		const a: any = (e as any).accelerationIncludingGravity ?? (e as any).acceleration
		if (!a) return
		const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0)
		if (mag < 18) return
		const now = performance.now()
		if (now - lastShake < 700) return
		lastShake = now
		trigger(host, (a.x ?? 0) > 0 ? 285 : 75, 3.0)
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
}

interface NudgePadPoll {
	host: NudgeHost
	lastPoll: number
	lastBy: Map<string, number>
}

const padPolls = new WeakMap<object, NudgePadPoll>()

// Gamepad nudges run on the viewer's main rAF tick (play-mode only): a second
// loop just re-phases the same 33ms throttle against vsync and keeps polling
// getGamepads in viewer mode, where trigger() already no-ops every press.
export function pollNudgePads(viewer: object, now: number): void {
	const poll = padPolls.get(viewer)
	if (!poll) return
	const { host } = poll
	if (host.viewerMode !== 'play' || !host.player) return
	if (now - poll.lastPoll < 33) return
	if (!navigator.getGamepads?.()?.some(p => !!p)) return
	poll.lastPoll = now

	const pads = navigator.getGamepads?.()
	if (!pads) return
	for (const gp of pads) {
		if (!gp) continue
		const btnKey = `b${gp.index}`
		const axisKey = `a${gp.index}`
		let ang: number | null = null
		if (gp.buttons[4]?.pressed) ang = 75
		else if (gp.buttons[5]?.pressed) ang = 285
		else if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) ang = 0
		if (ang !== null) {
			const last = poll.lastBy.get(btnKey) ?? 0
			if (now - last >= 180) {
				trigger(host, ang, 2.8)
				poll.lastBy.set(btnKey, now)
			}
		}
		const ax0 = gp.axes[0] ?? 0
		const ax1 = gp.axes[1] ?? 0
		if (Math.abs(ax0) > 0.85 || Math.abs(ax1) > 0.85) {
			const last = poll.lastBy.get(axisKey) ?? 0
			if (now - last >= 300) {
				if (Math.abs(ax0) > Math.abs(ax1)) trigger(host, ax0 < 0 ? 75 : 285, 2.5)
				else trigger(host, ax1 < 0 ? 0 : 180, 2.2)
				poll.lastBy.set(axisKey, now)
			}
		}
	}
}

export function attachNudgeInput(viewer: any): () => void {
	const host = makeHost(viewer)
	const ctrl = new AbortController()

	if (viewer._nudgeCtrl) {
		viewer._nudgeCtrl.abort()
	}
	viewer._nudgeCtrl = ctrl

	attachNudgeHost(host, ctrl.signal)
	padPolls.set(viewer, { host, lastPoll: 0, lastBy: new Map() })

	return () => {
		ctrl.abort()
		padPolls.delete(viewer)
		if (viewer._nudgeCtrl === ctrl) viewer._nudgeCtrl = null
		viewer._nudgeCleanup = null
	}
}

// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Table } from '../vpt/table/table.js'
import { Event } from './event.js'
import {
	AssignKey,
	DIK_1,
	DIK_2,
	DIK_3,
	DIK_4,
	DIK_5,
	DIK_6,
	DIK_D,
	DIK_EQUALS,
	DIK_ESCAPE,
	DIK_F10,
	DIK_F11,
	DIK_LALT,
	DIK_LEFT,
	DIK_LCONTROL,
	DIK_LSHIFT,
	DIK_MINUS,
	DIK_O,
	DIK_Q,
	DIK_RCONTROL,
	DIK_RETURN,
	DIK_RIGHT,
	DIK_RSHIFT,
	DIK_SLASH,
	DIK_SPACE,
	DIK_T,
	DIK_Z,
} from './key-code.js'
import type { Player } from './player.js'

const LEFT_KEYS = new Set([DIK_LSHIFT, DIK_LCONTROL, DIK_LEFT])
const RIGHT_KEYS = new Set([DIK_RSHIFT, DIK_RCONTROL, DIK_RIGHT])

type KeyEvent = { code: number; down: boolean; ts: number }

/** DirectInput key queue — mirrors pininput.cpp. */
export class PinInput {
	private readonly queue: KeyEvent[] = []

	public readonly rgKeys: Record<number, number> = {
		[AssignKey.LeftFlipperKey]: DIK_LCONTROL,
		[AssignKey.RightFlipperKey]: DIK_RCONTROL,
		[AssignKey.LeftTiltKey]: DIK_Z,
		[AssignKey.RightTiltKey]: DIK_SLASH,
		[AssignKey.CenterTiltKey]: DIK_SPACE,
		[AssignKey.PlungerKey]: DIK_RETURN,
		[AssignKey.FrameCount]: DIK_F11,
		[AssignKey.DBGBalls]: DIK_O,
		[AssignKey.Debugger]: DIK_D,
		[AssignKey.AddCreditKey]: DIK_5,
		[AssignKey.AddCreditKey2]: DIK_4,
		[AssignKey.StartGameKey]: DIK_1,
		[AssignKey.MechanicalTilt]: DIK_T,
		[AssignKey.RightMagnaSave]: DIK_RSHIFT,
		[AssignKey.LeftMagnaSave]: DIK_LSHIFT,
		[AssignKey.ExitGame]: DIK_Q,
		[AssignKey.VolumeUp]: DIK_EQUALS,
		[AssignKey.VolumeDown]: DIK_MINUS,
		[AssignKey.LockbarKey]: DIK_LALT,
		[AssignKey.Enable3D]: DIK_F10,
		[AssignKey.Escape]: DIK_ESCAPE,
	}

	constructor(
		private readonly table: Table,
		private readonly player: Player,
	) {}

	onKeyDown(code: number, ts: number): void {
		this.queue.push({ code, down: true, ts })
	}

	onKeyUp(code: number, ts: number): void {
		this.queue.push({ code, down: false, ts })
	}

	processKeys(): void {
		while (this.queue.length) {
			const ev = this.queue.shift()!
			if (
				ev.code === this.rgKeys[AssignKey.FrameCount] ||
				ev.code === this.rgKeys[AssignKey.Enable3D] ||
				ev.code === this.rgKeys[AssignKey.DBGBalls]
			)
				continue
			this.fire(ev.down ? Event.GameEventsKeyDown : Event.GameEventsKeyUp, ev.code)
		}
	}

	private fire(dispid: Event, code: number): void {
		const isDown = dispid === Event.GameEventsKeyDown
		this.table.getApi().fireKeyEvent(dispid, code)
		this.syncFlippers(isDown, code)
		this.syncPlunger(isDown, code)
		this.syncCabinet(isDown, code)
	}

	private syncFlippers(isDown: boolean, code: number): void {
		const isLeftKey = code === this.rgKeys[AssignKey.LeftFlipperKey] || LEFT_KEYS.has(code)
		const isRightKey = code === this.rgKeys[AssignKey.RightFlipperKey] || RIGHT_KEYS.has(code)
		if (!isLeftKey && !isRightKey) return

		const flippers = Object.values(this.table.flippers)
		if (!flippers.length) return

		for (const flipper of flippers) {
			const name = flipper.getName().toLowerCase()
			const isRightFlipper = name.includes('right') || name === 'flipperr'
			if (flippers.length > 1) {
				if (isLeftKey && isRightFlipper) continue
				if (isRightKey && !isRightFlipper) continue
			}
			try {
				const api = flipper.getApi()
				isDown ? api.RotateToEnd() : api.RotateToStart()
			} catch {}
		}
	}

	private syncPlunger(isDown: boolean, code: number): void {
		if (code !== this.rgKeys[AssignKey.PlungerKey]) return
		const plungers = Object.values(this.table.plungers)
		if (!plungers.length) return
		for (const plunger of plungers) {
			try {
				const api = plunger.getApi()
				if (isDown) api.PullBack()
				else api.Fire()
			} catch {}
		}
		if (!isDown) this.tryMockLaunch()
	}

	private tryMockLaunch(): void {
		const balls = this.player.balls
		if (!balls.length) return
		const emu: any = this.player.getPhysics().emu
		const isRealReady = !!emu && !emu.isMock && !!emu.isInitialized?.()
		if (isRealReady) {
			const anyActive = balls.some((b) => !b.getState().isFrozen && b.hit.vel.length() > 5)
			if (anyActive) return
		}
		const kickers = Object.values(this.table.kickers)
		const troughNames = new Set(['sw18', 'sw19', 'sw20', 'sw21'])
		const troughCenters = kickers
			.filter((k) => troughNames.has(k.getName()))
			.map((k) => (k as unknown as { data: { center: { x: number; y: number } } }).data.center)
		let ballToLaunch: (typeof balls)[number] | undefined
		for (const b of balls) {
			const p = b.getState().pos
			for (const c of troughCenters) {
				const dx = p.x - c.x
				const dy = p.y - c.y
				if (dx * dx + dy * dy < 2500) {
					ballToLaunch = b
					break
				}
			}
			if (ballToLaunch) break
		}
		if (!ballToLaunch) ballToLaunch = balls.find((b) => b.getState().isFrozen)
		if (!ballToLaunch) return
		const inPlay = balls.some((b) => {
			if (b === ballToLaunch) return false
			const p = b.getState().pos
			const inTrough = troughCenters.some((c) => {
				const dx = p.x - c.x
				const dy = p.y - c.y
				return dx * dx + dy * dy < 2500
			})
			return !inTrough && !b.getState().isFrozen
		})
		if (inPlay) return
		for (const k of kickers) {
			try {
				const hit = (k as unknown as { hit?: { ball?: unknown } }).hit
				if (hit && (hit as unknown as { ball?: unknown }).ball === ballToLaunch) (hit as unknown as { ball?: unknown }).ball = undefined
			} catch {}
		}
		try { ballToLaunch.hit.vpVolObjs.length = 0 } catch {}
		ballToLaunch.getState().isFrozen = false
		ballToLaunch.hit.angularVelocity.setZero()
		ballToLaunch.hit.angularMomentum.setZero()
		const lane = this.table.plungers['Plunger'] ?? Object.values(this.table.plungers)[0]
		const lanePos = (lane as unknown as { data?: { center?: { x: number; y: number } } })?.data?.center
		if (lanePos) {
			ballToLaunch.getState().pos.set(lanePos.x, lanePos.y - 80, 30)
			ballToLaunch.hit.vel.set((Math.random() - 0.5) * 20, -950 - Math.random() * 100, 0)
		} else {
			ballToLaunch.getState().pos.set(460, 1100, 30)
			ballToLaunch.hit.vel.set(0, -750, 0)
		}
	}

	private syncCabinet(isDown: boolean, code: number): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		let targets: number[] | undefined
		if (code === DIK_1 || code === this.rgKeys[AssignKey.StartGameKey]) targets = [16, 13, 1]
		else if (code === DIK_2 || code === DIK_3) targets = [65, 1, 2, 3, 4]
		else if (code === DIK_4 || code === this.rgKeys[AssignKey.AddCreditKey2]) targets = [66, 2, 1, 65, 67]
		else if (code === DIK_5 || code === this.rgKeys[AssignKey.AddCreditKey]) targets = [67, 3, 1, 2, 65, 66, 68]
		else if (code === DIK_6) targets = [68, 4, 1, 67]
		if (!targets) return
		for (const sw of targets) {
			try {
				emu.setSwitchInput(sw, isDown)
			} catch {}
		}
	}
}

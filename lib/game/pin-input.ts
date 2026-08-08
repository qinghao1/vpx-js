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
	DIK_LCONTROL,
	DIK_LEFT,
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

const TROUGH_R2 = 2500

type KeyEvent = { code: number; down: boolean; ts: number }

function isTroughName(name: string): boolean {
	const s = name.toLowerCase()
	return s === 'sw18' || s === 'sw19' || s === 'sw20' || s === 'sw21'
}

function isLeftCode(code: number, leftKey: number): boolean {
	return code === leftKey || code === DIK_LSHIFT || code === DIK_LCONTROL || code === DIK_LEFT
}

function isRightCode(code: number, rightKey: number): boolean {
	return code === rightKey || code === DIK_RSHIFT || code === DIK_RCONTROL || code === DIK_RIGHT
}

/** DirectInput key queue — mirrors pininput.cpp. */
export class PinInput {
	private readonly queue: KeyEvent[] = []
	private troughCache?: Array<{ x: number; y: number }>
	private readonly flipperRight = new WeakMap<object, boolean>()

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
		const q = this.queue.splice(0)
		for (const ev of q) {
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
		const isLeft = isLeftCode(code, this.rgKeys[AssignKey.LeftFlipperKey])
		const isRight = isRightCode(code, this.rgKeys[AssignKey.RightFlipperKey])
		if (!isLeft && !isRight) return

		const flippers = Object.values(this.table.flippers)
		if (!flippers.length) return

		for (const flipper of flippers) {
			let isRightFlipper = this.flipperRight.get(flipper)
			if (isRightFlipper === undefined) {
				const n = flipper.getName().toLowerCase()
				isRightFlipper = n.includes('right') || n === 'flipperr'
				this.flipperRight.set(flipper, isRightFlipper)
			}
			if (flippers.length > 1) {
				if (isLeft && isRightFlipper) continue
				if (isRight && !isRightFlipper) continue
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
		const emu = this.player.getPhysics().emu as { isMock?: boolean; isInitialized?: () => boolean } | null
		if (emu && !emu.isMock && emu.isInitialized?.()) {
			if (balls.some((b) => !b.getState().isFrozen && b.hit.vel.length() > 5)) return
		}
		const centers = this.troughCenters()
		const ballToLaunch = this.findTroughBall(balls, centers) ?? balls.find((b) => b.getState().isFrozen)
		if (!ballToLaunch) return
		if (balls.some((b) => b !== ballToLaunch && !this.isInTrough(b, centers) && !b.getState().isFrozen)) return
		this.releaseFromKickers(ballToLaunch)
		this.launch(ballToLaunch)
	}

	private troughCenters(): Array<{ x: number; y: number }> {
		if (this.troughCache) return this.troughCache
		const centers = Object.values(this.table.kickers)
			.filter((k) => isTroughName(k.getName()))
			.map((k) => (k as unknown as { data: { center: { x: number; y: number } } }).data.center)
		this.troughCache = centers
		return centers
	}

	private findTroughBall(balls: typeof this.player.balls, centers: Array<{ x: number; y: number }>) {
		for (const b of balls) if (this.isInTrough(b, centers)) return b
		return undefined
	}

	private isInTrough(ball: (typeof this.player.balls)[number], centers: Array<{ x: number; y: number }>): boolean {
		const p = ball.getState().pos
		return centers.some((c) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < TROUGH_R2)
	}

	private releaseFromKickers(ball: (typeof this.player.balls)[number]): void {
		for (const k of Object.values(this.table.kickers)) {
			try {
				const hit = (k as unknown as { hit?: { ball?: unknown } }).hit
				if (hit?.ball === ball) hit.ball = undefined
			} catch {}
		}
		try {
			ball.hit.vpVolObjs.length = 0
		} catch {}
	}

	private launch(ball: (typeof this.player.balls)[number]): void {
		ball.getState().isFrozen = false
		ball.hit.angularVelocity.setZero()
		ball.hit.angularMomentum.setZero()
		const lane = this.table.plungers['Plunger'] ?? Object.values(this.table.plungers)[0]
		const c = (lane as unknown as { data?: { center?: { x: number; y: number } } })?.data?.center
		if (c) {
			ball.getState().pos.set(c.x, c.y - 80, 30)
			ball.hit.vel.set((Math.random() - 0.5) * 20, -950 - Math.random() * 100, 0)
		} else {
			ball.getState().pos.set(460, 1100, 30)
			ball.hit.vel.set(0, -750, 0)
		}
	}

	private syncCabinet(isDown: boolean, code: number): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		const targets = this.cabinetSwitches(code)
		if (!targets) return
		for (const sw of targets)
			try {
				emu.setSwitchInput(sw, isDown)
			} catch {}
	}

	private cabinetSwitches(code: number): number[] | undefined {
		if (code === DIK_1 || code === this.rgKeys[AssignKey.StartGameKey]) return [16, 13, 1]
		if (code === DIK_2 || code === DIK_3) return [65, 1, 2, 3, 4]
		if (code === DIK_4 || code === this.rgKeys[AssignKey.AddCreditKey2]) return [66, 2, 1, 65, 67]
		if (code === DIK_5 || code === this.rgKeys[AssignKey.AddCreditKey]) return [67, 3, 1, 2, 65, 66, 68]
		if (code === DIK_6) return [68, 4, 1, 67]
		return undefined
	}
}

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

type KeyEvent = { code: number; down: boolean; ts: number }

function isLeftCode(code: number, leftKey: number): boolean {
	return code === leftKey || code === DIK_LSHIFT || code === DIK_LCONTROL || code === DIK_LEFT
}

function isRightCode(code: number, rightKey: number): boolean {
	return code === rightKey || code === DIK_RSHIFT || code === DIK_RCONTROL || code === DIK_RIGHT
}

export class PinInput {
	private readonly queue: KeyEvent[] = []
	private readonly flipperRight = new WeakMap<object, boolean>()

	readonly rgKeys: Record<number, number> = {
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
		const queued = this.queue.splice(0)
		for (const ev of queued) {
			if (
				ev.code === this.rgKeys[AssignKey.FrameCount] ||
				ev.code === this.rgKeys[AssignKey.Enable3D] ||
				ev.code === this.rgKeys[AssignKey.DBGBalls]
			) {
				continue
			}
			this.fire(ev.down ? Event.GameEventsKeyDown : Event.GameEventsKeyUp, ev.code)
		}
	}

	private fire(dispId: Event, code: number): void {
		this.table.getApi().fireKeyEvent(dispId, code)
		const isDown = dispId === Event.GameEventsKeyDown
		this.syncFlippers(isDown, code)
		this.syncPlunger(isDown, code)
		this.syncCabinet(isDown, code)
		this.tryMockTroughEject(isDown, code)
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
				const name = flipper.getName().toLowerCase()
				isRightFlipper = name.includes('right') || name === 'flipperr'
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
	}

	private tryMockTroughEject(isDown: boolean, code: number): void {
		if (!isDown) return
		if (code !== DIK_1 && code !== this.rgKeys[AssignKey.StartGameKey]) return
		const emu = this.player.getPhysics().emu as unknown as {
			isMock?: boolean
			isInitialized?: () => boolean
		} | null
		if (emu && !emu.isMock && emu.isInitialized?.()) return
		const withBall = (
			Object.values(this.table.kickers) as unknown as Array<{
				hit?: { ball?: unknown }
				getApi(): { Kick(a: number, s: number): void; DestroyBall(): number }
				getName(): string
				data: { center: { x: number } }
			}>
		).filter(k => (k as any).hit?.ball)
		if (!withBall.length) {
			const plunger = Object.values(this.table.plungers)[0] as unknown as
				| { getApi(): { CreateBall(): unknown } }
				| undefined
			if (plunger)
				try {
					plunger.getApi().CreateBall()
				} catch {}
			return
		}
		withBall.sort((a, b) => b.data.center.x - a.data.center.x)
		const exit = withBall[0]!
		try {
			exit.getApi().Kick(60, 10)
		} catch {
			try {
				exit.getApi().DestroyBall()
				const plunger = Object.values(this.table.plungers)[0] as unknown as
					| { getApi(): { CreateBall(): unknown } }
					| undefined
				if (plunger) plunger.getApi().CreateBall()
			} catch {}
		}
	}

	private syncCabinet(isDown: boolean, code: number): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		const switches = this.cabinetSwitches(code)
		if (!switches) return
		for (const sw of switches) {
			try {
				emu.setSwitchInput(sw, isDown)
			} catch {}
		}
	}

	private cabinetSwitches(code: number): number[] | undefined {
		const k = this.rgKeys
		if (code === DIK_1 || code === k[AssignKey.StartGameKey]) return [16, 13, 1]
		if (code === DIK_2 || code === DIK_3) return [65, 1, 2, 3, 4]
		if (code === DIK_4 || code === k[AssignKey.AddCreditKey2]) return [66, 2, 1, 65, 67]
		if (code === DIK_5 || code === k[AssignKey.AddCreditKey]) return [67, 3, 1, 2, 65, 66, 68]
		if (code === DIK_6) return [68, 4, 1, 67]
		return undefined
	}
}

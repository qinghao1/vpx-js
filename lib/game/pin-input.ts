// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { NudgeHandler } from '../physics/cabinet/nudge-handler.js'
import { logger } from '../util/logger.js'
import type { Vertex2D } from '../util/vector.js'
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

type KeyEvent = { code: number; down: boolean }

const DEFAULT_KEYS: Readonly<Record<Exclude<AssignKey, AssignKey.CKeys>, number>> = {
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
} as const

const IGNORED_KEYS = new Set<number>([
	DEFAULT_KEYS[AssignKey.FrameCount],
	DEFAULT_KEYS[AssignKey.Enable3D],
	DEFAULT_KEYS[AssignKey.DBGBalls],
])

const LEFT_FALLBACKS = new Set<number>([DIK_LSHIFT, DIK_LCONTROL, DIK_LEFT])
const RIGHT_FALLBACKS = new Set<number>([DIK_RSHIFT, DIK_RCONTROL, DIK_RIGHT])

const SWITCH_START = [16, 13, 1] as const
const SWITCH_CREDIT_2_3 = [65, 1, 2, 3, 4] as const
const SWITCH_CREDIT_4 = [66, 2, 1, 65, 67] as const
const SWITCH_CREDIT_5 = [67, 3, 1, 2, 65, 66, 68] as const
const SWITCH_CREDIT_6 = [68, 4, 1, 67] as const

const TROUGH_KICK_ANGLE = 60
const TROUGH_KICK_SPEED = 10

function isLeftCode(code: number, leftKey: number): boolean {
	return code === leftKey || LEFT_FALLBACKS.has(code)
}

function isRightCode(code: number, rightKey: number): boolean {
	return code === rightKey || RIGHT_FALLBACKS.has(code)
}

export class PinInput {
	private readonly queue: KeyEvent[] = []
	private readonly pressed = new Set<number>()
	private readonly nudgeHandler = new NudgeHandler('cab', 1)

	readonly rgKeys: Record<number, number> = { ...DEFAULT_KEYS }

	constructor(
		private readonly table: Table,
		private readonly player: Player,
	) {}

	getKey(key: AssignKey): number {
		return this.rgKeys[key] ?? 0
	}

	setKey(key: AssignKey, dik: number): void {
		this.rgKeys[key] = dik
	}

	getNudgeHandler(): NudgeHandler {
		return this.nudgeHandler
	}

	getCabinetAcceleration(): Vertex2D {
		return this.nudgeHandler.getCabinetAcceleration()
	}

	getCabinetOffset(): Vertex2D {
		return this.nudgeHandler.getCabinetOffset()
	}

	tickNudge(): void {
		this.nudgeHandler.stepOneMillisecond()
	}

	nudge(angle: number, force: number): void {
		this.nudgeHandler.applyImpulse(angle, force)
	}

	onKeyDown(code: number, _ts?: number): void {
		this.queue.push({ code, down: true })
	}

	onKeyUp(code: number, _ts?: number): void {
		this.queue.push({ code, down: false })
	}

	processKeys(): void {
		if (!this.queue.length) return
		const queued = this.queue.splice(0, this.queue.length)
		for (const ev of queued) {
			if (IGNORED_KEYS.has(ev.code)) continue
			if (ev.down) {
				if (this.pressed.has(ev.code)) continue
				this.pressed.add(ev.code)
			} else {
				this.pressed.delete(ev.code)
			}
			this.fire(ev.down ? Event.GameEventsKeyDown : Event.GameEventsKeyUp, ev.code)
		}
	}

	private fire(dispId: Event, code: number): void {
		this.table.getApi().fireKeyEvent(dispId, code)
		const isDown = dispId === Event.GameEventsKeyDown
		this.syncFlippers(isDown, code)
		this.syncPlunger(isDown, code)
		this.syncNudge(isDown, code)
		this.syncCabinet(isDown, code)
		this.tryMockTroughEject(isDown, code)
	}

	private isRightFlipper(flipper: { getName(): string; data: { center: { x: number } } }): boolean {
		const name = flipper.getName().toLowerCase()
		if (name.includes('right') || name === 'flipperr') return true
		if (name.includes('left')) return false
		const d = this.table.data
		if (d && typeof d.left === 'number' && typeof d.right === 'number') {
			const mid = (d.left + d.right) / 2
			return flipper.data.center.x > mid
		}
		return false
	}

	private syncFlippers(isDown: boolean, code: number): void {
		const isLeft = isLeftCode(code, this.getKey(AssignKey.LeftFlipperKey))
		const isRight = isRightCode(code, this.getKey(AssignKey.RightFlipperKey))
		if (!isLeft && !isRight) return
		const flippers = Object.values(this.table.flippers) as Array<{
			getName(): string
			data: { center: { x: number } }
			getApi(): { RotateToEnd(): void; RotateToStart(): void }
		}>
		if (!flippers.length) return
		for (const flipper of flippers) {
			if (flippers.length > 1) {
				const isRightFlipper = this.isRightFlipper(flipper)
				if (isLeft && isRightFlipper) continue
				if (isRight && !isRightFlipper) continue
			}
			try {
				const api = flipper.getApi()
				if (isDown) api.RotateToEnd()
				else api.RotateToStart()
			} catch (err) {
				logger().warn('flipper sync failed %s', (err as Error).message)
			}
		}
	}

	private syncPlunger(isDown: boolean, code: number): void {
		if (code !== this.getKey(AssignKey.PlungerKey)) return
		const plungers = Object.values(this.table.plungers) as Array<{
			getApi(): { PullBack(): void; Fire(): void }
		}>
		if (!plungers.length) return
		for (const plunger of plungers) {
			try {
				const api = plunger.getApi()
				if (isDown) api.PullBack()
				else api.Fire()
			} catch (err) {
				logger().warn('plunger sync failed %s', (err as Error).message)
			}
		}
	}

	private syncNudge(isDown: boolean, code: number): void {
		if (!isDown) return
		const leftKey = this.getKey(AssignKey.LeftTiltKey)
		const rightKey = this.getKey(AssignKey.RightTiltKey)
		const centerKey = this.getKey(AssignKey.CenterTiltKey)
		if (code !== leftKey && code !== rightKey && code !== centerKey) return
		const baseForce = 2
		const angleVariance = (Math.random() - 0.5) * 15 * baseForce
		const force = (0.6 + Math.random() * 0.8) * baseForce
		let angle: number
		if (code === leftKey) angle = 75 + angleVariance
		else if (code === rightKey) angle = 285 + angleVariance
		else angle = angleVariance
		this.nudgeHandler.applyImpulse(angle, force)
	}

	private tryMockTroughEject(isDown: boolean, code: number): void {
		if (!isDown) return
		if (code !== DIK_1 && code !== this.getKey(AssignKey.StartGameKey)) return
		const emu = this.player.getPhysics().emu as unknown as {
			isMock?: boolean
			isInitialized?: () => boolean
		} | null
		if (emu && !emu.isMock && emu.isInitialized?.()) return
		const kickers = Object.values(this.table.kickers) as unknown as Array<{
			hit?: { ball?: unknown }
			getApi(): { Kick(a: number, s: number): void; DestroyBall(): number }
			getName(): string
			data: { center: { x: number } }
		}>
		const withBall = kickers.filter(k => (k as unknown as { hit?: { ball?: unknown } }).hit?.ball)
		if (!withBall.length) {
			const plunger = Object.values(this.table.plungers)[0] as unknown as
				| { getApi(): { CreateBall(): unknown } }
				| undefined
			if (plunger) {
				try {
					plunger.getApi().CreateBall()
				} catch (err) {
					logger().warn('mock trough CreateBall failed %s', (err as Error).message)
				}
			}
			return
		}
		withBall.sort((a, b) => b.data.center.x - a.data.center.x)
		const exit = withBall[0] as (typeof withBall)[number]
		if (!exit) return
		try {
			exit.getApi().Kick(TROUGH_KICK_ANGLE, TROUGH_KICK_SPEED)
		} catch {
			try {
				exit.getApi().DestroyBall()
				const plunger = Object.values(this.table.plungers)[0] as unknown as
					| { getApi(): { CreateBall(): unknown } }
					| undefined
				if (plunger) plunger.getApi().CreateBall()
			} catch (err) {
				logger().warn('mock trough fallback failed %s', (err as Error).message)
			}
		}
	}

	private syncCabinet(isDown: boolean, code: number): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		const switches = this.getCabinetSwitches(code)
		if (!switches) return
		for (const sw of switches) {
			try {
				emu.setSwitchInput(sw, isDown)
			} catch (err) {
				logger().warn('cabinet switch %s failed %s', sw, (err as Error).message)
			}
		}
	}

	private getCabinetSwitches(code: number): readonly number[] | undefined {
		if (code === DIK_1 || code === this.getKey(AssignKey.StartGameKey)) return SWITCH_START
		if (code === DIK_2 || code === DIK_3) return SWITCH_CREDIT_2_3
		if (code === DIK_4 || code === this.getKey(AssignKey.AddCreditKey2)) return SWITCH_CREDIT_4
		if (code === DIK_5 || code === this.getKey(AssignKey.AddCreditKey)) return SWITCH_CREDIT_5
		if (code === DIK_6) return SWITCH_CREDIT_6
		return undefined
	}
}

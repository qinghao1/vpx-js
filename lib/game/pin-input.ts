// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../math/vector.js'
import { NudgeHandler } from '../physics/cabinet/nudge-handler.js'
import type { Table } from '../vpt/table/table.js'
import { Event } from './event.js'
import {
	AssignKey,
	DIK_1,
	DIK_4,
	DIK_5,
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

const DEFAULT_KEYS: Record<number, number> = {
	[AssignKey.LeftFlipperKey]: DIK_LSHIFT,
	[AssignKey.RightFlipperKey]: DIK_RSHIFT,
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
	[AssignKey.RightMagnaSave]: DIK_RCONTROL,
	[AssignKey.LeftMagnaSave]: DIK_LCONTROL,
	[AssignKey.ExitGame]: DIK_Q,
	[AssignKey.VolumeUp]: DIK_EQUALS,
	[AssignKey.VolumeDown]: DIK_MINUS,
	[AssignKey.LockbarKey]: DIK_LALT,
	[AssignKey.Enable3D]: DIK_F10,
	[AssignKey.Escape]: DIK_ESCAPE,
}

// Cabinet switch ids for the emu (VPM-style numbers, vpx-js-defined — upstream
// InputManager.cpp holds no such tables). Coin keys are script-only: no entry
// below means no emu switch moves, so a script that ignores coin keys takes no coins.
// Start has no entry either: the table script maps StartGameKey to its own
// system's switch, and only the script knows that number.
const SWITCH_FLIPPER_L = [84, 114] as const
// 112/114 are the lower buttons; 116/118 (upper) stay script-driven via the
// staged-flipper path, so plain presses must not assert them.
const SWITCH_FLIPPER_R = [82, 86, 112] as const

const TROUGH_KICK_ANGLE = 60
const TROUGH_KICK_SPEED = 10

export class PinInput {
	/**
	 * Default for freePlay. Set to false before creating the Player to disable the
	 * vpx-js-only mock trough eject (none exists upstream; free play itself is a
	 * ROM setting). It runs on the physics clock, so pausing the game pauses it.
	 */
	public static freePlayDefault = true

	private readonly queue: KeyEvent[] = []
	private readonly pressed = new Set<number>()
	private readonly nudgeHandler = new NudgeHandler()
	private randomSource: () => number = Math.random

	/** Override the RNG for keyboard-nudge variance (tests seed it; default Math.random). */
	public setRandomSource(random: () => number): void {
		this.randomSource = random
	}

	readonly rgKeys: Record<number, number> = { ...DEFAULT_KEYS }
	public freePlay = PinInput.freePlayDefault

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

	onKeyDown(code: number): void {
		this.queue.push({ code, down: true })
	}

	onKeyUp(code: number): void {
		this.queue.push({ code, down: false })
	}

	processKeys(): void {
		if (!this.queue.length) return
		const queued = this.queue.splice(0, this.queue.length)
		// Upstream parity (InputManager::PushButtonEvent): every mapped key reaches
		// script KeyDown/KeyUp, including FrameCount/Enable3D/DBGBalls. Unmapped
		// keys (dik == 0) never fire; held-key repeats fire once (pressed guard below).
		for (const ev of queued) {
			if (ev.code === 0) continue
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
		const prevNudgeIndex = this.nudgeHandler.getIndex()
		this.table.getApi().fireKeyEvent(dispId, code)
		const isDown = dispId === Event.GameEventsKeyDown
		// Script-only contract (C-P1-1, upstream parity): flipper and plunger keys
		// only reach the table script via KeyDown/KeyUp. Upstream InputManager::
		// PushButtonEvent merely FireDispID()s DISPID_GameEvents_KeyDown/KeyUp
		// (src/input/InputManager.cpp); rotation/pull/fire happen only when the
		// script calls Flipper::RotateToEnd/Start or Plunger PullBack/Fire
		// (src/parts/flipper.cpp). Never drive them directly from input here.
		this.syncNudge(isDown, code, prevNudgeIndex)
		this.syncCabinet(isDown, code)
		this.tryMockTroughEject(isDown, code)
	}

	private syncNudge(isDown: boolean, code: number, prevIndex: number): void {
		if (!isDown) return
		if (prevIndex !== this.nudgeHandler.getIndex()) return
		const leftKey = this.getKey(AssignKey.LeftTiltKey)
		const rightKey = this.getKey(AssignKey.RightTiltKey)
		const centerKey = this.getKey(AssignKey.CenterTiltKey)
		if (code !== leftKey && code !== rightKey && code !== centerKey) return
		const baseForce = 2
		const angleVariance = (this.randomSource() - 0.5) * 15 * baseForce
		const force = (0.6 + this.randomSource() * 0.8) * baseForce
		let angle: number
		if (code === leftKey) angle = 75 + angleVariance
		else if (code === rightKey) angle = 285 + angleVariance
		else angle = angleVariance
		this.nudgeHandler.applyImpulse(angle, force)
	}

	private tryMockTroughEject(isDown: boolean, code: number): void {
		if (!isDown || !this.freePlay) return
		// Mapped Start key only: a hardcoded DIK_1 here would keep the physical
		// "1" key acting as Start after the user remaps StartGameKey elsewhere.
		if (code !== this.getKey(AssignKey.StartGameKey)) return
		const emu = this.player.getPhysics().emu as unknown as {
			isMock?: boolean
			isInitialized?: () => boolean
		} | null
		if (emu && !emu.isMock && emu.isInitialized?.()) return
		// No array allocs on this per-keypress path: single for-in pass, keep the
		// rightmost ball-holding kicker as the trough exit.
		const kickers = this.table.kickers as unknown as Record<
			string,
			{
				hit?: { ball?: unknown }
				getApi(): { Kick(a: number, s: number): void; DestroyBall(): number }
				getName(): string
				data: { center: { x: number } }
			}
		>
		let exit: (typeof kickers)[string] | undefined
		for (const name in kickers) {
			const kicker = kickers[name]
			if (!kicker.hit?.ball) continue
			if (!exit || kicker.data.center.x > exit.data.center.x) exit = kicker
		}
		if (!exit) {
			for (const name in this.table.plungers) {
				const plunger = this.table.plungers[name] as unknown as { getApi(): { CreateBall(): unknown } }
				plunger.getApi().CreateBall()
				break
			}
			return
		}
		exit.getApi().Kick(TROUGH_KICK_ANGLE, TROUGH_KICK_SPEED)
	}

	private syncCabinet(isDown: boolean, code: number): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		const switches = this.getCabinetSwitches(code)
		if (!switches) return
		for (const sw of switches) {
			emu.setSwitchInput(sw, isDown)
		}
	}

	private getCabinetSwitches(code: number): readonly number[] | undefined {
		const leftKey = this.getKey(AssignKey.LeftFlipperKey)
		const rightKey = this.getKey(AssignKey.RightFlipperKey)
		if (code === leftKey || code === DIK_LEFT) return SWITCH_FLIPPER_L
		if (code === rightKey || code === DIK_RIGHT) return SWITCH_FLIPPER_R
		return undefined
	}
}

// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex2D } from '../math/vector.js'
import { NudgeHandler } from '../physics/cabinet/nudge-handler.js'
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
type ScheduledAction = { due: number; run: () => void }

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
// InputManager.cpp holds no such tables); free-play coin search mirrors
// Jakobud/freeplay MAME plugin (init.lua: search ioport fields by name "Free Play"):
// we search tableScript for "Const swCoin* = N" by name (driver-agnostic) and use the
// script's AddCreditKey path (vpmKeyDown -> PulseSw) plus a tiny direct pulse for timing.
const SWITCH_START = [16, 13, 1] as const
const SWITCH_CREDIT_2_3 = [65, 1, 2, 3, 4] as const
const SWITCH_CREDIT_4 = [66, 2, 1, 65, 67] as const
const SWITCH_CREDIT_5 = [67, 3, 1, 2, 65, 66, 68] as const
const SWITCH_CREDIT_6 = [68, 4, 1, 67] as const
const SWITCH_FLIPPER_L = [84, 114, 112] as const
const SWITCH_FLIPPER_R = [82, 86, 112, 116] as const

const TROUGH_KICK_ANGLE = 60
const TROUGH_KICK_SPEED = 10

// Free-play credit timings in physics ms: switch pulse width, stagger between credits.
const CREDIT_PULSE_MS = 120
const CREDIT_STAGGER_MS = 250

export class PinInput {
	/**
	 * Default for freePlay. Set to false before creating the Player to disable the
	 * vpx-js-only free-play helpers (none exists upstream): coin-switch pulses on
	 * Start and mock trough eject. All run on the physics clock, so pausing the
	 * game pauses them.
	 */
	public static freePlayDefault = true

	private readonly queue: KeyEvent[] = []
	private readonly pressed = new Set<number>()
	private readonly nudgeHandler = new NudgeHandler()
	private scheduled: ScheduledAction[] = []
	private randomSource: () => number = Math.random

	/** Override the RNG for keyboard-nudge variance (tests seed it; default Math.random). */
	public setRandomSource(random: () => number): void {
		this.randomSource = random
	}

	readonly rgKeys: Record<number, number> = { ...DEFAULT_KEYS }
	public freePlay = PinInput.freePlayDefault
	private cachedCoinSwitches: number[] | null = null

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

	private now(): number {
		return this.player.getGameTime()
	}

	private schedule(delayMs: number, run: () => void): void {
		this.scheduled.push({ due: this.now() + delayMs, run })
	}

	private runDue(): void {
		if (!this.scheduled.length) return
		const now = this.now()
		const pending: ScheduledAction[] = []
		const due: ScheduledAction[] = []
		for (const action of this.scheduled) (action.due <= now ? due : pending).push(action)
		if (!due.length) return
		this.scheduled = pending
		for (const action of due) action.run()
	}

	private pulseSwitches(switches: readonly number[]): void {
		const emu = this.player.getPhysics().emu
		if (!emu) return
		for (const sw of switches) {
			emu.setSwitchInput(sw, true)
		}
		this.schedule(CREDIT_PULSE_MS, () => {
			for (const sw of switches) {
				emu.setSwitchInput(sw, false)
			}
		})
	}

	private discoverCoinSwitches(): number[] {
		if (this.cachedCoinSwitches) return this.cachedCoinSwitches
		const script = (this.table as unknown as { tableScript?: string }).tableScript ?? ''
		const re = /Const\s+swCoin\d*\s*=\s*(-?\d+)/gi
		const seen = new Set<number>()
		const out: number[] = []
		let m: RegExpExecArray | null
		while ((m = re.exec(script))) {
			const v = Number.parseInt(m[1] ?? '', 10)
			if (Number.isFinite(v) && v >= 0 && !seen.has(v)) {
				seen.add(v)
				out.push(v)
			}
		}
		this.cachedCoinSwitches = out.length ? out : [65, 1, 2]
		return this.cachedCoinSwitches
	}

	public addCredit(count = 1): void {
		const key = this.getKey(AssignKey.AddCreditKey)
		const direct = this.discoverCoinSwitches().slice(0, 3)
		for (let index = 0; index < count; index++) {
			this.schedule(index * CREDIT_STAGGER_MS, () => {
				this.onKeyDown(key)
				this.schedule(CREDIT_PULSE_MS, () => this.onKeyUp(key))
				this.pulseSwitches(direct)
			})
		}
	}

	onKeyDown(code: number): void {
		this.queue.push({ code, down: true })
	}

	onKeyUp(code: number): void {
		this.queue.push({ code, down: false })
	}

	processKeys(): void {
		this.runDue()
		if (!this.queue.length) return
		const queued = this.queue.splice(0, this.queue.length)
		// Upstream parity (InputManager::PushButtonEvent): every keyboard key reaches
		// script KeyDown/KeyUp, including FrameCount/Enable3D/DBGBalls — nothing is swallowed.
		for (const ev of queued) {
			// Upstream PushButtonEvent drops unmapped keys (dik == 0, InputManager.cpp).
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
		if (this.freePlay && isDown && code === this.getKey(AssignKey.StartGameKey)) {
			this.pulseSwitches(this.discoverCoinSwitches())
		}
		const switches = this.getCabinetSwitches(code)
		if (!switches) return
		for (const sw of switches) {
			emu.setSwitchInput(sw, isDown)
		}
	}

	private getCabinetSwitches(code: number): readonly number[] | undefined {
		if (code === this.getKey(AssignKey.StartGameKey)) return SWITCH_START
		if (code === DIK_2 || code === DIK_3) return SWITCH_CREDIT_2_3
		if (code === DIK_4 || code === this.getKey(AssignKey.AddCreditKey2)) return SWITCH_CREDIT_4
		if (code === DIK_5 || code === this.getKey(AssignKey.AddCreditKey)) return SWITCH_CREDIT_5
		if (code === DIK_6) return SWITCH_CREDIT_6
		const leftKey = this.getKey(AssignKey.LeftFlipperKey)
		const rightKey = this.getKey(AssignKey.RightFlipperKey)
		if (code === leftKey || code === DIK_LEFT) return SWITCH_FLIPPER_L
		if (code === rightKey || code === DIK_RIGHT) return SWITCH_FLIPPER_R
		return undefined
	}
}

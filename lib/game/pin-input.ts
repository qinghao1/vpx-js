// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

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
	DIK_LSHIFT,
	DIK_MINUS,
	DIK_O,
	DIK_Q,
	DIK_RCONTROL,
	DIK_RETURN,
	DIK_RSHIFT,
	DIK_SLASH,
	DIK_SPACE,
	DIK_T,
	DIK_Z,
} from './key-code.js'
import type { Player } from './player.js'

const LEFT_KEYS = new Set([DIK_LSHIFT, DIK_LCONTROL])
const RIGHT_KEYS = new Set([DIK_RSHIFT, DIK_RCONTROL])

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
			const ev = this.queue.pop()!
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
		this.table.getApi().fireKeyEvent(dispid, code)
		this.syncFlippers(dispid === Event.GameEventsKeyDown, code)
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
}

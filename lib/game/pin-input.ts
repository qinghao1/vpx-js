// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { Pool } from '../util/object-pool.js'
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

const APP_KEYBOARD = 0

/** DirectInput key queue.
 * @see https://github.com/vpinball/vpinball/blob/master/pininput.cpp */
export class PinInput {
	private readonly diq: DirectInputDeviceObjectData[] = []

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

	public onKeyDown(dkCode: number, timestamp: number): void {
		this.diq.push(DirectInputDeviceObjectData.claim(dkCode, 0x80, timestamp))
	}

	public onKeyUp(dkCode: number, timestamp: number): void {
		this.diq.push(DirectInputDeviceObjectData.claim(dkCode, 0x0, timestamp))
	}

	/** Drains queue and forwards key events. */
	public processKeys(): void {
		let input: DirectInputDeviceObjectData | undefined
		while ((input = this.diq.pop())) {
			if (input.dwSequence === APP_KEYBOARD) {
				const special =
					input.dwOfs === this.rgKeys[AssignKey.FrameCount] ||
					input.dwOfs === this.rgKeys[AssignKey.Enable3D] ||
					input.dwOfs === this.rgKeys[AssignKey.DBGBalls]
				if (!special)
					this.fireKeyEvent(input.dwData & 0x80 ? Event.GameEventsKeyDown : Event.GameEventsKeyUp, input.dwOfs)
			}
			DirectInputDeviceObjectData.release(input)
		}
	}

	private fireKeyEvent(dispid: Event, keycode: number): void {
		this.table.getApi().fireKeyEvent(dispid, keycode)
	}
}

class DirectInputDeviceObjectData {
	public static readonly POOL = new Pool(DirectInputDeviceObjectData)
	public dwOfs = 0
	public dwData = 0
	public dwTimeStamp = 0
	public dwSequence = APP_KEYBOARD

	public set(dwOfs: number, dwData: number, dwTimeStamp: number): this {
		this.dwOfs = dwOfs
		this.dwData = dwData
		this.dwTimeStamp = dwTimeStamp
		return this
	}

	public static claim(dwOfs: number, dwData: number, dwTimeStamp: number): DirectInputDeviceObjectData {
		return DirectInputDeviceObjectData.POOL.get().set(dwOfs, dwData, dwTimeStamp)
	}

	public static release(...items: DirectInputDeviceObjectData[]): void {
		for (const item of items) DirectInputDeviceObjectData.POOL.release(item)
	}
}

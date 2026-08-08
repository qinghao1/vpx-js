// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import type { Table } from '../vpt/table/table.js'
import { Event } from './event.js'
import { AssignKey, DIK_1, DIK_2, DIK_3, DIK_4, DIK_5, DIK_6, DIK_D, DIK_EQUALS, DIK_ESCAPE, DIK_F10, DIK_F11, DIK_LALT, DIK_LCONTROL, DIK_LEFT, DIK_LSHIFT, DIK_MINUS, DIK_O, DIK_Q, DIK_RCONTROL, DIK_RETURN, DIK_RIGHT, DIK_RSHIFT, DIK_SLASH, DIK_SPACE, DIK_T, DIK_Z } from './key-code.js'
import type { Player } from './player.js'

export class PinInput {
	private queue: { code: number; down: boolean; ts: number }[] = []
	private flipperRight = new WeakMap<object, boolean>()

	readonly rgKeys: Record<number, number> = {
		[AssignKey.LeftFlipperKey]: DIK_LCONTROL, [AssignKey.RightFlipperKey]: DIK_RCONTROL, [AssignKey.LeftTiltKey]: DIK_Z, [AssignKey.RightTiltKey]: DIK_SLASH,
		[AssignKey.CenterTiltKey]: DIK_SPACE, [AssignKey.PlungerKey]: DIK_RETURN, [AssignKey.FrameCount]: DIK_F11, [AssignKey.DBGBalls]: DIK_O,
		[AssignKey.Debugger]: DIK_D, [AssignKey.AddCreditKey]: DIK_5, [AssignKey.AddCreditKey2]: DIK_4, [AssignKey.StartGameKey]: DIK_1,
		[AssignKey.MechanicalTilt]: DIK_T, [AssignKey.RightMagnaSave]: DIK_RSHIFT, [AssignKey.LeftMagnaSave]: DIK_LSHIFT, [AssignKey.ExitGame]: DIK_Q,
		[AssignKey.VolumeUp]: DIK_EQUALS, [AssignKey.VolumeDown]: DIK_MINUS, [AssignKey.LockbarKey]: DIK_LALT, [AssignKey.Enable3D]: DIK_F10, [AssignKey.Escape]: DIK_ESCAPE,
	}

	constructor(private readonly table: Table, private readonly player: Player) {}

	onKeyDown(code: number, ts: number): void { this.queue.push({ code, down: true, ts }) }
	onKeyUp(code: number, ts: number): void { this.queue.push({ code, down: false, ts }) }

	processKeys(): void {
		while (this.queue.length) {
			const ev = this.queue.shift()!
			if (ev.code === this.rgKeys[AssignKey.FrameCount] || ev.code === this.rgKeys[AssignKey.Enable3D] || ev.code === this.rgKeys[AssignKey.DBGBalls]) continue
			this.fire(ev.down ? Event.GameEventsKeyDown : Event.GameEventsKeyUp, ev.code)
		}
	}

	private fire(dispid: Event, code: number): void {
		this.table.getApi().fireKeyEvent(dispid, code)
		const down = dispid === Event.GameEventsKeyDown
		this.syncFlippers(down, code); this.syncPlunger(down, code); this.syncCabinet(down, code)
	}

	private syncFlippers(down: boolean, code: number): void {
		const isLeft = (c: number, k: number) => c === k || c === DIK_LSHIFT || c === DIK_LCONTROL || c === DIK_LEFT
		const isRight = (c: number, k: number) => c === k || c === DIK_RSHIFT || c === DIK_RCONTROL || c === DIK_RIGHT
		const left = isLeft(code, this.rgKeys[AssignKey.LeftFlipperKey]), right = isRight(code, this.rgKeys[AssignKey.RightFlipperKey])
		if (!left && !right) return
		for (const f of Object.values(this.table.flippers)) {
			let r = this.flipperRight.get(f)
			if (r === undefined) { r = f.getName().toLowerCase().includes('right') || f.getName().toLowerCase() === 'flipperr'; this.flipperRight.set(f, r) }
			if (Object.values(this.table.flippers).length > 1) { if (left && r) continue; if (right && !r) continue }
			try { const a = f.getApi(); down ? a.RotateToEnd() : a.RotateToStart() } catch {}
		}
	}

	private syncPlunger(down: boolean, code: number): void {
		if (code !== this.rgKeys[AssignKey.PlungerKey]) return
		for (const p of Object.values(this.table.plungers)) try { const a = p.getApi(); down ? a.PullBack() : a.Fire() } catch {}
	}

	private syncCabinet(down: boolean, code: number): void {
		const emu = this.player.getPhysics().emu; if (!emu) return
		const sw = this.cabinetSwitches(code); if (!sw) return
		for (const s of sw) try { emu.setSwitchInput(s, down) } catch {}
	}

	private cabinetSwitches(code: number): number[] | undefined {
		const k = this.rgKeys
		if (code === DIK_1 || code === k[AssignKey.StartGameKey]) return [16,13,1]
		if (code === DIK_2 || code === DIK_3) return [65,1,2,3,4]
		if (code === DIK_4 || code === k[AssignKey.AddCreditKey2]) return [66,2,1,65,67]
		if (code === DIK_5 || code === k[AssignKey.AddCreditKey]) return [67,3,1,2,65,66,68]
		if (code === DIK_6) return [68,4,1,67]
	}
}

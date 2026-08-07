// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { WpcEmuWebWorkerApi } from 'wpc-emu'
import { VbsArray } from '../scripting/vbs-array.js'
import { OffsetIndex } from './offset-index.js'

const empty = (n = 64): Uint8Array => new Uint8Array(n).fill(0)

/** WPC-EMU state transform. */
export class EmulatorState {
	private currentLampState: Uint8Array = empty()
	private currentSolenoidState: Uint8Array = empty()
	private currentGIState: Uint8Array = empty()
	private lastSentLampState: Uint8Array = empty()
	private lastSentSolenoidState: Uint8Array = empty()
	private lastSentGIState: Uint8Array = empty()
	private dmdScreen = new Uint8Array()
	private switchState = new Uint8Array()

	public updateState(s: WpcEmuWebWorkerApi.EmuStateAsic): void {
		if (s.wpc.lampState) this.currentLampState = this.normalize(s.wpc.lampState as any) as any
		if (s.wpc.solenoidState) this.currentSolenoidState = s.wpc.solenoidState as any
		if (s.wpc.generalIlluminationState) this.currentGIState = s.wpc.generalIlluminationState as any
		if (s.dmd.dmdShadedBuffer) this.dmdScreen = s.dmd.dmdShadedBuffer as any
		if (s.wpc.inputSwitchMatrixActiveColumn) this.switchState = s.wpc.inputSwitchMatrixActiveColumn as any
	}

	public getSwitchState(o: OffsetIndex): number {
		return this.switchState[o.zeroBasedIndex] ?? 0
	}
	public getLampState(o: OffsetIndex): number {
		return this.currentLampState[o.zeroBasedIndex] ?? 0
	}
	public getSolenoidState(i: number): number {
		return this.currentSolenoidState[i + 1] ?? 0
	}
	public getGIState(i: number): number {
		return this.currentGIState[i + 1] ?? 0
	}

	public getChangedLamps(): VbsArray<number[]> {
		const diff = this.diff(this.lastSentLampState, this.currentLampState, OffsetIndex.mapIndexToMatrixIndex)
		this.lastSentLampState = this.currentLampState
		return new VbsArray(diff)
	}
	public getChangedSolenoids(): number[][] {
		const diff = this.diff(this.lastSentSolenoidState, this.currentSolenoidState, (i) => i + 1)
		this.lastSentSolenoidState = this.currentSolenoidState
		return diff
	}
	public getChangedGI(): number[][] {
		const diff = this.diff(this.lastSentGIState, this.currentGIState, (i) => i + 1)
		this.lastSentGIState = this.currentGIState
		return diff
	}
	public getChangedLEDs(): number[][] {
		return []
	}
	public getDmdScreen(): Uint8Array {
		return this.dmdScreen
	}

	private normalize(v: Uint8Array): Uint8Array {
		return v.map((x) => (x > 127 ? 1 : 0)) as any
	}
	private diff(last: Uint8Array, cur: Uint8Array, map: (i: number) => number): number[][] {
		const out: number[][] = []
		for (let i = 0; i < cur.length; i++) if (last[i] !== cur[i]) out.push([map(i), cur[i]])
		return out
	}
}

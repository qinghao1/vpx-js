// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { WpcEmuWebWorkerApi } from 'wpc-emu'
import { VbsArray } from '../scripting/vbs-array.js'
import { OffsetIndex } from './offset-index.js'

const empty = (n = 64) => new Uint8Array(n)

export class EmulatorState {
	private lamps = empty()
	private lastLamps = empty()
	private sols = empty()
	private lastSols = empty()
	private gis = empty()
	private lastGis = empty()
	private dmd = new Uint8Array()
	private switches = new Uint8Array()

	private lampMap: (i: number) => number = OffsetIndex.mapIndexToMatrixIndex
	private solMap: (i: number) => number = i => i + 1

	updateState(s: WpcEmuWebWorkerApi.EmuStateAsic): void {
		this.lampMap = OffsetIndex.mapIndexToMatrixIndex
		this.solMap = i => i + 1
		if (s.wpc.lampState) this.lamps = Uint8Array.from(s.wpc.lampState, x => (x > 127 ? 1 : 0))
		if (s.wpc.solenoidState) this.sols = s.wpc.solenoidState.slice()
		if (s.wpc.generalIlluminationState) this.gis = s.wpc.generalIlluminationState.slice()
		if (s.dmd.dmdShadedBuffer) this.dmd = s.dmd.dmdShadedBuffer.slice()
		if (s.wpc.inputSwitchMatrixActiveColumn) this.switches = s.wpc.inputSwitchMatrixActiveColumn.slice()
	}

	applyPinmame(lamps: Uint8Array, sols: Uint8Array, gis: Uint8Array): void {
		this.lampMap = i => i
		this.solMap = i => i
		this.lamps = lamps.slice()
		this.sols = sols.slice()
		this.gis = gis.slice()
	}

	setDmd(frame: Uint8Array): void {
		this.dmd = frame.slice()
	}

	getSwitchState(o: OffsetIndex): number {
		return this.switches[o.zeroBasedIndex] ?? 0
	}
	getLampState(o: OffsetIndex): number {
		return this.lamps[o.zeroBasedIndex] ?? 0
	}
	getLampStateDirect(n: number): number {
		return this.lamps[n] ?? 0
	}
	getSolenoidState(i: number): number {
		return this.sols[this.solMap(i)] ?? 0
	}
	getGIState(i: number): number {
		return this.gis[this.solMap(i)] ?? 0
	}

	getChangedLamps(): VbsArray<number[]> {
		const d = this.diff(this.lastLamps, this.lamps, this.lampMap)
		this.lastLamps = this.lamps.slice()
		return new VbsArray(d)
	}
	getChangedSolenoids(): number[][] {
		const d = this.diff(this.lastSols, this.sols, this.solMap)
		this.lastSols = this.sols.slice()
		return d
	}
	getChangedGI(): number[][] {
		const d = this.diff(this.lastGis, this.gis, this.solMap)
		this.lastGis = this.gis.slice()
		return d
	}
	getChangedLEDs(): number[][] {
		return []
	}
	getDmdScreen(): Uint8Array {
		return this.dmd
	}

	private diff(last: Uint8Array, cur: Uint8Array, map: (i: number) => number): number[][] {
		const out: number[][] = []
		const n = Math.max(last.length, cur.length)
		for (let i = 0; i < n; i++) {
			const a = last[i] ?? 0
			const b = cur[i] ?? 0
			if (a !== b) out.push([map(i), b])
		}
		return out
	}
}

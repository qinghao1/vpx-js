// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { WpcEmuWebWorkerApi } from 'wpc-emu'
import { VbsArray } from '../scripting/vbs-array.js'
import { OffsetIndex } from './offset-index.js'

const empty = (n = 64) => new Uint8Array(n)

/** Mirrors WPC emu RAM to VBS-visible lamp/solenoid/GI/DMD state. */
export class EmulatorState {
	private lamps: Uint8Array = empty()
	private sols: Uint8Array = empty()
	private gis: Uint8Array = empty()
	private lastLamps: Uint8Array = empty()
	private lastSols: Uint8Array = empty()
	private lastGis: Uint8Array = empty()
	private dmd: Uint8Array = new Uint8Array()
	private switches: Uint8Array = new Uint8Array()

	updateState(s: WpcEmuWebWorkerApi.EmuStateAsic): void {
		if (s.wpc.lampState) this.lamps = this.normalize(s.wpc.lampState as unknown as Uint8Array)
		if (s.wpc.solenoidState) this.sols = s.wpc.solenoidState as unknown as Uint8Array
		if (s.wpc.generalIlluminationState) this.gis = s.wpc.generalIlluminationState as unknown as Uint8Array
		if (s.dmd.dmdShadedBuffer) this.dmd = s.dmd.dmdShadedBuffer as unknown as Uint8Array
		if (s.wpc.inputSwitchMatrixActiveColumn)
			this.switches = s.wpc.inputSwitchMatrixActiveColumn as unknown as Uint8Array
	}

	applyPinmame(lamps: Uint8Array, sols: Uint8Array, gis: Uint8Array): void {
		this.lamps = lamps.slice()
		this.sols = new Uint8Array([0, ...sols])
		this.gis = new Uint8Array([0, ...gis])
	}

	setDmd(frame: Uint8Array): void {
		this.dmd = frame
	}

	getSwitchState(o: OffsetIndex): number {
		return this.switches[o.zeroBasedIndex] ?? 0
	}
	getLampState(o: OffsetIndex): number {
		return this.lamps[o.zeroBasedIndex] ?? 0
	}
	getSolenoidState(i: number): number {
		return this.sols[i + 1] ?? 0
	}
	getGIState(i: number): number {
		return this.gis[i + 1] ?? 0
	}

	getChangedLamps(): VbsArray<number[]> {
		const d = this.diff(this.lastLamps, this.lamps, OffsetIndex.mapIndexToMatrixIndex)
		this.lastLamps = this.lamps
		return new VbsArray(d)
	}
	getChangedSolenoids(): number[][] {
		const d = this.diff(this.lastSols, this.sols, (i) => i + 1)
		this.lastSols = this.sols
		return d
	}
	getChangedGI(): number[][] {
		const d = this.diff(this.lastGis, this.gis, (i) => i + 1)
		this.lastGis = this.gis
		return d
	}
	getChangedLEDs(): number[][] {
		return []
	}
	getDmdScreen(): Uint8Array {
		return this.dmd
	}

	private normalize(v: Uint8Array): Uint8Array {
		return Uint8Array.from(v, (x) => (x > 127 ? 1 : 0))
	}
	private diff(last: Uint8Array, cur: Uint8Array, map: (i: number) => number): number[][] {
		const out: number[][] = []
		for (let i = 0; i < cur.length; i++) if (last[i] !== cur[i]) out.push([map(i), cur[i]!])
		return out
	}
}

// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { WpcEmuWebWorkerApi } from 'wpc-emu'
import { VbsArray } from '../scripting/vbs-array.js'
import { OffsetIndex } from './offset-index.js'

const empty = (n = 64) => new Uint8Array(n)

// Copy src into dst, reallocating only when the size changed. PinMAME
// reuses its lane buffers in place across syncs, so the state must
// still copy.
function copyInto(dst: Uint8Array<ArrayBuffer>, src: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBuffer> {
	if (dst.length !== src.length) return Uint8Array.from(src)
	dst.set(src)
	return dst
}

export class EmulatorState {
	private lamps = empty()
	private lastLamps = empty()
	private sols = empty()
	private lastSols = empty()
	private gis = empty()
	private lastGis = empty()
	private dmd = new Uint8Array()
	private dmdBack = new Uint8Array()
	private switches = new Uint8Array()

	private lampMap: (i: number) => number = OffsetIndex.mapIndexToMatrixIndex
	private solMap: (i: number) => number = i => i + 1
	private giMap: (i: number) => number = i => i + 1

	updateState(s: WpcEmuWebWorkerApi.EmuStateAsic): void {
		this.lampMap = OffsetIndex.mapIndexToMatrixIndex
		this.solMap = i => i + 1
		this.giMap = i => i + 1
		if (s.wpc.lampState) this.lamps = Uint8Array.from(s.wpc.lampState, x => (x > 127 ? 1 : 0))
		// wpc-emu drives 0x00/0xFF with >>1 decay; VPM ChangedSols currStat is 0/1 (vpintf.c)
		if (s.wpc.solenoidState) this.sols = Uint8Array.from(s.wpc.solenoidState, x => (x > 127 ? 1 : 0))
		// wpc-emu exposes GI normalized by 31 (internal fade 0-7 becomes 0-217);
		// pinmame/VPM GI is 0-8 with 8 = full on (wpc.c)
		if (s.wpc.generalIlluminationState)
			this.gis = Uint8Array.from(s.wpc.generalIlluminationState, x => {
				const v = Math.round(x / 31)
				return v >= 7 ? 8 : v
			})
		if (s.dmd.dmdShadedBuffer) this.publishDmd(s.dmd.dmdShadedBuffer)
		if (s.wpc.inputSwitchMatrixActiveColumn) this.switches = s.wpc.inputSwitchMatrixActiveColumn.slice()
	}

	applyPinmame(lamps: Uint8Array, sols: Uint8Array, gis: Uint8Array): void {
		this.lampMap = i => i
		this.solMap = i => i
		this.giMap = i => i
		this.lamps = copyInto(this.lamps, lamps)
		this.sols = copyInto(this.sols, sols)
		this.gis = copyInto(this.gis, gis)
	}

	setDmd(frame: Uint8Array): void {
		this.publishDmd(frame)
	}

	// Double-buffered DMD publish: getDmdScreen hands out the live front
	// buffer, so the frame is staged in the back buffer and swapped — a
	// previously published snapshot is never mutated in place, even when a
	// caller retains it across frames.
	private publishDmd(frame: Uint8Array): void {
		if (this.dmdBack.length !== frame.length) this.dmdBack = new Uint8Array(frame.length)
		this.dmdBack.set(frame)
		const front = this.dmd
		this.dmd = this.dmdBack
		this.dmdBack = front
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
		return this.gis[this.giMap(i)] ?? 0
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
		const d = this.diff(this.lastGis, this.gis, this.giMap)
		this.lastGis = this.gis.slice()
		return d
	}
	// Segment-display LEDs arrive pre-diffed from the wasm side — one
	// (ledNo, chgSeg, state) triple per changed LED since the previous pull
	// — so they accumulate here and drain on read, mirroring VPM where
	// ChangedLEDs reports the changes since the script's last read. Rows
	// coalesce by LED (changed bits ORed, state is latest), approximating
	// VPM's XOR-versus-last-read across one drain window. wpc-emu has no
	// LED surface, so this lane stays empty for it.
	private pendingLEDs = new Map<number, [number, number]>()
	pullLEDs(rows: number[][]): void {
		for (const row of rows) {
			const prev = this.pendingLEDs.get(row[0])
			this.pendingLEDs.set(row[0], [prev ? prev[0] | row[1] : row[1], row[2]])
		}
	}
	getChangedLEDs(): number[][] {
		const out = [...this.pendingLEDs].map(([ledNo, pair]) => [ledNo, pair[0], pair[1]])
		this.pendingLEDs.clear()
		return out
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

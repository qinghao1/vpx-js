// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const MAX_BALLS = 32
export const BALL_STRIDE = 12
export const INPUT_CAPACITY = 256
export const INPUT_MASK = INPUT_CAPACITY - 1
export const INPUT_ENTRY_SIZE = 8
export const SAB_SIZE = 16 * 1024

export const HEADER_INT32_COUNT = 16
export const FLAGS_IDX = 0
export const GEN_IDX = 1
export const HEAD_IDX = 4
export const TAIL_IDX = 5

const FLAGS_WRITE_SHIFT = 0
const FLAGS_DIRTY_SHIFT = 2
const FLAGS_CLEAN_SHIFT = 4
const FLAGS_SNAP_SHIFT = 6
const FLAGS_MASK = 3
const FLAGS_DIRTY_SENTINEL = 3

export const TIMES_OFFSET = 64
export const TIMES_ENTRY_COUNT = 3
export const TIMES_SLOTS = 3
export const TIMES_DOUBLE_COUNT = TIMES_SLOTS * TIMES_ENTRY_COUNT
export const TIMES_BYTES = 128

export const BALLS_OFFSET = 256
export const BALLS_PER_SLOT_FLOATS = MAX_BALLS * BALL_STRIDE
export const BALLS_PER_SLOT_BYTES = BALLS_PER_SLOT_FLOATS * 4
export const BALLS_TOTAL_FLOATS = BALLS_PER_SLOT_FLOATS * 3
export const BALLS_TOTAL_BYTES = BALLS_TOTAL_FLOATS * 4

export const INPUT_OFFSET = BALLS_OFFSET + BALLS_TOTAL_BYTES
export const INPUT_BYTES = INPUT_CAPACITY * INPUT_ENTRY_SIZE

const COUNT_BASE_IDX = 8

export type InputEvent = {
	kind: number
	key: number
	val: number
}

function isSharedBuffer(sab: ArrayBufferLike): boolean {
	try {
		return typeof SharedArrayBuffer !== 'undefined' && sab instanceof SharedArrayBuffer
	} catch {
		return false
	}
}

function flagsPack(write: number, dirty: number, clean: number, snap: number): number {
	return (
		((write & FLAGS_MASK) << FLAGS_WRITE_SHIFT) |
		((dirty & FLAGS_MASK) << FLAGS_DIRTY_SHIFT) |
		((clean & FLAGS_MASK) << FLAGS_CLEAN_SHIFT) |
		((snap & FLAGS_MASK) << FLAGS_SNAP_SHIFT)
	)
}

function flagsUnpack(flags: number): { write: number; dirty: number; clean: number; snap: number } {
	return {
		write: (flags >> FLAGS_WRITE_SHIFT) & FLAGS_MASK,
		clean: (flags >> FLAGS_CLEAN_SHIFT) & FLAGS_MASK,
		dirty: (flags >> FLAGS_DIRTY_SHIFT) & FLAGS_MASK,
		snap: (flags >> FLAGS_SNAP_SHIFT) & FLAGS_MASK,
	}
}

export function canThread(): boolean {
	try {
		if (typeof SharedArrayBuffer === 'undefined') return false
		if (typeof Atomics === 'undefined') return false
		if (typeof Atomics.waitAsync !== 'function') return false
		const g = globalThis as unknown as { crossOriginIsolated?: boolean }
		if (typeof g.crossOriginIsolated === 'boolean' && !g.crossOriginIsolated) return false
		return true
	} catch {
		return false
	}
}

export function hasSharedArrayBuffer(): boolean {
	return typeof SharedArrayBuffer !== 'undefined'
}

export function isCrossOriginIsolated(): boolean {
	try {
		const g = globalThis as unknown as { crossOriginIsolated?: boolean }
		if (typeof g.crossOriginIsolated === 'boolean') return g.crossOriginIsolated
		return false
	} catch {
		return false
	}
}

export function createPhysicsSAB(): SharedArrayBuffer {
	const sab =
		typeof SharedArrayBuffer !== 'undefined'
			? new SharedArrayBuffer(SAB_SIZE)
			: (new ArrayBuffer(SAB_SIZE) as unknown as SharedArrayBuffer)
	const header = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_INT32_COUNT)
	const initFlags = flagsPack(0, FLAGS_DIRTY_SENTINEL, 1, 2)
	Atomics.store(header, FLAGS_IDX, initFlags)
	Atomics.store(header, GEN_IDX, 0)
	Atomics.store(header, HEAD_IDX, 0)
	Atomics.store(header, TAIL_IDX, 0)
	for (let i = 0; i < 3; i++) {
		header[COUNT_BASE_IDX + i] = 0
	}
	header[COUNT_BASE_IDX + 3] = 0
	const times = new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_DOUBLE_COUNT)
	times.fill(0)
	const balls = new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_TOTAL_FLOATS)
	balls.fill(0)
	const ring = new Uint8Array(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_BYTES)
	ring.fill(0)
	return sab
}

function getHeader(sab: SharedArrayBuffer): Int32Array {
	return new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_INT32_COUNT)
}

function getTimes(sab: SharedArrayBuffer): Float64Array {
	return new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_DOUBLE_COUNT)
}

function getBalls(sab: SharedArrayBuffer): Float32Array {
	return new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_TOTAL_FLOATS)
}

function getRingView(sab: SharedArrayBuffer): DataView {
	return new DataView(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_BYTES)
}

export function getGen(sab: SharedArrayBuffer): number {
	const header = getHeader(sab)
	return Atomics.load(header, GEN_IDX)
}

export function getFlags(sab: SharedArrayBuffer): number {
	const header = getHeader(sab)
	return Atomics.load(header, FLAGS_IDX)
}

export function writeFrame(
	sab: SharedArrayBuffer,
	balls: Float32Array,
	count: number,
	tPrev: number,
	tNext: number,
	timeMsec: number,
): void {
	if (count < 0 || count > MAX_BALLS) throw new RangeError(`count ${count} out of 0..${MAX_BALLS}`)
	if (!Number.isFinite(tPrev) || !Number.isFinite(tNext) || !Number.isFinite(timeMsec))
		throw new RangeError('times not finite')
	if (tNext < tPrev) throw new RangeError(`tNext ${tNext} < tPrev ${tPrev}`)
	const header = getHeader(sab)
	const times = getTimes(sab)
	const allBalls = getBalls(sab)
	const flags = Atomics.load(header, FLAGS_IDX)
	const w = (flags >> FLAGS_WRITE_SHIFT) & FLAGS_MASK
	if (w < 0 || w > 2) throw new Error(`bad WRITE ${w}`)
	const base = w * BALLS_PER_SLOT_FLOATS
	const need = count * BALL_STRIDE
	if (need > 0) {
		allBalls.set(balls.subarray(0, need), base)
		if (need < BALLS_PER_SLOT_FLOATS) {
			allBalls.fill(0, base + need, base + BALLS_PER_SLOT_FLOATS)
		}
	} else {
		allBalls.fill(0, base, base + BALLS_PER_SLOT_FLOATS)
	}
	const tBase = w * TIMES_ENTRY_COUNT
	times[tBase] = tPrev
	times[tBase + 1] = tNext
	times[tBase + 2] = timeMsec
	header[COUNT_BASE_IDX + w] = count
	if (isSharedBuffer(sab)) {
		Atomics.add(header, GEN_IDX, 1)
	} else {
		header[GEN_IDX]++
	}
	let spins = 0
	while (true) {
		const old = Atomics.load(header, FLAGS_IDX)
		const oW = (old >> FLAGS_WRITE_SHIFT) & FLAGS_MASK
		const oC = (old >> FLAGS_CLEAN_SHIFT) & FLAGS_MASK
		const oS = (old >> FLAGS_SNAP_SHIFT) & FLAGS_MASK
		const next = flagsPack(oC, 0, oW, oS)
		if (Atomics.compareExchange(header, FLAGS_IDX, old, next) === old) break
		if (++spins > 1000) throw new Error('writeFrame CAS spin')
	}
}

export type FrameSnapshot = {
	count: number
	tPrev: number
	tNext: number
	timeMsec: number
	gen: number
	snapIdx: number
}

export function trySnap(sab: SharedArrayBuffer, outBalls: Float32Array): FrameSnapshot | null {
	const header = getHeader(sab)
	const times = getTimes(sab)
	const allBalls = getBalls(sab)
	while (true) {
		const old = Atomics.load(header, FLAGS_IDX)
		const dirty = (old >> FLAGS_DIRTY_SHIFT) & FLAGS_MASK
		if (dirty === FLAGS_DIRTY_SENTINEL) return null
		const clean = (old >> FLAGS_CLEAN_SHIFT) & FLAGS_MASK
		const snap = (old >> FLAGS_SNAP_SHIFT) & FLAGS_MASK
		const write = (old >> FLAGS_WRITE_SHIFT) & FLAGS_MASK
		const next = flagsPack(write, FLAGS_DIRTY_SENTINEL, snap, clean)
		if (Atomics.compareExchange(header, FLAGS_IDX, old, next) === old) {
			const srcBase = clean * BALLS_PER_SLOT_FLOATS
			const count = header[COUNT_BASE_IDX + clean] | 0
			const clamped = Math.max(0, Math.min(count, MAX_BALLS))
			const need = clamped * BALL_STRIDE
			if (need > 0) {
				outBalls.set(allBalls.subarray(srcBase, srcBase + need), 0)
			}
			const tBase = clean * TIMES_ENTRY_COUNT
			const tPrev = times[tBase]
			const tNext = times[tBase + 1]
			const timeMsec = times[tBase + 2]
			const gen = Atomics.load(header, GEN_IDX)
			return { count: clamped, tPrev, tNext, timeMsec, gen, snapIdx: clean }
		}
	}
}

export function readFrame(sab: SharedArrayBuffer, outBalls: Float32Array): FrameSnapshot | null {
	return trySnap(sab, outBalls)
}

export function hasNewFrame(sab: SharedArrayBuffer): boolean {
	const header = getHeader(sab)
	const flags = Atomics.load(header, FLAGS_IDX)
	const dirty = (flags >> FLAGS_DIRTY_SHIFT) & FLAGS_MASK
	return dirty !== FLAGS_DIRTY_SENTINEL
}

export function peekFrameTimes(
	sab: SharedArrayBuffer,
	slot: number,
): { tPrev: number; tNext: number; timeMsec: number; count: number } {
	const times = getTimes(sab)
	const header = getHeader(sab)
	const tBase = slot * TIMES_ENTRY_COUNT
	return {
		tPrev: times[tBase],
		tNext: times[tBase + 1],
		timeMsec: times[tBase + 2],
		count: header[COUNT_BASE_IDX + slot] | 0,
	}
}

export function pushInput(sab: SharedArrayBuffer, kind: number, key: number, val: number): boolean {
	const header = getHeader(sab)
	const dv = getRingView(sab)
	const head = Atomics.load(header, HEAD_IDX)
	const tail = Atomics.load(header, TAIL_IDX)
	const nxt = (head + 1) & INPUT_MASK
	if (nxt === tail) return false
	const off = head * INPUT_ENTRY_SIZE
	dv.setUint8(off, kind & 0xff)
	dv.setUint8(off + 1, 0)
	dv.setUint16(off + 2, key & 0xffff, true)
	dv.setFloat32(off + 4, val, true)
	if (isSharedBuffer(sab)) {
		Atomics.store(header, HEAD_IDX, nxt)
		if (tail === head) {
			try {
				Atomics.notify(header, TAIL_IDX, 1)
			} catch {}
		}
	} else {
		header[HEAD_IDX] = nxt
	}
	return true
}

export function pushInputEvent(sab: SharedArrayBuffer, ev: InputEvent): boolean {
	return pushInput(sab, ev.kind, ev.key, ev.val)
}

export function popInput(sab: SharedArrayBuffer): InputEvent | null {
	const header = getHeader(sab)
	const dv = getRingView(sab)
	const head = Atomics.load(header, HEAD_IDX)
	const tail = Atomics.load(header, TAIL_IDX)
	if (tail === head) return null
	const off = tail * INPUT_ENTRY_SIZE
	const kind = dv.getUint8(off)
	const key = dv.getUint16(off + 2, true)
	const val = dv.getFloat32(off + 4, true)
	const nxt = (tail + 1) & INPUT_MASK
	if (isSharedBuffer(sab)) Atomics.store(header, TAIL_IDX, nxt)
	else header[TAIL_IDX] = nxt
	return { kind, key, val }
}

export function drainInput(sab: SharedArrayBuffer, out: InputEvent[]): number {
	const header = getHeader(sab)
	const dv = getRingView(sab)
	let count = 0
	while (true) {
		const head = Atomics.load(header, HEAD_IDX)
		const tail = Atomics.load(header, TAIL_IDX)
		if (tail === head) break
		const off = tail * INPUT_ENTRY_SIZE
		const kind = dv.getUint8(off)
		const key = dv.getUint16(off + 2, true)
		const val = dv.getFloat32(off + 4, true)
		out.push({ kind, key, val })
		const nxt = (tail + 1) & INPUT_MASK
		if (isSharedBuffer(sab)) Atomics.store(header, TAIL_IDX, nxt)
		else header[TAIL_IDX] = nxt
		count++
		if (count > INPUT_CAPACITY) break
	}
	return count
}

export function drainInputWith(sab: SharedArrayBuffer, fn: (ev: InputEvent) => void): number {
	const header = getHeader(sab)
	const dv = getRingView(sab)
	let n = 0
	while (true) {
		const head = Atomics.load(header, HEAD_IDX)
		const tail = Atomics.load(header, TAIL_IDX)
		if (tail === head) break
		const off = tail * INPUT_ENTRY_SIZE
		fn({ kind: dv.getUint8(off), key: dv.getUint16(off + 2, true), val: dv.getFloat32(off + 4, true) })
		const nxt = (tail + 1) & INPUT_MASK
		if (isSharedBuffer(sab)) Atomics.store(header, TAIL_IDX, nxt)
		else header[TAIL_IDX] = nxt
		n++
		if (n > INPUT_CAPACITY) break
	}
	return n
}

export function inputPending(sab: SharedArrayBuffer): number {
	const header = getHeader(sab)
	const head = Atomics.load(header, HEAD_IDX)
	const tail = Atomics.load(header, TAIL_IDX)
	return (head - tail) & INPUT_MASK
}

export function waitForInput(sab: SharedArrayBuffer, timeoutMs = 50): number {
	if (!isSharedBuffer(sab)) return inputPending(sab)
	const header = getHeader(sab)
	const tail = Atomics.load(header, TAIL_IDX)
	const head = Atomics.load(header, HEAD_IDX)
	if (head !== tail) return 1
	try {
		Atomics.wait(header, TAIL_IDX, tail, timeoutMs)
	} catch {}
	const h2 = Atomics.load(header, HEAD_IDX)
	const t2 = Atomics.load(header, TAIL_IDX)
	return h2 !== t2 ? 1 : 0
}

export function clearInput(sab: SharedArrayBuffer): void {
	const header = getHeader(sab)
	if (isSharedBuffer(sab)) {
		Atomics.store(header, HEAD_IDX, 0)
		Atomics.store(header, TAIL_IDX, 0)
	} else {
		header[HEAD_IDX] = 0
		header[TAIL_IDX] = 0
	}
}

export function interpolateBalls(
	prev: Float32Array,
	next: Float32Array,
	count: number,
	alpha: number,
	out: Float32Array,
): void {
	const clamped = Math.max(0, Math.min(1, alpha))
	const need = count * BALL_STRIDE
	for (let i = 0; i < need; i += BALL_STRIDE) {
		const px = prev[i],
			py = prev[i + 1],
			pz = prev[i + 2]
		const vx = next[i] - px,
			vy = next[i + 1] - py,
			vz = next[i + 2] - pz
		out[i] = px + vx * clamped
		out[i + 1] = py + vy * clamped
		out[i + 2] = pz + vz * clamped
		out[i + 3] = prev[i + 3] + (next[i + 3] - prev[i + 3]) * clamped
		out[i + 4] = prev[i + 4] + (next[i + 4] - prev[i + 4]) * clamped
		out[i + 5] = prev[i + 5] + (next[i + 5] - prev[i + 5]) * clamped
		out[i + 6] = prev[i + 6] + (next[i + 6] - prev[i + 6]) * clamped
		out[i + 7] = prev[i + 7] + (next[i + 7] - prev[i + 7]) * clamped
		out[i + 8] = prev[i + 8] + (next[i + 8] - prev[i + 8]) * clamped
		out[i + 9] = prev[i + 9]
		out[i + 10] = prev[i + 10]
		out[i + 11] = prev[i + 11]
	}
}

export function computeAlpha(nowMs: number, tPrev: number, tNext: number): number {
	if (!Number.isFinite(tPrev) || !Number.isFinite(tNext) || tNext <= tPrev) return 0
	const a = (nowMs - tPrev) / (tNext - tPrev)
	if (a < 0) return 0
	if (a > 1) return 1
	return a
}

export function encodeBall(
	posX: number,
	posY: number,
	posZ: number,
	velX: number,
	velY: number,
	velZ: number,
	angVelX: number,
	angVelY: number,
	angVelZ: number,
	radius: number,
	mass: number,
	frozen: number,
	out: Float32Array,
	off: number,
): void {
	out[off] = posX
	out[off + 1] = posY
	out[off + 2] = posZ
	out[off + 3] = velX
	out[off + 4] = velY
	out[off + 5] = velZ
	out[off + 6] = angVelX
	out[off + 7] = angVelY
	out[off + 8] = angVelZ
	out[off + 9] = radius
	out[off + 10] = mass
	out[off + 11] = frozen
}

export function getLayout(): {
	sabSize: number
	headerBytes: number
	timesOffset: number
	timesBytes: number
	ballsOffset: number
	ballsBytes: number
	inputOffset: number
	inputBytes: number
	maxBalls: number
	ballStride: number
} {
	return {
		sabSize: SAB_SIZE,
		headerBytes: 64,
		timesOffset: TIMES_OFFSET,
		timesBytes: TIMES_BYTES,
		ballsOffset: BALLS_OFFSET,
		ballsBytes: BALLS_TOTAL_BYTES,
		inputOffset: INPUT_OFFSET,
		inputBytes: INPUT_BYTES,
		maxBalls: MAX_BALLS,
		ballStride: BALL_STRIDE,
	}
}

export function debugDump(sab: SharedArrayBuffer): string {
	const header = getHeader(sab)
	const flags = Atomics.load(header, FLAGS_IDX)
	const { write, dirty, clean, snap } = flagsUnpack(flags)
	return `flags w=${write} d=${dirty} c=${clean} s=${snap} gen=${Atomics.load(header, GEN_IDX)} head=${Atomics.load(header, HEAD_IDX)} tail=${Atomics.load(header, TAIL_IDX)}`
}

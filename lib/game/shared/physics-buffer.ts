// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const MAX_BALLS = 32
export const BALL_STRIDE = 12
export const SAB_SIZE = 16 * 1024

const HEADER_SIZE = 64
const TIMES_OFFSET = 64
const TIMES_SLOTS = 3
const TIMES_STRIDE = 3
const BALLS_OFFSET = 256
const BALLS_PER_SLOT = MAX_BALLS * BALL_STRIDE
const INPUT_OFFSET = BALLS_OFFSET + BALLS_PER_SLOT * 3 * 4
const INPUT_CAPACITY = 256
const INPUT_MASK = INPUT_CAPACITY - 1
const INPUT_ENTRY = 8

const FLAGS_IDX = 0
const GEN_IDX = 1
const HEAD_IDX = 4
const TAIL_IDX = 5
const COUNT_BASE = 8

const MASK = 3
const SENTINEL = 3

export type InputEvent = { kind: number; key: number; val: number }

export type FrameSnapshot = {
	count: number
	tPrev: number
	tNext: number
	timeMsec: number
	gen: number
	snapIdx: number
}

const pack = (w: number, d: number, c: number, s: number) =>
	((w & MASK) << 0) | ((d & MASK) << 2) | ((c & MASK) << 4) | ((s & MASK) << 6)

const isSAB = (sab: ArrayBufferLike) => {
	try {
		return typeof SharedArrayBuffer !== 'undefined' && sab instanceof SharedArrayBuffer
	} catch {
		return false
	}
}

export function canThread(): boolean {
	try {
		if (
			typeof SharedArrayBuffer === 'undefined' ||
			typeof Atomics === 'undefined' ||
			typeof Atomics.waitAsync !== 'function'
		)
			return false
		const g = globalThis as { crossOriginIsolated?: boolean }
		if (typeof g.crossOriginIsolated === 'boolean' && !g.crossOriginIsolated) return false
		return true
	} catch {
		return false
	}
}

export function createPhysicsSAB(): SharedArrayBuffer {
	const sab =
		typeof SharedArrayBuffer !== 'undefined'
			? new SharedArrayBuffer(SAB_SIZE)
			: (new ArrayBuffer(SAB_SIZE) as unknown as SharedArrayBuffer)
	const h = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
	h[FLAGS_IDX] = pack(0, SENTINEL, 1, 2)
	h[GEN_IDX] = 0
	h[HEAD_IDX] = 0
	h[TAIL_IDX] = 0
	for (let i = 0; i < 3; i++) h[COUNT_BASE + i] = 0
	new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_SLOTS * TIMES_STRIDE).fill(0)
	new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_PER_SLOT * 3).fill(0)
	new Uint8Array(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_CAPACITY * INPUT_ENTRY).fill(0)
	return sab
}

export function writeFrame(
	sab: SharedArrayBuffer,
	balls: Float32Array,
	count: number,
	tPrev: number,
	tNext: number,
	timeMsec: number,
): void {
	if (count < 0 || count > MAX_BALLS) throw new RangeError(`count ${count}`)
	if (!Number.isFinite(tPrev) || !Number.isFinite(tNext) || !Number.isFinite(timeMsec))
		throw new RangeError('time not finite')
	if (tNext < tPrev) throw new RangeError('tNext < tPrev')
	const h = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
	const times = new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_SLOTS * TIMES_STRIDE)
	const all = new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_PER_SLOT * 3)
	const w = Atomics.load(h, FLAGS_IDX) & MASK
	const base = w * BALLS_PER_SLOT
	const need = count * BALL_STRIDE
	if (need > 0) all.set(balls.subarray(0, need), base)
	if (need < BALLS_PER_SLOT) all.fill(0, base + need, base + BALLS_PER_SLOT)
	const tb = w * TIMES_STRIDE
	times[tb] = tPrev
	times[tb + 1] = tNext
	times[tb + 2] = timeMsec
	h[COUNT_BASE + w] = count
	if (isSAB(sab)) Atomics.add(h, GEN_IDX, 1)
	else h[GEN_IDX]++
	while (true) {
		const old = Atomics.load(h, FLAGS_IDX)
		const oW = old & MASK
		const oC = (old >> 4) & MASK
		const oS = (old >> 6) & MASK
		const next = pack(oC, 0, oW, oS)
		if (Atomics.compareExchange(h, FLAGS_IDX, old, next) === old) break
	}
}

export function trySnap(sab: SharedArrayBuffer, out: Float32Array): FrameSnapshot | null {
	const h = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
	const times = new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_SLOTS * TIMES_STRIDE)
	const all = new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_PER_SLOT * 3)
	while (true) {
		const old = Atomics.load(h, FLAGS_IDX)
		const dirty = (old >> 2) & MASK
		if (dirty === SENTINEL) return null
		const clean = (old >> 4) & MASK
		const snap = (old >> 6) & MASK
		const w = old & MASK
		const next = pack(w, SENTINEL, snap, clean)
		if (Atomics.compareExchange(h, FLAGS_IDX, old, next) === old) {
			const count = h[COUNT_BASE + clean] | 0
			const clamped = Math.max(0, Math.min(count, MAX_BALLS))
			const need = clamped * BALL_STRIDE
			if (need > 0) out.set(all.subarray(clean * BALLS_PER_SLOT, clean * BALLS_PER_SLOT + need), 0)
			const tb = clean * TIMES_STRIDE
			return {
				count: clamped,
				tPrev: times[tb],
				tNext: times[tb + 1],
				timeMsec: times[tb + 2],
				gen: Atomics.load(h, GEN_IDX),
				snapIdx: clean,
			}
		}
	}
}

export const readFrame = trySnap

export function pushInput(sab: SharedArrayBuffer, kind: number, key: number, val: number): boolean {
	const h = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
	const dv = new DataView(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_CAPACITY * INPUT_ENTRY)
	const head = Atomics.load(h, HEAD_IDX)
	const tail = Atomics.load(h, TAIL_IDX)
	const nxt = (head + 1) & INPUT_MASK
	if (nxt === tail) return false
	const off = head * INPUT_ENTRY
	dv.setUint8(off, kind & 0xff)
	dv.setUint16(off + 2, key & 0xffff, true)
	dv.setFloat32(off + 4, val, true)
	if (isSAB(sab)) {
		Atomics.store(h, HEAD_IDX, nxt)
		if (tail === head) {
			try {
				Atomics.notify(h, TAIL_IDX, 1)
			} catch {}
		}
	} else {
		h[HEAD_IDX] = nxt
	}
	return true
}

export function drainInput(sab: SharedArrayBuffer, out: InputEvent[]): number {
	const h = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
	const dv = new DataView(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_CAPACITY * INPUT_ENTRY)
	let n = 0
	while (true) {
		const head = Atomics.load(h, HEAD_IDX)
		const tail = Atomics.load(h, TAIL_IDX)
		if (tail === head) break
		const off = tail * INPUT_ENTRY
		out.push({ kind: dv.getUint8(off), key: dv.getUint16(off + 2, true), val: dv.getFloat32(off + 4, true) })
		const nn = (tail + 1) & INPUT_MASK
		if (isSAB(sab)) Atomics.store(h, TAIL_IDX, nn)
		else h[TAIL_IDX] = nn
		if (++n > INPUT_CAPACITY) break
	}
	return n
}

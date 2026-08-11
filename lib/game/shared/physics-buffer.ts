// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

export const MAX_BALLS = 32
export const BALL_STRIDE = 12
export const SAB_SIZE = 16 * 1024

const HEADER_SIZE = 128 // 2×64B cache lines; 128B on Apple M1/M2 — keeps HEAD/TAIL on separate lines
const TIMES_OFFSET = 128 // pad header→times to 128B to avoid false sharing with TAIL (tail line is hot)
const TIMES_SLOTS = 3
const TIMES_STRIDE = 3
const BALLS_OFFSET = 256 // 1536B per slot = 24×64B, already 64B-aligned (12×128B on Apple) — ball data is read-mostly, separate from header lines
const BALLS_PER_SLOT = MAX_BALLS * BALL_STRIDE
const INPUT_OFFSET = BALLS_OFFSET + BALLS_PER_SLOT * 3 * 4
const INPUT_CAPACITY = 256
const INPUT_MASK = INPUT_CAPACITY - 1
const INPUT_ENTRY = 8

const FLAGS_IDX = 0
const GEN_IDX = 1
// HEAD (main→worker) and TAIL (worker→main) must be on separate cache lines
// to avoid false sharing / MESI ping-pong: HEAD at 16B (line 0, main writer),
// TAIL at 80B (line 1, worker writer). On JS this matters at the HW level:
// SharedArrayBuffer + TypedArray offsets are byte-precise and stable, so the
// separation is real — unlike C++ `alignas(64)` we can't force alignment, but
// choosing offsets that are 64B apart guarantees different lines on x86 (64B)
// and separated on Apple Silicon (128B lines: HEAD line0, TAIL line1).
const HEAD_IDX = 4 // offset 16 — line 0, written by main (pushInput), read by worker
const TAIL_IDX = 20 // offset 80 — line 1, written by worker (drainInput), read by main; separate line avoids MESI ping-pong
const COUNT_BASE = 24 // offset 96 — in tail line, written by worker (slot counts)

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

const headerCache = new WeakMap<SharedArrayBuffer, Int32Array>()
const timesCache = new WeakMap<SharedArrayBuffer, Float64Array>()
const ballsCache = new WeakMap<SharedArrayBuffer, Float32Array>()
const ringCache = new WeakMap<SharedArrayBuffer, DataView>()

function getHeader(sab: SharedArrayBuffer): Int32Array {
	let v = headerCache.get(sab)
	if (!v) {
		v = new Int32Array(sab as unknown as ArrayBuffer, 0, HEADER_SIZE / 4)
		headerCache.set(sab, v)
	}
	return v
}

function getTimes(sab: SharedArrayBuffer): Float64Array {
	let v = timesCache.get(sab)
	if (!v) {
		v = new Float64Array(sab as unknown as ArrayBuffer, TIMES_OFFSET, TIMES_SLOTS * TIMES_STRIDE)
		timesCache.set(sab, v)
	}
	return v
}

function getBalls(sab: SharedArrayBuffer): Float32Array {
	let v = ballsCache.get(sab)
	if (!v) {
		v = new Float32Array(sab as unknown as ArrayBuffer, BALLS_OFFSET, BALLS_PER_SLOT * 3)
		ballsCache.set(sab, v)
	}
	return v
}

function getRing(sab: SharedArrayBuffer): DataView {
	let v = ringCache.get(sab)
	if (!v) {
		v = new DataView(sab as unknown as ArrayBuffer, INPUT_OFFSET, INPUT_CAPACITY * INPUT_ENTRY)
		ringCache.set(sab, v)
	}
	return v
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
	const h = getHeader(sab)
	const times = getTimes(sab)
	const all = getBalls(sab)
	const w = Atomics.load(h, FLAGS_IDX) & MASK
	const base = w * BALLS_PER_SLOT
	const need = count * BALL_STRIDE
	if (need > 0) all.set(balls.subarray(0, need), base)
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
	const h = getHeader(sab)
	const times = getTimes(sab)
	const all = getBalls(sab)
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
	const h = getHeader(sab)
	const dv = getRing(sab)
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
	const h = getHeader(sab)
	const dv = getRing(sab)
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

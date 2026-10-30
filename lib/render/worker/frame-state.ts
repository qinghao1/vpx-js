// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

/**
 * Zero-copy frame-state handoff from the sim thread to a render worker.
 *
 * One SharedArrayBuffer holds a cache-line-padded header plus three fixed-capacity
 * frame slots. The writer owns its slot exclusively; the reader always takes the
 * latest complete slot, so a slow reader never stalls the sim and missed frames
 * coalesce. Each slot is guarded by a seqlock version word: odd while the writer
 * holds it, even once the payload is complete. Multi-word numerics always travel
 * inside a slot, never as bare shared reads (Atomics covers int32 only).
 *
 * SAB layout: HEADER_INTS int32 header cells, then SLOT_COUNT slots each
 * prefixed by one int32 seqlock word and holding SLOT_FLOATS floats, then the
 * fixed-size DMD byte region.
 */

export const MAX_BALLS = 16
// Full per-frame lamp levels (intensity/color/colorFull for every lamp) ride
// the deltas so the worker converges without ever missing a boot-settled
// value; 2048 rows cover ~450 lamps plus the changed-state rows.
export const MAX_DELTAS = 2048
export const DMD_WIDTH = 128
export const DMD_HEIGHT = 32
export const DMD_BYTES = DMD_WIDTH * DMD_HEIGHT * 4
export const SLOT_COUNT = 3

export const DeltaKind = {
	Scalar: 2,
} as const
export type DeltaKind = (typeof DeltaKind)[keyof typeof DeltaKind]
// Only Scalar rows are emitted; other kind values are reserved.

// Header cells live on distinct 64-byte lines so polling cores never share a line.
export const HDR_WRITE_IDX = 0
export const HDR_READ_LATEST = 16
export const HDR_DMD_VERSION = 32
export const HDR_DMD_W = 33
export const HDR_DMD_H = 34
export const HEADER_INTS = 96

// Float layout inside one slot.
export const F_SIM_TIME = 0
export const F_TIME_SEC = 1
export const F_OVERALL_FRAMES = 2
export const F_BALL_COUNT = 3
export const F_BALLS = 4
// Ball row: pos 0-2, vel 3-5, radius +6, active flag +7, orientation 3x3 +8-16.
export const BALL_STRIDE = 17
export const BALL_ORIENT = 8
export const F_DELTA_COUNT = F_BALLS + MAX_BALLS * BALL_STRIDE
export const F_DELTAS = F_DELTA_COUNT + 1
export const DELTA_STRIDE = 6
// Lamp state rides the generic ChangedStates deltas (per-frame light animation
// marks dirty), so the slot carries no dedicated lamp rows.
export const F_VIEW = F_DELTAS + MAX_DELTAS * DELTA_STRIDE
export const VIEW_FLOATS = 16
export const F_VSYNC = F_VIEW + VIEW_FLOATS
export const F_LAST_PRESENT = F_VSYNC + 1
export const F_TARGET_LEN = F_VSYNC + 2
export const F_DMD_FRAME_ID = F_VSYNC + 3
// Derived, never hardcoded: MAX_DELTAS growth must enlarge every slot view,
// scratch copy, and the shared buffer together or tail rows silently vanish.
// 2048 rows cover ~450 lamps plus changed rows with init-burst headroom.
export const SLOT_FLOATS = F_DMD_FRAME_ID + 1

// View vector: cam pos xyz, cam target xyz, fov, pixel w/h, stereo, flip,
// nudge xy, cabinet accel xy, near. Camera rows are written every frame by
// the main thread (viewer orbit included); fov 0 means unset — the worker
// keeps its boot framing. Near rides along because depth precision is
// near-dominated: play/viewer framings use different near planes and the
// worker must match the page's to rasterize identical edges.
export const V_CAM_POS = 0
export const V_CAM_TGT = 3
export const V_CAM_FOV = 6
export const V_PX_W = 7
export const V_PX_H = 8
export const V_STEREO = 9
export const V_FLIP = 10
export const V_NUDGE_X = 11
export const V_NUDGE_Y = 12
export const V_ACC_X = 13
export const V_ACC_Y = 14
export const V_CAM_NEAR = 15

const HEADER_BYTES = HEADER_INTS * 4
const SLOT_BYTES = 4 + SLOT_FLOATS * 4

export function frameStateByteLength(): number {
	return HEADER_BYTES + SLOT_COUNT * SLOT_BYTES + DMD_BYTES
}

export function createFrameStateBuffer(): SharedArrayBuffer {
	return new SharedArrayBuffer(frameStateByteLength())
}

/** Published main-thread camera decoded from one slot's view rows, if set. */
export interface ViewCamera {
	pos: [number, number, number]
	target: [number, number, number]
	fov: number
	/** Published near plane, 0 when never published (worker keeps boot near). */
	near: number
}

/**
 * Read the published camera from a consumed slot. Null when the writer never
 * published one (fov row is zero) or rows are non-finite — a missing or torn
 * publish must not fling the worker camera.
 */
export function readViewCamera(slot: Float32Array): ViewCamera | null {
	const fov = slot[F_VIEW + V_CAM_FOV] ?? 0
	if (!Number.isFinite(fov) || fov <= 0) return null
	const at = (i: number): number => slot[F_VIEW + i] ?? 0
	const pos: [number, number, number] = [at(V_CAM_POS), at(V_CAM_POS + 1), at(V_CAM_POS + 2)]
	const target: [number, number, number] = [at(V_CAM_TGT), at(V_CAM_TGT + 1), at(V_CAM_TGT + 2)]
	if (![...pos, ...target].every(Number.isFinite)) return null
	const near = at(V_CAM_NEAR)
	return { pos, target, fov, near: Number.isFinite(near) ? near : 0 }
}

/** Scratch a reader copies one slot into; reuse it, never allocate per frame. */
export function createSlotScratch(): Float32Array {
	return new Float32Array(SLOT_FLOATS)
}

function slotByteOffset(slot: number): number {
	return HEADER_BYTES + slot * SLOT_BYTES
}

/** Byte offset of a slot seq word; exported for tests and worker harnesses. */
export function slotSeqByteOffset(slot: number): number {
	return slotByteOffset(slot)
}

function dmdByteOffset(): number {
	return HEADER_BYTES + SLOT_COUNT * SLOT_BYTES
}

/**
 * Single owner of the buffer layout math for both threads. Writer methods run on
 * the sim thread, reader methods on the render worker; never share an instance.
 */
export class FrameState {
	private readonly header: Int32Array
	private readonly seqs: Int32Array[]
	private readonly slots: Float32Array[]
	private readonly dmd: Uint8Array

	constructor(readonly buffer: SharedArrayBuffer | ArrayBuffer) {
		this.header = new Int32Array(buffer, 0, HEADER_INTS)
		this.seqs = []
		this.slots = []
		for (let i = 0; i < SLOT_COUNT; i++) {
			this.seqs.push(new Int32Array(buffer, slotByteOffset(i), 1))
			this.slots.push(new Float32Array(buffer, slotByteOffset(i) + 4, SLOT_FLOATS))
		}
		this.dmd = new Uint8Array(buffer, dmdByteOffset(), DMD_BYTES)
	}

	/**
	 * Call once on the owning thread before sharing the buffer. Points the write
	 * cursor at slot 0 and the read cursor at the last slot with version 0, so the
	 * first publish never mistakes a zeroed header for a live reader slot and a
	 * pre-publish read yields an explicit never-published version 0.
	 */
	reset(): void {
		for (const seq of this.seqs) Atomics.store(seq, 0, 0)
		Atomics.store(this.header, HDR_DMD_VERSION, 0)
		Atomics.store(this.header, HDR_DMD_W, 0)
		Atomics.store(this.header, HDR_DMD_H, 0)
		Atomics.store(this.header, HDR_READ_LATEST, SLOT_COUNT - 1)
		Atomics.store(this.header, HDR_WRITE_IDX, 0)
	}

	/**
	 * Publish one frame; mutator fills the claimed slot. Returns the slot index.
	 * The writer never waits: it skips the last-read slot, so rapid publishes
	 * coalesce and the reader always takes the newest complete frame.
	 */
	publish(mutator: (slot: Float32Array, slotIndex: number) => void): number {
		let slot = Atomics.load(this.header, HDR_WRITE_IDX) % SLOT_COUNT
		if (slot < 0) slot += SLOT_COUNT
		if (slot === Atomics.load(this.header, HDR_READ_LATEST)) slot = (slot + 1) % SLOT_COUNT
		const seq = this.seqs[slot]
		const cur = Atomics.load(seq, 0)
		Atomics.store(seq, 0, cur + 1)
		mutator(this.slots[slot], slot)
		Atomics.store(seq, 0, cur + 2)
		Atomics.store(this.header, HDR_READ_LATEST, slot)
		let next = (slot + 1) % SLOT_COUNT
		if (next === slot) next = (next + 1) % SLOT_COUNT
		Atomics.store(this.header, HDR_WRITE_IDX, next)
		return slot
	}

	/**
	 * Copy the latest complete slot into scratch. Returns null when the writer
	 * holds the slot mid-publish (odd seq) or tore it mid-copy; just retry next tick.
	 */
	tryConsume(scratch: Float32Array): { slot: number; version: number } | null {
		let slot = Atomics.load(this.header, HDR_READ_LATEST) % SLOT_COUNT
		if (slot < 0) slot += SLOT_COUNT
		const seq = this.seqs[slot]
		const before = Atomics.load(seq, 0)
		if (before % 2 !== 0) return null
		scratch.set(this.slots[slot])
		if (Atomics.load(seq, 0) !== before) return null
		return { slot, version: before }
	}

	/**
	 * Script DMD commit: copy the mono frame bytes, record dims, then bump the
	 * version as the publish signal. Frames larger than the region are
	 * clamped; the worker rescales from the recorded dims. The recorded dims
	 * are informational only and are not covered by the version gate —
	 * consumeDmd guards just the byte region.
	 */
	publishDmd(src: Uint8Array | Uint8ClampedArray, w = DMD_WIDTH, h = DMD_HEIGHT): number {
		this.dmd.set(src.subarray(0, Math.min(src.length, DMD_BYTES)))
		Atomics.store(this.header, HDR_DMD_W, w)
		Atomics.store(this.header, HDR_DMD_H, h)
		const version = (Atomics.load(this.header, HDR_DMD_VERSION) + 1) | 0
		Atomics.store(this.header, HDR_DMD_VERSION, version)
		return version
	}

	dmdVersion(): number {
		return Atomics.load(this.header, HDR_DMD_VERSION)
	}

	dmdDims(): { w: number; h: number } {
		return { w: Atomics.load(this.header, HDR_DMD_W), h: Atomics.load(this.header, HDR_DMD_H) }
	}

	/** Copy the DMD region when it is stable; null means retry (writer tore it). */
	consumeDmd(out: Uint8Array): number | null {
		const before = Atomics.load(this.header, HDR_DMD_VERSION)
		out.set(this.dmd)
		if (Atomics.load(this.header, HDR_DMD_VERSION) !== before) return null
		return before
	}
}

// ---------------------------------------------------------------------------
// Generic numeric state-field codec.
//
// ChangedStates diffs only carry changed fields, so the main thread walks each
// diff generically: numbers and booleans ride one Scalar row, Vertex2D/3D-likes
// ride one row, 3x3 matrix-likes ride three rows. Strings (material/texture/map
// swaps) cannot ride a float slot and are skipped. The worker reverses the same
// table, so new numeric fields work without per-type code on either side.
// ---------------------------------------------------------------------------

type FieldArity = 1 | 2 | 3 | 9

const FIELD_TABLE: Array<[name: string, arity: FieldArity]> = [
	['angle', 1],
	['frame', 1],
	['intensity', 1],
	['color', 1],
	['colorFull', 1],
	['alpha', 1],
	['rotX', 1],
	['rotY', 1],
	['rotZ', 1],
	['ringOffset', 1],
	['skirtRotX', 1],
	['skirtRotY', 1],
	['height', 1],
	['currentFrame', 1],
	['type', 1],
	['isFrozen', 1],
	['isVisible', 1],
	['showBracket', 1],
	['inPlayState', 1],
	['lockedByLS', 1],
	['slnkResolved', 1],
	['isCapVisible', 1],
	['isRingVisible', 1],
	['isBaseVisible', 1],
	['isSkirtVisible', 1],
	['disableLightingTop', 1],
	['disableLightingBelow', 1],
	['center', 2],
	['pos', 3],
	['position', 3],
	['size', 3],
	['rotation', 3],
	['translation', 3],
	['objectRotation', 3],
	['orientation', 9],
]

/** Field name to shared id (1-based; 0 means unknown). */
export const FIELD_IDS: Record<string, number> = {}
/** Shared id to field name. */
export const FIELD_NAMES: Record<number, string> = {}
/** Shared id to value count. */
const FIELD_ARITY: Record<number, FieldArity> = {}

for (let i = 0; i < FIELD_TABLE.length; i++) {
	const [name, arity] = FIELD_TABLE[i] as [string, FieldArity]
	FIELD_IDS[name] = i + 1
	FIELD_NAMES[i + 1] = name
	FIELD_ARITY[i + 1] = arity
}

function vecVals(v: unknown): number[] | null {
	if (typeof v !== 'object' || v === null) return null
	const o = v as Record<string, unknown>
	if (typeof o.x !== 'number' || typeof o.y !== 'number') return null
	if (typeof o.z === 'number') return [o.x, o.y, o.z]
	return [o.x, o.y]
}

function mat9(v: unknown): number[] | null {
	if (typeof v !== 'object' || v === null) return null
	const els = (v as { elements?: unknown }).elements
	if (!Array.isArray(els) && !(els instanceof Float32Array) && !(els instanceof Float64Array)) return null
	const list = els as ArrayLike<number>
	if (list.length !== 9) return null
	const out = Array.from(list)
	if (!out.every(Number.isFinite)) return null
	return out
}

/**
 * Deterministic name-to-id map shared by the sim thread and the worker. The
 * universe must be computable identically on both sides from the same parsed
 * file WITHOUT seeing live diffs: pass every table item name (not just
 * getAnimatables() — ChangedStates also carries non-animatable items such as
 * plungers). No registry handshake is needed. Returns -1 for unknown names.
 */
export function createNodeIdMap(names: string[]): (name: string) => number {
	const sorted = [...names].sort()
	const index = new Map(sorted.map((name, i) => [name, i]))
	return (name: string) => index.get(name) ?? -1
}

interface NodeNameTable {
	getItems(): Array<{ getName(): string }>
	getName?(): string
}

/** Every name that may appear in ChangedStates: all item names plus the table itself. */
export function workerNodeNames(table: NodeNameTable): string[] {
	const names = new Set<string>()
	try {
		for (const item of table.getItems()) {
			try {
				const name = item.getName()
				if (name) names.add(name)
			} catch {}
		}
	} catch {}
	try {
		const tableName = table.getName?.()
		if (tableName) names.add(tableName)
	} catch {}
	return [...names]
}

export interface ChangedStatesLike {
	changedStates: Record<string, Record<string, unknown>>
}

/**
 * Encode every numeric/boolean/vector field of each non-ball diff into delta
 * rows. Balls ride the dedicated ball rows (pos, vel, radius, orientation).
 * `out` is rows-based (row r at r*DELTA_STRIDE), not slot-based: the bridge
 * copies rows into the slot. Returns rows written; overflow clamps and counts into dropped.
 */
export function encodeChangedStates(
	changed: ChangedStatesLike,
	idOf: (name: string) => number,
	isBallName: (name: string) => boolean,
	out: Float32Array,
	maxRows = MAX_DELTAS,
	dropped?: { count: number },
): number {
	let rows = 0
	const emit = (nodeId: number, fieldId: number, v0: number, v1: number, v2: number): boolean => {
		if (rows >= maxRows || (rows + 1) * DELTA_STRIDE > out.length) {
			if (dropped) dropped.count++
			return false
		}
		const o = rows * DELTA_STRIDE
		out[o] = nodeId
		out[o + 1] = DeltaKind.Scalar
		out[o + 2] = fieldId
		out[o + 3] = v0
		out[o + 4] = v1
		out[o + 5] = v2
		rows++
		return true
	}
	for (const name of Object.keys(changed.changedStates)) {
		if (isBallName(name)) continue
		const nodeId = idOf(name)
		if (nodeId < 0) continue
		const diff = changed.changedStates[name] as Record<string, unknown>
		for (const key of Object.keys(diff)) {
			if (key === 'name') continue
			const fieldId = FIELD_IDS[key]
			if (!fieldId) continue
			const value = diff[key]
			if (typeof value === 'number') {
				if (!Number.isFinite(value)) continue
				if (!emit(nodeId, fieldId, value, 0, 0)) return rows
			} else if (typeof value === 'boolean') {
				if (!emit(nodeId, fieldId, value ? 1 : 0, 0, 0)) return rows
			} else {
				const vec = vecVals(value)
				if (vec) {
					if (!emit(nodeId, fieldId, vec[0] ?? 0, vec[1] ?? 0, vec[2] ?? 0)) return rows
					continue
				}
				const mat = mat9(value)
				if (mat) {
					for (let r = 0; r < 3; r++) {
						if (!emit(nodeId, fieldId, mat[r * 3] ?? 0, mat[r * 3 + 1] ?? 0, mat[r * 3 + 2] ?? 0))
							return rows
					}
				}
			}
		}
	}
	return rows
}

/** Low-level delta row reader (one row = nodeId, kind, p0..p3). */
export function readDeltaRow(
	slot: Float32Array,
	row: number,
): { nodeId: number; kind: number; p0: number; p1: number; p2: number; p3: number } {
	const o = F_DELTAS + row * DELTA_STRIDE
	return {
		nodeId: slot[o] ?? 0,
		kind: slot[o + 1] ?? 0,
		p0: slot[o + 2] ?? 0,
		p1: slot[o + 3] ?? 0,
		p2: slot[o + 4] ?? 0,
		p3: slot[o + 5] ?? 0,
	}
}

/**
 * Group Scalar delta rows back into (nodeId, fieldName, values) calls,
 * reassembling multi-row matrix fields. Unknown or malformed rows are skipped.
 */
export function groupDeltaFields(
	slot: Float32Array,
	count: number,
	apply: (nodeId: number, fieldName: string, values: number[]) => void,
): void {
	let i = 0
	while (i < count) {
		const row = readDeltaRow(slot, i)
		i++
		if (row.kind !== DeltaKind.Scalar) continue
		const fieldName = FIELD_NAMES[row.p0]
		const arity = FIELD_ARITY[row.p0]
		if (!fieldName || !arity) continue
		const values = [row.p1, row.p2, row.p3].slice(0, Math.min(arity, 3))
		while (values.length < arity && i < count) {
			const next = readDeltaRow(slot, i)
			if (next.kind !== DeltaKind.Scalar || next.nodeId !== row.nodeId || next.p0 !== row.p0) break
			values.push(next.p1, next.p2, next.p3)
			i++
		}
		apply(row.nodeId, fieldName, values.slice(0, arity))
	}
}

/**
 * Assign decoded field values into a live state object, preserving pooled
 * members: numbers/booleans assign, vectors set in place, 3x3s copy elements.
 * Returns false when the field is missing or shape-mismatched (skip it).
 */
export function setStateField(state: Record<string, unknown>, field: string, values: number[]): boolean {
	const current = state[field]
	if (typeof current === 'number') {
		if (!Number.isFinite(values[0])) return false
		state[field] = values[0] as unknown
		return true
	}
	if (typeof current === 'boolean') {
		state[field] = (values[0] !== 0) as unknown
		return true
	}
	if (typeof current === 'object' && current !== null) {
		const o = current as Record<string, unknown>
		if (typeof o.x === 'number' && typeof o.y === 'number' && values.length >= 2) {
			o.x = values[0] as unknown
			o.y = values[1] as unknown
			if (typeof o.z === 'number' && values.length >= 3) o.z = values[2] as unknown
			return true
		}
		const els = (o as { elements?: unknown }).elements
		if (Array.isArray(els) && els.length === 9 && values.length >= 9) {
			for (let k = 0; k < 9; k++) els[k] = values[k]
			return true
		}
		if ((els instanceof Float32Array || els instanceof Float64Array) && els.length === 9 && values.length >= 9) {
			for (let k = 0; k < 9; k++) els[k] = values[k] ?? 0
			return true
		}
	}
	return false
}

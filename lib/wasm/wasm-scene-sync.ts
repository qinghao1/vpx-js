// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import type { Vertex3D } from '../math/vector.js'
import type { IRenderApi } from '../render/irender-api.js'
import { logger } from '../util/logger.js'
import type { BallState } from '../vpt/ball/ball-state.js'
import type { BallUpdater } from '../vpt/ball/ball-updater.js'
import type { ItemState } from '../vpt/item-state.js'
import type { ItemUpdater } from '../vpt/item-updater.js'
import type { Table } from '../vpt/table/table.js'
import { MoverType, WASM_STRIDES } from './vpinball-wasm.js'

/**
 * Applies headless-engine state buffers to the Three.js scene.
 *
 * Only the producer changes: this writes WASM buffer values into the existing
 * `*State` objects and calls the existing `*Updater.applyState`, so mesh and
 * material code stays as it is. The host (viewer) owns scene nodes, updaters,
 * and the lightmap fan-out; this never touches three.js directly.
 *
 * Row layouts mirror `VpxWasm_GetBuffer` (see `FillBuffers`). All views are
 * `Float32Array`s over `HEAPF32`. Movers share one fixed stride; the type tag
 * in column 1 selects the column meaning.
 *
 * - balls stride 16: id, pos xyz, radius, 9×orientation (row-major), color, visible
 * - movers stride 8: partIdx, type, a, b, c, d, visible, reserved
 *   - flipper: a=angleRad; plunger: a=pos,b=frameStart,c=frameEnd;
 *     spinner/gate: a=angleRad; bumper: a=ringOffset,b=rotX,c=rotY,d=visBits
 *     (bit0 cap, bit1 base, bit2 ring, bit3 skirt); hittarget: a=offset,b=dropped;
 *     trigger: a=offset
 * - lights stride 8: partIdx, current, base, scale, inPlay, color, color2, visible
 * - prims stride 22: partIdx, pos xyz, size xyz, rotAndTra×9
 *   (rotation[0..2], translation[3..5], objectRotation[6..8]),
 *   visible, color, alpha, disableLightingTop, disableLightingBelow, currentFrame
 * - flashers stride 8: partIdx, visible, alpha, color, intensityScale,
 *   modulateVsAdd, addBlend, inPlayState
 */

/** Scene-side binding for one engine part. */
export interface PartSlot<NODE> {
	readonly obj: NODE
	readonly state: ItemState
	readonly updater: ItemUpdater<ItemState>
}

/** Host lookups. `plungerFrameCount` is the scene-side mesh frame count. */
export interface SyncScene<NODE> {
	part(partIdx: number): PartSlot<NODE> | undefined
	plungerFrameCount(partIdx: number): number
}

/**
 * Host policy for engine state the scene must not honor. `neverHide` names
 * part indices the engine must never hide: room/cabinet content that
 * authors and scripts hide on desktop, but this showcase viewer keeps
 * visible in both viewer and play modes. Everything else in the row
 * still applies.
 */
export interface WasmSyncPolicy {
	neverHide?: (partIdx: number) => boolean
	/**
	 * Parts the engine must never show: host-hidden nodes (e.g. the
	 * force-hidden playfield decoy the generated base slab replaces).
	 * Wins over the row and over neverHide; other row state still applies.
	 */
	neverShow?: (partIdx: number) => boolean
	/**
	 * Current script image name for a flasher part, once the bridge exposes
	 * one (`VpxWasm_GetFlasherImage`). `undefined` means unknown: the row's
	 * image state stays untouched. Absent keeps the identical-row fast path
	 * free of host calls; present polls once per slotted flasher row per
	 * frame, because script swaps move no numeric column.
	 */
	flasherImage?: (partIdx: number) => string | undefined
}

/** Host-owned ball lifetime; spawn builds the node, data, state, and updater. */
export interface BallSlot<NODE> {
	readonly obj: NODE
	readonly state: BallState
	readonly updater: BallUpdater
}

export interface BallScene<NODE> {
	get(id: number): BallSlot<NODE> | undefined
	spawn(id: number, radius: number, color: number): BallSlot<NODE>
	remove(id: number): void
}

export interface SyncCounts {
	readonly ballsSpawned: number
	readonly ballsMoved: number
	readonly ballsRemoved: number
	readonly movers: number
	readonly lights: number
	readonly prims: number
	readonly flashers: number
}

/**
 * `syncAll` result: change counts plus the light parts whose col-1
 * intensity changed this frame. The viewer maps those to names for the
 * lightmap fan-out, so the engine no longer re-walks the lights buffer.
 */
export interface SyncResult extends SyncCounts {
	readonly changedLightParts: readonly number[]
}

/** Bumper visibility bits (column 5 of a bumper row): cap, base, ring, skirt. */
const BUMPER_VIS_BITS = ['isCapVisible', 'isBaseVisible', 'isRingVisible', 'isSkirtVisible'] as const

const EMPTY = new Float32Array(0)

export class WasmSceneSync<NODE, GEOMETRY, POINT_LIGHT> {
	constructor(
		private readonly scene: SyncScene<NODE>,
		private readonly balls: BallScene<NODE>,
		private readonly renderApi: IRenderApi<NODE, GEOMETRY, POINT_LIGHT>,
		private readonly table: Table,
		private readonly policy: WasmSyncPolicy = {},
	) {}

	private keepVisible(partIdx: number): boolean {
		try {
			return this.policy.neverHide?.(partIdx) === true
		} catch {
			return false
		}
	}

	private resolveVisible(rowVisible: boolean, partIdx: number): boolean {
		return (rowVisible || this.keepVisible(partIdx)) && !this.neverShow(partIdx)
	}

	private neverShow(partIdx: number): boolean {
		try {
			return this.policy.neverShow?.(partIdx) === true
		} catch {
			return false
		}
	}

	private flasherImage(partIdx: number): string | undefined {
		try {
			const image = this.policy.flasherImage?.(partIdx)
			return typeof image === 'string' ? image : undefined
		} catch {
			return undefined
		}
	}

	/** Last applied row per part, one map per category (part indices collide across kinds). */
	private readonly lastMoverRows = new Map<number, Float32Array>()
	private readonly lastLightRows = new Map<number, Float32Array>()
	private readonly lastPrimRows = new Map<number, Float32Array>()
	private readonly lastFlasherRows = new Map<number, Float32Array>()
	/** Last applied script image per flasher part; unset until a slot applies one. */
	private readonly lastFlasherImages = new Map<number, string>()
	/** Cumulative applied light-row changes; harness boot/activity signal. */
	private totalLightChanges = 0

	/**
	 * Read-only flipper angles for harnesses: [partIdx, angleRad].
	 * Public so harnesses never reach into the private row snapshots.
	 */
	public flipperAngles(): { partIdx: number; angle: number }[] {
		const out: { partIdx: number; angle: number }[] = []
		for (const [partIdx, row] of this.lastMoverRows)
			if (row[1] === MoverType.Flipper) out.push({ partIdx, angle: row[2]! })
		return out
	}

	/**
	 * Read-only ball poses for harnesses: [id, x, y, z] in engine units.
	 * Public so harnesses never reach into the private row snapshots.
	 */
	public ballPoses(): { id: number; x: number; y: number; z: number }[] {
		const out: { id: number; x: number; y: number; z: number }[] = []
		for (const [id, row] of this.lastBallRows) out.push({ id, x: row[1]!, y: row[2]!, z: row[3]! })
		return out
	}

	/** Cumulative applied light-row changes; harness boot/activity signal. */
	public get lightActivity(): number {
		return this.totalLightChanges
	}
	private readonly liveIds = new Set<number>()
	private readonly spawnErrors = new Set<number>()
	/** Last applied ball row per id; identical frames skip apply entirely. */
	private readonly lastBallRows = new Map<number, Float32Array>()
	/**
	 * Last col-1 intensity per light part, tracked for every buffer row
	 * whether or not a scene slot exists (buffer-only parts still report;
	 * the host drops names it cannot resolve).
	 */
	private readonly lastLightValues = new Map<number, number>()
	/** Scratch for the current frame's col-1 changes; copied out on return. */
	private readonly lightChanges: number[] = []
	/** Scratch for the current frame's live ball ids; cleared, never reallocated. */
	private readonly seenIds = new Set<number>()

	/** True when the row matches the last applied row for this part. */
	private static rowsEqual(known: Map<number, Float32Array>, partIdx: number, row: Float32Array): boolean {
		const prev = known.get(partIdx)
		if (!prev || prev.length !== row.length) return false
		for (let c = 0; c < row.length; c++) {
			if (prev[c] !== row[c]) return false
		}
		return true
	}

	/**
	 * Records the applied row. Only call after a successful apply: a part
	 * with no slot must not advance the snapshot, or a late-appearing slot
	 * would inherit engine values its state never received.
	 */
	private static snapRow(known: Map<number, Float32Array>, partIdx: number, row: Float32Array): void {
		let snap = known.get(partIdx)
		if (!snap || snap.length !== row.length) {
			snap = new Float32Array(row.length)
			known.set(partIdx, snap)
		}
		snap.set(row)
	}

	public syncAll(buffers: {
		balls: Float32Array
		movers: Float32Array
		lights: Float32Array
		prims: Float32Array
		flashers: Float32Array
	}): SyncResult {
		this.lightChanges.length = 0
		let ballsSpawned = 0
		let ballsMoved = 0
		let ballsRemoved = 0
		const stride = WASM_STRIDES.balls
		// Empty fast path: no rows and no live balls means no Set, no spread,
		// no removals. Live balls with an empty view still drain below.
		if (buffers.balls.length > 0 || this.liveIds.size > 0) {
			const seen = this.seenIds
			seen.clear()
			for (let i = 0; i + stride <= buffers.balls.length; i += stride) {
				const row = buffers.balls.subarray(i, i + stride)
				const id = row[0]!
				seen.add(id)
				const existed = this.liveIds.has(id)
				const slot = existed ? this.balls.get(id) : this.spawnBall(id, row)
				if (!slot) continue
				if (WasmSceneSync.rowsEqual(this.lastBallRows, id, row)) continue
				this.applyBallRow(slot, row)
				WasmSceneSync.snapRow(this.lastBallRows, id, row)
				ballsMoved++
				if (!existed) ballsSpawned++
			}
			// Delete-during-iteration is safe for Sets: no copy needed.
			for (const id of this.liveIds) {
				if (!seen.has(id)) {
					this.balls.remove(id)
					this.liveIds.delete(id)
					this.lastBallRows.delete(id)
					ballsRemoved++
				}
			}
		}
		return {
			ballsSpawned,
			ballsMoved,
			ballsRemoved,
			movers: this.syncMovers(buffers.movers),
			lights: this.syncLights(buffers.lights),
			prims: this.syncPrims(buffers.prims),
			flashers: this.syncFlashers(buffers.flashers),
			changedLightParts: [...this.lightChanges],
		}
	}

	private spawnBall(id: number, row: Float32Array): BallSlot<NODE> | undefined {
		try {
			const slot = this.balls.spawn(id, row[4]!, row[14]!)
			this.liveIds.add(id)
			return slot
		} catch {
			// Log once per id: a persistent spawn fault (e.g. a wrong
			// generator method) would otherwise fail silently every frame.
			if (!this.spawnErrors.has(id)) {
				this.spawnErrors.add(id)
				logger().warn('[sync] Ball spawn failed for id %d', id)
			}
			return undefined
		}
	}

	private applyBallRow(slot: BallSlot<NODE>, row: Float32Array): void {
		slot.state.pos.set(row[1]!, row[2]!, row[3]!)
		slot.state.orientation.matrix = [
			[row[5]!, row[6]!, row[7]!],
			[row[8]!, row[9]!, row[10]!],
			[row[11]!, row[12]!, row[13]!],
		]
		slot.state.isVisible = row[15]! !== 0
		slot.updater.applyState(slot.obj, slot.state, this.renderApi, this.table)
	}

	public syncBalls(view: Float32Array): { spawned: number; moved: number; removed: number } {
		const counts = this.syncAll({ balls: view, movers: EMPTY, lights: EMPTY, prims: EMPTY, flashers: EMPTY })
		return { spawned: counts.ballsSpawned, moved: counts.ballsMoved, removed: counts.ballsRemoved }
	}

	public syncMovers(view: Float32Array): number {
		const stride = WASM_STRIDES.movers
		if (view.length === 0) return 0
		let applied = 0
		for (let i = 0; i + stride <= view.length; i += stride) {
			const partIdx = view[i]!
			const type = view[i + 1]!
			// Unknown types never apply (and must not seed the snapshot).
			if (!Number.isInteger(type) || type < MoverType.Flipper || type > MoverType.Trigger) continue
			const row = view.subarray(i, i + stride)
			// Static fast path: identical rows skip the host lookup; rows
			// without a snapshot (first sight, slot-less) never match.
			if (WasmSceneSync.rowsEqual(this.lastMoverRows, partIdx, row)) continue
			const slot = this.scene.part(partIdx)
			if (!slot) continue
			if (this.applyMoverRow(slot, partIdx, type, row)) {
				WasmSceneSync.snapRow(this.lastMoverRows, partIdx, row)
				applied++
			}
		}
		return applied
	}

	private applyMoverRow(slot: PartSlot<NODE>, partIdx: number, type: number, row: Float32Array): boolean {
		// Unknown types must not touch state at all (the visibility write
		// below would otherwise diverge it without ever applying).
		if (!Number.isInteger(type) || type < MoverType.Flipper || type > MoverType.Trigger) return false
		const s = slot.state as unknown as Record<string, number | boolean>
		// Visibility first: BumperState derives isVisible from its four part flags
		// (setting it broadcasts to all of them), so the bumper branch below
		// re-asserts the engine bits afterwards.
		s['isVisible'] = this.resolveVisible(row[6]! !== 0, partIdx)
		switch (type) {
			case MoverType.Flipper:
				s['angle'] = row[2]!
				break
			case MoverType.Plunger: {
				const frames = Math.max(1, this.scene.plungerFrameCount(partIdx))
				const t = row[4]! === row[3]! ? 0 : (row[2]! - row[3]!) / (row[4]! - row[3]!)
				// A corrupt row must not poison state with NaN: skip the row.
				if (!Number.isFinite(t)) return false
				s['frame'] = Math.min(frames - 1, Math.max(0, Math.round(t * (frames - 1))))
				break
			}
			case MoverType.Spinner:
			case MoverType.Gate:
				s['angle'] = row[2]!
				break
			case MoverType.Bumper: {
				s['ringOffset'] = row[2]!
				s['skirtRotX'] = row[3]!
				s['skirtRotY'] = row[4]!
				const bits = row[5]! | 0
				for (let b = 0; b < BUMPER_VIS_BITS.length; b++) {
					s[BUMPER_VIS_BITS[b]!] = (bits & (1 << b)) !== 0
				}
				break
			}
			case MoverType.HitTarget:
				s['zOffset'] = row[2]!
				s['isDropped'] = row[3]! !== 0
				break
			case MoverType.Trigger:
				s['heightOffset'] = row[2]!
				break
			default:
				return false
		}
		slot.updater.applyState(slot.obj, slot.state, this.renderApi, this.table)
		return true
	}

	public syncLights(view: Float32Array): number {
		const stride = WASM_STRIDES.lights
		if (view.length === 0) return 0
		let applied = 0
		for (let i = 0; i + stride <= view.length; i += stride) {
			const partIdx = view[i]!
			const row = view.subarray(i, i + stride)
			const intensity = row[1]!
			if (!Object.is(this.lastLightValues.get(partIdx), intensity)) {
				this.lastLightValues.set(partIdx, intensity)
				this.lightChanges.push(partIdx)
				this.totalLightChanges++
			}
			// Static fast path: identical rows skip the host lookup. The
			// col-1 report above still runs for every row, slot or not.
			if (WasmSceneSync.rowsEqual(this.lastLightRows, partIdx, row)) continue
			const slot = this.scene.part(partIdx)
			if (!slot) continue
			const s = slot.state as unknown as Record<string, number | boolean>
			s['intensity'] = row[1]!
			s['baseIntensity'] = row[2]!
			s['intensityScale'] = row[3]!
			s['inPlayState'] = row[4]! !== 0
			s['color'] = row[5]!
			s['colorFull'] = row[6]!
			s['isVisible'] = this.resolveVisible(row[7]! !== 0, partIdx)
			slot.updater.applyState(slot.obj, slot.state, this.renderApi, this.table)
			WasmSceneSync.snapRow(this.lastLightRows, partIdx, row)
			applied++
		}
		return applied
	}

	public syncPrims(view: Float32Array): number {
		const stride = WASM_STRIDES.prims
		if (view.length === 0) return 0
		let applied = 0
		for (let i = 0; i + stride <= view.length; i += stride) {
			const partIdx = view[i]!
			const row = view.subarray(i, i + stride)
			// Static fast path: identical rows skip the host lookup; rows
			// without a snapshot (first sight, slot-less) never match.
			if (WasmSceneSync.rowsEqual(this.lastPrimRows, partIdx, row)) continue
			const slot = this.scene.part(partIdx)
			if (!slot) continue
			const s = slot.state as unknown as Record<string, number | boolean | Vertex3D>
			const num = (col: number): number => row[col]!
			;(s['position'] as Vertex3D).set(num(1), num(2), num(3))
			;(s['size'] as Vertex3D).set(num(4), num(5), num(6))
			;(s['rotation'] as Vertex3D).set(num(7), num(8), num(9))
			;(s['translation'] as Vertex3D).set(num(10), num(11), num(12))
			;(s['objectRotation'] as Vertex3D).set(num(13), num(14), num(15))
			s['isVisible'] = this.resolveVisible(num(16) !== 0, partIdx)
			s['color'] = num(17)
			s['alpha'] = num(18)
			s['disableLightingTop'] = num(19)
			s['disableLightingBelow'] = num(20)
			s['currentFrame'] = num(21)
			slot.updater.applyState(slot.obj, slot.state, this.renderApi, this.table)
			WasmSceneSync.snapRow(this.lastPrimRows, partIdx, row)
			applied++
		}
		return applied
	}

	public syncFlashers(view: Float32Array): number {
		const stride = WASM_STRIDES.flashers
		if (view.length === 0) return 0
		const pollImage = this.policy.flasherImage !== undefined
		let applied = 0
		for (let i = 0; i + stride <= view.length; i += stride) {
			const partIdx = view[i]!
			const row = view.subarray(i, i + stride)
			const staticRow = WasmSceneSync.rowsEqual(this.lastFlasherRows, partIdx, row)
			if (staticRow && !pollImage) continue
			const slot = this.scene.part(partIdx)
			// Slot-less rows apply nothing: resolve the slot before polling
			// so identical rows never decode names the frame will drop.
			if (!slot) continue
			// A present image policy still polls on identical rows: script
			// image swaps move no numeric column. The host lookup below still
			// runs only when something may apply.
			const image = pollImage ? this.flasherImage(partIdx) : undefined
			const imageChanged = image !== undefined && image !== this.lastFlasherImages.get(partIdx)
			if (staticRow && !imageChanged) continue
			const s = slot.state as unknown as Record<string, number | boolean | string>
			if (!staticRow) {
				s['isVisible'] = this.resolveVisible(row[1]! !== 0, partIdx)
				s['alpha'] = row[2]!
				s['color'] = row[3]!
				s['intensityScale'] = row[4]!
				s['modulateVsAdd'] = row[5]!
				s['addBlend'] = row[6]! !== 0
				s['inPlayState'] = row[7]! !== 0
				WasmSceneSync.snapRow(this.lastFlasherRows, partIdx, row)
			}
			if (imageChanged) s['imageA'] = image!
			slot.updater.applyState(slot.obj, slot.state, this.renderApi, this.table)
			if (imageChanged) this.lastFlasherImages.set(partIdx, image!)
			applied++
		}
		return applied
	}
}

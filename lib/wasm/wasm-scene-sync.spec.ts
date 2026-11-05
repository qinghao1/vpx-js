// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import { TableBuilder } from '../../test/table-builder.js'
import { TestRenderApi } from '../../test/test-render-api.js'
import { Vertex2D, Vertex3D } from '../math/vector.js'
import { BallData } from '../vpt/ball/ball-data.js'
import { BallState } from '../vpt/ball/ball-state.js'
import { BallUpdater } from '../vpt/ball/ball-updater.js'
import { FlasherData } from '../vpt/flasher/flasher-data.js'
import { FlasherState } from '../vpt/flasher/flasher-state.js'
import { FlasherUpdater } from '../vpt/flasher/flasher-updater.js'
import type { ItemState } from '../vpt/item-state.js'
import type { ItemUpdater } from '../vpt/item-updater.js'
import { LightState } from '../vpt/light/light.js'
import { LightUpdater } from '../vpt/light/light-view.js'
import { PlungerData } from '../vpt/plunger/plunger-data.js'
import { PlungerMeshGenerator } from '../vpt/plunger/plunger-mesh-generator.js'
import { PlungerState } from '../vpt/plunger/plunger-state.js'
import { PlungerUpdater } from '../vpt/plunger/plunger-updater.js'
import type { RawHeadlessModule } from './vpinball-wasm.js'
import {
	DmdFrameFormat,
	floatRowView,
	HeadlessEngineMissingError,
	loadHeadlessEngine,
	MoverType,
	WASM_STRIDES,
	wrapHeadlessEngine,
} from './vpinball-wasm.js'
import type { BallScene, BallSlot, PartSlot, SyncScene } from './wasm-scene-sync.js'
import { WasmSceneSync } from './wasm-scene-sync.js'

/** FlasherData's constructor is private; construct fixtures through a minimal cast. */
function createFlasherData(name: string): FlasherData {
	const ctor = FlasherData as unknown as new (itemName: string) => FlasherData
	return new ctor(name)
}

class RecordingApi extends TestRenderApi {
	public matrices: { matrix: unknown; node: unknown }[] = []
	public lightings: { state: unknown; node: unknown }[] = []
	public visibilities: { visible: unknown; node: unknown }[] = []

	public override applyMatrixToNode(matrix: any, node: any): void {
		this.matrices.push({ matrix, node })
	}

	public override applyLighting(state: any, node: any): void {
		this.lightings.push({ state, node })
	}

	public override applyVisibility(isVisible: any, node: any): void {
		this.visibilities.push({ visible: isVisible, node })
	}
}

function mockScene(slots: Map<number, PartSlot<object>>): SyncScene<object> {
	return {
		part: (partIdx: number) => slots.get(partIdx),
		plungerFrameCount: () => 5,
	}
}

function mockBalls(): BallScene<object> & { spawned: BallSlot<object>[]; removed: number[] } {
	const live = new Map<number, BallSlot<object>>()
	const spawned: BallSlot<object>[] = []
	const removed: number[] = []
	return {
		spawned,
		removed,
		get: (id: number) => live.get(id),
		spawn: (id: number, radius: number, color: number) => {
			const data = new BallData(radius)
			data.color = color
			const state = BallState.claim(`ball-${id}`, Vertex3D.claim(0, 0, 0))
			const slot: BallSlot<object> = { obj: {}, state, updater: new BallUpdater(state, data) }
			live.set(id, slot)
			spawned.push(slot)
			return slot
		},
		remove: (id: number) => {
			live.delete(id)
			removed.push(id)
		},
	}
}

function slotFor<NODE>(obj: NODE, state: ItemState, updater: ItemUpdater<any>): PartSlot<NODE> {
	return { obj, state, updater: updater as ItemUpdater<ItemState> }
}

describe('WASM scene sync', () => {
	it('skips apply on identical ball frames so dirty-gating can rest', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const balls = mockBalls()
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), balls, api as any, table)
		const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
		const row = (id: number, x: number): number[] => [id, x, 20, 30, 25, ...identity, 0xff0000, 1]
		sync.syncBalls(new Float32Array(row(7, 10)))
		const matrices = api.matrices.length
		const second = sync.syncBalls(new Float32Array(row(7, 10)))
		expect(second.moved).toBe(0)
		expect(api.matrices).toHaveLength(matrices)
	})

	it('spawns, moves, and removes balls from the ball buffer', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const balls = mockBalls()
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), balls, api as any, table)
		const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
		const row = (id: number, x: number): number[] => [id, x, 20, 30, 25, ...identity, 0xff0000, 1]
		const first = sync.syncBalls(new Float32Array(row(7, 10)))
		expect(first.spawned).toBe(1)
		expect(first.moved).toBe(1)
		expect(balls.spawned).toHaveLength(1)
		expect(balls.spawned[0]!.state.pos.x).toBe(10)
		expect(api.matrices).toHaveLength(1)

		const second = sync.syncBalls(new Float32Array(row(7, 40)))
		expect(second.spawned).toBe(0)
		expect(second.moved).toBe(1)
		expect(balls.spawned[0]!.state.pos.x).toBe(40)

		const third = sync.syncBalls(new Float32Array(0))
		expect(third.removed).toBe(1)
		expect(balls.removed).toEqual([7])
	})

	it('forwards ball visibility to the render node', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const balls = mockBalls()
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), balls, api as any, table)
		const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
		sync.syncBalls(new Float32Array([7, 10, 20, 30, 25, ...identity, 0xff0000, 1]))
		api.visibilities.length = 0
		sync.syncBalls(new Float32Array([7, 10, 20, 30, 25, ...identity, 0xff0000, 0]))
		expect(api.visibilities).toContainEqual({ visible: false, node: balls.spawned[0]!.obj })
	})

	it('applies flipper angle rows to the render node', () => {
		const table = new TableBuilder().addFlipper('F1').build()
		const api = new RecordingApi()
		const item = (
			table.flippers as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
		)['F1']!
		const slots = new Map<number, PartSlot<object>>([[0, slotFor({}, item.getState(), item.getUpdater())]])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		const applied = sync.syncMovers(new Float32Array([0, MoverType.Flipper, 0.5, 0, 0, 0, 1, 0]))
		expect(applied).toBe(1)
		expect((item.getState() as unknown as { angle: number }).angle).toBe(0.5)
		expect(api.matrices).toHaveLength(1)
		expect(api.matrices[0]!.node).toBe(slots.get(0)!.obj)
	})

	it('ignores unknown mover types without touching state', () => {
		const table = new TableBuilder().addFlipper('F1').build()
		const api = new RecordingApi()
		const item = (
			table.flippers as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
		)['F1']!
		const state = item.getState() as unknown as { angle: number; isVisible: boolean }
		state.angle = 0.1
		state.isVisible = false
		const slots = new Map<number, PartSlot<object>>([[0, slotFor({}, item.getState(), item.getUpdater())]])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		expect(sync.syncMovers(new Float32Array([0, 99, 0.5, 0, 0, 0, 1, 0]))).toBe(0)
		expect(state.angle).toBe(0.1)
		expect(state.isVisible).toBe(false)
	})

	it('maps plunger travel to mesh frames', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const PlungerDataCtor = PlungerData as unknown as new (itemName: string) => PlungerData
		const data = new PlungerDataCtor('P1')
		data.center = new Vertex2D(500, 500)
		const state = PlungerState.claim('P1', 0, true)
		const slots = new Map<number, PartSlot<object>>([
			[2, slotFor({}, state, new PlungerUpdater(state, new PlungerMeshGenerator(data)))],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		sync.syncMovers(new Float32Array([2, MoverType.Plunger, 0, 0, 100, 0, 1, 0]))
		expect(state.frame).toBe(0)
		sync.syncMovers(new Float32Array([2, MoverType.Plunger, 100, 0, 100, 0, 1, 0]))
		expect(state.frame).toBe(4)
		sync.syncMovers(new Float32Array([2, MoverType.Plunger, 50, 0, 100, 0, 1, 0]))
		expect(state.frame).toBe(2)
	})

	it('never poisons plunger state with NaN', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const PlungerDataCtor = PlungerData as unknown as new (itemName: string) => PlungerData
		const data = new PlungerDataCtor('P1')
		data.center = new Vertex2D(500, 500)
		const state = PlungerState.claim('P1', 0, true)
		const slots = new Map<number, PartSlot<object>>([
			[2, slotFor({}, state, new PlungerUpdater(state, new PlungerMeshGenerator(data)))],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		sync.syncMovers(new Float32Array([2, MoverType.Plunger, 50, 0, 100, 0, 1, 0]))
		expect(state.frame).toBe(2)
		sync.syncMovers(new Float32Array([2, MoverType.Plunger, Number.NaN, 0, 100, 0, 1, 0]))
		expect(Number.isNaN(state.frame)).toBe(false)
		expect(state.frame).toBe(2)
	})

	it('applies spinner, gate, bumper, target, and trigger rows', () => {
		const table = new TableBuilder()
			.addMaterial('opaque', { isOpacityActive: false })
			.addSpinner('S1')
			.addGate('G1')
			.addBumper('B1', {
				szCapMaterial: 'opaque',
				szRingMaterial: 'opaque',
				szBaseMaterial: 'opaque',
				szSkirtMaterial: 'opaque',
			})
			.addHitTarget('H1')
			.addTrigger('T1')
			.build()
		const api = new RecordingApi()
		const byName = (collection: unknown, name: string): { getState(): ItemState; getUpdater(): ItemUpdater<any> } =>
			(collection as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>)[name]!
		const spinner = byName(table.spinners, 'S1')
		const gate = byName(table.gates, 'G1')
		const bumper = byName(table.bumpers, 'B1')
		const target = byName(table.hitTargets, 'H1')
		const trigger = byName(table.triggers, 'T1')
		const slots = new Map<number, PartSlot<object>>([
			[10, slotFor({}, spinner.getState(), spinner.getUpdater())],
			[11, slotFor({}, gate.getState(), gate.getUpdater())],
			[12, slotFor({}, bumper.getState(), bumper.getUpdater())],
			[13, slotFor({}, target.getState(), target.getUpdater())],
			[14, slotFor({}, trigger.getState(), trigger.getUpdater())],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		const rows = new Float32Array([
			10,
			MoverType.Spinner,
			1.2,
			0,
			0,
			0,
			1,
			0,
			11,
			MoverType.Gate,
			0.3,
			0,
			0,
			0,
			1,
			0,
			12,
			MoverType.Bumper,
			2.5,
			0.1,
			-0.2,
			0b0101,
			1,
			0,
			13,
			MoverType.HitTarget,
			-4,
			1,
			0,
			0,
			1,
			0,
			14,
			MoverType.Trigger,
			7,
			0,
			0,
			0,
			0,
			0,
		])
		expect(sync.syncMovers(rows)).toBe(5)
		// Rows cross the WASM heap as f32, so angles arrive with float32 rounding.
		expect((spinner.getState() as unknown as { angle: number }).angle).toBeCloseTo(1.2, 6)
		expect((gate.getState() as unknown as { angle: number }).angle).toBeCloseTo(0.3, 6)
		const bumperState = bumper.getState() as unknown as Record<string, number | boolean>
		expect(bumperState['ringOffset']).toBe(2.5)
		expect(bumperState['skirtRotX']).toBeCloseTo(0.1, 6)
		expect(bumperState['skirtRotY']).toBeCloseTo(-0.2, 6)
		expect(bumperState['isCapVisible']).toBe(true)
		expect(bumperState['isBaseVisible']).toBe(false)
		expect(bumperState['isRingVisible']).toBe(true)
		expect(bumperState['isSkirtVisible']).toBe(false)
		const targetState = target.getState() as unknown as Record<string, number | boolean>
		expect(targetState['zOffset']).toBe(-4)
		expect(targetState['isDropped']).toBe(true)
		const triggerState = trigger.getState() as unknown as Record<string, number | boolean>
		expect(triggerState['heightOffset']).toBe(7)
		expect(triggerState['isVisible']).toBe(false)
	})

	it('ignores unknown mover types and missing parts', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), mockBalls(), api as any, table)
		expect(sync.syncMovers(new Float32Array([9, 99, 0, 0, 0, 0, 1, 0]))).toBe(0)
		expect(sync.syncLights(new Float32Array([9, 1, 1, 1, 1, 1, 1, 1]))).toBe(0)
		expect(api.matrices).toHaveLength(0)
		expect(api.lightings).toHaveLength(0)
	})

	it('feeds light rows into the light updater', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const state = LightState.claim('L1', 0, 0, 0)
		const slots = new Map<number, PartSlot<object>>([[20, slotFor({}, state, new LightUpdater(state))]])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		const applied = sync.syncLights(new Float32Array([20, 2.5, 10, 0.5, 1, 0xff0000, 0x00ff00, 1]))
		expect(applied).toBe(1)
		expect(state.intensity).toBe(2.5)
		expect(state.baseIntensity).toBe(10)
		expect(state.intensityScale).toBe(0.5)
		expect(state.inPlayState).toBe(true)
		expect(state.color).toBe(0xff0000)
		expect(state.colorFull).toBe(0x00ff00)
		expect(api.lightings).toHaveLength(1)
		expect(api.lightings[0]!.node).toBe(slots.get(20)!.obj)
	})

	it('applies primitive dirty rows to position, size, and rotation', () => {
		const table = new TableBuilder().addPrimitive('PR1').build()
		const api = new RecordingApi()
		const item = (
			table.primitives as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
		)['PR1']!
		const slots = new Map<number, PartSlot<object>>([[30, slotFor({}, item.getState(), item.getUpdater())]])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		const applied = sync.syncPrims(
			new Float32Array([30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 0x112233, 80, 0, 1, 3]),
		)
		expect(applied).toBe(1)
		const s = item.getState() as unknown as {
			position: Vertex3D
			size: Vertex3D
			rotation: Vertex3D
			translation: Vertex3D
			objectRotation: Vertex3D
			color: number
			alpha: number
			currentFrame: number
		}
		expect([s.position.x, s.position.y, s.position.z]).toEqual([1, 2, 3])
		expect([s.size.x, s.size.y, s.size.z]).toEqual([4, 5, 6])
		expect([s.rotation.x, s.rotation.y, s.rotation.z]).toEqual([7, 8, 9])
		expect([s.translation.x, s.translation.y, s.translation.z]).toEqual([10, 11, 12])
		expect([s.objectRotation.x, s.objectRotation.y, s.objectRotation.z]).toEqual([13, 14, 15])
		expect(s.color).toBe(0x112233)
		expect(s.alpha).toBe(80)
		expect(s.currentFrame).toBe(3)
	})

	it('drives flasher blend overrides from the flasher row', () => {
		const table = new TableBuilder().build()
		const api = new RecordingApi()
		const state = FlasherState.claim('FL1', true, 0, 100)
		const data = createFlasherData('FL1')
		data.dragPoints = []
		const slots = new Map<number, PartSlot<object>>([
			[40, slotFor({ visible: true, traverse() {} }, state, new FlasherUpdater(state, data))],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
		const applied = sync.syncFlashers(new Float32Array([40, 1, 80, 0xff0000, 0.75, 0.5, 1, 1]))
		expect(applied).toBe(1)
		expect(state.alpha).toBe(80)
		expect(state.color).toBe(0xff0000)
		expect(state.intensityScale).toBe(0.75)
		expect(state.modulateVsAdd).toBe(0.5)
		expect(state.addBlend).toBe(true)
		expect(state.inPlayState).toBe(true)
	})

	it('never hides exempt parts (authored VR room/cabinet)', () => {
		const table = new TableBuilder().addPrimitive('VR_MegaWall005').addPrimitive('PR2').build()
		const api = new RecordingApi()
		const byName = (collection: unknown, name: string): { getState(): ItemState; getUpdater(): ItemUpdater<any> } =>
			(collection as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>)[name]!
		const room = byName(table.primitives, 'VR_MegaWall005')
		const plain = byName(table.primitives, 'PR2')
		const slots = new Map<number, PartSlot<object>>([
			[30, slotFor({}, room.getState(), room.getUpdater())],
			[31, slotFor({}, plain.getState(), plain.getUpdater())],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table, {
			neverHide: idx => idx === 30,
		})
		const row = (idx: number): number[] => [
			idx,
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11,
			12,
			13,
			14,
			15,
			0,
			0x112233,
			80,
			0,
			1,
			3,
		]
		expect(sync.syncPrims(new Float32Array([...row(30), ...row(31)]))).toBe(2)
		expect((room.getState() as unknown as { isVisible: boolean }).isVisible).toBe(true)
		expect((plain.getState() as unknown as { isVisible: boolean }).isVisible).toBe(false)
		expect(api.visibilities.filter(v => v.visible === false)).toHaveLength(1)
	})

	it('never shows host-hidden parts even when the engine reports them visible', () => {
		const table = new TableBuilder().addPrimitive('playfield_mesh').addPrimitive('PR2').build()
		const api = new RecordingApi()
		const byName = (collection: unknown, name: string): { getState(): ItemState; getUpdater(): ItemUpdater<any> } =>
			(collection as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>)[name]!
		const decoy = byName(table.primitives, 'playfield_mesh')
		const plain = byName(table.primitives, 'PR2')
		const slots = new Map<number, PartSlot<object>>([
			[40, slotFor({}, decoy.getState(), decoy.getUpdater())],
			[41, slotFor({}, plain.getState(), plain.getUpdater())],
		])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table, {
			neverShow: idx => idx === 40,
		})
		const row = (idx: number): number[] => [
			idx,
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11,
			12,
			13,
			14,
			15,
			1,
			0xffffff,
			100,
			0,
			0,
			-1,
		]
		expect(sync.syncPrims(new Float32Array([...row(40), ...row(41)]))).toBe(2)
		expect((decoy.getState() as unknown as { isVisible: boolean }).isVisible).toBe(false)
		expect((plain.getState() as unknown as { isVisible: boolean }).isVisible).toBe(true)
	})

	it('neverShow wins over neverHide on the same part', () => {
		const table = new TableBuilder().addPrimitive('VR_MegaWall005').build()
		const api = new RecordingApi()
		const room = (table.primitives as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>)[
			'VR_MegaWall005'
		]!
		const slots = new Map<number, PartSlot<object>>([[30, slotFor({}, room.getState(), room.getUpdater())]])
		const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table, {
			neverHide: idx => idx === 30,
			neverShow: idx => idx === 30,
		})
		const row = [30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 0xffffff, 100, 0, 0, -1]
		expect(sync.syncPrims(new Float32Array(row))).toBe(1)
		expect((room.getState() as unknown as { isVisible: boolean }).isVisible).toBe(false)
	})

	it('pins the buffer contract: strides, tags, and DMD formats', () => {
		expect(WASM_STRIDES).toEqual({ balls: 16, movers: 8, lights: 8, prims: 22, flashers: 8 })
		expect(MoverType).toMatchObject({
			Flipper: 0,
			Plunger: 1,
			Spinner: 2,
			Gate: 3,
			Bumper: 4,
			HitTarget: 5,
			Trigger: 6,
		})
		expect(DmdFrameFormat).toMatchObject({ Lum32F: 1, Srgb888: 2, Srgb565: 3 })
		const heap = new ArrayBuffer(64)
		new Float32Array(heap).set([1, 2, 3, 4, 5, 6, 7, 8], 0)
		const view = floatRowView(heap, 0, 2, 4)
		expect([...view]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
	})

	it('fails honestly when the headless artifact is absent', async () => {
		await expect(loadHeadlessEngine('wasm/does-not-exist.js')).rejects.toThrow(HeadlessEngineMissingError)
	})

	it('maps the facade onto raw heap calls', async () => {
		const heap = new ArrayBuffer(256)
		const u8 = new Uint8Array(heap)
		const u32 = new Uint32Array(heap)
		const f32 = new Float32Array(heap)
		f32.set([1, 2, 3, 4, 0, 0, 0, 0], 24)
		f32.set([0.5, 0.25, 0.125, 1], 40)
		u32.set([96, 1, 8], 8)
		u32.set([160, 2, 2, 1, 7], 12)
		const calls: string[] = []
		let freed = -1
		const raw = {
			_VpxWasm_Init: () => (calls.push('Init'), 0),
			_VpxWasm_MountRom: () => (calls.push('MountRom'), 0),
			_VpxWasm_LoadTable: () => (calls.push('LoadTable'), 0),
			_VpxWasm_StepFrame: () => void calls.push('StepFrame'),
			_VpxWasm_GetPartCatalogJson: () => 4,
			_VpxWasm_GetBuffer: () => 32,
			_VpxWasm_GetDmdFrame: () => 48,
			_VpxWasm_PushKey: () => void calls.push('PushKey'),
			_VpxWasm_Nudge: () => void calls.push('Nudge'),
			_VpxWasm_GetScriptErrorCount: () => 0,
			_VpxWasm_GetScriptError: () => 0,
			_VpxWasm_DestroyTable: () => void calls.push('DestroyTable'),
			_malloc: (size: number) => (calls.push(`malloc:${size}`), 200),
			_free: (ptr: number) => void (freed = ptr),
			UTF8ToString: () => '[{"idx":0}]',
			HEAPU8: u8,
			HEAPU32: u32,
			HEAPF32: f32,
		} as unknown as RawHeadlessModule
		const engine = wrapHeadlessEngine(raw, 'test')
		expect(engine.init()).toBe(0)
		expect(engine.mountRom('twd_160h.zip', new Uint8Array([9, 9]))).toBe(0)
		expect(await engine.loadTable(new Uint8Array([7, 7, 7]))).toBe(0)
		expect(u8[200]).toBe(7)
		expect(u8[201]).toBe(7)
		expect(u8[202]).toBe(7)
		expect(freed).toBe(200)
		engine.stepFrame(16.7)
		expect(engine.getPartCatalogJson()).toBe('[{"idx":0}]')
		const movers = engine.getBuffer('movers')!
		expect(movers.count).toBe(1)
		expect(movers.stride).toBe(8)
		expect([...movers.view]).toEqual([1, 2, 3, 4, 0, 0, 0, 0])
		const dmd = engine.getDmdFrame()
		expect(dmd).toMatchObject({ width: 2, height: 2, format: 1, frameId: 7 })
		expect(dmd?.pixels ? [...dmd.pixels] : []).toEqual([0.5, 0.25, 0.125, 1])
		engine.pushKey(229, true)
		engine.nudge(30, 1)
		expect(engine.getScriptErrorCount()).toBe(0)
		expect(engine.getScriptError()).toBeUndefined()
		await engine.destroyTable()
		expect(calls).toEqual([
			'Init',
			'malloc:13',
			'malloc:2',
			'MountRom',
			'malloc:3',
			'LoadTable',
			'StepFrame',
			'PushKey',
			'Nudge',
			'DestroyTable',
		])
	})
	describe('per-row diff gating (F1)', () => {
		const primRow = (idx: number, x = 1): number[] => [
			idx,
			x,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			10,
			11,
			12,
			13,
			14,
			15,
			1,
			0x112233,
			80,
			0,
			1,
			3,
		]

		function primFixture(names: string[]): {
			sync: WasmSceneSync<object, unknown, unknown>
			api: RecordingApi
			slots: Map<number, PartSlot<object>>
			rows: (x?: number) => Float32Array
		} {
			const builder = new TableBuilder()
			for (const name of names) builder.addPrimitive(name)
			const table = builder.build()
			const api = new RecordingApi()
			const slots = new Map<number, PartSlot<object>>()
			const rows: number[][] = []
			names.forEach((name, n) => {
				const item = (
					table.primitives as unknown as Record<
						string,
						{ getState(): ItemState; getUpdater(): ItemUpdater<any> }
					>
				)[name]!
				slots.set(30 + n, slotFor({}, item.getState(), item.getUpdater()))
				rows.push(primRow(30 + n))
			})
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
			return {
				sync,
				api,
				slots,
				rows: (x?: number) =>
					new Float32Array(rows.flatMap(r => (x === undefined ? r : [r[0], x, ...r.slice(2)]))),
			}
		}

		it('skips applyState for identical prim rows and counts only real changes', () => {
			const { sync, api, rows } = primFixture(['PR1', 'PR2'])
			expect(sync.syncPrims(rows())).toBe(2)
			expect(api.matrices).toHaveLength(2)
			// Identical second frame: no updater work, no matrix writes, zero count.
			expect(sync.syncPrims(rows())).toBe(0)
			expect(api.matrices).toHaveLength(2)
		})

		it('reapplies when any prim column changes and then settles again', () => {
			const { sync, api, rows } = primFixture(['PR1'])
			expect(sync.syncPrims(rows())).toBe(1)
			expect(sync.syncPrims(rows(9))).toBe(1)
			expect(api.matrices).toHaveLength(2)
			expect(sync.syncPrims(rows(9))).toBe(0)
			expect(api.matrices).toHaveLength(2)
		})

		it('applies a late-appearing slot whose row the state never received', () => {
			const { sync, api, slots, rows } = primFixture(['PR1'])
			const slot = slots.get(30)!
			slots.delete(30)
			// No slot: nothing applies and the snapshot must not advance.
			expect(sync.syncPrims(rows())).toBe(0)
			// Slot reappears (e.g. nodeCache rebuild) with engine values the
			// state never received: the row must apply despite matching bytes.
			slots.set(30, slot)
			expect(sync.syncPrims(rows())).toBe(1)
			expect(api.matrices).toHaveLength(1)
		})

		it('skips identical mover, light, and flasher rows', () => {
			const table = new TableBuilder().addFlipper('F1').build()
			const api = new RecordingApi()
			const item = (
				table.flippers as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
			)['F1']!
			const lightState = LightState.claim('L1', 0, 0, 0)
			const flasherState = FlasherState.claim('FL1', true, 0, 100)
			const flasherData = createFlasherData('FL1')
			flasherData.dragPoints = []
			const slots = new Map<number, PartSlot<object>>([
				[0, slotFor({}, item.getState(), item.getUpdater())],
				[20, slotFor({}, lightState, new LightUpdater(lightState))],
				[
					40,
					slotFor(
						{ visible: true, traverse() {} },
						flasherState,
						new FlasherUpdater(flasherState, flasherData),
					),
				],
			])
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
			const mover = new Float32Array([0, MoverType.Flipper, 0.5, 0, 0, 0, 1, 0])
			const light = new Float32Array([20, 2.5, 10, 0.5, 1, 0xff0000, 0x00ff00, 1])
			const flasher = new Float32Array([40, 1, 80, 0xff0000, 0.75, 0.5, 1, 1])
			expect(sync.syncMovers(mover)).toBe(1)
			expect(sync.syncLights(light)).toBe(1)
			expect(sync.syncFlashers(flasher)).toBe(1)
			const matrices = api.matrices.length
			const lightings = api.lightings.length
			expect(sync.syncMovers(mover)).toBe(0)
			expect(sync.syncLights(light)).toBe(0)
			expect(sync.syncFlashers(flasher)).toBe(0)
			expect(api.matrices).toHaveLength(matrices)
			expect(api.lightings).toHaveLength(lightings)
		})

		it('reports zero change counts through syncAll on an identical frame', () => {
			const { sync, rows } = primFixture(['PR1'])
			const light = new Float32Array([99, 0, 0, 0, 0, 0, 0, 0])
			const buffers = {
				balls: new Float32Array(0),
				movers: new Float32Array(0),
				lights: light,
				prims: rows(),
				flashers: new Float32Array(0),
			}
			const first = sync.syncAll(buffers)
			expect(first.prims).toBe(1)
			const second = sync.syncAll(buffers)
			expect([second.movers, second.lights, second.prims, second.flashers]).toEqual([0, 0, 0, 0])
		})
	})

	describe('changed-light reporting (M2b)', () => {
		function lightFixture(): {
			sync: WasmSceneSync<object, unknown, unknown>
			lights: (col1: number[]) => Float32Array
		} {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const s20 = LightState.claim('L20', 0, 0, 0)
			const s21 = LightState.claim('L21', 0, 0, 0)
			const slots = new Map<number, PartSlot<object>>([
				[20, slotFor({}, s20, new LightUpdater(s20))],
				[21, slotFor({}, s21, new LightUpdater(s21))],
			])
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
			const row = (idx: number, v: number): number[] => [idx, v, 10, 0.5, 1, 0xff0000, 0x00ff00, 1]
			return { sync, lights: col1 => new Float32Array([...row(20, col1[0]!), ...row(21, col1[1]!)]) }
		}

		it('reports first-seen intensities once, then only real col1 changes', () => {
			const { sync, lights } = lightFixture()
			const buffers = (
				v: number[],
			): {
				balls: Float32Array
				movers: Float32Array
				lights: Float32Array
				prims: Float32Array
				flashers: Float32Array
			} => ({
				balls: new Float32Array(0),
				movers: new Float32Array(0),
				lights: lights(v),
				prims: new Float32Array(0),
				flashers: new Float32Array(0),
			})
			expect(sync.syncAll(buffers([2.5, 0])).changedLightParts).toEqual([20, 21])
			// Identical frame: nothing changed, nothing applied.
			const idle = sync.syncAll(buffers([2.5, 0]))
			expect(idle.changedLightParts).toEqual([])
			expect(idle.lights).toBe(0)
			// Col1 change on one lamp only; other-column edits never report.
			expect(sync.syncAll(buffers([3.5, 0])).changedLightParts).toEqual([20])
			expect(sync.syncAll(buffers([3.5, 0])).changedLightParts).toEqual([])
		})

		it('does not spam change reports for NaN intensity', () => {
			const { sync, lights } = lightFixture()
			const buffers = (v: number[]) => ({
				balls: new Float32Array(0),
				movers: new Float32Array(0),
				lights: lights(v),
				prims: new Float32Array(0),
				flashers: new Float32Array(0),
			})
			expect(sync.syncAll(buffers([Number.NaN, 0])).changedLightParts).toEqual([20, 21])
			expect(sync.syncAll(buffers([Number.NaN, 0])).changedLightParts).toEqual([])
		})

		it('still reports buffer-only parts with no scene slot', () => {
			const { sync, lights } = lightFixture()
			const withGhost = new Float32Array([...lights([1, 1]), 77, 5, 0, 0, 0, 0, 0, 0])
			const counts = sync.syncAll({
				balls: new Float32Array(0),
				movers: new Float32Array(0),
				lights: withGhost,
				prims: new Float32Array(0),
				flashers: new Float32Array(0),
			})
			expect(counts.lights).toBe(2)
			expect(counts.changedLightParts).toContain(77)
		})
	})

	describe('static fast paths', () => {
		function countingScene(slots: Map<number, PartSlot<object>>): {
			scene: SyncScene<object>
			calls: { part: number }
		} {
			const calls = { part: 0 }
			const scene: SyncScene<object> = {
				part: (partIdx: number) => {
					calls.part++
					return slots.get(partIdx)
				},
				plungerFrameCount: () => 5,
			}
			return { scene, calls }
		}

		it('performs zero host lookups for an identical frame', () => {
			const table = new TableBuilder().addFlipper('F1').addPrimitive('PR1').build()
			const api = new RecordingApi()
			const flipper = (
				table.flippers as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
			)['F1']!
			const prim = (
				table.primitives as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
			)['PR1']!
			const lightState = LightState.claim('L1', 0, 0, 0)
			const slots = new Map<number, PartSlot<object>>([
				[0, slotFor({}, flipper.getState(), flipper.getUpdater())],
				[20, slotFor({}, lightState, new LightUpdater(lightState))],
				[30, slotFor({}, prim.getState(), prim.getUpdater())],
			])
			const { scene, calls } = countingScene(slots)
			const sync = new WasmSceneSync<object, unknown, unknown>(scene, mockBalls(), api as any, table)
			const buffers = {
				balls: new Float32Array(0),
				movers: new Float32Array([0, MoverType.Flipper, 0.5, 0, 0, 0, 1, 0]),
				lights: new Float32Array([20, 2.5, 10, 0.5, 1, 0xff0000, 0x00ff00, 1]),
				prims: new Float32Array([30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 1, 80, 0, 1, 3]),
				flashers: new Float32Array(0),
			}
			const first = sync.syncAll(buffers)
			expect([first.movers, first.lights, first.prims]).toEqual([1, 1, 1])
			calls.part = 0
			const second = sync.syncAll(buffers)
			expect([second.movers, second.lights, second.prims, second.flashers]).toEqual([0, 0, 0, 0])
			expect(second.changedLightParts).toEqual([])
			expect(calls.part).toBe(0)
		})

		it('reports zeros for empty views without host lookups', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const { scene, calls } = countingScene(new Map())
			const sync = new WasmSceneSync<object, unknown, unknown>(scene, mockBalls(), api as any, table)
			const buffers = {
				balls: new Float32Array(0),
				movers: new Float32Array(0),
				lights: new Float32Array(0),
				prims: new Float32Array(0),
				flashers: new Float32Array(0),
			}
			const counts = sync.syncAll(buffers)
			expect([
				counts.ballsSpawned,
				counts.ballsMoved,
				counts.ballsRemoved,
				counts.movers,
				counts.lights,
				counts.prims,
				counts.flashers,
			]).toEqual([0, 0, 0, 0, 0, 0, 0])
			expect(counts.changedLightParts).toEqual([])
			expect(calls.part).toBe(0)
		})

		it('still removes live balls when the view goes empty', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const balls = mockBalls()
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), balls, api as any, table)
			const row = (id: number): number[] => [id, 10, 20, 30, 25, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0xff0000, 1]
			sync.syncBalls(new Float32Array(row(7)))
			expect(balls.spawned).toHaveLength(1)
			const counts = sync.syncBalls(new Float32Array(0))
			expect(counts).toEqual({ spawned: 0, moved: 0, removed: 1 })
			expect(balls.removed).toEqual([7])
		})

		it('slot-less light rows never seed the snapshot', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const lightState = LightState.claim('L9', 0, 0, 0)
			const slots = new Map<number, PartSlot<object>>()
			const { scene, calls } = countingScene(slots)
			const sync = new WasmSceneSync<object, unknown, unknown>(scene, mockBalls(), api as any, table)
			const ghost = new Float32Array([99, 5, 0, 0, 0, 0, 0, 0])
			expect(sync.syncLights(ghost)).toBe(0)
			expect(sync.syncLights(ghost)).toBe(0)
			// The row still looks new once a slot appears: no snapshot was stored.
			slots.set(99, slotFor({}, lightState, new LightUpdater(lightState)))
			expect(sync.syncLights(ghost)).toBe(1)
			expect(lightState.intensity).toBe(5)
			expect(calls.part).toBeGreaterThan(0)
		})

		it('unknown mover types skip without host lookups', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const { scene, calls } = countingScene(new Map())
			const sync = new WasmSceneSync<object, unknown, unknown>(scene, mockBalls(), api as any, table)
			expect(sync.syncMovers(new Float32Array([9, 99, 0, 0, 0, 0, 1, 0]))).toBe(0)
			expect(calls.part).toBe(0)
		})
	})

	describe('flasher image policy', () => {
		function flasherFixture(policy?: { flasherImage?: (partIdx: number) => string | undefined }): {
			sync: WasmSceneSync<object, unknown, unknown>
			state: FlasherState
			data: FlasherData
		} {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const state = FlasherState.claim('FL1', true, 0, 100)
			const data = createFlasherData('FL1')
			data.dragPoints = []
			const slots = new Map<number, PartSlot<object>>([
				[40, slotFor({ visible: true, traverse() {} }, state, new FlasherUpdater(state, data))],
			])
			const sync = new WasmSceneSync<object, unknown, unknown>(
				mockScene(slots),
				mockBalls(),
				api as any,
				table,
				policy,
			)
			return { sync, state, data }
		}
		const row = new Float32Array([40, 1, 80, 0xff0000, 0.75, 0.5, 1, 1])

		it('leaves imageA alone without a policy', () => {
			const { sync, state } = flasherFixture()
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('')
			expect(sync.syncFlashers(row)).toBe(0)
		})

		it('applies script image swaps that move no numeric column', () => {
			let current: string | undefined = 'd_title'
			const { sync, state, data } = flasherFixture({ flasherImage: () => current })
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('d_title')
			// Identical numerics, static image: settles with no re-apply.
			expect(sync.syncFlashers(row)).toBe(0)
			// Only the name moves, yet the swap still applies and sticks.
			current = 'd_5'
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('d_5')
			expect(data.szImageA, 'data follows the applied image for later regens').toBe('d_5')
			expect(sync.syncFlashers(row)).toBe(0)
		})

		it('treats unknown (undefined) images as no opinion', () => {
			const { sync, state } = flasherFixture({ flasherImage: () => undefined })
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('')
			expect(sync.syncFlashers(row)).toBe(0)
		})

		it('treats non-string policy results as no opinion', () => {
			const { sync, state } = flasherFixture({ flasherImage: () => null as unknown as string })
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('')
			expect(sync.syncFlashers(row)).toBe(0)
		})

		it('never polls rows with no scene slot', () => {
			let calls = 0
			const table = new TableBuilder().build()
			const sync = new WasmSceneSync<object, unknown, unknown>(
				mockScene(new Map<number, PartSlot<object>>()),
				mockBalls(),
				new RecordingApi() as any,
				table,
				{ flasherImage: () => (calls++, 'd_5') },
			)
			expect(sync.syncFlashers(row)).toBe(0)
			expect(calls).toBe(0)
		})

		it('degrades to numeric sync when the resolver throws', () => {
			const { sync, state } = flasherFixture({
				flasherImage: () => {
					throw new Error('host fault')
				},
			})
			expect(sync.syncFlashers(row)).toBe(1)
			expect(state.imageA).toBe('')
		})
	})

	describe('harness read-only accessors', () => {
		it('exposes flipper angles by part', () => {
			const table = new TableBuilder().addFlipper('F1').addFlipper('F2').build()
			const api = new RecordingApi()
			const flippers = table.flippers as unknown as Record<string, { getState(): ItemState; getUpdater(): ItemUpdater<any> }>
			const slots = new Map<number, PartSlot<object>>([
				[0, slotFor({}, flippers['F1']!.getState(), flippers['F1']!.getUpdater())],
				[1, slotFor({}, flippers['F2']!.getState(), flippers['F2']!.getUpdater())],
			])
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
			expect(sync.flipperAngles()).toEqual([])
			sync.syncMovers(new Float32Array([0, MoverType.Flipper, 0.5, 0, 0, 0, 1, 0]))
			sync.syncMovers(new Float32Array([1, MoverType.Flipper, -0.25, 0, 0, 0, 1, 0]))
			expect(sync.flipperAngles()).toEqual([
				{ partIdx: 0, angle: 0.5 },
				{ partIdx: 1, angle: -0.25 },
			])
		})

		it('exposes ball poses by id', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(new Map()), mockBalls(), api as any, table)
			expect(sync.ballPoses()).toEqual([])
			const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1]
			sync.syncBalls(new Float32Array([7, 10, 20, 30, 25, ...identity, 0xff0000, 1]))
			expect(sync.ballPoses()).toEqual([{ id: 7, x: 10, y: 20, z: 30 }])
		})

		it('counts applied light changes for activity signals', () => {
			const table = new TableBuilder().build()
			const api = new RecordingApi()
			const state = LightState.claim('L1', 0, 0, 0)
			const slots = new Map<number, PartSlot<object>>([[20, slotFor({}, state, new LightUpdater(state))]])
			const sync = new WasmSceneSync<object, unknown, unknown>(mockScene(slots), mockBalls(), api as any, table)
			expect(sync.lightActivity).toBe(0)
			sync.syncLights(new Float32Array([20, 2.5, 10, 0.5, 1, 0xff0000, 0x00ff00, 1]))
			expect(sync.lightActivity).toBe(1)
			// Identical intensity: no change, counter holds.
			sync.syncLights(new Float32Array([20, 2.5, 10, 0.5, 1, 0xff0000, 0x00ff00, 1]))
			expect(sync.lightActivity).toBe(1)
		})
	})
})

// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import {
	BALL_STRIDE,
	createFrameStateBuffer,
	createNodeIdMap,
	createSlotScratch,
	DELTA_STRIDE,
	DeltaKind,
	DMD_BYTES,
	encodeChangedStates,
	F_BALL_COUNT,
	F_BALLS,
	F_DELTA_COUNT,
	F_DELTAS,
	F_VIEW,
	FrameState,
	groupDeltaFields,
	readDeltaRow,
	readViewCamera,
	SLOT_FLOATS,
	setStateField,
	slotSeqByteOffset,
	V_CAM_FOV,
	V_CAM_NEAR,
	V_CAM_POS,
	V_CAM_TGT,
	workerNodeNames,
} from './frame-state.js'
import { createWorkerDriver } from './render-worker.js'
import { selectRenderMode } from './worker-protocol.js'

function writerAndReader(): { writer: FrameState; reader: FrameState } {
	const sab = createFrameStateBuffer()
	const writer = new FrameState(sab)
	writer.reset()
	return { writer, reader: new FrameState(sab) }
}

describe('frame-state seq publish/consume', () => {
	it('round-trips balls and deltas without tearing', () => {
		const { writer, reader } = writerAndReader()
		writer.publish(slot => {
			slot[F_BALL_COUNT] = 1
			slot.set([1, 2, 3, 4, 5, 6, 25, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1], F_BALLS)
			slot[F_DELTA_COUNT] = 1
			slot.set([7, DeltaKind.Scalar, 3, 0.5, 0, 0], F_DELTAS)
		})
		const scratch = createSlotScratch()
		const got = reader.tryConsume(scratch)
		expect(got).not.toBeNull()
		expect(scratch[F_BALL_COUNT]).toBe(1)
		expect(Array.from(scratch.subarray(F_BALLS, F_BALLS + 8))).toEqual([1, 2, 3, 4, 5, 6, 25, 1])
		expect(Array.from(scratch.subarray(F_BALLS + 8, F_BALLS + BALL_STRIDE))).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
		expect(scratch[F_DELTA_COUNT]).toBe(1)
		expect(Array.from(scratch.subarray(F_DELTAS, F_DELTAS + DELTA_STRIDE))).toEqual([7, 2, 3, 0.5, 0, 0])
		expect(scratch.length).toBe(SLOT_FLOATS)
	})

	it('rejects an odd-seq (mid-publish) slot so the reader retries', () => {
		const { writer, reader } = writerAndReader()
		writer.publish(slot => {
			slot[F_BALL_COUNT] = 2
		})
		const scratch = createSlotScratch()
		expect(reader.tryConsume(scratch)).not.toBeNull()
		// Simulate a torn read: force the latest slot seq odd, consume must refuse.
		const seq = new Int32Array(writer.buffer, slotSeqByteOffset(0), 1)
		Atomics.store(seq, 0, 3)
		expect(reader.tryConsume(scratch)).toBeNull()
	})

	it('latest wins: rapid publishes coalesce to the newest frame', () => {
		const { writer, reader } = writerAndReader()
		for (let i = 1; i <= 10; i++) writer.publish(slot => (slot[F_BALL_COUNT] = i))
		const scratch = createSlotScratch()
		const got = reader.tryConsume(scratch)
		expect(got).not.toBeNull()
		expect(scratch[F_BALL_COUNT]).toBe(10)
	})

	it('writer never stalls on a slow reader across many frames', () => {
		const { writer, reader } = writerAndReader()
		for (let i = 1; i <= 50; i++) writer.publish(slot => (slot[F_BALL_COUNT] = i))
		const scratch = createSlotScratch()
		expect(reader.tryConsume(scratch)?.version).toBeGreaterThan(0)
		expect(scratch[F_BALL_COUNT]).toBe(50)
	})
})

describe('frame-state dmd region', () => {
	it('publishes bytes with a version gate and refuses torn copies', () => {
		const { writer, reader } = writerAndReader()
		const src = new Uint8Array(DMD_BYTES).fill(7)
		const version = writer.publishDmd(src)
		expect(version).toBe(1)
		expect(reader.dmdVersion()).toBe(1)
		const out = new Uint8Array(DMD_BYTES)
		expect(reader.consumeDmd(out)).toBe(1)
		expect(out[0]).toBe(7)
		expect(out[DMD_BYTES - 1]).toBe(7)
	})

	it('records dmd dimensions alongside the version', () => {
		const { writer, reader } = writerAndReader()
		expect(reader.dmdDims()).toEqual({ w: 0, h: 0 })
		writer.publishDmd(new Uint8Array(96 * 24).fill(3), 96, 24)
		expect(reader.dmdDims()).toEqual({ w: 96, h: 24 })
		const out = new Uint8Array(DMD_BYTES)
		expect(reader.consumeDmd(out)).toBe(1)
		expect(out[0]).toBe(3)
	})
})

describe('worker-protocol fallback matrix', () => {
	const full = { offscreenCanvas: true, webgpuInWorker: true, crossOriginIsolated: true, sharedArrayBuffer: true }
	it('selects L0 only when every gate holds', () => {
		expect(selectRenderMode(full)).toBe('l0-shared')
	})
	it('falls back to L2 without SAB, isolation, or in-worker WebGPU', () => {
		expect(selectRenderMode({ ...full, sharedArrayBuffer: false })).toBe('l2-main')
		expect(selectRenderMode({ ...full, crossOriginIsolated: false })).toBe('l2-main')
		expect(selectRenderMode({ ...full, webgpuInWorker: false })).toBe('l2-main')
	})
	it('falls back to L2 without OffscreenCanvas', () => {
		expect(selectRenderMode({ ...full, offscreenCanvas: false })).toBe('l2-main')
	})
})

describe('node id map', () => {
	it('is deterministic across parses of the same table', () => {
		const names = ['Plunger1', 'FlipperLeft', 'Ball1', 'Light5']
		const a = createNodeIdMap(names)
		const b = createNodeIdMap([...names].reverse())
		for (const name of names) expect(a(name)).toBe(b(name))
		expect(a('Missing')).toBe(-1)
	})

	it('covers every state-carrying item, not just animatables', () => {
		const names = workerNodeNames({
			getItems: () => [
				{ getName: () => 'Flipper1' },
				{ getName: () => 'Plunger1' },
				{ getName: () => 'Flipper1' },
			],
			getName: () => 'Table1',
		})
		const idOf = createNodeIdMap(names)
		expect(idOf('Plunger1')).toBeGreaterThanOrEqual(0)
		expect(idOf('Flipper1')).toBeGreaterThanOrEqual(0)
		expect(idOf('Table1')).toBeGreaterThanOrEqual(0)
		expect(idOf('Nope')).toBe(-1)
	})
})

describe('delta codec', () => {
	const idOf = createNodeIdMap(['FlipperLeft', 'Light1', 'Plunger1', 'Ball1'])
	const isBall = (name: string) => name === 'Ball1'

	function roundtrip(changed: Record<string, Record<string, unknown>>, maxRows = 64) {
		const out = new Float32Array(64 * 6)
		const rows = encodeChangedStates({ changedStates: changed }, idOf, isBall, out, maxRows)
		const seen: Array<{ nodeId: number; field: string; values: number[] }> = []
		const slot = new Float32Array(2048)
		slot.set(out.subarray(0, rows * 6), F_DELTAS)
		slot[F_DELTA_COUNT] = rows
		groupDeltaFields(slot, rows, (nodeId, field, values) => seen.push({ nodeId, field, values }))
		return { rows, seen }
	}

	it('encodes numbers, booleans, vec3s, and 3x3s; skips balls and strings', () => {
		const { rows, seen } = roundtrip({
			FlipperLeft: { angle: 0.5, isVisible: true, material: 'red', center: { x: 1, y: 2 } },
			Ball1: { pos: { x: 1, y: 2, z: 3 } },
			Light1: { intensity: 0.75, color: 255, unknownFutureField: 42 },
			Plunger1: { orientation: { elements: [1, 0, 0, 0, 1, 0, 0, 0, 1] } },
		})
		expect(rows).toBe(1 + 1 + 1 + 2 + 3)
		const byField = new Map(seen.map(s => [`${s.nodeId}:${s.field}`, s.values]))
		expect(byField.get(`${idOf('FlipperLeft')}:angle`)).toEqual([0.5])
		expect(byField.get(`${idOf('FlipperLeft')}:isVisible`)).toEqual([1])
		expect(byField.get(`${idOf('FlipperLeft')}:center`)).toEqual([1, 2])
		expect(byField.get(`${idOf('Light1')}:intensity`)).toEqual([0.75])
		expect(byField.get(`${idOf('Light1')}:color`)).toEqual([255])
		expect(byField.get(`${idOf('Plunger1')}:orientation`)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
		expect(seen.some(s => s.field === 'material')).toBe(false)
		expect(seen.some(s => s.field === 'unknownFutureField')).toBe(false)
		expect(seen.some(s => s.nodeId === idOf('Ball1'))).toBe(false)
	})

	it('clamps at maxRows and counts dropped rows', () => {
		const dropped = { count: 0 }
		const out = new Float32Array(64 * 6)
		const rows = encodeChangedStates(
			{ changedStates: { FlipperLeft: { angle: 1 }, Light1: { intensity: 2 } } },
			idOf,
			isBall,
			out,
			1,
			dropped,
		)
		expect(rows).toBe(1)
		expect(dropped.count).toBeGreaterThan(0)
	})

	it('round-trips through a real published slot', () => {
		const { writer, reader } = writerAndReader()
		writer.publish(slot => {
			slot[F_DELTA_COUNT] = encodeChangedStates(
				{ changedStates: { Gate1: { angle: 0.25 } } },
				createNodeIdMap(['Gate1']),
				() => false,
				slot.subarray(F_DELTAS),
				64,
			)
		})
		const scratch = createSlotScratch()
		expect(reader.tryConsume(scratch)).not.toBeNull()
		const seen: Array<{ nodeId: number; field: string; values: number[] }> = []
		groupDeltaFields(scratch, scratch[F_DELTA_COUNT], (nodeId, field, values) =>
			seen.push({ nodeId, field, values }),
		)
		expect(seen).toEqual([{ nodeId: 0, field: 'angle', values: [0.25] }])
	})

	it('reads raw rows with stable layout', () => {
		const slot = new Float32Array(2048)
		slot.set([9, DeltaKind.Scalar, 3, 0.5, 0, 0], F_DELTAS + 2 * DELTA_STRIDE)
		expect(readDeltaRow(slot, 2)).toEqual({ nodeId: 9, kind: 2, p0: 3, p1: 0.5, p2: 0, p3: 0 })
	})
})

describe('setStateField', () => {
	it('assigns numbers and booleans, sets vectors and matrices in place', () => {
		const num = { angle: 0 }
		expect(setStateField(num, 'angle', [0.5])).toBe(true)
		expect(num.angle).toBe(0.5)
		const bool = { isVisible: false }
		expect(setStateField(bool, 'isVisible', [1])).toBe(true)
		expect(bool.isVisible).toBe(true)
		const vec = { pos: { x: 0, y: 0, z: 0 } }
		expect(setStateField(vec, 'pos', [1, 2, 3])).toBe(true)
		expect(vec.pos).toEqual({ x: 1, y: 2, z: 3 })
		const mat = { orientation: { elements: [0, 0, 0, 0, 0, 0, 0, 0, 0] } }
		expect(setStateField(mat, 'orientation', [1, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(true)
		expect(mat.orientation.elements).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
		expect(setStateField({ angle: 0 }, 'missing', [1])).toBe(false)
		expect(setStateField({ angle: 0 }, 'angle', [Number.NaN])).toBe(false)
	})
})

describe('readViewCamera', () => {
	it('decodes published pos/target/fov rows', () => {
		const { writer, reader } = writerAndReader()
		writer.publish(slot => {
			slot[F_VIEW + V_CAM_POS] = 10
			slot[F_VIEW + V_CAM_POS + 1] = -20
			slot[F_VIEW + V_CAM_POS + 2] = 30
			slot[F_VIEW + V_CAM_TGT] = 1
			slot[F_VIEW + V_CAM_TGT + 1] = 2
			slot[F_VIEW + V_CAM_TGT + 2] = 3
			slot[F_VIEW + V_CAM_FOV] = 45
			slot[F_VIEW + V_CAM_NEAR] = 12
		})
		const scratch = createSlotScratch()
		expect(reader.tryConsume(scratch)).not.toBeNull()
		expect(readViewCamera(scratch)).toEqual({ pos: [10, -20, 30], target: [1, 2, 3], fov: 45, near: 12 })
	})

	it('defaults near to 0 (worker keeps boot near) when the row was never published', () => {
		const { writer, reader } = writerAndReader()
		writer.publish(slot => {
			slot[F_VIEW + V_CAM_POS] = 10
			slot[F_VIEW + V_CAM_FOV] = 45
		})
		const scratch = createSlotScratch()
		expect(reader.tryConsume(scratch)).not.toBeNull()
		expect(readViewCamera(scratch)?.near).toBe(0)
	})

	it('returns null for the zero-fov sentinel so the worker keeps boot framing', () => {
		const slot = new Float32Array(SLOT_FLOATS)
		expect(readViewCamera(slot)).toBeNull()
		slot[F_VIEW + V_CAM_POS] = 10
		expect(readViewCamera(slot)).toBeNull()
	})

	it('refuses non-finite rows instead of flinging the camera', () => {
		const slot = new Float32Array(SLOT_FLOATS)
		slot[F_VIEW + V_CAM_FOV] = Number.NaN
		expect(readViewCamera(slot)).toBeNull()
		slot[F_VIEW + V_CAM_FOV] = -45
		expect(readViewCamera(slot)).toBeNull()
		slot[F_VIEW + V_CAM_FOV] = 45
		slot[F_VIEW + V_CAM_POS] = Number.POSITIVE_INFINITY
		expect(readViewCamera(slot)).toBeNull()
	})
})

describe('render-worker driver', () => {
	it('applies the latest slot on tick and routes resize', () => {
		const { writer } = writerAndReader()
		const seen: { slot: number; version: number }[] = []
		const resized: number[][] = []
		const sab = writer.buffer as SharedArrayBuffer
		const driver = createWorkerDriver(() => ({
			applyFrame: (_scratch, slot, version) => seen.push({ slot, version }),
			applyResize: (w, h, dpr) => resized.push([w, h, dpr]),
		}))
		driver.onMessage({ data: { type: 'init', sab, width: 800, height: 600, pixelRatio: 1, mode: 'l0-shared' } })
		writer.publish(slot => (slot[F_BALL_COUNT] = 4))
		driver.tick()
		expect(seen.length).toBe(1)
		expect(seen[0]?.version).toBeGreaterThan(0)
		driver.onMessage({ data: { type: 'resize', width: 1024, height: 768, pixelRatio: 2, seq: 1 } })
		expect(resized).toEqual([[1024, 768, 2]])
		driver.dispose()
	})
})

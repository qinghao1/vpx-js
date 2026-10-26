import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vertex2D } from '../../math/vector.js'
import { Logger } from '../../util/logger.js'
import { PinMameEmulator } from './pinmame-emu.js'

describe('PinMAME WASM emulator (mock)', () => {
	let emu: PinMameEmulator
	beforeEach(() => {
		emu = new PinMameEmulator()
	})
	it('has DMD dimensions 128x32', () => {
		const d: Vertex2D = emu.getDmdDimensions()
		expect(d.x).toBe(128)
		expect(d.y).toBe(32)
	})
	it('mock is not initialized by default', () => {
		expect(emu.isInitialized()).toBe(false)
	})
	it('emuSimulateCycle drains queue when not initialized', () => {
		expect(emu.emuSimulateCycle(16)).toBe(0)
	})
	it('setSwitchInput queues when not initialized', () => {
		expect(emu.setSwitchInput(11, true)).toBe(true)
	})
	it('getDmdFrame returns buffer', () => {
		const f = emu.getDmdFrame()
		expect(f.length).toBe(128 * 32)
	})
	it('pull reads 8-byte stride pairs with clamp and bounds checks', () => {
		const heap = new Uint8Array(4096)
		const view = new DataView(heap.buffer)
		const pairs: Array<[number, number]> = [
			[2, 300],
			[5, -3],
			[99, 7],
			[-1, 9],
		]
		;(emu as any).mod = {
			_malloc: () => 64,
			_free: () => {},
			HEAPU8: heap,
			getValue: (p: number) => view.getInt32(p, true),
		}
		const buf = new Uint8Array(8)
		;(emu as any).pull((ptr: number) => {
			pairs.forEach(([idx, val], i) => {
				view.setInt32(ptr + i * 8, idx, true)
				view.setInt32(ptr + i * 8 + 4, val, true)
			})
			return pairs.length
		}, buf)
		expect([...buf]).toEqual([0, 0, 255, 0, 0, 0, 0, 0])
	})
	it('setTimeFence queues pre-ready and replays on markReady', () => {
		emu.setTimeFence(100)
		const setTimeFence = vi.fn()
		;(emu as any).api = { setTimeFence }
		;(emu as any).markReady()
		expect(setTimeFence).toHaveBeenCalledWith(100)
	})
	it('setTimeFence is a silent no-op on ready mock', () => {
		const orig = Logger.logger()
		const warn = vi.fn()
		const noop = () => {}
		Logger.setLogger({ wtf: noop, error: noop, warn, info: noop, verbose: noop, debug: noop })
		try {
			;(emu as any).isMock = true
			;(emu as any).markReady()
			emu.setTimeFence(100)
			emu.setTimeFence(200)
			expect(warn).not.toHaveBeenCalled()
		} finally {
			Logger.setLogger(orig)
		}
	})
	it('setTimeFence forwards to api when ready', () => {
		const setTimeFence = vi.fn()
		;(emu as any).api = { setTimeFence }
		;(emu as any).markReady()
		emu.setTimeFence(7)
		expect(setTimeFence).toHaveBeenCalledWith(7)
	})
	it('pullDmd copies the frame out of wasm memory', () => {
		const heap = new Uint8Array(4096)
		const bytes = [1, 2, 3, 4, 5, 6, 7, 8]
		;(emu as any).mod = {
			_malloc: () => 128,
			_free: () => {},
			HEAPU8: heap,
			getValue: () => 0,
		}
		;(emu as any).api = {
			getDmdWidth: () => 4,
			getDmdHeight: () => 2,
			getDmdFrame: (ptr: number) => {
				heap.set(bytes, ptr)
				return 1
			},
		}
		;(emu as any).pullDmd()
		expect([...emu.getDmdFrame()]).toEqual(bytes)
		heap.fill(0)
		expect([...emu.getDmdFrame()]).toEqual(bytes)
	})
})

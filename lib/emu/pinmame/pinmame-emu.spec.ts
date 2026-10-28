import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vertex2D } from '../../math/vector.js'
import { Logger } from '../../util/logger.js'
import { resetWarnOnce } from '../warn-once.js'
import { PinMameEmulator } from './pinmame-emu.js'

describe('PinMAME WASM emulator (mock)', () => {
	let emu: PinMameEmulator
	beforeEach(() => {
		emu = new PinMameEmulator()
		resetWarnOnce()
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
		const heap = new Uint8Array(65536)
		const view = new DataView(heap.buffer)
		const pairs: Array<[number, number]> = [
			[2, 300],
			[5, -3],
			[99, 7],
			[-1, 9],
		]
		const mod = {
			_malloc: () => 64,
			_free: () => {},
			HEAPU8: heap,
			getValue: (p: number) => view.getInt32(p, true),
		}
		emu.setBackendForTesting(mod, {
			getChangedLamps: (ptr: number) => {
				pairs.forEach(([idx, val], i) => {
					view.setInt32(ptr + i * 8, idx, true)
					view.setInt32(ptr + i * 8 + 4, val, true)
				})
				return pairs.length
			},
			getChangedSols: () => 0,
			getChangedGIs: () => 0,
			getDmdWidth: () => 0,
			getDmdHeight: () => 0,
		})
		emu.markReady()
		emu.emuSimulateCycle(16)
		// 300 clamps to the 255 VPM lamp ceiling, -3 clamps to 0, -1 is
		// out of bounds; the 1024-slot live buffer keeps index 99.
		expect(emu.getLampState(2)).toBe(255)
		expect(emu.getLampState(5)).toBe(0)
		expect(emu.getLampState(99)).toBe(7)
		expect(emu.getLampState(0)).toBe(0)
	})
	it('pull clamps a huge finite count to the lane count', () => {
		const heap = new Uint8Array(65536)
		const view = new DataView(heap.buffer)
		const mod = {
			_malloc: () => 64,
			_free: () => {},
			HEAPU8: heap,
			getValue: (p: number) => view.getInt32(p, true),
		}
		emu.setBackendForTesting(mod, {
			getChangedLamps: (ptr: number) => {
				view.setInt32(ptr, 2, true)
				view.setInt32(ptr + 4, 300, true)
				return 2 ** 30
			},
			getChangedSols: () => 0,
			getChangedGIs: () => 0,
			getDmdWidth: () => 0,
			getDmdHeight: () => 0,
		})
		emu.markReady()
		emu.emuSimulateCycle(16)
		expect(emu.getLampState(2)).toBe(255)
	})
	it('setTimeFence queues pre-ready and replays on markReady', () => {
		emu.setTimeFence(100)
		const setTimeFence = vi.fn()
		emu.setBackendForTesting(null, { setTimeFence })
		emu.markReady()
		expect(setTimeFence).toHaveBeenCalledWith(100)
	})
	it('setTimeFence warns once on ready mock', () => {
		const orig = Logger.logger()
		const warn = vi.fn()
		const noop = () => {}
		Logger.setLogger({ wtf: noop, error: noop, warn, info: noop, debug: noop })
		try {
			emu.isMock = true
			emu.markReady()
			emu.setTimeFence(100)
			emu.setTimeFence(200)
			expect(warn).toHaveBeenCalledTimes(1)
		} finally {
			Logger.setLogger(orig)
		}
	})
	it('setTimeFence forwards to api when ready', () => {
		const setTimeFence = vi.fn()
		emu.setBackendForTesting(null, { setTimeFence })
		emu.markReady()
		emu.setTimeFence(7)
		expect(setTimeFence).toHaveBeenCalledWith(7)
	})
	it('setCabinetInput forwards to the api when the export exists', () => {
		const setCabinetInput = vi.fn()
		emu.setBackendForTesting(null, { setCabinetInput })
		emu.markReady()
		emu.setCabinetInput(16)
		expect(setCabinetInput).toHaveBeenCalledWith(16)
	})
	it('setCabinetInput warns once without a backend', () => {
		const orig = Logger.logger()
		const warn = vi.fn()
		const noop = () => {}
		Logger.setLogger({ wtf: noop, error: noop, warn, info: noop, debug: noop })
		try {
			emu.setBackendForTesting(null, null)
			emu.markReady()
			emu.setCabinetInput(16)
			emu.setCabinetInput(17)
			expect(warn).toHaveBeenCalledTimes(1)
		} finally {
			Logger.setLogger(orig)
		}
	})
	it('loadGame while running another game throws instead of staying on the old game', async () => {
		const { api } = wired(emu)
		await emu.loadGame('gameA', new Uint8Array([1]))
		api.isRunning.mockReturnValue(1)
		await expect(emu.loadGame('gameB', new Uint8Array([1]))).rejects.toThrow(/PINMAME_ALREADY_RUNNING_gameA/)
	})
	it('loadGame reload of the same game while running stays ready', async () => {
		const { api } = wired(emu)
		await emu.loadGame('gameA', new Uint8Array([1]))
		api.isRunning.mockReturnValue(1)
		await emu.loadGame('gameA', new Uint8Array([1]))
		expect(emu.isInitialized()).toBe(true)
	})
	it('loadGame rewrites a same-size but different ROM', async () => {
		const files = new Map<string, Uint8Array>([['/pinmame/roms/g.zip', new Uint8Array([1, 2, 3, 4])]])
		const { m } = wired(emu, files)
		await emu.loadGame('g', new Uint8Array([9, 9, 9, 9]))
		expect([...(m.files.get('/pinmame/roms/g.zip') ?? new Uint8Array())]).toEqual([9, 9, 9, 9])
	})
	it('loadGame reuses a byte-identical ROM', async () => {
		const files = new Map<string, Uint8Array>([['/pinmame/roms/g.zip', new Uint8Array([1, 2, 3, 4])]])
		const { m } = wired(emu, files)
		const writeFile = vi.spyOn(m.FS, 'writeFile')
		await emu.loadGame('g', new Uint8Array([1, 2, 3, 4]))
		expect(writeFile).not.toHaveBeenCalled()
	})
	it('loadGame with an empty ROM removes the stale zip', async () => {
		const files = new Map<string, Uint8Array>([['/pinmame/roms/h.zip', new Uint8Array([5, 6, 7])]])
		const { m } = wired(emu, files)
		await emu.loadGame('h', new Uint8Array())
		expect(m.files.has('/pinmame/roms/h.zip')).toBe(false)
	})
	it('loadGame with an empty ROM and no stale zip still resolves', async () => {
		wired(emu)
		await emu.loadGame('h', new Uint8Array())
		expect(emu.isInitialized()).toBe(true)
	})
	it('getSolMask rethrows backend errors on a real backend', () => {
		emu.setBackendForTesting(null, {
			getSolMask: () => {
				throw new Error('boom')
			},
		})
		expect(() => emu.getSolMask(0)).toThrow('boom')
	})
	it('getSolMask still returns 0 on a mock', () => {
		emu.setBackendForTesting(null, {
			getSolMask: () => {
				throw new Error('boom')
			},
		})
		emu.isMock = true
		expect(emu.getSolMask(0)).toBe(0)
	})
	it('pullDmd copies the frame out of wasm memory', () => {
		const heap = new Uint8Array(65536)
		const bytes = [1, 2, 3, 4, 5, 6, 7, 8]
		emu.setBackendForTesting(
			{
				_malloc: () => 128,
				_free: () => {},
				HEAPU8: heap,
				getValue: () => 0,
			},
			{
				getChangedLamps: () => 0,
				getChangedSols: () => 0,
				getChangedGIs: () => 0,
				getDmdWidth: () => 4,
				getDmdHeight: () => 2,
				getDmdFrame: (ptr: number) => {
					heap.set(bytes, ptr)
					return 1
				},
			},
		)
		emu.markReady()
		emu.emuSimulateCycle(16)
		expect([...emu.getDmdFrame()]).toEqual(bytes)
		heap.fill(0)
		expect([...emu.getDmdFrame()]).toEqual(bytes)
	})
})

function wired(target: PinMameEmulator, files = new Map<string, Uint8Array>()) {
	const heap = new Uint8Array(65536)
	const m = {
		files,
		FS: {
			mkdirTree: () => {},
			writeFile: (p: string, d: Uint8Array) => void files.set(p, d.slice()),
			readFile: (p: string) => {
				const f = files.get(p)
				if (!f) throw { errno: 44 }
				return f.slice()
			},
			stat: (p: string) => {
				const f = files.get(p)
				if (!f) throw { errno: 44 }
				return { size: f.length }
			},
			unlink: (p: string) => {
				if (!files.delete(p)) throw { errno: 44 }
			},
		},
		_malloc: () => 8,
		_free: () => {},
		HEAPU8: heap,
		lengthBytesUTF8: (s: string) => s.length,
		stringToUTF8: () => {},
	}
	const api = { isRunning: vi.fn(() => 0), run: vi.fn(() => 0), setConfig: vi.fn() }
	target.setBackendForTesting(m, api)
	vi.spyOn(target, 'init').mockResolvedValue(undefined)
	return { m, api }
}

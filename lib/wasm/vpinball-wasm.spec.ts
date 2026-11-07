// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import {
	codeToSdlScancode,
	createScancodeGate,
	DmdFrameFormat,
	HEADLESS_ABI_VERSION,
	HeadlessEngineError,
	HeadlessEngineMissingError,
	loadHeadlessEngine,
	type RawHeadlessModule,
	resolveFlipperKey,
	romMountFileName,
	WASM_STRIDES,
	wasmLocateFile,
	wrapHeadlessEngine,
} from './vpinball-wasm.js'

/** Minimal heap-backed fake of the emscripten bridge surface. */
function fakeRaw(): { raw: RawHeadlessModule; malloc: (bytes: Uint8Array) => number } {
	const buffer = new ArrayBuffer(65536)
	const HEAPU8 = new Uint8Array(buffer)
	const HEAPU32 = new Uint32Array(buffer)
	const HEAPF32 = new Float32Array(buffer)
	let top = 1024
	const malloc = (bytes: Uint8Array): number => {
		const ptr = top
		HEAPU8.set(bytes, ptr)
		top += bytes.length + ((4 - (bytes.length % 4)) % 4)
		return ptr
	}
	const notImpl = (name: string): never => {
		throw new Error(`fake ${name} not implemented`)
	}
	const raw: RawHeadlessModule = {
		_VpxWasm_GetAbiVersion: () => HEADLESS_ABI_VERSION,
		_VpxWasm_Init: () => 0,
		_VpxWasm_MountRom: () => notImpl('MountRom'),
		_VpxWasm_LoadTable: () => notImpl('LoadTable'),
		_VpxWasm_StepFrame: () => {},
		_VpxWasm_GetPartCatalogJson: () => 0,
		_VpxWasm_GetBuffer: () => 0,
		_VpxWasm_GetDmdFrame: () => 0,
		_VpxWasm_GetFlasherImage: () => 0,
		_VpxWasm_PushKey: () => {},
		_VpxWasm_Nudge: () => {},
		_VpxWasm_SetAudioLevel: () => {},
		_VpxWasm_GetScriptErrorCount: () => 0,
		_VpxWasm_GetScriptError: () => 0,
		_VpxWasm_DestroyTable: async () => {},
		_malloc: (size: number) => {
			const ptr = top
			top += size
			return ptr
		},
		_free: () => {},
		UTF8ToString: (ptr: number) => {
			let end = ptr
			while (HEAPU8[end] !== 0) end++
			return new TextDecoder().decode(HEAPU8.subarray(ptr, end))
		},
		HEAPU8,
		HEAPU32,
		HEAPF32,
	}
	return { raw, malloc }
}

/** A bridge descriptor: a 64-bit heap offset, then u32 fields (`BridgeBufferView`, `BridgeDmdFrame`). */
function descriptor(bytePtr: number | bigint, ...fields: number[]): Uint8Array {
	const desc = new Uint8Array(8 + 4 * fields.length)
	const view = new DataView(desc.buffer)
	view.setBigUint64(0, BigInt(bytePtr), true)
	fields.forEach((field, i) => view.setUint32(8 + 4 * i, field, true))
	return desc
}

/** Craft a DMD descriptor (bytePtr, w, h, format, frameId) + pixel bytes. */
function dmdPtr(
	fake: ReturnType<typeof fakeRaw>,
	width: number,
	height: number,
	format: number,
	pixels: Uint8Array,
): number {
	return fake.malloc(descriptor(fake.malloc(pixels), width, height, format, 7))
}

describe('codeToSdlScancode', () => {
	it('maps digits to SDL scancodes with Digit0 last like SDL_scancode.h', () => {
		// SDL_SCANCODE_1..9 = 30..38, SDL_SCANCODE_0 = 39 (not 29, which is KeyZ).
		expect(codeToSdlScancode('Digit1')).toBe(30)
		expect(codeToSdlScancode('Digit9')).toBe(38)
		expect(codeToSdlScancode('Digit0')).toBe(39)
	})
	it('maps letters, function keys, and controls', () => {
		expect(codeToSdlScancode('KeyA')).toBe(4)
		expect(codeToSdlScancode('KeyZ')).toBe(29)
		expect(codeToSdlScancode('F1')).toBe(58)
		expect(codeToSdlScancode('F12')).toBe(69)
		expect(codeToSdlScancode('Escape')).toBe(41)
		expect(codeToSdlScancode('Space')).toBe(44)
		expect(codeToSdlScancode('ArrowLeft')).toBe(80)
		expect(codeToSdlScancode('Nope')).toBeUndefined()
	})
	it('maps navigation and numpad codes instead of silently dropping them', () => {
		expect(codeToSdlScancode('Home')).toBe(74)
		expect(codeToSdlScancode('End')).toBe(77)
		expect(codeToSdlScancode('PageUp')).toBe(75)
		expect(codeToSdlScancode('PageDown')).toBe(78)
		expect(codeToSdlScancode('Insert')).toBe(73)
		expect(codeToSdlScancode('Delete')).toBe(76)
		expect(codeToSdlScancode('Numpad0')).toBe(98)
		expect(codeToSdlScancode('NumpadEnter')).toBe(88)
		expect(codeToSdlScancode('Backslash')).toBe(49)
		expect(codeToSdlScancode('ScrollLock')).toBe(71)
		expect(codeToSdlScancode('Pause')).toBe(72)
		expect(codeToSdlScancode('NumLock')).toBe(83)
		expect(codeToSdlScancode('MetaLeft')).toBe(227)
		expect(codeToSdlScancode('MetaRight')).toBe(231)
	})
})

describe('resolveFlipperKey', () => {
	it('folds arrow/A/D flipper keys onto shift so they reach the upstream flipper action', () => {
		// Upstream binds flipper actions to L/R Shift only (SDL 225/229);
		// the browser scheme also advertises arrows and A/D.
		expect(resolveFlipperKey('ArrowLeft')).toBe('ShiftLeft')
		expect(resolveFlipperKey('KeyA')).toBe('ShiftLeft')
		expect(resolveFlipperKey('ArrowRight')).toBe('ShiftRight')
		expect(resolveFlipperKey('KeyD')).toBe('ShiftRight')
	})
	it('leaves shift and unrelated keys untouched', () => {
		expect(resolveFlipperKey('ShiftLeft')).toBe('ShiftLeft')
		expect(resolveFlipperKey('ShiftRight')).toBe('ShiftRight')
		expect(resolveFlipperKey('Enter')).toBe('Enter')
		expect(resolveFlipperKey('ArrowUp')).toBe('ArrowUp')
	})
})

describe('createScancodeGate', () => {
	it('forwards first down and last up per scancode', () => {
		const gate = createScancodeGate()
		expect(gate.down(225)).toBe(true)
		expect(gate.down(225)).toBe(false)
		expect(gate.up(225)).toBe(false)
		expect(gate.up(225)).toBe(true)
	})
	it('tracks scancodes independently and floors at zero', () => {
		const gate = createScancodeGate()
		expect(gate.down(225)).toBe(true)
		expect(gate.down(229)).toBe(true)
		expect(gate.up(225)).toBe(true)
		expect(gate.up(229)).toBe(true)
		// Unbalanced release still forwards (matches always-forward behavior).
		expect(gate.up(225)).toBe(true)
		expect(gate.up(225)).toBe(true)
	})
	it('holds while any aliased key is down', () => {
		const gate = createScancodeGate()
		expect(gate.down(225)).toBe(true)
		expect(gate.down(225)).toBe(false)
		expect(gate.up(225)).toBe(false)
		expect(gate.up(225)).toBe(true)
	})
})

describe('ABI version', () => {
	it('refuses an engine speaking another ABI', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetAbiVersion = () => HEADLESS_ABI_VERSION + 1
		expect(() => wrapHeadlessEngine(fake.raw, 'test')).toThrow(HeadlessEngineError)
	})
	it('refuses an engine predating the version export', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetAbiVersion = undefined
		expect(() => wrapHeadlessEngine(fake.raw, 'test')).toThrow(/ABI 0, expected/)
	})
})

describe('getBuffer', () => {
	/** Craft a GetBuffer descriptor (bytePtr, count, stride) + row bytes. */
	const bufPtr = (fake: ReturnType<typeof fakeRaw>, count: number, stride: number): number => {
		const rows = new Float32Array(count * stride)
		for (let i = 0; i < rows.length; i++) rows[i] = i
		return fake.malloc(descriptor(fake.malloc(new Uint8Array(rows.buffer)), count, stride))
	}
	it('returns rows for a matching stride', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetBuffer = () => bufPtr(fake, 2, WASM_STRIDES.movers)
		const view = wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')
		expect(view?.count).toBe(2)
		expect(view?.stride).toBe(WASM_STRIDES.movers)
		expect(view?.view.length).toBe(2 * WASM_STRIDES.movers)
	})
	it('reads the reels buffer through buffer id 5', () => {
		const fake = fakeRaw()
		const requested: number[] = []
		fake.raw._VpxWasm_GetBuffer = (id: number) => {
			requested.push(id)
			return bufPtr(fake, 2, WASM_STRIDES.reels)
		}
		const view = wrapHeadlessEngine(fake.raw, 'test').getBuffer('reels')
		expect(requested).toEqual([5])
		expect(view?.count).toBe(2)
		expect(view?.stride).toBe(WASM_STRIDES.reels)
		expect(Array.from(view?.view ?? [])).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
	})
	/** A GetBuffer descriptor only (bytePtr, count, stride). */
	const descPtr = (fake: ReturnType<typeof fakeRaw>, bytePtr: number | bigint, count: number): number =>
		fake.malloc(descriptor(bytePtr, count, WASM_STRIDES.movers))
	it('reads the full 64-bit row pointer, not just its low word', () => {
		const fake = fakeRaw()
		const rows = fake.malloc(new Uint8Array(4 * WASM_STRIDES.movers))
		fake.raw._VpxWasm_GetBuffer = () => descPtr(fake, (1n << 32n) + BigInt(rows), 1)
		expect(() => wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')).toThrow(`range ${2 ** 32 + rows}+`)
	})
	it('maps an empty buffer to undefined', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetBuffer = () => descPtr(fake, 0, 0)
		expect(wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')).toBeUndefined()
	})
	it('throws on rows past the end of the heap', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetBuffer = () => descPtr(fake, 65536 - 16, 2)
		expect(() => wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')).toThrow(HeadlessEngineError)
	})
})

describe('getScriptErrorCount', () => {
	it('clamps the no-player sentinel to zero', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetScriptErrorCount = () => -1
		expect(wrapHeadlessEngine(fake.raw, 'test').getScriptErrorCount()).toBe(0)
	})
})

describe('getFlasherImage', () => {
	it('reads the live script image name', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetFlasherImage = () => fake.malloc(new TextEncoder().encode('d_5\0'))
		expect(wrapHeadlessEngine(fake.raw, 'test').getFlasherImage(40)).toBe('d_5')
	})
	it('maps null to undefined', () => {
		expect(wrapHeadlessEngine(fakeRaw().raw, 'test').getFlasherImage(40)).toBeUndefined()
	})
})

describe('wasmLocateFile', () => {
	it('resolves sibling artifact files against the glue URL', () => {
		// The Emscripten glue derives its `.wasm`/`.data` URLs from its own
		// `scriptDirectory`, which is empty when bundled or re-hosted; the
		// host pins them to the glue URL instead (else the `.data` package
		// 404-falls-back to HTML and every preloaded script/asset is empty).
		const locate = wasmLocateFile('/wasm/vpinball-headless.js', 'https://localhost:3000/viewer')
		expect(locate('vpinball-headless.data')).toBe('https://localhost:3000/wasm/vpinball-headless.data')
		expect(locate('vpinball-headless.wasm')).toBe('https://localhost:3000/wasm/vpinball-headless.wasm')
	})
})

describe('getDmdFrame', () => {
	it('reads 32-bit float luminance frames', () => {
		const fake = fakeRaw()
		const floats = new Float32Array([0.25, 0.5, 0.75, 1])
		fake.raw._VpxWasm_GetDmdFrame = () => dmdPtr(fake, 2, 2, DmdFrameFormat.Lum32F, new Uint8Array(floats.buffer))
		const frame = wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()
		expect(frame?.width).toBe(2)
		expect(frame?.format).toBe(DmdFrameFormat.Lum32F)
		expect(frame?.frameId).toBe(7)
		expect(frame?.pixels).toBeInstanceOf(Float32Array)
		expect(Array.from(frame!.pixels)).toEqual([0.25, 0.5, 0.75, 1])
	})
	it('reads packed SRGB triplets (3 bytes per dot)', () => {
		const fake = fakeRaw()
		const pixels = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120])
		fake.raw._VpxWasm_GetDmdFrame = () => dmdPtr(fake, 2, 2, DmdFrameFormat.Srgb888, pixels)
		const frame = wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()
		expect(frame?.pixels).toBeInstanceOf(Uint8Array)
		expect(Array.from(frame!.pixels as Uint8Array)).toEqual(Array.from(pixels))
	})
	it('returns the memoized frame while frameId is unchanged', () => {
		const fake = fakeRaw()
		const floats = new Float32Array([0.25, 0.5, 0.75, 1])
		fake.raw._VpxWasm_GetDmdFrame = () => dmdPtr(fake, 2, 2, DmdFrameFormat.Lum32F, new Uint8Array(floats.buffer))
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		const first = engine.getDmdFrame()
		const second = engine.getDmdFrame()
		expect(second).toBe(first)
	})
})

describe('hostile descriptors', () => {
	it('rejects unknown DMD formats instead of misdecoding them', () => {
		const fake = fakeRaw()
		const pixels = fake.malloc(new Uint8Array(128 * 32))
		const desc = descriptor(pixels, 128, 32, DmdFrameFormat.Srgb565, 3)
		fake.raw._VpxWasm_GetDmdFrame = () => fake.malloc(desc)
		expect(wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()).toBeUndefined()
	})
	it('throws on absurd DMD dimensions instead of allocating', () => {
		const fake = fakeRaw()
		const desc = descriptor(1024, 1 << 30, 1, DmdFrameFormat.Srgb888, 3)
		fake.raw._VpxWasm_GetDmdFrame = () => fake.malloc(desc)
		expect(() => wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()).toThrow(HeadlessEngineError)
	})
	it('throws when the WASM heap is exhausted', () => {
		const fake = fakeRaw()
		fake.raw._malloc = () => 0
		expect(() => wrapHeadlessEngine(fake.raw, 'test').mountRom('x.zip', new Uint8Array([1]))).toThrow(
			HeadlessEngineError,
		)
	})
	it('throws on filename malloc failure even with an empty zip', () => {
		const fake = fakeRaw()
		fake.raw._malloc = () => 0
		expect(() => wrapHeadlessEngine(fake.raw, 'test').mountRom('x.zip', new Uint8Array(0))).toThrow(
			HeadlessEngineError,
		)
	})
})

describe('bridge failure codes', () => {
	it('throws a typed error when the ROM cannot be stored', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_MountRom = () => -3
		const mount = () => wrapHeadlessEngine(fake.raw, 'test').mountRom('x.zip', new Uint8Array([1]))
		expect(mount).toThrow(expect.objectContaining({ op: 'mountRom', cause: 'cannot open the ROM file (code -3)' }))
	})
	it('rejects with a typed error when the table does not load', async () => {
		const fake = fakeRaw()
		let freed = 0
		fake.raw._VpxWasm_LoadTable = async () => -4
		fake.raw._free = () => void freed++
		await expect(wrapHeadlessEngine(fake.raw, 'test').loadTable(new Uint8Array([1]))).rejects.toMatchObject({
			op: 'loadTable',
			cause: 'table failed to load (code -4)',
		})
		expect(freed).toBe(1)
	})
})

describe('codeToSdlScancode guards', () => {
	it('returns undefined for truncated Key codes', () => {
		expect(codeToSdlScancode('Key')).toBeUndefined()
		expect(codeToSdlScancode('KeyA')).toBe(4)
	})
})

describe('romMountFileName', () => {
	const twd =
		'Const cGameName = "twd_160h"\nSub LoadVPM()\n\tWith Controller\n\t\t.GameName = cGameName\n\tEnd With\nEnd Sub'
	it('prefers the script game name over a mismatched file basename', () => {
		expect(romMountFileName(twd, 'twd')).toBe('twd_160h.zip')
	})
	it('reads a literal Controller.GameName', () => {
		expect(romMountFileName('Controller.GameName = "fh_12r7"', 'other')).toBe('fh_12r7.zip')
	})
	it('falls back to the file basename without a script game', () => {
		expect(romMountFileName('Sub Table1_Init()', 'myrom')).toBe('myrom.zip')
		expect(romMountFileName(undefined, 'game.zip')).toBe('game.zip')
	})
})

describe('JSPI exports', () => {
	it('awaits the load and checks its bridge code', async () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_LoadTable = async () => -4
		await expect(wrapHeadlessEngine(fake.raw, 'test').loadTable(new Uint8Array([1]))).rejects.toMatchObject({
			op: 'loadTable',
		})
	})
	it('keeps serving tables after a load that traps', async () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_LoadTable = async () => {
			throw new WebAssembly.RuntimeError('unreachable')
		}
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		await expect(engine.loadTable(new Uint8Array([1]))).rejects.toBeInstanceOf(WebAssembly.RuntimeError)
		fake.raw._VpxWasm_LoadTable = async () => 0
		await expect(engine.loadTable(new Uint8Array([1]))).resolves.toBeUndefined()
	})
})

describe('loadHeadlessEngine', () => {
	/** An ES module URL whose factory counts its runs and the bridge inits on `globalThis[key]`. */
	const fakeModuleUrl = (key: string, abi: number): string =>
		`data:text/javascript,${encodeURIComponent(`
			const c = (globalThis[${JSON.stringify(key)}] ??= { factory: 0, init: 0 })
			export default async () => {
				c.factory++
				return { _VpxWasm_GetAbiVersion: () => ${abi}, _VpxWasm_Init: () => (c.init++, 0) }
			}`)}`
	const counts = (key: string): { factory: number; init: number } =>
		(globalThis as unknown as Record<string, { factory: number; init: number }>)[key]

	it('shares one initialized module per URL', async () => {
		const url = fakeModuleUrl('__vpxShared', HEADLESS_ABI_VERSION)
		const [first, second] = await Promise.all([loadHeadlessEngine(url), loadHeadlessEngine(url)])
		expect(second).toBe(first)
		expect(await loadHeadlessEngine(url)).toBe(first)
		expect(counts('__vpxShared')).toEqual({ factory: 1, init: 1 })
	})
	it('rejects an ABI mismatch without initializing or caching it', async () => {
		const url = fakeModuleUrl('__vpxStale', HEADLESS_ABI_VERSION + 1)
		await expect(loadHeadlessEngine(url)).rejects.toMatchObject({ op: 'abi' })
		await expect(loadHeadlessEngine(url)).rejects.toBeInstanceOf(HeadlessEngineError)
		expect(counts('__vpxStale')).toEqual({ factory: 2, init: 0 })
	})
	it('refuses to load without cross-origin isolation', async () => {
		const globals = globalThis as { crossOriginIsolated?: unknown }
		const prior = globals.crossOriginIsolated
		globals.crossOriginIsolated = false
		try {
			await expect(
				loadHeadlessEngine('https://localhost:3000/wasm/vpinball-headless.js?env=1'),
			).rejects.toMatchObject({ op: 'environment' })
		} finally {
			globals.crossOriginIsolated = prior
		}
	})
	it('reports a 404 as missing with the build command and the import cause', async () => {
		const priorFetch = globalThis.fetch
		globalThis.fetch = (async () => ({ status: 404 })) as unknown as typeof fetch
		try {
			const error = await loadHeadlessEngine('data:text/javascript,throw new Error("boom")?missing=1').catch(
				e => e,
			)
			expect(error).toBeInstanceOf(HeadlessEngineMissingError)
			expect(error.message).toMatch('npm run build:wasm:headless')
			expect(error.cause).toBeInstanceOf(Error)
		} finally {
			globalThis.fetch = priorFetch
		}
	})
	it('reports a present-but-broken module as a load error, not missing', async () => {
		const priorFetch = globalThis.fetch
		globalThis.fetch = (async () => ({ status: 200 })) as unknown as typeof fetch
		try {
			await expect(
				loadHeadlessEngine('data:text/javascript,throw new Error("boom")?broken=1'),
			).rejects.toMatchObject({ op: 'load' })
			await expect(loadHeadlessEngine('data:text/javascript,export default 42?factory=1')).rejects.toMatchObject({
				op: 'load',
			})
		} finally {
			globalThis.fetch = priorFetch
		}
	})
})

describe('table session queue', () => {
	it('never enters LoadTable while a teardown is still suspended', async () => {
		const fake = fakeRaw()
		const entered: string[] = []
		let resume = (): void => {}
		// Teardown suspends until `resume`, like a JSPI export blocked on an engine thread.
		fake.raw._VpxWasm_DestroyTable = () =>
			new Promise<void>(done => {
				resume = () => {
					entered.push('destroy')
					done()
				}
			})
		fake.raw._VpxWasm_LoadTable = () => {
			entered.push('load')
			return Promise.resolve(0)
		}
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		const destroyed = engine.destroyTable()
		const loaded = engine.loadTable(new Uint8Array([1]))
		await new Promise(done => setTimeout(done, 0))
		expect(entered).toEqual([])
		resume()
		await Promise.all([destroyed, loaded])
		expect(entered).toEqual(['destroy', 'load'])
	})
})

describe('loadHeadlessEngine environment guard', () => {
	it('rejects with op environment before attempting the module import', async () => {
		const seen: string[] = []
		const priorFetch = globalThis.fetch
		globalThis.fetch = (async (...args: unknown[]) => {
			seen.push(String(args[0]))
			return { status: 200 }
		}) as unknown as typeof fetch
		const globals = globalThis as { crossOriginIsolated?: unknown }
		const prior = globals.crossOriginIsolated
		globals.crossOriginIsolated = false
		try {
			await expect(loadHeadlessEngine('test-env-guard-no-fetch.js')).rejects.toMatchObject({
				name: 'HeadlessEngineError',
				op: 'environment',
			})
			expect(seen).toEqual([])
		} finally {
			globals.crossOriginIsolated = prior
			globalThis.fetch = priorFetch
		}
	})
})

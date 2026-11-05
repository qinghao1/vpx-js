// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { describe, expect, it } from 'vitest'
import {
	codeToSdlScancode,
	createScancodeGate,
	DmdFrameFormat,
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
		_VpxWasm_Init: () => 0,
		_VpxWasm_MountRom: () => notImpl('MountRom'),
		_VpxWasm_LoadTable: () => notImpl('LoadTable'),
		_VpxWasm_StepFrame: () => {},
		_VpxWasm_GetPartCatalogJson: () => 0,
		_VpxWasm_GetBuffer: () => 0,
		_VpxWasm_GetDmdFrame: () => 0,
		_VpxWasm_PushKey: () => {},
		_VpxWasm_Nudge: () => {},
		_VpxWasm_GetAudioInfo: () => 0,
		_VpxWasm_GetAudio: () => 0,
		_VpxWasm_GetScriptErrorCount: () => 0,
		_VpxWasm_GetScriptError: () => 0,
		_VpxWasm_DestroyTable: () => {},
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

/** Craft a DMD descriptor: 5 words (bytePtr, w, h, format, frameId) + pixel bytes. */
function dmdPtr(
	fake: ReturnType<typeof fakeRaw>,
	width: number,
	height: number,
	format: number,
	pixels: Uint8Array,
): number {
	const { raw, malloc } = fake
	const bytePtr = malloc(pixels)
	const desc = new Uint8Array(20)
	const view = new DataView(desc.buffer)
	view.setUint32(0, bytePtr, true)
	view.setUint32(4, width, true)
	view.setUint32(8, height, true)
	view.setUint32(12, format, true)
	view.setUint32(16, 7, true)
	return malloc(desc)
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

describe('getBuffer', () => {
	/** Craft a GetBuffer descriptor: 3 words (bytePtr, count, stride) + row bytes. */
	const bufPtr = (fake: ReturnType<typeof fakeRaw>, count: number, stride: number): number => {
		const rows = new Float32Array(count * stride)
		for (let i = 0; i < rows.length; i++) rows[i] = i
		const bytePtr = fake.malloc(new Uint8Array(rows.buffer))
		const desc = new Uint8Array(12)
		new DataView(desc.buffer).setUint32(0, bytePtr, true)
		new DataView(desc.buffer).setUint32(4, count, true)
		new DataView(desc.buffer).setUint32(8, stride, true)
		return fake.malloc(desc)
	}
	it('returns rows for a matching stride', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetBuffer = () => bufPtr(fake, 2, WASM_STRIDES.movers)
		const view = wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')
		expect(view?.count).toBe(2)
		expect(view?.stride).toBe(WASM_STRIDES.movers)
		expect(view?.view.length).toBe(2 * WASM_STRIDES.movers)
	})
	it('rejects a one-sided stride change instead of misparsing rows', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetBuffer = () => bufPtr(fake, 2, WASM_STRIDES.movers + 1)
		expect(wrapHeadlessEngine(fake.raw, 'test').getBuffer('movers')).toBeUndefined()
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
	it('maps null and pre-bridge artifacts to undefined', () => {
		const fake = fakeRaw()
		fake.raw._VpxWasm_GetFlasherImage = () => 0
		expect(wrapHeadlessEngine(fake.raw, 'test').getFlasherImage(40)).toBeUndefined()
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

describe('getAudio', () => {
	it('copies drained int16 samples with the info format', () => {
		const fake = fakeRaw()
		const info = new Uint8Array(8)
		new DataView(info.buffer).setUint32(0, 44100, true)
		new DataView(info.buffer).setUint32(4, 2, true)
		fake.raw._VpxWasm_GetAudioInfo = () => fake.malloc(info)
		const pcm = new Int16Array([1000, -1000, 2000, -2000])
		const pcmPtr = fake.malloc(new Uint8Array(pcm.buffer))
		const desc = new Uint8Array(12)
		const view = new DataView(desc.buffer)
		view.setUint32(0, pcmPtr, true)
		view.setUint32(4, 4, true)
		view.setUint32(8, 2, true)
		fake.raw._VpxWasm_GetAudio = () => fake.malloc(desc)
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		expect(engine.getAudioInfo()).toEqual({ sampleRate: 44100, channels: 2 })
		const frame = engine.getAudio()
		expect(frame?.channels).toBe(2)
		expect(frame?.samples).toBeInstanceOf(Int16Array)
		expect(frame?.samples && Array.from(frame.samples)).toEqual([1000, -1000, 2000, -2000])
	})
	it('returns undefined when the ring is empty', () => {
		const fake = fakeRaw()
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		expect(engine.getAudio()).toBeUndefined()
	})
})

describe('hostile descriptors', () => {
	it('rejects unknown DMD formats instead of misdecoding them', () => {
		const fake = fakeRaw()
		const pixels = fake.malloc(new Uint8Array(128 * 32))
		const desc = new Uint8Array(20)
		const view = new DataView(desc.buffer)
		view.setUint32(0, pixels, true)
		view.setUint32(4, 128, true)
		view.setUint32(8, 32, true)
		view.setUint32(12, DmdFrameFormat.Srgb565, true)
		view.setUint32(16, 3, true)
		fake.raw._VpxWasm_GetDmdFrame = () => fake.malloc(desc)
		expect(wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()).toBeUndefined()
	})
	it('rejects absurd DMD dimensions instead of allocating', () => {
		const fake = fakeRaw()
		const desc = new Uint8Array(20)
		const view = new DataView(desc.buffer)
		view.setUint32(0, 1024, true)
		view.setUint32(4, 1 << 30, true)
		view.setUint32(8, 1, true)
		view.setUint32(12, DmdFrameFormat.Srgb888, true)
		view.setUint32(16, 3, true)
		fake.raw._VpxWasm_GetDmdFrame = () => fake.malloc(desc)
		expect(wrapHeadlessEngine(fake.raw, 'test').getDmdFrame()).toBeUndefined()
	})
	it('rejects misaligned audio ranges', () => {
		const fake = fakeRaw()
		const desc = new Uint8Array(12)
		const view = new DataView(desc.buffer)
		view.setUint32(0, 1, true)
		view.setUint32(4, 100, true)
		view.setUint32(8, 2, true)
		fake.raw._VpxWasm_GetAudio = () => fake.malloc(desc)
		expect(wrapHeadlessEngine(fake.raw, 'test').getAudio()).toBeUndefined()
	})
	it('throws when the WASM heap is exhausted', () => {
		const fake = fakeRaw()
		fake.raw._malloc = () => 0
		expect(() => wrapHeadlessEngine(fake.raw, 'test').mountRom('x.zip', new Uint8Array([1]))).toThrow()
	})
	it('throws on filename malloc failure even with an empty zip', () => {
		const fake = fakeRaw()
		fake.raw._malloc = () => 0
		expect(() => wrapHeadlessEngine(fake.raw, 'test').mountRom('x.zip', new Uint8Array(0))).toThrow()
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

describe('suspendable receiver', () => {
	it('calls table load/teardown on the module receiver', async () => {
		const fake = fakeRaw()
		let loadReceiver: unknown
		let destroyReceiver: unknown
		fake.raw._VpxWasm_LoadTable = function (this: unknown) {
			loadReceiver = this
			return 0
		}
		fake.raw._VpxWasm_DestroyTable = function (this: unknown) {
			destroyReceiver = this
		}
		const engine = wrapHeadlessEngine(fake.raw, 'test')
		await expect(engine.loadTable(new Uint8Array([1]))).resolves.toBe(0)
		await engine.destroyTable()
		expect(loadReceiver).toBe(fake.raw)
		expect(destroyReceiver).toBe(fake.raw)
	})

	// `WebAssembly.promising` rejects closures over an export, so the wrapper
	// must hand it the genuine export (identity-checked here), applied on the
	// module receiver; otherwise table load traps with SuspendError whenever
	// the bridge actually suspends (fast load right after init).
	it('hands the raw export to WebAssembly.promising on the module receiver', async () => {
		const prior = (WebAssembly as Record<string, unknown>).promising
		const seen: unknown[] = []
		// The stub honors the receiver the wrapper applies, so the assertion
		// below observes the wrapper's own forwarding, not the stub's.
		;(WebAssembly as Record<string, unknown>).promising = (fn: (...args: unknown[]) => unknown) => {
			seen.push(fn)
			return function (this: unknown, ...args: unknown[]) {
				return Promise.resolve(fn.apply(this, args))
			}
		}
		try {
			const fake = fakeRaw()
			let loadReceiver: unknown
			fake.raw._VpxWasm_LoadTable = function (this: unknown) {
				loadReceiver = this
				return 0
			}
			const engine = wrapHeadlessEngine(fake.raw, 'test')
			await expect(engine.loadTable(new Uint8Array([1]))).resolves.toBe(0)
			// Both suspendable call sites wrap eagerly at wrap time.
			expect(seen).toHaveLength(2)
			expect(seen[0]).toBe(fake.raw._VpxWasm_LoadTable)
			expect(seen[1]).toBe(fake.raw._VpxWasm_DestroyTable)
			expect(loadReceiver).toBe(fake.raw)
		} finally {
			if (prior === undefined) delete (WebAssembly as Record<string, unknown>).promising
			else (WebAssembly as Record<string, unknown>).promising = prior
		}
	})
})

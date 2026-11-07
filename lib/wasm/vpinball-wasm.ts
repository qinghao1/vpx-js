// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * TypeScript side of the headless-engine bridge
 * (`wasm/modules/headless/bridge/vpx_wasm_bridge.cpp`, built by the target in
 * `wasm/modules/headless/patches/`). Without the built artifact every entry
 * point here throws or rejects instead of using a fake engine.
 */

/**
 * Bridge ABI this facade speaks (`VpxWasm_GetAbiVersion`). Bump
 * together with the bridge on any export, descriptor or row-layout change.
 */
export const HEADLESS_ABI_VERSION = 4

/** Per-frame state buffer kinds, mirroring `VpxWasm_GetBuffer` (see `FillBuffers`). */
export type WasmBufferKind = 'balls' | 'movers' | 'lights' | 'prims' | 'flashers' | 'reels'

/** Floats per row. Movers use one fixed stride; the type tag selects the layout. */
export const WASM_STRIDES = {
	balls: 16,
	movers: 8,
	lights: 8,
	prims: 22,
	flashers: 8,
	reels: 4,
} as const

/** Mover type tag (column 1 of a mover row). The bridge implements the same order. */
export const MoverType = {
	Flipper: 0,
	Plunger: 1,
	Spinner: 2,
	Gate: 3,
	Bumper: 4,
	HitTarget: 5,
	Trigger: 6,
} as const

/** DMD frame formats (`ControllerPlugin.h:193-196`). LUM32F is linear float luminance, 4 bytes/dot. Srgb565 mirrors the header but the bridge never emits it. */
export const DmdFrameFormat = {
	Lum32F: 1,
	Srgb888: 2,
	Srgb565: 3,
}

/**
 * The engine binds flipper actions to Shift only (upstream `InputManager`
 * defaults `Key;225`/`Key;229`), while the browser scheme also advertises
 * arrows/A/D as flipper keys. Fold those onto Shift before SDL mapping so
 * every advertised flipper key reaches the flipper action.
 */
const FLIPPER_ALIASES: Record<string, string> = {
	ArrowLeft: 'ShiftLeft',
	KeyA: 'ShiftLeft',
	ArrowRight: 'ShiftRight',
	KeyD: 'ShiftRight',
}

export function resolveFlipperKey(code: string): string {
	return FLIPPER_ALIASES[code] ?? code
}

/**
 * Press accounting per SDL scancode: several browser keys (and touch zones)
 * fold onto one scancode, so the first down and the last up win. Returns
 * whether the caller should forward the event to the engine.
 */
export function createScancodeGate(): {
	down: (scancode: number) => boolean
	up: (scancode: number) => boolean
} {
	const counts = new Map<number, number>()
	return {
		down: scancode => {
			const n = (counts.get(scancode) ?? 0) + 1
			counts.set(scancode, n)
			return n === 1
		},
		up: scancode => {
			const n = Math.max(0, (counts.get(scancode) ?? 0) - 1)
			if (n > 0) counts.set(scancode, n)
			else counts.delete(scancode)
			return n === 0
		},
	}
}

/**
 * Map a `KeyboardEvent.code` to the SDL scancode `VpxWasm_PushKey` expects
 * (values follow `SDL_scancode.h`: letters A–Z are 4–29, digits 1–9 are
 * 30–38 with 0 last at 39, F1–F12 are 58–69).
 */
export function codeToSdlScancode(code: string): number | undefined {
	if (code.startsWith('Key')) {
		if (code.length !== 4) return undefined
		const letter = code.charCodeAt(3) - 65
		return letter >= 0 && letter < 26 ? 4 + letter : undefined
	}
	if (code.startsWith('Digit') && code.length === 6) {
		const d = code.charCodeAt(5) - 48
		if (d >= 0 && d <= 9) return d === 0 ? 39 : 29 + d
	}
	if (code.startsWith('F') && code.length <= 3) {
		const f = Number.parseInt(code.slice(1), 10)
		if (f >= 1 && f <= 12) return 57 + f
	}
	switch (code) {
		case 'Escape':
			return 41
		case 'Minus':
			return 45
		case 'Equal':
			return 46
		case 'Backspace':
			return 42
		case 'Tab':
			return 43
		case 'BracketLeft':
			return 47
		case 'BracketRight':
			return 48
		case 'Enter':
			return 40
		case 'ControlLeft':
			return 224
		case 'Semicolon':
			return 51
		case 'Quote':
			return 52
		case 'Backquote':
			return 53
		case 'ShiftLeft':
			return 225
		case 'Comma':
			return 54
		case 'Period':
			return 55
		case 'Slash':
			return 56
		case 'ShiftRight':
			return 229
		case 'Space':
			return 44
		case 'AltLeft':
			return 226
		case 'AltRight':
			return 230
		case 'ControlRight':
			return 228
		case 'ArrowLeft':
			return 80
		case 'ArrowRight':
			return 79
		case 'ArrowUp':
			return 82
		case 'ArrowDown':
			return 81
		case 'Insert':
			return 73
		case 'Home':
			return 74
		case 'PageUp':
			return 75
		case 'Delete':
			return 76
		case 'End':
			return 77
		case 'PageDown':
			return 78
		case 'CapsLock':
			return 57
		case 'NumpadDivide':
			return 84
		case 'NumpadMultiply':
			return 85
		case 'NumpadSubtract':
			return 86
		case 'NumpadAdd':
			return 87
		case 'NumpadEnter':
			return 88
		case 'Numpad1':
			return 89
		case 'Numpad2':
			return 90
		case 'Numpad3':
			return 91
		case 'Numpad4':
			return 92
		case 'Numpad5':
			return 93
		case 'Numpad6':
			return 94
		case 'Numpad7':
			return 95
		case 'Numpad8':
			return 96
		case 'Numpad9':
			return 97
		case 'Numpad0':
			return 98
		case 'NumpadDecimal':
			return 99
		case 'Backslash':
			return 49
		case 'ScrollLock':
			return 71
		case 'Pause':
			return 72
		case 'NumLock':
			return 83
		case 'MetaLeft':
			return 227
		case 'MetaRight':
			return 231
		default:
			return undefined
	}
}

/** Buffer ids for `VpxWasm_GetBuffer`, in `WasmBufferKind` order. */
export const WASM_BUFFER_IDS: Record<WasmBufferKind, number> = {
	balls: 0,
	movers: 1,
	lights: 2,
	prims: 3,
	flashers: 4,
	reels: 5,
}

/** A decoded DMD frame; pixels are copied out so they survive heap growth. */
export interface DmdFrameDesc {
	readonly width: number
	readonly height: number
	readonly format: number
	readonly frameId: number
	readonly pixels: Float32Array | Uint8Array
}

/**
 * Raw emscripten module surface of `vpinball-headless` (see `vpx_wasm_bridge.cpp`):
 * exported `VpxWasm_*` functions, pointers as numbers, plus the heap views. Use
 * {@link wrapHeadlessEngine} for the byte-array facade; the raw shape is
 * exported for tests only.
 */
export interface RawHeadlessModule {
	/** Absent on the earliest artifacts; checked once by {@link wrapHeadlessEngine}. */
	_VpxWasm_GetAbiVersion?(): number
	_VpxWasm_Init(): number
	_VpxWasm_MountRom(fileNamePtr: number, zipPtr: number, zipLen: number): number
	/** JSPI export: may block on engine threads. */
	_VpxWasm_LoadTable(vpxPtr: number, vpxLen: number): Promise<number>
	_VpxWasm_StepFrame(): void
	_VpxWasm_GetPartCatalogJson(): number
	_VpxWasm_GetBuffer(kind: number): number
	_VpxWasm_GetDmdFrame(): number
	_VpxWasm_GetFlasherImage(partIdx: number): number
	_VpxWasm_PushKey(sdlScancode: number, isPressed: boolean): void
	_VpxWasm_Nudge(angleDeg: number, force: number): void
	_VpxWasm_SetAudioLevel(volume: number, muted: boolean): void
	_VpxWasm_GetScriptErrorCount(): number
	_VpxWasm_GetScriptError(): number
	/** JSPI export: may block on engine threads. */
	_VpxWasm_DestroyTable(): Promise<void>
	_malloc(size: number): number
	_free(ptr: number): void
	UTF8ToString(ptr: number): string
	readonly HEAPU8: Uint8Array
	readonly HEAPU32: Uint32Array
	readonly HEAPF32: Float32Array
}

/** Facade operations that can fail with a {@link HeadlessEngineError}. */
export type HeadlessEngineOp = 'abi' | 'malloc' | 'mountRom' | 'loadTable' | 'readDescriptor' | 'environment' | 'load'

/** A bridge call failed; `op` names the facade operation, `cause` the reason. */
export class HeadlessEngineError extends Error {
	constructor(
		readonly op: HeadlessEngineOp,
		override readonly cause: string,
	) {
		super(`vpinball-headless ${op}: ${cause}`)
		this.name = 'HeadlessEngineError'
	}
}

/** Bridge return codes per operation (`VpxWasm_MountRom` / `VpxWasm_LoadTable`). */
const FAILURE_CODES: Record<'mountRom' | 'loadTable', Record<number, string>> = {
	mountRom: {
		[-1]: 'empty file name or ROM',
		[-2]: 'cannot create the ROM directory',
		[-3]: 'cannot open the ROM file',
		[-4]: 'short write of the ROM file',
	},
	loadTable: {
		[-1]: 'engine not initialized or empty table',
		[-2]: 'cannot write the table file',
		[-3]: 'short write of the table file',
		[-4]: 'table failed to load',
	},
}

function checkBridgeCode(op: 'mountRom' | 'loadTable', code: number): void {
	if (code !== 0) throw new HeadlessEngineError(op, `${FAILURE_CODES[op][code] ?? 'unknown failure'} (code ${code})`)
}

/** Byte-array facade over a raw bridge module; views stay valid until the next `StepFrame`. */
export interface HeadlessEngine {
	readonly url: string
	/** Throws {@link HeadlessEngineError} when the bridge cannot store the ROM. */
	mountRom(fileName: string, zip: Uint8Array): void
	/** Rejects with {@link HeadlessEngineError} when the table does not load. */
	loadTable(vpx: Uint8Array): Promise<void>
	/** Steps input, physics, script and plugins one frame on the engine's own game clock. */
	stepFrame(): void
	getPartCatalogJson(): string | undefined
	getBuffer(kind: WasmBufferKind): { view: Float32Array; count: number; stride: number } | undefined
	getDmdFrame(): DmdFrameDesc | undefined
	/**
	 * Live script image of one flasher part (`Flasher.ImageA`).
	 * `undefined` when there is nothing to apply: no table, bad index,
	 * non-flasher part, or empty image.
	 */
	getFlasherImage(partIdx: number): string | undefined
	pushKey(sdlScancode: number, isPressed: boolean): void
	nudge(angleDeg: number, force: number): void
	/** Overall output level of the engine's audio: table sounds and plugin streams (PinMAME ROM audio). */
	setAudioLevel(volume: number, muted: boolean): void
	getScriptErrorCount(): number
	getScriptError(): string | undefined
	destroyTable(): Promise<void>
}

/**
 * PinMAME locates a ROM zip by game name (`<game>.zip`), so the mount
 * filename must match it. The table script's `Controller.GameName` — usually
 * via a `cGameName` const — is authoritative; the uploaded file's basename
 * only covers script-less tables. The lookbehind keeps `cGameName` from
 * matching as a `GameName` assignment.
 */
export function romMountFileName(script: string | undefined, fileName: string): string {
	const literal = script?.match(/(?<!\w)\.?\s*GameName\s*=\s*"([^"]+)"/i)?.[1]
	if (literal) return `${literal}.zip`
	const ident = script?.match(/(?<!\w)\.?\s*GameName\s*=\s*([A-Za-z_]\w*)/i)?.[1]
	const game = ident && script?.match(new RegExp(`Const\\s+${ident}\\s*=\\s*"([^"]+)"`, 'i'))?.[1]
	return `${game ?? fileName.replace(/\.zip$/i, '')}.zip`
}

/**
 * Wraps a raw bridge module; blobs are copied in and freed per call. Throws
 * {@link HeadlessEngineError} (`op: 'abi'`) unless the module speaks
 * {@link HEADLESS_ABI_VERSION}, so no per-call export or layout probing is needed.
 */
export function wrapHeadlessEngine(raw: RawHeadlessModule, url: string): HeadlessEngine {
	const abi = typeof raw._VpxWasm_GetAbiVersion === 'function' ? raw._VpxWasm_GetAbiVersion() : 0
	if (abi !== HEADLESS_ABI_VERSION)
		throw new HeadlessEngineError(
			'abi',
			`${url} speaks ABI ${abi}, expected ${HEADLESS_ABI_VERSION}: rebuild it (npm run build:wasm:headless)`,
		)
	const copyIn = (bytes: Uint8Array): { ptr: number; len: number } => {
		const ptr = raw._malloc(bytes.length)
		if (!ptr && bytes.length) throw new HeadlessEngineError('malloc', `cannot allocate ${bytes.length} bytes`)
		raw.HEAPU8.set(bytes, ptr)
		return { ptr, len: bytes.length }
	}
	// One module serves table after table. Load and teardown may suspend
	// (JSPI), so queue them: a teardown never interleaves with the next load.
	let queue: Promise<unknown> = Promise.resolve()
	const serialized = <T>(op: () => Promise<T>): Promise<T> => {
		const run = queue.then(op)
		queue = run.catch(() => {})
		return run
	}
	const word = (index: number): number => raw.HEAPU32[index] ?? 0
	// Descriptors start with a 64-bit heap offset (little-endian, two u32 words), then u32 fields.
	const offset = (index: number): number => word(index) + word(index + 1) * 2 ** 32
	// Last published DMD frame: frameId is the bridge change counter.
	let dmdMemo: { width: number; height: number; format: number; frameId: number; desc: DmdFrameDesc } | undefined
	// The ABI check rules out layout drift, so a descriptor outside the live
	// heap is an engine bug: fail loudly instead of reading garbage or making
	// a giant allocation. Caps are generous headroom, not exact limits.
	const assertInHeap = (bytePtr: number, bytes: number, align: number, cap: number): void => {
		if (bytePtr % align === 0 && bytes <= cap && bytePtr + bytes <= raw.HEAPU8.buffer.byteLength) return
		throw new HeadlessEngineError('readDescriptor', `range ${bytePtr}+${bytes} is outside the engine heap`)
	}
	const readView = (kind: WasmBufferKind) => {
		const base = raw._VpxWasm_GetBuffer(WASM_BUFFER_IDS[kind]) / 4
		const ptr = offset(base)
		if (!ptr) return undefined
		const count = word(base + 2)
		const stride = word(base + 3)
		assertInHeap(ptr, count * stride * 4, 4, 1 << 24)
		return { view: floatRowView(raw.HEAPF32.buffer, ptr, count, stride), count, stride }
	}
	return {
		url,
		mountRom: (fileName, zip) => {
			const name = copyIn(new TextEncoder().encode(`${fileName}\0`))
			const { ptr, len } = copyIn(zip)
			try {
				checkBridgeCode('mountRom', raw._VpxWasm_MountRom(name.ptr, ptr, len))
			} finally {
				raw._free(ptr)
				raw._free(name.ptr)
			}
		},
		loadTable: vpx =>
			serialized(async () => {
				// A new table restarts the bridge's frameId counter.
				dmdMemo = undefined
				const { ptr, len } = copyIn(vpx)
				try {
					checkBridgeCode('loadTable', await raw._VpxWasm_LoadTable(ptr, len))
				} finally {
					raw._free(ptr)
				}
			}),
		stepFrame: () => raw._VpxWasm_StepFrame(),
		getPartCatalogJson: () => {
			const ptr = raw._VpxWasm_GetPartCatalogJson()
			return ptr ? raw.UTF8ToString(ptr) : undefined
		},
		getBuffer: kind => readView(kind),
		getDmdFrame: () => {
			const desc = raw._VpxWasm_GetDmdFrame()
			if (!desc) {
				dmdMemo = undefined
				return undefined
			}
			const base = desc / 4
			const bytePtr = offset(base)
			const width = word(base + 2)
			const height = word(base + 3)
			const format = word(base + 4)
			// frameId is the bridge's change counter: same id means same
			// pixels, so skip the heap copy on static frames.
			const frameId = word(base + 5)
			if (
				dmdMemo &&
				dmdMemo.width === width &&
				dmdMemo.height === height &&
				dmdMemo.format === format &&
				dmdMemo.frameId === frameId
			)
				return dmdMemo.desc
			// Packed 8-bit formats are bytes per dot, not floats. Anything
			// else is a future format (e.g. Srgb565): reject, don't misdecode.
			let pixels: Uint8Array | Float32Array
			if (format === DmdFrameFormat.Srgb888) {
				// SRGB triplets: 3 interleaved bytes per dot (R, G, B).
				assertInHeap(bytePtr, width * height * 3, 1, 1 << 24)
				pixels = new Uint8Array(raw.HEAPU8.buffer, bytePtr, width * height * 3).slice()
			} else if (format === DmdFrameFormat.Lum32F) {
				assertInHeap(bytePtr, width * height * 4, 4, 1 << 26)
				pixels = new Float32Array(raw.HEAPF32.buffer, bytePtr, width * height).slice()
			} else return undefined
			const out = {
				width,
				height,
				format,
				frameId,
				pixels,
			}
			dmdMemo = { width, height, format, frameId, desc: out }
			return out
		},
		pushKey: (sdlScancode, isPressed) => raw._VpxWasm_PushKey(sdlScancode, isPressed),
		nudge: (angleDeg, force) => raw._VpxWasm_Nudge(angleDeg, force),
		setAudioLevel: (volume, muted) => raw._VpxWasm_SetAudioLevel(volume, muted),
		getScriptErrorCount: () => Math.max(0, raw._VpxWasm_GetScriptErrorCount()),
		getScriptError: () => {
			const ptr = raw._VpxWasm_GetScriptError()
			return ptr ? raw.UTF8ToString(ptr) : undefined
		},
		getFlasherImage: partIdx => {
			const ptr = raw._VpxWasm_GetFlasherImage(partIdx)
			return ptr ? raw.UTF8ToString(ptr) : undefined
		},
		destroyTable: () =>
			serialized(async () => {
				dmdMemo = undefined
				await raw._VpxWasm_DestroyTable()
			}),
	}
}

/** Thrown when the headless-engine artifact is missing (the glue URL 404s). */
export class HeadlessEngineMissingError extends Error {
	constructor(url: string, options?: ErrorOptions) {
		super(`vpinball-headless not found at ${url}: build it with \`npm run build:wasm:headless\`.`, options)
		this.name = 'HeadlessEngineMissingError'
	}
}

/**
 * Resolve the glue's sibling files (the `.wasm` binary, the `.data` package)
 * against the glue URL. Emscripten derives these from its own
 * `scriptDirectory`, which is empty when the glue is bundled or re-hosted, so
 * the host passes this as the factory's `locateFile`: otherwise the `.data`
 * fetch falls back to a page-root 404 document and every preloaded VBS
 * script and asset materializes as an empty file. `pageBase` defaults to the
 * current page; tests pass it explicitly.
 */
export function wasmLocateFile(artifactUrl: string, pageBase?: string): (path: string) => string {
	const base = new URL(artifactUrl, pageBase ?? globalThis.location?.href ?? 'http://localhost/')
	return (path: string) => new URL(path, base).href
}

const engines = new Map<string, Promise<HeadlessEngine>>()

/**
 * Loads the headless-engine ES module (`-sMODULARIZE=1 -sEXPORT_ES6=1`) once
 * per URL, wraps it in the byte-array facade and initializes the bridge.
 * Every caller shares that module (one heap and one pthread pool per page) and
 * loads its table into it in turn. Rejects with {@link HeadlessEngineMissingError}
 * when the artifact 404s and with {@link HeadlessEngineError} (`op: 'environment'`
 * without cross-origin isolation, `op: 'load'` when the module fails otherwise,
 * `op: 'abi'` on a version mismatch); a failed load is not cached.
 */
export function loadHeadlessEngine(url = 'wasm/vpinball-headless.js'): Promise<HeadlessEngine> {
	let engine = engines.get(url)
	if (!engine) {
		engine = instantiateHeadlessEngine(url)
		engines.set(url, engine)
		engine.catch(() => engines.delete(url))
	}
	return engine
}

/** Fail fast when the host page cannot run the threaded engine (every facade consumer needs this). */
function checkHostEnvironment(url: string): void {
	const isolated = (globalThis as { crossOriginIsolated?: unknown }).crossOriginIsolated
	if (isolated === false)
		throw new HeadlessEngineError(
			'environment',
			`${url} needs a cross-origin-isolated page (SharedArrayBuffer): serve COOP/COEP headers`,
		)
}

/** Sort an engine-module import failure into missing (404) vs broken. */
async function asEngineLoadError(url: string, cause: unknown): Promise<Error> {
	let status: number | undefined
	try {
		status = (await fetch(url, { method: 'HEAD' })).status
	} catch {
		status = undefined
	}
	if (status === 404) return new HeadlessEngineMissingError(url, { cause })
	const detail = cause instanceof Error ? cause.message : String(cause)
	return new HeadlessEngineError('load', `${url} failed to load${status ? ` (HTTP ${status})` : ''}: ${detail}`)
}

async function instantiateHeadlessEngine(url: string): Promise<HeadlessEngine> {
	checkHostEnvironment(url)
	let factory: unknown
	try {
		const imported = (await import(/* @vite-ignore */ url)) as { default?: unknown }
		factory = imported.default ?? imported
	} catch (error) {
		throw await asEngineLoadError(url, error)
	}
	if (typeof factory !== 'function') throw new HeadlessEngineError('load', `${url} did not export an engine factory`)
	const locateFile = wasmLocateFile(url)
	const raw = (await (factory as (module?: { locateFile?: (path: string) => string }) => Promise<RawHeadlessModule>)({
		locateFile,
	})) as RawHeadlessModule
	const engine = wrapHeadlessEngine(raw, url)
	raw._VpxWasm_Init()
	return engine
}

/**
 * Float view over a WASM buffer row range. Re-create the view whenever the
 * heap grows (`HEAPF32.buffer` changes identity under `-sALLOW_MEMORY_GROWTH`).
 */
export function floatRowView(heapBuffer: ArrayBufferLike, ptr: number, count: number, stride: number): Float32Array {
	return new Float32Array(heapBuffer, ptr, count * stride)
}

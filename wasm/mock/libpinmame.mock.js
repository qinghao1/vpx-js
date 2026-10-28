// Mock libPinMAME WASM - emitted when emsdk not installed.
// Real build: wasm/dist/libpinmame.js (Emscripten MODULARIZE)
// This mock implements the same JS API surface used by lib/emu/pinmame/pinmame-loader.ts
// so `npm run build` succeeds and vpx-js runs physics-only (no SAM emulation).
//
// Heaps are lazy and small: the mock backend never emulates, so nothing ever
// touches wasm memory. Buffers materialize on first access (kept as shared
// views over one ArrayBuffer, like Emscripten) instead of 128 MB up front.
let heap = null
function backing() {
	if (!heap) heap = new ArrayBuffer(4 * 1024 * 1024)
	return heap
}

export default function createPinmameModule() {
	return Promise.resolve({
		ccall: () => {
			console.warn('[pinmame mock] ccall not implemented - install emsdk and run npm run build:wasm')
			return 0
		},
		cwrap: () => () => 0,
		FS: {
			mkdirTree: () => {},
			writeFile: () => {},
			readFile: () => new Uint8Array(),
		},
		get HEAPU8() {
			return new Uint8Array(backing())
		},
		get HEAPU32() {
			return new Uint32Array(backing())
		},
		UTF8ToString: () => '',
		stringToUTF8: () => {},
		lengthBytesUTF8: () => 0,
		_malloc: () => 0,
		_free: () => {},
		getValue: () => 0,
		setValue: () => {},
		_PinmameIsRunning: () => 0,
		_PinmameIsPaused: () => 0,
	})
}
export const isMock = true

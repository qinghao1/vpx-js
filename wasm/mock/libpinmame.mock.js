// Mock libPinMAME WASM - emitted when emsdk not installed.
// Real build: wasm/dist/libpinmame.js (Emscripten MODULARIZE)
// This mock implements the same JS API surface used by lib/emu/pinmame/pinmame-loader.ts
// so `npm run build` succeeds and vpx-js runs physics-only (no SAM emulation).
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
		HEAPU8: new Uint8Array(64 * 1024 * 1024),
		HEAPU32: new Uint32Array(16 * 1024 * 1024),
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

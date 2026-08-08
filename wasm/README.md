# PinMAME → WASM

`external/pinmame` (libPinMAME 3.7) → `wasm/dist/libpinmame.js` + `.wasm` for `vpx-js`.
Generic PinMAME support for any hardware (WPC, SAM, Whitestar, S11, Data East, …). `wpc-emu` covers WPC only; PinMAME covers the rest.

## Prereqs

- Emscripten ≥ 4.0 (tested 6.0.6) — `git clone https://github.com/emscripten-core/emsdk.git ~/projects/emsdk && ~/projects/emsdk/emsdk install latest && ~/projects/emsdk/emsdk activate latest`
- CMake ≥ 3.28, Ninja ≥ 1.11, Node ≥ 22

## Build

```bash
npm run build:wasm        # release, pthreads (emcmake required)
npm run build:wasm:debug  # debug
npm run build:wasm:mock   # mock only, no emsdk
```

Outputs to `wasm/dist/`. Without `emcc`, the build falls back to `wasm/mock/libpinmame.mock.js` so `npm run build` still works (physics only).
Build dirs: `wasm/build/wasm` (release), `wasm/build/wasm-debug` (debug).

## Use

```ts
import createPinmameModule from '../wasm/dist/libpinmame.js'
const m = await createPinmameModule()
m.FS.mkdirTree('/pinmame/roms')
m.FS.writeFile('/pinmame/roms/<gamename>.zip', romBytes)
const run = m.cwrap('PinmameRun', 'number', ['number'])
```

Adapter: `lib/emu/pinmame/` — `PinMameEmulator` implements `IEmulator` for any game, `pinmame-loader.ts` handles wasm/mock fallback.
Set `GameName` on `VpmController` to any PinMAME ROM name (e.g. `twd_160h`, `mm_109`, `afm_113b`); provide the corresponding `<gamename>.zip` under `/pinmame/roms/` (or `/roms/`) at runtime via `fetch` or `FS.writeFile`.

## Notes

- Pthreads (`-pthread -sPTHREAD_POOL_SIZE=4`) — browser needs `COOP:same-origin` + `COEP:require-corp` (set in `demo-browser/vite.config.js`).
- Example ROM search: `~/.pinmame/roms/<gamename>.zip`; example VPX: any `.vpx` with `cGameName = "<gamename>"` in its script.

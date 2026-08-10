# WASM

Emscripten builds for `vpx-js`. All outputs go to `wasm/dist/` (gitignored).

## Modules

| Module | Source | Output | Purpose |
|--------|--------|--------|---------|
| `kernels` | `wasm/modules/kernels/src/kernels.cpp` | `wasm/dist/kernels.js` + `.wasm` | Physics collision batch kernels (SIMD, no FS). Used by `lib/physics/wasm/kernels.ts`. Falls back to pure JS if absent. |
| `pinmame` | `external/pinmame` (libPinMAME 3.7) + `wasm/modules/pinmame/patches/*.patch` | `wasm/dist/libpinmame.js` + `.wasm` | Full PinMAME emulation (SAM, Whitestar, Data East, etc.). Used by `lib/emu/pinmame/`. Falls back to `wasm/mock/libpinmame.mock.js` when WASM not built. |

`wpc-emu` remains the lightweight path for WPC hardware; PinMAME covers the rest.

## Layout

```
wasm/
  README.md
  CMakeLists.txt              # umbrella — add_subdirectory(modules/*)
  CMakePresets.json           # presets: wasm (Release) → build/wasm, debug → build/wasm-debug
  build.sh                    # unified entry: patch → emcmake → cmake --build
  dist/                       # build artifacts (gitignored): *.js + *.wasm
  mock/
    libpinmame.mock.js        # PinMAME fallback when emsdk absent
  modules/
    kernels/
      CMakeLists.txt
      src/kernels.cpp
    pinmame/
      CMakeLists.txt
      patches/*.patch
  build/                      # ephemeral — CMake build dirs (gitignored)
external/pinmame/             # upstream submodule (repo root)
```

Single `dist/` and single `build/` follow idiomatic Emscripten/CMake practice: one preset builds all modules, each module owns its `CMakeLists.txt` and `RUNTIME_OUTPUT_DIRECTORY` points to the shared `dist/`.

## Prereqs

- Emscripten ≥ 4.0 (tested 6.0.6)
  ```bash
  git clone https://github.com/emscripten-core/emsdk.git ~/projects/emsdk
  ~/projects/emsdk/emsdk install latest && ~/projects/emsdk/emsdk activate latest
  ```
- CMake ≥ 3.28, Ninja ≥ 1.11, Node ≥ 22

## Build

```bash
npm run build:wasm        # release — kernels + pinmame (pthreads)
npm run build:wasm:debug  # debug — no optimization, assertions on
npm run build:wasm:mock   # mock only — no emsdk, physics-only
# or direct:
wasm/build.sh             # release
wasm/build.sh --debug
wasm/build.sh --mock
```

Without `emcc`, the build copies the PinMAME mock so `npm run build` still works. Build intermediates are in `wasm/build/wasm` and `wasm/build/wasm-debug` (gitignored).


## Outputs

- `wasm/dist/kernels.js` / `wasm/dist/kernels.wasm` — `createKernelsModule` (ESM, `MODULARIZE`, `EXPORT_ES6`)
- `wasm/dist/libpinmame.js` / `wasm/dist/libpinmame.wasm` — `createPinmameModule` (ESM, `MODULARIZE`, pthreads)

`*.wasm` is gitignored; only the JS glue is reproducible without a toolchain (mock provides it for PinMAME).

## Use

### PinMAME

```ts
import createPinmameModule from '../wasm/dist/libpinmame.js'
const m = await createPinmameModule()
m.FS.mkdirTree('/pinmame/roms')
m.FS.writeFile('/pinmame/roms/twd_160h.zip', romBytes)
const run = m.cwrap('PinmameRun', 'number', ['number'])
```

Adapter: `lib/emu/pinmame/` (`PinMameEmulator` + `pinmame-loader.ts` handles wasm/mock discovery). Set `GameName` on `VpmController` to the ROM name and provide the ZIP via `FS.writeFile`.

### Kernels

```ts
import { getWasmKernels } from './lib/physics/wasm/kernels.js'
const mod = await getWasmKernels()
// SoA batch APIs: _batchHitTestCircle, _batchHitTestPlane, _batchHitTestTriangle, …
mod._batchHitTestCircle(n, bx, by, bz, vx, vy, vz, br, cxPtr, cyPtr, ...)
```

Loader uses `wasm/dist/kernels.js`. Pure-JS fallbacks exist if WASM is unavailable.

## Notes

- **Pthreads** — PinMAME build uses `-pthread -sPTHREAD_POOL_SIZE=4`. Browsers require `COOP: same-origin` + `COEP: require-corp` headers. Node and workers work without headers.
- **Patches** — `wasm/modules/pinmame/patches/*.patch` are applied idempotently (`git apply --check`) before each build. To reset: `git -C external/pinmame reset --hard`.
- **CMake** — Umbrella project `vpx-js-wasm` enforces `EMSCRIPTEN` and `PINMAME_WASM_PTHREADS=ON` by default. Edit `CMakePresets.json` or pass `-DPINMAME_WASM_PTHREADS=OFF` to disable threads.

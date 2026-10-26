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

Without `emcc` (or on build failure) the script exits 1 and leaves `dist/`
untouched — pass `--allow-mock` to fall back to the PinMAME mock with exit 0
instead. `--mock` copies the mock unconditionally (physics-only, no emulation).
Build intermediates are in `wasm/build/wasm` and `wasm/build/wasm-debug` (gitignored).


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
import { getWasmKernels, tryGetWasmBatchHitViewsOutCircle, warmWasmPools } from './lib/physics/wasm/kernels.js'
await getWasmKernels()
// counts per kind: circle, plane, lineZ, point, triangle, lineSeg, line3D, poly
warmWasmPools(nCircle, 0, 0, 0, 0, 0, 0, 0)
const v = tryGetWasmBatchHitViewsOutCircle(nCircle) // null until warmed — run scalar instead
if (v) {
	v.cx.set(cxs) // …fill one Float32Array per input field
	v.run(bx, by, bz, vx, vy, vz, r, dt)
	// read v.oT[i], v.oContact[i], v.oNx/oNy/oNz[i], v.oDist[i], v.oBnv[i]
}
```

Never call `mod._batchHitTest*` directly: the `getViews`/`tryGet*` wrappers in
`lib/physics/wasm/kernels.ts` own the SoA pools. Loader uses `wasm/dist/kernels.js`.
Pure-JS fallbacks exist if WASM is unavailable.

## Kernels ABI contract

Every `_batchHitTest*` export shares one shape (see `BATCH_SPECS` in
`lib/physics/wasm/kernels.ts` — key order IS the WASM argument order):

```
(n, bx,by,bz, vx,vy,vz, r, *floatIns, *intIns, *extraIns, dt, *outs)
```

- Inputs are struct-of-arrays: one `float*`/`int*` per field, `n` lanes each.
  Per-kind field lists live only in `BATCH_SPECS` (e.g. circle: `cx,cy,cr,zl,zh`);
  the C++ parameter names in `kernels.cpp` mirror them.
- Outputs are always 7 arrays in this order:
  `oT: float*`, `oContact: int*`, `oNx,oNy,oNz,oDist,oBnv: float*`.
  NOTE `oContact` is int32 — read it via `HEAP32`/`Int32Array`, not `HEAPF32`.
- Miss encoding: `oT[i] = -1` (default `Hit.t`) means "no hit this step".
  Replay treats `t >= -0.5 && t <= coll.hitTime` as a hit.
- Poly stride: vertex blobs are strided `vertsX[i*32+j]` / `vertsY[i*32+j]`
  (`POLY_MAX_VERTS = 32`). The constant is defined twice — `kernels.cpp` and
  `POLY_MAX_VERTS` in `lib/physics/wasm/kernels.ts` — and the two must stay in
  sync; JS polys with `rgv.length > 32` never enter the batch (`isBatchPoly`).
- NO BOUNDS CHECKS: the C++ loops `for (i < n)` over raw pointers. Writing past
  `count` (or past `count*32` for poly verts) silently corrupts the WASM heap.
  Always allocate through `getViews`/`tryGet*` + `warmWasmPools` and never write
  past the count you requested.

### Replay semantics (`lib/physics/wasm/batched-hittest.ts`)

- `WASM_THRESHOLD = 64`: batches with fewer than 64 total hit objects run scalar —
  below that, pool fill + FFI costs more than it saves.
- `BatchCollector.run()` acquires views with `tryGet*` (null when pools are cold,
  too small, or the heap grew). On null it calls `warmWasmPools(...)`, returns
  false, and the caller runs scalar for that step; the NEXT step uses WASM.
  First-frame slowness is warmup, not a bug.
- `dt` is frozen: every lane runs with the `coll.hitTime` captured before the
  batch. Replay then walks hits in collection order, tightening with
  `t <= coll.hitTime`, so earlier wins still narrow later ones.

## Notes

- **Pthreads** — PinMAME build uses `-pthread -sPTHREAD_POOL_SIZE=4`. Browsers require `COOP: same-origin` + `COEP: require-corp` headers. Node and workers work without headers.
- **Patches** — `wasm/modules/pinmame/patches/*.patch` are applied idempotently (`git apply --check`) before each build. To reset: `git -C external/pinmame reset --hard`.
- **CMake** — Umbrella project `vpx-js-wasm` enforces `EMSCRIPTEN` and `PINMAME_WASM_PTHREADS=ON` by default. Edit `CMakePresets.json` or pass `-DPINMAME_WASM_PTHREADS=OFF` to disable threads.

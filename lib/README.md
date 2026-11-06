# `lib/` — Library Source

ESM TypeScript source for `vpx-js` (Node `>=24`, `ES2024`, `type: module`). `tsc` builds it to `dist-esm/` (JS + source maps, no `.d.ts`).

## Consuming

Not published to npm (`private`, no `exports`): consumers deep-import modules from `dist-esm/lib/...` (demo-browser, harness) or from `lib/` source (specs, `tsx`).

- `lib/refs.node.ts` / `lib/refs.browser.ts` — platform-specific surface:

```ts
import { BinaryReader, storage, ThreeTextureLoader } from './dist-esm/lib/refs.node.js' // Node
import { BinaryReader, storage, ThreeTextureLoader } from './dist-esm/lib/refs.browser.js' // Browser
```

`lib/refs-three.ts` re-exports three core symbols (`Mesh`, `Scene`, `Color`, …) so library code imports three core via refs and addons directly from `three`.

## Platform Split

| file              | Provides                                                                                |
| ----------------- | --------------------------------------------------------------------------------------- |
| `refs.node.ts`    | `NodeBinaryReader`, `storage` (in-memory), `ThreeTextureLoaderNode` (fs + zlib)         |
| `refs.browser.ts` | `BrowserBinaryReader`, `storage` (`localStorage`), `ThreeTextureLoaderBrowser` (canvas) |
| `refs-three.ts`   | shared three re-exports for both platforms                                              |

I/O uses `Uint8Array`/`DataView` for both Node and browser.

## Three.js

`three@0.186` + `three-mesh-bvh` as ESM:

```ts
// core — via refs
import { Mesh, Scene } from './dist-esm/lib/refs.node.js'

// addons — directly from three
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
```

## Layout

```
lib/
├── refs-*.ts         platform and three shims
├── io/               OLE / BIFF / BinaryReader (node+browser)
├── math/             vectors, misc numerics
├── vpt/              VPX table + item types + mesh/material/texture
├── render/threejs/   ThreeRenderApi, mesh/material/light generators
├── wasm/             headless-engine ABI (VpxWasm_*), scene sync, no three.js
├── emu/              VPS table/ROM catalog for the demo's table browser
└── util/             logger, caches, workers, small helpers
```

Build: `npm run build` (`tsc` → `dist-esm/`), required before `demo-browser`. Headless WASM is built separately: `npm run build:wasm:headless` (emscripten; patches under `wasm/modules/headless/patches/`, never hand-edit `external/vpinball`).

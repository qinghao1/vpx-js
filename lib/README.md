# `lib/` — Library Source

ESM TypeScript source for `vpx-js` (Node `>=24`, `ES2024`, `type: module`). Built with `tsup` to `dist/` (ESM + `.d.ts`) and mirrored to `dist-esm/`.

## Exports

`package.json` exposes three entry points:

```json
".": "dist/index.js",
"./lib/refs.node.js": "dist/lib/refs.node.js",
"./lib/refs.browser.js": "dist/lib/refs.browser.js"
```

- `lib/index.ts` — public surface (`Table`, `WasmSceneSync`, `HeadlessEngine`/`loadHeadlessEngine`, `ThreeRenderApi`, `OleCompoundDoc`, etc.).
- `lib/refs.node.ts` / `lib/refs.browser.ts` — platform-specific surface:

```ts
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.node.js' // Node
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.browser.js' // Browser
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
import { Mesh, Scene } from 'vpx-js/lib/refs.node.js'

// addons — directly from three
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
```

## Layout

```
lib/
├── index.ts          public entry (wasm seam: WasmSceneSync, HeadlessEngine)
├── refs-*.ts         platform and three shims
├── io/               OLE / BIFF / BinaryReader (node+browser)
├── math/             vectors, misc numerics
├── vpt/              VPX table + item types + mesh/material/texture
├── render/threejs/   ThreeRenderApi, mesh/material/light generators
├── wasm/             headless-engine ABI (VpxWasm_*), scene sync, no three.js
├── emu/              ROM fetcher for viewer `?rom=` preload
├── types/            shared type declarations
└── util/             logger, vectors, storage helpers
```

Build: `npm run build` (`tsup` + `tsc` → `dist/` + `dist-esm/`); `build:esm` alone suffices before `demo-browser`. Headless WASM is built separately: `npm run build:wasm:headless` (emscripten; patches under `wasm/modules/headless/patches/`, never hand-edit `external/vpinball`).

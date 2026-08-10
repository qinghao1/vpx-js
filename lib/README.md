# `lib/` — Library Source

ESM TypeScript source for `vpx-js` (Node `>=24`, `ES2024`, `type: module`). Built with `tsup` to `dist/` (ESM + `.d.ts`) and mirrored to `dist-esm/` for tooling. No CommonJS, no `pkg.browser` switch, no vendored three.

## Exports

`package.json` exposes three entry points (see `tsup.config.ts`):

```json
".": "dist/index.js",
"./lib/refs.node.js": "dist/lib/refs.node.js",
"./lib/refs.browser.js": "dist/lib/refs.browser.js"
```

- `lib/index.ts` — public surface (`VP_VERSION_*`, `Table`, `Player`, `TableExporter`, `ThreeRenderApi`, `Ball`, `OleCompoundDoc`, etc.).
- `lib/refs.node.ts` / `lib/refs.browser.ts` — platform-specific surface. Import one explicitly:

```ts
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.node.js'    // Node
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.browser.js' // Browser
```

`lib/refs-three.ts` re-exports three core symbols (`Mesh`, `Scene`, `Color`, …) so library code never imports from `three` directly except for addons.

## Platform Split

| file | Node | Browser |
|---|---|---|
| `refs.node.ts` | `NodeBinaryReader`, `storage` (node fs), `ThreeTextureLoaderNode` (sharp), `getTextFile` via `readFileSync(res/scripts/…)`, patches `FileLoader.load` to accept `ArrayBuffer` | — |
| `refs.browser.ts` | — | `BrowserBinaryReader`, `ThreeTextureLoaderBrowser` (canvas), `getTextFile` via bundled `import … from 'res/scripts/….vbs'` |
| `refs-three.ts` | shared three re-exports for both | shared |

Explicit imports avoid bundler hacks and keep browser bundles free of Node shims (`Uint8Array`/`DataView` throughout).

## Three.js

`three@0.185` + `three-mesh-bvh` as ESM. Node `>=24` handles ESM natively, so the same imports work everywhere:

```ts
// core — always via refs-three
import { Mesh, Scene } from 'vpx-js/lib/refs.node.js' // or refs.browser.js

// addons — directly from three
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
```

No `three/src/*` per-file imports and no vendored `RGBELoader` — `three/addons/*` works in both runtimes.

## Layout

```
lib/
├── index.ts          public entry
├── refs-*.ts         platform & three shims
├── io/               OLE / BIFF / BinaryReader (node+browser)
├── vpt/              VPX table + 22 item types + mesh/material/texture
├── game/             Player, PlayerPhysics, PinInput, I* interfaces
├── physics/          hit shapes, HitKD/Quadtree, constants
├── render/threejs/   ThreeRenderApi, mesh/material/light generators
├── scripting/        VBScript grammar, Transpiler, stdlib, VBS scripts
├── emu/              wpc-emu + pinmame/ WASM wrapper
└── util/             logger, vectors, storage helpers
```

Build is `npm run build` — `build/compile-rules.ts` generates `lib/scripting/grammar/rules.ts` from `grammar.bnf`, then `tsup` (no treeshake/shims, `.vbs`/`.bnf` as `text`).

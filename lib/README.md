# `lib/` — Library Source

ESM TypeScript source for `vpx-js` (Node `>=24`, `ES2024`, `type: module`). Built with `tsup` to `dist/` (ESM + `.d.ts`) and mirrored to `dist-esm/`.

## Exports

`package.json` exposes three entry points:

```json
".": "dist/index.js",
"./lib/refs.node.js": "dist/lib/refs.node.js",
"./lib/refs.browser.js": "dist/lib/refs.browser.js"
```

- `lib/index.ts` — public surface (`VP_VERSION_*`, `Table`, `Player`, `TableExporter`, `ThreeRenderApi`, `Ball`, `OleCompoundDoc`, etc.).
- `lib/refs.node.ts` / `lib/refs.browser.ts` — platform-specific surface:

```ts
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.node.js'    // Node
import { BinaryReader, storage, ThreeTextureLoader } from 'vpx-js/lib/refs.browser.js' // Browser
```

`lib/refs-three.ts` re-exports three core symbols (`Mesh`, `Scene`, `Color`, …) so library code imports three core via refs and addons directly from `three`.

## Platform Split

| file | Provides |
|---|---|
| `refs.node.ts` | `NodeBinaryReader`, `storage` (node fs), `ThreeTextureLoaderNode` (sharp), `getTextFile` via `readFileSync(res/scripts/…)`, patches `FileLoader.load` for `ArrayBuffer` |
| `refs.browser.ts` | `BrowserBinaryReader`, `ThreeTextureLoaderBrowser` (canvas), `getTextFile` via bundled `import … from 'res/scripts/….vbs'` |
| `refs-three.ts` | shared three re-exports for both platforms |

I/O uses `Uint8Array`/`DataView` for both Node and browser.

## Three.js

`three@0.185` + `three-mesh-bvh` as ESM:

```ts
// core — via refs
import { Mesh, Scene } from 'vpx-js/lib/refs.node.js'

// addons — directly from three
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
```

## Layout

```
lib/
├── index.ts          public entry
├── refs-*.ts         platform and three shims
├── io/               OLE / BIFF / BinaryReader (node+browser)
├── vpt/              VPX table + 22 item types + mesh/material/texture
├── game/             Player, PlayerPhysics, PinInput, interfaces
├── physics/          hit shapes, HitKD/Quadtree, constants
├── render/threejs/   ThreeRenderApi, mesh/material/light generators
├── scripting/        VBScript grammar, Transpiler, stdlib, VBS scripts
├── emu/              wpc-emu + pinmame WASM wrapper
└── util/             logger, vectors, storage helpers
```

Build: `npm run build` generates `lib/scripting/grammar/rules.ts` from `grammar.bnf` and runs `tsup` (`.vbs`/`.bnf` handled as text).

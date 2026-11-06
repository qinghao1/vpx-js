# vpx-js

Visual Pinball for Node.js and the browser — parse `.vpx` tables, render them with three.js, and run them on the upstream VPinball engine built headless to WASM (table scripts and PinMAME included).

Fork of [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js) by [freezy](https://github.com/freezy) and contributors, kept under GPL-2.0 — please credit both the original project and this fork. See [`LICENSE`](LICENSE).

## Features

- **Parse** `.vpx` tables — OLE/BIFF, meshes, materials, textures, and scripts — with `Table.load()`.
- **Render** with three.js via `Table.generateTableNode()`.
- **Play** on the headless VPinball WASM engine (`loadHeadlessEngine`), mirrored into the three.js scene by `WasmSceneSync`.
- **Emulate** ROMs with PinMAME inside the headless vpinball WASM engine.
- **Browse** the [Virtual Pinball Spreadsheet](https://virtualpinballspreadsheet.github.io/) catalog for tables and ROMs (`lib/emu/vps-catalog.ts`).

## Requirements

- Node `>=24`
- A browser with WebGPU support for the demo
- emsdk 6.0.13 and CMake, to build the headless engine (required for play mode; see `wasm/README.md`)

## Quickstart

```bash
npm ci
npm run build:esm
cd demo-browser
npm ci
npm run dev
```

Play mode needs the engine artifact (gitignored): `git submodule update --init external/vpinball && npm run build:wasm:headless`. Without it the demo runs as a viewer only. The dev server uses a self-signed certificate.

Open the printed localhost URL and load a `.vpx` file. For the production build, inside `demo-browser`, run `npm run build` then `npm run preview`.

## Deploy

The demo is a static bundle (`cd demo-browser && npm run build` → `dist/`). The engine needs a cross-origin-isolated page.

- Self-hosting: serve `dist/` with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (`npm run preview` does).
- Static hosts that cannot set headers (GitHub Pages): build with `VITE_COI_SW=1`, which ships `coi-sw.js` to add them (one reload on first visit). `.github/workflows/pages.yml` does this on push to `master`.

## Usage

`vpx-js` is not published to npm (`private`). Build `dist-esm/` with `npm run build`, then deep-import modules from it (or import `lib/` source directly under `tsx`/vite).

### Load a table

```ts
import { BinaryReader } from './dist-esm/lib/refs.node.js'
import { Table } from './dist-esm/lib/vpt/table/table.js'

const table = await Table.load(new BinaryReader('my_table.vpx'))
console.log(Object.keys(table.items).length)
console.log(table.tableScript?.slice(0, 400))
```

In Node, `BinaryReader` reads from a file path. In the browser, import it from `refs.browser.js` and pass an `ArrayBuffer` instead:

```ts
import { BinaryReader } from './dist-esm/lib/refs.browser.js'
import { Table } from './dist-esm/lib/vpt/table/table.js'

const response = await fetch('/tables/my_table.vpx')
const table = await Table.load(new BinaryReader(await response.arrayBuffer()))
```

### Render

```ts
import { ThreeRenderApi } from './dist-esm/lib/render/threejs/three-render-api.js'

const scene = await table.generateTableNode(new ThreeRenderApi({ applyMaterials: true }))
// `scene` is a three.js Object3D ready to add to your renderer.
```

## Development

```bash
npm run build        # tsc → dist-esm/ (required before demo-browser)
npm run check        # lint + typecheck + typecheck:tests + test
npm run typecheck    # tsc --noEmit
npm run typecheck:tests  # tsc --noEmit on tests
npm run lint         # biome check + copyright headers
npm test             # vitest
npm run verify:all   # end-to-end harness (table, twd-render, cadet, pages, browser)
```

## License

GPL-2.0 — see [`LICENSE`](LICENSE).

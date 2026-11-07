# vpx-js

Play real Visual Pinball tables in your browser. No install, no build — just open the page and load a table.

> ## ▶ [Play it now](https://qinghao1.github.io/vpx-js/)
>
> Best in Chrome or Edge. The first visit reloads once while offline support installs — that's normal.

## Playing

1. Open the **[web player](https://qinghao1.github.io/vpx-js/)**.
2. Click **Open .vpx** and pick a `.vpx` table file from your computer. The table is added to the address bar, so you can bookmark or share the link.
3. Press **Play**. The in-demo help dialog lists the keyboard controls.

Real-machine tables also need their game ROM file — if one is missing, the player says so on its loading card. Tables are emulated in-browser, including PinMAME ROM emulation. On machines without WebGPU, the player points you at its WebGL fallback.

## What it is

- **Parse** `.vpx` tables — geometry, materials, textures, and scripts — with `Table.load()`.
- **Render** with three.js via `Table.generateTableNode()`.
- **Play** on the upstream VPinball engine compiled headless to WASM (table scripts and PinMAME included), mirrored into the three.js scene.
- **Browse** the [Virtual Pinball Spreadsheet](https://virtualpinballspreadsheet.github.io/) catalog for tables and ROMs (`lib/emu/vps-catalog.ts`).

Fork of [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js) by [freezy](https://github.com/freezy) and contributors, kept under GPL-2.0 — please credit both the original project and this fork. See [`LICENSE`](LICENSE).

## For developers

`vpx-js` is not published to npm (`private`). Build `dist-esm/` with `npm run build`, then deep-import modules from it (or import `lib/` source directly under `tsx`/vite).

Requirements: Node `>=24`, and emsdk 6.0.13 only to rebuild the headless engine (`npm run build:wasm:headless`, see `wasm/README.md`).

```bash
npm ci
npm run build:esm
cd demo-browser
npm ci
npm run dev
```

Open the printed localhost URL and load a `.vpx` file. For the production build, run `npm run build` then `npm run preview` inside `demo-browser`.

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

### Commands

```bash
npm run build        # tsc → dist-esm/ (required before demo-browser)
npm run typecheck    # tsc --noEmit
npm run lint         # biome check
npm test             # vitest with coverage
npm run verify:all   # end-to-end harness (table, twd-render, ab, cadet, browser)
```

## License

GPL-2.0 — see [`LICENSE`](LICENSE).

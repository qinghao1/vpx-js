# vpx-js

Play real Visual Pinball tables in your browser. No install, no build — just open the page and load a table.

> ## ▶ [Play it now](https://qinghao1.github.io/vpx-js/)
>
> Best in Chrome or Edge. The first visit may reload once while the isolation worker installs — that's normal; repeat visits load without a reload.

## Playing

1. Open the **[web player](https://qinghao1.github.io/vpx-js/)**.
2. Click **Open .vpx** and pick a `.vpx` table file from your computer, or append `?vpx=<name|path|URL>` to the address bar to load a hosted table. The table name is mirrored into `?vpx=` so a hosted table URL can be bookmarked or shared; a table picked from disk isn't uploaded, so its link only works for fetchable (hosted or `?vpx=/@fs/…`) paths — re-pick the file after reload.
3. Click the table (the ▶ Play tip follows your cursor over it) to enter play mode, or open the link with `&mode=play`. The in-demo help dialog lists the keyboard controls.

URL knobs: `?vpx=<name|path|URL>` (`table=` alias), `?rom=<path|URL>`, `?mode=play|viewer` (default `viewer`), `?noaa` (no antialiasing), `?nobatched`, `?webgl` (force WebGL2) — see `demo-browser/AGENTS.md`. Try `?vpx=test/fixtures/table-empty.vpx` on the dev server.

Real-machine tables also need their game ROM file (`Open .zip ROM`, drag & drop, or `?rom=`); without the right ROM the table still renders but the game logic cannot boot — check the log for engine/script errors. Tables are emulated in-browser, including PinMAME ROM emulation. The viewer defaults to WebGPU; if the GPU cannot start, the log suggests retrying with `?webgl` (or `?noaa`), which forces the three.js WebGL2 backend.

## What it is

- **Parse** `.vpx` tables — geometry, materials, textures, and scripts — with `Table.load()`.
- **Render** with three.js via `Table.generateTableNode()`.
- **Play** on the upstream VPinball engine compiled headless to WASM (table scripts and PinMAME included), mirrored into the three.js scene.
- **Browse** the [Virtual Pinball Spreadsheet](https://virtualpinballspreadsheet.github.io/) catalog for tables and ROMs (`lib/emu/vps-catalog.ts`).

Fork of [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js) by [freezy](https://github.com/freezy) and contributors, kept under GPL-2.0 — please credit both the original project and this fork. See [`LICENSE`](LICENSE).

## For developers

`vpx-js` is not published to npm (`private`). Build `dist-esm/` with `npm run build`, then deep-import modules from it (or import `lib/` source directly under `tsx`/vite).

Requirements: Node `>=24` (`bash` ≥ 4 for the WASM rebuild), and emsdk 6.0.13 only to rebuild the headless engine (`npm run build:wasm:headless`, see `wasm/README.md`). Play needs a JSPI browser: Chrome/Edge 137+, Firefox 153+, or Safari 27+.

```bash
npm ci
npm run build:esm
cd demo-browser
npm ci
npm run dev
```

Open the printed localhost URL (accept the self-signed certificate warning — local dev only) and load a `.vpx` file. Rebuild `dist-esm/` from the repo root first (`npm run build:esm`) — the demo imports from `../dist-esm/lib/…` and fails to resolve without it. For the production build, run `npm run build` then `npm run preview` inside `demo-browser`.

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
npm test             # vitest (no coverage; npm run test:coverage for coverage)
npm run verify:all   # E2E TAP 1..8: table → play-room → headless → twd-render → ab → cadet → pages → browser
```

## License

GPL-2.0 — see [`LICENSE`](LICENSE).

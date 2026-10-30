# vpx-js

Visual Pinball for Node.js and the browser — parse `.vpx` tables, render them with three.js, simulate physics, transpile VBScript, and emulate PinMAME ROMs.

Fork of [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js) by [freezy](https://github.com/freezy) and contributors, kept under GPL-2.0 — please credit both the original project and this fork. See [`LICENSE`](LICENSE).

## Features

- **Parse** `.vpx` tables — OLE/BIFF, meshes, materials, textures, and scripts — with `Table.load()`.
- **Render** with three.js via `Table.generateTableNode()`.
- **Simulate** headless with `Player`: 60 Hz physics/animation stepping plus table-script execution.
- **Transpile** VBScript table scripts to JavaScript with `Transpiler`.
- **Emulate** WPC ROMs with `wpc-emu` and other hardware via the PinMAME WASM build.

## Requirements

- Node `>=24`
- A browser with WebGPU support for the demo
- Emscripten, CMake, and Ninja only to rebuild the PinMAME WASM module (`npm run build:wasm:mock` covers the rest)

## Quickstart

```bash
npm ci
npm run build:esm
cd demo-browser
npm ci
npm run dev
```

Open the printed localhost URL and load a `.vpx` file. For the production build, run `npm run build` then `npm run preview` inside `demo-browser`.

## Usage

### Load a table

```ts
import { BinaryReader, Table } from 'vpx-js'

const table = await Table.load(new BinaryReader('my_table.vpx'))
console.log(Object.keys(table.items).length)
console.log(table.getTableScript().slice(0, 400))
```

In Node, `BinaryReader` reads from a file path. In the browser, pass an `ArrayBuffer` instead:

```ts
import { BrowserBinaryReader, Table } from 'vpx-js'

const response = await fetch('/tables/my_table.vpx')
const table = await Table.load(new BrowserBinaryReader(await response.arrayBuffer()))
```

### Render

```ts
import { ThreeRenderApi } from 'vpx-js'

const scene = await table.generateTableNode(new ThreeRenderApi(), {
	applyMaterials: true,
})
// `scene` is a three.js Object3D ready to add to your renderer.
```

### Simulate

```ts
import { Player } from 'vpx-js'

const player = new Player(table).init()
player.simulateTime(1000)
const changed = player.onFrame()
```

`simulateTime` steps physics and animations at 60 Hz up to an absolute millisecond timestamp; `onFrame` returns the changed item states for the renderer. For example, on a table with a `BallRelease` kicker:

```ts
const kicker = table.kickers.BallRelease.getApi()
const ball = kicker.CreateBall()
kicker.Kick(0, 10)
```

### Transpile a script

```ts
import { Transpiler } from './lib/scripting/transpiler.js'

const player = new Player(table)
const js = new Transpiler(table, player).transpile(table.getTableScript())
```

`Transpiler` is imported from source, so run repo-relative scripts with `npx tsx`.

## Development

```bash
npm run build        # tsup + tsc → dist/ + dist-esm/
npm run build:esm    # dist-esm/ only (required before demo-browser)
npm run typecheck    # tsc --noEmit
npm run lint         # biome check
npm test             # vitest with coverage
npm run verify:all   # end-to-end harness (wasm, table, pinmame, player, browser)
```

## License

GPL-2.0 — see [`LICENSE`](LICENSE).

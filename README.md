# Visual Pinball X in JavaScript

*A port of [Visual Pinball](https://github.com/vpinball/vpinball) for Node.js and the browser — parse `.vpx`, render with three.js, simulate physics, transpile VBScript, and emulate PinMAME.*

![table](https://user-images.githubusercontent.com/70426/56841267-0419fc00-688d-11e9-9996-6d84070da392.png)

> **v2.0.0** · ESM-only · Node `>=24` · TypeScript `^6` · three `^0.185` · GPL-2.0

## Origin and License

This is a maintained **fork of [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js)** by [freezy](https://github.com/freezy) and contributors.

- **Original:** [`vpdb/vpx-js@v1.3.4`](https://github.com/vpdb/vpx-js/releases/tag/v1.3.4) (`e8a6d6fa522`), GPL-2.0.
- **License stays GPL-2.0.** See [`LICENSE`](LICENSE). All original `Copyright (C) 2019 freezy` headers are retained; modified files add `Copyright (C) 2026 Chu Qinghao`. No relicensing.
- **Please credit both** the original project and this fork, and distribute source with any binary per GPL-2.0.

## Features

- **VPX parsing** — OLE/BIFF, meshes, materials, textures, and table scripts via `Table.load()` (VPX 10.8.1).
- **Rendering** — `ThreeRenderApi` → three.js scenes; `TableExporter` → binary GLB with materials/textures/lights.
- **Physics** — vpinball collision/rigid-body code ported 1:1; `Player` drives a 1 kHz physics + 60 Hz animation loop (including nudge).
- **Scripting** — VBScript transpiled to JS (EBNF grammar + transformers) and run against per-item APIs.
- **Emulation** — `wpc-emu` for WPC plus **PinMAME WASM** (libPinMAME 3.7) for SAM/Whitestar/S11/Data East and others via `VpmController`.
- **Portable** — `Uint8Array`/`DataView` I/O, no Node shims; explicit `lib/refs.node.js` vs `lib/refs.browser.js` split.

## Requirements

- Node `>=24` (ES2024, `"type": "module"`)
- Browser with ESM + WebGL2
- Rebuilding WASM needs Emscripten `>=4.0`, CMake `>=3.28`, Ninja `>=1.11` (otherwise a mock fallback is used)

## Installation

```bash
npm install vpx-js
```

From source:

```bash
git clone <this-fork-url> && cd vpx-js
npm ci
npm run build
```

## Usage

### Load a table

```ts
import { NodeBinaryReader } from 'vpx-js/lib/refs.node.js'
import { Table } from 'vpx-js'

const table = await Table.load(new NodeBinaryReader('my_table.vpx'))
console.log(table.info?.TableName, Object.keys(table.items).length)
console.log(table.getTableScript().slice(0, 400))
```

In the browser use `BrowserBinaryReader` with an `ArrayBuffer`:

```ts
import { BrowserBinaryReader } from 'vpx-js/lib/refs.browser.js'
const buf = await fetch('/tables/my_table.vpx').then(r => r.arrayBuffer())
const table = await Table.load(new BrowserBinaryReader(buf))
```

### Export to GLB

```ts
import { writeFileSync } from 'node:fs'
import { TableExporter } from 'vpx-js'

const glb = await new TableExporter(table).exportGlb({
  applyMaterials: true,
})
writeFileSync('my_table.glb', glb)
```

Open the result in [Babylon Sandbox](https://sandbox.babylonjs.com) or [gltf-viewer](https://gltf-viewer.donmccurdy.com).

### Simulate

```ts
import { Player } from 'vpx-js'

const player = new Player(table).init() // or initAsync()
player.simulateTime(1000)
const changed = player.onFrame() // diffed states for the renderer

// example: kick a ball
table.kickers.BallRelease.getApi().CreateBall()
table.kickers.BallRelease.getApi().Kick(0, 5)
```

### CLI

Build first (`npm run build`), then:

```bash
vbs2js <script.vbs> [--format-only]          # transpile VBScript → JS
vpt2glb <table.vpx> [out.glb] [flags]         # convert to GLB
vptscript <table.vpx|folder> [--save]        # extract table script
```

`vpt2glb` flags are all opt-out: `--no-textures`, `--no-materials`, `--no-lights`, `--no-primitives`, `--no-flippers`, etc. (Draco/`--compress-vertices` is removed).

## What Changed Since Upstream v1.3.4

In short:

- **Modern toolchain** — ESM-only, Node 24, `tsup` + `Biome` + `Vitest` replacing Rollup/TSLint/Mocha/NYC.
- **Current dependencies** — three `^0.185` + `three-mesh-bvh` + `wpc-emu` + `pako`.
- **Portable I/O** — `Uint8Array`/`DataView` throughout; `refs.node`/`refs.browser` replaces the old `pkg.browser` shim.
- **Rendering rework** — custom glTF/Draco code removed; GLB export now uses `three/addons/exporters/GLTFExporter`.
- **Physics fixes** — VPX 10.8.1 defaults, timer/nudge/collision parity with desktop VPX.
- **Scripting hardened** — broader VBScript coverage and a proper `with`-proxy sandbox.
- **New: PinMAME WASM** — `external/pinmame` + `wasm/` build (WASM + mock fallback) for any PinMAME hardware; upstream only mentioned `wpc-emu`.
- **Leaner repo** — `demo-static` removed.


## Development

```bash
npm run build        # compile grammar + tsup + copy res/
npm run dev          # watch mode
npm run typecheck
npm run lint         # biome check
npm test             # vitest + v8 coverage
npm run verify:all   # wasm + table + pinmame + player harness
```

Optional WASM rebuild:

```bash
npm run build:wasm        # release (needs emcc)
npm run build:wasm:mock   # mock only
```


## License

GPL-2.0 — see [`LICENSE`](LICENSE). Same as [`vpdb/vpx-js`](https://github.com/vpdb/vpx-js).

## Credits

Original project by [freezy](https://github.com/freezy) — especially [@jsm174](https://github.com/jsm174) (grammar) and [@neophob](https://github.com/neophob) (wpc-emu). Fork maintenance by Chu Qinghao. Thanks to JetBrains for IDE support of the original project.

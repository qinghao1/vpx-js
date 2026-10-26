# Command Line Tools

Run from source with `npx tsx bin/<tool>.ts`, or build first (`npm run build`)
and use the compiled output in `dist/bin/` (`vbs2js`, `vpt2glb`, `vptscript` are
also linked as package binaries). Exit code is 0 on success, 1 on error
(`vptscript` keeps going after a per-file error and still exits 1).

## vptscript — extract table script

```bash
npx tsx bin/vptscript.ts <source.vpx | folder> [--save]
```

Prints the table script to stdout, or with `--save` writes a sibling `.vbs` per
table (folder mode processes every `.vpx`/`.vpt` in the directory).

API equivalent:

```js
import { Table } from 'vpx-js';
import { BinaryReader } from 'vpx-js/lib/refs.node.js';

const vpt = await Table.load(new BinaryReader('my-table.vpx'), {
	loadTableScript: true,
	tableDataOnly: true,
});
console.log(vpt.getTableScript());
```

## vpt2glb — convert table to GLB

```bash
npx tsx bin/vpt2glb.ts <source.vpx> [<dest.glb>] [--no-textures] [--no-materials] [--no-lights] [--no-<item>...]
```

Item flags (all default on): `--no-primitives`, `--no-triggers`, `--no-kickers`,
`--no-gates`, `--no-targets`, `--no-flippers`, `--no-bumpers`, `--no-ramps`,
`--no-surfaces`, `--no-rubbers`, `--no-bulbs`, `--no-surface-lights`,
`--no-playfield`, `--no-plungers`, `--no-spinners`.
(`--compress-vertices` / `--skip-optimize` are accepted but deprecated no-ops.)
Headless-safe: uses classic `MeshStandardMaterial` export, no GPU needed.

API equivalent:

```js
import { writeFileSync } from 'node:fs';
import { Table, TableExporter } from 'vpx-js';
import { BinaryReader } from 'vpx-js/lib/refs.node.js';

const table = await Table.load(new BinaryReader('my-table.vpx'));
const glb = await new TableExporter(table).exportGlb({
	applyTextures: new ThreeTextureLoaderNode(), // or undefined with --no-textures (see bin/vpt2glb.ts)
	applyMaterials: true,
	exportLightBulbLights: true,
	gltfOptions: { binary: true },
});

// write to disk
writeFileSync('my-table.glb', glb);
```

Check the result in any GLTF viewer
([babylon.js](https://sandbox.babylonjs.com/),
[three.js](https://threejs.org/editor/),
[donmccurdy](https://gltf-viewer.donmccurdy.com/)).

## vbs2js — transpile VBScript

```bash
npx tsx bin/vbs2js.ts [--format-only] <script.vbs>
```

Prints the transpiled JS to stdout; `--format-only` (any position) prints the
formatted VBS instead.

## vbs-benchmark — time a transpile

```bash
npx tsx bin/vbs-benchmark.ts <script.vbs>
```

Prints the transpiled JS to stdout and `transpiled <in> chars -> <out> chars in
<ms>ms` to stderr (transpile-only; no execution timing).

## vpinball-runner — native VPinballX driver (tsx-only, not in `dist/`)

```bash
npx tsx bin/vpinball-runner.ts --vpx=table-flipper                 # play natively
npx tsx bin/vpinball-runner.ts --vpx=/path/to/table.vpx --extractvbs
npx tsx bin/vpinball-runner.ts --doctor                            # pre-flight diagnostics only
npm run vpinball:setup   # provision native binary first (or set VPINBALL_BIN)
```

Flags: `--vpx=<path|fixture|url>`, `--rom=<path>`, `--url=<url>`,
`--extractvbs` (headless `-ExtractVBS`, writes sibling `.vbs`), `--audit`,
`--pov`, `--doctor` (ldd/otool, shaders, `PinMAMEPath` checks via
`bin/vpinball-doctor.ts`), `--headless` (xvfb wrapper when `DISPLAY` is unset),
`--ini <path>` (reuse an INI instead of a generated session one), `--help`.

## License

GPLv2, see [LICENSE](../LICENSE).

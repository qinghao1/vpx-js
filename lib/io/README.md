# VPX File Format (`lib/io`)

A `.vpx` file is a Microsoft OLE compound document ("structured storage"):
a tiny filesystem-in-a-file with named streams. vpx-js only reads two
storages: `GameStg` (`GameData`, `GameItem{i}`, `Image{i}`, `Collection{i}`)
and `TableInfo` (UTF-16LE metadata strings). See
[`TableLoader`](../vpt/table/table-loader.ts) for the consumer.

Upstream format reference: [vpinball on GitHub](https://github.com/vpinball/vpinball).
[oletools](https://www.decalage.info/python/oletools) can extract/repack
these files for inspection.

## OLE layer

- `ole-header.ts` — validates the 512-byte header (magic + sector shifts).
- `ole-allocation-table.ts` — generic SAT/SSAT chain walker.
- `ole-doc.ts` — `OleCompoundDoc`: opens a reader, exposes `storage(name)`.
- `ole-storage.ts` — `Storage`: `read`/`streamFiltered` over one storage.
- `ole-directory-tree.ts` — directory entries (stream names, sizes, locations).

Sectors are 512 or 4096 bytes. Streams below the header's short-stream
threshold live in 64-byte mini-sectors inside the shared short stream;
larger streams use full sectors chained via the SAT (allocation table).

## BIFF records

Every `GameData`/`GameItem{i}` stream is a run of BIFF records framed as
`int32 size + 4-char tag + payload`. `BiffParser.stream()` in
`biff-parser.ts` walks them and dispatches per tag. `ENDB` ends a stream.

`FONT` (font descriptors) is framed differently — its size field covers only
4 bytes while an uncounted `11 + nameLen` blob follows — so the parser skips
it with dedicated length math and continues to `ENDB`.

## CODE and BITS quirks

- `CODE` (table script) is a *streamed tag*: `fromTag` records only
  `scriptPos`/`scriptLen` (`../vpt/table/table-data.ts:386-389`); the loader
  reads exactly `scriptLen` bytes and UTF-8-decodes the script separately
  (framing is exact, no trim). See also `SECB` (~408) and `MATR`/`RPRB`
  (~425-426).
- `BITS` (texture pixels) is LZW-compressed data read out-of-band: the
  handler seeks to the tag offset, decompresses, and returns how far to skip
  (`../vpt/texture.ts:134-144`).

## Unsupported / ignored data

- `MATR`/`RPRB` (10.8+ materials/render probes) and `SECB` (protection data)
  are parsed and discarded; legacy `MATE`/`PHMA` cover materials
  (`../vpt/table/table-data.ts:383-388`).
- `LINK` (texture) is logged and ignored (`../vpt/texture.ts:146-153`).
- Sounds and fonts are never loaded: counts are parsed (`SSND`), but no
  sound/font streams are read. `TableInfo/Screenshot` is skipped (binary).

## `TableLoadOptions` (`../vpt/table/table.ts:411-424`)

- `tableDataOnly` — parse `GameData` only; skips items, textures,
  collections, and `TableInfo`.
- `tableInfoOnly` — skip `GameStg` entirely; read `TableInfo` only. Authoritative:
  `Table.load` suppresses the `loadTableScript` default when it is set, so pass
  `loadTableScript: true` explicitly to decode the script alongside the info.
- `loadTableScript` (default true) — decode the `CODE` script; forced off by
  `tableInfoOnly` unless explicitly set.
- `skipTextures` — leave `textures` empty (play without images).
- `skipMeshes` — skip embedded primitive mesh data.
- `loadInvisibleItems` (default true) — also parse invisible items (timers).

## Node vs browser readers

`BinaryReader` has two implementations behind one interface (`IBinaryReader`):
`binary-reader.node.ts` (`NodeBinaryReader`, reads from the filesystem) and
`binary-reader.ts` (`BrowserBinaryReader`, reads in-memory bytes). They are
re-exported as `BinaryReader` from `lib/refs.node.ts` / `lib/refs.browser.ts`
so the same loader code runs on both platforms — Node-only imports
(`node:fs`, `sharp`) must never leak into the browser bundle.

## Opening a document

```ts
import { OleCompoundDoc } from './ole-doc.js'
import { BinaryReader } from '../refs.browser.js' // or ../refs.node.js on Node

const reader = new BinaryReader(bytes) // Blob | Uint8Array | ArrayBuffer | DataView (on Node: a file path)
const doc = await OleCompoundDoc.load(reader) // opens the reader, reads header, SAT, SSAT and directory tree
const table = doc.storage('GameStg') // named storage off the root
const names = table.getStreams() // stream names inside it
const data = await table.read(names[0]) // full stream bytes
await doc.close()
```

## Sector sizes and the short-stream cutoff

The 512-byte header stores sector sizes as power-of-two shifts
(`Header.load` in `ole-header.ts`):

- `secSize = 1 << u16@30`, i.e. `1 << 9 = 512` or — as in current VPX files — `1 << 12 = 4096`
- `shortSecSize = 1 << u16@32`, typically `1 << 6 = 64`

Whether a stream lives in regular sectors or in the short-stream container
depends on `shortStreamMax` (`i32@56`, typically `4096`): streams smaller
than the cutoff are packed into `shortSecSize` chunks addressed through the
SSAT, everything else uses full `secSize` sectors through the SAT
(`Storage.sectorInfo` in `ole-storage.ts`). These are the same conventions
as pole, the OLE library VPinball uses (`threshold(4096)`, sector shift `9`
for 512-byte sectors).

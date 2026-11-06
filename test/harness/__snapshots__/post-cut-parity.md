// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

# Post-Cut Parity (§5.2 executed)

A/B of the WASM-only tree vs `test/harness/__snapshots__/phase3-baseline/GOLDEN.md`
(Phase-3, pre-removal). The TS baseline can no longer run (engine deleted);
comparison is golden-file based. Deltas are regressions unless justified here.

## Browser e2e (`integration.mjs`, SwiftShader)

table-empty, post-cut (PASS on retry; camera flakes identically to golden):

```json
{"pageerrors":true,"diagnostics":true,"playfield":"skip","playfieldLamp":"skip","transpile":"skip","ball":"skip","plunger":"skip","physics":"skip","nudge":"skip","dmd":"skip","backbox":"skip","dmdVisible":"skip","camera":true,"sound":"skip","wasmEngine":true,"runErrors":true}
```

vs golden WASM vector (`&engine=wasm`):

```json
{"pageerrors":true,"diagnostics":true,"playfield":"skip","playfieldLamp":"skip","transpile":"skip","ball":"skip","plunger":"skip","physics":"skip","nudge":"skip","dmd":"skip","backbox":"skip","dmdVisible":"skip","camera":false,"sound":true,"wasmEngine":true,"runErrors":true}
```

Deltas, all justified:

- `sound: true → skip` — the TS `WebSoundEngine` is deleted by design; audio
  belongs to the WASM module (Stage 2). The leg skips honestly by its own
  `no sound engine` path. Not a regression.
- `camera: false → true` — the golden `false` is the documented
  start-latency stall (environmental, also reproduces without the cut). Current
  run passes; a retry of the same vector also passed pre-fix. Flake, not signal.
- `pageerrors: true` both — plus the pre-existing `kernels.js` 404s are GONE
  (nothing fetches the deleted `physics/wasm` module anymore). Improvement.
- `wasmEngine: true` both; table-empty reports
  `{ready:true, catalogSize:3, scriptErrors:0, tickOk:true, inputOk:true}`.
- `?engine=` is now inert (single engine); old `&engine=wasm` URLs behave
  identically.

## TWD playable vector (Stage-2 gap, honest fail)

- Pre-fix: 1007+ run-phase `TypeError: Cannot read properties of undefined
  (reading 'children')` per run — a real crash in the WASM sync fan-out.
- Root cause (pre-existing since Phase 3, never exercised there — Phase 3 ran
  only scriptless table-empty under `?engine=wasm`): the viewer's
  `lookupPart` returned `{node, …}` while `PartSlot` requires `{obj, …}`, so
  every mover/light/prim/flasher row crashed. One-word fix in
  `demo-browser/src/viewer.ts`.
- Post-fix probe (play mode, ROM mounted, 30s): `{ready:true, catalog:1119,
  scriptErrors:23, balls:0}`, **0 run-phase pageerrors**.
- `scriptErrors: 23` keeps the `wasmEngine` leg red on scripted tables — the
  documented Stage-2 gap (script execution / PinMAME.Controller in WASM).
  Must not be edited into a pass.

## Suites

- `vitest`: 134 files / 966 tests pass, 0 fail (was 2777/8 pre-existing).
- `tsc --noEmit`: clean. `typecheck:tests`: clean (was 19 pre-existing).
- `npm run build` (+`build:esm`): green, `dist-esm` carries no
  `audio`/`game`/`physics` dirs.
- `biome check`: 0 errors (860 warnings + 55 infos are pre-existing style noise).
- `verify-all.ts`: 3/3 PASS (table, twd-render 9/9, browser).
- `verify-headless.mjs`: 15/15 PASS.
- `verify-play-room.ts`: 29/29 PASS.

## Submodules

- `external/vpinball @64a480a96`: pristine (`git status` clean); all five
  `wasm/modules/headless/patches/000*` pass `git apply --check` forward and
  `--reverse` (dirt was exactly the patch set — reverted, never hand-edited).
- `external/pinmame @8950184`: restored (the §5.2 deletion staged its removal;
  per the submodule-build constraint the gitlink + checkout are back, clean).

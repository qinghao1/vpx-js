# Phase-3 Golden Baselines (pre-§5.2 removal)

Recorded before TS-engine removal. Post-removal gates must reproduce the
WASM-side profile below; deltas vs these numbers are regressions unless the
change is an explicitly re-scoped gate (documented in the parity report).

Source logs: `test/harness/__snapshots__/phase3-baseline/ab-run*.log`.

## Browser e2e (`integration.mjs`, `table-empty.vpx`, SwiftShader)

TS baseline (`?vpx=...&mode=viewer`, run4):

```json
{"pageerrors":false,"diagnostics":true,"playfield":"skip","playfieldLamp":"skip","transpile":true,"ball":"skip","plunger":"skip","physics":true,"nudge":true,"dmd":"skip","backbox":"skip","dmdVisible":"skip","camera":true,"sound":true,"wasmEngine":"skip","runErrors":true}
```

WASM (`&engine=wasm`, run4):

```json
{"pageerrors":true,"diagnostics":true,"playfield":"skip","playfieldLamp":"skip","transpile":"skip","ball":"skip","plunger":"skip","physics":"skip","nudge":"skip","dmd":"skip","backbox":"skip","dmdVisible":"skip","camera":false,"sound":true,"wasmEngine":true,"runErrors":true}
```

`pageerrors:false` = FAIL (missing `wasm/dist/kernels.js`, pre-existing).
`diagnostics:true` = FAIL (pre-existing WARN, identical at HEAD).
`camera:false` on WASM = start-latency stall in shared transition code under
SwiftShader (proven present on both paths via kinematics; table-empty orbit is
manifest-unstable there). `wasmEngine:true` =
`{ready:true, catalogSize:3, scriptErrors:0, tickOk:true, inputOk:true}`.

## Suites

- vitest: 2777 passed / 8 failed (pre-existing: 4 wasm-build artifacts,
  2 vpinball-compat incl. 1 network-ROM, 1 light-animation, 1 load flake).
- `typecheck:tests`: 19 errors, all pre-existing (9 kernels, 4 backglass-node,
  3 reference-transformer, 2 sound, 1 pinmame-emu).
- `tsc --noEmit`: clean. `npm run build`: green. Biome: 0 errors.
- `verify-table.ts`: PASS. `verify-twd-render.ts`: 9/9 PASS.
- `verify-headless.mjs`: 15/15 PASS.

## Stage-2 gaps (unchanged by §5.2)

Scripted TWD gameplay (coin→start→ball, DMD frames, plunger launch, flipper
mesh drive, PinMAME Controller) needs scripting/PinMAME in the WASM build.
Post-removal these legs stay honest skips/fails with Stage-2 reasons; they
must NOT be edited into passes.

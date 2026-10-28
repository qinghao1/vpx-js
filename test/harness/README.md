# test/harness

E2E harnesses, benches, and repros. Single entry point:

```bash
npx tsx test/harness/verify-all.ts   # TAP 1..10: wasm → table → pinmame → player → gameplay → play-room → browser → vpinball-compat → discrepancies → twd-render
```

## Runner rule (.ts vs .mjs)

- `.ts` files: always `npx tsx <file>`.
- `.mjs` files: `node <file>` ONLY if they import no `lib/**` code
  (`bench.mjs`, `harness-dmd.mjs`, `harness-pinmame.mjs` import just
  `bench-shared.ts` / `vpinball-resolver.ts` / `utils.mjs`, which are plain-Node
  safe). `repro-*.mjs` import `lib/**` — run those with `npx tsx`, plain `node`
  crashes on TS-only syntax.

## Inventory

`verify-*` gate; `bench-*` measure (no pass/fail); `repro-*`/`harness-*` debug.

| File | What | Needs |
|------|------|-------|
| `verify-all.ts` | Aggregator, TAP 1..10, exit 0/1 | varies per step |
| `verify-wasm.ts` | Wasm build checks: file-existence + `dist/kernels.js` behavioral + mock/real loader consistency | — |
| `verify-table.ts` | VPX parse + script extract over fixtures + `example-table.vpx` | — |
| `verify-pinmame.ts` | PinMAME emu boot + DMD frames; mock when no ROM | ROM or mock |
| `verify-player.ts` | Player init, PinInput, physics loop | — |
| `harness-gameplay.ts` | 4 gameplay scenarios, ball-survival asserts | VPX (TWD or `table-flipper.vpx` fallback) |
| `verify-browser.ts` | Thin wrapper → `verify-all.verifyBrowser` → `demo-browser/e2e/integration.mjs` | Chrome + vite + `dist-esm` |
| `verify-play-room.ts` | Play-room scene checks (TAP `Tap` class) | — |
| `verify-twd-render.ts` | Walking-dead render-pipeline checks | `walking_dead.vpx` |
| `verify-vpinball-compat.ts` | Script/table/AST parity vs native (`parity-script.ts` + `audit-table.ts`) | native `VPinballX` or SKIP |
| `capture-discrepancies.ts` | 20-check web-vs-native gap report → `~/docs/vpx-js-web-vs-native-discrepancies.md` | native for full report |
| `compare-side-by-side.ts` | MANUAL dual-window launcher (browser left, native right) — eyeball only, no asserts | Chrome + vite + native |
| `bench.mjs` | Browser bench: load + FPS + profile (`--vpx/--rom/--balls/--duration/--warmup/--out/--headed/--gpu/--trace`) | Chrome + vite |
| `bench-node.ts` | Node bench: physics ticks + scene export (`--vpx/--ticks/--balls/--breakdown/--json`) | VPX file |
| `bench-physics-profile.ts` | WASM-vs-scalar hit-test profile; buckets mirror `WASM_THRESHOLD=64` | VPX file |
| `ranked-profile.ts` | Per-phase ranked timings (`--vpx`, default `~/Downloads/walking_dead.vpx`) | VPX file |
| `bench-shared.ts` | Shared bench helpers (stats, VPX candidates, tri counting) — no main | — |
| `harness-dmd.mjs` | DMD pipeline gate (injected pattern must reach canvas + meshes) + screenshots | Chrome + vite + ROM |
| `harness-pinmame.mjs` | Browser PinMAME + DMD check | Chrome + vite + ROM |
| `repro-artifact.ts` | walking_dead artifact repro, asserts + exit 1 (imports `demo-browser/`) | `walking_dead.vpx` |
| `repro-spinner-direction.mjs` | Spinner-direction TAP + exit code (run with `tsx`) | fixture VPX |
| `repro-lights.ts` | Merged dark+horde lights repro, TAP + exit code (`--case=dark\|horde\|all --vpx=...`) | VPX file |
| `tap.ts` | TAP helpers (`tapHeader/tapOk/tapNotOk/tapSkip/tapPlan`, `Tap` class) — no main | — |
| `utils.mjs` | Puppeteer/vite helpers (`launchBrowser/newPage/ensureVite/openTablePage`) — no main | — |
| `vpinball-resolver.ts` | Arg parsing + VPX/ROM/native discovery — no main | — |

## Quickstart

```bash
npx tsx test/harness/verify-all.ts            # everything (browser + native steps SKIP if unprovisioned)
npx tsx test/harness/verify-table.ts          # fast, no prerequisites
node test/harness/bench.mjs --vpx=walking_dead.vpx --profile   # browser bench
npx tsx test/harness/bench-node.ts --vpx=test/fixtures/table-flipper.vpx --ticks=300 --balls=1
npm run compare -- --vpx=table-flipper        # manual visual compare
```

## TAP + exit codes

- One dialect via `tap.ts`: `TAP version 13` header, `ok N - name` /
  `not ok N - name` / `ok N - name # SKIP reason`, plan `1..N` (may print last —
  streaming `Tap` counts as it goes, valid TAP 13).
- Convention: exit 0 = pass, non-zero = fail. `verify-all` reports optional
  steps (browser, vpinball-compat, discrepancies) as SKIP only when they
  never ran; an optional step that ran and failed is still a failure.

## Conventions

- `example-table.vpx`: repo-root symlink to any `.vpx` with a `GameName`
  (`verify-pinmame`/`verify-table` pick it up; missing → SKIP).
- ROM search order (`getRomCandidates`, first hit wins):
  `<tableDir>/pinmame/roms/<game>.zip`, `<tableDir>/<game>.zip`,
  `~/.pinmame/roms/`, `~/pinmame/roms/`, `~/Downloads/`,
  `test/fixtures/roms/` (plus lowercase retries).
- Native discovery order (`discoverVpinball`, first executable wins):
  `VPINBALL_BIN` (file or dir), `VPINBALL_DIR`, `~/projects/vpinball`
  build/bin, `external/vpinball` submodule build/bin, `~/.cache/vpinball/`,
  repo `.cache/vpinball/` (`_GL` before `_BGFX` at each stop).
- `bench.mjs` without `--vpx` falls back to `VPX_CANDIDATES`, then a
  `/test/fixtures/…` default that crashes outside repo root — always pass `--vpx`.
- Browser benches run SwiftShader (software GL) unless `--gpu*` — FPS ≠ real GPU.

## Timeouts & cleanup (`utils.mjs`, `vpinball-resolver.ts`)

- `launchBrowser`: `opts.autoKillMs` SIGKILLs chrome, default 300 s.
  `ensureVite`: spawned vite gets a 120 s auto-kill. `openTablePage`:
  `goto` 30 s. Importing `utils.mjs` registers exit/SIGINT/SIGTERM handlers
  plus host-wide stale-chrome/vite `pkill` — parallel runs on one host kill
  each other. `CHROME_PATH` overrides chrome discovery.
- `createSessionIni` makes `/tmp/vpinball-*/VPinballX.ini` via `mkdtemp` and
  never deletes it — the CALLER must `rm -rf` the dir (`vpinball-runner.ts`
  and `compare-side-by-side.ts` do; one `rm` per call, both files create one
  ini per `createSessionIni` AND one inside `resolveVpxSession`).

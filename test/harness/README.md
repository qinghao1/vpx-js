# test/harness

E2E harnesses, benches, and repros. Single entry point:

```bash
npx tsx test/harness/verify-all.ts   # TAP 1..5: table → twd-render → cadet → pages → browser
```

## Runner rule (.ts vs .mjs)

- `.ts` files: always `npx tsx <file>`.
- `.mjs` files: `node <file>` ONLY if they import no `lib/**` code
  (`bench.mjs`, `verify-*.mjs` import just `bench-shared.ts` /
  `vpinball-resolver.ts` / `utils.mjs`, which are plain-Node safe).
  `repro-artifact.ts` imports `demo-browser/` — run it with `npx tsx`.

## Inventory

`verify-*` gate; `bench-*` measure (no pass/fail); `repro-*` debug.

| File                          | What                                                                                                                                                                                           | Needs                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `verify-all.ts`               | Aggregator, TAP 1..5 (table, twd-render, cadet, pages, browser), exit 0/1                                                                                                                      | varies per step                                                  |
| `verify-table.ts`             | VPX parse over fixtures + `example-table.vpx`                                                                                                                                                  | —                                                                |
| `verify-play-room.ts`         | Play-room scene checks (TAP `Tap` class)                                                                                                                                                       | —                                                                |
| `verify-twd-render.ts`        | Walking-dead render-pipeline checks                                                                                                                                                            | `walking_dead.vpx`                                               |
| `verify-twd-e2e.ts`           | TWD end-to-end wrapper (child TAP passthrough)                                                                                                                                                 | VPX file                                                         |
| `verify-cadet.mjs`            | Space Cadet live checks: decoy stays hidden, DMD overlay hidden until first frame (FlexDMD content when bridged), lamps go live after coin+start, digit-flasher score images live (patch 0013) | `space_cadet.vpx` + Chrome + vite + rebuilt wasm, else SKIP/fail |
| `verify-headless.mjs`         | Headless engine checks on a fixed schedule (catalog, movers, lamps, nudge wiring, DMD, script errors); ROM legs skip without `--rom`                                                           | engine artifact (`public/wasm/`), else SKIP                      |
| `verify-pages.mjs`            | Static-host E2E: `VITE_COI_SW=1` bundle on a header-less server under `/vpx-js/` — service worker isolates, threaded engine boots                                                              | engine artifact (`public/wasm/`)                                 |
| `compare-side-by-side.ts`     | MANUAL dual-window launcher (browser left, native right) — eyeball only, no asserts                                                                                                            | Chrome + vite + native                                           |
| `bench.mjs`                   | Browser bench: load + FPS + profile (`--vpx/--rom/--duration/--warmup/--out/--headed/--gpu/--trace`)                                                                                           | Chrome + vite                                                    |
| `bench-fps-gpu.mjs`           | GPU FPS bench                                                                                                                                                                                  | Chrome + vite + GPU                                              |
| `bench-shared.ts`             | Shared VPX/ROM discovery (`findWalkingDead`, `VPX_CANDIDATES`) — no main                                                                                                                       | —                                                                |
| `repro-artifact.ts`           | walking_dead artifact repro, asserts + exit 1 (imports `demo-browser/`)                                                                                                                        | `walking_dead.vpx`                                               |
| `tap.ts`                      | TAP helpers (`tapHeader/tapOk/tapNotOk/tapSkip/tapPlan`, `Tap` class) — no main                                                                                                                | —                                                                |
| `utils.mjs`                   | Puppeteer/vite helpers (`launchBrowser/newPage/ensureVite`) — no main                                                                                                                          | —                                                                |
| `vpinball-resolver.ts`        | Arg parsing + VPX/ROM/native discovery — no main                                                                                                                                               | —                                                                |
| `vpinball-resolver.spec.ts`   | Arg parsing specs (vitest)                                                                                                                                                                     | —                                                                |
| `wasm-audio-controls.spec.ts` | Audio-control specs (vitest)                                                                                                                                                                   | —                                                                |
| `wasm-pacing.spec.ts`         | Pacing specs (vitest)                                                                                                                                                                          | —                                                                |

## Quickstart

```bash
npx tsx test/harness/verify-all.ts            # everything (twd-render/cadet/pages/browser SKIP if unprovisioned)
npx tsx test/harness/verify-table.ts          # fast, no prerequisites
node test/harness/bench.mjs --vpx=walking_dead.vpx --profile   # browser bench
node test/harness/verify-headless.mjs         # headless engine (SKIP without the wasm artifact)
node demo-browser/e2e/integration.mjs         # browser E2E (SKIP without artifact/Chrome)
```

## TAP + exit codes

- One dialect via `tap.ts`: `TAP version 13` header, `ok N - name` /
  `not ok N - name` / `ok N - name # SKIP reason`, plan `1..N` (may print last —
  streaming `Tap` counts as it goes, valid TAP 13).
- Convention: exit 0 = pass, non-zero = fail. `verify-all` reports optional
  steps (twd-render, cadet, pages, browser) as SKIP only when they never ran; an
  optional step that ran and failed is still a failure.

## Conventions

- `example-table.vpx`: repo-root symlink to any `.vpx` with a `GameName`
  (`verify-table` picks it up; missing → SKIP).
- ROM lookup (used by the viewer `?rom=` preload; `getRomCandidates`,
  first hit wins): `<tableDir>/pinmame/roms/<game>.zip`,
  `<tableDir>/<game>.zip`, `~/.pinmame/roms/`, `~/pinmame/roms/`,
  `~/Downloads/`, `test/fixtures/roms/` (plus lowercase retries).
- TWD lookup: everything that needs `walking_dead.vpx` calls `findWalkingDead()`
  (`bench-shared.ts`): `$WALKING_DEAD_VPX`, `./walking_dead.vpx`,
  `~/Downloads/walking_dead.vpx`, `~/Downloads/walking_dead/walking_dead.vpx`,
  `demo-browser/public/ab-tmp/twd.vpx`, the vpinball table cache; the ROM twin
  is `findWalkingDeadRom()` (`$WALKING_DEAD_ROM`, same dirs). The TWD-gated
  specs (`regression-lights`, `regression-artifact-postprocess`,
  `underfloor-occlusion`, `light-*-regression`, `test/bench/walking-dead.bench.ts`)
  skip in CI by design: CI has no VPX/ROM.
- Native discovery order (`discoverVpinball`, first executable wins):
  `VPINBALL_BIN` (file or dir), `VPINBALL_DIR`, `~/projects/vpinball`
  build/bin, `external/vpinball` submodule build/bin, `~/.cache/vpinball/`,
  repo `.cache/vpinball/` (`_GL` before `_BGFX` at each stop).
- `bench.mjs` without `--vpx` falls back to `VPX_CANDIDATES`, then the empty
  fixture.
- Browser benches run SwiftShader (software GL) unless `--gpu*` — FPS ≠ real GPU.

## Timeouts & cleanup (`utils.mjs`, `vpinball-resolver.ts`)

- `launchBrowser`: `opts.autoKillMs` closes chrome, default 1200 s.
  Importing `utils.mjs` registers exit/SIGINT/SIGTERM handlers
  that close only handles this process created (tracked browsers and
  in-process vite servers) — there is no host-wide `pkill`, so parallel runs
  and unrelated user chrome/vite processes are never touched.
  `ensureVite` serves this process's own vite in-process (one per tree root)
  on an OS-assigned port and returns the URL to navigate to; close the
  handle (or exit) when done. Chrome launches with `pipe: true`, so it exits
  with this process even on SIGKILL.
  `CHROME_PATH` overrides chrome discovery.
- `createSessionIni` makes `/tmp/vpinball-*/VPinballX.ini` via `mkdtemp` and
  never deletes it — the CALLER must `rm -rf` the dir
  (`compare-side-by-side.ts` does; one `rm` per call, it creates one
  ini per `createSessionIni` AND one inside `resolveVpxSession`).

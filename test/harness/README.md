# test/harness

E2E harnesses, benches, and repros. Single entry point:

```bash
npx tsx test/harness/verify-all.ts   # TAP 1..5: table → twd-render → ab → browser → cadet
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

| File                          | What                                                                                                                                                                                           | Needs                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `verify-all.ts`               | Aggregator, TAP 1..5 (table, twd-render, ab, browser, cadet), exit 0/1                                                                                                                         | varies per step                                                  |
| `verify-table.ts`             | VPX parse + script extract over fixtures + `example-table.vpx`                                                                                                                                 | —                                                                |
| `verify-browser.ts`           | Thin wrapper → `verify-all.verifyBrowser` → `demo-browser/e2e/integration.mjs`                                                                                                                 | Chrome + vite + `dist-esm`                                       |
| `verify-play-room.ts`         | Play-room scene checks (TAP `Tap` class)                                                                                                                                                       | —                                                                |
| `verify-twd-render.ts`        | Walking-dead render-pipeline checks                                                                                                                                                            | `walking_dead.vpx`                                               |
| `verify-twd-e2e.ts`           | TWD end-to-end wrapper (child TAP passthrough)                                                                                                                                                 | VPX file                                                         |
| `verify-ab.mjs`               | A/B parity: same table+ROM, same scripted match, NEW (WASM) vs OLD (`/tmp/vpx-js-old` at HEAD) — render, gameplay, physics, DMD, audio gates + JSON report                                     | VPX + ROM + Chrome + vite + OLD worktree, else SKIP              |
| `verify-cadet.mjs`            | Space Cadet live checks: decoy stays hidden, DMD overlay hidden until first frame (FlexDMD content when bridged), lamps go live after coin+start, digit-flasher score images live (patch 0013) | `space_cadet.vpx` + Chrome + vite + rebuilt wasm, else SKIP/fail |
| `verify-headless.mjs`         | Headless engine checks (15 gates: load, boot, DMD, coins, audio, lifecycle)                                                                                                                    | —                                                                |
| `compare-side-by-side.ts`     | MANUAL dual-window launcher (browser left, native right) — eyeball only, no asserts                                                                                                            | Chrome + vite + native                                           |
| `bench.mjs`                   | Browser bench: load + FPS + profile (`--vpx/--rom/--balls/--duration/--warmup/--out/--headed/--gpu/--trace`)                                                                                   | Chrome + vite                                                    |
| `bench-fps-gpu.mjs`           | GPU FPS bench                                                                                                                                                                                  | Chrome + vite + GPU                                              |
| `harness-dmd.mjs`             | DMD pipeline gate (injected pattern must reach canvas + meshes) + screenshots                                                                                                                  | Chrome + vite + ROM                                              |
| `harness-pinmame.mjs`         | Browser PinMAME + DMD check                                                                                                                                                                    | Chrome + vite + ROM                                              |
| `repro-artifact.ts`           | walking_dead artifact repro, asserts + exit 1 (imports `demo-browser/`)                                                                                                                        | `walking_dead.vpx`                                               |
| `repro-spinner-direction.mjs` | Spinner-direction TAP + exit code (run with `tsx`)                                                                                                                                             | fixture VPX                                                      |
| `tap.ts`                      | TAP helpers (`tapHeader/tapOk/tapNotOk/tapSkip/tapPlan`, `Tap` class) — no main                                                                                                                | —                                                                |
| `utils.mjs`                   | Puppeteer/vite helpers (`launchBrowser/newPage/ensureVite/openTablePage`) — no main                                                                                                            | —                                                                |
| `vpinball-resolver.ts`        | Arg parsing + VPX/ROM/native discovery — no main                                                                                                                                               | —                                                                |
| `vpinball-resolver.spec.ts`   | Arg parsing specs (vitest)                                                                                                                                                                     | —                                                                |
| `wasm-pacing.spec.ts`         | Pacing specs (vitest)                                                                                                                                                                          | —                                                                |

## Quickstart

```bash
npx tsx test/harness/verify-all.ts            # everything (twd-render/ab/browser SKIP if unprovisioned)
npx tsx test/harness/verify-table.ts          # fast, no prerequisites
node test/harness/bench.mjs --vpx=walking_dead.vpx --profile   # browser bench
node test/harness/verify-ab.mjs --vpx=<table>.vpx --rom=<game>.zip   # A/B vs /tmp/vpx-js-old
```

## TAP + exit codes

- One dialect via `tap.ts`: `TAP version 13` header, `ok N - name` /
  `not ok N - name` / `ok N - name # SKIP reason`, plan `1..N` (may print last —
  streaming `Tap` counts as it goes, valid TAP 13).
- Convention: exit 0 = pass, non-zero = fail. `verify-all` reports optional
  steps (twd-render, ab, browser) as SKIP only when they never ran; an
  optional step that ran and failed is still a failure.

## Conventions

- `example-table.vpx`: repo-root symlink to any `.vpx` with a `GameName`
  (`verify-table` picks it up; missing → SKIP).
- ROM lookup (used by `verify-ab.mjs` and the viewer `?rom=` preload;
  `getRomCandidates`, first hit wins):
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
  never deletes it — the CALLER must `rm -rf` the dir
  (`compare-side-by-side.ts` does; one `rm` per call, it creates one
  ini per `createSessionIni` AND one inside `resolveVpxSession`).

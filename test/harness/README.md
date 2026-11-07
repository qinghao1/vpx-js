# test/harness

E2E harnesses and benches. Single entry point:

```bash
npx tsx test/harness/verify-all.ts   # TAP 1..8: table → play-room → headless → twd-render → ab → cadet → pages → browser
```

## Runner rule (.ts vs .mjs)

- `.ts` files: always `npx tsx <file>`.
- `.mjs` files: `node <file>` ONLY if they import no `lib/**` code
  (`bench.mjs`, `verify-ab.mjs` import just
  `bench-shared.ts` / `vpinball-resolver.ts` / `utils.mjs`, which are plain-Node
  safe).
- Manual repros live in `test/manual/` — run those with `npx tsx`; plain
  `node` crashes on TS-only syntax.

## Inventory

`verify-*` gate; `bench-*` measure (no pass/fail); `compare-*` and
`test/manual/*` are manual-only (no asserts in CI).

| File                        | What                                                                                                                                                                                  | Needs                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `verify-all.ts`             | Aggregator, TAP 1..8 (table, play-room, headless, twd-render, ab, cadet, pages, browser), exit 0/1                                                                                    | varies per step                                                      |
| `verify-table.ts`           | VPX parse + script extract over fixtures + `example-table.vpx`                                                                                                                        | —                                                                    |
| `verify-play-room.ts`       | Play-room scene checks (TAP `Tap` class)                                                                                                                                              | —                                                                    |
| `verify-headless.mjs`       | Headless engine checks (15 gates: load, boot, DMD, coins, audio, lifecycle)                                                                                                           | engine artifact + Chrome, else SKIP                                  |
| `verify-twd-render.ts`      | Walking-dead render-pipeline checks; non-TWD table exits 77                                                                                                                           | `walking_dead.vpx`                                                   |
| `verify-ab.mjs`             | A/B parity: same table+ROM, same scripted match, NEW vs OLD baseline (`/tmp/vpx-js-old` provisioned from `--old-ref`; leg C fails unless OLD differs from HEAD). TWD-like tables only | VPX + ROM + Chrome + vite + OLD worktree, else SKIP                  |
| `verify-cadet.mjs`          | Space Cadet live checks                                                                                                                                                               | `space_cadet.vpx` + Chrome + vite + committed engine, else SKIP/fail |
| `verify-pages.mjs`          | Static-host E2E: `VITE_COI_SW=1` bundle on a header-less server — service worker isolates, threaded engine boots (WebGL fallback)                                                     | engine artifact (`public/wasm/`)                                     |
| `compare-side-by-side.ts`   | MANUAL dual-window launcher (browser left, native right) — eyeball only, no asserts                                                                                                   | Chrome + vite + native                                               |
| `bench.mjs`                 | Browser bench: load + FPS + profile (`--vpx/--rom/--duration/--warmup/--out/--headed/--gpu/--trace`)                                                                                  | Chrome + vite                                                        |
| `bench-fps-gpu.mjs`         | GPU FPS bench                                                                                                                                                                         | Chrome + vite + GPU                                                  |
| `tap.ts`                    | TAP helpers (`tapHeader/tapOk/tapNotOk/tapSkip/tapPlan`, `Tap` class) — no main                                                                                                       | —                                                                    |
| `utils.mjs`                 | Puppeteer/vite helpers (`launchBrowser/newPage/ensureVite`, signal trap reaps browsers/servers) — no main                                                                             | —                                                                    |
| `vpinball-resolver.ts`      | Arg parsing + VPX/ROM/native discovery — no main                                                                                                                                      | —                                                                    |
| `vpinball-resolver.spec.ts` | Arg parsing specs (vitest)                                                                                                                                                            | —                                                                    |
| `wasm-pacing.spec.ts`       | Pacing specs (vitest)                                                                                                                                                                 | —                                                                    |

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
- `verify-all` itself prints only strict TAP (header, plan, one line per leg,
  `# --- leg ---` / `Result:` comments). Legs run as child processes with
  inherited stdio, so their raw log lines interleave — only the child exit
  code gates: 0 pass, 77 skip (prerequisite missing), anything else fail.
  Required legs fail on a skip; optional legs report it as SKIP.
- Convention: exit 0 = pass, non-zero = fail. An optional step that ran and
  failed is still a failure.

## Manual tools

- `npm run compare -- --vpx=<table>.vpx [--native-bin=...]` — dual-window
  eyeball launcher (browser left, native right), no asserts.
- `test/manual/repro-*.ts` — table-gated repros with PASS/FAIL + exit code,
  run with `npx tsx` (manual only: fixtures or downloads required, never in CI).

## CI matrix

- `Check` job (`nodejs.yml`): `npm ci`, `npm run build:esm`,
  `npm run verify:engine-manifest`, `npm run check` (lint + all typechecks +
  vitest with coverage), `npm run verify:table`, `npm run verify:play-room`.
  No browser, no VPX/ROM.
- `Deploy demo to GitHub Pages` (`pages.yml`): builds dist-esm, verifies the
  committed engine manifest, and builds the demo bundle with the isolation
  service worker, then runs the static-host E2E.
- Everything else (full `verify-all`, A/B, browser legs, TWD benches) runs
  locally: Chrome + engine artifact required, VPX/ROM fixtures optional with
  honest skips.

## Conventions

- `example-table.vpx`: repo-root symlink to any `.vpx` with a `GameName`
  (`verify-table` picks it up; missing → SKIP).
- ROM lookup (used by `verify-ab.mjs` and the viewer `?rom=` preload;
  `getRomCandidates`, first hit wins):
  `<tableDir>/pinmame/roms/<game>.zip`, `<tableDir>/<game>.zip`,
  `~/.pinmame/roms/`, `~/pinmame/roms/`, `~/Downloads/`,
  `test/fixtures/roms/` (plus lowercase retries).
- TWD lookup: everything that needs `walking_dead.vpx` calls `findWalkingDead()`
  (`bench-shared.ts`): `$WALKING_DEAD_VPX`, `./walking_dead.vpx`,
  `~/Downloads/walking_dead.vpx`, `~/Downloads/walking_dead/walking_dead.vpx`,
  `demo-browser/public/ab-tmp/twd.vpx`, the vpinball table cache. The TWD-gated
  specs (`regression-lights`, `regression-artifact-postprocess`,
  `underfloor-occlusion`, `light-*-regression`, `test/bench/walking-dead.bench.ts`)
  skip in CI by design: CI has no VPX/ROM.
- Native discovery order (`discoverVpinball`, first executable wins):
  `VPINBALL_BIN` (file or dir), `VPINBALL_DIR`, `~/projects/vpinball`
  build/bin, `external/vpinball` submodule build/bin, `~/.cache/vpinball/`,
  repo `.cache/vpinball/` (`_GL` before `_BGFX` at each stop).
- `bench.mjs` without `--vpx` falls back to `VPX_CANDIDATES`, then a
  `/test/fixtures/…` default that crashes outside repo root — always pass `--vpx`.
- Browser benches run SwiftShader (software GL) unless `--gpu*` — FPS ≠ real GPU.

## Timeouts & cleanup (`utils.mjs`, `vpinball-resolver.ts`)

- `launchBrowser`: `opts.autoKillMs` SIGKILLs chrome, default 300 s.
  Importing `utils.mjs` arms one SIGINT/SIGTERM/SIGHUP trap per process that
  closes only this process's browsers and vite servers (tracked in a local
  set) and re-raises the signal — there is no host-wide `pkill`, so parallel
  runs and unrelated user chrome/vite processes are never touched. Chrome
  itself runs over a pipe and dies with its parent.
  `ensureVite` starts this process's own vite (one per tree root) on a free
  port and returns the URL to navigate to; it never reuses a foreign server.
  `CHROME_PATH` overrides chrome discovery.
- `createSessionIni` makes `/tmp/vpinball-*/VPinballX.ini` via `mkdtemp` and
  never deletes it — the CALLER must `rm -rf` the dir
  (`compare-side-by-side.ts` does; one `rm` per call, it creates one
  ini per `createSessionIni` AND one inside `resolveVpxSession`).

# demo-browser — Agent Guide

Local Vite demo on `https://localhost:3000` (Vite 8, self-signed TLS via `basicSsl`). Tracked in git. Single entry `?vpx=&rom=&mode=play|viewer`.

## Run

```bash
npm run build:esm                  # from repo root (required before dev/build)
npm run dev --prefix demo-browser   # vite :3000
```

- `?vpx=/test/fixtures/table-empty.vpx&mode=play`
- `?vpx=/@fs/path/to/table.vpx&rom=/@fs/path/to/rom.zip&mode=play` (any table/ROM via drag & drop, file picker, or `?vpx`/`?rom` query)

Requires `dist-esm` built. `server.fs.allow` covers repo root, `dist`, `dist-esm`, `wasm/dist`, `wasm/kernels/dist`, `test/fixtures`, `~/Downloads`, `~/.pinmame/roms` (`strict:false`, COOP/COEP/CORP, `assetsInclude` `*.vpx/*.wasm/*.zip`).

## Structure

- `index.html` — semantic HTML5 shell, loads `src/styles/app.css` + `src/main.ts` (no global `log-capture.js` script)
- `src/main.ts` — bootstrapper & DOM event routing (~90 LOC), creates `Viewer`, handles file pickers, drag & drop, query params
- `src/viewer.ts` — Viewer coordinator (~2200 LOC, delegates to subsystems)
- `src/config.js` — controls, camera presets & constants (~120 LOC)
- `src/styles/app.css` — consolidated CSS tokens (~1150 LOC)
- `src/input/input-manager.ts` — keys, touch zones & cabinet button raycasting (~560 LOC)
- `src/input/nudge-controller.ts` — nudge physics, swipe, gamepad & motion (~170 LOC)
- `src/dmd/dmd-renderer.ts` — on-table DMD mesh updater (~385 LOC)
- `src/ui/loading-bar.ts`, `stats-overlay.ts`, `help-dialog.ts`, `log-viewer.ts` — typed `CustomEvent` UI, no `fetch`/`XHR` monkey-patch
- `src/utils/candidate-resolver.ts`, `texture-filter.ts` — VPX/ROM resolution & glass-texture filtering
- `src/env.js`, `src/utils.js` — env caps/quality flags + `$`/`fmtBytes` helpers and `utils/*` re-exports
- `src/input.js` — `attachInput` composer over `input/` + `nudge-controller` (kept: defines logic, not a shim); `config.js`, `utils.js`, `env.js` are real sources (viewer imports them directly from `./ui/*` and `./input/*`)
- `vite.config.ts` — ~210 LOC: `basicSsl`, dedupes `three`/`three-mesh-bvh`, aliases `refs.node`→`refs.browser` etc., `rawLoader` for `.vbs`/`.bnf`, static `/wasm` + ROM middleware
- `e2e/integration.mjs` + `e2e/helpers.mjs` — unified E2E (waitReady → diagnostics → physics → DMD → shots), single generic harness

## Conventions

- ESM only, Biome tabs/120, minimal code, no `window.*` pollution (typed `CustomEvent` via `log-viewer.ts`)
- Keep logging and E2E deduped — single `integration.mjs` + `helpers.mjs`, no per-scenario harnesses
- Keep demo-browser table-agnostic: no hard-coded table/ROM names (use `?vpx`/`?rom` or drag & drop, generic `DEFAULT_URL` `table-empty.vpx`)

## Test

```bash
npx tsx demo-browser/e2e/integration.mjs --url=https://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play --out=/tmp
```

Also via `test/harness/verify-browser.ts` and `verify-all.ts`. On bug fixes, add regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` for E2E.

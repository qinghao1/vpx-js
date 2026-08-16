# demo-browser — Agent Guide

Local Vite demo on `http://localhost:3000` (Vite 8). **Untracked** (`/.gitignore:demo-browser/`). Single entry `?vpx=&rom=&mode=play|viewer`.

## Run

```bash
npm run build:esm                  # from repo root (required before dev/build)
npm run dev --prefix demo-browser   # vite :3000
```

- `?vpx=/test/fixtures/table-empty.vpx&mode=play`
- `?vpx=/@fs/path/to/table.vpx&rom=/@fs/path/to/rom.zip&mode=play` (any table/ROM via drag & drop, file picker, or `?vpx`/`?rom` query)

Requires `dist-esm` built. `server.fs.allow` covers repo root, `dist`, `dist-esm`, `wasm/dist`, `test/fixtures` (`strict:false`, COOP/COEP/CORP, `assetsInclude` `*.vpx/*.wasm/*.zip`).

## Structure

- `index.html` — semantic HTML5 shell, loads `src/styles/app.css` + `src/main.ts` (no global `log-capture.js` script)
- `src/main.ts` — bootstrapper & DOM event routing (~70 LOC), creates `Viewer`, handles file pickers, drag & drop, query params
- `src/viewer.ts` — Viewer coordinator (~220 LOC target, delegates to subsystems; currently ~1950 LOC monolith with subsystem delegation)
- `src/config.ts` — controls, camera presets & constants (~80 LOC)
- `src/styles/app.css` — consolidated CSS tokens (~350 LOC)
- `src/input/input-manager.ts` — keys, touch zones & cabinet button raycasting (~160 LOC)
- `src/input/nudge-controller.ts` — nudge physics, swipe, gamepad & motion (~120 LOC)
- `src/dmd/dmd-renderer.ts` — CanvasTexture & on-table mesh updater (~140 LOC)
- `src/ui/loading-bar.ts`, `stats-overlay.ts`, `help-dialog.ts`, `log-viewer.ts` — typed `CustomEvent` UI, no `fetch`/`XHR` monkey-patch
- `src/utils/candidate-resolver.ts`, `texture-streamer.ts` — VPX/ROM resolution & background texture streaming
- `src/env.js`, `src/utils.js` — lightweight shims re-exporting new modules + `Buffer` polyfill / `$` helpers
- `viewer-core.js` — legacy shim re-exporting `src/viewer.ts` (for backwards compat with tests)
- `vite.config.ts` — minimal ~60 LOC, dedupes `three`/`three-mesh-bvh`, aliases `refs.node`→`refs.browser` etc., `rawLoader` for `.vbs`/`.bnf`, `fs.allow: [root, repoRoot]`
- `e2e/integration.mjs` + `e2e/helpers.mjs` — unified E2E (waitReady → diagnostics → physics → DMD → shots), single generic harness

## Conventions

- ESM only, Biome tabs/120, minimal code, no `window.*` pollution (typed `CustomEvent` via `log-viewer.ts`)
- Keep logging and E2E deduped — single `integration.mjs` + `helpers.mjs`, no per-scenario harnesses
- Keep demo-browser table-agnostic: no hard-coded table/ROM names (use `?vpx`/`?rom` or drag & drop, generic `DEFAULT_URL` `table-empty.vpx`)

## Test

```bash
npx tsx demo-browser/e2e/integration.mjs --url=http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play --out=/tmp
```

Also via `test/harness/verify-browser.ts` and `verify-all.ts`. On bug fixes, add regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` for E2E.

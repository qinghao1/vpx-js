# demo-browser — Agent Guide

Local Vite demo on `https://localhost:3000` (Vite 8, self-signed TLS via `basicSsl`). Tracked in git. Single entry `?vpx=&rom=&mode=play|viewer`.

## Run

```bash
npm run build:esm                  # from repo root (required before dev/build)
npm run dev --prefix demo-browser   # vite :3000
```

- `?vpx=/test/fixtures/table-empty.vpx&mode=play`
- `?vpx=/@fs/path/to/table.vpx&rom=/@fs/path/to/rom.zip&mode=play` (any table/ROM via drag & drop, file picker, or `?vpx`/`?rom` query)
- `&webgl` forces three's WebGL2 backend (default: WebGPU, falling back to WebGL2 when unavailable)

Requires `dist-esm` built. `server.fs.allow` covers the repo root, `~/Downloads`, `~/.pinmame/roms` (`strict:false`, COOP/COEP/CORP, `assetsInclude` `*.vpx/*.wasm/*.zip`). The engine artifact is served from `public/wasm/`.

## Structure

- `index.html` — semantic HTML5 shell, loads `src/styles/app.css` + `src/main.ts` (no global `log-capture.js` script)
- `src/main.ts` — bootstrapper: parses URL options once, creates `Viewer`, wires file pickers, drag & drop, log buttons, and the dev-only `window.viewer`/`window.vpx`
- `src/test-api.ts` — typed e2e surface (`window.vpx`: state, `whenReady`, `setMode`, `sendKey`, `nudge`, `step`, `dmd`)
- `src/viewer.ts` — Viewer coordinator (~2200 LOC, delegates to subsystems)
- `src/config.js` — controls, camera presets & constants (~120 LOC)
- `src/styles/app.css` — consolidated CSS tokens (~1150 LOC)
- `src/input/input-manager.ts` — keys, touch zones & cabinet button raycasting (~560 LOC)
- `src/input/nudge-controller.ts` — nudge physics, swipe, gamepad & motion (~170 LOC)
- `src/dmd/dmd-renderer.ts` — on-table DMD mesh updater (~385 LOC)
- `src/ui/stats-overlay.ts`, `help-dialog.ts`, `log-viewer.ts` — stats HUD, controls dialog, log panel (no `console`/`fetch`/`XHR` monkey-patch)
- `src/ui/table-browser.ts` — Virtual Pinball Spreadsheet table/ROM browser (`lib/emu/vps-catalog.ts`)
- `src/utils/candidate-resolver.ts`, `texture-filter.ts` — VPX/ROM resolution & glass-texture filtering
- `src/env.js`, `src/utils.js` — env caps/quality flags + `$`/`fmtBytes` helpers and `utils/*` re-exports
- `src/input.js` — `attachInput` composer over `input/` + `nudge-controller` (defines logic, not a shim); `config.js`, `utils.js`, `env.js` are real sources (viewer imports them directly from `./ui/*` and `./input/*`)
- `vite.config.ts` — `basicSsl`, cross-origin isolation headers, dedupes `three`/`three-mesh-bvh`, aliases `refs.node`→`refs.browser` etc., fixture + ROM middleware
- `e2e/integration.mjs` + `e2e/helpers.mjs` — unified E2E over `window.vpx` (waitReady → diagnostics → physics → DMD → shots), single generic harness

## Conventions

- ESM only, Biome tabs/120, minimal code, no `window.*` pollution or `console` patching; UI events are `CustomEvent`s on `window`
- Keep logging and E2E deduped — single `integration.mjs` + `helpers.mjs`, no per-scenario harnesses
- Keep demo-browser table-agnostic: no hard-coded table/ROM names (use `?vpx`/`?rom` or drag & drop, generic `DEFAULT_URL` `table-empty.vpx`)

## Test

```bash
npx tsx demo-browser/e2e/integration.mjs --url=https://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play --out=/tmp
```

Also via `test/harness/verify-browser.ts` and `verify-all.ts`. On bug fixes, add regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` for E2E.

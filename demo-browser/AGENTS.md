# demo-browser — Agent Guide

Local Vite demo on `https://localhost:3000` (Vite 8, self-signed TLS via `basicSsl`). Tracked in git. Single entry `?vpx=&table=&rom=&mode=play|viewer&noaa&nobatched&webgl`.

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

- `index.html` — semantic HTML5 shell, loads `src/styles/app.css` + `src/main.ts`
- `src/main.ts` — bootstrapper: parses URL options once, creates `Viewer`, wires file pickers, drag & drop, log buttons, and the dev-only `window.viewer`/`window.vpx`
- `src/cross-origin-isolation.ts` + `coi-sw.js` — static hosts without COOP/COEP (GitHub Pages): `VITE_COI_SW=1` builds ship a header-adding service worker and register it (one reload); other builds contain neither
- `src/test-api.ts` — typed e2e surface (`window.vpx`: state, three, `whenReady`, `setMode`, `cancelCameraAnimation`, `sendKey`, `nudge`, `step`, `dmd`)
- `src/viewer.ts` — Viewer coordinator, delegates to subsystems
- `src/config.js` — controls, camera presets & constants
- `src/styles/app.css` — consolidated CSS tokens
- `src/input/input-manager.ts` — keys, touch zones & cabinet button raycasting
- `src/input/nudge-controller.ts` — nudge physics, swipe, gamepad & motion
- `src/dmd/dmd-renderer.ts` — on-table DMD mesh updater
- `src/ui/stats-overlay.ts`, `help-dialog.ts`, `log-viewer.ts` — stats HUD, controls dialog, log panel
- `src/ui/table-browser.ts` — Virtual Pinball Spreadsheet table/ROM browser (`lib/emu/vps-catalog.ts`)
- `src/utils/candidate-resolver.ts`, `texture-filter.ts` — VPX/ROM resolution & glass-texture filtering
- `src/env.js`, `src/utils.js` — env caps/quality flags + `$`/`fmtBytes` helpers and `utils/*` re-exports
- `src/input.js` — `attachInput` composer: one `makeHost` + one `AbortController` passed to the three `input/` attachers; `config.js`, `utils.js`, `env.js` are real sources (viewer imports them directly from `./ui/*` and `./input/*`)
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

Without `--url` it runs `table-empty.vpx` and, when `findWalkingDead()`/`findWalkingDeadRom()` find them, The Walking Dead with its ROM (`twd` label: every gameplay leg required). That run boots PinMAME, so it catches engine aborts on real tables; it uses the host GPU when one exists (`USE_SWIFTSHADER=1` forces software GL). It tests whatever engine `public/wasm/` holds. Also via `test/harness/verify-all.ts`. On bug fixes, add regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` for E2E.

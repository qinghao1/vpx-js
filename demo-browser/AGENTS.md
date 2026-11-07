# demo-browser — Agent Guide

Local Vite demo on `https://localhost:3000` (Vite 8, self-signed TLS via `basicSsl`). Tracked in git. Single entry `?vpx=&rom=&mode=play|viewer`.

## Run

```bash
npm ci --prefix demo-browser         # once
npm run build:esm                    # from repo root (required before dev/build)
npm run dev --prefix demo-browser    # vite :3000
```

URL options (all optional):

- `vpx=<name|path|url>` (alias `table`) — table to load, e.g. `?vpx=/test/fixtures/table-empty.vpx` or `?vpx=/@fs/path/to/table.vpx`
- `rom=<path|url>` — PinMAME ROM zip for that table, e.g. `&rom=/@fs/path/to/rom.zip`
- `mode=play|viewer` — start mode (default `viewer`)
- `noaa` — no antialiasing; `nobatched` — skip static-mesh batching; `webgl` — force three's WebGL2 backend (default: WebGPU, manual fallback via `?webgl` when unavailable)

Tables and ROMs also load by drag & drop, or from the start card's file pickers and table browser. A ROM belongs to the table on screen (or the one dropped with it): it reboots that table's engine, and a new table without one clears it. Opened files mirror their file name into `?vpx`/`?rom` (page-relative on reload).

Requires `dist-esm` built. `server.fs.allow` covers the repo root, `~/Downloads`, `~/.pinmame/roms` (`strict:false`, COOP/COEP/CORP, `assetsInclude` `*.vpx/*.wasm/*.zip`); the ROM middleware also resolves `~/pinmame/roms` (non-dot) and `public/pinmame/roms/` (full lookup order: `test/harness/README.md`). The engine artifact is served from `public/wasm/`. `public/test/fixtures/table-empty.vpx` is a tracked copy of `test/fixtures/table-empty.vpx` so static builds ship the default table; keep the two identical.

## Structure

- `index.html` — semantic HTML5 shell, loads `src/styles/app.css` + `src/main.ts`
- `src/main.ts` — bootstrapper: parses URL options once, creates `Viewer`, wires file pickers, drag & drop, URL sync, and the dev-only `window.viewer`/`window.vpx`
- `src/cross-origin-isolation.ts` + `coi-sw.js` — static hosts without COOP/COEP (GitHub Pages): `VITE_COI_SW=1` builds ship a header-adding service worker and register it (one reload); other builds contain neither
- `src/test-api.ts` — typed e2e surface (`window.vpx`): `state`, `three` (scene, camera, controls, renderer, tableGroup, renderApi, table), `whenReady`, `setMode`, `cancelCameraAnimation`, `sendKey`, `nudge`, `step`, `dmd`, `log` (page log text)
- `src/viewer.ts` — Viewer coordinator: renderer lifecycle (incl. device-loss recovery), load pipeline, engine boot, mode switches, frame loop
- `src/wasm-engine.ts` — adapter over the headless vpinball WASM engine (script, physics, audio, DMD)
- `src/config.js` — controls, camera presets & constants
- `index.html` + `src/styles/app.css` + `src/styles/table-browser.css` — static chrome: `#topbar` (brand, Coin/Start, Lucide icon toolbar), `#dock` (stream pill, HUD, Fire/Plunger bar); touch layouts key off `(pointer: coarse)`, mouse-only affordances (tooltips, volume slider) off `(hover: hover) and (pointer: fine)`; tokens `--tap`, safe-area `--edge-*`. Nothing over the live canvas in play uses `backdrop-filter` (it re-blurs every presented frame)
- `src/input.js` — `attachInput`: attaches keyboard, pointer/touch and nudge input once through one host and one `AbortController`
- `src/input/input-manager.ts` — keys, touch flipper zones, swipe nudges & cabinet button raycasting
- `src/input/nudge-controller.ts` — device-motion shake nudges and gamepad nudges (polled on the viewer's frame loop)
- `src/dmd/dmd-renderer.ts`, `src/backglass/backglass-renderer.ts` — on-table DMD mesh updater and the backglass (backdrop art + EM reels) standing on the table head, sized to the room the play view leaves above it, standing down when the table shows its own VR backbox
- `src/ui/chrome.ts` — wires the static chrome to the viewer: toolbar (controls, reset, full screen, sound, exit), HUD (FPS readout → stats card, Copy log), app shortcuts (`` ` ``/F2 stats, M mute, ?/H controls), play-mode screen wake lock; the frame loop feeds it via `chrome.updateHud(fps)`
- `src/ui/stats-overlay.ts`, `help-dialog.ts`, `page-log.ts`, `src/overlays/dirty-overlay.ts` — stats card cells, controls dialog, in-memory page log (console-mirrored, no `console`/`fetch`/`XHR` monkey-patch), dirty-gated present loop
- `src/ui/table-browser.ts` — Virtual Pinball Spreadsheet table/ROM browser (`lib/emu/vps-catalog.ts`)
- `src/utils/candidate-resolver.ts`, `texture-filter.ts` — VPX resolution, downloads & glass-texture filtering
- `src/env.js`, `src/utils.js` — env caps/quality flags + `$`/`fmtBytes` helpers and `utils/*` re-exports
- `tsconfig.json` — `npm run typecheck:demo` (root); `viewer.ts` stays `@ts-nocheck`
- `vite.config.ts` — `basicSsl`, cross-origin isolation headers, dedupes `three`/`three-mesh-bvh`, aliases `refs.node`→`refs.browser` etc., fixture + ROM middleware; `vite build` externals `three`/`three-mesh-bvh` to the jsDelivr import map in `index.html`
- `e2e/integration.mjs` + `e2e/helpers.mjs` — unified E2E over `window.vpx` (waitReady → diagnostics → physics → DMD → shots), single generic harness

## Conventions

- ESM only, Biome tabs/120, minimal code, no `window.*` pollution or `console` patching (only `main.ts` exposes the dev handles); UI events are `CustomEvent`s on `window`
- Keep logging and E2E deduped — one `viewer.log`, single `integration.mjs` + `helpers.mjs`, no per-scenario harnesses
- Keep demo-browser table-agnostic: no hard-coded table/ROM names (use `?vpx`/`?rom` or drag & drop, generic `DEFAULT_URL` `table-empty.vpx`)

## Test

```bash
npx tsx demo-browser/e2e/integration.mjs '--url=https://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play' --out=/tmp
```

Without `--url` it runs `table-empty.vpx` and, when `findWalkingDead()`/`findWalkingDeadRom()` find them, The Walking Dead with its ROM (`twd` label: every gameplay leg required). That run boots PinMAME, so it catches engine aborts on real tables; it uses the host GPU when one exists (`USE_SWIFTSHADER=1` forces software GL). It tests whatever engine `public/wasm/` holds. Also via `npm run verify:browser` (`demo-browser/e2e/integration.mjs`) and `verify-all.ts`. On bug fixes, add regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` for E2E.

# demo-browser — Agent Guide

Local Vite demo on `http://localhost:3000` (Vite 8). **Untracked** (`/.gitignore:demo-browser/`). Single entry `?vpx=&rom=&mode=play|viewer`.

## Run

```bash
npm run build:esm                  # from repo root
npm run dev --prefix demo-browser   # vite :3000
```

- `?vpx=/test/fixtures/table-empty.vpx&mode=play`
- `?vpx=/@fs/path/to/table.vpx&rom=/@fs/path/to/rom.zip&mode=play` (any table/ROM via drag & drop, file picker, or `?vpx`/`?rom` query)

Requires `dist-esm` built. `server.fs.allow` covers repo root, `dist`, `dist-esm`, `wasm/dist`, `test/fixtures`, `~/Downloads`, `~/.pinmame/roms` (`strict:false`, COOP/COEP/CORP, `assetsInclude` `*.vpx/*.wasm/*.zip`).

## Structure

- `index.html` — classic `<script src="./src/log-capture.js">` before ESM; hosts `#title` `#canvas` `#help` `#log`
- `viewer-core.js` — Viewer (Three.js + `Player` + `BrowserBinaryReader`). Title from VPX `info.TableName`/`getName`/pretty basename, not ROM `cGameName`. Generic trough handling (`drain|trough|ballrelease|outhole`) for fallback ball.
- `src/log-capture.js` + `src/log-overlay.js` — early console/fetch capture (`__earlyLogs`/`__createHarness`) + tiny ESM delegator. Don't double-patch `console`.
- `src/app.js`, `scene.js`, `dmd.js`, `config.js`, `utils.js`, `app.css`
- `vite.config.js` — `port:3000` `host:true`, dedupes `three`/`three-mesh-bvh`, aliases `refs.node` → `refs.browser`, `rawLoader` for `.vbs`/`.bnf`
- `e2e/` — single generic harness: `integration.mjs` (waitReady → diagnostics → physics → DMD → shots) + `lib/helpers.mjs`; thin wrappers `check.mjs`/`harness-*.mjs`. Generic trough detection (any `trough|drain|ballrelease|outhole` kicker). Called by `test/harness/verify-browser.ts` as part of `verify-all.ts` TAP 1..5.

## Conventions

- Minimal and pretty — help uses `help-head`/`help-grid`/`help-row`/`kbd` chips; title shows table name.
- Keep logging and E2E deduped — single `integration.mjs`. Don't add per-scenario harnesses or duplicate logs.
- Keep demo-browser table-agnostic: no hard-coded table/ROM names (use `?vpx`/`?rom` or drag & drop, generic `DEFAULT_URL` `table-empty`, generic `my_generic_999`).

## Test

```bash
npx tsx demo-browser/e2e/integration.mjs --url=http://localhost:3000/?vpx=/test/fixtures/table-empty.vpx&mode=play --out=/tmp
```

Also via `test/harness/verify-browser.ts` and `verify-all.ts`. On bug fixes, add a regression test — `lib/**/*.spec.ts` for unit, `demo-browser/e2e/integration.mjs` (and `test/harness/` where appropriate) for E2E.

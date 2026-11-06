# vpx-js — Agent Guide (repo root)

ESM-only Visual Pinball headless-WASM port (Node `>=24`, TypeScript 7, `tsc`/`Biome`/`Vitest`, `three@0.186`, PinMAME WASM). Never hand-edit `external/vpinball` — change it via numbered patches under `wasm/modules/headless/patches/` (idempotent build, pristine series).

## Commands

```bash
npm ci
npm run build              # tsc → dist-esm (= build:esm; required before demo-browser)
npm run build:wasm:headless # emscripten headless build (needs emsdk; artifact → demo-browser/public/wasm/)
npx tsc --noEmit           # typecheck
npm run lint               # biome + copyright-header check (build/check-headers.mjs)
npm test                   # vitest
npx tsx test/harness/verify-all.ts   # E2E TAP 1..6: table → twd-render → headless → cadet → pages → browser
```

Node via `fnm` — `.nvmrc` `24`, `.node-version` `24.19.0`. Activate with `eval "$(fnm env --use-on-cd --shell bash)"`.

## Layout

- `lib/` — core: `vpt/` table/items, `io/` OLE/BIFF readers, `math/` numerics, `render/threejs/` scene pipeline, `wasm/` headless-engine seam (ABI types + scene sync; no three.js), `emu/` VPS table/ROM catalog
- `lib/refs.node.ts` / `lib/refs.browser.ts` — explicit env split; demo-browser aliases `refs.node` → `refs.browser`
- `test/fixtures/*.vpx` + `test/harness/` + `lib/**/*.spec.ts`
- `wasm/modules/headless/` (patches) + `external/vpinball` (pinned submodule) → `npm run build:wasm:headless` → `demo-browser/public/wasm/` (see `wasm/README.md`)
- `demo-browser/` — local static Three.js WebGPU viewer + E2E (`demo-browser/e2e/`)
- `dist-esm/`, `coverage/`, `node_modules/`, root `/*.vpx` — ignored, do not commit (`test/fixtures/*.vpx` are tracked)
- Deploy: `.github/workflows/pages.yml` builds the engine and demo on push to `master` (`VITE_COI_SW=1`) and deploys to GitHub Pages.

## Conventions

- Fix root cause; keep it simple, elegant, idiomatic. Keep the one-line GPL copyright header on every source file; prefer descriptive names (single letters only for conventional math locals).
- ESM only (`es2024`), Biome (tabs, 120, `organizeImports`). Minimal code; comments only for non-obvious.
- Not published (`private`, no package entry): consumers deep-import `dist-esm/lib/...` (demo-browser, harness) or `lib/` source (specs, `tsx`).
- Rebuild `dist-esm` before running `demo-browser` (vite imports from `../dist-esm/lib/...`).

## Testing

- `vitest` on `lib/**/*.spec.ts` + `test/harness/*.spec.ts` + `demo-browser/src/**/*.spec.ts` (`pool:forks`, 10s timeout).
- `test/harness/` is the single E2E entry: `verify-all.ts` (TAP 1..6: table → twd-render → headless → cadet → pages → browser). Optional steps SKIP honestly when their inputs (VPX/ROM/engine artifact) are absent. Keep it unified.

## Gotchas

- `Failed to resolve import ../dist-esm/...` → run `npm run build:esm`.
- Submodules must stay pristine — never hand-edit; if dirty, `git submodule foreach 'git reset --hard && git clean -fd'` to clean (`reset` alone keeps patch-created files, which the build rejects as broken).
- "The engine needs a cross-origin-isolated page" → the threaded engine needs COOP/COEP: send them from your server, or build the demo with `VITE_COI_SW=1` for static hosts (see `wasm/README.md`).
- SIGILL in the shipped engine → repro with devtools open (WASM debugging on). The `.wasm.map` carries no sourcesContent and no third-party code, so bgfx frames stay raw addresses.

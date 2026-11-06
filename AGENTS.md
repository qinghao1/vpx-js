# vpx-js — Agent Guide (repo root)

ESM-only Visual Pinball headless-WASM port (Node `>=24`, TypeScript 7, `tsup`/`Biome`/`Vitest`, `three@0.186`, PinMAME WASM). Never hand-edit `external/vpinball` — change it via numbered patches under `wasm/modules/headless/patches/` (idempotent build, pristine series).

## Commands

```bash
npm ci
npm run build              # tsup + tsc → dist + dist-esm
npm run build:esm          # tsc → dist-esm only (required before demo-browser)
npm run build:wasm:headless # emscripten headless build (needs emsdk; artifact → demo-browser/public/wasm/)
npx tsc --noEmit           # typecheck
npx biome check .          # lint/format (tabs, width 120)
npm test                   # vitest --coverage
npx tsx test/harness/verify-all.ts   # E2E TAP 1..4: table → twd-render → ab → browser
npm run verify:ab          # A/B + regression vs OLD worktree (needs VPX/ROM + /tmp/vpx-js-old)
```

Node via `fnm` — `.nvmrc` `24`, `.node-version` `24.19.0`. Activate with `eval "$(fnm env --use-on-cd --shell bash)"`.

## Layout

- `lib/` — core: `vpt/` table/items, `io/` OLE/BIFF readers, `math/` numerics, `render/threejs/` scene pipeline, `wasm/` headless-engine seam (ABI types + scene sync; no three.js), `emu/` ROM fetcher
- `lib/refs.node.ts` / `lib/refs.browser.ts` — explicit env split; demo-browser aliases `refs.node` → `refs.browser`
- `test/fixtures/*.vpx` + `test/harness/` + `lib/**/*.spec.ts`
- `wasm/modules/headless/` (patches 0001-0011) + `external/vpinball` (pinned submodule) → `npm run build:wasm:headless` → `demo-browser/public/wasm/`; `external/pinmame` (pinned submodule) mounted as ROM source
- `demo-browser/` — local static Three.js WebGPU viewer + E2E (`demo-browser/e2e/`)
- `dist/`, `dist-esm/`, `coverage/`, `node_modules/`, `*.vpx` — ignored, do not commit

## Conventions

- Fix root cause; keep it simple, elegant, idiomatic. Keep the one-line GPL copyright header on every source file; prefer descriptive names (single letters only for conventional math locals).
- ESM only (`es2024`), Biome (tabs, 120, `organizeImports`). Minimal code; comments only for non-obvious.
- Rebuild `dist-esm` before running `demo-browser` (vite imports from `../dist-esm/lib/...`).

## Testing

- `vitest` on `lib/**/*.spec.ts` + `test/harness/*.spec.ts` (`pool:forks`, 10s timeout).
- `test/harness/` is the single E2E entry: `verify-all.ts` (TAP 1..4: table → twd-render → ab → browser). `verify-ab.mjs` needs a VPX/ROM plus the OLD worktree (`git worktree add /tmp/vpx-js-old HEAD` with built `dist-esm`); without them it SKIPs honestly. Keep it unified.

## Gotchas

- `Failed to resolve import ../dist-esm/...` → run `npm run build:esm`.
- Submodules must stay pristine — never hand-edit; if dirty, `git submodule foreach 'git reset --hard'` to clean.

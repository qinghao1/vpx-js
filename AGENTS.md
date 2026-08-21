# vpx-js — Agent Guide (repo root)

ESM-only Visual Pinball port (Node `>=24`, TypeScript 6, `tsup`/`Biome`/`Vitest`, `three@0.185`, PinMAME WASM).

## Commands

```bash
npm ci
npm run build              # tsup + tsc → dist + dist-esm (copies res + grammar)
npm run build:esm          # tsc → dist-esm only (required before demo-browser)
npx tsc --noEmit           # typecheck
npx biome check .          # lint/format (tabs, width 120)
npm test                   # vitest --coverage
npx tsx test/harness/verify-all.ts   # E2E 1..8: wasm → table → pinmame → player → gameplay → browser → vpinball-compat → discrepancies

# Native VPinball debugging (requires VPinballX standalone)
npm run vpinball:setup     # Tier A build or Tier B prebuilt → ~/.cache/vpinball/
npm run vpinball:doctor    # ldd/otool, shaders, PinMAMEPath checks
npm run vpinball -- --vpx=table-flipper --extractvbs   # authoritative script extract
npm run vpinball:audit -- --vpx=table-flipper          # native table audit
npm run vpinball -- "http://localhost:3000/?vpx=/@fs/...&rom=/@fs/..."  # play via URL
npm run compare -- --vpx=table-flipper   # dual window: browser left 0,0 + native right 1280,0
npm run verify:vpinball -- --all-fixtures   # script & table structure parity across 25 fixtures
npm run verify:audit       # table structure & physics constants audit across 25 fixtures
npm run verify:discrepancies # web vs native gap report → ~/docs/vpx-js-web-vs-native-discrepancies.md (20 checks, TAP + markdown)
```

Node via `fnm` — `.nvmrc` `24`, `.node-version` `24.19.0`. Activate with `eval "$(fnm env --use-on-cd --shell bash)"`.

## Layout

- `lib/` — core: `vpt/` table/items, `io/` OLE/BIFF readers, `render/threejs/`, `game/` Player+physics, `scripting/` VBScript→JS, `emu/` wpc-emu/pinmame/wasm
- `lib/refs.node.ts` / `lib/refs.browser.ts` — explicit env split; demo-browser aliases `refs.node` → `refs.browser`
- `test/fixtures/*.vpx` + `test/harness/` + `lib/**/*.spec.ts`
- `wasm/` + `external/pinmame` (submodule) → `wasm/dist/` (`wasm/build.sh`, `--mock` fallback)
- `external/vpinball` (submodule, `https://github.com/vpinball/vpinball.git`) → native `VPinballX_GL`/`VPinballX_BGFX` + `libSDL3.so` + `shaders-10.8.1/` + `plugins/`
- `bin/vpinball-runner.ts` + `test/harness/vpinball-resolver.ts` + `test/harness/compare-side-by-side.ts` + `test/harness/verify-vpinball-compat.ts` — vpinball debugging & parity
- `demo-browser/` — local browser demo, **untracked** (`/.gitignore:demo-browser/`)
- `dist/`, `dist-esm/`, `coverage/`, `node_modules/`, `*.vpx`, `lib/scripting/grammar/rules.ts`, `external/vpinball/build/`, `.cache/vpinball/` — ignored, do not commit

## Conventions

- Fix root cause; keep it simple, elegant, idiomatic. No one-letter vars, no copyright headers.
- ESM only (`es2024`), Biome (tabs, 120, `organizeImports`). Minimal code; comments only for non-obvious.
- Rebuild `dist-esm` before running `demo-browser` (vite imports from `../dist-esm/lib/...`).

## Testing

- `vitest` on `lib/**/*.spec.ts` (`pool:forks`, `fileParallelism:false`, 10s timeout).
- `test/harness/` is the single E2E entry: `verify-all.ts` (TAP 1..8) → `verify-browser.ts` → `demo-browser/e2e/integration.mjs` (+ `verify-vpinball-compat.ts` + `capture-discrepancies.ts` optional # SKIP if native missing). Keep it unified.

## Gotchas

- `Failed to resolve import ../dist-esm/...` → run `npm run build:esm`.
- `external/pinmame` showing dirty after build is normal — `git submodule foreach 'git reset --hard'` to clean.
- `external/vpinball` showing dirty after `npm run vpinball:setup` is normal; `VPINBALL_BIN` overrides discovery.
- `verify-vpinball-compat` requires native `VPinballX` — CI emits `ok 7 # SKIP` when not provisioned.

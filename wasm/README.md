# WASM

`build-headless.sh` builds the headless vpinball engine (`vpinball-headless`)
from the pinned `external/vpinball` submodule plus the bridge patch series in
`modules/headless/patches/`, and deploys it to `demo-browser/public/wasm/`.
That directory is a committed release build — CI never rebuilds it, it
verifies `build-info.json` provenance instead (`npm run
verify:engine-manifest`) and boots the engine on a static host
(`test/harness/verify-pages.mjs --dist=demo-browser/dist` in pages.yml). So
after changing the submodule pin or any patch, rebuild locally and commit the
binaries together with the code change, from a clean patch dir — the build
applies every on-disk patch, and the verifier refuses manifests built with
uncommitted ones. The TypeScript side of the bridge is `lib/wasm/`.

The engine uses pthreads, so its page must be cross-origin isolated: a server
you control sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` (as the vite dev server does);
static hosts that cannot send headers (GitHub Pages) build the demo with
`VITE_COI_SW=1`, which ships a service worker that adds them
(`demo-browser/coi-sw.js`).

```bash
npm run build:wasm:headless          # release
npm run build:wasm:headless:debug    # -O0, assertions
```

Needs emsdk 6.0.13 (`$EMSDK`, `~/projects/emsdk`, `/tmp/emsdk-6.0.13`, or
`emcc` on `PATH`) and bash ≥ 4 (`mapfile`, assoc arrays). The first run
builds the third-party wasm libraries (`external.sh`, one-time).

## Patches

Never hand-edit `external/vpinball`. Each patch is one concern; the numbered
file names are the series order. The build applies the series to a throwaway
worktree, compares contents, and classifies the submodule as `pristine`
(apply), `applied` (skip) or `broken` (refuse). To add a change, reset the
submodule (`git -C external/vpinball reset --hard && git -C external/vpinball
clean -fd`), apply the series, edit, and save the diff as the next numbered
patch.

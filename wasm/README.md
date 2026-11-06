# WASM

`build-headless.sh` builds the headless vpinball engine (`vpinball-headless`)
from the pinned `external/vpinball` submodule plus the bridge patch series in
`modules/headless/patches/`, and deploys it to `demo-browser/public/wasm/`
(gitignored). The TypeScript side of the bridge is `lib/wasm/`.

```bash
npm run build:wasm:headless          # release, pthreads (needs COOP/COEP)
npm run build:wasm:headless:debug    # -O0, assertions
wasm/build-headless.sh --single-threaded   # no pthreads, for static hosting (GitHub Pages)
```

Needs emsdk 6.0.13 (`$EMSDK`, `~/projects/emsdk`, or `emcc` on `PATH`). The
first run builds the third-party wasm libraries (`external.sh`, one-time).

## Patches

Never hand-edit `external/vpinball`. Each patch is one concern; the numbered
file names are the series order. The build applies the series to a throwaway
worktree, compares contents, and classifies the submodule as `pristine`
(apply), `applied` (skip) or `broken` (refuse). To add a change, reset the
submodule (`git -C external/vpinball reset --hard && git -C external/vpinball
clean -fd`), apply the series, edit, and save the diff as the next numbered
patch.

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WASM_DIR="$ROOT/wasm"
DIST_DIR="$WASM_DIR/dist"
MOCK_SRC="$WASM_DIR/mock/libpinmame.mock.js"

[[ -x /tmp/uv-cmake/bin/cmake ]] && export PATH="/tmp/uv-cmake/bin:${PATH:-}"
if [[ -n "${EMSDK:-}" && -f "$EMSDK/emsdk_env.sh" ]]; then
  source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
elif [[ -f "$HOME/projects/emsdk/emsdk_env.sh" ]]; then
  source "$HOME/projects/emsdk/emsdk_env.sh" >/dev/null 2>&1 || true
fi
mkdir -p "$DIST_DIR"

use_mock() { cp "$MOCK_SRC" "$DIST_DIR/libpinmame.js"; echo "[wasm] mock copied to $DIST_DIR/libpinmame.js"; exit 0; }

[[ "${1:-}" == "--mock" ]] && use_mock
command -v emcc >/dev/null 2>&1 || { echo "[wasm] emcc not found — using mock"; use_mock; }

preset="${1:---wasm}"
case "$preset" in --debug) preset="debug";; --release|--wasm) preset="wasm";; *) preset="wasm";; esac

echo "[wasm] building $preset — $(emcc --version | head -1) — $(cmake --version | head -1)"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset"); then
  echo "[wasm] build failed — using mock fallback"
  cp "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  ls -lh "$DIST_DIR" | head
  exit 0
fi
ls -lh "$DIST_DIR" | head

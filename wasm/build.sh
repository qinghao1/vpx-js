#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# shellcheck disable=SC2155
readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly WASM_DIR="$ROOT/wasm"
readonly DIST_DIR="$WASM_DIR/dist"
readonly PATCH_DIR="$WASM_DIR/patches"
readonly MOCK_SRC="$WASM_DIR/mock/libpinmame.mock.js"
readonly PINMAME="$ROOT/external/pinmame"

log() { printf '[wasm] %s\n' "$*"; }

copy_mock() {
  mkdir -p "$DIST_DIR"
  cp -- "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  log "mock copied"
}

if [[ -x /tmp/uv-cmake/bin/cmake ]]; then
  PATH="/tmp/uv-cmake/bin:$PATH"
  export PATH
fi
# shellcheck disable=SC1091
if [[ -n "${EMSDK:-}" && -f "$EMSDK/emsdk_env.sh" ]]; then
  source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
elif [[ -f "$HOME/projects/emsdk/emsdk_env.sh" ]]; then
  source "$HOME/projects/emsdk/emsdk_env.sh" >/dev/null 2>&1 || true
fi

case "${1:-}" in
  --mock) copy_mock; exit 0 ;;
  -h|--help)
    printf 'Usage: %s [--mock|--debug|--release|--wasm]\n' "$0"
    exit 0
    ;;
esac

if ! command -v emcc >/dev/null 2>&1; then
  log "emcc not found — using mock"
  copy_mock; exit 0
fi

preset="${1:---wasm}"
case "$preset" in
  --debug) preset="debug" ;;
  --release|--wasm) preset="wasm" ;;
  --*) log "unknown option $preset — using wasm"; preset="wasm" ;;
  *) preset="wasm" ;;
esac

mkdir -p "$PINMAME/ext/miniaudio/miniaudio" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio.h" 2>/dev/null || true

for patch in "$PATCH_DIR"/*.patch; do
  [[ -e "$patch" ]] || continue
  if git -C "$PINMAME" apply --check "$patch" >/dev/null 2>&1; then
    log "apply $(basename "$patch")"
    git -C "$PINMAME" apply "$patch"
  fi
done

mkdir -p "$DIST_DIR"
log "building $preset — $(emcc --version 2>/dev/null | head -n1) — $(cmake --version 2>/dev/null | head -n1)"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset"); then
  log "build failed — using mock fallback"
  cp -- "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  # shellcheck disable=SC2012
  ls -lh "$DIST_DIR" | head -n 20
  exit 0
fi
# shellcheck disable=SC2012
ls -lh "$DIST_DIR" | head -n 20

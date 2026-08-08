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

# Apply source patches for emcc compatibility (idempotent)
PINMAME="$ROOT/external/pinmame"
# miniaudio is included as both "miniaudio.h" and "miniaudio/miniaudio.h"
mkdir -p "$PINMAME/ext/miniaudio/miniaudio" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio.h" 2>/dev/null || true
# upstream typo: static enum SRC_ERR int
sed -i 's/static enum SRC_ERR int sinc_multichan/static enum SRC_ERR sinc_multichan/' "$PINMAME/ext/libsamplerate/src_sinc.c" 2>/dev/null || true
# guard __rolq/__rorq intrinsics not available in WASM
if grep -q '__rolq' "$PINMAME/src/common.h" 2>/dev/null && ! grep -q 'PINMAME_WASM.*__rolq' "$PINMAME/src/common.h"; then
  python3 - << 'PY'
import pathlib
p = pathlib.Path("external/pinmame/src/common.h")
t = p.read_text()
for o,n in [
  ("#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);",
   "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);"),
  ("#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);",
   "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);"),
]:
  t=t.replace(o,n)
p.write_text(t)
PY
fi

echo "[wasm] building $preset — $(emcc --version | head -1) — $(cmake --version | head -1)"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset"); then
  echo "[wasm] build failed — using mock fallback"
  cp "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  ls -lh "$DIST_DIR" | head
  exit 0
fi
ls -lh "$DIST_DIR" | head

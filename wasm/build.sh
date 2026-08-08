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
if [[ -f "$PINMAME/ext/miniaudio/miniaudio.h" && ! -f "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" ]]; then
  mkdir -p "$PINMAME/ext/miniaudio/miniaudio"
  cp "$PINMAME/ext/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h"
fi
if [[ -f "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" && ! -f "$PINMAME/ext/miniaudio/miniaudio.h" ]]; then
  cp "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio.h"
fi
if [[ -f "$PINMAME/ext/libsamplerate/src_sinc.c" ]] && grep -q "static enum SRC_ERR int sinc_multichan" "$PINMAME/ext/libsamplerate/src_sinc.c" 2>/dev/null; then
  sed -i 's/static enum SRC_ERR int sinc_multichan_vari_process/static enum SRC_ERR sinc_multichan_vari_process/' "$PINMAME/ext/libsamplerate/src_sinc.c"
fi
if grep -q '__rolq' "$PINMAME/src/common.h" 2>/dev/null && ! grep -q 'PINMAME_WASM.*__rolq' "$PINMAME/src/common.h"; then
  python3 - << 'PYEOF'
import pathlib
pp = pathlib.Path("external/pinmame/src/common.h")
tt = pp.read_text()
o1 = "#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);"
n1 = "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);"
if o1 in tt:
    tt=tt.replace(o1,n1)
o2 = "#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);"
n2 = "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);"
if o2 in tt:
    tt=tt.replace(o2,n2)
pp.write_text(tt)
PYEOF
fi

echo "[wasm] building $preset — $(emcc --version | head -1) — $(cmake --version | head -1)"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset"); then
  echo "[wasm] build failed — using mock fallback"
  cp "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  ls -lh "$DIST_DIR" | head
  exit 0
fi
ls -lh "$DIST_DIR" | head

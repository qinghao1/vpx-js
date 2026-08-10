#!/usr/bin/env bash
set -euo pipefail
echo "[wasm/kernels] DEPRECATED — source moved to wasm/modules/kernels/src/kernels.cpp" >&2
echo "[wasm/kernels] DEPRECATED — use 'npm run build:wasm' (unified CMake) instead" >&2
ROOT="$(cd "$(dirname "$0")" && pwd)"
WASM_ROOT="$(cd "$ROOT/.." && pwd)"
SRC="$WASM_ROOT/modules/kernels/src/kernels.cpp"
# Prefer new canonical source, fall back to legacy local copy
[[ -f "$SRC" ]] || SRC="$ROOT/kernels.cpp"
DIST="$ROOT/dist"
UNIFIED_DIST="$WASM_ROOT/dist"
source "${EMSDK:-$HOME/projects/emsdk}/emsdk_env.sh" >/dev/null 2>&1 || true
if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc not found" >&2
  exit 1
fi
mkdir -p "$DIST" "$UNIFIED_DIST"
emcc "$SRC" -O3 -flto -msimd128 \
  -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createKernelsModule \
  -sEXPORTED_FUNCTIONS=_batchHitTestCircle,_batchHitTestPlane,_batchHitTestLineZ,_batchHitTestPoint,_batchHitTestTriangle,_batchHitTestLineSeg,_batchHitTestLine3D,_batchHitTestPoly,_batchElasticityWithFalloff,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAP32 \
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=0 --no-entry \
  -o "$DIST/kernels.js"
ls -lh "$DIST"
cp -f "$DIST/kernels.js" "$UNIFIED_DIST/kernels.js" 2>/dev/null || true
cp -f "$DIST/kernels.wasm" "$UNIFIED_DIST/kernels.wasm" 2>/dev/null || true

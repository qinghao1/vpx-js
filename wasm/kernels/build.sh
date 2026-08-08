#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"
source "${EMSDK:-$HOME/projects/emsdk}/emsdk_env.sh" >/dev/null 2>&1 || true
command -v emcc >/dev/null 2>&1 || { echo "emcc not found"; exit 1; }
mkdir -p "$DIST"
emcc "$ROOT/kernels.cpp" -O3 -flto -msimd128 \
  -sWASM=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createKernelsModule \
  -sEXPORTED_FUNCTIONS=_elasticityWithFalloff,_solveQuadratic,_hitTestPlane,_hitTestCircle,_hitTestLineZ,_collide3DWall,_batchElasticityWithFalloff,_batchHitTestCircle,_batchHitTestPlane,_batchHitTestLineZ,_benchElasticityWithFalloff,_benchHitTestCircle,_benchHitTestPlane,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall,getValue,setValue,HEAPF32,HEAP32,HEAPU8 \
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web,worker,node -sFILESYSTEM=0 --no-entry \
  -o "$DIST/kernels.js"
ls -lh "$DIST"

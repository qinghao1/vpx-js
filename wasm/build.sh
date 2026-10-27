#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Unified WASM builder — builds both `kernels` (physics) and `pinmame` (libPinMAME)
# via a single CMake umbrella at wasm/CMakeLists.txt.
#   npm run build:wasm        # release (both modules, pthreads on)
#   npm run build:wasm:debug  # debug
#   npm run build:wasm:mock   # mock fallback, no emsdk
# Outputs to wasm/dist/ (gitignored): kernels.js/.wasm + libpinmame.js/.wasm

# shellcheck disable=SC2155
readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly WASM_DIR="$ROOT/wasm"
readonly DIST_DIR="$WASM_DIR/dist"
readonly PATCH_DIR="$WASM_DIR/modules/pinmame/patches"
readonly MOCK_SRC="$WASM_DIR/mock/libpinmame.mock.js"
readonly PINMAME="$ROOT/external/pinmame"

log() { printf '[wasm] %s\n' "$*"; }

copy_mock() {
  mkdir -p "$DIST_DIR"
  cp -- "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  # Drop a stale real-build mate so a mock .js is never paired with a stale .wasm.
  rm -f -- "$DIST_DIR/libpinmame.wasm"
  log "mock copied to $DIST_DIR/libpinmame.js (physics-only, no emulation)"
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

allow_mock=0
preset="wasm"
for arg in "$@"; do
  case "$arg" in
    --mock) copy_mock; exit 0 ;;
    -h|--help)
      printf 'Usage: %s [--mock|--debug|--release|--wasm] [--allow-mock]\n' "$0"
      printf '  --mock       copy PinMAME mock (no emsdk)\n'
      printf '  --debug      debug build (both modules)\n'
      printf '  --release    release build (both modules, default)\n'
      printf '  --allow-mock fall back to the mock (exit 0) when emcc is\n'
      printf '               missing or the build fails; otherwise fail\n'
      exit 0
      ;;
    --debug) preset="debug" ;;
    --release|--wasm) preset="wasm" ;;
    --allow-mock) allow_mock=1 ;;
    --*) log "unknown option $arg — using wasm"; preset="wasm" ;;
    *) preset="wasm" ;;
  esac
done

if ! command -v emcc >/dev/null 2>&1; then
  if (( allow_mock )); then
    log "emcc not found — using mock (--allow-mock)"
    copy_mock; exit 0
  fi
  log "ERROR: emcc not found — install emsdk, run '$0 --mock' for a physics-only mock, or pass --allow-mock"
  exit 1
fi

mkdir -p "$PINMAME/ext/miniaudio/miniaudio" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" 2>/dev/null || true
[[ -f "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" ]] && cp -n "$PINMAME/ext/miniaudio/miniaudio/miniaudio.h" "$PINMAME/ext/miniaudio/miniaudio.h" 2>/dev/null || true

# Apply PinMAME WASM patches (idempotent — skip when already applied).
# A patch that neither applies nor reverse-applies is broken: fail loudly
# instead of building against unpatched sources.
for patch in "$PATCH_DIR"/*.patch; do
  [[ -e "$patch" ]] || continue
  name="$(basename "$patch")"
  if git -C "$PINMAME" apply --check "$patch" >/dev/null 2>&1; then
    log "apply $name"
    git -C "$PINMAME" apply "$patch"
  elif git -C "$PINMAME" apply --check --reverse "$patch" >/dev/null 2>&1; then
    log "already applied: $name (skip)"
  else
    log "ERROR: patch $name does not apply to $PINMAME (and is not already applied) — refusing to build against unpatched sources"
    exit 1
  fi
done

mkdir -p "$DIST_DIR"
log "building $preset (kernels + pinmame) — $(emcc --version 2>/dev/null | head -n1) — $(cmake --version 2>/dev/null | head -n1)"
JOBS="${JOBS:-${CMAKE_BUILD_PARALLEL_LEVEL:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}}"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset" --parallel "$JOBS"); then
  if (( allow_mock )); then
    log "build failed — using mock fallback (--allow-mock)"
    copy_mock
    # shellcheck disable=SC2012
    ls -lh "$DIST_DIR" | head -n 20
    exit 0
  fi
  log "build failed — $DIST_DIR left untouched (re-run with --allow-mock for a mock fallback)"
  exit 1
fi

# shellcheck disable=SC2012
ls -lh "$DIST_DIR" | head -n 20

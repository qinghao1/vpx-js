#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Headless-engine builder — compiles vpinball-headless from the pinned
# external/vpinball submodule plus the in-repo patches, around the vpx-js
# bridge (wasm/modules/headless/bridge/), and deploys
#   demo-browser/public/wasm/vpinball-headless.{js,wasm,data}
# (committed release build + build-info.json provenance — rebuild and commit
# them together; CI verifies the manifest instead of rebuilding).
# The .wasm.map sidecar (-gsource-map, see the target patch) is what makes a
# SIGILL in the shipped engine debuggable; the build fails if it is missing.
# Only js/wasm/data ship to Pages (the map stays local).
# Patches live in wasm/modules/headless/patches/ and apply idempotently,
# pinmame-style: never hand-edit external/vpinball, change the patch files.
#   npm run build:wasm:headless          # release (default)
#   npm run build:wasm:headless:debug   # debug
#   wasm/build-headless.sh --clean      # wipe the cmake build dir first

# shellcheck disable=SC2155
readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly VPINBALL="$ROOT/external/vpinball"
readonly PATCH_DIR="$ROOT/wasm/modules/headless/patches"
readonly BRIDGE="$ROOT/wasm/modules/headless/bridge/vpx_wasm_bridge.cpp"
readonly BUILD_DIR="$VPINBALL/build/wasm-wasm32"
readonly OUT_DIR="$ROOT/demo-browser/public/wasm"

log() { printf '[headless] %s\n' "$*"; }

BUILD_TYPE="Release"
CLEAN=0
for arg in "$@"; do
  case "$arg" in
    --debug) BUILD_TYPE="Debug" ;;
    --release) BUILD_TYPE="Release" ;;
    --clean) CLEAN=1 ;;
    -h|--help)
      printf 'Usage: %s [--debug|--release] [--clean]\n' "$0"
      exit 0
      ;;
    --*) log "unknown option $arg"; exit 1 ;;
  esac
done

if [[ ! -f "$VPINBALL/CMakeLists.txt" ]]; then
  log "ERROR: $VPINBALL is empty — run 'git submodule update --init external/vpinball' first"
  exit 1
fi

# shellcheck disable=SC1091
if [[ -n "${EMSDK:-}" && -f "$EMSDK/emsdk_env.sh" ]]; then
  source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1 || true
elif [[ -f "$HOME/projects/emsdk/emsdk_env.sh" ]]; then
  source "$HOME/projects/emsdk/emsdk_env.sh" >/dev/null 2>&1 || true
elif [[ -f "/tmp/emsdk-6.0.13/emsdk_env.sh" ]]; then
  source "/tmp/emsdk-6.0.13/emsdk_env.sh" >/dev/null 2>&1 || true
fi
if ! command -v emcc >/dev/null 2>&1; then
  log "ERROR: emcc not found — source emsdk_env.sh (emsdk 6.0.13) or set \$EMSDK"
  exit 1
fi
# The verifier pins the toolchain: fail here, not after a full build.
emsdk_ver="$(emcc --version 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true)"
if [[ "$emsdk_ver" != "6.0.13" ]]; then
  log "ERROR: emsdk ${emsdk_ver:-unknown} — this build requires exactly 6.0.13 (see wasm/README.md)"
  exit 1
fi

# Apply the patches (idempotent — skip when already applied). Checked as
# one atomic series: per-file checks cannot tell "fully applied" from
# "broken" once patches stack on the same file.
patches=("$PATCH_DIR"/*.patch)
if [[ ! -e "${patches[0]}" ]]; then
  log "no patches"
else
  # Series-aware state check: stage the fully-patched tree in a throwaway
  # worktree, then compare file contents. Per-patch reverse checks cannot
  # model a series once patches stack on the same file.
  check_tree="$(mktemp -d)"
  git -C "$VPINBALL" worktree add --detach "$check_tree" HEAD >/dev/null 2>&1
  if ! git -C "$check_tree" apply "${patches[@]}" >/dev/null 2>&1; then
    git -C "$VPINBALL" worktree remove --force "$check_tree" >/dev/null 2>&1
    log "ERROR: patch series does not apply to a pristine $VPINBALL — refusing to build"
    exit 1
  fi
  mapfile -t touched < <(git -C "$check_tree" diff --name-only; git -C "$check_tree" ls-files --others --exclude-standard)
  applied_all=true
  pristine_all=true
  for f in "${touched[@]}"; do
    if [[ -e "$VPINBALL/$f" ]] && cmp -s "$VPINBALL/$f" "$check_tree/$f"; then
      pristine_all=false
    else
      applied_all=false
      # Present, tracked, and unmodified against HEAD counts as pristine.
      if git -C "$VPINBALL" ls-files --error-unmatch -- "$f" >/dev/null 2>&1 \
        && [[ -e "$VPINBALL/$f" ]] && git -C "$VPINBALL" diff HEAD --quiet -- "$f" >/dev/null 2>&1; then
        : # pristine
      elif [[ ! -e "$VPINBALL/$f" ]] && ! git -C "$VPINBALL" ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
        : # pristine (series-created file absent)
      else
        pristine_all=false
      fi
    fi
  done
  # Any other worktree modification outside the series also means "broken".
  state=broken
  if [[ "$applied_all" == true ]]; then
    extra=$(git -C "$VPINBALL" diff HEAD --name-only | grep -vxF -f <(printf '%s\n' "${touched[@]}") || true)
    [[ -z "$extra" ]] && state=applied || state=broken
  elif [[ "$pristine_all" == true ]]; then
    state=pristine
  fi
  git -C "$VPINBALL" worktree remove --force "$check_tree" >/dev/null 2>&1
  if [[ "$state" == applied ]]; then
    log "patches already applied (skip)"
  elif [[ "$state" == pristine ]]; then
    for patch in "${patches[@]}"; do log "apply $(basename "$patch")"; done
    git -C "$VPINBALL" apply "${patches[@]}"
  else
    log "ERROR: $VPINBALL has unexpected modifications outside the patch series ($state) — reset it before building"
    exit 1
  fi
fi

if (( CLEAN )); then
  log "clean $BUILD_DIR"
  rm -rf "$BUILD_DIR"
fi

# Third-party wasm libs + their headers (cached per lib; re-runs are cheap).
# external.sh copies this header last, so its presence means both the
# build-libs and the generated (untracked) third-party/include are complete.
if [[ ! -f "$VPINBALL/third-party/include/spatialaudio/SpatialaudioConfig.h" ]]; then
  log "building third-party wasm libs (one-time; cached per lib)"
  (cd "$VPINBALL" && BUILD_TYPE="$BUILD_TYPE" bash platforms/wasm-wasm32/external.sh)
fi

log "configuring ($BUILD_TYPE)"
emcmake cmake -DPLATFORM=wasm -DARCH=wasm32 "-DCMAKE_BUILD_TYPE=$BUILD_TYPE" "-DVPX_HEADLESS_BRIDGE=$BRIDGE" -B "$BUILD_DIR" -S "$VPINBALL" >/dev/null
log "building vpinball-headless — $(emcc --version 2>/dev/null | head -n1)"
JOBS="${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"
cmake --build "$BUILD_DIR" --target vpinball-headless --parallel "$JOBS"

mkdir -p "$OUT_DIR"
for ext in js wasm wasm.map data; do
  src="$BUILD_DIR/vpinball-headless.$ext"
  [[ -f "$src" ]] || { log "ERROR: expected artifact missing: $src"; exit 1; }
  cp -- "$src" "$OUT_DIR/vpinball-headless.$ext"
done
log "deployed:"
# shellcheck disable=SC2012
ls -lh "$OUT_DIR"/vpinball-headless.{js,wasm,wasm.map,data}

# Provenance manifest lives in wasm/write-build-info.mjs (node, so no
# comma-bookkeeping): same inputs the build used, for CI to verify.
node "$ROOT/wasm/write-build-info.mjs" "$ROOT" "$OUT_DIR" "$BUILD_TYPE" "$emsdk_ver"

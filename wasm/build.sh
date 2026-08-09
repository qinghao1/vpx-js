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

# patch libpinmame for DMD polling and unconditional display update (idempotent)
if ! grep -q "PinmameGetDmdWidth" "$PINMAME/src/libpinmame/libpinmame.cpp" 2>/dev/null; then
  python3 - << 'PYEOF'
import pathlib
cpp = pathlib.Path("external/pinmame/src/libpinmame/libpinmame.cpp")
h = cpp.read_text()
# fix update_display to always copy pData
old = """extern "C" void libpinmame_update_display(const struct core_dispLayout* layout, void* p_data)
{
\t// If layout is null, update the custom DMD generated from alphanumeric segment displays
\tint index = layout == nullptr ? ((int)_displays.size() - 1) : layout->index;
\tPinmameDisplay* pDisplay = _displays[index];
\tif ((pDisplay->layout.type & CORE_SEGMASK) == CORE_VIDEO) {
\t\tconst bool changed = UpdatePinmameDisplayBitmap(pDisplay, (mame_bitmap*)p_data);
\t\tif (changed)
\t\t\tpDisplay->frameId++;
\t\tif (_p_Config->cb_OnDisplayUpdated)
\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, changed ? pDisplay->pData : nullptr, &pDisplay->layout, _p_userData);
\t}
\telse if (_p_Config->cb_OnDisplayUpdated) {
\t\tif ((pDisplay->layout.type & CORE_SEGMASK) == CORE_DMD) {
\t\t\tif (memcmp(pDisplay->pData, p_data, pDisplay->size)) {
\t\t\t\tmemcpy(pDisplay->pData, p_data, pDisplay->size);
\t\t\t\tpDisplay->frameId++;
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, pDisplay->pData, &pDisplay->layout, _p_userData);
\t\t\t}
\t\t\telse
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, nullptr, &pDisplay->layout, _p_userData);
\t\t}
\t\telse
\t\t{
\t\t\tif (memcmp(pDisplay->pData, p_data, pDisplay->size)) {
\t\t\t\tmemcpy(pDisplay->pData, p_data, pDisplay->size);
\t\t\t\tpDisplay->frameId++;
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, pDisplay->pData, &pDisplay->layout, _p_userData);
\t\t\t}
\t\t\telse
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, nullptr, &pDisplay->layout, _p_userData);
\t\t}
\t}
}"""
new = """extern "C" void libpinmame_update_display(const struct core_dispLayout* layout, void* p_data)
{
\tint index = layout == nullptr ? ((int)_displays.size() - 1) : layout->index;
\tif (index < 0 || index >= (int)_displays.size()) return;
\tPinmameDisplay* pDisplay = _displays[index];
\tif (!pDisplay) return;
\tif ((pDisplay->layout.type & CORE_SEGMASK) == CORE_VIDEO) {
\t\tconst bool changed = UpdatePinmameDisplayBitmap(pDisplay, (mame_bitmap*)p_data);
\t\tif (changed) pDisplay->frameId++;
\t\tif (_p_Config && _p_Config->cb_OnDisplayUpdated)
\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, changed ? pDisplay->pData : nullptr, &pDisplay->layout, _p_userData);
\t} else if ((pDisplay->layout.type & CORE_SEGMASK) == CORE_DMD) {
\t\tif (memcmp(pDisplay->pData, p_data, pDisplay->size)) {
\t\t\tmemcpy(pDisplay->pData, p_data, pDisplay->size);
\t\t\tpDisplay->frameId++;
\t\t\tif (_p_Config && _p_Config->cb_OnDisplayUpdated)
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, pDisplay->pData, &pDisplay->layout, _p_userData);
\t\t} else if (_p_Config && _p_Config->cb_OnDisplayUpdated) {
\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, nullptr, &pDisplay->layout, _p_userData);
\t\t}
\t} else {
\t\tif (memcmp(pDisplay->pData, p_data, pDisplay->size)) {
\t\t\tmemcpy(pDisplay->pData, p_data, pDisplay->size);
\t\t\tpDisplay->frameId++;
\t\t\tif (_p_Config && _p_Config->cb_OnDisplayUpdated)
\t\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, pDisplay->pData, &pDisplay->layout, _p_userData);
\t\t} else if (_p_Config && _p_Config->cb_OnDisplayUpdated) {
\t\t\t(*(_p_Config->cb_OnDisplayUpdated))(index, nullptr, &pDisplay->layout, _p_userData);
\t\t}
\t}
}"""
if old in h:
    h = h.replace(old, new)
    print("[wasm] patched libpinmame_update_display for unconditional copy", flush=True)
api = """
/******************************************************
 * PinmameGetDmdWidth / Height / Depth / Frame
 ******************************************************/

static PinmameDisplay* FindDmdDisplay()
{
\tfor (auto* d : _displays) if (d && (d->layout.type & PINMAME_DISPLAY_TYPE_SEGMASK) == PINMAME_DISPLAY_TYPE_DMD) return d;
\tfor (auto* d : _displays) if (d && (d->layout.type & PINMAME_DISPLAY_TYPE_SEGMASK) == PINMAME_DISPLAY_TYPE_VIDEO) return d;
\treturn nullptr;
}

PINMAMEAPI int PinmameGetDmdWidth()
{
\tauto* d = FindDmdDisplay();
\treturn d ? d->layout.width : 0;
}

PINMAMEAPI int PinmameGetDmdHeight()
{
\tauto* d = FindDmdDisplay();
\treturn d ? d->layout.height : 0;
}

PINMAMEAPI int PinmameGetDmdDepth()
{
\tauto* d = FindDmdDisplay();
\tif (!d) return 0;
\tif ((d->layout.type & PINMAME_DISPLAY_TYPE_SEGMASK) == PINMAME_DISPLAY_TYPE_VIDEO) return 4;
\treturn d->layout.depth;
}

PINMAMEAPI int PinmameGetDmdFrame(void* p_data)
{
\tauto* d = FindDmdDisplay();
\tif (!d || !p_data) return 0;
\tif ((d->layout.type & PINMAME_DISPLAY_TYPE_SEGMASK) == PINMAME_DISPLAY_TYPE_VIDEO) {
\t\tuint8_t* dst = (uint8_t*)p_data;
\t\tuint8_t* src = (uint8_t*)d->pData;
\t\tint n = d->layout.width * d->layout.height;
\t\tfor (int i = 0; i < n; i++) {
\t\t\tuint8_t r = src[i*3], g = src[i*3+1], b = src[i*3+2];
\t\t\tint v = (r * 77 + g * 150 + b * 29) >> 8;
\t\t\tdst[i] = (v * 15 + 127) / 255;
\t\t}
\t\treturn n;
\t}
\tmemcpy(p_data, d->pData, d->size);
\treturn d->size;
}

"""
if "PinmameGetDmdWidth" not in h:
    h = h.replace("/******************************************************\n * PinmameSetUserData", api + "/******************************************************\n * PinmameSetUserData")
    print("[wasm] added PinmameGetDmd* API", flush=True)
cpp.write_text(h)
PYEOF
fi
if grep -q "options.at91jit = 1;" "$PINMAME/src/libpinmame/libpinmame.cpp" 2>/dev/null; then
  if ! grep -q "PINMAME_WASM" "$PINMAME/src/libpinmame/libpinmame.cpp" 2>/dev/null; then
    python3 - << 'PY2'
import pathlib
cpp = pathlib.Path("external/pinmame/src/libpinmame/libpinmame.cpp")
h = cpp.read_text()
old = "\toptions.at91jit = 1;"
new = "\t// Enable the AT91 JIT (SAM games via sam.c, DE/Whitestar AT91 sound boards via desound.c;\n\t// 1 = default address range). Only effective in builds that compile a JIT in\n\t// For WASM, disable JIT (interpreter fallback) — JIT requires executable memory not available in Emscripten.\n\t#ifdef PINMAME_WASM\n\toptions.at91jit = 0;\n\t#else\n\toptions.at91jit = 1;\n\t#endif"
if old in h:
    h = h.replace(old, new)
    cpp.write_text(h)
    print("[wasm] patched at91jit for WASM", flush=True)
PY2
  fi
fi
echo "[wasm] building $preset — $(emcc --version | head -1) — $(cmake --version | head -1)"
if ! (cd "$WASM_DIR" && emcmake cmake --preset "$preset" && cmake --build --preset "$preset"); then
  echo "[wasm] build failed — using mock fallback"
  cp "$MOCK_SRC" "$DIST_DIR/libpinmame.js"
  ls -lh "$DIST_DIR" | head
  exit 0
fi
ls -lh "$DIST_DIR" | head

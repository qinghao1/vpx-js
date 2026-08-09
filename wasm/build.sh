#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# shellcheck disable=SC2155
readonly ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly WASM_DIR="$ROOT/wasm"
readonly DIST_DIR="$WASM_DIR/dist"
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
[[ -f "$PINMAME/ext/libsamplerate/src_sinc.c" ]] && sed -i 's/static enum SRC_ERR int sinc_multichan/static enum SRC_ERR sinc_multichan/' "$PINMAME/ext/libsamplerate/src_sinc.c" 2>/dev/null || true

PINMAME="$PINMAME" python3 <<'PY'
import os
import pathlib

pinmame = pathlib.Path(os.environ["PINMAME"])
common = pinmame / "src/common.h"
cpp = pinmame / "src/libpinmame/libpinmame.cpp"

if common.is_file():
    t = common.read_text()
    o1 = "#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);"
    n1 = "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rolq(x, count);"
    o2 = "#elif !defined(__arm__) && !defined(__aarch64__) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);"
    n2 = "#elif !defined(__arm__) && !defined(__aarch64__) && !defined(WASM) && !defined(PINMAME_WASM) && (defined(__INTEL_COMPILER) || (defined(__GNUC__) && (__GNUC__ > 3)) || defined(__clang__))\n    return __rorq(x, count);"
    if o1 in t or o2 in t:
        t = t.replace(o1, n1).replace(o2, n2)
        common.write_text(t)
        print("[wasm] patched common.h __rolq/__rorq")

if cpp.is_file():
    t = cpp.read_text()
    orig = t

    if "strcpy(newPath + pathLength, file);" in t:
        t = t.replace(
            "strcpy(newPath, path);\n\tstrcpy(newPath + pathLength, file);",
            "strcpy(newPath, path);\n\tif (pathLength > 0 && path[pathLength - 1] != '/' && path[pathLength - 1] != '\\\\')\n\t\tstrcat(newPath, \"/\");\n\tstrcat(newPath, file);",
        )
        print("[wasm] patched ComposePath")

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
    if old in t:
        t = t.replace(old, new)
        print("[wasm] patched libpinmame_update_display")

    if "PinmameGetDmdWidth" not in t:
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
        t = t.replace(
            "/******************************************************\n * PinmameSetUserData",
            api + "/******************************************************\n * PinmameSetUserData",
        )
        print("[wasm] added PinmameGetDmd* API")

    if "\toptions.at91jit = 1;" in t:
        t = t.replace(
            "\toptions.at91jit = 1;",
            "\t#ifdef PINMAME_WASM\n\toptions.at91jit = 0;\n\t#else\n\toptions.at91jit = 1;\n\t#endif",
        )
        print("[wasm] patched at91jit for WASM")

    if 'if (!_p_Config->cb_OnLogMessage)' in t:
        t = t.replace(
            "extern \"C\" void libpinmame_log_info(const char* format, ...)\n{\n\tif (!_p_Config->cb_OnLogMessage)\n\t\treturn;\n\n\tva_list args;\n\tva_start(args, format);\n\t(*(_p_Config->cb_OnLogMessage))(PINMAME_LOG_LEVEL_INFO, format, args, _p_userData);\n\tva_end(args);\n}",
            "extern \"C\" void libpinmame_log_info(const char* format, ...)\n{\n\tva_list args;\n\tva_start(args, format);\n\tif (_p_Config && _p_Config->cb_OnLogMessage)\n\t\t(*(_p_Config->cb_OnLogMessage))(PINMAME_LOG_LEVEL_INFO, format, args, _p_userData);\n\telse { vprintf(format, args); printf(\"\\n\"); }\n\tva_end(args);\n}",
        )
        t = t.replace(
            "extern \"C\" void libpinmame_log_error(const char* format, ...)\n{\n\tif (!_p_Config->cb_OnLogMessage)\n\t\treturn;\n\n\tva_list args;\n\tva_start(args, format);\n\t(*(_p_Config->cb_OnLogMessage))(PINMAME_LOG_LEVEL_ERROR, format, args, _p_userData);\n\tva_end(args);\n}",
            "extern \"C\" void libpinmame_log_error(const char* format, ...)\n{\n\tva_list args;\n\tva_start(args, format);\n\tif (_p_Config && _p_Config->cb_OnLogMessage)\n\t\t(*(_p_Config->cb_OnLogMessage))(PINMAME_LOG_LEVEL_ERROR, format, args, _p_userData);\n\telse { vfprintf(stderr, format, args); fprintf(stderr, \"\\n\"); }\n\tva_end(args);\n}",
        )
        print("[wasm] patched log fallback")

    if 'extern "C" int libpinmame_needs_update_display() { return _p_Config->cb_OnDisplayUpdated != nullptr; }' in t:
        t = t.replace(
            'extern "C" int libpinmame_needs_update_display() { return _p_Config->cb_OnDisplayUpdated != nullptr; }',
            'extern "C" int libpinmame_needs_update_display() { return _p_Config != nullptr; }',
        )
        print("[wasm] patched needs_update_display")

    if t != orig:
        cpp.write_text(t)
PY

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

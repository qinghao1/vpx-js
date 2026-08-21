#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE_DIR="${HOME}/.cache/vpinball"
LOCAL_CACHE="${ROOT}/.cache/vpinball"
PINNED_TAG="10.8.1"
PINNED_VERSION="v10.8.1"

log() { printf '[setup-vpinball] %s\n' "$*"; }
warn() { printf '[setup-vpinball] WARN: %s\n' "$*" >&2; }
has_cmd() { command -v "$1" >/dev/null 2>&1; }

find_existing() {
	local candidates=()
	[[ -n "${VPINBALL_BIN:-}" ]] && candidates+=("$VPINBALL_BIN")
	[[ -n "${VPINBALL_DIR:-}" ]] && candidates+=("$VPINBALL_DIR/VPinballX_GL" "$VPINBALL_DIR/VPinballX_BGFX")
	candidates+=(
		"$HOME/projects/vpinball/build/VPinballX_GL"
		"$HOME/projects/vpinball/build/VPinballX_BGFX"
		"$HOME/projects/vpinball/bin/VPinballX_GL"
		"$HOME/projects/vpinball/bin/VPinballX_BGFX"
		"$ROOT/external/vpinball/build/VPinballX_GL"
		"$ROOT/external/vpinball/build/VPinballX_BGFX"
		"$ROOT/external/vpinball/bin/VPinballX_GL"
		"$ROOT/external/vpinball/bin/VPinballX_BGFX"
		"$CACHE_DIR/VPinballX_GL"
		"$CACHE_DIR/VPinballX_BGFX"
		"$LOCAL_CACHE/VPinballX_GL"
		"$LOCAL_CACHE/VPinballX_BGFX"
	)
	for candidate in "${candidates[@]}"; do
		if [[ -x "$candidate" && -f "$candidate" ]]; then
			printf '%s' "$candidate"
			return 0
		fi
	done
	return 1
}

usage() {
	cat <<'USAGE'
Usage: scripts/setup-vpinball.sh [--prebuilt|--build] [--tag <tag>] [--help]

Two-tier setup for native VPinballX standalone:

  Tier A (source build, default) — cmake + external.sh from external/vpinball
  Tier B (release fallback)      — fetch prebuilt archive to ~/.cache/vpinball/

Options:
  --prebuilt   Skip source build, go directly to release download
  --build      Force source build (fail if tools missing)
  --tag <tag>  Pin release tag (default: v10.8.1)
  --help       Show this help

Env:
  VPINBALL_BIN  Direct path to VPinballX_GL / VPinballX_BGFX
  VPINBALL_DIR  Directory containing the binary + .so + shaders/
USAGE
}

TAG="$PINNED_VERSION"
MODE="auto"

while [[ $# -gt 0 ]]; do
	case "$1" in
		--prebuilt) MODE="prebuilt"; shift ;;
		--build) MODE="build"; shift ;;
		--tag) TAG="${2:-}"; shift 2 ;;
		-h|--help) usage; exit 0 ;;
		*) warn "unknown arg $1"; usage; exit 1 ;;
	esac
done

if existing="$(find_existing)"; then
	log "found existing binary: $existing"
	exit 0
fi

ensure_submodule() {
	if [[ -f "$ROOT/external/vpinball/CMakeLists.txt" ]]; then
		return 0
	fi
	if [[ -f "$ROOT/.gitmodules" ]] && grep -q 'external/vpinball' "$ROOT/.gitmodules"; then
		log "initializing external/vpinball submodule…"
		if has_cmd git; then
			git -C "$ROOT" submodule update --init --depth 1 external/vpinball 2>&1 || warn "submodule init failed (offline?)"
		fi
	fi
}

try_build() {
	ensure_submodule
	local src="$ROOT/external/vpinball"
	if [[ ! -f "$src/CMakeLists.txt" ]]; then
		warn "source not found at $src (submodule missing)"
		return 1
	fi
	if ! has_cmd cmake; then
		warn "cmake not found"
		return 1
	fi
	if ! has_cmd ninja && ! has_cmd make; then
		warn "neither ninja nor make found"
		return 1
	fi
	if ! has_cmd g++ && ! has_cmd clang++ && ! has_cmd c++; then
		warn "no C++ compiler found (g++ / clang++)"
		return 1
	fi
	log "Tier A: building from source ($src)…"
	if [[ -x "$src/platforms/linux-x64/external.sh" ]]; then
		log "running platforms/linux-x64/external.sh…"
		(cd "$src" && bash platforms/linux-x64/external.sh) || warn "external.sh failed, continuing"
	fi
	local build_dir="$src/build"
	local generator=""
	if has_cmd ninja; then
		generator="-G Ninja"
	fi
	log "cmake configure -DRENDERER=GL …"
	# shellcheck disable=SC2086
	if ! cmake $generator -S "$src" -B "$build_dir" -DRENDERER=GL -DCMAKE_BUILD_TYPE=Release; then
		warn "cmake configure failed"
		return 1
	fi
	log "cmake build -j$(nproc 2>/dev/null || echo 4)…"
	if ! cmake --build "$build_dir" -- -j"$(nproc 2>/dev/null || echo 4)"; then
		warn "cmake build failed"
		return 1
	fi
	if existing="$(find_existing)"; then
		log "build succeeded: $existing"
		return 0
	fi
	warn "build finished but binary not found"
	return 1
}

try_prebuilt() {
	local tag="$1"
	log "Tier B: fetching prebuilt release $tag…"
	mkdir -p "$CACHE_DIR" "$LOCAL_CACHE"

	local tmp
	tmp="$(mktemp -d)"
	# shellcheck disable=SC2064
	trap "rm -rf '$tmp'" RETURN

	local api_url="https://api.github.com/repos/vpinball/vpinball/releases/tags/$tag"
	local dl_url=""
	if has_cmd curl; then
		log "querying $api_url…"
		local api_json="$tmp/api.json"
		if curl -fsSL -H "Accept: application/vnd.github+json" "$api_url" -o "$api_json" 2>/dev/null; then
			# Prefer linux x64 GL standalone archive
			dl_url="$(python3 -c "
import json, pathlib, re, sys
p=pathlib.Path('$api_json')
try:
	j=json.loads(p.read_text())
	for a in j.get('assets', []):
		n=a.get('name','')
		u=a.get('browser_download_url','')
		if re.search(r'linux.*x64.*\.tar\.gz$|\.zip$', n, re.I) and ('BGFX' not in n or 'GL' in n):
			print(u); break
	else:
		# fallback first asset
		assets=j.get('assets', [])
		if assets: print(assets[0]['browser_download_url'])
except Exception as e:
	print('', file=sys.stderr)
" 2>/dev/null || true)"
		fi
		if [[ -z "$dl_url" ]]; then
			# fallback to conventional naming
			dl_url="https://github.com/vpinball/vpinball/releases/download/$tag/VPinballX_GL-linux-x64-${tag#v}.tar.gz"
			log "no asset match, trying conventional URL: $dl_url"
		fi
	elif has_cmd wget; then
		dl_url="https://github.com/vpinball/vpinball/releases/download/$tag/VPinballX_GL-linux-x64-${tag#v}.tar.gz"
	else
		warn "need curl or wget to fetch releases"
		return 1
	fi

	if [[ -z "$dl_url" ]]; then
		warn "could not determine download URL for $tag"
		return 1
	fi

	local archive="$tmp/archive"
	log "downloading $dl_url…"
	if has_cmd curl; then
		if ! curl -fL "$dl_url" -o "$archive" 2>&1 | sed 's/^/[curl] /'; then
			warn "download failed: $dl_url"
			return 1
		fi
	elif has_cmd wget; then
		if ! wget -O "$archive" "$dl_url" 2>&1 | sed 's/^/[wget] /'; then
			warn "download failed"
			return 1
		fi
	fi

	log "extracting to $CACHE_DIR…"
	mkdir -p "$CACHE_DIR"
	if file "$archive" 2>/dev/null | grep -qi "Zip"; then
		if has_cmd unzip; then
			unzip -oq "$archive" -d "$CACHE_DIR" || { warn "unzip failed"; return 1; }
		else
			warn "unzip not found for zip archive"
			return 1
		fi
	else
		tar -xzf "$archive" -C "$CACHE_DIR" 2>/dev/null || tar -xf "$archive" -C "$CACHE_DIR" 2>/dev/null || { warn "tar extract failed"; return 1; }
	fi

	# Normalize: some archives contain top-level folder
	local found
	found="$(find "$CACHE_DIR" -maxdepth 3 -type f \( -name "VPinballX_GL" -o -name "VPinballX_BGFX" \) 2>/dev/null | head -n1 || true)"
	if [[ -n "$found" ]]; then
		local bin_dir
		bin_dir="$(dirname "$found")"
		if [[ "$bin_dir" != "$CACHE_DIR" ]]; then
			log "normalizing layout from $bin_dir to $CACHE_DIR…"
			# Move contents up if top-level folder
			if [[ "$(find "$bin_dir" -maxdepth 1 -type f | wc -l)" -gt 0 ]]; then
				cp -r "$bin_dir"/* "$CACHE_DIR"/ 2>/dev/null || true
				cp -r "$bin_dir"/.* "$CACHE_DIR"/ 2>/dev/null || true
			fi
		fi
		chmod +x "$CACHE_DIR"/VPinballX_* 2>/dev/null || true
		chmod +x "$CACHE_DIR"/lib*.so* 2>/dev/null || true
	fi

	if existing="$(find_existing)"; then
		log "prebuilt ready: $existing"
		return 0
	fi

	# Last resort: list what we got
	log "archive extracted, contents:"
	ls -R "$CACHE_DIR" 2>&1 | head -n 80 | sed 's/^/  /'
	warn "prebuilt extracted but binary not found — check release layout"
	return 1
}

case "$MODE" in
	auto)
		if try_build; then
			exit 0
		fi
		warn "source build unavailable, trying prebuilt…"
		if try_prebuilt "$TAG"; then
			exit 0
		fi
		;;
	build)
		try_build || exit 1
		exit 0
		;;
	prebuilt)
		try_prebuilt "$TAG" || exit 1
		exit 0
		;;
esac

cat >&2 <<'FAIL'

[setup-vpinball] FAILED to provision native VPinballX.

  Quick fixes:
    export VPINBALL_BIN=/path/to/VPinballX_GL
    # or clone sister repo:
    git clone https://github.com/vpinball/vpinball.git ~/projects/vpinball
    bash ~/projects/vpinball/platforms/linux-x64/external.sh
    cmake -S ~/projects/vpinball -B ~/projects/vpinball/build -DRENDERER=GL
    cmake --build ~/projects/vpinball/build -j$(nproc)

  Manual prebuilt:
    mkdir -p ~/.cache/vpinball
    curl -L https://github.com/vpinball/vpinball/releases/download/v10.8.1/VPinballX-linux-x64-10.8.1.tar.gz | tar -xz -C ~/.cache/vpinball

  Then verify:
    npm run vpinball:doctor

FAIL
exit 1

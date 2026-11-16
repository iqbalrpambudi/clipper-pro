#!/usr/bin/env bash
# Stage the Python runtime, API code and CLI tools into src-tauri/resources for `tauri build`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
API="$ROOT/apps/api"
FINAL="$ROOT/apps/desktop/src-tauri/resources"
# Staged outside src-tauri and swapped in at the end: a running `tauri dev` watches resources/
OUT="$ROOT/apps/desktop/.cache/resources-staging"
PY_VERSION=3.12

rm -rf "$OUT"
mkdir -p "$OUT/bin"

# 1. Relocatable CPython (python-build-standalone via uv); -L turns symlinks into files for the bundler
uv python install "$PY_VERSION"
cp -RL "$(dirname "$(dirname "$(uv python find "$PY_VERSION")")")" "$OUT/python"
PY="$OUT/python/bin/python3"
rm -f "$OUT/python/lib/python$PY_VERSION/EXTERNALLY-MANAGED"

# 2. Runtime deps pinned by uv.lock (no dev extras)
(cd "$API" && uv export --frozen --no-dev --no-hashes --no-emit-project -o "$OUT/requirements.txt")
uv pip install --python "$PY" -r "$OUT/requirements.txt"
rm "$OUT/requirements.txt"

# Trim what a headless server never uses. Console scripts go too: uv wrote absolute shebangs into them.
P="$OUT/python"
find "$P/bin" -mindepth 1 ! -name python3 -delete
rm -rf "$P/include" "$P/share" "$P"/lib/tcl* "$P"/lib/tk* "$P"/lib/itcl* "$P"/lib/libtcl* "$P"/lib/libtk* \
  "$P/lib/python$PY_VERSION"/{idlelib,tkinter,turtledemo,ensurepip,lib2to3,pydoc_data} \
  "$P/lib/python$PY_VERSION"/config-* \
  "$P/lib/python$PY_VERSION"/site-packages/{pip,pip-*}
# Test suites shipped inside stdlib and wheels (~18MB)
find "$P/lib" -type d \( -name tests -o -name test -o -name idle_test \) -prune -exec rm -rf {} +

# 3. API code, precompiled: the .app is read-only once signed, so no __pycache__ at runtime
mkdir -p "$OUT/api"
cp -R "$API/app" "$OUT/api/app"
find "$OUT/api" -name __pycache__ -prune -exec rm -rf {} +
"$PY" -m compileall -q "$OUT/api"
# Stdlib + third-party ship as bytecode only (~58MB less): -b puts foo.pyc next to foo.py,
# which imports without the source. Our own API code keeps .py for readable tracebacks.
find "$P/lib" -name __pycache__ -prune -exec rm -rf {} +
"$PY" -m compileall -q -b "$P/lib"
# cv2's loader opens config*.py by file name, so it keeps its sources
find "$P/lib" -name '*.py' ! -path '*/site-packages/cv2/*' -delete

# 4. CLI tools the API calls by name. uv writes absolute shebangs, so yt-dlp gets a relocatable wrapper.
cat > "$OUT/bin/yt-dlp" <<'EOF'
#!/bin/sh
exec "$(dirname "$0")/../python/bin/python3" -m yt_dlp "$@"
EOF
chmod +x "$OUT/bin/yt-dlp"
# Static arm64 ffmpeg (libass, libx264, libmp3lame; system libs only, signed by the builder).
# No ffprobe: metadata comes from PyAV (app/services/media_probe.py), saving a 66MB binary.
# Pinned build + checksum; cached so rebuilds don't re-download.
FF_URL="https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2"
FF_SHA=c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924
FF_ZIP="$ROOT/apps/desktop/.cache/ffmpeg-9.0.2/ffmpeg.zip"
mkdir -p "$(dirname "$FF_ZIP")"
if ! echo "$FF_SHA  $FF_ZIP" | shasum -a 256 -c --status 2>/dev/null; then
  curl -fsSL -o "$FF_ZIP" "$FF_URL/ffmpeg.zip"
  echo "$FF_SHA  $FF_ZIP" | shasum -a 256 -c --quiet
fi
unzip -o -q "$FF_ZIP" ffmpeg -d "$OUT/bin"
chmod u+w "$OUT"/bin/*

rm -rf "$FINAL"
mv "$OUT" "$FINAL"
du -sh "$FINAL"/*

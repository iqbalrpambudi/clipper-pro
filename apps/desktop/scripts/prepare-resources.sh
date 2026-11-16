#!/usr/bin/env bash
# Stage the Python runtime, API code and CLI tools into src-tauri/resources for `tauri build`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
API="$ROOT/apps/api"
OUT="$ROOT/apps/desktop/src-tauri/resources"
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

# 3. API code, precompiled: the .app is read-only once signed, so no __pycache__ at runtime
mkdir -p "$OUT/api"
cp -R "$API/app" "$OUT/api/app"
find "$OUT/api" -name __pycache__ -prune -exec rm -rf {} +
"$PY" -m compileall -q "$OUT/api" "$OUT/python/lib"

# 4. CLI tools the API calls by name. uv writes absolute shebangs, so yt-dlp gets a relocatable wrapper.
cat > "$OUT/bin/yt-dlp" <<'EOF'
#!/bin/sh
exec "$(dirname "$0")/../python/bin/python3" -m yt_dlp "$@"
EOF
chmod +x "$OUT/bin/yt-dlp"
# shortcut: Homebrew ffmpeg links /opt/homebrew dylibs, so the app only runs on a Mac with Homebrew ffmpeg;
# swap in a static arm64 build with libass before distributing.
cp "$(command -v ffmpeg)" "$(command -v ffprobe)" "$OUT/bin/"
# Homebrew installs them read-only; tauri-build can't overwrite its previous copy in target/ on rebuild
chmod u+w "$OUT"/bin/*

du -sh "$OUT"/*

#!/usr/bin/env bash
# Pipeline export to production untuk Cliper Pro.
# Menghasilkan bundle siap rilis di ./dist/ (wheel, tarball, install.sh, SHA256SUMS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
DIST_DIR="$ROOT/dist"

VERSION=""
SKIP_CHECKS=0
INSTALL_LOCAL=0
CREATE_TAG=0

usage() {
  cat <<'EOF'
Usage: scripts/release.sh [options]

Options:
  --version <X.Y.Z>   Set/bump versi di pyproject.toml & package.json sebelum build
  --skip-checks       Lewati lint dan test
  --install           Install hasil build secara lokal via `uv tool install`
  --tag               Buat git tag v<VERSION> setelah build berhasil
  -h, --help          Tampilkan bantuan ini
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || { echo "Missing value for --version" >&2; exit 1; }
      VERSION="${2#v}"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=1
      shift
      ;;
    --install)
      INSTALL_LOCAL=1
      shift
      ;;
    --tag)
      CREATE_TAG=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cd "$ROOT"

if [ -n "$VERSION" ]; then
  echo "-> Setting version to $VERSION..."
  python3 - "$API_DIR/pyproject.toml" "$WEB_DIR/package.json" "$VERSION" <<'PY'
import json
import re
import sys
from pathlib import Path

pyproject = Path(sys.argv[1])
pkg_json = Path(sys.argv[2])
ver = sys.argv[3]

text = pyproject.read_text(encoding="utf-8")
updated, count = re.subn(r'(?m)^version\s*=\s*"[^"]+"', f'version = "{ver}"', text, count=1)
if count != 1:
    raise SystemExit("Failed to update version in pyproject.toml")
pyproject.write_text(updated, encoding="utf-8")

pkg = json.loads(pkg_json.read_text(encoding="utf-8"))
pkg["version"] = ver
pkg_json.write_text(json.dumps(pkg, indent=2) + "\n", encoding="utf-8")
PY
else
  VERSION=$(python3 - "$API_DIR/pyproject.toml" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text(encoding="utf-8")
m = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
if not m:
    raise SystemExit("Version not found in pyproject.toml")
print(m.group(1))
PY
)
fi

if [ "$SKIP_CHECKS" -eq 0 ]; then
  echo "-> Running lint & service tests..."
  make lint
  if [ -x "$API_DIR/.venv/bin/python" ]; then
    (cd "$API_DIR" && .venv/bin/python -m pytest -q tests/test_service_cli.py)
  fi
fi

echo "-> Building frontend & staging web_dist..."
make build-web

echo "-> Building Python wheel & sdist (v$VERSION)..."
rm -rf "$API_DIR/dist" "$API_DIR/build" "$API_DIR"/*.egg-info
(cd "$API_DIR" && uv build)

echo "-> Preparing production artifacts in $DIST_DIR..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"
cp "$API_DIR"/dist/cliper_pro-"$VERSION"-py3-none-any.whl "$DIST_DIR/"
cp "$API_DIR"/dist/cliper_pro-"$VERSION".tar.gz "$DIST_DIR/"
cp "$ROOT/install.sh" "$DIST_DIR/install.sh"
chmod +x "$DIST_DIR/install.sh"

(
  cd "$DIST_DIR"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "cliper_pro-${VERSION}-py3-none-any.whl" "cliper_pro-${VERSION}.tar.gz" "install.sh" > SHA256SUMS
  else
    shasum -a 256 "cliper_pro-${VERSION}-py3-none-any.whl" "cliper_pro-${VERSION}.tar.gz" "install.sh" > SHA256SUMS
  fi
)

if [ "$INSTALL_LOCAL" -eq 1 ]; then
  echo "-> Installing cliper-pro v$VERSION locally..."
  uv tool install --python 3.12 --force "$DIST_DIR/cliper_pro-${VERSION}-py3-none-any.whl"
fi

if [ "$CREATE_TAG" -eq 1 ]; then
  echo "-> Creating git tag v$VERSION..."
  git tag -a "v$VERSION" -m "Release v$VERSION"
fi

echo ""
echo "Production export selesai (v$VERSION):"
ls -lh "$DIST_DIR"
echo ""
echo "Install lokal:"
echo "  sh ./dist/install.sh"
echo "Upload semua isi ./dist/ ke GitHub Release v$VERSION, lalu install di mesin manapun via:"
echo "  curl -fsSL https://github.com/iqbalrpambudi/clipper-pro/releases/latest/download/install.sh | sh"

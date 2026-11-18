#!/bin/sh
# Installer Cliper Pro (service + Web UI + system tray) via curl | sh
# Penggunaan:
#   curl -fsSL https://github.com/iqbalrpambudi/clipper-pro/releases/latest/download/install.sh | sh
# Opsi env:
#   CLIPER_REPO        GitHub owner/repo (default: iqbalrpambudi/clipper-pro)
#   CLIPER_VERSION     Versi rilis, mis. 0.1.0 atau v0.1.0 (default: latest)
#   CLIPER_WHEEL_URL   URL langsung ke file .whl (opsional)
#   CLIPER_START       Set 1 untuk langsung menjalankan service setelah install
set -eu

REPO="${CLIPER_REPO:-iqbalrpambudi/clipper-pro}"
VERSION="${CLIPER_VERSION:-latest}"
WHEEL_URL="${CLIPER_WHEEL_URL:-}"
AUTO_START="${CLIPER_START:-0}"

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

ensure_path() {
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
}

ensure_uv() {
  ensure_path
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  command -v curl >/dev/null 2>&1 || fail "curl dibutuhkan untuk mengunduh uv dan Cliper Pro."
  say "-> Menginstall uv (Python package & tool manager)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ensure_path
  command -v uv >/dev/null 2>&1 || fail "uv tidak ditemukan di PATH setelah instalasi."
}

resolve_latest_version() {
  effective_url=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" 2>/dev/null || true)
  case "$effective_url" in
    */releases/tag/*)
      tag="${effective_url##*/releases/tag/}"
      printf '%s\n' "${tag#v}"
      return 0
      ;;
  esac
  return 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    return 1
  fi
}

main() {
  ensure_uv

  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  WHEEL_SRC=""

  if [ -n "$WHEEL_URL" ]; then
    WHEEL_NAME=$(basename "$WHEEL_URL")
    WHEEL_SRC="$TMP_DIR/$WHEEL_NAME"
    say "-> Mengunduh $WHEEL_URL..."
    curl -fsSL -o "$WHEEL_SRC" "$WHEEL_URL"
  else
    # Cek apakah dijalankan dari folder repo / hasil export lokal
    LOCAL_WHL=""
    for f in ./dist/cliper_pro-*.whl ./cliper_pro-*.whl; do
      if [ -f "$f" ]; then
        LOCAL_WHL="$f"
      fi
    done

    if [ -n "$LOCAL_WHL" ] && [ "$VERSION" = "latest" ]; then
      WHEEL_SRC="$LOCAL_WHL"
      say "-> Menggunakan package lokal: $WHEEL_SRC"
    else
      if [ "$VERSION" = "latest" ]; then
        say "-> Mengecek rilis terbaru dari $REPO..."
        VER=$(resolve_latest_version || true)
        [ -n "$VER" ] || fail "Gagal mendeteksi rilis terbaru dari github.com/$REPO. Pastikan release sudah dipublish atau set CLIPER_WHEEL_URL."
      else
        VER="${VERSION#v}"
      fi

      WHEEL_NAME="cliper_pro-${VER}-py3-none-any.whl"
      BASE_URL="https://github.com/$REPO/releases/download/v${VER}"
      WHEEL_SRC="$TMP_DIR/$WHEEL_NAME"

      say "-> Mengunduh Cliper Pro v${VER}..."
      curl -fsSL -o "$WHEEL_SRC" "${BASE_URL}/${WHEEL_NAME}"

      if curl -fsSL -o "$TMP_DIR/SHA256SUMS" "${BASE_URL}/SHA256SUMS" 2>/dev/null; then
        EXPECTED=$(awk -v f="$WHEEL_NAME" '$2 == f || $2 == ("*" f) {print $1; exit}' "$TMP_DIR/SHA256SUMS")
        ACTUAL=$(sha256_file "$WHEEL_SRC" || true)
        if [ -n "$EXPECTED" ] && [ -n "$ACTUAL" ] && [ "$EXPECTED" != "$ACTUAL" ]; then
          fail "Checksum mismatch untuk $WHEEL_NAME (expected $EXPECTED, got $ACTUAL)"
        fi
        say "-> Checksum SHA256 terverifikasi."
      fi
    fi
  fi

  say "-> Menginstall cliper-pro via uv tool..."
  uv tool install --python 3.12 --force "$WHEEL_SRC"

  ensure_path
  CLIPER_BIN=$(command -v cliper-pro || true)
  [ -n "$CLIPER_BIN" ] || CLIPER_BIN="$HOME/.local/bin/cliper-pro"

  say ""
  "$CLIPER_BIN" doctor || true
  say ""

  if ! command -v ffmpeg >/dev/null 2>&1; then
    say "Catatan: ffmpeg belum ditemukan di PATH."
    case "$(uname -s)" in
      Darwin) say "  Install via Homebrew: brew install ffmpeg" ;;
      Linux)  say "  Install via package manager: sudo apt install -y ffmpeg" ;;
    esac
    say ""
  fi

  say "Cliper Pro berhasil diinstall!"
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) say "Tambahkan ke shell PATH Anda: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
  esac
  say "Jalankan service + system tray:"
  say "  cliper-pro start"
  say "Atau mode server tanpa tray:"
  say "  cliper-pro start --headless"

  if [ "$AUTO_START" = "1" ]; then
    say ""
    "$CLIPER_BIN" start
  fi
}

main "$@"

# Cliper Pro — AI Short Video Maker

> Otomatisasi pembuatan short video viral (TikTok / Reels / Shorts) dari video mentah menggunakan AI scene detection, template narasi LLM, Gemini TTS, subtitle karaoke ASS, dan render FFmpeg. Berjalan sebagai **background service** dengan **Web UI** dan **ikon system tray** (`pystray`).

## ✨ Fitur Utama

- **📹 Media Pool** — Upload video lokal atau download dari YouTube via yt-dlp
- **🎬 AI Scene Detection** — Deteksi otomatis pergantian scene menggunakan PySceneDetect + Vision AI tagging
- **📝 AI Narration** — Generate naskah narasi Bahasa Indonesia via LLM (Gemini, OpenAI-compatible, LLM lokal)
- **🔊 Text-to-Speech** — Sintesis suara narasi menggunakan Gemini TTS atau ElevenLabs
- **📊 Smart Timeline** — Auto-match scene visual ke segmen narasi audio
- **💬 Subtitle Karaoke** — Subtitle ASS presisi dengan highlight per-kata
- **🎥 Render & Export** — Render video final 9:16 vertikal via FFmpeg
- **🤖 Autopilot** — Pipeline terjadwal sampai publish ke YouTube Shorts

## 🏗️ Arsitektur

```
cliper-pro/
├── apps/
│   ├── api/          # Package `cliper-pro`: FastAPI backend, CLI service, pystray system tray, & bundled Web UI
│   └── web/          # React 19 + Vite frontend
├── automation/       # Script channel YouTube (memanggil API service)
└── Makefile
```

Saat service dijalankan (`cliper-pro start`), API FastAPI menyala di background pada `http://127.0.0.1:18080` sekaligus menyajikan Web UI, dan ikon system tray muncul di menu bar untuk membuka UI di browser, melihat status/log, start/stop service, dan mengaktifkan *Start at Login*. Untuk server/headless tanpa GUI, gunakan `--headless`.

## 🚀 Quick Start

### Prerequisites

- Python 3.12+, [uv](https://docs.astral.sh/uv/), Node.js 22+
- `ffmpeg` (`brew install ffmpeg` di macOS, atau `sudo apt install ffmpeg` di Linux)

### Instalasi via `curl` (Production)

```bash
curl -fsSL https://github.com/iqbalrpambudi/clipper-pro/releases/latest/download/install.sh | sh
```

Script [install.sh](install.sh) otomatis memasang `uv` (jika belum ada), Python 3.12, dan package `cliper-pro` beserta Web UI & tray icon.

### Instalasi dari Source Repo

```bash
make install        # install deps API & web + build frontend bundle
make install-tool   # install CLI `cliper-pro` secara global via uv tool
```

### Perintah CLI `cliper-pro`

| Command | Deskripsi |
|---------|-----------|
| `cliper-pro start` | Jalankan service di background + ikon system tray |
| `cliper-pro start --headless` | Jalankan service di background tanpa tray (mode server) |
| `cliper-pro start --open` | Jalankan service lalu buka Web UI di browser |
| `cliper-pro stop` | Hentikan service & tray |
| `cliper-pro restart` | Restart service |
| `cliper-pro status` | Cek status service, PID, path data, & dependensi |
| `cliper-pro open` | Buka Web UI (`http://127.0.0.1:18080`) di browser |
| `cliper-pro logs -f` | Pantau log service secara live |
| `cliper-pro service install` | Aktifkan auto-start saat login (`launchd` / `systemd --user`) |
| `cliper-pro service uninstall` | Nonaktifkan auto-start saat login |
| `cliper-pro doctor` | Cek kesiapan Python, `ffmpeg`, `yt-dlp`, dan Web UI bundle |

Konfigurasi AI model, TTS, dan YouTube dilakukan melalui Web UI di halaman **Settings**.

## 📂 Data

Secara default semua data service disimpan di `~/.cliper-pro/` (bisa diubah lewat env `CLIPER_DATA_DIR`):

| Path | Isi |
|------|-----|
| `cliper.db` | Database SQLite |
| `projects/` | Media proyek |
| `bgm/<mood>/*.mp3` | Library BGM (menu tray → **Open Data Folder**). Nama folder = mood yang bisa dipilih |
| `hf/` | Cache model Whisper (diunduh saat pertama dipakai) |
| `encryption.key` | Key enkripsi API key di DB. Jangan dihapus: tanpa key ini semua secret tidak bisa dibuka |
| `api.log` / `tray.log` | Log API dan tray |

## 🛠️ Development & Export Production

```bash
make dev     # API (127.0.0.1:18080 --reload) + Vite (localhost:3031)
make test    # Pytest API + typecheck web
make lint    # Ruff + ESLint + TypeScript check
make release # Export bundle production ke ./dist/ (wheel, tarball, install.sh, SHA256SUMS)
```

Export production juga bisa dijalankan langsung via CLI dari repo:

```bash
cliper-pro export                     # export versi saat ini ke ./dist/
cliper-pro export --version 0.2.0     # bump versi + export ke ./dist/
cliper-pro export --install           # export + langsung install lokal
```

Push tag `v*` (mis. `git tag v0.2.0 && git push --tags`) akan memicu GitHub Actions untuk membangun dan mempublikasikan aset `./dist/*` ke GitHub Releases agar langsung bisa diinstall via `curl`.

## 🛠️ Tech Stack

- **Service & Tray:** Python 3.12, Uvicorn, `pystray`, `Pillow`
- **Backend:** FastAPI, SQLAlchemy 2.0 (async) + SQLite, PySceneDetect, FFmpeg, yt-dlp, faster-whisper
- **Frontend:** React 19, Vite, TypeScript, TailwindCSS 3, Zustand, TanStack Query, JASSUB

## 📄 License

Private / All Rights Reserved

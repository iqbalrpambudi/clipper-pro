# Cliper Pro — AI Short Video Maker

> Otomatisasi pembuatan short video viral (TikTok / Reels / Shorts) dari video mentah menggunakan AI scene detection, template narasi LLM, Gemini TTS, subtitle karaoke ASS, dan render FFmpeg. Berjalan sebagai aplikasi desktop macOS (Tauri) dengan ikon di menu bar.

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
│   ├── desktop/      # Tauri v2 shell: tray, window, menjalankan API sebagai proses anak
│   │   ├── src-tauri/        # Rust (main.rs), tauri.conf.json, icons
│   │   └── scripts/          # prepare-resources.sh: Python + deps + ffmpeg/yt-dlp untuk bundle
│   ├── api/          # FastAPI backend (Python 3.12, SQLite)
│   └── web/          # React 19 + Vite frontend
├── automation/       # Script channel YouTube (memanggil API desktop)
└── Makefile
```

Saat app jalan, Tauri menyalakan API di `127.0.0.1:18080` lalu membuka jendela setelah API sehat. Menutup jendela tidak mematikan API; app tetap di menu bar. **Quit** dari menu bar menghentikan semuanya. **Start at Login** di menu bar membuat app jalan otomatis saat login (langsung ke tray, tanpa jendela). Membuka app saat sudah jalan hanya memunculkan jendela yang ada.

Mode dev (`make dev`) memakai identitas terpisah: "Cliper Pro Dev", API di `127.0.0.1:18081`, dan folder data sendiri. Jadi dev bisa jalan berdampingan dengan app terpasang tanpa menyentuh data aslinya.

## 🚀 Quick Start

### Prerequisites

- macOS (Apple Silicon)
- [Rust](https://rustup.rs), [uv](https://docs.astral.sh/uv/), Node.js 22+
- FFmpeg dengan libass: `brew install homebrew-ffmpeg/ffmpeg/ffmpeg`

### Setup & jalankan

```bash
make install   # venv API, npm deps, dan resources bundle (sekali)
make dev       # app desktop mode dev (hot reload frontend & Rust)
make build     # buat "Cliper Pro.app"
```

Hasil build: `apps/desktop/src-tauri/target/release/bundle/macos/Cliper Pro.app`.

Konfigurasi AI model, TTS, dan YouTube dilakukan di dalam app: **Settings**.

## 📂 Data

Semua data ada di `~/Library/Application Support/com.cliperpro.desktop/` (mode dev: `com.cliperpro.desktop.dev/`):

| Path | Isi |
|------|-----|
| `cliper.db` | Database SQLite |
| `projects/`, `bgm/`, `presets/` | Media proyek, library BGM, preset gambar |
| `hf/` | Cache model Whisper (diunduh saat pertama dipakai) |
| `encryption.key` | Key enkripsi API key di DB. Jangan dihapus: tanpa key ini semua secret tidak bisa dibuka |
| `api.log` | Log API |

## 📋 Makefile Commands

| Command | Deskripsi |
|---------|-----------|
| `make install` | Setup pertama kali |
| `make resources` | Siapkan ulang Python/ffmpeg/yt-dlp untuk bundle (setelah dependency API berubah) |
| `make dev` | Jalankan app desktop mode dev |
| `make build` | Build `Cliper Pro.app` |
| `make test` | Pytest API + typecheck web |
| `make lint` / `make format` | Lint / format web dan API |

## 🛠️ Tech Stack

- **Desktop:** Tauri v2 (Rust, WKWebView), tray menu bar
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async) + SQLite, PySceneDetect, FFmpeg, yt-dlp, faster-whisper
- **Frontend:** React 19, Vite, TypeScript, TailwindCSS 3, Zustand, TanStack Query, JASSUB

## 📄 License

Private / All Rights Reserved

# Cliper Pro — AI Short Video Maker

> Otomatisasi pembuatan short video viral (TikTok / Reels / Shorts) dari video mentah menggunakan AI scene detection, template narasi LLM, Gemini TTS, subtitle karaoke ASS, dan render FFmpeg.

## ✨ Fitur Utama

- **📹 Media Pool** — Upload video lokal atau download dari YouTube via yt-dlp
- **🎬 AI Scene Detection** — Deteksi otomatis pergantian scene menggunakan PySceneDetect + Vision AI tagging
- **📝 AI Narration** — Generate naskah narasi Bahasa Indonesia via LLM (Gemini, OpenAI, Claude, dll.)
- **🔊 Text-to-Speech** — Sintesis suara narasi menggunakan Gemini TTS atau Edge-TTS
- **📊 Smart Timeline** — Auto-match scene visual ke segmen narasi audio
- **💬 Subtitle Karaoke** — Subtitle ASS presisi dengan highlight per-kata (gaya Hormozi & TikTok viral)
- **🎥 Render & Export** — Render video final 9:16 vertikal dengan background blur/solid via FFmpeg

## 🏗️ Arsitektur

```
cliper-pro/
├── apps/
│   ├── api/          # FastAPI Backend (Python 3.12)
│   │   ├── app/
│   │   │   ├── api/v1/       # REST API Routes
│   │   │   ├── core/         # Config, DB, Redis, Storage, Security
│   │   │   ├── models/       # SQLAlchemy ORM Models
│   │   │   ├── schemas/      # Pydantic Request/Response Schemas
│   │   │   ├── services/     # Business Logic (Scene Detect, TTS, Renderer, etc.)
│   │   │   └── workers/      # ARQ Background Tasks
│   │   ├── alembic/          # Database Migrations
│   │   └── tests/
│   └── web/          # Next.js 15 Frontend (React 19 + TypeScript)
│       ├── app/              # App Router Pages
│       ├── components/       # UI Components (Media, Narration, TTS, Timeline, Subtitles, Render)
│       ├── hooks/            # React Query Hooks
│       ├── lib/              # API Client, Zustand Store, ASS Generator
│       └── types/            # TypeScript Interfaces
├── infrastructure/
│   └── docker/       # Docker Compose Configuration
├── storage/          # Media Storage (git-ignored)
├── Makefile          # Development Commands
└── .env.example      # Environment Variables Template
```

## 🚀 Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (dengan Docker Compose v2)
- API Key untuk Gemini / OpenAI (opsional jika menggunakan 9Router)

### 1. Clone & Setup

```bash
git clone <repository-url> cliper-pro
cd cliper-pro
```

### 2. Start Semua Services

```bash
make up
```

Perintah ini akan:
- Membuat `.env` dari `.env.example` jika belum ada
- Build dan start semua Docker containers (API, Web, Worker, PostgreSQL, Redis)
- Menampilkan URL akses

### 3. Akses Aplikasi

| Service | URL |
|---------|-----|
| **Web UI** | http://localhost:3030 |
| **API Docs** | http://localhost:8080/docs |
| **API Health** | http://localhost:8080/healthz |

### 4. Konfigurasi AI Model

Buka **Web UI → Model Settings** untuk mengonfigurasi:
- API Base URL & API Key (Gemini, OpenAI, atau 9Router)
- Chat Model (untuk narasi) & Vision Model (untuk tagging scene)
- TTS Provider (Gemini TTS atau Edge-TTS)

## 📋 Makefile Commands

| Command | Deskripsi |
|---------|-----------|
| `make up` | Start semua services |
| `make down` | Stop semua services |
| `make restart` | Restart semua services |
| `make logs` | Lihat logs real-time |
| `make rebuild` | Rebuild dan restart |
| `make migrate` | Jalankan database migration |
| `make revision m="pesan"` | Buat migration baru |
| `make test` | Jalankan tests |
| `make sh-api` | Shell ke container API |
| `make sh-web` | Shell ke container Web |
| `make sh-worker` | Shell ke container Worker |
| `make clean` | Stop dan hapus semua data (volumes) |

## ⚙️ Environment Variables

Salin `.env.example` ke `.env` dan sesuaikan:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `WEB_PORT` | `3030` | Port Web UI |
| `API_PORT` | `8080` | Port API |
| `DATABASE_URL` | `postgresql+asyncpg://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `STORAGE_PATH` | `/app/storage` | Path penyimpanan media |
| `MAX_UPLOAD_SIZE` | `2147483648` (2GB) | Batas ukuran upload |
| `AI_BASE_URL` | - | Base URL endpoint LLM (OpenAI-compatible) |
| `AI_API_KEY` | - | API Key untuk LLM |
| `AI_CHAT_MODEL` | `gemini-2.0-flash` | Model untuk narasi |
| `AI_VISION_MODEL` | `gemini-2.0-flash` | Model untuk vision tagging |
| `TTS_PROVIDER` | `gemini` | Provider TTS (`gemini` atau `edge`) |
| `ENCRYPTION_KEY` | - | Fernet key untuk enkripsi API keys di DB |

## 🛠️ Tech Stack

**Backend:**
- Python 3.12, FastAPI, SQLAlchemy 2.0 (async), PostgreSQL + pgvector
- ARQ (async Redis queue) untuk background workers
- PySceneDetect, FFmpeg, yt-dlp, faster-whisper
- Fernet encryption untuk sensitive data

**Frontend:**
- Next.js 15 (App Router), React 19, TypeScript
- TailwindCSS 3, Zustand, React Query (TanStack Query)
- JASSUB untuk subtitle rendering
- Lucide Icons

**Infrastructure:**
- Docker Compose (multi-service orchestration)
- Redis 7 (task queue + pub/sub SSE events)
- PostgreSQL 16 (pgvector)

## 📄 License

Private / All Rights Reserved

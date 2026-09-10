# PRD — Auto Short Video Maker
**Versi:** 1.0
**Tanggal:** 10 September 2026
**Status:** Draft

---

## 1. Ringkasan Produk

Aplikasi web untuk mengotomatiskan pembuatan short video (TikTok/Reels/Shorts) dari materi video mentah. User mengunggah video (upload manual atau download via link YouTube menggunakan `yt-dlp`), lalu sistem secara otomatis:

1. Menganalisis scene dalam video.
2. Menghasilkan narasi berdasarkan template yang dipilih (fakta unik, konten viral, dll) menggunakan LLM yang dapat dikonfigurasi sendiri.
3. Mengubah narasi menjadi audio (TTS) menggunakan `gemini-2.5-flash-preview-tts`.
4. Mencocokkan potongan scene video dengan narasi yang dibacakan.
5. Menghasilkan video final dengan subtitle karaoke (highlight kata sesuai audio).

---

## 2. Tujuan & Sasaran

| Tujuan | Metrik Keberhasilan |
|---|---|
| Mempercepat produksi short video | Waktu dari upload → video jadi < 10 menit untuk video 1–3 menit |
| Narasi otomatis relevan & sesuai template | User tidak perlu edit narasi > 20% dari hasil generate |
| Subtitle karaoke akurat | Deviasi timing highlight < 150ms dari audio asli |
| Scene matching relevan secara visual | Scene yang dipilih otomatis sesuai konteks kalimat (validasi manual) |
| Fleksibilitas konfigurasi model | User bisa ganti LLM/vision model tanpa ubah kode (hanya via config) |

### Non-Goals (di luar scope v1)
- Tidak membuat generative video/image (video sepenuhnya berasal dari materi yang diupload/didownload, bisa dari beberapa video sumber sekaligus).
- Narasi hanya Bahasa Indonesia di v1 (multi-bahasa = scope v2).
- Tidak ada fitur multi-user/kolaborasi tim di v1.
- Tidak ada auto-publish langsung ke TikTok/IG/YouTube di v1 (hanya export file).

---

## 3. Target Pengguna

- Content creator / editor short video yang ingin mempercepat repurposing video panjang → short video.
- Tim media/agency yang memproduksi konten "fakta unik", "trivia", "konten viral" secara volume tinggi.

---

## 4. Alur Pengguna (User Flow)

```
1. User membuka aplikasi → buat project baru
2. Pilih sumber video:
   a. Upload manual (drag & drop file)
   b. Paste link YouTube → sistem fetch info via yt-dlp → user pilih resolusi → download
3. Sistem menjalankan Scene Detection otomatis (background job)
4. User memilih Template Narasi (fakta unik / konten viral / custom prompt)
   - User bisa input topik/konteks tambahan (opsional)
5. Sistem generate narasi via LLM (user bisa preview & edit teks sebelum lanjut)
6. Sistem generate TTS (gemini-2.5-flash-preview-tts) dari narasi final
7. Sistem melakukan word-level alignment dari hasil TTS
8. Sistem mencocokkan scene video dengan tiap segmen narasi (auto), user bisa
   re-order / ganti scene manual di timeline editor
9. Sistem generate subtitle karaoke (ASS) sinkron dengan audio
10. User preview hasil akhir di timeline editor (video + audio + subtitle)
11. User klik "Render" → sistem render final video (FFmpeg) → job queue
12. User download hasil video (mp4)
```

---

## 5. Functional Requirements

### 5.1 Modul Upload & Sumber Video

**Catatan penting:** satu project dapat memiliki **lebih dari satu video sumber** (multi-video), kombinasi bebas antara upload manual dan hasil download `yt-dlp`. Semua video sumber masuk ke "Media Pool" milik project, dan scene dari seluruh video sumber tersebut menjadi kandidat untuk tahap Scene Matching (5.6) — bukan dibatasi satu video saja.

**FR-1.1 Upload Manual**
- Mendukung format: mp4, mov, mkv, webm.
- Mendukung upload banyak file sekaligus (multi-upload) ke dalam satu project.
- Maks. ukuran file dikonfigurasi via config (default 2GB per file).
- Progress bar upload (chunked upload untuk file besar).

**FR-1.2 Download via yt-dlp (Paste Link)**
- User paste URL YouTube (dan opsional platform lain yang didukung `yt-dlp`), dapat menambahkan beberapa link sekaligus ke Media Pool yang sama.
- Sistem menjalankan `yt-dlp -F <url>` untuk mengambil daftar format/resolusi yang tersedia.
- UI menampilkan pilihan resolusi (mis. 1080p, 720p, 480p) beserta ukuran estimasi file & codec, per link.
- User memilih resolusi → sistem menjalankan download job (`yt-dlp -f <format_id>`) secara async, dengan progress bar (persentase dari stdout `yt-dlp`).
- Hasil download disimpan ke Media Pool project yang sama seperti upload manual (disatukan pipeline-nya setelah tahap ini).
- Validasi: cek durasi tiap video (batas maksimal dikonfigurasi, mis. 30 menit) sebelum lanjut ke pipeline, karena video panjang berdampak besar ke biaya LLM/TTS.

**FR-1.3 Error Handling**
- Jika `yt-dlp` gagal (video private/region-locked/dihapus), tampilkan pesan error yang jelas dan log detail untuk debugging, tanpa mengganggu proses video lain dalam Media Pool yang sama.
- Update rutin `yt-dlp` binary untuk menghindari breaking changes dari YouTube (jadwalkan auto-update binary via cron/startup check).

**FR-1.4 Durasi Video Final**
- Durasi video hasil akhir **tidak ditentukan/dibatasi manual oleh user di awal**, melainkan mengikuti salah satu dari dua hal secara otomatis:
  1. Total durasi audio narasi (TTS) yang dihasilkan — ini yang menentukan panjang timeline utama, atau
  2. Total durasi hasil clipping/pemilihan scene di timeline editor, jika user melakukan trim manual.
- Sistem menampilkan estimasi durasi final secara real-time di timeline editor seiring narasi/scene diubah.

---

### 5.2 Modul Konfigurasi Model (Settings)

Halaman **Settings → Model Configuration** yang menyimpan konfigurasi berikut (per user/project, tersimpan di DB terenkripsi untuk API key):

| Field | Deskripsi |
|---|---|
| `baseUrl` | Endpoint API LLM (mendukung custom/self-hosted/OpenAI-compatible endpoint) |
| `chatModel` | Nama model untuk generate narasi (mis. `claude-sonnet-4-6`, atau model lain sesuai `baseUrl`) |
| `visionModel` | Nama model untuk analisis/tagging scene visual |
| `apiKey` | API key untuk autentikasi ke `baseUrl` (disimpan terenkripsi, tidak pernah ditampilkan ulang secara plaintext setelah disimpan) |
| `ttsProvider` | Default: `gemini-2.5-flash-preview-tts` (lihat 5.4) |
| `ttsApiKey` | API key Gemini terpisah dari LLM key (karena beda provider) |

**FR-2.1** Sistem harus melakukan "Test Connection" saat user menyimpan config (kirim request kecil ke `baseUrl` untuk validasi kredensial & model tersedia).

**FR-2.2** Config bersifat pluggable — arsitektur harus mendukung provider apapun yang kompatibel dengan schema request/response OpenAI-style atau Anthropic-style (adapter pattern), agar user leluasa mengganti provider LLM tanpa perlu deploy ulang.

**FR-2.3** Semua pemanggilan LLM (narasi generation & vision tagging) di backend wajib membaca config ini secara dinamis, bukan hardcoded.

---

### 5.3 Modul Scene Detection & Vision Tagging

**FR-3.1** Setelah video tersedia (dari upload/download), jalankan scene detection otomatis (mis. `PySceneDetect`, content-aware detection) untuk memecah video menjadi klip-klip berbasis perubahan visual.

**FR-3.2** Untuk tiap scene, ekstrak 1–3 frame representatif dan kirim ke `visionModel` (dari config) untuk menghasilkan deskripsi singkat + tag (mis. "orang memasak di dapur, close-up tangan").

**FR-3.3** Simpan metadata scene: `{scene_id, start_time, end_time, thumbnail, description, tags, embedding_vector}`.

**FR-3.4** User dapat melihat daftar scene hasil deteksi di panel project (thumbnail strip) sebelum lanjut ke tahap narasi.

---

### 5.4 Modul Generate Narasi (Template System)

**FR-4.1 Template Library**
- Template built-in minimal: "Fakta Unik", "Konten Viral/Storytelling", "Edukasi Singkat".
- Tiap template = prompt template tersimpan (system prompt + struktur output yang diharapkan: hook, isi, closing).
- User dapat membuat/mengedit custom template sendiri (prompt editor bebas), dan menyimpannya untuk dipakai ulang.

**FR-4.2 Input Tambahan**
- User dapat memasukkan topik/tema spesifik, target durasi narasi (detik), dan tone (santai/formal/dramatis).
- Bahasa keluaran narasi **dikunci ke Bahasa Indonesia** untuk v1 (tidak ada opsi ganti bahasa). Dukungan multi-bahasa menjadi scope v2 jika dibutuhkan.

**FR-4.3 Generate**
- Sistem memanggil `chatModel` dari config dengan prompt template + input user + (opsional) ringkasan tag scene sebagai konteks tambahan agar narasi tetap relevan dengan isi video.
- Output narasi ditampilkan dalam editor teks agar user bisa edit manual sebelum lanjut ke TTS.

**FR-4.4 Segmentasi**
- Narasi otomatis dipecah menjadi segmen per kalimat (untuk keperluan matching scene di tahap berikutnya).

---

### 5.5 Modul Text-to-Speech (TTS)

**FR-5.1** TTS menggunakan **`gemini-2.5-flash-preview-tts`** via Gemini API.

**FR-5.2 Pemilihan Voice**
- Sistem mengambil/menyediakan daftar voice prebuilt yang didukung `gemini-2.5-flash-preview-tts` (mis. varian karakter suara yang tersedia di Gemini TTS) dan menampilkannya sebagai dropdown/gallery di UI, lengkap dengan tombol "Preview suara" (contoh audio singkat) agar user bisa dengar sebelum memilih.
- User dapat menyimpan voice favorit per template (mis. voice A untuk template "Fakta Unik", voice B untuk "Konten Viral") sebagai default, namun tetap bisa override per project.
- Parameter tambahan yang didukung model (kecepatan bicara/pitch, jika tersedia di API) juga dapat diatur user.

**FR-5.3 Word-level Timestamp**
- Karena Gemini TTS tidak menjamin output word-level timestamp presisi tinggi secara native untuk semua kondisi, sistem menjalankan **forced alignment** pasca-generate menggunakan **WhisperX** (atau alternatif alignment lain) terhadap audio hasil TTS + teks narasi asli, untuk menghasilkan timestamp per kata yang akurat.
- Hasil alignment disimpan sebagai `[{word, start_ms, end_ms}]` per segmen kalimat.

**FR-5.4** Sistem menyimpan file audio (wav/mp3) per project, dapat di-regenerate ulang jika user mengedit narasi.

**FR-5.5** Estimasi biaya API TTS ditampilkan ke user sebelum generate (berdasarkan jumlah karakter narasi), agar tidak ada biaya tak terduga.

---

### 5.6 Modul Scene Matching

**FR-6.1** Setiap segmen narasi (dengan timestamp dari TTS) dicocokkan ke scene video yang paling relevan menggunakan similarity antara embedding teks narasi vs embedding deskripsi/tag scene (FR-3.2).

**FR-6.2** Jika durasi scene yang dipilih lebih pendek dari durasi audio segmen, sistem otomatis:
- Menyambung dengan scene berikutnya yang relevan, atau
- Melakukan slow-motion ringan / freeze-frame terakhir sebagai fallback (dikonfigurasi).

**FR-6.3** Hasil matching ditampilkan di **Timeline Editor** — user dapat drag scene lain untuk mengganti secara manual, trim in/out point, atau reorder.

**FR-6.4** Sistem menyimpan timeline final sebagai data terstruktur (bukan hanya video biner) agar dapat di-render ulang kapan saja tanpa mengulang tahap sebelumnya.

---

### 5.7 Modul Subtitle Karaoke (Highlight)

**FR-7.1** Sistem generate file subtitle format **ASS/SSA** dengan tag karaoke (`\k`) berdasarkan timestamp per kata dari FR-5.3, sehingga highlight kata **mengikuti audio yang sedang dinarasikan secara presisi** (bukan estimasi, tapi berbasis timestamp aktual hasil alignment).

**FR-7.2 Preset Gaya Subtitle**
Sistem menyediakan preset siap pakai yang bisa langsung dipilih, dan tetap 100% dapat dikustomisasi lebih lanjut oleh user (preset = starting point, bukan kunci mati):

| Preset | Karakteristik Default |
|---|---|
| **Viral TikTok/Reels** | Font tebal sans-serif (mis. Montserrat/Poppins Bold), teks putih dengan outline hitam tebal, highlight kata berwarna kuning/hijau cerah dengan sedikit efek scale-up, posisi tengah-bawah, mode per-kata |
| **Alex Hormozi Punch** | Font sangat tebal & besar (mis. Komika/Bebas Neue), warna teks putih dengan background box solid per kata/frasa, highlight warna kuning menyala, ditampilkan dalam mode **burst 2–3 kata** sekaligus, posisi tengah layar, animasi punch/scale kuat tiap burst muncul |
| **Minimalist** | Font clean/regular (mis. Inter/Helvetica), tanpa outline tebal, warna teks putih/hitam sesuai kontras background, highlight halus (opacity/underline, bukan warna mencolok), posisi bawah, mode per-kata, tanpa animasi berlebihan |

**FR-7.3 Kustomisasi Manual (Style Editor)**
User dapat mengedit setiap aspek berikut, baik dari preset maupun dari nol (custom style, dapat disimpan sebagai preset pribadi):
- **Font**: pilihan font family (termasuk upload font custom jika diperlukan), bold/italic.
- **Color**: warna teks normal, warna teks highlight, warna outline/stroke, warna background box (opsional, dengan opacity).
- **Size**: ukuran font (dalam px/relatif terhadap frame), dengan preview auto-scale sesuai resolusi output.
- **Position**: atas / tengah / bawah, plus offset X/Y manual (drag langsung di preview player).
- **Mode tampilan teks**:
  - *Per-kata*: satu/dua kata tampil bergantian sesuai timing bicara.
  - *Per-kalimat penuh dengan highlight berjalan*: seluruh kalimat tampil, kata yang sedang diucapkan di-highlight (karaoke klasik).
  - *Burst 2–3 kata*: teks muncul dalam kelompok 2–3 kata sekaligus (gaya Hormozi), grup berikutnya menggantikan grup sebelumnya sesuai timing ucapan; jumlah kata per burst dapat diatur (2 atau 3).
- **Animasi highlight**: pilihan efek saat kata/burst aktif — perubahan warna, scale/zoom, bold, background box muncul, atau kombinasi.
- **Emoji otomatis** *(opsional, dapat dimatikan)*: menyisipkan emoji relevan di kata-kata tertentu berdasarkan konteks narasi (khususnya relevan untuk preset Viral TikTok/Reels).

**FR-7.4** Preview subtitle **real-time** di video player timeline editor, menggunakan mesin rendering yang identik dengan output final (lihat FR-8.5 — WYSIWYG), bukan simulasi CSS terpisah yang berpotensi berbeda hasil.

**FR-7.5** Setiap perubahan style disimpan sebagai bagian dari `subtitle_style` pada project, dan dapat di-"Save as Preset" agar dipakai ulang di project lain.

---

### 5.8 Modul Rendering & Export

**FR-8.1** Rendering final menggabungkan: timeline video (hasil scene matching), audio TTS, dan subtitle ASS menjadi satu file mp4 menggunakan **FFmpeg** (filter `libass` untuk burn-in subtitle).

**FR-8.2** Rendering dijalankan sebagai background job (queue) — user mendapat notifikasi saat selesai, tidak perlu menunggu di halaman.

**FR-8.3** Output format: vertikal 9:16 (default, untuk short video), dengan opsi resolusi (720p/1080p) dan opsi rasio lain (1:1, 16:9) jika dibutuhkan.

**FR-8.4** User dapat mendownload hasil akhir, serta project tetap tersimpan untuk re-render jika ada perubahan (edit narasi/timeline/subtitle style).

**FR-8.5 Background Fill untuk Area Tidak Tercover**
- Karena output default berformat vertikal 9:16 sedangkan scene sumber bisa punya rasio berbeda (mis. 16:9), area kosong di atas/bawah atau kiri/kanan frame video harus diisi. Sistem menyediakan opsi per-project (dan dapat di-override per-scene bila perlu):
  - **Blurred Background**: scene yang sama di-crop penuh, diperbesar, dan diberi efek blur untuk mengisi area di luar video utama (video utama tetap ditampilkan proporsional/`fit` di tengah).
  - **Black Background**: area kosong diisi warna solid hitam (atau warna custom lain yang bisa dipilih user).
- Opsi ini dapat diatur sebagai default project, dengan kemungkinan override per-scene di timeline editor untuk kasus tertentu.

**FR-8.6 WYSIWYG — Kesesuaian Preview & Hasil Render**
- Preview di timeline editor (video, subtitle karaoke termasuk mode burst/highlight, posisi, background fill blur/hitam) **wajib identik secara visual** dengan hasil render final (mp4).
- Untuk menjamin ini, arsitektur render harus menggunakan **satu sumber definisi visual yang sama** untuk preview dan render final — dua pendekatan yang bisa dipilih tim engineering:
  1. Preview player merender frame menggunakan mesin yang sama dengan pipeline FFmpeg/libass (mis. preview via WebCodecs/canvas yang membaca definisi ASS & layout yang identik dengan yang dipakai FFmpeg saat render), atau
  2. Preview memanggil endpoint render "preview cepat" (resolusi rendah/low-fps) di background yang memakai command FFmpeg yang sama persis dengan render final (hanya beda preset kualitas), sehingga tidak ada dua implementasi rendering yang terpisah.
- Pendekatan (2) lebih disarankan untuk v1 karena risiko divergensi visual jauh lebih rendah dibanding membangun ulang mesin render terpisah di browser.
- Setiap perubahan pada timeline/subtitle style otomatis men-trigger regenerasi preview (debounced) agar tetap real-time namun tidak membebani server berlebihan.

---

## 6. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| **Performance** | Rendering job async via queue (tidak blocking UI); proses paralel untuk multi-project |
| **Skalabilitas** | Worker rendering & download (yt-dlp) harus horizontally scalable (containerized) |
| **Keamanan** | API key (LLM & TTS) dienkripsi at-rest; tidak pernah dikirim ke frontend setelah tersimpan |
| **Reliabilitas** | Retry mechanism untuk job yang gagal (LLM call, TTS call, download, render) |
| **Observability** | Logging tiap tahap pipeline per project (status: queued/processing/done/failed) agar mudah debug |
| **Biaya** | Estimasi biaya LLM & TTS ditampilkan sebelum eksekusi tahap yang memakan biaya |
| **Kompatibilitas** | Adapter LLM harus mendukung skema OpenAI-compatible & Anthropic-compatible minimal |
| **Legal** | Disclaimer terkait hak cipta video yang didownload via yt-dlp — tanggung jawab penggunaan ada di user |

---

## 7. Arsitektur & Tech Stack (Usulan)

```
Frontend: React (Next.js) + timeline editor custom (atau berbasis library video-editor JS)
Backend API: Node.js (NestJS) atau Python (FastAPI)
Job Queue: BullMQ (Redis) / Celery (jika Python)
Storage: S3-compatible (MinIO/Cloudflare R2) untuk video, audio, thumbnail
Database: PostgreSQL (project, config, metadata scene, timeline)
Scene Detection: PySceneDetect (Python worker)
Vision Tagging: dipanggil via config `visionModel` (adapter multi-provider)
Narrative Generation: dipanggil via config `chatModel` (adapter multi-provider)
TTS: Gemini API (`gemini-2.5-flash-preview-tts`)
Alignment: WhisperX (word-level timestamp)
Subtitle: generate ASS file (karaoke tag \k)
Rendering: FFmpeg + libass (worker terpisah, resource-intensive)
Video Download: yt-dlp (dijalankan sebagai subprocess di worker, binary di-update berkala)
```

---

## 8. Data Model (Ringkas)

```
Project
├─ id, name, created_at, status
├─ config_id (relasi ke ModelConfig)
├─ media_pool: [ SourceVideo ]           // multi-video per project
├─ scenes: [ Scene ]                     // gabungan scene dari seluruh SourceVideo
├─ narration: { template_id, raw_text (Bahasa Indonesia), segments: [ Segment ] }
├─ audio: { file_url, voice_id, voice_params }
├─ timeline: [ { segment_id, scene_id, source_video_id, start, end, transform } ]
├─ background_fill: { mode: blur | black | custom_color, color? }
├─ subtitle_style: { preset_id?, font, colors, size, position, display_mode: per_word | full_sentence | burst, burst_word_count?, highlight_animation, emoji_enabled }
└─ render_jobs: [ { status, output_url, preview_url, created_at } ]

SourceVideo
├─ id, origin (upload | ytdlp), file_url, youtube_url?, selected_resolution?, duration, status

Scene
├─ id, source_video_id, start_time, end_time, thumbnail_url, description, tags, embedding

Segment
├─ id, text, start_ms, end_ms, words: [ { word, start_ms, end_ms } ]

ModelConfig (per user)
├─ baseUrl, chatModel, visionModel, apiKey (encrypted)
├─ ttsProvider (default: gemini-2.5-flash-preview-tts), ttsApiKey (encrypted)

Template
├─ id, name, prompt_template, is_custom, owner_id, default_voice_id?

SubtitlePreset
├─ id, name (builtin: viral_tiktok | hormozi_punch | minimalist, atau custom), owner_id?, style_json
```

---

## 9. Milestone / Roadmap

| Fase | Scope | Estimasi |
|---|---|---|
| **M1 — Fondasi** | Upload manual, config LLM/TTS, struktur project/DB | 2 minggu |
| **M2 — Sumber Video via yt-dlp** | Fetch resolusi, download job, progress tracking | 1 minggu |
| **M3 — Scene Detection & Vision Tagging** | Integrasi PySceneDetect + adapter vision model | 2 minggu |
| **M4 — Narasi & Template System** | Template builtin/custom, generate & edit narasi | 1.5 minggu |
| **M5 — TTS + Alignment** | Integrasi Gemini TTS + WhisperX alignment | 2 minggu |
| **M6 — Scene Matching + Timeline Editor** | Auto-matching, UI drag-drop editor | 2.5 minggu |
| **M7 — Subtitle Karaoke** | Generate ASS + style customization + preview | 1.5 minggu |
| **M8 — Rendering Pipeline** | FFmpeg render job, queue, export | 2 minggu |
| **M9 — QA, Polish, Beta Launch** | End-to-end testing, error handling, UX polish | 2 minggu |

**Total estimasi:** ± 16–17 minggu (bisa paralel sebagian antar fase dengan tim > 1 orang)

---

## 10. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `yt-dlp` sering breaking karena perubahan YouTube | Download gagal | Auto-update binary, monitoring job failure rate, fallback pesan error jelas |
| Biaya API LLM/TTS membengkak (video panjang, banyak scene) | Cost tinggi | Batas durasi video, estimasi biaya sebelum eksekusi, caching hasil vision tagging |
| Word-level alignment tidak akurat | Highlight subtitle meleset | Gunakan WhisperX (akurasi tinggi) + fallback manual adjust timestamp di editor |
| Scene matching tidak relevan secara semantik | Video hasil terasa asal-asalan | Beri user kontrol manual override di timeline editor (FR-6.3) |
| Rendering berat (resource CPU/GPU) | Bottleneck saat banyak job bersamaan | Worker rendering terpisah & scalable, gunakan hardware acceleration FFmpeg jika tersedia |
| Isu hak cipta konten yang didownload | Legal risk untuk user | Disclaimer jelas di UI, bukan tanggung jawab platform |

---

## 11. Open Questions

Status sebelumnya sudah terjawab (bahasa Indonesia, voice dapat dipilih user, multi-video diperbolehkan, durasi mengikuti narasi/clipping). Pertanyaan yang masih perlu keputusan:

1. Untuk pendekatan WYSIWYG (FR-8.6), tim engineering perlu memutuskan: pakai "preview render cepat via FFmpeg di background" (disarankan, lebih aman konsistensinya) atau membangun mesin preview terpisah di browser (lebih instan tapi risiko divergensi visual)?
2. Apakah preset subtitle builtin (Viral TikTok/Reels, Hormozi Punch, Minimalist) perlu preview thumbnail/video contoh di galeri pemilihan preset agar user mudah membandingkan sebelum memilih?
3. Untuk font custom yang di-upload user (FR-7.3), apakah perlu validasi lisensi font, atau cukup disclaimer tanggung jawab ada di user?
4. Batas durasi maksimal per video sumber di Media Pool — berapa menit yang wajar per file untuk menjaga biaya vision tagging & waktu proses tetap masuk akal, mengingat sekarang bisa multi-video per project?
5. Apakah emoji otomatis (FR-7.3) memakai LLM tambahan (mis. `chatModel` yang sama) untuk menentukan penempatan, atau cukup rule-based dari kata kunci umum?

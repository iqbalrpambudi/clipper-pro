# Karaoke / Auto Caption Subtitle Engine — Cliper Pro
## PRD + Arsitektur Teknis + Panduan Implementasi

---

## 1. Ringkasan Eksekutif & Tujuan

Modul Subtitle Karaoke Cliper-Pro dirancang khusus untuk video pendek vertikal (TikTok, Instagram Reels, YouTube Shorts). Modul ini bertanggung jawab mengolah transkrip narasi dan hasil **forced alignment** per kata menjadi subtitle karaoke dinamis dengan tampilan berkualitas tinggi setara CapCut dan Alex Hormozi.

### Prinsip Arsitektur Utama (100% WYSIWYG)
> **Visual Subtitle pada Browser Preview (Next.js) dan Hasil Render Video (FFmpeg + libass) WAJIB 100% IDENTIK.**
> Font family, ukuran font, ketebalan outline/stroke, warna teks, efek highlight per kata, posisi koordinat, dan latar belakang box tidak boleh berbeda sedikit pun antara yang dilihat pengguna saat mengedit dan hasil file MP4 final.

---

## 2. Tech Stack & Dependensi

| Area | Komponen / Library | Peran & Alasan Pemilihan |
|---|---|---|
| **Frontend UI** | Next.js 15 + React 19 + Tailwind CSS | Editor WYSIWYG, panel kustomisasi gaya, live player, dan word inspector |
| **State Management** | Zustand | State playback audio/video, posisi playhead, dan segmen subtitle aktif |
| **Icons** | Lucide React | Ikon modern untuk kontrol player dan panel editor |
| **Audio Alignment** | `faster-whisper` (Python) | Forced alignment berbasis audio TTS untuk menghasilkan timestamp per kata (`start_ms`, `end_ms`) |
| **Subtitle Format** | ASS / SSA (Advanced SubStation Alpha v4.00+) | Format subtitle standar industri dengan kontrol presisi font, outline, styling, dan koordinat pixel |
| **Video Engine** | Native FFmpeg dengan filter `libass` | Penggabungan potongan scene klip, background blur 9:16, audio mixing, dan burn-in subtitle ASS |
| **Font Management** | Direct TTF directory mapping (`:fontsdir=`) | Memastikan FFmpeg `libass` dan browser memuat file TTF lokal yang persis sama (`Montserrat`, `Bebas Neue`, dll.) |
| **Interoperabilitas** | Exporter SRT, WebVTT, ASS | Creator dapat mengekspor subtitle untuk keperluan YouTube Closed Captions atau NLE eksternal |

---

## 3. Alur Data Subtitle (Data Pipeline)

```
                       ┌────────────────────────┐
                       │ Narasi Teks (LLM)      │
                       └───────────┬────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ Audio TTS (Gemini/Edge)│
                       └───────────┬────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ Forced Alignment       │
                       │ (faster-whisper)       │
                       └───────────┬────────────┘
                                   │
                                   ▼
               ┌────────────────────────────────────────┐
               │ Narration Segments & Word Timestamps   │
               │ [{word, start_ms, end_ms, ...}]        │
               └───────────────────┬────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
                 ▼                                   ▼
      ┌─────────────────────┐             ┌─────────────────────┐
      │ Next.js WYSIWYG     │             │ Backend ASS Engine  │
      │ Preview Player      │             │ (subtitle_ass.py)   │
      │ • Normalized Scale  │             │ • PlayRes 1080x1920 │
      │ • Timestamp Index   │             │ • Word-event Slices │
      │ • Interactive Drag  │             │ • :fontsdir Mapping │
      └─────────────────────┘             └──────────┬──────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │ FFmpeg libass       │
                                          │ Final MP4 Render    │
                                          └─────────────────────┘
```

---

## 4. Model Data Dokumen Subtitle

Data subtitle disimpan secara terstruktur di database (`narrations` dan `subtitle_styles`):

### 4.1 Narration Segment & Words
```typescript
interface CaptionWord {
  id: string;
  word: string;
  start_ms: number;
  end_ms: number;
  emoji?: string;
}

interface CaptionSegment {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  words: CaptionWord[];
}
```

### 4.2 Subtitle Style Configuration
```typescript
interface SubtitleStyle {
  preset_name: "viral_tiktok" | "hormozi_punch" | "minimalist" | "neon_glow" | "custom";
  font_family: "Montserrat" | "Bebas Neue" | "Poppins" | "Inter" | "Anton" | "Oswald" | "Roboto";
  font_size: number;         // Basis frame 1080x1920 (default 52 - 68)
  font_weight: "Normal" | "Bold";
  primary_color: string;     // Hex #RRGGBB (warna teks dasar/non-aktif)
  highlight_color: string;   // Hex #RRGGBB (warna saat kata aktif diucapkan)
  outline_color: string;     // Hex #RRGGBB (warna garis tepi)
  outline_width: number;     // Ketebalan outline (basis 1080p: 2 - 6px)
  box_color: string;         // Hex #RRGGBB (warna latar belakang kotak)
  box_opacity: number;       // 0.0 (transparan) s/d 1.0 (solid)
  position: "top" | "center" | "bottom";
  offset_y: number;          // Penyesuaian vertikal (pixel dalam frame 1080x1920)
  offset_x: number;          // Penyesuaian horizontal
  display_mode: "per_word" | "burst" | "full_sentence";
  burst_word_count: number;  // 2 atau 3 kata per grup pada mode burst
  highlight_animation: "scale" | "color" | "box" | "none";
  emoji_enabled: boolean;
}
```

---

## 5. Rumus Normalisasi Skala 1080×1920 (WYSIWYG Guarantees)

Semua nilai dimensi teks diatur berdasarkan frame master vertikal **1080 × 1920** (PlayResX = 1080, PlayResY = 1920).

### 5.1 Skala di Browser Preview
Jika elemen video player di browser memiliki lebar `previewWidth` (misal 320px) dan tinggi `previewHeight` (misal 568.89px):

$$\text{Scale Ratio} = \frac{\text{previewWidth}}{1080}$$

$$\text{previewFontSize} = \text{style.font\_size} \times \text{Scale Ratio}$$

$$\text{previewOutlineWidth} = \text{style.outline\_width} \times \text{Scale Ratio}$$

$$\text{previewOffsetY} = \text{style.offset\_y} \times \left(\frac{\text{previewHeight}}{1920}\right)$$

### 5.2 Konversi Transparansi Box ASS
Dalam format ASS, nilai alpha warna `00` berarti solid (100% opaque) dan `FF` berarti transparan (0% opaque). Maka konversi opacity CSS (0.0 – 1.0) ke ASS adalah:

$$\text{ASS Alpha} = \text{int}((1.0 - \text{box\_opacity}) \times 255)$$

---

## 6. Mode Tampilan & Logika Sinkronisasi Kata Aktif

### 6.1 Mode Per-Kata (`per_word`)
- Hanya **satu kata** yang muncul di layar pada satu waktu, yaitu kata yang sedang diucapkan (`curMs >= word.start_ms && curMs <= word.end_ms`).
- Teks menggunakan huruf kapital dengan warna `highlight_color`.
- Efek scale pop aktif saat kata baru muncul.
- **Implementasi ASS**: Baris Dialogue mandiri untuk setiap kata dengan durasi tepat `word.end_ms - word.start_ms`.

### 6.2 Mode Burst 2–3 Kata (`burst` / Hormozi Style)
- Kata-kata dikelompokkan menjadi grup berisi 2 atau 3 kata (`burst_word_count`).
- Seluruh kata dalam grup muncul di layar bersamaan sejak kata pertama mulai diucapkan (`group_start`) hingga kata terakhir selesai (`group_end`).
- **Kata yang sedang aktif diucapkan** di-highlight dengan `highlight_color` dan efek scale/pop. Kata lain dalam grup tetap menggunakan `primary_color`.
- **Implementasi ASS**: Dihasilkan *sub-event dialogue slices* untuk setiap transisi kata di dalam grup. Hal ini menjamin kata yang di-highlight berpindah secara presisi pada frame yang tepat, identik dengan preview DOM React.

### 6.3 Mode Kalimat Penuh (`full_sentence` / Karaoke Klasik)
- Seluruh kalimat dalam satu segmen narasi tampil di layar dari `seg.start_ms` hingga `seg.end_ms`.
- Kata yang sedang diucapkan berubah warna menjadi `highlight_color` sesuai ketukan suara narator.
- **Implementasi ASS**: Baris Dialogue dipecah berdasarkan timestamp aktif tiap kata dalam kalimat dengan posisi stabil.

---

## 7. Pemetaan Font & Rendering FFmpeg

Agar FFmpeg `libass` tidak menggunakan font sistem fallback Linux (seperti DejaVu Sans), backend menyediakan folder font lokal di `apps/api/app/fonts` yang berisi:
- `Montserrat.ttf`
- `BebasNeue.ttf`
- `Poppins.ttf`
- `Inter.ttf`
- `Anton.ttf`
- `Oswald.ttf`
- `Roboto.ttf`

Pada [renderer.py](file:///Users/iqbalpambudi/Project/cliper-pro/apps/api/app/services/renderer.py), pemanggilan filter video FFmpeg menambahkan argumen `fontsdir`:
```text
ass='path/to/subtitle.ass':fontsdir='path/to/fonts'
```
Hal ini menjamin bentuk tipografi dan metrik huruf 100% identik dengan font yang dimuat browser via CSS `@font-face`.

---

## 8. Fitur Editor & Interaksi Pengguna

### 8.1 Word Inspector & Transcript In-Place Editor
- Menampilkan daftar segmen narasi dan kata-kata hasil alignment beserta timestamp milidetik.
- Pengguna dapat mengoreksi kesalahan penulisan (typo), nama orang/istilah, mengganti kapitalisasi, atau menambahkan emoji spesifik pada kata tertentu tanpa perlu memproses ulang TTS.
- Pengguna dapat menggeser timing `start_ms` dan `end_ms` kata jika terjadi deviasi kecil pada pelafalan TTS.

### 8.2 Interactive Subtitle Timeline Track
- Track Subtitle pada Timeline Tab menampilkan blok-blok segmen narasi secara proporsional terhadap durasi video.
- Blok subtitle yang sedang aktif ditandai dengan highlight warna aksen.
- Pengguna dapat mengklik blok subtitle untuk langsung melompatkan playhead ke titik waktu tersebut.

### 8.3 Drag & Drop Subtitle Positioning
- Pengguna dapat menggeser posisi subtitle langsung di atas canvas video 9:16.
- Koordinat geser diubah secara proporsional ke nilai `offset_x` dan `offset_y` (basis 1080×1920) sehingga posisi pada video hasil render berada di titik yang persis sama.

### 8.4 Export Subtitle Multi-Format
- Dukungan ekspor ke format `.srt`, `.vtt`, dan `.ass` untuk kebutuhan multi-platform.

---

## 9. Preset Subtitle Bawaan

1. **Viral TikTok / Reels**:
   - Font: `Montserrat` (Bold, 56px, uppercase).
   - Warna: Teks putih (`#FFFFFF`), highlight kuning (`#FFE600`), outline hitam tebal (`5px`).
   - Mode: `per_word` dengan animasi pop scale.
2. **Alex Hormozi Punch**:
   - Font: `Bebas Neue` (Bold, 68px, uppercase).
   - Warna: Teks putih (`#FFFFFF`), highlight hijau cerah (`#00FF66`), box hitam (`#111111`, opacity 0.8), outline hitam (`6px`).
   - Mode: `burst` (2 kata per grup) di tengah layar (`position: center`).
3. **Minimalist Clean**:
   - Font: `Inter` (Normal, 44px).
   - Warna: Teks abu-abu terang (`#EEEEEE`), highlight biru langit (`#38BDF8`), outline tipis (`2px`), tanpa background box.
   - Mode: `full_sentence` di bagian bawah layar (`position: bottom`).
4. **Neon Glow**:
   - Font: `Poppins` (Bold, 54px, uppercase).
   - Warna: Teks putih (`#FFFFFF`), highlight magenta/cyan (`#FF007A`), outline gelap (`4px`).
   - Mode: `burst` (3 kata per grup) dengan glow highlight.

---

## 10. Rencana Verifikasi & Standar Kualitas

- **Kesesuaian Visual**: Tangkapan layar browser preview dan frame video render FFmpeg dibandingkan berdampingan. Deviasi posisi < 2px dan deviasi font 0%.
- **Ketepatan Sinkronisasi Kata**: Audio narasi dan teks subtitle diuji pada kecepatan bicara normal dan cepat. Kata yang di-highlight tidak boleh tertinggal atau mendahului ucapan narator (> 80ms).
- **Keamanan Transisi Mode**: Penggantian antar preset dan display mode (`per_word` ↔ `burst` ↔ `full_sentence`) berjalan mulus tanpa merusak timestamp dasar atau menyebabkan flickering teks.

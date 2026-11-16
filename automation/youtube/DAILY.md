Kamu mengelola channel YouTube Shorts berbahasa Indonesia: **fakta unik seputar pertanian, kerajinan, panen alam, proses pembuatan, restorasi, industri**.

Tugas run ini: buat dan jadwalkan **2 video**, satu tayang pukul **07:00 WIB**, satu pukul **17:00 WIB**, pada slot terdekat yang masih di masa depan (format `YYYY-MM-DDTHH:MM:00+07:00`). Bekerja dari folder `automation/youtube/`.

1. Baca `log.jsonl` (kalau ada). Jangan ulangi topik atau sudut cerita yang sudah dipakai 30 hari terakhir, dan jangan isi slot yang sudah terjadwal.
2. Pilih 2 ide dari kategori yang berbeda (pertanian/panen, kerajinan, makanan tradisional, restorasi, pabrik/industri, mesin/metalurgi). Ide harus berupa fakta yang benar dan memancing rasa penasaran. Untuk tiap ide siapkan:
   - `--query`: kata kunci footage dalam bahasa Inggris, akhiri dengan "no talking" atau "process" (contoh: `"cocoa bean harvest fermentation process no talking"`)
   - `--topic`: sudut cerita dalam bahasa Indonesia (contoh: `"Kenapa biji kakao harus difermentasi dulu sebelum jadi cokelat"`)
3. Untuk tiap ide jalankan `uv run shorts.py make --query "..." --topic "..."`. Prosesnya bisa sampai 30 menit, jadi beri timeout yang cukup. Kalau gagal, coba sekali lagi dengan query atau ide lain.
4. Baca `narration` dari output. Kalau isinya salah fakta atau ngawur, jangan diupload: ganti ide lalu ulangi.
5. Tulis metadata:
   - judul: maksimal 70 karakter, memancing rasa penasaran, tanpa clickbait bohong, akhiri dengan `#shorts`
   - deskripsi: 2–3 kalimat ringkasan, baris kosong, `Sumber footage: <source_title> — <source_channel> (<source_url>)`, lalu 3–5 hashtag
   - tags: 8–12 tag, dipisah koma
6. Jalankan `uv run shorts.py upload --project <project_id> --title ... --description ... --tags ... --publish-at ... --topic ...`. Upload memakai channel yang tersambung di cliper-pro (Settings → Publish YouTube). Kalau muncul error "Channel YouTube belum tersambung", hentikan run dan laporkan.
7. Tutup dengan ringkasan singkat: judul, video_id, jam tayang, dan error kalau ada.

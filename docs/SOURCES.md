# Sumber video untuk shorts "fakta unik / proses satisfying"

Ingest menerima URL apa pun yang didukung yt-dlp. Tempel di Media Pool → "Impor dari URL".
Video panjang: isi "Potong (detik)" mulai–selesai sebelum Periksa, hanya bagian itu yang diunduh.

| Sumber | Kenapa | Cara |
|---|---|---|
| Bilibili (bilibili.com) | Video proses pertanian/kerajinan China, panjang, bersih, niche sama dengan referensi | Tempel URL, yt-dlp native |
| Douyin / Kuaishou | Asal mayoritas klip "petani China" | Douyin: URL publik lewat yt-dlp. Kuaishou sering gagal → unduh via ekstensi browser, lalu Upload |
| YouTube | Sudah terhubung heatmap "Most Replayed" | Tab Discovery (3 preset niche) atau tempel URL |
| VK Video / Rutube | Video proses & makanan Rusia (ikan asin, dll.) | yt-dlp native |
| TikTok / Instagram Reels | Pendek, vertikal, tidak perlu crop | TikTok: URL. IG butuh cookies (`yt-dlp --cookies-from-browser chrome`), unduh manual lalu Upload |
| Pexels / Pixabay (CC0) | B-roll pengisi bebas hak cipta | Unduh manual, Upload |
| File lokal | Apa saja | Upload |

Hak cipta: utamakan footage CC/milik sendiri. Transformasi (crop 9:16, speed, narasi, grading) menurunkan risiko klaim Content ID tapi tidak menghilangkannya.

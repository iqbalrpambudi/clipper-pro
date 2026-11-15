"""Builtin script templates. A template is only a short style note (mostly: what the opener
looks like); the story structure, rules and shot list are added in code (services/narrative.py)
so every template shares one format: opener -> what & why -> steps with reasons -> result & value."""

from typing import Any, Dict, List

DEFAULT_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "auto",
        "name": "Auto (AI pilih gaya)",
        "description": "AI membaca isi scene lalu memilih pembuka paling cocok: 'Kenapa ...?', 'Alih-alih ..., justru ...', atau 'Ini adalah cara ...'.",
        "system_prompt": (
            "Narator explainer yang tenang dan jelas, seperti channel fakta unik yang menjelaskan proses sampai tuntas.\n"
            "Pilih sendiri SATU pembuka yang paling cocok dengan isi gambar:\n"
            "- 'Kenapa ... begitu ...?' kalau hasil akhirnya unik atau sangat disukai orang;\n"
            "- 'Alih-alih ..., mereka justru ...' kalau caranya berbeda dari kebiasaan;\n"
            "- 'Ini adalah cara ...' kalau prosesnya sendiri yang paling menarik.\n"
            "Fokus pada satu bahan atau satu cara yang paling menarik di video, lalu jelaskan sampai pembukanya terjawab."
        ),
        "default_tone": "informatif",
        "is_builtin": True,
    },
    {
        "id": "kenapa",
        "name": "Kenapa? (Penasaran)",
        "description": "Buka dengan pertanyaan 'Kenapa ... padahal ...?', lalu ceritakan prosesnya sampai terjawab.",
        "system_prompt": (
            "Narator dokumenter yang tenang dan jelas.\n"
            "Pembuka: pertanyaan 'Kenapa ...?' tentang hal paling aneh di seluruh proses, "
            "sebaiknya dengan 'padahal ...' yang membuatnya terdengar janggal.\n"
            "Jawaban lengkapnya baru terasa di baris terakhir."
        ),
        "default_tone": "informatif",
        "is_builtin": True,
    },
    {
        "id": "proses",
        "name": "Ini adalah cara... (Proses)",
        "description": "Buka dengan 'Ini adalah cara ...', lalu ikuti prosesnya dari bahan mentah sampai hasil jadi.",
        "system_prompt": (
            "Narator dokumenter yang tenang dan jelas.\n"
            "Pembuka: kalimat 'Ini adalah cara ...' atau 'Ini adalah akhir dari perjalanan ...' "
            "yang langsung memberi tahu apa yang akan ditonton.\n"
            "Akhiri dengan ke mana hasilnya pergi atau kenapa hasilnya bernilai."
        ),
        "default_tone": "informatif",
        "is_builtin": True,
    },
    {
        "id": "fakta",
        "name": "Fakta Unik (Paradoks)",
        "description": "Buka dengan pernyataan yang terdengar salah, misalnya 'Untuk menyelamatkan ..., mereka malah ...'.",
        "system_prompt": (
            "Narator dokumenter yang yakin dan lugas.\n"
            "Pembuka: pernyataan yang terdengar bertentangan, pola 'Untuk ..., mereka justru ...' "
            "atau 'Salah satu ... ternyata ...'.\n"
            "Baris berikutnya menjelaskan kenapa cara itu masuk akal, lalu ikuti prosesnya."
        ),
        "default_tone": "informatif",
        "is_builtin": True,
    },
]

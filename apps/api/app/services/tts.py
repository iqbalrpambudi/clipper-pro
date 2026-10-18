import asyncio
import base64
import json
import logging
import re
import time
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
import edge_tts
import httpx
from app.core.config import get_settings
from app.schemas.tts import VoiceInfo, CostEstimateResponse
from app.services.scene_detector import get_video_metadata

async def get_audio_duration(file_path: str) -> float:
    """Accurately probe audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    try:
        return round(float(stdout.decode().strip()), 3)
    except Exception:
        return 0.0

log = logging.getLogger(__name__)


class ElevenLabsCharacterLimitError(RuntimeError):
    """Raised when an ElevenLabs request exceeds the model or tier character limit."""
    pass

ELEVENLABS_VOICE_MAP: Dict[str, str] = {
    "adam": "pNInz6obpgDQGcFmaJgB",
    "rachel": "21m00Tcm4TlvDq8ikWAM",
    "antoni": "ErXwobaYiN019PkySvjV",
    "bella": "EXAVITQu4vr4xnSDxMaL",
    "josh": "TxGEqnHWrfWFTfGW9XjX",
    "arnold": "VR6AewLTigWG4xSOukaG",
    "brian": "nPczCjzI2devNBz1zQrb",
    "daniel": "onwK4e9ZLuTAKqWW03F9",
    "lily": "pFZP5JQG7iQjIQuC4Bku",
    "george": "JBFqnCBsd6RMkjVDRZzb",
    "charlie": "IKne3meq5aSn9XLyUdCD",
    "alice": "Xb7hH8MSUJpSbSDYk0k2",
    "bill": "pqHfZKP75CvOlQylNhV4",
    "liam": "TX3LPaxmHKxFdv7VOQHJ",
    "sam": "yoZ06aMxZJJ28mfd3POQ",
    "callum": "N2lVS1w4EtoT3dr4eOWO",
    "charlotte": "XB0fDUnXU5powFXDhCwa",
    "matilda": "XrExE9yKIg1WjnnlVkGX",
    "domi": "AZnzlk1XvdvUeBnXmlld",
    "elli": "MF3mGyEYCl7XYWbV9V6O",
}

AVAILABLE_VOICES: List[VoiceInfo] = [
    # =========================================================================
    # 1. Google Gemini Multimodal Voices (Full 30 Voice Catalog)
    # =========================================================================
    VoiceInfo(
        id="Puck",
        name="Puck (Gemini)",
        provider="gemini",
        gender="Neutral",
        sample_text="Tahukah kamu, fakta mengejutkan ini bakal bikin kamu tercengang!",
        sample_audio_url=None,
        description="Energetik, bersahabat, sangat cocok untuk konten viral & fakta unik.",
    ),
    VoiceInfo(
        id="Charon",
        name="Charon (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Semua bermula ketika rahasia besar ini akhirnya terungkap ke publik.",
        sample_audio_url=None,
        description="Suara berat, karismatik, ideal untuk storytelling dramatis dan misteri.",
    ),
    VoiceInfo(
        id="Kore",
        name="Kore (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Tiga rahasia penting ini akan mengubah cara pandangmu selamanya.",
        sample_audio_url=None,
        description="Hangat, ramah, artikulatif untuk konten tips dan edukasi.",
    ),
    VoiceInfo(
        id="Fenrir",
        name="Fenrir (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Jangan pernah lakukan kesalahan fatal ini kalau kamu mau berhasil!",
        sample_audio_url=None,
        description="Tegas, berwibawa, sangat pas untuk konten motivasi & punchy hooks.",
    ),
    VoiceInfo(
        id="Aoede",
        name="Aoede (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Pernahkah kamu membayangkan hal luar biasa ini bisa terjadi di dunia nyata?",
        sample_audio_url=None,
        description="Ekspresif, santai, memikat untuk cerita visual dan lifestyle.",
    ),
    VoiceInfo(
        id="Leda",
        name="Leda (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Halo semuanya! Hari ini kita bakal bahas hal super seru yang wajib kamu tonton.",
        sample_audio_url=None,
        description="Ceria, bersemangat, sangat cocok untuk video santai dan edukasi modern.",
    ),
    VoiceInfo(
        id="Orus",
        name="Orus (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Simak analisa mendalam berikut untuk memahami apa yang sebenarnya terjadi.",
        sample_audio_url=None,
        description="Percaya diri, elegan, sangat cocok untuk dokumenter dan narasi ulasan.",
    ),
    VoiceInfo(
        id="Enceladus",
        name="Enceladus (Gemini)",
        provider="gemini",
        gender="Neutral",
        sample_text="Tarik nafas perlahan, dan nikmati momen berharga dalam perjalanan ini.",
        sample_audio_url=None,
        description="Lembut, menenangkan, ideal untuk vlog perjalanan & relaksasi.",
    ),
    VoiceInfo(
        id="Zephyr",
        name="Zephyr (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Selamat pagi teman-teman! Hari ini penuh dengan kesempatan luar biasa.",
        sample_audio_url=None,
        description="Ringan, cerah, optimis, sangat pas untuk opening video edukatif.",
    ),
    VoiceInfo(
        id="Jupiter",
        name="Jupiter (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Inilah momen sejarah agung yang menentukan masa depan peradaban dunia.",
        sample_audio_url=None,
        description="Kuat, megah, berwibawa tinggi untuk narasi epik dan sejarah.",
    ),
    VoiceInfo(
        id="Callisto",
        name="Callisto (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Di balik tabir kegelapan, tersimpan teka-teki kuno yang belum terpecahkan.",
        sample_audio_url=None,
        description="Misterius, tenang, mendalam untuk genre horor & investigasi kriminal.",
    ),
    VoiceInfo(
        id="Io",
        name="Io (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Kalian pasti penasaran kan kenapa tren ini mendadak meledak di internet?",
        sample_audio_url=None,
        description="Lincah, antusias, vokal tinggi sangat cocok untuk YouTube Shorts & Reels.",
    ),
    VoiceInfo(
        id="Europa",
        name="Europa (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Sentuhan lembut kebaikan ini membuktikan bahwa harapan selalu ada.",
        sample_audio_url=None,
        description="Hangat, lembut, tulus untuk cerita inspiratif dan kisah haru.",
    ),
    VoiceInfo(
        id="Ganymede",
        name="Ganymede (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Santai saja bro, kita bakal kupas tuntas semuanya step by step sampai paham.",
        sample_audio_url=None,
        description="Kasual, santai, pembawaan sahabat dekat untuk podcast & review gadget.",
    ),
    VoiceInfo(
        id="Titan",
        name="Titan (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Eksplorasi ke sudut terjauh alam semesta ini memicu revolusi ilmu pengetahuan.",
        sample_audio_url=None,
        description="Berat, tebal, menggelegar untuk sains, ruang angkasa, dan teknologi.",
    ),
    VoiceInfo(
        id="Oberon",
        name="Oberon (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Setiap babak kehidupan menyimpan drama yang tak terduga bagi para pelakunya.",
        sample_audio_url=None,
        description="Teatrikal, artikulatif, gaya pencerita novel klasik dan drama.",
    ),
    VoiceInfo(
        id="Miranda",
        name="Miranda (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Bagaimana jadinya kalau ide gila ini benar-benar diuji coba sekarang?",
        sample_audio_url=None,
        description="Dinamis, penuh rasa ingin tahu, sangat cocok untuk eksperimen seru.",
    ),
    VoiceInfo(
        id="Ariel",
        name="Ariel (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Ayo kita mulai petualangan seru hari ini bersama-sama tanpa ragu!",
        sample_audio_url=None,
        description="Ekspresif, ramah, interaktif untuk animasi dan konten ramah keluarga.",
    ),
    VoiceInfo(
        id="Umbriel",
        name="Umbriel (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Merenungi jejak langkah masa lalu memberikan kita kebijaksanaan baru.",
        sample_audio_url=None,
        description="Tenang, reflektif, berbobot untuk renungan filosofis dan biografi.",
    ),
    VoiceInfo(
        id="Titania",
        name="Titania (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Keanggunan karya seni ini memukau setiap pasang mata yang memandangnya.",
        sample_audio_url=None,
        description="Anggun, berkelas, elegan untuk konten budaya, seni, dan kemewahan.",
    ),
    VoiceInfo(
        id="Dione",
        name="Dione (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Dengarkan alunan cerita ini untuk mengantarmu ke dalam ketenangan batin.",
        sample_audio_url=None,
        description="Lembut, artikulatif, manis untuk dongeng tidur dan meditasi.",
    ),
    VoiceInfo(
        id="Rhea",
        name="Rhea (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Pengalaman hidup mengajarkan kita bahwa kesabaran selalu berbuah manis.",
        sample_audio_url=None,
        description="Matang, mengayomi, menenangkan untuk parenting & nasihat bijak.",
    ),
    VoiceInfo(
        id="Iapetus",
        name="Iapetus (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Hutan belantara ini telah menjadi saksi bisu perjuangan manusia bertahan hidup.",
        sample_audio_url=None,
        description="Suara serak berkarakter, narator ekspedisi survival dan alam liar.",
    ),
    VoiceInfo(
        id="Hyperion",
        name="Hyperion (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Laporan berita terkini langsung dari pusat perekonomian dunia hari ini.",
        sample_audio_url=None,
        description="Jernih, lugas, profesional ala presenter berita televisi nasional.",
    ),
    VoiceInfo(
        id="Phoebe",
        name="Phoebe (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Jangan lupa subscribe dan like video ini kalau kamu suka kontennya ya!",
        sample_audio_url=None,
        description="Ceria, penuh energi, bersemangat untuk gaming & konten vlogging.",
    ),
    VoiceInfo(
        id="Tethys",
        name="Tethys (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Air mengalir tenang membawa kedamaian bagi siapa saja yang mendengarnya.",
        sample_audio_url=None,
        description="Mengalir, tenang, damai untuk soundscape alam dan audio kesehatan.",
    ),
    VoiceInfo(
        id="Mimas",
        name="Mimas (Gemini)",
        provider="gemini",
        gender="Male",
        sample_text="Tunggu dulu, apa kamu sadar ada hal aneh di video barusan? Perhatikan lagi!",
        sample_audio_url=None,
        description="Playful, jenaka, unik untuk komedi santai dan tebak-tebakan.",
    ),
    VoiceInfo(
        id="Telesto",
        name="Telesto (Gemini)",
        provider="gemini",
        gender="Neutral",
        sample_text="Spesifikasi prosesor terbaru ini membawa efisiensi daya hingga empat puluh persen.",
        sample_audio_url=None,
        description="Artikulat, presisi, modern untuk dokumentasi teknis & teknologi.",
    ),
    VoiceInfo(
        id="Calypso",
        name="Calypso (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Setiap nada dari melodi ini menggambarkan keindahan alam nusantara.",
        sample_audio_url=None,
        description="Melodis, berirama manis untuk narasi puisi dan musikalisasi.",
    ),
    VoiceInfo(
        id="Pandora",
        name="Pandora (Gemini)",
        provider="gemini",
        gender="Female",
        sample_text="Ketika kotak rahasia itu terbuka, dunia tak akan pernah sama lagi.",
        sample_audio_url=None,
        description="Penuh intrik, ekspresif, memikat untuk thriller dan konspirasi.",
    ),

    # =========================================================================
    # 2. ElevenLabs Voices (Industry Gold Standard for Zero Tone Drift)
    # =========================================================================
    VoiceInfo(
        id="Adam",
        name="Adam (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Tahukah kamu, rahasia besar ini akan mengubah cara pandangmu selamanya.",
        sample_audio_url=None,
        description="Suara pria karismatik, hangat, berbobot. Standar emas narasi & dokumenter.",
    ),
    VoiceInfo(
        id="Rachel",
        name="Rachel (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Halo semuanya, selamat datang kembali di channel ini untuk tips menarik hari ini.",
        sample_audio_url=None,
        description="Suara wanita tenang, elegan, artikulasi super jernih untuk storytelling.",
    ),
    VoiceInfo(
        id="Brian",
        name="Brian (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Sebuah kisah luar biasa yang belum pernah diceritakan sebelumnya.",
        sample_audio_url=None,
        description="Suara pria berat, resonan, berwibawa tinggi untuk narasi dokumenter.",
    ),
    VoiceInfo(
        id="Lily",
        name="Lily (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Dengarkan cerita indah ini dan temukan inspirasi terbaik untuk harimu.",
        sample_audio_url=None,
        description="Suara wanita hangat, lembut, artikulatif untuk audiobook & storytelling.",
    ),
    VoiceInfo(
        id="Daniel",
        name="Daniel (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Perhatikan baik-baik setiap detail yang akan disampaikan berikut ini.",
        sample_audio_url=None,
        description="Aksen British tenang, otoritatif, berkelas untuk presentasi & ulasan berita.",
    ),
    VoiceInfo(
        id="Antoni",
        name="Antoni (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Jangan pernah lewatkan tiga langkah penting ini kalau mau sukses!",
        sample_audio_url=None,
        description="Suara pria dinamis, energetik, sangat alami untuk konten viral & modern.",
    ),
    VoiceInfo(
        id="Bella",
        name="Bella (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Fakta unik kali ini dijamin bakal bikin kamu geleng-geleng kepala!",
        sample_audio_url=None,
        description="Suara wanita ceria, hidup, dan ekspresif untuk konten tips & edukasi.",
    ),
    VoiceInfo(
        id="Josh",
        name="Josh (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Banyak orang belum tahu kalau trik sederhana ini terbukti berhasil.",
        sample_audio_url=None,
        description="Suara pria santai, kasual, pembawaan modern.",
    ),
    VoiceInfo(
        id="Arnold",
        name="Arnold (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Inilah investigasi mendalam mengenai peristiwa yang menghebohkan dunia.",
        sample_audio_url=None,
        description="Suara narator tegas, berwibawa, dramatis.",
    ),
    VoiceInfo(
        id="George",
        name="George (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Mari kita telusuri misteri sejarah yang tersembunyi selama berabad-abad.",
        sample_audio_url=None,
        description="Aksen British hangat, ramah, pembawa cerita dongeng & sejarah.",
    ),
    VoiceInfo(
        id="Charlie",
        name="Charlie (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Kalian wajib tahu hal ini sebelum memutuskan langkah berikutnya!",
        sample_audio_url=None,
        description="Suara pria santai, kasual, gaya percakapan akrab ala podcast.",
    ),
    VoiceInfo(
        id="Alice",
        name="Alice (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Informasi terkini dan analisis mendalam seputar dunia teknologi.",
        sample_audio_url=None,
        description="Suara wanita percaya diri, aksen British jernih untuk berita & ulasan.",
    ),
    VoiceInfo(
        id="Bill",
        name="Bill (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Pengalaman berharga ini menjadi pelajaran penting bagi kita semua.",
        sample_audio_url=None,
        description="Suara pria matang, terpercaya, bijaksana untuk biografi & refleksi.",
    ),
    VoiceInfo(
        id="Liam",
        name="Liam (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Yuk tonton video ini sampai habis karena ada tips spesial buat kalian!",
        sample_audio_url=None,
        description="Suara pria muda, energetik, sangat pas untuk TikTok & YouTube Shorts.",
    ),
    VoiceInfo(
        id="Sam",
        name="Sam (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Petualangan ekstrem ini menuntut fokus dan ketahanan fisik maksimal.",
        sample_audio_url=None,
        description="Suara pria dinamis dengan sedikit karakter serak alami, sangat kuat.",
    ),
    VoiceInfo(
        id="Callum",
        name="Callum (ElevenLabs)",
        provider="elevenlabs",
        gender="Male",
        sample_text="Musuh telah mendekat, bersiaplah untuk pertempuran penentuan ini!",
        sample_audio_url=None,
        description="Intens, dramatis, sangat cocok untuk trailer game dan aksi laga.",
    ),
    VoiceInfo(
        id="Charlotte",
        name="Charlotte (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Keindahan malam ini menyimpan rahasia manis yang tak terlupakan.",
        sample_audio_url=None,
        description="Feminin, memikat, ekspresif untuk storytelling karakter dan novel.",
    ),
    VoiceInfo(
        id="Matilda",
        name="Matilda (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Mari buka lembaran pertama dari petualangan luar biasa sang penjelajah.",
        sample_audio_url=None,
        description="Suara wanita hangat, kaya emosi untuk pembacaan buku cerita & sastra.",
    ),
    VoiceInfo(
        id="Domi",
        name="Domi (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Fokus pada tujuan utama dan jangan biarkan gangguan menghambat langkahmu.",
        sample_audio_url=None,
        description="Tegas, percaya diri, berenergi tinggi untuk pesan motivasi bisnis.",
    ),
    VoiceInfo(
        id="Elli",
        name="Elli (ElevenLabs)",
        provider="elevenlabs",
        gender="Female",
        sample_text="Tips mudah ini bisa langsung kalian praktekkan di rumah sekarang juga!",
        sample_audio_url=None,
        description="Muda, alami, ramah untuk konten tutorial dan media sosial.",
    ),

    # =========================================================================
    # 3. Runware TTS Voices (Cost-effective, Ultra-Fast & Diverse Engines)
    # =========================================================================
    VoiceInfo(
        id="fishaudio:s2.1@pro",
        name="Fish Audio S2.1 Pro (Runware)",
        provider="runware",
        gender="Neutral",
        sample_text="Simak penjelasan mendalam ini untuk memahami apa yang sebenarnya terjadi.",
        sample_audio_url=None,
        description="Model S2.1 Pro ultra-natural TTS, artikulasi jernih, dan intonasi stabil.",
    ),
    VoiceInfo(
        id="alibaba:qwen3-tts-1.7b-customvoice",
        name="Alibaba Qwen3-TTS 1.7B (Runware)",
        provider="runware",
        gender="Female",
        sample_text="Tahukah kamu, penemuan sains terbaru ini membuka cakrawala baru bagi kita.",
        sample_audio_url=None,
        description="Model Qwen3 TTS 1.7B, aksen natural Asia/Indonesia & intonasi konsisten.",
    ),
    VoiceInfo(
        id="inworld:tts@2",
        name="Inworld Realtime TTS-2 (Runware)",
        provider="runware",
        gender="Male",
        sample_text="Semua bermula saat sebuah fenomena misterius terjadi tanpa peringatan.",
        sample_audio_url=None,
        description="Karakter vokal ekspresif & dialog dinamis untuk storytelling visual.",
    ),
    VoiceInfo(
        id="xai:tts@0",
        name="xAI TTS Grok (Runware)",
        provider="runware",
        gender="Neutral",
        sample_text="Analisis berbasis fakta ini memberikan perspektif baru yang tidak terduga.",
        sample_audio_url=None,
        description="Model xAI TTS ekspresif dengan artikulasi cerdas dan modulasi emosi modern.",
    ),
    VoiceInfo(
        id="minimax:speech@2.8",
        name="MiniMax Speech 2.8 (Runware)",
        provider="runware",
        gender="Male",
        sample_text="Dengarkan narasi ini dengan seksama untuk menemukan solusi terbaik.",
        sample_audio_url=None,
        description="High-realism voice synthesis dengan prosodi alami dan artikulasi tajam.",
    ),

    # =========================================================================
    # 4. Edge-TTS Voices (Free Local Fallback & Multi-Language Catalog)
    # =========================================================================
    VoiceInfo(
        id="id-ID-GadisNeural",
        name="Gadis (Edge ID)",
        provider="edge",
        gender="Female",
        sample_text="Simak fakta menarik berikut ini yang jarang diketahui banyak orang!",
        sample_audio_url=None,
        description="Pelafalan Bahasa Indonesia sangat natural, jernih, dan santai.",
    ),
    VoiceInfo(
        id="id-ID-ArdiNeural",
        name="Ardi (Edge ID)",
        provider="edge",
        gender="Male",
        sample_text="Berikut tiga hal penting yang wajib kamu ketahui sebelum terlambat.",
        sample_audio_url=None,
        description="Suara pria Indonesia yang jelas, profesional, dan meyakinkan.",
    ),
    VoiceInfo(
        id="en-US-JennyNeural",
        name="Jenny (Edge US)",
        provider="edge",
        gender="Female",
        sample_text="Welcome to today's video! Get ready to discover something truly amazing.",
        sample_audio_url=None,
        description="Aksen US wanita hangat, ramah, artikulasi sangat jelas untuk narasi umum.",
    ),
    VoiceInfo(
        id="en-US-GuyNeural",
        name="Guy (Edge US)",
        provider="edge",
        gender="Male",
        sample_text="Here is everything you need to know about the latest breakthrough.",
        sample_audio_url=None,
        description="Aksen US pria kasual, santai, pembawaan sahabat untuk podcast & ulasan.",
    ),
    VoiceInfo(
        id="en-US-AriaNeural",
        name="Aria (Edge US)",
        provider="edge",
        gender="Female",
        sample_text="This incredible discovery is changing the way we look at modern technology.",
        sample_audio_url=None,
        description="Ekspresif, dinamis, bersemangat untuk konten viral & berita teknologi.",
    ),
    VoiceInfo(
        id="en-US-ChristopherNeural",
        name="Christopher (Edge US)",
        provider="edge",
        gender="Male",
        sample_text="Deep inside the ancient ruins, an extraordinary truth was revealed.",
        sample_audio_url=None,
        description="Berat, otoritatif, suara penyiar profesional untuk dokumenter sejarah.",
    ),
    VoiceInfo(
        id="en-US-MichelleNeural",
        name="Michelle (Edge US)",
        provider="edge",
        gender="Female",
        sample_text="Step by step, we will guide you through this life-changing process.",
        sample_audio_url=None,
        description="Lembut, ramah, menyenangkan untuk video instruksional & edukasi.",
    ),
    VoiceInfo(
        id="en-US-EricNeural",
        name="Eric (Edge US)",
        provider="edge",
        gender="Male",
        sample_text="Let us explore the core reasons behind this remarkable transformation.",
        sample_audio_url=None,
        description="Percaya diri, santai, vokal pria muda untuk presentasi bisnis & review.",
    ),
    VoiceInfo(
        id="en-GB-SoniaNeural",
        name="Sonia (Edge UK)",
        provider="edge",
        gender="Female",
        sample_text="Good evening. Tonight we bring you an insightful look into modern innovation.",
        sample_audio_url=None,
        description="Aksen British wanita anggun, sopan, berkelas untuk konten formal & seni.",
    ),
    VoiceInfo(
        id="en-GB-RyanNeural",
        name="Ryan (Edge UK)",
        provider="edge",
        gender="Male",
        sample_text="This intriguing story began centuries ago in the heart of old London.",
        sample_audio_url=None,
        description="Aksen British pria ramah, pencerita ulung untuk kisah sejarah & dongeng.",
    ),
    VoiceInfo(
        id="en-AU-NatashaNeural",
        name="Natasha (Edge AU)",
        provider="edge",
        gender="Female",
        sample_text="G'day everyone! Today we are heading out to explore incredible wildlife.",
        sample_audio_url=None,
        description="Aksen Australia wanita ceria, ramah untuk travel vlog & dokumenter alam.",
    ),
    VoiceInfo(
        id="en-AU-WilliamNeural",
        name="William (Edge AU)",
        provider="edge",
        gender="Male",
        sample_text="Join us as we explore the vast landscapes and unique stories of the outback.",
        sample_audio_url=None,
        description="Aksen Australia pria tenang, jelas untuk konten petualangan & geografi.",
    ),
    VoiceInfo(
        id="ja-JP-NanamiNeural",
        name="Nanami (Edge JP)",
        provider="edge",
        gender="Female",
        sample_text="みなさん、こんにちは！今日の特別なトピックを一緒に見ていきましょう。",
        sample_audio_url=None,
        description="Bahasa Jepang wanita ceria, artikulasi lembut ala anime & vlogging.",
    ),
    VoiceInfo(
        id="ja-JP-KeitaNeural",
        name="Keita (Edge JP)",
        provider="edge",
        gender="Male",
        sample_text="本日の解説を始めます。最後までゆっくりお楽しみください。",
        sample_audio_url=None,
        description="Bahasa Jepang pria tenang, sopan untuk penjelasan mendalam & ulasan.",
    ),
]

for _v in AVAILABLE_VOICES:
    if _v.provider in ("gemini", "elevenlabs", "runware"):
        _v.language = "multi"
        _v.languages = ["id", "en"]
    elif _v.id.startswith("en-"):
        _v.language = "en"
        _v.languages = ["en"]
    elif _v.id.startswith("id-"):
        _v.language = "id"
        _v.languages = ["id"]
    elif _v.id.startswith("ja-"):
        _v.language = "ja"
        _v.languages = ["ja"]



def estimate_tts_cost(text: str, provider: str = "gemini") -> CostEstimateResponse:
    char_count = len(text)
    word_count = len(text.split())
    # Speech rate average ~ 14.5 chars/sec in Indonesian
    est_duration_sec = round(char_count / 14.5, 1)

    prov = provider.lower()
    if prov == "elevenlabs":
        rate_per_char = 0.00025  # ~ $0.25 - $0.30 per 1,000 characters
    elif prov == "runware":
        rate_per_char = 0.00005  # ~ $0.05 per 1,000 characters
    elif prov == "gemini":
        rate_per_char = 0.000004  # ~ $4 per 1M characters ($0.004 per 1k)
    else:
        rate_per_char = 0.0  # Edge-TTS is free

    est_cost = round(char_count * rate_per_char, 4)

    return CostEstimateResponse(
        char_count=char_count,
        word_count=word_count,
        estimated_duration_sec=est_duration_sec,
        estimated_cost_usd=est_cost,
        currency="USD",
        provider=provider,
    )


def _normalize_edge_rate(rate: Optional[str]) -> str:
    """Ensure Edge-TTS rate string format is signed like +10%, -10%, or +0%."""
    if not rate:
        return "+0%"
    r = rate.strip()
    if not r.endswith("%"):
        r = f"{r}%"
    if not r.startswith(("+", "-")):
        r = f"+{r}"
    return r


def _normalize_edge_pitch(pitch: Optional[str]) -> str:
    """Ensure Edge-TTS pitch string format is signed like +5Hz, -5Hz, or +0Hz."""
    if not pitch:
        return "+0Hz"
    p = pitch.strip()
    if not p.lower().endswith("hz"):
        p = f"{p}Hz"
    if not p.startswith(("+", "-")):
        p = f"+{p}"
    return p


async def generate_edge_tts(
    text: str,
    output_path: str,
    voice: str = "id-ID-GadisNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via Edge-TTS."""
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    norm_rate = _normalize_edge_rate(rate)
    norm_pitch = _normalize_edge_pitch(pitch)
    communicate = edge_tts.Communicate(text, voice=voice, rate=norm_rate, pitch=norm_pitch)
    await communicate.save(str(out_p))

    return await get_audio_duration(str(out_p))


def _build_audio_filter(rate: str = "+0%", pitch: str = "+0Hz", base_sample_rate: int = 24000) -> str:
    """Build FFmpeg audio filter string for rate (speed/tempo) and pitch adjustments."""
    def parse_rate(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().rstrip("%")
        try:
            if c.startswith(("+", "-")):
                return round(1.0 + (float(c) / 100.0), 3)
            val = float(c)
            if val > 5.0:
                return round(val / 100.0, 3)
            return val
        except Exception:
            return 1.0

    def parse_pitch(s: Optional[str]) -> float:
        if not s:
            return 1.0
        c = s.strip().lower()
        if "hz" in c:
            try:
                # 5Hz on fundamental pitch is ~5% pitch shift
                return round(1.0 + (float(c.replace("hz", "")) * 0.01), 4)
            except Exception:
                return 1.0
        elif "%" in c:
            try:
                return round(1.0 + (float(c.replace("%", "")) / 100.0), 4)
            except Exception:
                return 1.0
        elif "st" in c:
            try:
                st = float(c.replace("st", ""))
                return round(2.0 ** (st / 12.0), 4)
            except Exception:
                return 1.0
        return 1.0

    rate_factor = parse_rate(rate)
    pitch_factor = parse_pitch(pitch)

    filters = []
    if abs(pitch_factor - 1.0) > 0.001:
        new_sr = int(base_sample_rate * pitch_factor)
        filters.append(f"asetrate={new_sr}")
        comp_tempo = rate_factor / pitch_factor
    else:
        comp_tempo = rate_factor

    if abs(comp_tempo - 1.0) > 0.001:
        if 0.5 <= comp_tempo <= 2.0:
            filters.append(f"atempo={round(comp_tempo, 4)}")
        elif comp_tempo > 2.0:
            filters.append("atempo=2.0")
            filters.append(f"atempo={round(comp_tempo / 2.0, 4)}")
        elif comp_tempo < 0.5:
            filters.append("atempo=0.5")
            filters.append(f"atempo={round(comp_tempo / 0.5, 4)}")

    if abs(pitch_factor - 1.0) > 0.001:
        filters.append(f"aresample={base_sample_rate}")

    return ",".join(filters)


async def generate_gemini_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    model: str = "gemini-2.5-flash-preview-tts",
) -> float:
    """Generate audio via Gemini API multimodal audio endpoint (:generateContent) with rate & pitch tuning."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.GEMINI_API_KEY or "").strip() or (settings.AI_API_KEY or "").strip()

    if not key:
        raise RuntimeError("Gemini API Key belum dikonfigurasi. Silakan simpan Gemini API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    clean_model = (model or "gemini-2.5-flash-preview-tts").strip().removeprefix("models/")

    # Normalize voice name to Gemini prebuilt voice catalog
    voice_lookup = {
        "orpheus": "Orus",
        "orus": "Orus",
        "zephyr": "Enceladus",
        "zephyrus": "Enceladus",
        "enceladus": "Enceladus",
    }
    actual_voice = voice_lookup.get(voice.lower().strip(), voice.strip())

    # Supported multimodal audio TTS model candidates in priority order
    models_to_try = [clean_model]
    for m in [
        "gemini-2.5-flash-preview-tts",
        "gemini-3.8-flash-lite-tts",
        "gemini-3.8-flash-tts",
        "gemini-3.1-flash-tts-preview",
    ]:
        if m not in models_to_try:
            models_to_try.append(m)

    clean_text = " ".join(line.strip() for line in text.splitlines() if line.strip())

    # CRITICAL: Gemini TTS models read whatever text is in the parts directly.
    # Never add meta-prompt instructions or systemInstruction.
    # Do NOT pass temperature or maxOutputTokens: passing temperature causes Google API to hang or timeout,
    # while omitting them allows the audio decoder to stop naturally with finishReason: STOP.
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": clean_text
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": actual_voice,
                    }
                }
            },
        },
    }

    last_error_detail = ""
    for attempt_model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{attempt_model}:generateContent?key={key}"
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(url, json=payload)
                # If model rejects systemInstruction with HTTP 400, retry without it
                if resp.status_code == 400 and "systemInstruction" in payload:
                    fallback_payload = dict(payload)
                    fallback_payload.pop("systemInstruction", None)
                    resp = await client.post(url, json=fallback_payload)

                if resp.status_code in (429, 500, 503, 504):
                    err_json = {}
                    try:
                        err_json = resp.json()
                    except Exception:
                        pass
                    last_error_detail = err_json.get("error", {}).get("message") or resp.text
                    log.warning("Gemini TTS model %s returned HTTP %s (%s), trying next candidate...", attempt_model, resp.status_code, last_error_detail[:100])
                    await asyncio.sleep(1.0)
                    continue

                if resp.status_code != 200:
                    err_detail = resp.text
                    try:
                        err_json = resp.json()
                        err_detail = err_json.get("error", {}).get("message") or resp.text
                    except Exception:
                        pass
                    last_error_detail = f"HTTP {resp.status_code}: {err_detail}"
                    log.error("Gemini TTS API error HTTP %s (%s): %s", resp.status_code, attempt_model, err_detail[:300])
                    continue

                data = resp.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    prompt_feedback = data.get("promptFeedback") or {}
                    block_reason = prompt_feedback.get("blockReason") or "Tidak ada respons dari Gemini API"
                    last_error_detail = block_reason
                    continue

                parts = candidates[0].get("content", {}).get("parts", [])
                inline_data = None
                for part in parts:
                    if "inlineData" in part:
                        inline_data = part["inlineData"]
                        break

                if not inline_data or "data" not in inline_data:
                    finish_reason = candidates[0].get("finishReason") or "Tidak ada inline audio data"
                    last_error_detail = finish_reason
                    continue

                raw_bytes = base64.b64decode(inline_data["data"])
                mime_type = inline_data.get("mimeType", "")
                audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=24000)
                af_args = ["-af", audio_filter] if audio_filter else []

                # Gemini 3.8 TTS returns WAV (RIFF); 2.5/3.1 returns PCM.
                # Cleanly transcode to MP3 without destructive reverse silence trimming
                # so that every word and natural ending pause is preserved at full fidelity.
                is_wav = raw_bytes.startswith(b"RIFF") or "wav" in mime_type.lower()
                if is_wav:
                    cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
                elif "pcm" in mime_type.lower() or "l16" in mime_type.lower() or (
                    not raw_bytes.startswith(b"ID3")
                    and not raw_bytes.startswith(b"\xff\xfb")
                ):
                    # Raw PCM (24kHz 16-bit mono): feed with explicit format flags
                    cmd = [
                        "ffmpeg", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "-",
                        *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p),
                    ]
                else:
                    cmd = ["ffmpeg", "-y", "-i", "-", *af_args, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]

                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await proc.communicate(input=raw_bytes)
                if proc.returncode != 0:
                    raise RuntimeError(f"FFmpeg transcode failed: {stderr.decode()[:300]}")

                dur = await get_audio_duration(str(out_p))
                if dur <= 0.1:
                    log.warning("Generated audio duration too short (%.2fs) for %s, trying next candidate...", dur, attempt_model)
                    continue
                return dur
        except Exception as e:
            log.warning("Gemini TTS synthesis attempt failed for %s: %s", attempt_model, e)
            last_error_detail = str(e)

    raise RuntimeError(f"Gemini TTS gagal ({clean_model}): {last_error_detail}")


async def generate_elevenlabs_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    voice: str = "Adam",
    model: str = "eleven_multilingual_v2",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via ElevenLabs API with high stability (0.75) for 100% consistent persona & intonation."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.ELEVENLABS_API_KEY or "").strip()
    if not key:
        raise RuntimeError("ElevenLabs API Key belum dikonfigurasi. Silakan simpan ElevenLabs API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    voice_id = ELEVENLABS_VOICE_MAP.get(voice.lower().strip(), voice.strip())
    # If voice is short and not mapped, fallback to Adam
    if len(voice_id) < 10:
        voice_id = ELEVENLABS_VOICE_MAP.get("adam", "pNInz6obpgDQGcFmaJgB")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    model_id = (model or "eleven_multilingual_v2").strip()
    is_turbo_or_flash = "turbo" in model_id.lower() or "flash" in model_id.lower()
    voice_settings: Dict[str, Any] = {
        "stability": 0.85 if is_turbo_or_flash else 0.75,
        "similarity_boost": 0.85,
    }
    # ElevenLabs v4 architecture strictly accepts stability and similarity_boost.
    # style and use_speaker_boost are legacy parameters for v1/v2 models.
    if "v4" not in model_id.lower():
        voice_settings["style"] = 0.0
        voice_settings["use_speaker_boost"] = True

    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": voice_settings,
    }

    # Extended timeout for long single-pass generations (up to 10k or 40k chars)
    timeout_sec = 240.0 if len(text) > 5000 else 90.0
    async with httpx.AsyncClient(timeout=timeout_sec) as client:
        resp = await client.post(url, json=payload, headers=headers)
        if resp.status_code != 200:
            err_msg = resp.text
            detail_status = ""
            try:
                err_json = resp.json()
                detail = err_json.get("detail", {})
                if isinstance(detail, dict):
                    err_msg = detail.get("message") or err_json.get("error") or resp.text
                    detail_status = str(detail.get("status") or "")
                else:
                    err_msg = str(detail) or err_json.get("error") or resp.text
            except Exception:
                pass

            # Deteksi khusus jika response adalah error limit karakter / request size
            combined_err = f"{err_msg} {detail_status}".lower()
            char_limit_keywords = [
                "character limit", "too_large", "request_too_large",
                "max_characters", "maximum text length", "quota_exceeded",
                "exceeds the maximum", "characters allowed"
            ]
            if resp.status_code in (400, 413, 422) and any(k in combined_err for k in char_limit_keywords):
                raise ElevenLabsCharacterLimitError(
                    f"ElevenLabs Character Limit Terlampaui ({resp.status_code}): {err_msg}. "
                    f"Teks naskah melebihi kapasitas karakter per request model {model_id}."
                )

            raise RuntimeError(f"ElevenLabs TTS HTTP {resp.status_code}: {err_msg}")

        raw_bytes = resp.content
        if not raw_bytes or len(raw_bytes) < 100:
            raise RuntimeError("ElevenLabs TTS mengembalikan audio kosong.")

        audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=44100)
        if audio_filter:
            cmd = ["ffmpeg", "-y", "-i", "-", "-af", audio_filter, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate(input=raw_bytes)
            if proc.returncode != 0:
                out_p.write_bytes(raw_bytes)
        else:
            out_p.write_bytes(raw_bytes)

        return await get_audio_duration(str(out_p))


async def generate_runware_tts(
    text: str,
    output_path: str,
    api_key: Optional[str] = None,
    model: str = "fishaudio:s2.1@pro",
    voice: Optional[str] = None,
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> float:
    """Generate audio via Runware API (taskType: audioInference)."""
    settings = get_settings()
    key = (api_key or "").strip() or (settings.IMAGE_API_KEY or "").strip()
    if not key:
        raise RuntimeError("Runware API Key belum dikonfigurasi. Silakan simpan Runware API Key pada menu Pengaturan.")

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    url = "https://api.runware.ai/v1"
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    actual_model = model or "fishaudio:s2.1@pro"
    if actual_model in ("xai:tts", "xai"):
        actual_model = "xai:tts@0"
    elif actual_model in ("minimax:speech", "minimax:speech-2.8"):
        actual_model = "minimax:speech@2.8"

    task_payload: Dict[str, Any] = {
        "taskType": "audioInference",
        "taskUUID": str(uuid.uuid4()),
        "model": actual_model,
        "text": text,
        "positivePrompt": text,
        "outputType": "base64Data",
        "outputFormat": "MP3",
    }
    if voice and voice != actual_model and not voice.startswith(("http", "/")):
        task_payload["voice"] = voice

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=[task_payload], headers=headers)
        if resp.status_code != 200:
            raise RuntimeError(f"Runware TTS HTTP {resp.status_code}: {resp.text}")

        res_json = resp.json()
        data_items = res_json.get("data", [])
        if not data_items:
            errors = res_json.get("errors", [])
            err_msg = errors[0].get("message") if errors else resp.text
            raise RuntimeError(f"Runware TTS Error: {err_msg}")

        first = data_items[0]
        raw_bytes = None
        if first.get("base64Data"):
            raw_bytes = base64.b64decode(first["base64Data"])
        elif first.get("audioURL"):
            dl_resp = await client.get(first["audioURL"])
            if dl_resp.status_code == 200:
                raw_bytes = dl_resp.content

        if not raw_bytes:
            raise RuntimeError("Runware TTS tidak mengembalikan audio data.")

        audio_filter = _build_audio_filter(rate=rate, pitch=pitch, base_sample_rate=44100)
        if audio_filter:
            cmd = ["ffmpeg", "-y", "-i", "-", "-af", audio_filter, "-c:a", "libmp3lame", "-b:a", "192k", str(out_p)]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate(input=raw_bytes)
            if proc.returncode != 0:
                out_p.write_bytes(raw_bytes)
        else:
            out_p.write_bytes(raw_bytes)

        return await get_audio_duration(str(out_p))


async def test_tts_connection(
    provider: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    voice: Optional[str] = None,
) -> Dict[str, Any]:
    """Test connection and credentials for TTS provider (Gemini, ElevenLabs, Runware, Edge)."""
    clean_prov = provider.lower().strip()
    start_time = time.time()
    try:
        if clean_prov == "elevenlabs":
            key = (api_key or "").strip()
            if not key:
                settings = get_settings()
                key = (settings.ELEVENLABS_API_KEY or "").strip()
            if not key:
                return {
                    "success": False,
                    "provider_status": "Missing API Key",
                    "latency_ms": 0,
                    "message": "ElevenLabs API Key belum diisi.",
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get("https://api.elevenlabs.io/v1/user", headers={"xi-api-key": key})
                latency = int((time.time() - start_time) * 1000)
                if r.status_code == 200:
                    user_data = r.json()
                    sub = user_data.get("subscription", {})
                    char_count = sub.get("character_count", 0)
                    char_limit = sub.get("character_limit", 0)
                    tier = sub.get("tier", "standard")
                    return {
                        "success": True,
                        "provider_status": f"Connected ({tier.capitalize()})",
                        "latency_ms": latency,
                        "message": f"Koneksi ElevenLabs berhasil! Kuota karakter: {char_count:,} / {char_limit:,}.",
                    }
                else:
                    return {
                        "success": False,
                        "provider_status": f"HTTP {r.status_code}",
                        "latency_ms": latency,
                        "message": f"Koneksi ElevenLabs gagal: {r.text[:200]}",
                    }
        elif clean_prov == "runware":
            key = (api_key or "").strip()
            if not key:
                settings = get_settings()
                key = (settings.IMAGE_API_KEY or "").strip()
            if not key:
                return {
                    "success": False,
                    "provider_status": "Missing API Key",
                    "latency_ms": 0,
                    "message": "Runware API Key belum diisi.",
                }
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(
                    "https://api.runware.ai/v1",
                    json=[{"taskType": "authentication", "apiKey": key}],
                    headers={"Content-Type": "application/json"},
                )
                latency = int((time.time() - start_time) * 1000)
                if r.status_code == 200:
                    res_json = r.json()
                    errors = res_json.get("errors", [])
                    if errors:
                        return {
                            "success": False,
                            "provider_status": "Auth Error",
                            "latency_ms": latency,
                            "message": f"Autentikasi Runware gagal: {errors[0].get('message')}",
                        }
                    return {
                        "success": True,
                        "provider_status": "Connected (Runware TTS)",
                        "latency_ms": latency,
                        "message": "Koneksi Runware API berhasil terhubung!",
                    }
                else:
                    return {
                        "success": False,
                        "provider_status": f"HTTP {r.status_code}",
                        "latency_ms": latency,
                        "message": f"Koneksi Runware gagal: {r.text[:200]}",
                    }
        elif clean_prov == "gemini":
            key = (api_key or "").strip()
            if not key:
                settings = get_settings()
                key = (settings.GEMINI_API_KEY or "").strip() or (settings.AI_API_KEY or "").strip()
            if not key:
                return {
                    "success": False,
                    "provider_status": "Missing API Key",
                    "latency_ms": 0,
                    "message": "Gemini API Key belum diisi.",
                }
            tts_m = (model or "gemini-2.5-flash-preview-tts").strip().removeprefix("models/")
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models/{tts_m}?key={key}")
                latency = int((time.time() - start_time) * 1000)
                if r.status_code == 200:
                    return {
                        "success": True,
                        "provider_status": f"Connected ({tts_m})",
                        "latency_ms": latency,
                        "message": f"Koneksi Gemini TTS ({tts_m}) berhasil!",
                    }
                else:
                    return {
                        "success": False,
                        "provider_status": f"HTTP {r.status_code}",
                        "latency_ms": latency,
                        "message": f"Gagal validasi model Gemini TTS: {r.text[:200]}",
                    }
        else:  # edge
            return {
                "success": True,
                "provider_status": "Ready (Edge-TTS)",
                "latency_ms": 10,
                "message": "Edge-TTS Natural Indonesian siap digunakan (Gratis).",
            }
    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "provider_status": "Error",
            "latency_ms": latency,
            "message": f"Gagal tes koneksi TTS: {str(e)}",
        }


async def get_or_generate_voice_sample(
    provider: str = "gemini",
    voice: str = "Puck",
    model: str = "gemini-2.5-flash-preview-tts",
    api_key: Optional[str] = None,
    force_refresh: bool = False,
    language: Optional[str] = None,
) -> Path:
    """Generate or return cached 2-3s sample audio for the specified voice."""
    settings = get_settings()
    storage_base = Path(settings.STORAGE_PATH)
    cache_dir = storage_base / "cache" / "voice_samples"
    cache_dir.mkdir(parents=True, exist_ok=True)

    clean_prov = re.sub(r"[^\w\-]", "", provider.lower())
    clean_voice = re.sub(r"[^\w\-]", "", voice)
    clean_model = re.sub(r"[^\w\-]", "", model.lower()) if clean_prov in ("gemini", "elevenlabs", "runware") else ""
    target_lang = (language or ("en" if voice.startswith("en-") else "id")).strip().lower()
    suffix = f"_{clean_model}" if clean_model else ""
    sample_path = cache_dir / f"sample_{clean_prov}{suffix}_{clean_voice}_{target_lang}.mp3"

    if not force_refresh and sample_path.exists() and sample_path.stat().st_size > 1000:
        return sample_path

    # Find matching sample text
    if target_lang == "en":
        sample_text = "Welcome! This incredible story will completely change the way you see the world."
    else:
        sample_text = "Tahukah kamu, fakta mengejutkan ini bakal bikin kamu tercengang!"

    for v in AVAILABLE_VOICES:
        if v.id == voice or (v.provider == clean_prov and v.name.lower().startswith(voice.lower())):
            if target_lang == "en" and v.id.startswith("en-"):
                sample_text = v.sample_text
            elif target_lang != "en" and not v.id.startswith("en-"):
                sample_text = v.sample_text
            elif v.id.startswith("ja-"):
                sample_text = v.sample_text
            break

    if clean_prov == "elevenlabs":
        await generate_elevenlabs_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            model=model or "eleven_multilingual_v2",
        )
    elif clean_prov == "runware":
        await generate_runware_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            model=model or "fishaudio:s2.1@pro",
        )
    elif clean_prov == "gemini":
        await generate_gemini_tts(
            sample_text,
            str(sample_path),
            api_key=api_key,
            voice=voice,
            rate="+0%",
            pitch="+0Hz",
            model=model,
        )
    else:
        await generate_edge_tts(
            sample_text,
            str(sample_path),
            voice=voice,
        )

    return sample_path


def _split_text_for_tts(text: str, max_chars: int = 850) -> List[str]:
    """Split script into TTS-safe chunks at sentence/paragraph boundaries (~<=max_chars each).

    Uses a balanced chunk budget (default 850 chars ~ 50-60s audio) to keep LLM multimodal audio
    generation within reliable token limits while maintaining consistent intonation and minimizing
    the number of API requests. Guarantees each intermediate chunk ends with clean terminal
    punctuation (. ! ?) so Gemini TTS does not produce hanging pitch artifacts.
    """
    text = text.strip()
    if not text:
        return []

    paragraphs = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    raw_units: List[str] = []

    for p in paragraphs:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", p) if s.strip()]
        for s in sentences:
            if len(s) <= max_chars:
                raw_units.append(s)
            else:
                # If a single sentence exceeds max_chars, split on clauses
                clauses = [c.strip() for c in re.split(r"(?<=[,;:])\s+", s) if c.strip()]
                cur_clause = ""
                for c in clauses:
                    if cur_clause and len(cur_clause) + len(c) + 1 > max_chars:
                        raw_units.append(cur_clause)
                        cur_clause = c
                    else:
                        cur_clause = f"{cur_clause} {c}".strip() if cur_clause else c
                if cur_clause:
                    raw_units.append(cur_clause)

    chunks: List[str] = []
    cur = ""
    for unit in raw_units:
        if not unit:
            continue
        separator = " " if cur else ""
        if cur and len(cur) + len(separator) + len(unit) > max_chars:
            chunks.append(cur)
            cur = unit
        else:
            cur = f"{cur}{separator}{unit}".strip()

    if cur:
        chunks.append(cur)

    # Ensure non-final chunks end with clean terminal punctuation (. ! ?)
    # to avoid awkward rising or truncated pitch at chunk boundaries
    cleaned_chunks: List[str] = []
    for i, chk in enumerate(chunks):
        c = chk.strip()
        if i < len(chunks) - 1 and not c.endswith((".", "!", "?", "…")):
            c = f"{c}."
        cleaned_chunks.append(c)

    return cleaned_chunks

async def _concat_mp3s(part_paths: List[str], output_path: str) -> float:
    """Concatenate mp3 parts via ffmpeg concat demuxer with EBU R128 loudness leveling."""
    list_file = Path(output_path).with_suffix(".concat.txt")
    list_file.write_text("".join(f"file '{p}'\n" for p in part_paths), encoding="utf-8")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a", "libmp3lame", "-b:a", "192k", output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            # Fallback without loudnorm if audio is too short or filter fails
            proc2 = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
                "-c:a", "libmp3lame", "-b:a", "192k", output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr2 = await proc2.communicate()
            if proc2.returncode != 0:
                raise RuntimeError(f"FFmpeg concat failed: {stderr2.decode()[:300]}")
    finally:
        list_file.unlink(missing_ok=True)
    return await get_audio_duration(output_path)

async def generate_speech_audio(
    text: str,
    output_path: str,
    provider: str = "gemini",
    voice: str = "Puck",
    rate: str = "+0%",
    pitch: str = "+0Hz",
    api_key: Optional[str] = None,
    model: str = "gemini-2.5-flash-preview-tts",
    segments: Optional[List[Dict[str, Any]]] = None,
    fallback_info: Optional[Dict[str, Any]] = None,
    fallback_enabled: bool = True,
    language: Optional[str] = "id",
) -> float:
    """Entrypoint for TTS audio generation.

    Supports Gemini, ElevenLabs, Runware, and Edge-TTS.
    - ElevenLabs: Industry benchmark for zero tone drift. Handles single-pass generation up to 4,500 chars (5-6 mins).
    - Runware TTS: Ultra-fast & cost-effective (Fish Audio / Qwen3 TTS). Single-pass up to 1,200 chars.
    - Gemini TTS: High-fidelity multimodal audio. Single-pass extended up to 2,200 chars (~2.5 mins) to prevent intonation drift.
    - Edge-TTS: Free Indonesian neural speech fallback.

    If fallback_enabled is True, any quota/API error will cleanly fallback to Edge-TTS.
    If fallback_enabled is False, errors will be raised immediately.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        raise ValueError("Teks narasi tidak boleh kosong.")

    prov = provider.lower().strip()

    target_lang = (language or "id").strip().lower()

    # 1. ELEVENLABS TTS (KHUSUS ELEVENLABS: Gunakan limit kapasitas maksimal per arsitektur model)
    if prov == "elevenlabs":
        try:
            m_id = (model or "eleven_multilingual_v2").lower().strip()
            # Batas kapasitas resmi per model ElevenLabs API (maximum_text_length_per_request):
            # - Model v2.5 Flash / Turbo (eleven_flash_v2_5, eleven_turbo_v2_5): limit 40.000 karakter (~35-40 mnt audio)
            # - Model v4 / v4 Turbo / Multilingual v2 / Standard: limit 10.000 karakter (~10-12 mnt audio)
            # Naskah 8 menit (~7.500 karakter) akan tetap dikirim utuh 1x di SEMUA model ini tanpa chunking.
            if ("flash_v2_5" in m_id or "turbo_v2_5" in m_id or "flash" in m_id) and "v4" not in m_id:
                eleven_max_chars = 40000
                chunk_size = 38000
            else:
                eleven_max_chars = 10000
                chunk_size = 9500

            if len(clean_text) <= eleven_max_chars:
                return await generate_elevenlabs_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    model=model or "eleven_multilingual_v2",
                    rate=rate,
                    pitch=pitch,
                )

            # For extraordinarily long texts exceeding model capacity (>10,000 or >40,000 chars)
            chunks = _split_text_for_tts(clean_text, max_chars=chunk_size)
            if len(chunks) == 1:
                return await generate_elevenlabs_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    model=model or "eleven_multilingual_v2",
                    rate=rate,
                    pitch=pitch,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_elevenlabs_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            voice=voice,
                            model=model or "eleven_multilingual_v2",
                            rate=rate,
                            pitch=pitch,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if not fallback_enabled:
                            if parts:
                                try:
                                    await _concat_mp3s(parts, output_path)
                                except Exception:
                                    pass
                            raise RuntimeError(
                                f"Sintesis ElevenLabs terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                            ) from chunk_err
                        raise
                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.3)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            # JIKA TERKENA LIMIT KARAKTER ELEVENLABS: JANGAN PERNAH FALLBACK KE TTS LAIN!
            # Langsung kembalikan error eksplisit agar pengguna mengetahui naskah melebihi kapasitas model ElevenLabs.
            err_str = str(e).lower()
            is_char_limit = (
                isinstance(e, ElevenLabsCharacterLimitError)
                or any(k in err_str for k in [
                    "character limit", "too_large", "request_too_large",
                    "max_characters", "maximum text length", "quota_exceeded",
                    "exceeds the maximum", "characters allowed"
                ])
            )
            if is_char_limit:
                log.error("ElevenLabs TTS melebihi batas karakter (fallback dicegah): %s", e)
                raise RuntimeError(
                    f"ElevenLabs Character Limit Exceeded: {e}"
                ) from e

            if not fallback_enabled:
                log.error("ElevenLabs TTS failed and fallback is disabled: %s", e)
                raise
            log.warning("ElevenLabs TTS failed (%s). Falling back to Edge-TTS...", e)
            edge_voice = "id-ID-ArdiNeural" if voice.lower() in ("adam", "antoni", "josh", "arnold") else "id-ID-GadisNeural"
            if fallback_info is not None:
                fallback_info["fell_back"] = True
                fallback_info["original_provider"] = "elevenlabs"
                fallback_info["fallback_provider"] = "edge"
                fallback_info["fallback_voice"] = edge_voice
                fallback_info["fallback_error"] = str(e)
            return await generate_edge_tts(clean_text, output_path, voice=edge_voice, rate=rate, pitch=pitch)

    # 2. RUNWARE TTS
    elif prov == "runware":
        try:
            if len(clean_text) <= 1200:
                return await generate_runware_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    model=model or "fishaudio:s2.1@pro",
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                )

            # For scripts > 1200 chars, split into ~900-char blocks
            chunks = _split_text_for_tts(clean_text, max_chars=900)
            if len(chunks) == 1:
                return await generate_runware_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    model=model or "fishaudio:s2.1@pro",
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_runware_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            model=model or "fishaudio:s2.1@pro",
                            voice=voice,
                            rate=rate,
                            pitch=pitch,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if not fallback_enabled:
                            if parts:
                                try:
                                    await _concat_mp3s(parts, output_path)
                                except Exception:
                                    pass
                            raise RuntimeError(
                                f"Sintesis Runware TTS terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                            ) from chunk_err
                        raise
                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.3)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            if not fallback_enabled:
                log.error("Runware TTS failed and fallback is disabled: %s", e)
                raise
            log.warning("Runware TTS failed (%s). Falling back to Edge-TTS...", e)
            if target_lang == "en":
                edge_voice = "en-US-GuyNeural" if ("male" in voice.lower() or "inworld" in voice.lower()) else "en-US-JennyNeural"
            else:
                edge_voice = "id-ID-ArdiNeural" if "male" in voice.lower() or "inworld" in voice.lower() else "id-ID-GadisNeural"
            if fallback_info is not None:
                fallback_info["fell_back"] = True
                fallback_info["original_provider"] = "runware"
                fallback_info["fallback_provider"] = "edge"
                fallback_info["fallback_voice"] = edge_voice
                fallback_info["fallback_error"] = str(e)
            return await generate_edge_tts(clean_text, output_path, voice=edge_voice, rate=rate, pitch=pitch)

    # 3. GEMINI TTS
    elif prov == "gemini":
        try:
            # Single-pass threshold extended up to 2,200 chars (~2.5 minutes)
            # to preserve identical intonation and tone throughout standard/medium narrations
            if len(clean_text) <= 2200:
                return await generate_gemini_tts(
                    clean_text,
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    model=model,
                )

            # Long-form narrations (> 2200 chars): split into balanced ~750-char blocks
            chunks = _split_text_for_tts(clean_text, max_chars=750)
            if len(chunks) == 1:
                return await generate_gemini_tts(
                    chunks[0],
                    output_path,
                    api_key=api_key,
                    voice=voice,
                    rate=rate,
                    pitch=pitch,
                    model=model,
                )

            out_p = Path(output_path)
            parts: List[str] = []
            try:
                for i, chunk in enumerate(chunks):
                    part_path = str(out_p.with_name(f"{out_p.stem}.part{i:03d}.mp3"))
                    try:
                        await generate_gemini_tts(
                            chunk,
                            part_path,
                            api_key=api_key,
                            voice=voice,
                            rate=rate,
                            pitch=pitch,
                            model=model,
                        )
                        parts.append(part_path)
                    except Exception as chunk_err:
                        if not fallback_enabled:
                            if parts:
                                try:
                                    await _concat_mp3s(parts, output_path)
                                except Exception as concat_err:
                                    log.warning("Failed to concat partial audio chunks: %s", concat_err)
                            raise RuntimeError(
                                f"Sintesis suara {provider.upper()} terhenti pada bagian {i+1}/{len(chunks)}: {chunk_err}"
                            ) from chunk_err
                        raise

                    if i < len(chunks) - 1:
                        await asyncio.sleep(0.5)

                return await _concat_mp3s(parts, output_path)
            finally:
                for p in parts:
                    Path(p).unlink(missing_ok=True)
        except Exception as e:
            if not fallback_enabled:
                log.error("TTS generation failed and fallback is disabled: %s", e)
                raise

            log.warning(
                "Gemini TTS synthesis failed (%s). Automatically falling back to Edge-TTS to guarantee audible speech...",
                e,
            )
            if target_lang == "en":
                edge_voice = "en-US-GuyNeural" if voice in ("Charon", "Fenrir", "Orus", "Mimas") else "en-US-JennyNeural"
            else:
                edge_voice = "id-ID-ArdiNeural" if voice in ("Charon", "Fenrir", "Orus") else "id-ID-GadisNeural"
            if fallback_info is not None:
                fallback_info["fell_back"] = True
                fallback_info["original_provider"] = "gemini"
                fallback_info["fallback_provider"] = "edge"
                fallback_info["fallback_voice"] = edge_voice
                fallback_info["fallback_error"] = str(e)

            return await generate_edge_tts(
                clean_text,
                output_path,
                voice=edge_voice,
                rate=rate,
                pitch=pitch,
            )

    # 4. EDGE-TTS
    else:
        try:
            edge_v = voice
            if target_lang == "en" and (edge_v in ("id-ID-GadisNeural", "id-ID-ArdiNeural", "default") or not edge_v.startswith("en-")):
                edge_v = "en-US-JennyNeural"
            elif target_lang != "en" and edge_v.startswith("en-") and edge_v in ("en-US-JennyNeural", "default"):
                edge_v = "id-ID-GadisNeural"
            return await generate_edge_tts(
                clean_text,
                output_path,
                voice=edge_v,
                rate=rate,
                pitch=pitch,
            )
        except Exception as e:
            log.error("Edge-TTS synthesis failed: %s", e)
            raise

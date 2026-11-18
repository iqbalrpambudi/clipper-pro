import time
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings


async def test_tts_connection(
    provider: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    voice: Optional[str] = None,
) -> Dict[str, Any]:
    """Test connection and credentials for TTS provider (Gemini, ElevenLabs)."""
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
                r = await client.get(
                    "https://api.elevenlabs.io/v1/user", headers={"xi-api-key": key}
                )
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
                r = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{tts_m}?key={key}"
                )
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
        else:
            return {
                "success": False,
                "provider_status": "Unknown",
                "latency_ms": 0,
                "message": f"Provider TTS tidak dikenal: {provider}",
            }
    except Exception as e:
        latency = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "provider_status": "Error",
            "latency_ms": latency,
            "message": f"Gagal tes koneksi TTS: {str(e)}",
        }

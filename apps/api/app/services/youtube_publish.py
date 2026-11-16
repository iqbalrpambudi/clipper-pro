"""YouTube Data API v3: OAuth (web client) + resumable upload, via plain httpx."""

from pathlib import Path
from typing import Awaitable, Callable, Optional
from urllib.parse import urlencode

import httpx

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]
CHUNK_SIZE = 8 * 1024 * 1024  # must be a multiple of 256 KiB


class YouTubeError(Exception):
    pass


def _google_error(resp: httpx.Response) -> YouTubeError:
    try:
        body = resp.json()
        err = body.get("error")
        msg = err.get("message") if isinstance(err, dict) else body.get("error_description") or err
    except ValueError:
        msg = resp.text[:300]
    return YouTubeError(f"Google API {resp.status_code}: {msg}")


def build_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",  # always return a refresh token, even on re-connect
        "include_granted_scopes": "true",
        "state": state,
    })


async def exchange_code(client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(TOKEN_URL, data={
            "code": code, "client_id": client_id, "client_secret": client_secret,
            "redirect_uri": redirect_uri, "grant_type": "authorization_code",
        })
    if resp.status_code != 200:
        raise _google_error(resp)
    return resp.json()


async def refresh_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(TOKEN_URL, data={
            "client_id": client_id, "client_secret": client_secret,
            "refresh_token": refresh_token, "grant_type": "refresh_token",
        })
    if resp.status_code != 200:
        raise _google_error(resp)
    return resp.json()["access_token"]


async def revoke_token(token: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(REVOKE_URL, data={"token": token})


async def get_my_channel(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(CHANNELS_URL, params={"part": "snippet", "mine": "true"},
                                headers={"Authorization": f"Bearer {access_token}"})
    if resp.status_code != 200:
        raise _google_error(resp)
    items = resp.json().get("items") or []
    if not items:
        raise YouTubeError("Akun Google ini belum punya channel YouTube")
    snippet = items[0]["snippet"]
    return {
        "id": items[0]["id"],
        "title": snippet.get("title", ""),
        "thumbnail": (snippet.get("thumbnails", {}).get("default") or {}).get("url"),
    }


async def upload_video(
    access_token: str,
    file_path: Path,
    metadata: dict,
    on_progress: Optional[Callable[[int], Awaitable[None]]] = None,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> str:
    """Resumable upload in CHUNK_SIZE pieces; returns the new video id."""
    size = file_path.stat().st_size
    auth = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=120, transport=transport) as client:
        init = await client.post(
            UPLOAD_URL,
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={**auth, "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": str(size)},
            json=metadata,
        )
        if init.status_code != 200 or "location" not in init.headers:
            raise _google_error(init)
        session_url = init.headers["location"]

        offset = 0
        with file_path.open("rb") as f:
            while True:
                f.seek(offset)
                chunk = f.read(CHUNK_SIZE)
                end = offset + len(chunk) - 1
                resp = await client.put(session_url, content=chunk, headers={
                    **auth, "Content-Range": f"bytes {offset}-{end}/{size}",
                })
                if resp.status_code in (200, 201):
                    if on_progress:
                        await on_progress(100)
                    return resp.json()["id"]
                if resp.status_code != 308:
                    raise _google_error(resp)
                # 308: server tells us how much it has; resume from there
                rng = resp.headers.get("range")
                offset = int(rng.split("-")[1]) + 1 if rng else 0
                if on_progress:
                    await on_progress(min(99, offset * 100 // size))

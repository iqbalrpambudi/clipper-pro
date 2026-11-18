import html
import logging
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal, get_db
from app.core.security import decrypt_secret, encrypt_secret, mask_secret
from app.core.tasks import run_background_task
from app.models.project import Project, RenderJob
from app.models.youtube import YouTubeAccount, YouTubeUpload
from app.schemas.youtube_publish import (
    YouTubeAccountStatus,
    YouTubeAuthStart,
    YouTubeCredentialsIn,
    YouTubePublishIn,
    YouTubeUploadResponse,
)
from app.services import youtube_publish as yt

log = logging.getLogger(__name__)

router = APIRouter(tags=["publish"])

# shortcut: OAuth state lives in process memory; a restart mid-login just means clicking "Hubungkan" again
_pending_states: set[str] = set()


async def _get_account(db: AsyncSession) -> YouTubeAccount | None:
    res = await db.execute(select(YouTubeAccount).limit(1))
    return res.scalar_one_or_none()


def _redirect_uri(request: Request) -> str:
    base = get_settings().PUBLIC_API_URL.rstrip("/")
    return base + request.app.url_path_for("youtube_oauth_callback")


def _status(acc: YouTubeAccount | None, request: Request) -> YouTubeAccountStatus:
    secret = decrypt_secret(acc.client_secret_encrypted) if acc else ""
    return YouTubeAccountStatus(
        configured=bool(acc and acc.client_id and secret),
        connected=bool(acc and acc.refresh_token_encrypted),
        client_id=acc.client_id if acc else None,
        client_secret_masked=mask_secret(secret) or None,
        redirect_uri=_redirect_uri(request),
        channel_id=acc.channel_id if acc else None,
        channel_title=acc.channel_title if acc else None,
        channel_thumbnail=acc.channel_thumbnail if acc else None,
        connected_at=acc.connected_at if acc else None,
    )


def _callback_page(ok: bool, message: str) -> HTMLResponse:
    color = "#16a34a" if ok else "#dc2626"
    return HTMLResponse(
        f"""<!doctype html><meta charset="utf-8"><title>YouTube</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px"><h2 style="color:{color}">{"Channel tersambung" if ok else "Gagal menyambungkan"}</h2>
<p>{html.escape(message)}</p><p style="color:#666">Jendela ini boleh ditutup.</p></div>
<script>if(window.opener){{window.opener.postMessage("youtube-oauth-done","*");setTimeout(()=>window.close(),1500)}}</script>""",
        status_code=200 if ok else 400,
    )


@router.get("/youtube/account", response_model=YouTubeAccountStatus)
async def get_youtube_account(request: Request, db: AsyncSession = Depends(get_db)):
    return _status(await _get_account(db), request)


@router.put("/youtube/account/credentials", response_model=YouTubeAccountStatus)
async def save_youtube_credentials(
    payload: YouTubeCredentialsIn, request: Request, db: AsyncSession = Depends(get_db)
):
    acc = await _get_account(db)
    if not acc:
        acc = YouTubeAccount()
        db.add(acc)
    client_id = payload.client_id.strip()
    if acc.client_id and acc.client_id != client_id:
        # Tokens belong to the old OAuth client and stop working with the new one
        acc.refresh_token_encrypted = None
        acc.channel_id = acc.channel_title = acc.channel_thumbnail = acc.connected_at = None
    acc.client_id = client_id
    if payload.client_secret and payload.client_secret.strip():
        acc.client_secret_encrypted = encrypt_secret(payload.client_secret.strip())
    if not acc.client_secret_encrypted:
        raise HTTPException(status_code=400, detail="Client secret wajib diisi")
    await db.commit()
    await db.refresh(acc)
    return _status(acc, request)


@router.post("/youtube/oauth/start", response_model=YouTubeAuthStart)
async def start_youtube_oauth(request: Request, db: AsyncSession = Depends(get_db)):
    acc = await _get_account(db)
    if not acc or not acc.client_id or not acc.client_secret_encrypted:
        raise HTTPException(
            status_code=400, detail="Isi Client ID & Client Secret di Settings dulu"
        )
    state = secrets.token_urlsafe(24)
    _pending_states.add(state)
    return YouTubeAuthStart(
        auth_url=yt.build_auth_url(acc.client_id, _redirect_uri(request), state)
    )


@router.get("/youtube/oauth/callback", name="youtube_oauth_callback", include_in_schema=False)
async def youtube_oauth_callback(request: Request, db: AsyncSession = Depends(get_db)):
    params = request.query_params
    if params.get("error"):
        return _callback_page(False, f"Google menolak akses: {params['error']}")
    state = params.get("state", "")
    if state not in _pending_states:
        return _callback_page(False, "Sesi login kedaluwarsa. Klik Hubungkan lagi.")
    _pending_states.discard(state)

    acc = await _get_account(db)
    if not acc or not acc.client_id:
        return _callback_page(False, "Kredensial OAuth belum disimpan.")
    try:
        tokens = await yt.exchange_code(
            acc.client_id,
            decrypt_secret(acc.client_secret_encrypted),
            params.get("code", ""),
            _redirect_uri(request),
        )
        if not tokens.get("refresh_token"):
            return _callback_page(
                False, "Google tidak mengirim refresh token. Coba hubungkan ulang."
            )
        channel = await yt.get_my_channel(tokens["access_token"])
    except yt.YouTubeError as e:
        return _callback_page(False, str(e))

    acc.refresh_token_encrypted = encrypt_secret(tokens["refresh_token"])
    acc.channel_id = channel["id"]
    acc.channel_title = channel["title"]
    acc.channel_thumbnail = channel["thumbnail"]
    acc.connected_at = datetime.utcnow()
    await db.commit()
    return _callback_page(True, f"Cliper Pro sekarang bisa upload ke channel {channel['title']}.")


@router.delete("/youtube/account/connection", response_model=YouTubeAccountStatus)
async def disconnect_youtube(request: Request, db: AsyncSession = Depends(get_db)):
    acc = await _get_account(db)
    if acc and acc.refresh_token_encrypted:
        try:
            await yt.revoke_token(decrypt_secret(acc.refresh_token_encrypted))
        except Exception as e:  # revoke is best effort; local disconnect must still happen
            log.warning("YouTube token revoke failed: %s", e)
        acc.refresh_token_encrypted = None
        acc.channel_id = acc.channel_title = acc.channel_thumbnail = acc.connected_at = None
        await db.commit()
    return _status(acc, request)


@router.get("/projects/{project_id}/publish/youtube", response_model=List[YouTubeUploadResponse])
async def list_youtube_uploads(project_id: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(YouTubeUpload)
        .where(YouTubeUpload.project_id == project_id)
        .order_by(YouTubeUpload.created_at.desc())
    )
    return res.scalars().all()


@router.post("/projects/{project_id}/publish/youtube", response_model=YouTubeUploadResponse)
async def publish_to_youtube(
    project_id: str, payload: YouTubePublishIn, db: AsyncSession = Depends(get_db)
):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project tidak ditemukan")
    acc = await _get_account(db)
    if not acc or not acc.refresh_token_encrypted:
        raise HTTPException(status_code=400, detail="Channel YouTube belum tersambung")

    if payload.render_job_id:
        job = await db.get(RenderJob, payload.render_job_id)
    else:
        res = await db.execute(
            select(RenderJob)
            .where(
                RenderJob.project_id == project_id,
                RenderJob.render_type == "final",
                RenderJob.status == "completed",
            )
            .order_by(RenderJob.created_at.desc())
            .limit(1)
        )
        job = res.scalar_one_or_none()
    if not job or job.project_id != project_id or job.status != "completed":
        raise HTTPException(status_code=400, detail="Belum ada video final yang selesai di-render")
    if not job.output_file_path or not Path(job.output_file_path).exists():
        raise HTTPException(status_code=400, detail="File video hasil render tidak ditemukan")

    upload = YouTubeUpload(
        project_id=project_id,
        render_job_id=job.id,
        title=payload.title,
        description=payload.description,
        tags=payload.tags,
        privacy=payload.privacy,
        # SQLite drops tzinfo, so persist naive UTC like the other timestamps
        publish_at=payload.publish_at.astimezone(timezone.utc).replace(tzinfo=None)
        if payload.publish_at
        else None,
    )
    db.add(upload)
    await db.commit()
    await db.refresh(upload)
    run_background_task(_upload_job, upload.id)
    return upload


async def _upload_job(upload_id: str) -> None:
    async with SessionLocal() as db:
        upload = await db.get(YouTubeUpload, upload_id)
        acc = await _get_account(db)
        job = await db.get(RenderJob, upload.render_job_id)
        upload.status = "uploading"
        await db.commit()

        async def on_progress(pct: int) -> None:
            upload.progress = pct
            await db.commit()

        status = {"privacyStatus": upload.privacy, "selfDeclaredMadeForKids": False}
        if upload.publish_at:
            status["publishAt"] = upload.publish_at.strftime("%Y-%m-%dT%H:%M:%SZ")
        metadata = {
            "snippet": {
                "title": upload.title,
                "description": upload.description,
                "tags": upload.tags,
                "categoryId": "27",
                "defaultLanguage": "id",
                "defaultAudioLanguage": "id",
            },
            "status": status,
        }
        try:
            token = await yt.refresh_access_token(
                acc.client_id,
                decrypt_secret(acc.client_secret_encrypted),
                decrypt_secret(acc.refresh_token_encrypted),
            )
            upload.video_id = await yt.upload_video(
                token, Path(job.output_file_path), metadata, on_progress
            )
            upload.status = "uploaded"
            upload.progress = 100
        except Exception as e:
            log.exception("YouTube upload %s failed", upload_id)
            upload.status = "failed"
            upload.error_message = str(e)[:1000]
        await db.commit()

"""Autopilot: a producer fills a pool of ready videos; a publisher drains it into posting slots.

Producer: at each production window (e.g. 12:00 x2, 18:00 x2) build videos until the pool is full.
A quota error stops the batch; the next window tries again (no fallback provider by design).
Publisher: every tick, each posting slot within `publish_ahead_hours` that has no video gets the
oldest ready one, uploaded with YouTube `publishAt`, so YouTube itself publishes on time.

The pipeline drives our own HTTP endpoints in-process (httpx ASGITransport), reusing exactly what
the Studio UI does instead of duplicating that logic.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Set

import httpx
from sqlalchemy import func, select, update

from app.core.db import SessionLocal
from app.core.events import event_bus
from app.core.tasks import run_background_task
from app.models.autopilot import AutopilotConfig, AutopilotRun
from app.models.project import SourceVideo
from app.models.youtube import YouTubeUpload
from app.services.ai_adapters.factory import get_active_llm_adapter
from app.services.discovery import get_preset_categories

log = logging.getLogger("cliper-autopilot")

TICK_SECONDS = 60
MIN_PUBLISH_LEAD = timedelta(minutes=10)  # YouTube needs publishAt comfortably in the future
PUBLISH_RETRY_AFTER = timedelta(minutes=15)
QUOTA_RE = re.compile(r"\b429\b|resource[_ ]exhausted|quota|rate.?limit|too many requests", re.I)
POOL_STATUSES = ("running", "ready")

_producing = False
_publishing = False


class AutopilotError(Exception):
    pass


class QuotaExhausted(AutopilotError):
    pass


# ---------- pure scheduling helpers ----------

def _local_now(now_utc: datetime, offset_minutes: int) -> datetime:
    return now_utc + timedelta(minutes=offset_minutes)


def upcoming_slots(slots: Iterable[str], utc_offset_minutes: int, now_utc: datetime, days: int = 3) -> List[datetime]:
    """Naive-UTC times for local HH:MM slots over the next `days` days, sorted, future only."""
    offset = timedelta(minutes=utc_offset_minutes)
    local_today = (now_utc + offset).date()
    out = []
    for d in range(days):
        day = local_today + timedelta(days=d)
        for s in slots:
            hh, mm = (int(x) for x in s.split(":"))
            out.append(datetime(day.year, day.month, day.day, hh, mm) - offset)
    return sorted(t for t in out if t > now_utc)


def free_publish_slots(
    slots: List[datetime], taken: Set[datetime], now_utc: datetime, ahead_hours: int
) -> List[datetime]:
    """Slots inside the publish window that have no video yet."""
    return [
        s for s in slots
        if s not in taken and MIN_PUBLISH_LEAD <= s - now_utc <= timedelta(hours=ahead_hours)
    ]


def due_production_windows(
    windows: List[dict], last_runs: Dict[str, str], now_utc: datetime, offset_minutes: int
) -> List[dict]:
    """Windows whose local time has passed today and that have not fired today (catches up after downtime)."""
    local = _local_now(now_utc, offset_minutes)
    today, hhmm = local.date().isoformat(), local.strftime("%H:%M")
    return [w for w in windows if w["time"] <= hhmm and last_runs.get(w["time"]) != today]


def pick_category(categories: List[str], recent: List[AutopilotRun]) -> str:
    """Least recently used category, so consecutive videos rotate niches."""
    last_used = {}
    for i, r in enumerate(recent):  # recent is newest first
        if r.category and r.category not in last_used:
            last_used[r.category] = i
    return max(categories, key=lambda c: last_used.get(c, len(recent) + 1))


def is_quota_error(message: str) -> bool:
    return bool(QUOTA_RE.search(message or ""))


def _extract_json(raw: str) -> dict:
    m = re.search(r"\{.*\}", raw or "", re.S)
    if not m:
        raise AutopilotError(f"LLM tidak mengembalikan JSON: {raw[:200]!r}")
    return json.loads(m.group(0))


def clean_title(title: str) -> str:
    t = re.sub(r"[<>]", "", title).strip()
    t = re.sub(r"\s*#shorts\b", "", t, flags=re.I).strip()
    return f"{t[:91].rstrip()} #shorts"


# ---------- plumbing ----------

async def _store(run_id: str, **fields) -> None:
    async with SessionLocal() as db:
        await db.execute(update(AutopilotRun).where(AutopilotRun.id == run_id).values(**fields))
        await db.commit()


async def _poll(desc: str, check, timeout_min: int, every: int = 10):
    loop = asyncio.get_running_loop()
    end = loop.time() + timeout_min * 60
    while loop.time() < end:
        if result := await check():
            return result
        await asyncio.sleep(every)
    raise AutopilotError(f"Timeout menunggu {desc}")


async def _call(client: httpx.AsyncClient, method: str, path: str, **kw) -> httpx.Response:
    r = await client.request(method, path, **kw)
    if r.status_code >= 400:
        msg = f"{method} {path} -> {r.status_code}: {r.text[:300]}"
        raise (QuotaExhausted if is_quota_error(msg) else AutopilotError)(msg)
    return r


def _client() -> httpx.AsyncClient:
    from app.main import app  # local import: main imports the router that imports us

    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://autopilot/api/v1", timeout=900
    )


async def _llm_json(prompt: str) -> dict:
    async with SessionLocal() as db:
        adapter = await get_active_llm_adapter(db)
    try:
        raw = await adapter.generate_chat(prompt=prompt, json_mode=True)
    except Exception as e:
        raise (QuotaExhausted if is_quota_error(str(e)) else AutopilotError)(f"LLM gagal: {e}")
    return _extract_json(raw)


# ---------- producer ----------

async def _generate_idea(cfg: AutopilotConfig, category: str, recent_topics: List[str]) -> dict:
    preset = next((p for p in get_preset_categories() if p.id == category), None)
    data = await _llm_json(f"""Kamu kurator ide untuk channel YouTube Shorts.
Niche channel: {cfg.niche}
Kategori video kali ini: {preset.title if preset else category} ({preset.description if preset else ""})

Topik yang SUDAH dipakai (jangan diulang, cari sudut lain):
{chr(10).join("- " + t for t in recent_topics[:40]) or "- (belum ada)"}

Berikan SATU ide fakta unik yang benar dan memancing rasa penasaran, yang footage-nya mudah dicari.
Balas JSON saja:
{{"topic": "sudut cerita dalam Bahasa Indonesia, maks 100 karakter",
  "query": "kata kunci footage bahasa Inggris, spesifik, akhiri dengan 'process no talking'"}}""")
    if not data.get("topic") or not data.get("query"):
        raise AutopilotError(f"Ide dari LLM tidak lengkap: {data}")
    return {"topic": str(data["topic"])[:250], "query": str(data["query"])[:200]}


def _build_metadata(meta: dict, topic: str, src: dict) -> dict:
    title = clean_title(str(meta.get("title") or topic))
    hashtags = " ".join(h if h.startswith("#") else f"#{h}" for h in (meta.get("hashtags") or [])[:5])
    # Source credit is added by code, never left to the LLM
    description = re.sub(r"[<>]", "", "\n\n".join(filter(None, [
        str(meta.get("summary") or "").strip(),
        f"Sumber footage: {src['title']} — {src['channel']} ({src['url']})",
        hashtags,
    ])))[:5000]
    tags, total = [], 0
    for t in meta.get("tags") or []:
        t = re.sub(r"[<>,]", "", str(t)).strip()
        if t and total + len(t) <= 450:
            tags.append(t)
            total += len(t)
    return {"title": title, "description": description, "tags": tags}


async def _build(run_id: str, cfg: AutopilotConfig) -> None:
    """Make one video and leave it in the pool (status=ready). Upload happens later in the publisher."""
    async with SessionLocal() as db:
        recent = (await db.execute(
            select(AutopilotRun).order_by(AutopilotRun.created_at.desc()).limit(60)
        )).scalars().all()
    category = pick_category(cfg.categories, list(recent))
    await _store(run_id, category=category)

    idea = await _generate_idea(cfg, category, [r.topic for r in recent if r.topic])
    await _store(run_id, topic=idea["topic"], query=idea["query"], stage="sourcing")

    async with _client() as c:
        found = (await _call(c, "POST", "/discovery/search", json={
            "custom_query": idea["query"], "preset_id": category, "limit": 12,
            "max_duration": 900, "hide_imported": True, "exclude_ai": True,
        })).json()["candidates"]
        if not found:
            raise AutopilotError(f"Tidak ada footage untuk query: {idea['query']}")
        src = found[0]

        pid = (await _call(c, "POST", "/discovery/import", json={
            "url": src["url"], "title": src["title"], "source": src["source"],
            "project_name": idea["topic"],
        })).json()["project_id"]
        await _store(run_id, project_id=pid, stage="processing")

        async def media_ready():
            vids = (await _call(c, "GET", f"/projects/{pid}/media")).json()
            if any(v["status"] == "failed" for v in vids):
                raise AutopilotError("Download / deteksi scene gagal")
            return bool(vids) and all(v["status"] == "ready" for v in vids)
        await _poll("download & tagging scene", media_ready, 60, every=15)

        await _store(run_id, stage="script")
        await _call(c, "POST", f"/projects/{pid}/narration/generate", json={
            "template_id": cfg.template_id, "topic": idea["topic"], "target_duration": cfg.target_duration,
        })
        # QC auto-fix improves the script but must never block the run
        await c.post(f"/projects/{pid}/qc/run", json={"gate": "script", "auto_fix": True, "trigger": "manual"})
        narration = (await _call(c, "GET", f"/projects/{pid}/narration")).json()["raw_text"]

        await _store(run_id, stage="voice")
        # The TTS worker reports its failure reason only on the event bus, so listen for it
        events = event_bus.subscribe(pid)
        try:
            await _call(c, "POST", f"/projects/{pid}/tts/generate", json={})

            async def audio_ready():
                s = (await _call(c, "GET", f"/projects/{pid}/audio")).json()["status"]
                if s != "failed":
                    return s == "ready"
                reason = "TTS gagal"
                while not events.empty():
                    ev = json.loads(events.get_nowait())
                    if ev.get("status") == "error":
                        reason = f"TTS gagal: {ev.get('error') or ev.get('message')}"
                raise (QuotaExhausted if is_quota_error(reason) else AutopilotError)(reason)
            await _poll("TTS", audio_ready, 20)
        finally:
            event_bus.unsubscribe(pid, events)

        await _store(run_id, stage="render")
        await _call(c, "POST", f"/projects/{pid}/timeline/auto-match")
        job_id = (await _call(c, "POST", f"/projects/{pid}/render", json={"resolution": "1080p"})).json()["id"]

        async def rendered():
            jobs = (await _call(c, "GET", f"/projects/{pid}/render/jobs")).json()
            job = next((j for j in jobs if j["id"] == job_id), None)
            if not job or job["status"] == "failed":
                raise AutopilotError(f"Render gagal: {job and job.get('error_message')}")
            return job["status"] == "completed"
        await _poll("render", rendered, 60, every=15)

    await _store(run_id, stage="metadata", render_job_id=job_id)
    meta = _build_metadata(await _llm_json(f"""Buat metadata YouTube Shorts berbahasa Indonesia.
Topik: {idea["topic"]}
Naskah narasi:
{narration}

Aturan: judul maks 70 karakter, memancing rasa penasaran tapi tidak bohong, tanpa karakter < atau >.
Balas JSON saja:
{{"title": "...", "summary": "2-3 kalimat ringkasan", "hashtags": ["#faktaunik", "..."], "tags": ["8-12 tag pendek"]}}"""),
        idea["topic"], src)
    await _store(run_id, status="ready", stage="ready", finished_at=datetime.utcnow(), **meta)


async def pool_count(db) -> int:
    return (await db.execute(
        select(func.count()).select_from(AutopilotRun).where(AutopilotRun.status.in_(POOL_STATUSES))
    )).scalar_one()


async def produce(count: int) -> None:
    """Build up to `count` videos, never past pool_size. Quota errors end the batch."""
    global _producing
    if _producing:
        return
    _producing = True
    made = attempts = 0
    try:
        while made < count and attempts < count + 2:
            async with SessionLocal() as db:
                cfg = await get_config(db)
                if await pool_count(db) >= cfg.pool_size:
                    log.info("Autopilot pool full (%s), skipping production", cfg.pool_size)
                    return
                run = AutopilotRun()
                db.add(run)
                await db.commit()
                await db.refresh(run)
                db.expunge(cfg)
            attempts += 1
            try:
                await _build(run.id, cfg)
                made += 1
            except QuotaExhausted as e:
                log.warning("Autopilot quota exhausted, stopping batch: %s", e)
                await _store(run.id, status="failed", finished_at=datetime.utcnow(),
                             error_message=f"Kuota AI habis, lanjut di jadwal produksi berikutnya. {e}"[:1000])
                return
            except Exception as e:
                log.exception("Autopilot build %s failed", run.id)
                await _store(run.id, status="failed", error_message=str(e)[:1000], finished_at=datetime.utcnow())
    finally:
        _producing = False


# ---------- publisher ----------

def _delete_source_footage_sync(paths: List[str]) -> None:
    for p in paths:
        try:
            Path(p).unlink(missing_ok=True)
        except OSError as e:
            log.warning("Could not delete source footage %s: %s", p, e)


async def _publish(run: AutopilotRun, slot_utc: datetime) -> None:
    async with _client() as c:
        up = (await _call(c, "POST", f"/projects/{run.project_id}/publish/youtube", json={
            "render_job_id": run.render_job_id, "title": run.title, "description": run.description or "",
            "tags": run.tags or [], "privacy": "private",
            "publish_at": slot_utc.replace(tzinfo=timezone.utc).isoformat(),
        })).json()

        async def uploaded():
            ups = (await _call(c, "GET", f"/projects/{run.project_id}/publish/youtube")).json()
            u = next(x for x in ups if x["id"] == up["id"])
            if u["status"] == "failed":
                raise AutopilotError(f"Upload YouTube gagal: {u.get('error_message')}")
            return u if u["status"] == "uploaded" else None
        u = await _poll("upload YouTube", uploaded, 30, every=5)

    await _store(run.id, status="scheduled", stage="done", slot_at=slot_utc, video_id=u["video_id"],
                 publish_error=None)
    # Footage is only needed to re-edit; once the video is on YouTube, free the space
    async with SessionLocal() as db:
        paths = (await db.execute(
            select(SourceVideo.file_path).where(SourceVideo.project_id == run.project_id)
        )).scalars().all()
    await asyncio.to_thread(_delete_source_footage_sync, [p for p in paths if p])


async def publish_due(cfg: AutopilotConfig) -> None:
    global _publishing
    if _publishing:
        return
    _publishing = True
    try:
        now = datetime.utcnow()
        async with SessionLocal() as db:
            taken = set((await db.execute(
                select(AutopilotRun.slot_at).where(AutopilotRun.status == "scheduled", AutopilotRun.slot_at >= now)
            )).scalars().all())
            # Videos scheduled by hand from the Publish tab occupy their slot too
            taken |= set((await db.execute(
                select(YouTubeUpload.publish_at).where(
                    YouTubeUpload.publish_at >= now, YouTubeUpload.status != "failed"
                )
            )).scalars().all())
            ready = list((await db.execute(
                select(AutopilotRun).where(AutopilotRun.status == "ready").order_by(AutopilotRun.created_at)
            )).scalars().all())
        ready = [r for r in ready if not r.publish_attempted_at or now - r.publish_attempted_at > PUBLISH_RETRY_AFTER]

        for slot in free_publish_slots(upcoming_slots(cfg.slots, cfg.utc_offset_minutes, now), taken, now,
                                       cfg.publish_ahead_hours):
            if not ready:
                break
            run = ready.pop(0)
            await _store(run.id, publish_attempted_at=datetime.utcnow(), stage="upload")
            try:
                await _publish(run, slot)
                log.info("Autopilot published %s for %s", run.id, slot)
            except Exception as e:
                log.exception("Autopilot publish %s failed", run.id)
                # Stays in the pool; retried after PUBLISH_RETRY_AFTER
                await _store(run.id, stage="ready", publish_error=str(e)[:1000])
    finally:
        _publishing = False


# ---------- control ----------

async def get_config(db) -> AutopilotConfig:
    cfg = (await db.execute(select(AutopilotConfig).limit(1))).scalar_one_or_none()
    if not cfg:
        cfg = AutopilotConfig()
        db.add(cfg)
        await db.commit()
        await db.refresh(cfg)
    return cfg


def is_producing() -> bool:
    return _producing


async def _tick() -> None:
    async with SessionLocal() as db:
        cfg = await get_config(db)
        if not cfg.enabled:
            return
        db.expunge(cfg)
    await publish_due(cfg)

    if _producing:
        return
    now = datetime.utcnow()
    due = due_production_windows(cfg.production_windows, cfg.production_last_runs or {}, now,
                                 cfg.utc_offset_minutes)
    if not due:
        return
    today = _local_now(now, cfg.utc_offset_minutes).date().isoformat()
    # Mark windows as fired before running, so a failed batch waits for the next window
    async with SessionLocal() as db:
        live = await get_config(db)
        live.production_last_runs = {**(live.production_last_runs or {}), **{w["time"]: today for w in due}}
        await db.commit()
    run_background_task(produce, sum(int(w["count"]) for w in due))


async def _loop() -> None:
    while True:
        try:
            await _tick()
        except Exception:
            log.exception("Autopilot tick failed")
        await asyncio.sleep(TICK_SECONDS)


async def start_autopilot_scheduler() -> None:
    # Builds/uploads that were mid-flight when the server stopped will never finish
    async with SessionLocal() as db:
        await db.execute(
            update(AutopilotRun).where(AutopilotRun.status == "running").values(
                status="failed", error_message="Server berhenti saat proses berjalan",
                finished_at=datetime.utcnow(),
            )
        )
        await db.execute(
            update(AutopilotRun).where(AutopilotRun.status == "ready", AutopilotRun.stage == "upload")
            .values(stage="ready")
        )
        # An interrupted upload would otherwise keep its publish_at slot "taken" forever
        await db.execute(
            update(YouTubeUpload).where(YouTubeUpload.status.in_(["queued", "uploading"])).values(
                status="failed", error_message="Server berhenti saat upload berjalan"
            )
        )
        await db.commit()
    run_background_task(_loop)

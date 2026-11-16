# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx"]
# ///
"""Channel automation driving the cliper-pro API end to end (build + YouTube publish).

The YouTube channel must be connected once in cliper-pro: Settings -> Publish YouTube.

  uv run shorts.py make --query "..." --topic "..." --bgm calm   # build one short, prints JSON
  (--bgm = folder name in the app data bgm/ dir, royalty-free tracks, e.g. freetouse.com)
  uv run shorts.py upload --project <id> --title ... --description ... --tags a,b --publish-at 2026-11-16T07:00:00+07:00
"""

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

import httpx

HERE = Path(__file__).parent
API = "http://127.0.0.1:18080/api/v1"  # Cliper Pro desktop app (must be running)
LOG = HERE / "log.jsonl"

http = httpx.Client(base_url=API, timeout=600)


def die(msg):
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(1)


def call(method, path, **kw):
    r = http.request(method, path, **kw)
    if r.status_code >= 400:
        die(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
    return r


def wait(desc, check, timeout_min, every=10):
    """Poll check() until it returns truthy; check() may die() on failure."""
    end = time.time() + timeout_min * 60
    while time.time() < end:
        if result := check():
            return result
        time.sleep(every)
    die(f"timeout waiting for {desc}")


def make(a):
    found = call("POST", "/discovery/search", json={
        "custom_query": a.query, "preset_id": a.preset, "limit": 12,
        "max_duration": 900, "hide_imported": True, "exclude_ai": True,
    }).json()["candidates"]
    if not found:
        die(f"no source video for query: {a.query}")
    src = found[0]

    pid = call("POST", "/discovery/import", json={
        "url": src["url"], "title": src["title"], "source": src["source"],
        "project_name": a.topic[:250],
    }).json()["project_id"]
    if a.bgm:
        fill = call("GET", f"/projects/{pid}").json()["background_fill"]
        call("PATCH", f"/projects/{pid}", json={"background_fill": {**fill, "bgm_mood": a.bgm}})

    def media_ready():
        vids = call("GET", f"/projects/{pid}/media").json()
        if any(v["status"] == "failed" for v in vids):
            die(f"source video failed in project {pid}")
        return vids and all(v["status"] == "ready" for v in vids)
    wait("download + scene tagging", media_ready, 60, every=15)

    call("POST", f"/projects/{pid}/narration/generate",
         json={"template_id": a.template, "topic": a.topic, "target_duration": a.duration})
    # QC auto-fix is a quality bonus; a failure here must not block the video
    http.post(f"/projects/{pid}/qc/run", json={"gate": "script", "auto_fix": True, "trigger": "manual"})
    narration = call("GET", f"/projects/{pid}/narration").json()["raw_text"]

    call("POST", f"/projects/{pid}/tts/generate", json={})

    def audio_ready():
        s = call("GET", f"/projects/{pid}/audio").json()["status"]
        if s == "failed":
            die(f"TTS failed in project {pid}")
        return s == "ready"
    wait("TTS", audio_ready, 20)

    call("POST", f"/projects/{pid}/timeline/auto-match")
    job_id = call("POST", f"/projects/{pid}/render", json={"resolution": "1080p"}).json()["id"]

    def rendered():
        job = next(j for j in call("GET", f"/projects/{pid}/render/jobs").json() if j["id"] == job_id)
        if job["status"] == "failed":
            die(f"render failed in project {pid}: {job.get('error_message')}")
        return job["status"] == "completed"
    wait("render", rendered, 60, every=15)

    print(json.dumps({"ok": True, "project_id": pid, "topic": a.topic,
                      "source_url": src["url"], "source_title": src["title"],
                      "source_channel": src["channel"], "narration": narration,
                      "bgm_credit": call("GET", f"/projects/{pid}").json().get("bgm_credit")}, ensure_ascii=False))


def upload(a):
    up = call("POST", f"/projects/{a.project}/publish/youtube", json={
        "title": a.title, "description": a.description,
        "tags": [t.strip() for t in a.tags.split(",") if t.strip()],
        "privacy": "private", "publish_at": a.publish_at,
    }).json()

    def done():
        u = next(x for x in call("GET", f"/projects/{a.project}/publish/youtube").json() if x["id"] == up["id"])
        if u["status"] == "failed":
            die(f"YouTube upload failed: {u.get('error_message')}")
        return u if u["status"] == "uploaded" else None
    u = wait("YouTube upload", done, 30)

    entry = {"uploaded_at": datetime.now().astimezone().isoformat(), "video_id": u["video_id"],
             "title": a.title, "publish_at": a.publish_at, "project_id": a.project, "topic": a.topic}
    with LOG.open("a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps({"ok": True, **entry}, ensure_ascii=False))


p = argparse.ArgumentParser()
sub = p.add_subparsers(dest="cmd", required=True)
m = sub.add_parser("make")
m.add_argument("--query", required=True, help="English search query for source footage")
m.add_argument("--topic", required=True, help="Indonesian narration topic/angle")
m.add_argument("--preset", default=None)
m.add_argument("--template", default="fakta", choices=["auto", "kenapa", "proses", "fakta"])
m.add_argument("--duration", type=int, default=50)
m.add_argument("--bgm", default=None, help="BGM mood folder in storage/bgm (e.g. calm, folk)")
u = sub.add_parser("upload")
for f in ("project", "title", "description", "tags", "publish-at"):
    u.add_argument(f"--{f}", required=True)
u.add_argument("--topic", default="")
a = p.parse_args()

make(a) if a.cmd == "make" else upload(a)

/**
 * Pure, immutable timeline editing operations.
 *
 * Invariant kept by every operation (mirrors the FFmpeg renderer):
 *   clip_end - clip_start === (timeline_end - timeline_start) * speed
 * The renderer reads `timeline_duration * speed` seconds from `clip_start`
 * and caps at the source range, so breaking this invariant yields a chunk
 * that is shorter than its slot and desyncs everything after it.
 */
import { Scene, TimelineClip } from "@/types";
import { snapToFrame } from "./frameMath";

export const MIN_CLIP = 0.5;
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.0;
export const FRAME = 1 / 30;

export type SceneMap = Map<string, Scene>;

export interface Bounds {
  start: number;
  end: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function newClipId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-secure contexts (plain http on LAN IP) do not expose randomUUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const v = (Math.random() * 16) | 0;
    return (c === "x" ? v : (v & 0x3) | 0x8).toString(16);
  });
}

export const tlDur = (c: TimelineClip) => c.timeline_end - c.timeline_start;

export function timelineEnd(clips: TimelineClip[]): number {
  return clips.length ? clips[clips.length - 1].timeline_end : 0;
}

/** Anti-bleed safe range of a scene (same margins as backend matching.py). */
export function sceneSafeBounds(scene: Scene): Bounds {
  const start = r3(scene.start_time + (scene.start_time > 0.1 ? 0.033 : 0));
  const end = r3(Math.max(start + MIN_CLIP, scene.end_time - 0.066));
  return { start, end };
}

export function clipBounds(clip: TimelineClip, scenes: SceneMap): Bounds {
  const scene = scenes.get(clip.scene_id);
  if (scene) {
    const safe = sceneSafeBounds(scene);
    // Never shrink below what the clip already uses (legacy clips may use the raw edge)
    return {
      start: Math.min(safe.start, clip.clip_start),
      end: Math.max(safe.end, clip.clip_end),
    };
  }
  return { start: clip.clip_start, end: clip.clip_end };
}

/** Longest timeline duration the clip's source can fill at MIN_SPEED. */
export function maxTimelineDur(clip: TimelineClip, scenes: SceneMap): number {
  const b = clipBounds(clip, scenes);
  return (b.end - b.start) / MIN_SPEED;
}

type Anchor = "start" | "end" | "center";

/** Re-fit the source window so the speed invariant holds for the clip's timeline duration. */
export function fitSource(
  clip: TimelineClip,
  bounds: Bounds,
  anchor: Anchor = "start",
  preferSpeed: number = clip.speed || 1
): TimelineClip {
  const tl = Math.max(FRAME, tlDur(clip));
  const avail = Math.max(FRAME, bounds.end - bounds.start);
  let speed = clamp(preferSpeed, MIN_SPEED, MAX_SPEED);
  if (tl * speed > avail) speed = Math.max(MIN_SPEED, avail / tl);
  const need = Math.min(avail, tl * speed);

  let start: number;
  if (anchor === "end") {
    start = clamp(clip.clip_end, bounds.start + need, bounds.end) - need;
  } else if (anchor === "center") {
    const mid = (clip.clip_start + clip.clip_end) / 2;
    start = clamp(mid - need / 2, bounds.start, bounds.end - need);
  } else {
    start = clamp(clip.clip_start, bounds.start, bounds.end - need);
  }
  return { ...clip, clip_start: r3(start), clip_end: r3(start + need), speed: r3(speed) };
}

export function clipIndexAt(clips: TimelineClip[], t: number): number {
  return clips.findIndex((c) => t >= c.timeline_start && t < c.timeline_end);
}

/** Map a timeline time to the source-video time of a clip. */
export function sourceTimeAt(clip: TimelineClip, t: number): number {
  return clip.clip_start + Math.max(0, t - clip.timeline_start) * (clip.speed || 1);
}

/** Every boundary between clips (useful for snapping and prev/next cut navigation). */
export function cutPoints(clips: TimelineClip[]): number[] {
  const pts = new Set<number>();
  clips.forEach((c) => {
    pts.add(r3(c.timeline_start));
    pts.add(r3(c.timeline_end));
  });
  return Array.from(pts).sort((a, b) => a - b);
}

function shift(clips: TimelineClip[], from: number, delta: number): TimelineClip[] {
  if (Math.abs(delta) < 1e-6) return clips;
  return clips.map((c, i) =>
    i < from
      ? c
      : {
          ...c,
          timeline_start: r3(c.timeline_start + delta),
          timeline_end: r3(c.timeline_end + delta),
        }
  );
}

/**
 * Roll edit: move the boundary between clip i and i+1 (total length unchanged,
 * narration sync preserved). When i is the last clip, extends/shrinks the end.
 */
export function rollEdge(
  clips: TimelineClip[],
  i: number,
  t: number,
  scenes: SceneMap
): TimelineClip[] {
  const a = clips[i];
  if (!a) return clips;
  const b = clips[i + 1];

  let lo = a.timeline_start + MIN_CLIP;
  let hi = a.timeline_start + maxTimelineDur(a, scenes);
  if (b) {
    hi = Math.min(hi, b.timeline_end - MIN_CLIP);
    lo = Math.max(lo, b.timeline_end - maxTimelineDur(b, scenes));
  }
  if (lo > hi) return clips;

  const edge = r3(snapToFrame(clamp(t, lo, hi)));
  if (Math.abs(edge - a.timeline_end) < 1e-6) return clips;

  const out = [...clips];
  out[i] = fitSource({ ...a, timeline_end: edge }, clipBounds(a, scenes), "start");
  if (b) out[i + 1] = fitSource({ ...b, timeline_start: edge }, clipBounds(b, scenes), "end");
  return out;
}

/** Valid [lo, hi] range for the right edge of clip i (used by the UI to clamp drags). */
export function edgeRange(clips: TimelineClip[], i: number, scenes: SceneMap): Bounds | null {
  const a = clips[i];
  if (!a) return null;
  const b = clips[i + 1];
  let lo = a.timeline_start + MIN_CLIP;
  let hi = a.timeline_start + maxTimelineDur(a, scenes);
  if (b) {
    hi = Math.min(hi, b.timeline_end - MIN_CLIP);
    lo = Math.max(lo, b.timeline_end - maxTimelineDur(b, scenes));
  }
  return lo <= hi ? { start: lo, end: hi } : null;
}

export function canSplitAt(clips: TimelineClip[], t: number): number {
  const ts = snapToFrame(t);
  const idx = clipIndexAt(clips, ts);
  if (idx === -1) return -1;
  const c = clips[idx];
  if (ts - c.timeline_start < MIN_CLIP - 1e-6 || c.timeline_end - ts < MIN_CLIP - 1e-6) return -1;
  return idx;
}

/** Cut the clip under `t` into two pieces showing continuous footage. */
export function splitAt(
  clips: TimelineClip[],
  t: number
): { clips: TimelineClip[]; rightIndex: number } | null {
  const idx = canSplitAt(clips, t);
  if (idx === -1) return null;
  const ts = r3(snapToFrame(t));
  const c = clips[idx];
  const src = r3(sourceTimeAt(c, ts));
  const left: TimelineClip = { ...c, timeline_end: ts, clip_end: src };
  const right: TimelineClip = { ...c, id: newClipId(), timeline_start: ts, clip_start: src };
  const out = [...clips];
  out.splice(idx, 1, left, right);
  return { clips: out, rightIndex: idx + 1 };
}

function contentFromScene(scene: Scene) {
  return {
    scene_id: scene.id,
    source_video_id: scene.source_video_id,
    thumbnail_url: scene.thumbnail_url,
    video_url: scene.video_url,
  };
}

/** Replace the footage of clip i with a scene, keeping the slot timing. Center-weighted. */
export function replaceScene(
  clips: TimelineClip[],
  i: number,
  scene: Scene
): TimelineClip[] {
  const c = clips[i];
  if (!c) return clips;
  const b = sceneSafeBounds(scene);
  const mid = (b.start + b.end) / 2;
  const draft: TimelineClip = { ...c, ...contentFromScene(scene), clip_start: mid, clip_end: mid };
  const out = [...clips];
  out[i] = fitSource(draft, b, "center", 1);
  return out;
}

/** Append a scene (full safe range, 1x) at the end of the timeline. */
export function appendScene(clips: TimelineClip[], scene: Scene): TimelineClip[] {
  const b = sceneSafeBounds(scene);
  const start = timelineEnd(clips);
  const dur = Math.max(MIN_CLIP, snapToFrame(b.end - b.start));
  const clip: TimelineClip = {
    id: newClipId(),
    segment_id: null,
    ...contentFromScene(scene),
    timeline_start: r3(start),
    timeline_end: r3(start + dur),
    clip_start: b.start,
    clip_end: b.start,
    speed: 1,
    text: scene.description || null,
  };
  return [...clips, fitSource(clip, b, "start", 1)];
}

/**
 * Overwrite-insert a scene at time t inside the clip under the playhead.
 * The inserted piece lasts up to the scene length; total duration is unchanged.
 */
export function insertSceneAt(
  clips: TimelineClip[],
  t: number,
  scene: Scene
): { clips: TimelineClip[]; index: number } | null {
  let ts = r3(snapToFrame(t));
  const idx = clipIndexAt(clips, ts);
  if (idx === -1) {
    const out = appendScene(clips, scene);
    return { clips: out, index: out.length - 1 };
  }
  const c = clips[idx];
  if (ts - c.timeline_start < MIN_CLIP) ts = c.timeline_start;

  const b = sceneSafeBounds(scene);
  let end = r3(snapToFrame(Math.min(c.timeline_end, ts + (b.end - b.start))));
  if (c.timeline_end - end < MIN_CLIP) end = c.timeline_end;
  if (end - ts < MIN_CLIP) return null;
  // Scene too short to fill even at MIN_SPEED: shrink the inserted piece instead
  const maxDur = (b.end - b.start) / MIN_SPEED;
  if (end - ts > maxDur) {
    end = r3(snapToFrame(ts + (b.end - b.start)));
    if (c.timeline_end - end < MIN_CLIP) return null;
  }

  const pieces: TimelineClip[] = [];
  if (ts > c.timeline_start) {
    pieces.push({ ...c, timeline_end: ts, clip_end: r3(sourceTimeAt(c, ts)) });
  }
  const mid: TimelineClip = {
    ...c,
    id: newClipId(),
    ...contentFromScene(scene),
    timeline_start: ts,
    timeline_end: end,
    clip_start: b.start,
    clip_end: b.start,
    speed: 1,
  };
  const midIndex = idx + pieces.length;
  pieces.push(fitSource(mid, b, "start", 1));
  if (end < c.timeline_end) {
    pieces.push({ ...c, id: newClipId(), timeline_start: end, clip_start: r3(sourceTimeAt(c, end)) });
  }
  const out = [...clips];
  out.splice(idx, 1, ...pieces);
  return { clips: out, index: midIndex };
}

/**
 * Delete clip i. The previous clip (or next, for the first clip) absorbs the gap
 * so narration sync is kept; anything it cannot absorb is ripple-closed.
 */
export function deleteClip(clips: TimelineClip[], i: number, scenes: SceneMap): TimelineClip[] {
  const removed = clips[i];
  if (!removed) return clips;
  let out = clips.filter((_, k) => k !== i);
  if (out.length === 0) return out;

  if (i > 0) {
    const p = out[i - 1];
    const newEnd = Math.min(removed.timeline_end, p.timeline_start + maxTimelineDur(p, scenes));
    out[i - 1] = fitSource({ ...p, timeline_end: r3(newEnd) }, clipBounds(p, scenes), "start");
    out = shift(out, i, -(removed.timeline_end - newEnd));
  } else {
    const n = out[0];
    const newStart = Math.max(removed.timeline_start, n.timeline_end - maxTimelineDur(n, scenes));
    out[0] = fitSource({ ...n, timeline_start: r3(newStart) }, clipBounds(n, scenes), "end");
    out = shift(out, 0, -(newStart - removed.timeline_start));
  }
  return out;
}

/** Swap the footage of clip i with its neighbour, keeping both time slots. */
export function swapWithNeighbor(
  clips: TimelineClip[],
  i: number,
  dir: -1 | 1,
  scenes: SceneMap
): TimelineClip[] {
  const j = i + dir;
  const a = clips[i];
  const b = clips[j];
  if (!a || !b) return clips;
  const pick = (c: TimelineClip) => ({
    scene_id: c.scene_id,
    source_video_id: c.source_video_id,
    thumbnail_url: c.thumbnail_url,
    video_url: c.video_url,
    clip_start: c.clip_start,
    clip_end: c.clip_end,
    speed: c.speed,
  });
  const na: TimelineClip = { ...a, ...pick(b) };
  const nb: TimelineClip = { ...b, ...pick(a) };
  const out = [...clips];
  out[i] = fitSource(na, clipBounds(na, scenes), "center");
  out[j] = fitSource(nb, clipBounds(nb, scenes), "center");
  return out;
}

/** Slip: move the source window inside the scene without changing timing or speed. */
export function slipClip(clip: TimelineClip, newStart: number, scenes: SceneMap): TimelineClip {
  const b = clipBounds(clip, scenes);
  const need = clip.clip_end - clip.clip_start;
  const s = clamp(newStart, b.start, b.end - need);
  return { ...clip, clip_start: r3(s), clip_end: r3(s + need) };
}

export function canUseSpeed(clip: TimelineClip, speed: number, scenes: SceneMap): boolean {
  const b = clipBounds(clip, scenes);
  return tlDur(clip) * speed <= b.end - b.start + 1e-3;
}

export function setClipSpeed(clip: TimelineClip, speed: number, scenes: SceneMap): TimelineClip {
  return fitSource(clip, clipBounds(clip, scenes), "center", speed);
}

/** Use the whole safe scene range, deriving speed (clamped) from the slot duration. */
export function fillWholeScene(clip: TimelineClip, scenes: SceneMap): TimelineClip {
  const b = clipBounds(clip, scenes);
  const speed = (b.end - b.start) / Math.max(FRAME, tlDur(clip));
  return fitSource({ ...clip, clip_start: b.start }, b, "start", speed);
}

/** Validate clip list for render; returns human-readable issues per clip index. */
export function clipWarnings(clip: TimelineClip): string[] {
  const w: string[] = [];
  const dur = tlDur(clip);
  if (dur < 1.8) w.push("Durasi < 1.8s (berisiko flash cut)");
  const expected = dur * (clip.speed || 1);
  if (Math.abs(clip.clip_end - clip.clip_start - expected) > 0.1) {
    w.push("Rentang sumber tidak cocok dengan durasi × speed");
  }
  return w;
}

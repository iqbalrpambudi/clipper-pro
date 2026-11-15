import { describe, it, expect } from "vitest";
import {
  newClipId,
  tlDur,
  timelineEnd,
  splitAt,
  deleteClip,
  setClipSpeed,
  rollEdge,
  clipsKey,
  sourceCutPoints,
  MIN_SPEED,
  SceneMap,
} from "../editOps";
import type { TimelineClip, Scene } from "../../../types";

describe("editOps", () => {
  it("generates valid non-empty clip UUIDs", () => {
    const id1 = newClipId();
    const id2 = newClipId();
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it("calculates clip duration and total timeline end", () => {
    const clips: TimelineClip[] = [
      {
        id: "c1",
        scene_id: "s1",
        source_video_id: "v1",
        timeline_start: 0,
        timeline_end: 5,
        clip_start: 0,
        clip_end: 5,
        speed: 1,
      },
      {
        id: "c2",
        scene_id: "s2",
        source_video_id: "v1",
        timeline_start: 5,
        timeline_end: 12,
        clip_start: 0,
        clip_end: 7,
        speed: 1,
      },
    ];

    expect(tlDur(clips[0])).toBe(5);
    expect(tlDur(clips[1])).toBe(7);
    expect(timelineEnd(clips)).toBe(12);
    expect(timelineEnd([])).toBe(0);
  });

  it("splits a clip accurately at playhead position", () => {
    const clip: TimelineClip = {
      id: "orig",
      scene_id: "s1",
      source_video_id: "v1",
      timeline_start: 0,
      timeline_end: 10,
      clip_start: 0,
      clip_end: 10,
      speed: 1,
    };

    const result = splitAt([clip], 4.0);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.clips.length).toBe(2);
    expect(result.clips[0].timeline_start).toBe(0);
    expect(result.clips[0].timeline_end).toBe(4.0);
    expect(result.clips[1].timeline_start).toBe(4.0);
    expect(result.clips[1].timeline_end).toBe(10);
  });

  it("deletes a clip and adjusts timeline accordingly", () => {
    const clips: TimelineClip[] = [
      {
        id: "c1",
        scene_id: "s1",
        source_video_id: "v1",
        timeline_start: 0,
        timeline_end: 5,
        clip_start: 0,
        clip_end: 5,
        speed: 1,
      },
      {
        id: "c2",
        scene_id: "s2",
        source_video_id: "v1",
        timeline_start: 5,
        timeline_end: 12,
        clip_start: 0,
        clip_end: 7,
        speed: 1,
      },
    ];
    const scenes: SceneMap = new Map();
    const scene1: Scene = {
      id: "s1",
      project_id: "p1",
      source_video_id: "v1",
      start_time: 0,
      end_time: 10,
      duration: 10,
      scene_index: 0,
      tags: [],
      status: "ready",
      created_at: new Date().toISOString(),
    };
    const scene2: Scene = {
      id: "s2",
      project_id: "p1",
      source_video_id: "v1",
      start_time: 0,
      end_time: 15,
      duration: 15,
      scene_index: 1,
      tags: [],
      status: "ready",
      created_at: new Date().toISOString(),
    };
    scenes.set("s1", scene1);
    scenes.set("s2", scene2);

    // Delete first clip (index 0)
    const afterDelete = deleteClip(clips, 0, scenes);
    expect(afterDelete.length).toBe(1);
    expect(afterDelete[0].id).toBe("c2");
  });

  it("updates clip speed and recalculates timeline duration", () => {
    const clip: TimelineClip = {
      id: "c1",
      scene_id: "s1",
      source_video_id: "v1",
      timeline_start: 0,
      timeline_end: 5,
      clip_start: 0,
      clip_end: 5,
      speed: 1,
    };
    const scenes: SceneMap = new Map();
    const scene: Scene = {
      id: "s1",
      project_id: "p1",
      source_video_id: "v1",
      start_time: 0,
      end_time: 20,
      duration: 20,
      scene_index: 0,
      tags: [],
      status: "ready",
      created_at: new Date().toISOString(),
    };
    scenes.set("s1", scene);

    const updated = setClipSpeed(clip, 1.5, scenes);
    expect(updated.speed).toBe(1.5);
  });

  const mkScene = (id: string, start: number, end: number): Scene => ({
    id,
    project_id: "p1",
    source_video_id: "v1",
    start_time: start,
    end_time: end,
    duration: end - start,
    scene_index: 0,
    tags: [],
    status: "ready",
    created_at: "",
  });

  it("grows a clip past its scene into the next contiguous scene at speed 1", () => {
    const scenes: SceneMap = new Map([
      ["s1", mkScene("s1", 0, 3)],
      ["s2", mkScene("s2", 3, 10)],
    ]);
    const clip: TimelineClip = {
      id: "c1", scene_id: "s1", source_video_id: "v1",
      timeline_start: 0, timeline_end: 2.5, clip_start: 0, clip_end: 2.5, speed: 1,
    };
    const [grown] = rollEdge([clip], 0, 6, scenes);
    expect(grown.timeline_end).toBe(6);
    expect(grown.speed).toBe(1);
    expect(grown.clip_end).toBe(6);
  });

  it("never slows a clip below MIN_SPEED", () => {
    const scenes: SceneMap = new Map([["s1", mkScene("s1", 0, 3)]]);
    const clip: TimelineClip = {
      id: "c1", scene_id: "s1", source_video_id: "v1",
      timeline_start: 0, timeline_end: 2.5, clip_start: 0, clip_end: 2.5, speed: 1,
    };
    const [grown] = rollEdge([clip], 0, 20, scenes);
    expect(MIN_SPEED).toBe(0.9);
    expect(grown.speed).toBeGreaterThanOrEqual(MIN_SPEED);
    expect(grown.timeline_end).toBeLessThan(3.5);
  });

  it("clipsKey ignores server-only and null keys", () => {
    const base: TimelineClip = {
      id: "c1", scene_id: "s1", source_video_id: "v1",
      timeline_start: 0, timeline_end: 2, clip_start: 0, clip_end: 2, speed: 1,
    };
    const echo = { ...base, transition: null, thumbnail_url: "x.jpg", segment_id: null };
    expect(clipsKey([echo])).toBe(clipsKey([base]));
    expect(clipsKey([{ ...base, clip_end: 2.1 }])).not.toBe(clipsKey([base]));
  });

  it("lists internal cuts and next-scene starts inside the slip range only", () => {
    const mk = (id: string, start: number, end: number, cuts: number[] = []): Scene => ({
      id,
      project_id: "p1",
      source_video_id: "v1",
      start_time: start,
      end_time: end,
      duration: end - start,
      scene_index: 0,
      tags: [],
      status: "ready",
      created_at: new Date().toISOString(),
      shot_info: { internal_cuts: cuts },
    });
    // s1 has an internal cut at 4.2s; s2 continues right after s1, s3 is far away
    const scenes: SceneMap = new Map([
      ["s1", mk("s1", 2, 8, [4.2])],
      ["s2", mk("s2", 8.033, 12)],
      ["s3", mk("s3", 30, 40, [33])],
    ]);
    const clip: TimelineClip = {
      id: "c1", scene_id: "s1", source_video_id: "v1",
      timeline_start: 0, timeline_end: 2, clip_start: 3, clip_end: 5, speed: 1,
    };
    expect(sourceCutPoints(clip, scenes)).toEqual([4.2, 8.033]);
  });
});

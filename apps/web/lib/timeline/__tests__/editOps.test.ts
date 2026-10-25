import { describe, it, expect } from "vitest";
import {
  newClipId,
  tlDur,
  timelineEnd,
  splitAt,
  deleteClip,
  setClipSpeed,
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
});

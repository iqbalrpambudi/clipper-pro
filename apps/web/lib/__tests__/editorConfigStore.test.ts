import { describe, it, expect, beforeEach } from "vitest";
import {
  useEditorConfigStore,
  createDefaultShortsConfig,
  createDefaultStoryboardConfig,
} from "../editorConfigStore";
import type { ProjectDetail } from "@/types";

describe("editorConfigStore - Single Source of Truth", () => {
  const dummyProject: ProjectDetail = {
    id: "proj-123",
    name: "Misteri Hutan Pinus",
    project_type: "long_storyboard",
    status: "ready",
    aspect_ratio: "16:9",
    resolution: "1080p",
    background_fill: { mode: "blur", color: "#000000" },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_videos: [],
    scenes: [],
    narration: {
      id: "narr-1",
      project_id: "proj-123",
      topic: "Konspirasi Desa Terpencil",
      tone: "dramatis",
      target_duration: 360,
      raw_text: "Di desa terpencil...",
      language: "id",
      segments: [],
      status: "ready",
    },
    audio: {
      id: "audio-1",
      project_id: "proj-123",
      narration_id: "narr-1",
      provider: "gemini",
      voice: "Puck",
      rate: "0",
      pitch: "0",
      duration: 360,
      estimated_cost: 0,
      status: "ready",
    },
    watermark: {
      enabled: true,
      text: "MY_WATERMARK",
      font_family: "Poppins",
      font_size: 28,
      font_color: "#FFE600",
      opacity: 90,
      position: "top-right",
      offset_x: 30,
      offset_y: 40,
    },
    subtitle_style: {
      preset_name: "custom",
      font_family: "Montserrat",
      font_size: 60,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FFCC00",
      outline_color: "#000000",
      outline_width: 6,
      box_color: "#000000",
      box_opacity: 0,
      position: "bottom",
      offset_x: 10,
      offset_y: -150,
      display_mode: "per_word",
      burst_word_count: 2,
      highlight_animation: "color",
      emoji_enabled: false,
    },
    youtube_metadata: {
      title: "Misteri Terbesar 2026",
      description: "Deskripsi video mendalam",
      tags: ["misteri", "horor", "kisah nyata"],
      thumbnail_prompt: "A cinematic illustration of a dark forest",
    },
  };

  beforeEach(() => {
    useEditorConfigStore.setState({
      shortsConfigs: {},
      storyboardConfigs: {},
    });
  });

  it("creates default Shorts config with correct initial structure", () => {
    const config = createDefaultShortsConfig(dummyProject);
    expect(config.narration.topic).toBe("Konspirasi Desa Terpencil");
    expect(config.narration.tone).toBe("dramatis");
    expect(config.tts.provider).toBe("gemini");
    expect(config.tts.voice).toBe("Puck");
    expect(config.watermark.text).toBe("MY_WATERMARK");
    expect(config.watermark.font_color).toBe("#FFE600");
    expect(config.subtitle.customOffset.y).toBe(-150);
  });

  it("creates default Storyboard config including step 6 publishing", () => {
    const config = createDefaultStoryboardConfig(dummyProject);
    expect(config.script.topic).toBe("Konspirasi Desa Terpencil");
    expect(config.script.durationMins).toBe(6);
    expect(config.publishing.metadata.title).toBe("Misteri Terbesar 2026");
    expect(config.publishing.metadata.tags).toEqual(["misteri", "horor", "kisah nyata"]);
    expect(config.publishing.thumbnail.generator.prompt).toBe(
      "A cinematic illustration of a dark forest"
    );
  });

  it("updates and maintains step config independently per project", () => {
    const store = useEditorConfigStore.getState();

    // Set config for proj-1
    store.setShortsStepConfig(
      "proj-1",
      "narration",
      {
        topic: "Topic Proj 1",
        preset: "fakta_mengejutkan",
      },
      false
    );

    // Set config for proj-2
    store.setShortsStepConfig(
      "proj-2",
      "narration",
      {
        topic: "Topic Proj 2",
        preset: "recap_cinematic",
      },
      false
    );

    const cfg1 = useEditorConfigStore.getState().getShortsConfig("proj-1");
    const cfg2 = useEditorConfigStore.getState().getShortsConfig("proj-2");

    expect(cfg1.narration.topic).toBe("Topic Proj 1");
    expect(cfg1.narration.preset).toBe("fakta_mengejutkan");

    expect(cfg2.narration.topic).toBe("Topic Proj 2");
    expect(cfg2.narration.preset).toBe("recap_cinematic");
  });

  it("updates publishing configuration in Storyboard mode", () => {
    const store = useEditorConfigStore.getState();

    store.setStoryboardStepConfig(
      "proj-sb-1",
      "publishing",
      {
        metadata: {
          language: "id",
          title: "Judul Baru Viral",
          description: "Deskripsi baru",
          tags: ["viral", "trending"],
          titleOptions: ["Judul A", "Judul B"],
          thumbnailConcept: "Tokoh mengintip",
          category: "Film & Animation",
          privacyStatus: "public",
          madeForKids: false,
        },
      },
      false
    );

    const cfg = useEditorConfigStore.getState().getStoryboardConfig("proj-sb-1");
    expect(cfg.publishing.metadata.title).toBe("Judul Baru Viral");
    expect(cfg.publishing.metadata.tags).toEqual(["viral", "trending"]);
  });
});

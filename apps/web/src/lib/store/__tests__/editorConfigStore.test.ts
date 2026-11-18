import { describe, it, expect } from "vitest";
import { useEditorConfigStore, createDefaultShortsConfig } from "../editorConfigStore";
import type { ProjectDetail } from "@/types";

describe("editorConfigStore", () => {
  it("seeds narration settings from the project's last narration", () => {
    const project = {
      id: "p",
      narration: { topic: "Kimchi", template_id: "proses", target_duration: 40 },
    } as unknown as ProjectDetail;
    const cfg = createDefaultShortsConfig(project);
    expect(cfg.narration).toEqual({ topic: "Kimchi", preset: "proses", duration: 40 });
    expect(createDefaultShortsConfig().narration.duration).toBe(55);
  });

  it("keeps step config per project", () => {
    const store = useEditorConfigStore.getState();
    store.setShortsStepConfig("proj-1", "narration", { topic: "A" });
    store.setShortsStepConfig("proj-2", "narration", { topic: "B" });
    expect(useEditorConfigStore.getState().getShortsConfig("proj-1").narration.topic).toBe("A");
    expect(useEditorConfigStore.getState().getShortsConfig("proj-2").narration.topic).toBe("B");
  });
});

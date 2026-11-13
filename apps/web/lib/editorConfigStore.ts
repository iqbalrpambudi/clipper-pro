"use client";

import { create } from "zustand";
import type { Project, ProjectDetail, ShortsConfig } from "@/types";

export function createDefaultShortsConfig(project?: Partial<ProjectDetail | Project>): ShortsConfig {
  const narration = (project as Partial<ProjectDetail> | undefined)?.narration;
  return {
    mediaPool: { ytUrl: "" },
    narration: {
      topic: narration?.topic || "",
      preset: narration?.template_id || "kenapa",
      duration: narration?.target_duration || 55,
    },
  };
}

interface EditorConfigState {
  shortsConfigs: Record<string, ShortsConfig>;
  getShortsConfig: (projectId: string, fallbackProject?: ProjectDetail | Project) => ShortsConfig;
  setShortsStepConfig: <K extends keyof ShortsConfig>(projectId: string, step: K, patch: Partial<ShortsConfig[K]>) => void;
}

export const useEditorConfigStore = create<EditorConfigState>((set, get) => ({
  shortsConfigs: {},

  getShortsConfig: (projectId, fallbackProject) => {
    const existing = get().shortsConfigs[projectId];
    if (existing) return existing;
    const initial = createDefaultShortsConfig(fallbackProject);
    set((state) => ({ shortsConfigs: { ...state.shortsConfigs, [projectId]: initial } }));
    return initial;
  },

  setShortsStepConfig: (projectId, step, patch) => {
    set((state) => {
      const current = state.shortsConfigs[projectId] || createDefaultShortsConfig();
      return {
        shortsConfigs: { ...state.shortsConfigs, [projectId]: { ...current, [step]: { ...current[step], ...patch } } },
      };
    });
  },
}));

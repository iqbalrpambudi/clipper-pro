"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type {
  Project,
  ProjectDetail,
  ShortsConfig,
  StoryboardConfig,
  ThumbnailTextLayer,
} from "@/types";
import { convertLegacyOverlayToLayers } from "@/components/storyboard/thumbnail/thumbnailPresets";

// ============================================================================
// DEFAULT FACTORIES
// ============================================================================

export function createDefaultShortsConfig(
  project?: Partial<ProjectDetail | Project>
): ShortsConfig {
  const wm = project?.watermark;
  const sub = project?.subtitle_style;

  return {
    mediaPool: {
      searchQuery: "",
      filterTag: "all",
      selectedVideoIds: [],
      ytUrl: "",
      ytDownloadResolution: "1080p",
    },
    narration: {
      language: project?.narration?.language || project?.language || "id",
      topic: project?.narration?.topic || project?.name || "",
      preset: "recap_cinematic",
      tone: project?.narration?.tone || "dramatis",
      duration: String(project?.narration?.target_duration || "60"),
      targetDurationSec: project?.narration?.target_duration || 60,
      additionalPrompt: "",
      category: "all",
      customPrompt: "",
    },
    tts: {
      provider: project?.audio?.provider || "gemini",
      model: project?.audio?.model || "gemini-2.5-flash-preview-tts",
      voice: project?.audio?.voice || "Puck",
      rate: typeof project?.audio?.rate === "number" ? project.audio.rate : 0,
      pitch: typeof project?.audio?.pitch === "number" ? project.audio.pitch : 0,
      customVoiceInput: "",
      runwareCustomVoiceInput: "",
      selectedVoicePresetId: "",
    },
    subtitle: {
      enabled: sub?.enabled !== false,
      presetId: "",
      style: sub || {},
      position: (sub?.position as any) || "bottom",
      customOffset: {
        x: sub?.offset_x ?? 0,
        y: sub?.offset_y ?? (sub?.position === "center" ? 0 : sub?.position === "top" ? 120 : -120),
      },
    },
    watermark: {
      enabled: wm?.enabled ?? false,
      watermark_type: wm?.watermark_type ?? "text",
      text: wm?.text ?? (project?.name || "CLIPER PRO"),
      font_family: wm?.font_family ?? "Poppins",
      font_size: wm?.font_size ?? 24,
      font_color: wm?.font_color ?? "#FFFFFF",
      opacity: wm?.opacity ?? 85,
      position: wm?.position ?? "bottom-right",
      offset_x: wm?.offset_x ?? 24,
      offset_y: wm?.offset_y ?? 24,
      custom_x: wm?.custom_x,
      custom_y: wm?.custom_y,
      customOffset: {
        x: wm?.custom_x ?? wm?.offset_x ?? 24,
        y: wm?.custom_y ?? wm?.offset_y ?? 24,
      },
    },
    timeline: {
      zoom: 1,
      snapToGrid: true,
      activeTrackId: null,
      audioVolume: 100,
      bgmVolume: 30,
    },
    render: {
      resolution: project?.resolution || "1080x1920",
      fps: 30,
      quality: "high",
      includeSubtitles: sub?.enabled !== false,
      includeWatermark: wm?.enabled ?? false,
    },
  };
}

export function createDefaultStoryboardConfig(
  project?: Partial<ProjectDetail | Project>
): StoryboardConfig {
  const meta = project?.youtube_metadata;
  const wm = project?.watermark;
  const sub = project?.subtitle_style;

  let initialLayers: ThumbnailTextLayer[] = [];
  if (meta?.thumbnail_overlay?.layers && meta.thumbnail_overlay.layers.length > 0) {
    initialLayers = meta.thumbnail_overlay.layers;
  } else {
    initialLayers = convertLegacyOverlayToLayers(
      meta?.thumbnail_overlay,
      project?.name || "MISTERI BESAR"
    );
  }

  return {
    script: {
      language: project?.narration?.language || project?.language || "id",
      topic: project?.narration?.topic || project?.name || "",
      preset: "",
      scriptPresetId: "",
      tone: project?.narration?.tone || "santai",
      durationMins: project?.narration?.target_duration
        ? Math.round(project.narration.target_duration / 60)
        : 5,
      imagesPerSegment: 2,
      customInstructions: "",
    },
    voice: {
      provider: project?.audio?.provider || "gemini",
      model: project?.audio?.model || "gemini-2.5-flash-preview-tts",
      voice: project?.audio?.voice || "Puck",
      rate: typeof project?.audio?.rate === "number" ? project.audio.rate : 0,
      pitch: typeof project?.audio?.pitch === "number" ? project.audio.pitch : 0,
      customVoiceInput: "",
      runwareCustomVoiceInput: "",
      selectedVoicePresetId: "",
    },
    visuals: {
      selectedPresetId: "",
      batchConcurrency: 3,
      promptOverrides: {},
    },
    timeline: {
      zoom: 1,
      snapToGrid: true,
      motionEffectDefault: "zoom_in",
      selectedItemId: null,
    },
    subtitle: {
      enabled: sub?.enabled !== false,
      presetId: "",
      style: sub || {},
      position: (sub?.position as any) || "bottom",
      customOffset: {
        x: sub?.offset_x ?? 0,
        y: sub?.offset_y ?? (sub?.position === "center" ? 0 : sub?.position === "top" ? 120 : -120),
      },
    },
    watermark: {
      enabled: wm?.enabled ?? false,
      watermark_type: wm?.watermark_type ?? "text",
      text: wm?.text ?? (project?.name || "CLIPER PRO"),
      font_family: wm?.font_family ?? "Poppins",
      font_size: wm?.font_size ?? 24,
      font_color: wm?.font_color ?? "#FFFFFF",
      opacity: wm?.opacity ?? 85,
      position: wm?.position ?? "bottom-right",
      offset_x: wm?.offset_x ?? 24,
      offset_y: wm?.offset_y ?? 24,
      custom_x: wm?.custom_x,
      custom_y: wm?.custom_y,
      customOffset: {
        x: wm?.custom_x ?? wm?.offset_x ?? 24,
        y: wm?.custom_y ?? wm?.offset_y ?? 24,
      },
    },
    render: {
      resolution: "1080p",
      fps: 30,
      includeSubtitles: sub?.enabled !== false,
      includeWatermark: wm?.enabled ?? false,
    },
    publishing: {
      thumbnail: {
        generator: {
          formula: "comic_reaction",
          focusAngle: "curiosity_gap",
          customPrompt: "",
          prompt: meta?.thumbnail_prompt || "",
          aspectRatio: "16:9",
        },
        activeBackgroundUrl: meta?.thumbnail_url || null,
        canvas: {
          width: 1920,
          height: 1080,
          selectedLayerId: initialLayers[0]?.id || null,
          activePresetId: null,
          layers: initialLayers,
          customPresets: meta?.thumbnail_overlay?.custom_presets || [],
        },
      },
      metadata: {
        language: (project?.narration?.language || project?.language || "id").toLowerCase(),
        title: meta?.title || "",
        description: meta?.description || "",
        tags: meta?.tags || [],
        titleOptions: meta?.title_options || [],
        thumbnailConcept: meta?.thumbnail_concept || "",
        category: "Film & Animation",
        privacyStatus: "unlisted",
        madeForKids: false,
      },
    },
  };
}

// ============================================================================
// DEBOUNCED AUTOSAVE TIMERS
// ============================================================================

const autosaveTimers: Record<string, NodeJS.Timeout> = {};

function scheduleAutosave(key: string, fn: () => Promise<unknown>, delayMs = 1200) {
  if (autosaveTimers[key]) {
    clearTimeout(autosaveTimers[key]);
  }
  autosaveTimers[key] = setTimeout(() => {
    delete autosaveTimers[key];
    fn().catch((err) => {
      console.warn(`[Autosave] Error saving ${key}:`, err);
    });
  }, delayMs);
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

interface EditorConfigState {
  shortsConfigs: Record<string, ShortsConfig>;
  storyboardConfigs: Record<string, StoryboardConfig>;

  // Shorts getters & setters
  getShortsConfig: (projectId: string, fallbackProject?: ProjectDetail | Project) => ShortsConfig;
  setShortsStepConfig: <K extends keyof ShortsConfig>(
    projectId: string,
    step: K,
    patch: Partial<ShortsConfig[K]>,
    autosaveToDb?: boolean
  ) => void;
  syncShortsConfigFromProject: (project: ProjectDetail | Project) => void;

  // Storyboard getters & setters
  getStoryboardConfig: (
    projectId: string,
    fallbackProject?: ProjectDetail | Project
  ) => StoryboardConfig;
  setStoryboardStepConfig: <K extends keyof StoryboardConfig>(
    projectId: string,
    step: K,
    patch: Partial<StoryboardConfig[K]>,
    autosaveToDb?: boolean
  ) => void;
  syncStoryboardConfigFromProject: (project: ProjectDetail | Project) => void;
}

export const useEditorConfigStore = create<EditorConfigState>((set, get) => ({
  shortsConfigs: {},
  storyboardConfigs: {},

  getShortsConfig: (projectId, fallbackProject) => {
    const existing = get().shortsConfigs[projectId];
    if (existing) return existing;

    const initial = createDefaultShortsConfig(fallbackProject);
    set((state) => ({
      shortsConfigs: { ...state.shortsConfigs, [projectId]: initial },
    }));
    return initial;
  },

  setShortsStepConfig: (projectId, step, patch, autosaveToDb = true) => {
    set((state) => {
      const current = state.shortsConfigs[projectId] || createDefaultShortsConfig();
      const updatedStep = { ...current[step], ...patch };
      const nextShortsConfig: ShortsConfig = { ...current, [step]: updatedStep };

      // Autosave triggers for persistent backend properties
      if (autosaveToDb) {
        if (step === "watermark") {
          const wm = updatedStep as ShortsConfig["watermark"];
          const customX = wm.customOffset?.x ?? wm.custom_x ?? wm.offset_x;
          const customY = wm.customOffset?.y ?? wm.custom_y ?? wm.offset_y;
          scheduleAutosave(`shorts_${projectId}_watermark`, () =>
            api.updateProject(projectId, {
              watermark: {
                ...wm,
                custom_x: customX,
                custom_y: customY,
                offset_x: customX,
                offset_y: customY,
              },
            })
          );
        } else if (step === "subtitle") {
          const sub = updatedStep as ShortsConfig["subtitle"];
          const pos = sub.position === "custom" ? "bottom" : (sub.position as "top" | "center" | "bottom");
          scheduleAutosave(`shorts_${projectId}_subtitle`, () =>
            api.updateSubtitleStyle(projectId, {
              ...(sub.style || {}),
              enabled: sub.enabled,
              position: pos,
              offset_x: sub.customOffset.x,
              offset_y: sub.customOffset.y,
            })
          );
        }
      }

      return {
        shortsConfigs: {
          ...state.shortsConfigs,
          [projectId]: nextShortsConfig,
        },
      };
    });
  },

  syncShortsConfigFromProject: (project) => {
    if (!project?.id) return;
    set((state) => {
      const existing = state.shortsConfigs[project.id];
      if (!existing) {
        return {
          shortsConfigs: {
            ...state.shortsConfigs,
            [project.id]: createDefaultShortsConfig(project),
          },
        };
      }
      const wm = project.watermark;
      const sub = project.subtitle_style;

      return {
        shortsConfigs: {
          ...state.shortsConfigs,
          [project.id]: {
            ...existing,
            watermark: {
              ...existing.watermark,
              enabled: wm?.enabled ?? existing.watermark.enabled,
              text: wm?.text ?? existing.watermark.text,
              font_color: wm?.font_color ?? existing.watermark.font_color,
              position: wm?.position ?? existing.watermark.position,
              custom_x: wm?.custom_x ?? existing.watermark.custom_x,
              custom_y: wm?.custom_y ?? existing.watermark.custom_y,
              offset_x: wm?.offset_x ?? existing.watermark.offset_x,
              offset_y: wm?.offset_y ?? existing.watermark.offset_y,
              customOffset: {
                x: wm?.custom_x ?? wm?.offset_x ?? existing.watermark.customOffset?.x ?? 24,
                y: wm?.custom_y ?? wm?.offset_y ?? existing.watermark.customOffset?.y ?? 24,
              },
            },
            subtitle: {
              ...existing.subtitle,
              enabled: sub?.enabled !== false,
              style: sub || existing.subtitle.style,
              position: (sub?.position as any) || existing.subtitle.position,
              customOffset: {
                x: sub?.offset_x ?? existing.subtitle.customOffset?.x ?? 0,
                y:
                  sub?.offset_y ??
                  existing.subtitle.customOffset?.y ??
                  (sub?.position === "center" ? 0 : sub?.position === "top" ? 120 : -120),
              },
            },
          },
        },
      };
    });
  },

  getStoryboardConfig: (projectId, fallbackProject) => {
    const existing = get().storyboardConfigs[projectId];
    if (existing) return existing;

    const initial = createDefaultStoryboardConfig(fallbackProject);
    set((state) => ({
      storyboardConfigs: { ...state.storyboardConfigs, [projectId]: initial },
    }));
    return initial;
  },

  setStoryboardStepConfig: (projectId, step, patch, autosaveToDb = true) => {
    set((state) => {
      const current = state.storyboardConfigs[projectId] || createDefaultStoryboardConfig();
      const updatedStep = { ...current[step], ...patch };
      const nextStoryboardConfig: StoryboardConfig = { ...current, [step]: updatedStep };

      // Autosave triggers for persistent backend properties
      if (autosaveToDb) {
        if (step === "watermark") {
          const wm = updatedStep as StoryboardConfig["watermark"];
          const customX = wm.customOffset?.x ?? wm.custom_x ?? wm.offset_x;
          const customY = wm.customOffset?.y ?? wm.custom_y ?? wm.offset_y;
          scheduleAutosave(`storyboard_${projectId}_watermark`, () =>
            api.updateProject(projectId, {
              watermark: {
                ...wm,
                custom_x: customX,
                custom_y: customY,
                offset_x: customX,
                offset_y: customY,
              },
            })
          );
        } else if (step === "subtitle") {
          const sub = updatedStep as StoryboardConfig["subtitle"];
          const pos = sub.position === "custom" ? "bottom" : (sub.position as "top" | "center" | "bottom");
          scheduleAutosave(`storyboard_${projectId}_subtitle`, () =>
            api.updateSubtitleStyle(projectId, {
              ...(sub.style || {}),
              enabled: sub.enabled,
              position: pos,
              offset_x: sub.customOffset.x,
              offset_y: sub.customOffset.y,
            })
          );
        } else if (step === "publishing") {
          const pub = updatedStep as StoryboardConfig["publishing"];
          scheduleAutosave(`storyboard_${projectId}_publishing`, () => {
            const firstLayer = pub.thumbnail.canvas.layers[0];
            const secondLayer = pub.thumbnail.canvas.layers[1];
            return api.updateYouTubeMetadata(projectId, {
              title: pub.metadata.title.trim(),
              title_options: pub.metadata.titleOptions,
              description: pub.metadata.description.trim(),
              tags: pub.metadata.tags,
              thumbnail_prompt: pub.thumbnail.generator.prompt.trim(),
              thumbnail_concept: pub.metadata.thumbnailConcept.trim(),
              thumbnail_url: pub.thumbnail.activeBackgroundUrl || undefined,
              thumbnail_hook_line1: firstLayer?.text || "",
              thumbnail_hook_line2: secondLayer?.text || "",
              thumbnail_overlay: {
                enabled: true,
                line1: firstLayer?.text || "",
                line2: secondLayer?.text || "",
                color1: firstLayer?.fill || "#FFFFFF",
                color2: secondLayer?.fill || "#FFE600",
                position: "custom",
                font_family: firstLayer?.fontFamily || "Anton",
                font_size: firstLayer?.fontSize || 56,
                rotation: firstLayer?.rotation || 0,
                layers: pub.thumbnail.canvas.layers,
                custom_presets: pub.thumbnail.canvas.customPresets,
              },
            });
          });
        }
      }

      return {
        storyboardConfigs: {
          ...state.storyboardConfigs,
          [projectId]: nextStoryboardConfig,
        },
      };
    });
  },

  syncStoryboardConfigFromProject: (project) => {
    if (!project?.id) return;
    set((state) => {
      const existing = state.storyboardConfigs[project.id];
      if (!existing) {
        return {
          storyboardConfigs: {
            ...state.storyboardConfigs,
            [project.id]: createDefaultStoryboardConfig(project),
          },
        };
      }
      const meta = project.youtube_metadata;
      const wm = project.watermark;
      const sub = project.subtitle_style;

      return {
        storyboardConfigs: {
          ...state.storyboardConfigs,
          [project.id]: {
            ...existing,
            watermark: {
              ...existing.watermark,
              enabled: wm?.enabled ?? existing.watermark.enabled,
              text: wm?.text ?? existing.watermark.text,
              font_color: wm?.font_color ?? existing.watermark.font_color,
              position: wm?.position ?? existing.watermark.position,
              custom_x: wm?.custom_x ?? existing.watermark.custom_x,
              custom_y: wm?.custom_y ?? existing.watermark.custom_y,
              offset_x: wm?.offset_x ?? existing.watermark.offset_x,
              offset_y: wm?.offset_y ?? existing.watermark.offset_y,
              customOffset: {
                x: wm?.custom_x ?? wm?.offset_x ?? existing.watermark.customOffset?.x ?? 24,
                y: wm?.custom_y ?? wm?.offset_y ?? existing.watermark.customOffset?.y ?? 24,
              },
            },
            subtitle: {
              ...existing.subtitle,
              enabled: sub?.enabled !== false,
              style: sub || existing.subtitle.style,
              position: (sub?.position as any) || existing.subtitle.position,
              customOffset: {
                x: sub?.offset_x ?? existing.subtitle.customOffset?.x ?? 0,
                y:
                  sub?.offset_y ??
                  existing.subtitle.customOffset?.y ??
                  (sub?.position === "center" ? 0 : sub?.position === "top" ? 120 : -120),
              },
            },
            publishing: {
              ...existing.publishing,
              metadata: {
                ...existing.publishing.metadata,
                title: meta?.title ?? existing.publishing.metadata.title,
                description: meta?.description ?? existing.publishing.metadata.description,
                tags: meta?.tags ?? existing.publishing.metadata.tags,
                titleOptions: meta?.title_options ?? existing.publishing.metadata.titleOptions,
                thumbnailConcept:
                  meta?.thumbnail_concept ?? existing.publishing.metadata.thumbnailConcept,
              },
              thumbnail: {
                ...existing.publishing.thumbnail,
                activeBackgroundUrl:
                  meta?.thumbnail_url ?? existing.publishing.thumbnail.activeBackgroundUrl,
                generator: {
                  ...existing.publishing.thumbnail.generator,
                  prompt:
                    meta?.thumbnail_prompt ?? existing.publishing.thumbnail.generator.prompt,
                },
                canvas: {
                  ...existing.publishing.thumbnail.canvas,
                  layers:
                    meta?.thumbnail_overlay?.layers && meta.thumbnail_overlay.layers.length > 0
                      ? meta.thumbnail_overlay.layers
                      : existing.publishing.thumbnail.canvas.layers,
                  customPresets:
                    meta?.thumbnail_overlay?.custom_presets ??
                    existing.publishing.thumbnail.canvas.customPresets,
                },
              },
            },
          },
        },
      };
    });
  },
}));

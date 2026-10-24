import { create } from "zustand";
import type { SubtitleStyle } from "@/types";

export type StudioTab =
  | "media"
  | "narration"
  | "tts"
  | "timeline"
  | "subtitles"
  | "render"
  | "storyboard_script"
  | "storyboard_voice"
  | "storyboard_images"
  | "storyboard_timeline"
  | "storyboard_watermark"
  | "storyboard_render"
  | "storyboard_youtube";

export interface TaskEvent {
  project_id: string;
  task_type:
    | "youtube_download"
    | "scene_detect"
    | "scene_retag"
    | "scene_transcribe"
    | "narration_generate"
    | "tts_align"
    | "render"
    | "storyboard_images";
  status: "queued" | "progress" | "success" | "error";
  progress: number;
  stage: string;
  message: string;
  error?: string | null;
  data?: Record<string, unknown>;
  timestamp?: string;
}

const SHORT_TABS: StudioTab[] = ["media", "narration", "tts", "timeline", "render"];
const STORYBOARD_TABS: StudioTab[] = [
  "storyboard_script", "storyboard_voice", "storyboard_images",
  "storyboard_timeline", "storyboard_render", "storyboard_youtube",
];

const SHORT_FALLBACK: Record<string, StudioTab> = {
  storyboard_script: "narration",
  storyboard_voice: "tts",
  storyboard_timeline: "timeline",
  storyboard_render: "render",
};

const STORYBOARD_FALLBACK: Record<string, StudioTab> = {
  narration: "storyboard_script",
  tts: "storyboard_voice",
  timeline: "storyboard_timeline",
  storyboard_watermark: "storyboard_timeline",
  render: "storyboard_render",
};

function normalizeTab(tab: StudioTab, mode: "short" | "storyboard" | null): StudioTab {
  if (!mode) return tab;
  if (mode === "short") {
    if (SHORT_TABS.includes(tab)) return tab;
    return SHORT_FALLBACK[tab] ?? "media";
  }
  if (STORYBOARD_TABS.includes(tab)) return tab;
  return STORYBOARD_FALLBACK[tab] ?? "storyboard_script";
}

interface StudioState {
  projectMode: "short" | "storyboard" | null;
  setProjectMode: (mode: "short" | "storyboard" | null) => void;

  activeTab: StudioTab;
  setActiveTab: (tab: StudioTab) => void;

  currentTime: number;
  setCurrentTime: (time: number) => void;

  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;

  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;

  isFastPreviewRunning: boolean;
  setIsFastPreviewRunning: (running: boolean) => void;

  // Active Project Scoping
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // Multi-project Isolated Task Tracking
  tasksByProject: Record<string, TaskEvent | null>;
  setProjectTask: (projectId: string, task: TaskEvent | null) => void;
  getProjectTask: (projectId: string) => TaskEvent | null;

  // Active Task for current project (backwards-compatible)
  activeTask: TaskEvent | null;
  setActiveTask: (task: TaskEvent | null, projectId?: string) => void;

  // Tab Drafts Persistence Across Tab Switches
  voiceDraftsByProject: Record<string, VoiceDraftState>;
  setVoiceDraft: (projectId: string, draft: Partial<VoiceDraftState>) => void;
  getVoiceDraft: (projectId: string) => VoiceDraftState | undefined;

  scriptDraftsByProject: Record<string, ScriptDraftState>;
  setScriptDraft: (projectId: string, draft: Partial<ScriptDraftState>) => void;
  getScriptDraft: (projectId: string) => ScriptDraftState | undefined;

  subtitleDraftsByProject: Record<string, SubtitleDraftState>;
  setSubtitleDraft: (projectId: string, draft: Partial<SubtitleDraftState>) => void;
  getSubtitleDraft: (projectId: string) => SubtitleDraftState | undefined;

  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}

export interface VoiceDraftState {
  provider?: string;
  voice?: string;
  geminiModel?: string;
  elevenlabsModel?: string;
  runwareModel?: string;
  rate?: number | string;
  pitch?: number | string;
  customVoiceInput?: string;
  runwareCustomVoiceInput?: string;
  selectedVoicePresetId?: string;
}

export interface ScriptDraftState {
  durationMins?: number;
  tone?: string;
  selectedPresetId?: string;
  selectedScriptPresetId?: string;
  imagesPerSegment?: number;
  customInstructions?: string;
  topic?: string;
}

export interface SubtitleDraftState {
  style?: Partial<SubtitleStyle>;
  selectedPresetId?: string;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  projectMode: null,
  setProjectMode: (projectMode) => {
    const { activeTab } = get();
    set({ projectMode, activeTab: normalizeTab(activeTab, projectMode) });
  },

  activeTab: "media",
  setActiveTab: (tab) => {
    const { projectMode } = get();
    set({ activeTab: normalizeTab(tab, projectMode) });
  },

  currentTime: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),

  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  selectedSceneId: null,
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),

  isFastPreviewRunning: false,
  setIsFastPreviewRunning: (isFastPreviewRunning) => set({ isFastPreviewRunning }),

  currentProjectId: null,
  setCurrentProjectId: (currentProjectId) => {
    set((state) => ({
      currentProjectId,
      activeTask: currentProjectId ? state.tasksByProject[currentProjectId] || null : null,
    }));
  },

  tasksByProject: {},
  setProjectTask: (projectId, task) => {
    set((state) => {
      const nextTasks = { ...state.tasksByProject, [projectId]: task };
      return {
        tasksByProject: nextTasks,
        activeTask: state.currentProjectId === projectId ? task : state.activeTask,
      };
    });
  },
  getProjectTask: (projectId) => {
    return get().tasksByProject[projectId] || null;
  },

  activeTask: null,
  setActiveTask: (task, projectId) => {
    set((state) => {
      const targetProjectId = task?.project_id || projectId || state.currentProjectId;
      if (!targetProjectId) {
        return { activeTask: task };
      }
      const nextTasks = { ...state.tasksByProject, [targetProjectId]: task };
      return {
        tasksByProject: nextTasks,
        activeTask: state.currentProjectId === targetProjectId ? task : state.activeTask,
      };
    });
  },

  voiceDraftsByProject: {},
  setVoiceDraft: (projectId, draft) => {
    set((state) => ({
      voiceDraftsByProject: {
        ...state.voiceDraftsByProject,
        [projectId]: { ...(state.voiceDraftsByProject[projectId] || {}), ...draft },
      },
    }));
  },
  getVoiceDraft: (projectId) => {
    return get().voiceDraftsByProject[projectId];
  },

  scriptDraftsByProject: {},
  setScriptDraft: (projectId, draft) => {
    set((state) => ({
      scriptDraftsByProject: {
        ...state.scriptDraftsByProject,
        [projectId]: { ...(state.scriptDraftsByProject[projectId] || {}), ...draft },
      },
    }));
  },
  getScriptDraft: (projectId) => {
    return get().scriptDraftsByProject[projectId];
  },

  subtitleDraftsByProject: {},
  setSubtitleDraft: (projectId, draft) => {
    set((state) => ({
      subtitleDraftsByProject: {
        ...state.subtitleDraftsByProject,
        [projectId]: { ...(state.subtitleDraftsByProject[projectId] || {}), ...draft },
      },
    }));
  },
  getSubtitleDraft: (projectId) => {
    return get().subtitleDraftsByProject[projectId];
  },

  toast: null,

  showToast: (message, type = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => {
      set({ toast: null });
    }, 4000);
  },
  hideToast: () => set({ toast: null }),
}));

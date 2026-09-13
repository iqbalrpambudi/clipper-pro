import { create } from "zustand";

export type StudioTab = "media" | "narration" | "tts" | "timeline" | "subtitles" | "render";

export interface TaskEvent {
  project_id: string;
  task_type: "youtube_download" | "scene_detect" | "scene_retag" | "scene_transcribe" | "tts_align" | "render";
  status: "queued" | "progress" | "success" | "error";
  progress: number;
  stage: string;
  message: string;
  error?: string | null;
  data?: Record<string, any>;
  timestamp?: string;
}

interface StudioState {
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

  activeTask: TaskEvent | null;
  setActiveTask: (task: TaskEvent | null) => void;

  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}


export const useStudioStore = create<StudioState>((set) => ({
  activeTab: "media",
  setActiveTab: (activeTab) => set({ activeTab }),

  currentTime: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),

  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  selectedSceneId: null,
  setSelectedSceneId: (selectedSceneId) => set({ selectedSceneId }),

  isFastPreviewRunning: false,
  setIsFastPreviewRunning: (isFastPreviewRunning) => set({ isFastPreviewRunning }),

  activeTask: null,
  setActiveTask: (activeTask) => set({ activeTask }),

  toast: null,

  showToast: (message, type = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => {
      set({ toast: null });
    }, 4000);
  },
  hideToast: () => set({ toast: null }),
}));

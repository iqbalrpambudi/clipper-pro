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

  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}


export const useStudioStore = create<StudioState>((set, get) => ({
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

  toast: null,

  showToast: (message, type = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => {
      set({ toast: null });
    }, 4000);
  },
  hideToast: () => set({ toast: null }),
}));

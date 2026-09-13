import {
  Project,
  SourceVideo,
  Scene,
  Narration,
  NarrationTemplate,
  AudioTrack,
  Timeline,
  SubtitleStyle,
  RenderJob,
  VoiceInfo,
  ModelConfig,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...(!(options.body instanceof FormData) && { "Content-Type": "application/json" }),
    ...options.headers,
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let detail = "Terjadi kesalahan saat memproses data";
    try {
      const errJson = await res.json();
      detail = errJson.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  // Handle 204 No Content or empty responses gracefully without JSON parsing crash
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return {} as T;
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    return {} as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {} as T;
  }
}

export const api = {
  // Projects
  getProjects: () => request<Project[]>("/api/v1/projects"),
  getProject: (id: string) => request<Project & { source_videos: SourceVideo[]; scenes: Scene[]; narration?: Narration | null; audio?: AudioTrack | null; timeline?: Timeline | null; subtitle_style?: SubtitleStyle | null; render_jobs?: RenderJob[] }>(`/api/v1/projects/${id}`),
  createProject: (data: { name: string; description?: string; aspect_ratio?: string; resolution?: string }) =>
    request<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'aspect_ratio' | 'resolution' | 'background_fill'>>) =>
    request<Project>(`/api/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<void>(`/api/v1/projects/${id}`, { method: "DELETE" }),

  // Media & YouTube
  uploadMedia: (projectId: string, formData: FormData) =>
    request<SourceVideo[]>(`/api/v1/projects/${projectId}/media/upload`, {
      method: "POST",
      body: formData,
    }),
  getYTInfo: (projectId: string, url: string) =>
    request<any>(`/api/v1/projects/${projectId}/media/yt-info`, {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  downloadYT: (projectId: string, url: string, formatId?: string, title?: string) =>
    request<SourceVideo>(`/api/v1/projects/${projectId}/media/yt-download`, {
      method: "POST",
      body: JSON.stringify({ url, format_id: formatId, title }),
    }),
  deleteMedia: (projectId: string, videoId: string) =>
    request<void>(`/api/v1/projects/${projectId}/media/${videoId}`, { method: "DELETE" }),

  // Scenes
  getScenes: (projectId: string) =>
    request<Scene[]>(`/api/v1/projects/${projectId}/scenes`),
  retagScenes: (projectId: string, mode: "quick" | "force" = "quick") =>
    request<{ message: string; count: number; total: number; model: string; mode: string }>(
      `/api/v1/projects/${projectId}/scenes/retag`,
      {
        method: "POST",
        body: JSON.stringify({ mode, batch_size: 5 }),
      }
    ),
  transcribeScenes: (projectId: string, language: string = "id") =>
    request<{ message: string; total_scenes: number }>(
      `/api/v1/projects/${projectId}/scenes/transcribe`,
      {
        method: "POST",
        body: JSON.stringify({ language }),
      }
    ),

  // Templates & Narration
  getTemplates: () => request<NarrationTemplate[]>("/api/v1/templates"),
  createTemplate: (data: Partial<NarrationTemplate>) =>
    request<NarrationTemplate>("/api/v1/templates", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: string, data: Partial<NarrationTemplate>) =>
    request<NarrationTemplate>(`/api/v1/templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  resetTemplate: (id: string) =>
    request<NarrationTemplate>(`/api/v1/templates/${id}/reset`, {
      method: "POST",
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/api/v1/templates/${id}`, {
      method: "DELETE",
    }),
  generateNarration: (projectId: string, data: { template_id: string; topic?: string; tone: string; target_duration: number; custom_prompt?: string }) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateNarration: (projectId: string, data: { raw_text: string; segments?: any[] }) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateNarrationSegments: (projectId: string, segments: any[]) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration/segments`, {
      method: "PUT",
      body: JSON.stringify({ segments }),
    }),

  // Voice & TTS
  getVoices: () => request<VoiceInfo[]>("/api/v1/tts/voices"),
  estimateCost: (text: string, provider: string = "gemini") =>
    request<any>("/api/v1/tts/estimate-cost", {
      method: "POST",
      body: JSON.stringify({ text, provider }),
    }),
  generateTTS: (projectId: string, data: { provider?: string; voice?: string; rate?: string; pitch?: string }) =>
    request<AudioTrack>(`/api/v1/projects/${projectId}/tts/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Timeline
  autoMatchTimeline: (projectId: string) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline/auto-match`, { method: "POST" }),
  getTimeline: (projectId: string) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline`),
  updateTimeline: (projectId: string, data: { clips: any[]; total_duration?: number }) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  clearTimeline: (projectId: string) =>
    request<any>(`/api/v1/projects/${projectId}/timeline`, {
      method: "DELETE",
    }),

  // Subtitles
  getSubtitlePresets: () => request<any[]>("/api/v1/subtitles/presets"),
  getSubtitleStyle: (projectId: string) =>
    request<SubtitleStyle>(`/api/v1/projects/${projectId}/subtitles/style`),
  updateSubtitleStyle: (projectId: string, data: any) =>
    request<SubtitleStyle>(`/api/v1/projects/${projectId}/subtitles/style`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  previewASS: (projectId: string) =>
    request<{ ass_content: string; line_count: number }>(`/api/v1/projects/${projectId}/subtitles/preview-ass`),
  matchSubtitleWithAudio: (projectId: string) =>
    request<Narration>(`/api/v1/projects/${projectId}/subtitles/match-audio`, {
      method: "POST",
    }),
  getSubtitleExportUrl: (projectId: string, format: "ass" | "srt" | "vtt") =>
    `/api/v1/projects/${projectId}/subtitles/export?format=${format}`,

  // Rendering
  renderFinal: (projectId: string) =>
    request<RenderJob>(`/api/v1/projects/${projectId}/render`, { method: "POST" }),
  renderPreview: (projectId: string) =>
    request<RenderJob>(`/api/v1/projects/${projectId}/render/preview`, { method: "POST" }),
  getRenderJobs: (projectId: string) =>
    request<RenderJob[]>(`/api/v1/projects/${projectId}/render/jobs`),
  deleteRenderJob: (projectId: string, jobId: string) =>
    request<{ success: boolean; job_id: string; freed_bytes: number; message: string }>(
      `/api/v1/projects/${projectId}/render/jobs/${jobId}`,
      { method: "DELETE" }
    ),
  clearRenderJobs: (projectId: string) =>
    request<{ success: boolean; count: number; freed_bytes: number; message: string }>(
      `/api/v1/projects/${projectId}/render/jobs`,
      { method: "DELETE" }
    ),

  // Settings
  getModelConfig: () => request<ModelConfig>("/api/v1/settings/config"),
  saveModelConfig: (data: { base_url?: string | null; chat_model: string; vision_model: string; api_key?: string; tts_provider?: string; tts_api_key?: string }) =>
    request<ModelConfig>("/api/v1/settings/config", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  testConnection: (data: { base_url?: string; chat_model: string; vision_model: string; api_key?: string }) =>
    request<{ success: boolean; message: string; latency_ms?: number }>("/api/v1/settings/test-connection", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getAvailableModels: (baseUrl?: string, apiKey?: string) => {
    const params = new URLSearchParams();
    if (baseUrl) params.set("base_url", baseUrl);
    if (apiKey) params.set("api_key", apiKey);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<{ models: string[] }>(`/api/v1/settings/models${query}`);
  },
};

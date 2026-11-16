import {
  Project,
  ProjectDetail,
  SourceVideo,
  Hardsub,
  Scene,
  SentenceSegment,
  Narration,
  NarrationTemplate,
  AudioTrack,
  Timeline,
  TimelineClip,
  SubtitleStyle,
  RenderJob,
  VoiceInfo,
  ModelConfig,
  ProjectDefaultsConfig,
  ProjectDefaultsResponse,
  QCConfig,
  QCLatestResponse,
  QCRun,
  TTSConfig,
  WatermarkConfig,
  YTInfoResponse,
  CostEstimateResponse,
  PresetCategory,
  VideoSearchRequest,
  VideoSearchResponse,
  VideoImportRequest,
  VideoImportResponse,
  YouTubeAccountStatus,
  AutopilotConfig,
  AutopilotStatus,
  AutopilotRun,
  YouTubePrivacy,
  YouTubeUpload,
} from "@/types";
import { API_BASE_URL, resolveApiUrl } from "@/env";

const BASE_URL = API_BASE_URL;
const REQUEST_TIMEOUT_MS = 120_000;

/** FastAPI returns `detail` as a string, or a list of {loc,msg} for 422s. */
function formatErrorDetail(errJson: unknown, fallback: string): string {
  if (!errJson || typeof errJson !== "object") return fallback;
  const detail = (errJson as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return (
      detail
        .map((d: unknown) => {
          if (typeof d === "string") return d;
          if (d && typeof d === "object" && "msg" in d) {
            return String((d as { msg: unknown }).msg);
          }
          return JSON.stringify(d);
        })
        .join("; ") || fallback
    );
  }
  if (detail) return JSON.stringify(detail);
  return fallback;
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...(!(options.body instanceof FormData) && { "Content-Type": "application/json" }),
    ...options.headers,
  };

  // Abort hung requests so a dead backend surfaces as an error, not a spinner forever.
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Permintaan ke server timeout atau dibatalkan");
    }
    throw new Error("Tidak dapat terhubung ke server API");
  }
  clearTimeout(timer);

  if (!res.ok) {
    let fallback = `Gagal memuat data (HTTP ${res.status})`;
    try {
      fallback = formatErrorDetail(await res.json(), fallback);
    } catch {
      /* ignore json parse error */
    }
    throw new Error(fallback);
  }

  // 204 No Content: nothing to parse.
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Respons server bukan JSON yang valid");
  }
}

export const api = {
  // Projects
  getProjects: () => request<Project[]>("/api/v1/projects"),
  getProject: (id: string) => request<ProjectDetail>(`/api/v1/projects/${id}`),
  createProject: (data: {
    name: string;
    description?: string;
    project_type?: string;
    aspect_ratio?: string;
    resolution?: string;
    language?: string;
    watermark?: WatermarkConfig;
    tts_config?: TTSConfig;
    qc_config?: QCConfig;
    world_setting?: Record<string, unknown>;
  }) => request<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (
    id: string,
    data: Partial<
      Pick<
        Project,
        | "name"
        | "description"
        | "project_type"
        | "aspect_ratio"
        | "resolution"
        | "background_fill"
        | "watermark"
        | "tts_config"
        | "qc_config"
        | "language"
      >
    >
  ) => request<Project>(`/api/v1/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  getProjectConfigExportUrl: (projectId: string) =>
    resolveApiUrl(`/api/v1/projects/${projectId}/config/export`),
  deleteProject: (id: string) => request<void>(`/api/v1/projects/${id}`, { method: "DELETE" }),

  // Video Discovery & Scouting
  getDiscoveryPresets: () => request<PresetCategory[]>("/api/v1/discovery/presets"),
  searchVideoCandidates: (params: VideoSearchRequest) =>
    request<VideoSearchResponse>("/api/v1/discovery/search", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  importDiscoveredVideo: (params: VideoImportRequest) =>
    request<VideoImportResponse>("/api/v1/discovery/import", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  // Media & YouTube
  uploadMedia: (projectId: string, formData: FormData) =>
    request<SourceVideo[]>(`/api/v1/projects/${projectId}/media/upload`, {
      method: "POST",
      body: formData,
    }),
  getYTInfo: (projectId: string, url: string, trim?: { start_sec?: number; end_sec?: number }) =>
    request<YTInfoResponse>(`/api/v1/projects/${projectId}/media/yt-info`, {
      method: "POST",
      body: JSON.stringify({ url, ...trim }),
    }),
  downloadYT: (
    projectId: string,
    url: string,
    formatId?: string,
    title?: string,
    trim?: { start_sec?: number; end_sec?: number }
  ) =>
    request<SourceVideo>(`/api/v1/projects/${projectId}/media/yt-download`, {
      method: "POST",
      body: JSON.stringify({ url, format_id: formatId, title, ...trim }),
    }),
  deleteMedia: (projectId: string, videoId: string) =>
    request<void>(`/api/v1/projects/${projectId}/media/${videoId}`, { method: "DELETE" }),
  updateSourceVideo: (projectId: string, videoId: string, data: { hardsub: Omit<Hardsub, "source"> }) =>
    request<SourceVideo>(`/api/v1/projects/${projectId}/media/${videoId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  cancelMedia: (projectId: string, videoId: string) =>
    request<{ status: string; message: string }>(
      `/api/v1/projects/${projectId}/media/${videoId}/cancel`,
      { method: "POST" }
    ),

  // Background Tasks / Worker Cancellation
  cancelProjectTasks: (projectId: string) =>
    request<{
      status: string;
      message: string;
      cancelled_videos: number;
      cancelled_renders: number;
      cancelled_audio: number;
    }>(`/api/v1/projects/${projectId}/tasks/cancel`, { method: "POST" }),

  // Scenes
  getScenes: (projectId: string) => request<Scene[]>(`/api/v1/projects/${projectId}/scenes`),
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
  repairThumbnails: (projectId: string) =>
    request<{ message: string; repaired: number; total: number }>(
      `/api/v1/projects/${projectId}/scenes/repair-thumbnails`,
      {
        method: "POST",
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
  deleteTemplate: (id: string) =>
    request<void>(`/api/v1/templates/${id}`, {
      method: "DELETE",
    }),
  generateNarration: (
    projectId: string,
    data: { template_id: string; topic?: string; target_duration: number }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateNarration: (
    projectId: string,
    data: { raw_text: string; segments?: SentenceSegment[]; language?: string }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  updateNarrationSegments: (projectId: string, segments: SentenceSegment[]) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration/segments`, {
      method: "PUT",
      body: JSON.stringify({ segments }),
    }),

  // Voice & TTS
  getVoices: () => request<VoiceInfo[]>("/api/v1/tts/voices"),
  getBgmMoods: () => request<string[]>("/api/v1/tts/bgm/moods"),
  getElevenLabsVoices: (apiKey?: string) =>
    request<VoiceInfo[]>(
      `/api/v1/tts/elevenlabs/voices${apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : ""}`
    ),
  estimateCost: (text: string, provider: string = "gemini") =>
    request<CostEstimateResponse>("/api/v1/tts/estimate-cost", {
      method: "POST",
      body: JSON.stringify({ text, provider }),
    }),
  generateTTS: (
    projectId: string,
    data: {
      provider?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
      model?: string;
      language?: string;
    }
  ) =>
    request<AudioTrack>(`/api/v1/projects/${projectId}/tts/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  realignTTS: (
    projectId: string,
    data?: {
      offset_ms?: number;
      language?: string;
      model_size?: string;
      segments?: SentenceSegment[];
    }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/tts/realign`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  // Timeline
  autoMatchTimeline: (projectId: string) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline/auto-match`, { method: "POST" }),
  updateTimeline: (
    projectId: string,
    data: {
      clips: TimelineClip[];
      total_duration?: number;
      has_audio?: boolean;
      has_subtitles?: boolean;
    }
  ) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  clearTimeline: (
    projectId: string,
    options?: { clear_audio?: boolean; clear_subtitles?: boolean }
  ) => {
    const params = new URLSearchParams();
    if (options?.clear_audio !== undefined) params.set("clear_audio", String(options.clear_audio));
    if (options?.clear_subtitles !== undefined)
      params.set("clear_subtitles", String(options.clear_subtitles));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<Timeline>(`/api/v1/projects/${projectId}/timeline${qs}`, {
      method: "DELETE",
    });
  },
  readdNarrationToTimeline: (
    projectId: string,
    options?: { readd_audio?: boolean; readd_subtitles?: boolean }
  ) => {
    const params = new URLSearchParams();
    if (options?.readd_audio !== undefined) params.set("readd_audio", String(options.readd_audio));
    if (options?.readd_subtitles !== undefined)
      params.set("readd_subtitles", String(options.readd_subtitles));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<Timeline>(`/api/v1/projects/${projectId}/timeline/readd-narration${qs}`, {
      method: "POST",
    });
  },

  // Subtitles
  updateSubtitleStyle: (projectId: string, data: SubtitleStyle) =>
    request<SubtitleStyle>(`/api/v1/projects/${projectId}/subtitles/style`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  /** Same ASS generator as the final render, fed the unsaved style for the live preview. */
  renderAss: (projectId: string, style: SubtitleStyle, segments: SentenceSegment[]) =>
    request<{ ass_content: string; line_count: number }>(`/api/v1/projects/${projectId}/subtitles/render-ass`, {
      method: "POST",
      body: JSON.stringify({ style, segments }),
    }),
  previewASS: (projectId: string) =>
    request<{ ass_content: string; line_count: number }>(`/api/v1/projects/${projectId}/subtitles/preview-ass`),
  getSubtitleExportUrl: (projectId: string, format: "ass" | "srt") =>
    resolveApiUrl(`/api/v1/projects/${projectId}/subtitles/export?format=${format}`),

  // Rendering
  renderFinal: (projectId: string, options?: { resolution?: string }) =>
    request<RenderJob>(`/api/v1/projects/${projectId}/render`, {
      method: "POST",
      body: options?.resolution ? JSON.stringify({ resolution: options.resolution }) : undefined,
      headers: options?.resolution ? { "Content-Type": "application/json" } : undefined,
    }),
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
  cancelRenderJob: (projectId: string, jobId: string) =>
    request<{ status: string; message: string }>(
      `/api/v1/projects/${projectId}/render/jobs/${jobId}/cancel`,
      { method: "POST" }
    ),

  // Settings
  getModelConfig: () => request<ModelConfig>("/api/v1/settings/config"),
  saveModelConfig: (data: {
    base_url?: string | null;
    chat_model?: string;
    vision_model?: string;
    api_key?: string;
    tts_provider?: string;
    tts_api_key?: string;
    elevenlabs_api_key?: string;
    elevenlabs_model?: string;
  }) =>
    request<ModelConfig>("/api/v1/settings/config", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  testConnection: (data: {
    base_url?: string;
    chat_model: string;
    vision_model: string;
    api_key?: string;
  }) =>
    request<{ success: boolean; message: string; latency_ms?: number }>(
      "/api/v1/settings/test-connection",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  testTtsConnection: (data: {
    provider?: string;
    api_key?: string;
    model?: string;
    voice?: string;
  }) =>
    request<{ success: boolean; message: string; latency_ms?: number; provider_status?: string }>(
      "/api/v1/settings/test-tts-connection",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  getAvailableModels: (baseUrl?: string, apiKey?: string) => {
    const query = baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : "";
    // Key travels in a header, not the query string, so it stays out of logs.
    return request<{ models: string[] }>(
      `/api/v1/settings/models${query}`,
      {
        headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
      }
    );
  },

  // Project Defaults (config.json)
  getProjectDefaults: () => request<ProjectDefaultsResponse>("/api/v1/settings/project-defaults"),
  saveProjectDefaults: (data: ProjectDefaultsConfig) =>
    request<ProjectDefaultsResponse>("/api/v1/settings/project-defaults", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  importProjectDefaults: (data: Partial<ProjectDefaultsConfig> | Record<string, unknown>) =>
    request<ProjectDefaultsResponse>("/api/v1/settings/project-defaults/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  resetProjectDefaults: () =>
    request<ProjectDefaultsResponse>("/api/v1/settings/project-defaults/reset", {
      method: "POST",
    }),
  getProjectDefaultsExportUrl: () => resolveApiUrl("/api/v1/settings/project-defaults/export"),

  // AI Quality Control (QC)
  getQCRuns: (projectId: string, gate?: "script" | "timeline") =>
    request<QCRun[]>(
      `/api/v1/projects/${projectId}/qc/runs${gate ? `?gate=${encodeURIComponent(gate)}` : ""}`
    ),
  getLatestQC: (projectId: string) =>
    request<QCLatestResponse>(`/api/v1/projects/${projectId}/qc/latest`),
  runProjectQC: (
    projectId: string,
    data: { gate: "script" | "timeline"; auto_fix?: boolean }
  ) =>
    request<QCRun>(`/api/v1/projects/${projectId}/qc/run`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  revertQCRun: (projectId: string, runId: string) =>
    request<QCRun>(`/api/v1/projects/${projectId}/qc/runs/${runId}/revert`, {
      method: "POST",
    }),

  // Autopilot
  getAutopilot: () => request<AutopilotStatus>("/api/v1/autopilot"),
  saveAutopilot: (data: AutopilotConfig) =>
    request<AutopilotStatus>("/api/v1/autopilot", { method: "PUT", body: JSON.stringify(data) }),
  getAutopilotRuns: () => request<AutopilotRun[]>("/api/v1/autopilot/runs"),
  produceAutopilotNow: () =>
    request<{ status: string }>("/api/v1/autopilot/produce-now", { method: "POST" }),
  discardPoolVideo: (runId: string) =>
    request<AutopilotRun>(`/api/v1/autopilot/runs/${runId}`, { method: "DELETE" }),

  // Publish (YouTube)
  getYouTubeAccount: () => request<YouTubeAccountStatus>("/api/v1/youtube/account"),
  saveYouTubeCredentials: (data: { client_id: string; client_secret?: string }) =>
    request<YouTubeAccountStatus>("/api/v1/youtube/account/credentials", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  startYouTubeOAuth: () =>
    request<{ auth_url: string }>("/api/v1/youtube/oauth/start", { method: "POST" }),
  disconnectYouTube: () =>
    request<YouTubeAccountStatus>("/api/v1/youtube/account/connection", { method: "DELETE" }),
  getYouTubeUploads: (projectId: string) =>
    request<YouTubeUpload[]>(`/api/v1/projects/${projectId}/publish/youtube`),
  publishToYouTube: (
    projectId: string,
    data: {
      render_job_id?: string;
      title: string;
      description: string;
      tags: string[];
      privacy: YouTubePrivacy;
      publish_at?: string | null;
    }
  ) =>
    request<YouTubeUpload>(`/api/v1/projects/${projectId}/publish/youtube`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

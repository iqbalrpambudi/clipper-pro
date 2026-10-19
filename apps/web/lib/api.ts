import {
  Project,
  SourceVideo,
  Scene,
  Narration,
  NarrationTemplate,
  AudioTrack,
  Timeline,
  SubtitleStyle,
  SubtitlePreset,
  RenderJob,
  VoiceInfo,
  ModelConfig,
  StoryboardItem,
  StoryboardCharacter,
  StoryboardLocation,
  StoryboardWorldSetting,
  ImagePreset,
  StudioAnalysisResult,
  YouTubeMetadata,
  YouTubeThumbnailHistory,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";
const REQUEST_TIMEOUT_MS = 120_000;

/** FastAPI returns `detail` as a string, or a list of {loc,msg} for 422s. */
function formatErrorDetail(errJson: any, fallback: string): string {
  const detail = errJson?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => (typeof d === "string" ? d : d?.msg || JSON.stringify(d)))
      .join("; ") || fallback;
  }
  if (detail) return JSON.stringify(detail);
  return fallback;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    ...(!(options.body instanceof FormData) && { "Content-Type": "application/json" }),
    ...options.headers,
  };

  // Abort hung requests so a dead backend surfaces as an error, not a spinner forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") {
      throw new Error("Permintaan ke server timeout atau dibatalkan");
    }
    throw new Error("Tidak dapat terhubung ke server API");
  }
  clearTimeout(timer);

  if (!res.ok) {
    let fallback = `Gagal memuat data (HTTP ${res.status})`;
    try {
      fallback = formatErrorDetail(await res.json(), fallback);
    } catch {}
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
  getProject: (id: string) => request<Project & { source_videos: SourceVideo[]; scenes: Scene[]; narration?: Narration | null; audio?: AudioTrack | null; timeline?: Timeline | null; subtitle_style?: SubtitleStyle | null; render_jobs?: RenderJob[] }>(`/api/v1/projects/${id}`),
  createProject: (data: { name: string; description?: string; project_type?: "short_video" | "long_storyboard"; aspect_ratio?: string; resolution?: string; language?: string }) =>
    request<Project>("/api/v1/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: Partial<Pick<Project, 'name' | 'description' | 'project_type' | 'aspect_ratio' | 'resolution' | 'background_fill' | 'watermark' | 'language'>>) =>
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
  cancelMedia: (projectId: string, videoId: string) =>
    request<{ status: string; message: string }>(`/api/v1/projects/${projectId}/media/${videoId}/cancel`, { method: "POST" }),

  // Background Tasks / Worker Cancellation
  cancelProjectTasks: (projectId: string) =>
    request<{ status: string; message: string; cancelled_videos: number; cancelled_renders: number; cancelled_audio: number }>(
      `/api/v1/projects/${projectId}/tasks/cancel`,
      { method: "POST" }
    ),

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
  resetTemplate: (id: string) =>
    request<NarrationTemplate>(`/api/v1/templates/${id}/reset`, {
      method: "POST",
    }),
  deleteTemplate: (id: string) =>
    request<void>(`/api/v1/templates/${id}`, {
      method: "DELETE",
    }),
  generateNarration: (
    projectId: string,
    data: {
      template_id: string;
      topic?: string;
      tone: string;
      target_duration: number;
      custom_prompt?: string;
      language?: string;
    }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/narration/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateNarration: (projectId: string, data: { raw_text: string; segments?: any[]; language?: string }) =>
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
  getElevenLabsVoices: (apiKey?: string) =>
    request<VoiceInfo[]>(
      `/api/v1/tts/elevenlabs/voices${apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : ""}`
    ),
  estimateCost: (text: string, provider: string = "gemini") =>
    request<any>("/api/v1/tts/estimate-cost", {
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
      fallback_enabled?: boolean;
      language?: string;
    }
  ) =>
    request<AudioTrack>(`/api/v1/projects/${projectId}/tts/generate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  realignTTS: (
    projectId: string,
    data?: { offset_ms?: number; language?: string; model_size?: string; segments?: any[] }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/tts/realign`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  // Timeline
  autoMatchTimeline: (projectId: string) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline/auto-match`, { method: "POST" }),
  getTimeline: (projectId: string) =>
    request<Timeline>(`/api/v1/projects/${projectId}/timeline`),
  updateTimeline: (
    projectId: string,
    data: { clips: any[]; total_duration?: number; has_audio?: boolean; has_subtitles?: boolean }
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
    if (options?.clear_subtitles !== undefined) params.set("clear_subtitles", String(options.clear_subtitles));
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
    if (options?.readd_subtitles !== undefined) params.set("readd_subtitles", String(options.readd_subtitles));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return request<Timeline>(`/api/v1/projects/${projectId}/timeline/readd-narration${qs}`, {
      method: "POST",
    });
  },

  // Subtitles
  getSubtitlePresets: () => request<SubtitlePreset[]>("/api/v1/subtitles/presets"),
  createSubtitlePreset: (data: Partial<SubtitlePreset>) =>
    request<SubtitlePreset>("/api/v1/subtitles/presets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSubtitlePreset: (id: string, data: Partial<SubtitlePreset>) =>
    request<SubtitlePreset>(`/api/v1/subtitles/presets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  resetSubtitlePreset: (id: string) =>
    request<SubtitlePreset>(`/api/v1/subtitles/presets/${id}/reset`, {
      method: "POST",
    }),
  deleteSubtitlePreset: (id: string) =>
    request<void>(`/api/v1/subtitles/presets/${id}`, {
      method: "DELETE",
    }),
  getSubtitleStyle: (projectId: string) =>
    request<SubtitleStyle>(`/api/v1/projects/${projectId}/subtitles/style`),
  updateSubtitleStyle: (projectId: string, data: any) =>
    request<SubtitleStyle>(`/api/v1/projects/${projectId}/subtitles/style`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  previewASS: (projectId: string) =>
    request<{ ass_content: string; line_count: number }>(`/api/v1/projects/${projectId}/subtitles/preview-ass`),
  matchSubtitleWithAudio: (
    projectId: string,
    data?: { offset_ms?: number; language?: string; model_size?: string }
  ) =>
    request<Narration>(`/api/v1/projects/${projectId}/subtitles/match-audio`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  getSubtitleExportUrl: (projectId: string, format: "ass" | "srt" | "vtt") =>
    `/api/v1/projects/${projectId}/subtitles/export?format=${format}`,

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
    request<{ status: string; message: string }>(`/api/v1/projects/${projectId}/render/jobs/${jobId}/cancel`, { method: "POST" }),

  // Settings
  getModelConfig: () => request<ModelConfig>("/api/v1/settings/config"),
  saveModelConfig: (data: {
    base_url?: string | null;
    chat_model?: string;
    vision_model?: string;
    api_key?: string;
    tts_provider?: string;
    tts_api_key?: string;
    tts_fallback_enabled?: boolean;
    elevenlabs_api_key?: string;
    elevenlabs_model?: string;
    runware_api_key?: string;
    runware_tts_model?: string;
    image_base_url?: string | null;
    image_model?: string;
    image_concurrency?: number;
    image_api_key?: string;
    image_system_prompt?: string | null;
  }) =>
    request<ModelConfig>("/api/v1/settings/config", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  testConnection: (data: { base_url?: string; chat_model: string; vision_model: string; api_key?: string }) =>
    request<{ success: boolean; message: string; latency_ms?: number }>("/api/v1/settings/test-connection", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  testImageConnection: (data: { base_url?: string; image_model?: string; api_key?: string }) =>
    request<{ success: boolean; message: string; latency_ms?: number; image_model_status?: string }>(
      "/api/v1/settings/test-image-connection",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  testTtsConnection: (data: { provider?: string; api_key?: string; model?: string; voice?: string }) =>
    request<{ success: boolean; message: string; latency_ms?: number; provider_status?: string }>(
      "/api/v1/settings/test-tts-connection",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  getAvailableModels: (baseUrl?: string, apiKey?: string, category: "llm" | "image" = "llm") => {
    const params = new URLSearchParams();
    if (baseUrl) params.set("base_url", baseUrl);
    if (category) params.set("category", category);
    const query = params.toString() ? `?${params.toString()}` : "";
    // Key travels in a header, not the query string, so it stays out of logs.
    return request<{ models: string[]; image_models?: string[] }>(`/api/v1/settings/models${query}`, {
      headers: apiKey ? { "X-Api-Key": apiKey } : undefined,
    });
  },

  // Storyboard (Long Video Explainer)
  generateStoryboardScript: (
    projectId: string,
    data: {
      topic: string;
      target_duration_mins: number;
      tone: string;
      images_per_segment: number;
      preset_id?: string;
      custom_instructions?: string;
      language?: string;
      reset_bible?: boolean;
    }
  ) =>
    request<{
      success: boolean;
      project_id: string;
      characters?: any[];
      narration: any;
      storyboard_items: StoryboardItem[];
    }>(`/api/v1/projects/${projectId}/storyboard/generate-script`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateStoryboardCharacters: (projectId: string, characters: any[]) =>
    request<{ success: boolean; characters: any[] }>(
      `/api/v1/projects/${projectId}/storyboard/characters`,
      {
        method: "PUT",
        body: JSON.stringify({ characters }),
      }
    ),
  getStoryboardContinuityBible: (projectId: string) =>
    request<{
      characters: StoryboardCharacter[];
      locations: StoryboardLocation[];
      world_setting: StoryboardWorldSetting;
    }>(`/api/v1/projects/${projectId}/storyboard/continuity-bible`),
  updateStoryboardContinuityBible: (
    projectId: string,
    data: {
      characters?: StoryboardCharacter[];
      locations?: StoryboardLocation[];
      world_setting?: StoryboardWorldSetting;
    }
  ) =>
    request<{
      success: boolean;
      characters: StoryboardCharacter[];
      locations: StoryboardLocation[];
      world_setting: StoryboardWorldSetting;
    }>(`/api/v1/projects/${projectId}/storyboard/continuity-bible`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  extractStoryboardContinuityBible: (
    projectId: string,
    data?: { custom_instructions?: string }
  ) =>
    request<{
      success: boolean;
      characters: StoryboardCharacter[];
      locations: StoryboardLocation[];
      world_setting: StoryboardWorldSetting;
    }>(`/api/v1/projects/${projectId}/storyboard/continuity-bible/extract`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  updateStoryboardSegment: (
    projectId: string,
    segmentId: string,
    data: {
      chapter?: string;
      text?: string;
      segment_index?: number;
      items?: { id: string; image_prompt: string }[];
    }
  ) =>
    request<{
      success: boolean;
      segment_id: string;
      narration: any;
      storyboard_items: StoryboardItem[];
    }>(`/api/v1/projects/${projectId}/storyboard/segments/${segmentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getStoryboardItems: (projectId: string) =>
    request<StoryboardItem[]>(`/api/v1/projects/${projectId}/storyboard/items`),
  updateStoryboardItem: (
    projectId: string,
    itemId: string,
    data: Partial<Pick<StoryboardItem, "chapter_title" | "script_text" | "image_prompt" | "motion_effect" | "start_time" | "end_time" | "duration">>
  ) =>
    request<StoryboardItem>(`/api/v1/projects/${projectId}/storyboard/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  generateSingleStoryboardImage: (
    projectId: string,
    itemId: string,
    data?: { prompt?: string; preset_id?: string }
  ) =>
    request<StoryboardItem>(`/api/v1/projects/${projectId}/storyboard/items/${itemId}/generate-image`, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),
  generateAllStoryboardImages: (projectId: string, data?: { item_ids?: string[]; concurrency?: number }) =>
    request<{
      success: boolean;
      total_processed: number;
      success_count: number;
      fail_count: number;
    }>(`/api/v1/projects/${projectId}/storyboard/generate-all-images`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  syncStoryboardTiming: (projectId: string) =>
    request<{ success: boolean; message: string }>(`/api/v1/projects/${projectId}/storyboard/sync-timing`, {
      method: "POST",
    }),

  // AI Visual Image Studio & Presets
  getImagePresets: () => request<ImagePreset[]>("/api/v1/image-presets"),
  getImagePreset: (id: string) => request<ImagePreset>(`/api/v1/image-presets/${id}`),
  createImagePreset: (data: Partial<ImagePreset>) =>
    request<ImagePreset>("/api/v1/image-presets", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateImagePreset: (id: string, data: Partial<ImagePreset>) =>
    request<ImagePreset>(`/api/v1/image-presets/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteImagePreset: (id: string) =>
    request<void>(`/api/v1/image-presets/${id}`, {
      method: "DELETE",
    }),
  activateImagePreset: (id: string) =>
    request<ImagePreset>(`/api/v1/image-presets/${id}/activate`, {
      method: "POST",
    }),
  uploadReferenceImage: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE_URL}/api/v1/image-studio/upload-reference`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Gagal mengunggah gambar referensi");
    }
    return res.json() as Promise<{ success: boolean; filename: string; file_path: string; url: string }>;
  },
  analyzeStylePreset: (data: { user_text: string; reference_image_url?: string; reference_image_path?: string }) =>
    request<StudioAnalysisResult>("/api/v1/image-studio/analyze", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  testGeneratePresetImage: (data: { master_prompt: string; scene_prompt?: string; aspect_ratio?: string }) =>
    request<{ image_url: string; file_path: string; prompt_used: string }>("/api/v1/image-studio/test-generate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // YouTube & Thumbnail Suite
  generateYouTubeMetadata: (projectId: string, data?: { focus_angle?: string; custom_prompt?: string; language?: string }) =>
    request<YouTubeMetadata>(`/api/v1/projects/${projectId}/storyboard/youtube/generate-metadata`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  generateYouTubeThumbnail: (
    projectId: string,
    data: { prompt: string; style_prompt?: string; preset_id?: string }
  ) =>
    request<{ thumbnail_url: string; prompt: string; history: YouTubeThumbnailHistory[]; youtube_metadata: YouTubeMetadata }>(
      `/api/v1/projects/${projectId}/storyboard/youtube/generate-thumbnail`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),
  updateYouTubeMetadata: (projectId: string, data: Partial<YouTubeMetadata>) =>
    request<YouTubeMetadata>(`/api/v1/projects/${projectId}/storyboard/youtube/metadata`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getYouTubeMetadata: (projectId: string) =>
    request<YouTubeMetadata>(`/api/v1/projects/${projectId}/storyboard/youtube/metadata`),
};


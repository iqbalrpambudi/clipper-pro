import type JASSUB from "jassub";

export interface BackgroundFill {
  mode: "blur" | "black" | "cover" | "custom";
  color: string;
  zoom?: number;
  anti_copyright?: boolean;
  dynamic_zoom?: boolean;
  color_grading?: boolean;
}

export interface TTSConfig {
  provider: "gemini" | "elevenlabs";
  voice: string;
  rate: number;
  pitch: number;
  model?: string | null;
}

export interface QCConfig {
  max_fix_rounds: number;
  threshold: number;
  platform: "tiktok" | "reels" | "shorts";
  qc_model?: string | null;
}

export interface QCIssue {
  id: string;
  dimension: string;
  severity: "blocker" | "major" | "minor";
  message: string;
  segment_index?: number | null;
  clip_index?: number | null;
  timestamp_sec?: number | null;
  auto_fixable: boolean;
}

export interface QCAppliedFix {
  round: number;
  action: string;
  target: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export interface QCRun {
  id: string;
  project_id: string;
  gate: "script" | "timeline";
  trigger: "auto" | "manual";
  status: "passed" | "fixed" | "warning" | "skipped";
  passed: boolean;
  overall_score: number;
  threshold: number;
  rounds_used: number;
  dimension_scores: Record<string, number>;
  issues: QCIssue[];
  applied_fixes: QCAppliedFix[];
  can_revert: boolean;
  reverted: boolean;
  summary?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface QCLatestResponse {
  script?: QCRun | null;
  timeline?: QCRun | null;
}

export interface ProjectDefaultsConfig {
  subtitle: SubtitleStyle;
  watermark: WatermarkConfig;
  tts: TTSConfig;
  qc?: QCConfig;
  background_fill?: BackgroundFill;
}

export interface ProjectDefaultsResponse extends ProjectDefaultsConfig {
  config_path: string;
  from_file: boolean;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  project_type?: string;
  status: string;
  aspect_ratio: string;
  resolution: string;
  background_fill: BackgroundFill;
  watermark?: WatermarkConfig | null;
  tts_config?: TTSConfig | null;
  qc_config?: QCConfig | null;
  created_at: string;
  updated_at: string;
  source_video_count?: number;
  scene_count?: number;
  subtitle_style?: SubtitleStyle | null;
  language?: string;
  source_videos?: SourceVideo[];
  scenes?: Scene[];
  narration?: Narration | null;
  audio?: AudioTrack | null;
  audio_track?: AudioTrack | null;
  timeline?: Timeline | null;
  render_jobs?: RenderJob[];
}

export interface ProjectDetail extends Project {
  source_videos: SourceVideo[];
  scenes: Scene[];
  narration?: Narration | null;
  audio?: AudioTrack | null;
  timeline?: Timeline | null;
  subtitle_style?: SubtitleStyle | null;
  render_jobs?: RenderJob[];
}


export interface WatermarkConfig {
  enabled: boolean;
  watermark_type?: "text";
  text: string;
  font_family: string;
  font_size: number;
  font_color: string;
  opacity: number;
  position:
    | "top-left"
    | "top-center"
    | "top-right"
    | "center-left"
    | "center"
    | "center-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right"
    | "custom";
  custom_x?: number; // 0 - 100 percentage
  custom_y?: number; // 0 - 100 percentage
  offset_x: number;
  offset_y: number;
  has_background?: boolean;
  background_color?: string;
  background_opacity?: number;
  has_shadow?: boolean;
  shadow_color?: string;
}

export interface HeatmapBucket {
  start_time: number;
  end_time: number;
  value: number;
}

export interface SourceVideo {
  id: string;
  project_id: string;
  origin: "upload" | "ytdlp";
  file_url?: string | null;
  filename: string;
  youtube_url?: string | null;
  selected_resolution?: string | null;
  duration: number;
  width: number;
  height: number;
  fps: number;
  status: "pending" | "downloading" | "processing" | "ready" | "failed";
  progress: number;
  error_message?: string | null;
  heatmap_data?: HeatmapBucket[] | null;
  created_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  source_video_id: string;
  scene_index: number;
  start_time: number;
  end_time: number;
  duration: number;
  thumbnail_url?: string | null;
  video_url?: string | null;
  description?: string | null;
  tags: string[];
  transcript?: string | null;
  shot_info?: {
    version?: number;
    internal_cuts?: number[];
    usable_ranges?: [number, number][];
    usable_duration?: number;
    montage?: boolean;
    shot_count?: number;
  } | null;
  status: string;
  created_at: string;
}

export interface WordTimestamp {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface SentenceSegment {
  id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  words: WordTimestamp[];
  chapter?: string | null;
  scene_id?: string; // shot this line was written for
}

export interface Narration {
  id: string;
  project_id: string;
  template_id?: string | null;
  topic?: string | null;
  tone: string;
  target_duration: number;
  raw_text: string;
  language?: string;
  segments: SentenceSegment[];
  status: string;
}

export interface AudioTrack {
  id: string;
  project_id: string;
  narration_id: string;
  provider: string;
  voice: string;
  rate: string;
  pitch: string;
  model?: string | null;
  audio_url?: string | null;
  file_url?: string | null;
  duration: number;
  estimated_cost: number;
  status: string;
}

export interface TimelineClip {
  id: string;
  segment_id?: string | null;
  scene_id: string;
  source_video_id: string;
  timeline_start: number;
  timeline_end: number;
  clip_start: number;
  clip_end: number;
  speed: number;
  transition?: string | null;
  thumbnail_url?: string | null;
  video_url?: string | null;
  text?: string | null;
  background_fill_override?: Partial<BackgroundFill> | null;
}

export interface Timeline {
  id: string;
  project_id: string;
  clips: TimelineClip[];
  total_duration: number;
  has_audio?: boolean;
  has_subtitles?: boolean;
}

// Mirrors STYLE_DEFAULTS in apps/api/app/services/subtitle_ass.py (the only ASS generator).
export interface SubtitleStyle {
  id?: string;
  enabled: boolean;
  preset_name: string;
  font_family: string;
  font_size: number;
  highlight_color: string;
  position: "bottom" | "center";
  offset_y: number;
  burst_word_count: 1 | 2 | 3;
  highlight_animation: "scale" | "none";
}

export interface RenderJob {
  id: string;
  project_id: string;
  render_type: "final" | "preview";
  status: "queued" | "rendering" | "processing" | "completed" | "failed";
  progress: number;
  output_url?: string | null;
  thumbnail_url?: string | null;
  file_size_bytes?: number | null;
  log_output?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface NarrationTemplate {
  id: string;
  name: string;
  description?: string | null;
  system_prompt: string;
  default_tone: string;
  is_builtin: boolean;
}

export interface VoiceInfo {
  id: string;
  name: string;
  provider: string;
  gender: string;
  sample_text: string;
  sample_audio_url?: string | null;
  description: string;
  language?: string;
  languages?: string[];
}

export interface ModelConfig {
  id: string;
  name: string;
  base_url?: string | null;
  chat_model: string;
  vision_model: string;
  api_key_masked?: string | null;
  has_api_key: boolean;
  tts_provider: string;
  tts_api_key_masked?: string | null;
  has_tts_api_key: boolean;
  elevenlabs_api_key_masked?: string | null;
  has_elevenlabs_api_key?: boolean;
  elevenlabs_model?: string;
  is_active: boolean;
}


export interface YTFormatOption {
  format_id: string;
  resolution: string;
  ext: string;
  filesize_approx_mb?: number | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  label: string;
}

export interface YTInfoResponse {
  title: string;
  duration: number;
  duration_str: string;
  thumbnail?: string | null;
  formats: YTFormatOption[];
  heatmap?: HeatmapBucket[] | null;
}

export interface CostEstimateResponse {
  char_count: number;
  word_count: number;
  estimated_duration_sec: number;
  estimated_cost_usd: number;
  currency: string;
  provider: string;
}

export interface PresetCategory {
  id: string;
  title: string;
  description: string;
  badge: string;
  search_query: string;
  icon_name: string;
}

export interface VideoCandidate {
  id: string;
  source: string;
  source_label: string;
  title: string;
  url: string;
  duration: number;
  duration_str: string;
  views: number;
  views_str: string;
  channel: string;
  channel_url?: string | null;
  thumbnail?: string | null;
  is_already_imported: boolean;
  existing_project_id?: string | null;
  existing_project_name?: string | null;
}

export interface VideoSearchRequest {
  preset_id?: string | null;
  custom_query?: string | null;
  sources?: string[];
  page?: number;
  exclude_ai: boolean;
  hide_imported?: boolean;
  exclude_urls?: string[];
  min_duration?: number;
  max_duration?: number;
  min_views?: number;
  limit?: number;
}

export interface VideoSearchResponse {
  query_used: string;
  preset_id?: string | null;
  exclude_ai: boolean;
  hide_imported: boolean;
  page: number;
  has_more: boolean;
  sources_used: string[];
  skipped_imported_count: number;
  candidates: VideoCandidate[];
}

export interface VideoImportRequest {
  url: string;
  title: string;
  source?: string;
  project_name?: string | null;
  aspect_ratio?: string;
  resolution?: string;
  download_resolution?: string;
  language?: string;
}


export interface VideoImportResponse {
  project_id: string;
  project_name: string;
  video_id: string;
  status: string;
}

export type JassubInstance = JASSUB;

export * from "./editorConfig";


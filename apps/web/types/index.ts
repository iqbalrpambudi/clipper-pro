export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  aspect_ratio: string;
  resolution: string;
  background_fill: {
    mode: "blur" | "black" | "cover" | "custom";
    color: string;
    zoom?: number;
    anti_copyright?: boolean;
    dynamic_zoom?: boolean;
    color_grading?: boolean;
  };
  watermark?: WatermarkConfig | null;
  created_at: string;
  updated_at: string;
  source_video_count?: number;
  scene_count?: number;
  subtitle_style?: SubtitleStyle | null;
}

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  font_family: string;
  font_size: number;
  font_color: string;
  opacity: number;
  position: "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right";
  offset_x: number;
  offset_y: number;
  has_background?: boolean;
  background_color?: string;
  background_opacity?: number;
  has_shadow?: boolean;
  shadow_color?: string;
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
}

export interface Narration {
  id: string;
  project_id: string;
  template_id?: string | null;
  topic?: string | null;
  tone: string;
  target_duration: number;
  raw_text: string;
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
  audio_url?: string | null;
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
  background_fill_override?: any;
}

export interface Timeline {
  id: string;
  project_id: string;
  clips: TimelineClip[];
  total_duration: number;
  has_audio?: boolean;
  has_subtitles?: boolean;
}

export interface SubtitleStyle {
  id?: string;
  project_id?: string | null;
  preset_name: string;
  description?: string | null;
  is_preset?: boolean;
  font_family: string;
  font_size: number;
  font_weight: string;
  primary_color: string;
  highlight_color: string;
  outline_color: string;
  outline_width: number;
  box_color: string;
  box_opacity: number;
  position: "top" | "center" | "bottom";
  offset_y: number;
  offset_x: number;
  display_mode: "per_word" | "full_sentence" | "burst";
  burst_word_count: number;
  highlight_animation: "scale" | "color" | "box" | "none";
  scale_factor?: number;
  emoji_enabled: boolean;
}

export interface SubtitlePreset extends SubtitleStyle {
  id: string;
  name: string;
  description?: string | null;
  is_builtin: boolean;
}

export interface RenderJob {
  id: string;
  project_id: string;
  render_type: "final" | "preview";
  status: "queued" | "rendering" | "completed" | "failed";
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
  category: string;
  sub_category?: string | null;
  system_prompt: string;
  user_prompt_template: string;
  default_tone: string;
  default_voice: string;
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
  is_active: boolean;
}

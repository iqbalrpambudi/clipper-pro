import type { SubtitleStyle, WatermarkConfig, ThumbnailTextLayer, ThumbnailPreset } from "./index";

// ============================================================================
// SHORTS MODE CONFIGURATION TYPES
// ============================================================================

export interface ShortsMediaPoolConfig {
  searchQuery: string;
  filterTag: string;
  selectedVideoIds: string[];
  ytUrl: string;
  ytDownloadResolution: string;
}

export interface ShortsNarrationConfig {
  language: string;
  topic: string;
  preset: string; // e.g. "recap_cinematic", "fakta_mengejutkan"
  tone: string;
  duration: string; // e.g. "60"
  targetDurationSec: number;
  additionalPrompt: string;
  category: string;
  customPrompt: string;
}

export interface ShortsTTSConfig {
  provider: string; // "gemini" | "elevenlabs" | "runware" | "edge"
  model: string;
  voice: string;
  rate: number;
  pitch: number;
  customVoiceInput: string;
  runwareCustomVoiceInput: string;
  selectedVoicePresetId: string;
}

export interface ShortsSubtitleConfig {
  enabled: boolean;
  presetId: string;
  style: Partial<SubtitleStyle>;
  position: "bottom" | "top" | "center" | "custom";
  customOffset: { x: number; y: number };
}

export interface ShortsWatermarkConfig extends WatermarkConfig {
  customOffset?: { x: number; y: number };
}

export interface ShortsTimelineConfig {
  zoom: number;
  snapToGrid: boolean;
  activeTrackId: string | null;
  audioVolume: number;
  bgmVolume: number;
}

export interface ShortsRenderConfig {
  resolution: string; // "1080x1920" | "720x1280"
  fps: number;
  quality: "high" | "standard";
  includeSubtitles: boolean;
  includeWatermark: boolean;
}

export interface ShortsConfig {
  mediaPool: ShortsMediaPoolConfig;
  narration: ShortsNarrationConfig;
  tts: ShortsTTSConfig;
  subtitle: ShortsSubtitleConfig;
  watermark: ShortsWatermarkConfig;
  timeline: ShortsTimelineConfig;
  render: ShortsRenderConfig;
}

// ============================================================================
// STORYBOARD MODE CONFIGURATION TYPES
// ============================================================================

export interface StoryboardScriptConfig {
  language: string;
  topic: string;
  preset: string; // Visual style preset ID
  scriptPresetId: string; // Story formula preset ID
  tone: string;
  durationMins: number;
  imagesPerSegment: number;
  customInstructions: string;
}

export interface StoryboardVoiceConfig {
  provider: string;
  model: string;
  voice: string;
  rate: number;
  pitch: number;
  customVoiceInput: string;
  runwareCustomVoiceInput: string;
  selectedVoicePresetId: string;
}

export interface StoryboardVisualsConfig {
  selectedPresetId: string;
  batchConcurrency: number;
  promptOverrides: Record<string, string>;
}

export interface StoryboardTimelineConfig {
  zoom: number;
  snapToGrid: boolean;
  motionEffectDefault: string;
  selectedItemId: string | null;
}

export interface StoryboardSubtitleConfig {
  enabled: boolean;
  presetId: string;
  style: Partial<SubtitleStyle>;
  position: "bottom" | "top" | "center" | "custom";
  customOffset: { x: number; y: number };
}

export interface StoryboardWatermarkConfig extends WatermarkConfig {
  customOffset?: { x: number; y: number };
}

export interface StoryboardRenderConfig {
  resolution: string; // "1080p" | "720p"
  fps: number;
  includeSubtitles: boolean;
  includeWatermark: boolean;
}

export interface StoryboardPublishingThumbnailGenerator {
  formula: string; // e.g. "comic_reaction", "peeking_pov"
  focusAngle: string; // e.g. "curiosity_gap"
  customPrompt: string;
  prompt: string;
  aspectRatio: string; // "16:9"
}

export interface StoryboardPublishingCanvas {
  width: number;
  height: number;
  selectedLayerId: string | null;
  activePresetId: string | null;
  layers: ThumbnailTextLayer[];
  customPresets: ThumbnailPreset[];
}

export interface StoryboardPublishingMetadata {
  language: string;
  title: string;
  description: string;
  tags: string[];
  titleOptions: string[];
  thumbnailConcept: string;
  category: string;
  privacyStatus: "public" | "unlisted" | "private";
  madeForKids: boolean;
}

export interface StoryboardPublishingConfig {
  thumbnail: {
    generator: StoryboardPublishingThumbnailGenerator;
    activeBackgroundUrl: string | null;
    canvas: StoryboardPublishingCanvas;
  };
  metadata: StoryboardPublishingMetadata;
}

export interface StoryboardConfig {
  script: StoryboardScriptConfig;
  voice: StoryboardVoiceConfig;
  visuals: StoryboardVisualsConfig;
  timeline: StoryboardTimelineConfig;
  subtitle: StoryboardSubtitleConfig;
  watermark: StoryboardWatermarkConfig;
  render: StoryboardRenderConfig;
  publishing: StoryboardPublishingConfig;
}

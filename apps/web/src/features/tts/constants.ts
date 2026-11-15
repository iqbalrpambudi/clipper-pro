import type { TTSConfig } from "@/types";

// shortcut: one fixed model per provider, add a select when a second model is actually needed
export const TTS_MODEL: Record<string, string> = {
  gemini: "gemini-2.5-flash-preview-tts",
  elevenlabs: "eleven_multilingual_v2",
};

export const DEFAULT_TTS_CONFIG: TTSConfig = {
  provider: "gemini",
  voice: "Puck",
  rate: 0,
  pitch: 0,
  model: TTS_MODEL.gemini,
};

export function formatAudioTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

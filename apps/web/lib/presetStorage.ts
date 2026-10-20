import { SubtitleStyle } from "@/types";

// ==========================================
// 1. TAB 1: SCRIPT & NARRATION PRESETS
// ==========================================
export interface ScriptPreset {
  id: string;
  name: string;
  durationMins: number; // 1. Total durasi
  tone: string; // 2. Gaya bahasa
  presetId?: string; // 3. Preset gaya visual
  imagesPerSegment: number; // 4. Jumlah gambar ilustrasi
  customInstructions: string; // 5. Instruksi khusus
  createdAt?: string;
  isBuiltin?: boolean;
}

export const DEFAULT_SCRIPT_PRESETS: ScriptPreset[] = [
  {
    id: "default-youtube-explainer",
    name: "YouTube Explainer (5 Mnt - Santai)",
    durationMins: 5,
    tone: "santai",
    imagesPerSegment: 2,
    customInstructions: "",
    isBuiltin: true,
  },
  {
    id: "default-documentary-epic",
    name: "Dokumenter Sejarah (8 Mnt - Misterius)",
    durationMins: 8,
    tone: "misterius",
    imagesPerSegment: 3,
    customInstructions: "Gaya narasi mendalam, perlahan membangun misteri.",
    isBuiltin: true,
  },
  {
    id: "default-educational-short",
    name: "Edukasi Ringkas (4 Mnt - Edukatif)",
    durationMins: 4,
    tone: "edukatif",
    imagesPerSegment: 2,
    customInstructions: "Bahasa jelas, terstruktur, gunakan analogi yang mudah.",
    isBuiltin: true,
  },
];

// ==========================================
// 2. TAB 2: TTS & VOICE PRESETS
// ==========================================
export interface VoicePreset {
  id: string;
  name: string;
  provider: string; // 1. Provider TTS
  model: string; // 2. Model TTS
  voice: string; // 3. Custom voice / pustaka suara
  customVoiceInput?: string;
  runwareCustomVoiceInput?: string;
  rate: number; // 4. Kecepatan
  pitch: number; // 4. Pitch
  createdAt?: string;
  isBuiltin?: boolean;
}

export const DEFAULT_VOICE_PRESETS: VoicePreset[] = [
  {
    id: "default-eleven-flash-adam",
    name: "ElevenLabs Flash v2.5 (Adam - Hemat 50%)",
    provider: "elevenlabs",
    model: "eleven_flash_v2_5",
    voice: "Adam",
    rate: 0,
    pitch: 0,
    isBuiltin: true,
  },
  {
    id: "default-eleven-v2-adam",
    name: "ElevenLabs Multilingual v2 (Adam - Gold)",
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    voice: "Adam",
    rate: 0,
    pitch: 0,
    isBuiltin: true,
  },
  {
    id: "default-gemini-puck",
    name: "Gemini Narator Natural (Puck)",
    provider: "gemini",
    model: "gemini-2.5-flash-preview-tts",
    voice: "Puck",
    rate: 0,
    pitch: 0,
    isBuiltin: true,
  },
  {
    id: "default-edge-ardi",
    name: "Edge-TTS Gratis Indonesia (Ardi)",
    provider: "edge",
    model: "edge",
    voice: "id-ID-ArdiNeural",
    rate: 0,
    pitch: 0,
    isBuiltin: true,
  },
];

// ==========================================
// 3. TAB 4: SUBTITLE PRESETS
// ==========================================
export interface SubtitleCustomPreset {
  id: string;
  name: string;
  style: SubtitleStyle;
  createdAt?: string;
  isBuiltin?: boolean;
}

// Storage keys
const SCRIPT_PRESETS_KEY = "cliper_storyboard_script_presets";
const VOICE_PRESETS_KEY = "cliper_storyboard_voice_presets";
const SUBTITLE_PRESETS_KEY = "cliper_storyboard_subtitle_presets";

export const presetStorage = {
  // Script Presets
  getScriptPresets: (): ScriptPreset[] => {
    if (typeof window === "undefined") return DEFAULT_SCRIPT_PRESETS;
    try {
      const stored = localStorage.getItem(SCRIPT_PRESETS_KEY);
      if (!stored) return DEFAULT_SCRIPT_PRESETS;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure default built-in presets exist
        const customOnly = parsed.filter((p: ScriptPreset) => !p.isBuiltin);
        return [...DEFAULT_SCRIPT_PRESETS, ...customOnly];
      }
      return DEFAULT_SCRIPT_PRESETS;
    } catch {
      return DEFAULT_SCRIPT_PRESETS;
    }
  },
  saveScriptPreset: (
    preset: Omit<ScriptPreset, "id" | "createdAt" | "isBuiltin">
  ): ScriptPreset => {
    const list = presetStorage.getScriptPresets().filter((p) => !p.isBuiltin);
    const newPreset: ScriptPreset = {
      ...preset,
      id: `custom-script-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isBuiltin: false,
    };
    const updated = [newPreset, ...list];
    if (typeof window !== "undefined") {
      localStorage.setItem(
        SCRIPT_PRESETS_KEY,
        JSON.stringify([...DEFAULT_SCRIPT_PRESETS, ...updated])
      );
    }
    return newPreset;
  },
  deleteScriptPreset: (id: string) => {
    const list = presetStorage.getScriptPresets().filter((p) => p.id !== id && !p.isBuiltin);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        SCRIPT_PRESETS_KEY,
        JSON.stringify([...DEFAULT_SCRIPT_PRESETS, ...list])
      );
    }
  },

  // Voice Presets
  getVoicePresets: (): VoicePreset[] => {
    if (typeof window === "undefined") return DEFAULT_VOICE_PRESETS;
    try {
      const stored = localStorage.getItem(VOICE_PRESETS_KEY);
      if (!stored) return DEFAULT_VOICE_PRESETS;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const customOnly = parsed.filter((p: VoicePreset) => !p.isBuiltin);
        return [...DEFAULT_VOICE_PRESETS, ...customOnly];
      }
      return DEFAULT_VOICE_PRESETS;
    } catch {
      return DEFAULT_VOICE_PRESETS;
    }
  },
  saveVoicePreset: (preset: Omit<VoicePreset, "id" | "createdAt" | "isBuiltin">): VoicePreset => {
    const list = presetStorage.getVoicePresets().filter((p) => !p.isBuiltin);
    const newPreset: VoicePreset = {
      ...preset,
      id: `custom-voice-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isBuiltin: false,
    };
    const updated = [newPreset, ...list];
    if (typeof window !== "undefined") {
      localStorage.setItem(
        VOICE_PRESETS_KEY,
        JSON.stringify([...DEFAULT_VOICE_PRESETS, ...updated])
      );
    }
    return newPreset;
  },
  deleteVoicePreset: (id: string) => {
    const list = presetStorage.getVoicePresets().filter((p) => p.id !== id && !p.isBuiltin);
    if (typeof window !== "undefined") {
      localStorage.setItem(VOICE_PRESETS_KEY, JSON.stringify([...DEFAULT_VOICE_PRESETS, ...list]));
    }
  },

  // Subtitle Presets
  getSubtitlePresets: (): SubtitleCustomPreset[] => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(SUBTITLE_PRESETS_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  saveSubtitlePreset: (name: string, style: SubtitleStyle): SubtitleCustomPreset => {
    const list = presetStorage.getSubtitlePresets();
    const newPreset: SubtitleCustomPreset = {
      id: `custom-subtitle-${Date.now()}`,
      name,
      style,
      createdAt: new Date().toISOString(),
      isBuiltin: false,
    };
    const updated = [newPreset, ...list];
    if (typeof window !== "undefined") {
      localStorage.setItem(SUBTITLE_PRESETS_KEY, JSON.stringify(updated));
    }
    return newPreset;
  },
  deleteSubtitlePreset: (id: string) => {
    const list = presetStorage.getSubtitlePresets().filter((p) => p.id !== id);
    if (typeof window !== "undefined") {
      localStorage.setItem(SUBTITLE_PRESETS_KEY, JSON.stringify(list));
    }
  },
};

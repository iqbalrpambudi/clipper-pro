import { SubtitleStyle, WatermarkConfig, BackgroundFill } from "@/types";

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
  {
    id: "default-curiosity-explainer",
    name: "Curiosity Explainer (1-2 Mnt - Viral Curiosity)",
    durationMins: 1.5,
    tone: "edukatif",
    imagesPerSegment: 2,
    customInstructions: `Gunakan formula Curiosity Explainer (5 Babak) yang dinamis:
1. Hook Misteri/Aksi Tak Biasa (0-4s): Buka langsung dengan anomali visual yang memancing rasa penasaran tanpa kata klise pembuka. Variasikan bentuk kalimat:
   - Pola Pertanyaan Penasaran: "Kenapa [subjek] [melakukan aksi tidak lazim] ini?"
   - Pola Tindakan Langsung: "Saat [objek] ini [diberi perlakuan ekstrem], [perubahan aneh] langsung terlihat."
   - Pola Observasi Rahasia: "Beginilah cara sebenarnya [subjek/industri] [menghasilkan/membuat produk]."
   - Pola Ajakan Perhatian: "Perhatikan baik-baik bagaimana [benda/material] ini [diproses dengan cara tak terduga]."
2. Patahkan Asumsi Umum / Misconception (5-15s): Benturkan dengan persepsi umum audiens.
   - Contoh variasi: "Banyak yang mengira ini [asumsi salah], padahal...", "Sekilas terlihat seperti [hal sepele], namun fungsi aslinya jauh berbeda.", "Ini bukan sekadar [tindakan biasa], melainkan..."
3. Mekanisme Mikro & Logika Sains/Teknik (15-40s): Bedah proses fisik, reaksi kimia, atau trik engineering di baliknya langkah demi langkah secara runtut.
   - Jelaskan hubungan sebab-akibat: "Saat [tahap A dilakukan], [reaksi B terjadi] sehingga [masalah C teratasi secara alami]."
   - Tautkan setiap klausa dengan tindakan fisik konkret (air dingin membuang buttermilk, serat sintetis mengikat akar, kisi-kisi mengalirkan arus air).
4. Manfaat Nyata & Pembuktian Hasil (40-55s): Tunjukkan payoff konkret dan alasan kenapa metode ini krusial.
   - Pola variasi: "Hasilnya...", "Karena itulah...", "Kondisi ini memastikan [produk/objek] tetap [kualitas unggul] dan terhindar dari [masalah fatal]."
5. Refleksi / Punchline Elevasi (55-70s): Angkat objek biasa menjadi kejeniusan inovasi/keahlian.
   - Pola variasi: "Meski terlihat [sederhana/kasar/sepele], proses ini membuktikan...", "Di balik [tampilan luar biasa], tersimpan sistem cerdas yang dirancang untuk [tujuan besar]."

Kaidah Narasi:
- Sinkronisasi Nomina-Verba: Sebutkan benda dan aksi yang nyata terlihat pada visual di detik tersebut.
- Jangan gunakan istilah teknis kamera (jangan sebut scene, shot, kamera, layar).
- Kalimat mengalir alami (8-14 kata per kalimat), hindari kalimat patah-patah atau kalimat kaku seperti robot.`,
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

// ==========================================
// 4. TIMELINE STUDIO PRESETS (Subtitle + Watermark + Layout/Ratio)
// ==========================================
export interface TimelineStudioPreset {
  id: string;
  name: string;
  subtitle: SubtitleStyle;
  watermark: WatermarkConfig;
  aspectRatio: string;
  backgroundFill: BackgroundFill;
  createdAt?: string;
  isBuiltin?: boolean;
}

export const DEFAULT_TIMELINE_STUDIO_PRESETS: TimelineStudioPreset[] = [
  {
    id: "builtin-tiktok-viral",
    name: "TikTok / Shorts Viral (9:16)",
    isBuiltin: true,
    aspectRatio: "9:16",
    backgroundFill: {
      mode: "blur",
      zoom: 1.0,
      color: "#000000",
      anti_copyright: true,
      dynamic_zoom: true,
      color_grading: true,
    },
    subtitle: {
      enabled: true,
      preset_name: "viral_tiktok",
      font_family: "Poppins",
      font_size: 56,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FFE600",
      outline_color: "#000000",
      outline_width: 5,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -120,
      offset_x: 0,
      display_mode: "per_word",
      burst_word_count: 2,
      highlight_animation: "color",
      scale_factor: 1.0,
      emoji_enabled: false,
    },
    watermark: {
      enabled: true,
      watermark_type: "text",
      text: "@cliperpro",
      font_family: "Poppins",
      font_size: 26,
      font_color: "#FFFFFF",
      opacity: 0.8,
      position: "bottom-right",
      offset_x: 28,
      offset_y: 28,
      has_shadow: true,
    },
  },
  {
    id: "builtin-reels-box",
    name: "Instagram Reels Box (9:16)",
    isBuiltin: true,
    aspectRatio: "9:16",
    backgroundFill: {
      mode: "blur",
      zoom: 1.0,
      color: "#000000",
      anti_copyright: true,
      dynamic_zoom: true,
      color_grading: true,
    },
    subtitle: {
      enabled: true,
      preset_name: "reels_box",
      font_family: "Inter",
      font_size: 48,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#00F0FF",
      outline_color: "#000000",
      outline_width: 3,
      box_color: "#000000",
      box_opacity: 0.45,
      position: "bottom",
      offset_y: -100,
      offset_x: 0,
      display_mode: "per_word",
      burst_word_count: 3,
      highlight_animation: "color",
      scale_factor: 1.0,
      emoji_enabled: false,
    },
    watermark: {
      enabled: true,
      watermark_type: "text",
      text: "@cliperpro",
      font_family: "Inter",
      font_size: 22,
      font_color: "#FFFFFF",
      opacity: 0.7,
      position: "top-right",
      offset_x: 24,
      offset_y: 24,
      has_shadow: true,
    },
  },
  {
    id: "builtin-yt-landscape",
    name: "YouTube Landscape (16:9)",
    isBuiltin: true,
    aspectRatio: "16:9",
    backgroundFill: {
      mode: "cover",
      zoom: 1.0,
      color: "#000000",
      anti_copyright: true,
      dynamic_zoom: true,
      color_grading: true,
    },
    subtitle: {
      enabled: true,
      preset_name: "cinematic_landscape",
      font_family: "Montserrat",
      font_size: 42,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FFD700",
      outline_color: "#000000",
      outline_width: 4,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -60,
      offset_x: 0,
      display_mode: "full_sentence",
      burst_word_count: 4,
      highlight_animation: "color",
      scale_factor: 1.0,
      emoji_enabled: false,
    },
    watermark: {
      enabled: true,
      watermark_type: "text",
      text: "Cliper Pro",
      font_family: "Montserrat",
      font_size: 22,
      font_color: "#FFFFFF",
      opacity: 0.75,
      position: "bottom-right",
      offset_x: 32,
      offset_y: 32,
      has_shadow: true,
    },
  },
  {
    id: "builtin-square-punch",
    name: "Instagram Square (1:1)",
    isBuiltin: true,
    aspectRatio: "1:1",
    backgroundFill: {
      mode: "blur",
      zoom: 1.0,
      color: "#000000",
      anti_copyright: true,
      dynamic_zoom: true,
      color_grading: true,
    },
    subtitle: {
      enabled: true,
      preset_name: "square_punch",
      font_family: "Poppins",
      font_size: 50,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FF3366",
      outline_color: "#000000",
      outline_width: 4,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -80,
      offset_x: 0,
      display_mode: "per_word",
      burst_word_count: 2,
      highlight_animation: "color",
      scale_factor: 1.0,
      emoji_enabled: false,
    },
    watermark: {
      enabled: true,
      watermark_type: "text",
      text: "@cliperpro",
      font_family: "Poppins",
      font_size: 24,
      font_color: "#FFFFFF",
      opacity: 0.8,
      position: "top-left",
      offset_x: 24,
      offset_y: 24,
      has_shadow: true,
    },
  },
];

// Storage keys
const SCRIPT_PRESETS_KEY = "cliper_storyboard_script_presets";
const VOICE_PRESETS_KEY = "cliper_storyboard_voice_presets";
const SUBTITLE_PRESETS_KEY = "cliper_storyboard_subtitle_presets";
const TIMELINE_STUDIO_PRESETS_KEY = "cliper_timeline_studio_presets";

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

  // Timeline Studio Presets (Subtitle + Watermark + Layout/Ratio)
  getTimelineStudioPresets: (): TimelineStudioPreset[] => {
    if (typeof window === "undefined") return DEFAULT_TIMELINE_STUDIO_PRESETS;
    try {
      const stored = localStorage.getItem(TIMELINE_STUDIO_PRESETS_KEY);
      if (!stored) return DEFAULT_TIMELINE_STUDIO_PRESETS;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const customOnly = parsed.filter((p: TimelineStudioPreset) => !p.isBuiltin);
        return [...DEFAULT_TIMELINE_STUDIO_PRESETS, ...customOnly];
      }
      return DEFAULT_TIMELINE_STUDIO_PRESETS;
    } catch {
      return DEFAULT_TIMELINE_STUDIO_PRESETS;
    }
  },
  saveTimelineStudioPreset: (
    preset: Omit<TimelineStudioPreset, "id" | "createdAt" | "isBuiltin">
  ): TimelineStudioPreset => {
    const list = presetStorage.getTimelineStudioPresets().filter((p) => !p.isBuiltin);
    const newPreset: TimelineStudioPreset = {
      ...preset,
      id: `custom-timeline-preset-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isBuiltin: false,
    };
    const updated = [newPreset, ...list];
    if (typeof window !== "undefined") {
      localStorage.setItem(
        TIMELINE_STUDIO_PRESETS_KEY,
        JSON.stringify([...DEFAULT_TIMELINE_STUDIO_PRESETS, ...updated])
      );
    }
    return newPreset;
  },
  deleteTimelineStudioPreset: (id: string) => {
    const list = presetStorage
      .getTimelineStudioPresets()
      .filter((p) => p.id !== id && !p.isBuiltin);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        TIMELINE_STUDIO_PRESETS_KEY,
        JSON.stringify([...DEFAULT_TIMELINE_STUDIO_PRESETS, ...list])
      );
    }
  },
};

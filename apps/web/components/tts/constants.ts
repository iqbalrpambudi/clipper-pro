export interface TTSModelOption {
  id: string;
  name: string;
  badge: string;
  desc: string;
}

export const GEMINI_TTS_MODELS: TTSModelOption[] = [
  {
    id: "gemini-2.5-flash-preview-tts",
    name: "Gemini 2.5 Flash TTS",
    badge: "Direkomendasikan (Paling Stabil)",
    desc: "Tone & intonasi persona paling konsisten tanpa drift antar segmen narasi panjang.",
  },
  {
    id: "gemini-3.8-flash-lite-tts",
    name: "Gemini 3.8 Flash-Lite TTS",
    badge: "Cepat & Hemat",
    desc: "Latensi super cepat, artikulasi jernih, dan hemat kuota.",
  },
  {
    id: "gemini-3.8-flash-tts",
    name: "Gemini 3.8 Flash TTS",
    badge: "Kualitas Studio",
    desc: "Vokal kualitas studio, dinamika emosi & intonasi acting lebih ekspresif.",
  },
  {
    id: "gemini-3.1-flash-tts-preview",
    name: "Gemini 3.1 Flash TTS Preview",
    badge: "Preview 3.1",
    desc: "Arsitektur preview 3.1 dengan kestabilan ritme vokal.",
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash Latest",
    badge: "Auto Latest",
    desc: "Model Gemini Flash versi terbaru yang otomatis diperbarui oleh Google.",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    name: "Gemini 2.5 Pro TTS Preview",
    badge: "Pro High-Res",
    desc: "Model Pro dengan bobot vokal tebal untuk storytelling dokumenter.",
  },
];

export const ELEVENLABS_TTS_MODELS: TTSModelOption[] = [
  {
    id: "eleven_v4_turbo",
    name: "Eleven v4 Turbo",
    badge: "Next-Gen Low Latency",
    desc: "Arsitektur v4 terbaru, latensi ultra-cepat (~100ms), 90+ bahasa, intonasi emosional tinggi.",
  },
  {
    id: "eleven_v4",
    name: "Eleven v4",
    badge: "Flagship Ultra-Realism",
    desc: "Model v4 tertinggi untuk kualitas vokal sinematik dan ekspresi emosional paling mendalam.",
  },
  {
    id: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    badge: "Gold Standard (Paling Stabil)",
    desc: "Kualitas vokal paling stabil tanpa tone drift, artikulasi emosional tinggi.",
  },
  {
    id: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    badge: "Super Cepat & Hemat Kuota",
    desc: "Latensi super cepat & hemat kuota karakter 50% untuk video harian.",
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Eleven Flash / Turbo 2.5",
    badge: "Fast Generation",
    desc: "Generasi Turbo v2.5 seimbang antara kecepatan dan kestabilan.",
  },
];

export const RUNWARE_TTS_MODELS: TTSModelOption[] = [
  {
    id: "fishaudio:s2.1@pro",
    name: "Fish Audio S2.1 Pro",
    badge: "Ultra-Natural",
    desc: "Sintesis vokal S2.1 Pro dengan kestabilan ritme vokal dan intonasi natural.",
  },
  {
    id: "alibaba:qwen3-tts-1.7b-customvoice",
    name: "Alibaba Qwen3-TTS 1.7B",
    badge: "Aksen Natural",
    desc: "Aksen Asia & Indonesia sangat natural dan ritme artikulasi lancar.",
  },
  {
    id: "inworld:tts@2",
    name: "Inworld Realtime TTS-2",
    badge: "Dinamis & Interaktif",
    desc: "Vokal dinamis & dialog emosional untuk storytelling interaktif.",
  },
  {
    id: "xai:tts@0",
    name: "xAI TTS (Grok)",
    badge: "Ekspresif & Modern",
    desc: "Model TTS xAI dengan vokal ekspresif dan pelafalan multi-bahasa cerdas.",
  },
  {
    id: "minimax:speech@2.8",
    name: "MiniMax Speech 2.8",
    badge: "High-Realism Prosody",
    desc: "Sintesis vokal resolusi tinggi dengan intonasi emosional kaya dan artikulasi tajam.",
  },
];

export function formatAudioTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

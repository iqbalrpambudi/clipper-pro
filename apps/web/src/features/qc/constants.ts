import type { QCConfig } from "@/types";

export const DEFAULT_QC_CONFIG: QCConfig = {
  max_fix_rounds: 2,
  threshold: 7.5,
  platform: "tiktok",
  qc_model: null,
};

export const QC_PLATFORMS: { id: QCConfig["platform"]; label: string }[] = [
  { id: "tiktok", label: "TikTok FYP" },
  { id: "reels", label: "Instagram Reels" },
  { id: "shorts", label: "YouTube Shorts" },
];

export const QC_DIMENSION_LABELS: Record<string, string> = {
  hook: "Hook 3 Detik Awal",
  flow_retention: "Alur & Retensi",
  shot_match: "Kecocokan Naskah–Shot",
  spoken_naturalness: "Kelancaran Lisan TTS",
  clip_cuts: "Potongan & Transisi Klip",
  visual_relevance: "Relevansi Visual",
  frame_quality: "Kualitas Frame",
  audio_subtitle_sync: "Sinkron Audio & Subtitle",
  fyp_readiness: "Skor Kesiapan FYP",
};

export function normalizeQCConfig(raw?: Partial<QCConfig> | null): QCConfig {
  const platform =
    raw?.platform === "reels" || raw?.platform === "shorts" ? raw.platform : "tiktok";
  const maxRounds =
    typeof raw?.max_fix_rounds === "number" && Number.isFinite(raw.max_fix_rounds)
      ? Math.max(0, Math.min(3, Math.round(raw.max_fix_rounds)))
      : DEFAULT_QC_CONFIG.max_fix_rounds;
  const threshold =
    typeof raw?.threshold === "number" && Number.isFinite(raw.threshold)
      ? Math.max(1.0, Math.min(10.0, Number(raw.threshold.toFixed(1))))
      : DEFAULT_QC_CONFIG.threshold;

  return {
    max_fix_rounds: maxRounds,
    threshold,
    platform,
    qc_model: raw?.qc_model ?? DEFAULT_QC_CONFIG.qc_model,
  };
}

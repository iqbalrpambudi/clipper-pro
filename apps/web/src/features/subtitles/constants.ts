import { SubtitleStyle } from "@/types";

export const SUBTITLE_FONTS = [
  "Montserrat",
  "Poppins",
  "Bebas Neue",
  "Inter",
  "Anton",
  "Oswald",
  "Roboto",
];

export const HIGHLIGHT_COLORS = ["#FFE600", "#00E5FF", "#39FF14", "#FF453A", "#FF007A", "#FFFFFF"];

// Base offsets per position (ASS px on 1080x1920); dragging moves offset_y from here.
export const POSITION_OFFSET: Record<SubtitleStyle["position"], number> = {
  bottom: 260,
  center: 0,
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  preset_name: "pop_kuning",
  font_family: "Poppins",
  font_size: 58,
  highlight_color: "#FFE600",
  position: "bottom",
  offset_y: POSITION_OFFSET.bottom,
  burst_word_count: 3,
  highlight_animation: "scale",
};

export const SUBTITLE_PRESETS: { id: string; name: string; style: Partial<SubtitleStyle> }[] = [
  {
    id: "pop_kuning",
    name: "Pop kuning",
    style: {
      highlight_color: "#FFE600",
      highlight_animation: "scale",
      font_family: "Poppins",
      font_size: 58,
      burst_word_count: 3,
    },
  },
  {
    id: "bersih",
    name: "Bersih",
    style: {
      highlight_color: "#FFFFFF",
      highlight_animation: "none",
      font_family: "Poppins",
      font_size: 58,
      burst_word_count: 3,
    },
  },
  // Documentary look: one small white word at a time, low-center
  {
    id: "satu_kata",
    name: "Satu kata",
    style: {
      highlight_color: "#FFFFFF",
      highlight_animation: "none",
      font_family: "Montserrat",
      font_size: 48,
      burst_word_count: 1,
    },
  },
];

/** Server rows from older versions can hold values the API no longer accepts; coerce them. */
export function toSubtitleStyle(
  raw?: Partial<Record<keyof SubtitleStyle, unknown>> | null
): SubtitleStyle {
  const s = {
    ...DEFAULT_SUBTITLE_STYLE,
    ...Object.fromEntries(Object.entries(raw || {}).filter(([, v]) => v != null)),
  };
  const rawFont = String(s.font_family || "").trim();
  const normalizedFont = rawFont.toLowerCase() === "bebasneue" ? "Bebas Neue" : rawFont;
  return {
    ...(s as SubtitleStyle),
    enabled: s.enabled !== false,
    font_family: SUBTITLE_FONTS.includes(normalizedFont) ? normalizedFont : "Poppins",
    position: ["center", "top"].includes(String(s.position)) ? "center" : "bottom",
    burst_word_count: Math.min(3, Math.max(1, Math.round(Number(s.burst_word_count) || 3))) as
      1 | 2 | 3,
    highlight_animation: s.highlight_animation === "none" ? "none" : "scale",
  };
}

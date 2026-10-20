import { Flame, Zap, Sparkles, Eye, Layers } from "lucide-react";
import { SubtitleStyle } from "@/types";

export function hexToRgba(hex: string, opacity: number = 1): string {
  if (!hex) return `rgba(0, 0, 0, ${opacity})`;
  const clean = hex.replace("#", "");
  const fullHex =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(fullHex.substring(0, 2), 16) || 0;
  const g = parseInt(fullHex.substring(2, 4), 16) || 0;
  const b = parseInt(fullHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export interface ColorPresetItem {
  name: string;
  icon: typeof Flame;
  font_family: string;
  font_weight: string;
  primary_color: string;
  highlight_color: string;
  outline_color: string;
  outline_width: number;
  box_color: string;
  box_opacity: number;
  display_mode: "burst" | "per_word" | "full_sentence";
  burst_word_count: number;
  highlight_animation: "color" | "scale" | "none";
  scale_factor: number;
}

// Popular 1-Click Color Schemes matching Short Clipper
export const COLOR_PRESETS: ColorPresetItem[] = [
  {
    name: "TikTok Viral",
    icon: Flame,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
  {
    name: "Alex Hormozi",
    icon: Zap,
    font_family: "Bebas Neue",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#00FF66",
    outline_color: "#000000",
    outline_width: 6,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "scale",
    scale_factor: 1.25,
  },
  {
    name: "Cyber Aqua",
    icon: Zap,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#00E5FF",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
  {
    name: "Neon Lime",
    icon: Sparkles,
    font_family: "Montserrat",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#39FF14",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
  {
    name: "Hot Sunset",
    icon: Flame,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FF453A",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
  {
    name: "Minimal Clean",
    icon: Eye,
    font_family: "Inter",
    font_weight: "Regular",
    primary_color: "#F8FAFC",
    highlight_color: "#38BDF8",
    outline_color: "#0F172A",
    outline_width: 3,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "full_sentence",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
  {
    name: "Caption Box",
    icon: Layers,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 2,
    box_color: "#000000",
    box_opacity: 0.75,
    display_mode: "burst",
    burst_word_count: 2,
    highlight_animation: "color",
    scale_factor: 1.0,
  },
];

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  preset_name: "viral_tiktok",
  font_family: "Poppins",
  font_size: 38,
  font_weight: "Bold",
  primary_color: "#FFFFFF",
  highlight_color: "#FFE600",
  outline_color: "#000000",
  outline_width: 4,
  box_color: "#000000",
  box_opacity: 0.0,
  position: "bottom",
  offset_y: -30,
  offset_x: 0,
  display_mode: "burst",
  burst_word_count: 2,
  highlight_animation: "color",
  scale_factor: 1.0,
  emoji_enabled: false,
};

import { WatermarkConfig } from "@/types";

export const WATERMARK_FONTS = [
  { name: "Poppins", label: "Poppins", style: "Modern & Bersih" },
  { name: "Montserrat", label: "Montserrat", style: "Elegan & Kokoh" },
  { name: "Anton", label: "Anton", style: "Tebal & Menarik" },
  { name: "Bebas Neue", label: "Bebas Neue", style: "Punchy & Viral" },
  { name: "Oswald", label: "Oswald", style: "Ramping & Kuat" },
  { name: "Roboto", label: "Roboto", style: "Standar Industri" },
  { name: "Inter", label: "Inter", style: "Minimalis" },
  { name: "Playfair Display", label: "Playfair", style: "Klasik & Serif" },
  { name: "Outfit", label: "Outfit", style: "Futuristik & Rapi" },
  { name: "Cinzel", label: "Cinzel", style: "Sinematik & Megah" },
];

export const WATERMARK_COLOR_SWATCHES = [
  { name: "Putih", color: "#FFFFFF" },
  { name: "Kuning Viral", color: "#FFE600" },
  { name: "Amber Gold", color: "#F59E0B" },
  { name: "Cyan Biru", color: "#06B6D4" },
  { name: "Merah Aksen", color: "#EF4444" },
  { name: "Hitam Solid", color: "#000000" },
];

export const WATERMARK_POSITION_GRID: {
  id: WatermarkConfig["position"];
  label: string;
  iconCoord: string;
}[] = [
  { id: "top-left", label: "Atas Kiri", iconCoord: "justify-start items-start" },
  { id: "top-center", label: "Atas Tengah", iconCoord: "justify-center items-start" },
  { id: "top-right", label: "Atas Kanan", iconCoord: "justify-end items-start" },
  { id: "center-left", label: "Tengah Kiri", iconCoord: "justify-start items-center" },
  { id: "center", label: "Tengah", iconCoord: "justify-center items-center" },
  { id: "center-right", label: "Tengah Kanan", iconCoord: "justify-end items-center" },
  { id: "bottom-left", label: "Bawah Kiri", iconCoord: "justify-start items-end" },
  { id: "bottom-center", label: "Bawah Tengah", iconCoord: "justify-center items-end" },
  { id: "bottom-right", label: "Bawah Kanan", iconCoord: "justify-end items-end" },
];

export const WATERMARK_PRESETS: {
  name: string;
  desc: string;
  config: Partial<WatermarkConfig>;
}[] = [
  {
    name: "Handle Medsos",
    desc: "@username kanan bawah",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "@cliperpro",
      font_family: "Poppins",
      font_size: 34,
      font_color: "#FFFFFF",
      opacity: 0.85,
      position: "bottom-right",
      offset_x: 32,
      offset_y: 32,
      has_background: false,
      has_shadow: true,
    },
  },
  {
    name: "Branding Minimalis",
    desc: "Kiri atas elegan",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "CLIPER PRO",
      font_family: "Inter",
      font_size: 28,
      font_color: "#FFFFFF",
      opacity: 0.75,
      position: "top-left",
      offset_x: 28,
      offset_y: 28,
      has_background: false,
      has_shadow: true,
    },
  },
  {
    name: "Badge Punchy",
    desc: "Box gelap kontras tinggi",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "@kreator_video",
      font_family: "Bebas Neue",
      font_size: 38,
      font_color: "#FFE600",
      opacity: 0.95,
      position: "top-right",
      offset_x: 30,
      offset_y: 30,
      has_background: true,
      background_color: "#000000",
      background_opacity: 0.65,
      has_shadow: true,
    },
  },
  {
    name: "Proteksi Copyright",
    desc: "Transparan di tengah",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "© 2026 Cliper Pro",
      font_family: "Oswald",
      font_size: 42,
      font_color: "#FFFFFF",
      opacity: 0.4,
      position: "center",
      offset_x: 0,
      offset_y: 0,
      has_background: false,
      has_shadow: true,
    },
  },
  {
    name: "Overlay Transparan",
    desc: "Teks besar transparan di tengah",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "DRAFT",
      font_family: "Anton",
      font_size: 64,
      font_color: "#FFFFFF",
      opacity: 0.2,
      position: "center",
      offset_x: 0,
      offset_y: 0,
      has_background: false,
      has_shadow: false,
    },
  },
  {
    name: "Watermark Klasik",
    desc: "Serif elegan kanan bawah",
    config: {
      enabled: true,
      watermark_type: "text",
      text: "Cliper Studio",
      font_family: "Playfair Display",
      font_size: 30,
      font_color: "#FFFFFF",
      opacity: 0.7,
      position: "bottom-right",
      offset_x: 30,
      offset_y: 30,
      has_background: false,
      has_shadow: true,
    },
  },
];

export function normalizeWatermarkConfig(wm?: Partial<WatermarkConfig> | null): WatermarkConfig {
  return {
    enabled: wm?.enabled ?? false,
    watermark_type: "text",
    text: wm?.text ?? "@cliperpro",
    font_family: wm?.font_family || "Poppins",
    font_size: wm?.font_size ?? 34,
    font_color: wm?.font_color || "#FFFFFF",
    opacity: wm?.opacity ?? 0.85,
    position: wm?.position || "bottom-right",
    custom_x: typeof wm?.custom_x === "number" ? wm.custom_x : 50,
    custom_y: typeof wm?.custom_y === "number" ? wm.custom_y : 50,
    offset_x: wm?.offset_x ?? 32,
    offset_y: wm?.offset_y ?? 32,
    has_background: wm?.has_background ?? false,
    background_color: wm?.background_color || "#000000",
    background_opacity: wm?.background_opacity ?? 0.5,
    has_shadow: wm?.has_shadow ?? true,
    shadow_color: wm?.shadow_color || "#000000",
  };
}

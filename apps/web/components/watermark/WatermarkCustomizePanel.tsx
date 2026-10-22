"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Type,
  Stamp,
  Layers,
  Palette,
  Move,
  Check,
  Image as ImageIcon,
  UploadCloud,
  Trash2,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, WatermarkConfig } from "@/types";
import { Badge } from "@/components/ui/badge";

interface WatermarkCustomizePanelProps {
  project: Project;
  onWatermarkChange?: (watermark: WatermarkConfig) => void;
}

const AVAILABLE_FONTS = [
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

const COLOR_SWATCHES = [
  { name: "Putih", color: "#FFFFFF" },
  { name: "Kuning Viral", color: "#FFE600" },
  { name: "Amber Gold", color: "#F59E0B" },
  { name: "Cyan Biru", color: "#06B6D4" },
  { name: "Merah Aksen", color: "#EF4444" },
  { name: "Hitam Solid", color: "#000000" },
];

const POSITION_GRID: {
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

const PRESETS: {
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
      text: "CLİPER PRO",
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
    name: "Logo Kiri Atas",
    desc: "Preset posisi logo",
    config: {
      enabled: true,
      watermark_type: "image",
      position: "top-left",
      offset_x: 32,
      offset_y: 32,
      image_width: 150,
      opacity: 0.9,
      has_shadow: true,
    },
  },
  {
    name: "Logo Kanan Bawah",
    desc: "Preset watermark logo",
    config: {
      enabled: true,
      watermark_type: "image",
      position: "bottom-right",
      offset_x: 35,
      offset_y: 35,
      image_width: 140,
      opacity: 0.85,
      has_shadow: true,
    },
  },
];

function getInitialWatermark(wm?: WatermarkConfig | null): WatermarkConfig {
  return {
    enabled: wm?.enabled ?? false,
    watermark_type: wm?.watermark_type || "text",
    text: wm?.text || "@cliperpro",
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
    image_url: wm?.image_url || null,
    image_path: wm?.image_path || null,
    image_width: wm?.image_width ?? 160,
    image_height: wm?.image_height || null,
  };
}

export function WatermarkCustomizePanel({
  project,
  onWatermarkChange,
}: WatermarkCustomizePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [watermark, setWatermark] = useState<WatermarkConfig>(() =>
    getInitialWatermark(project.watermark)
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync when project.watermark updates externally
  useEffect(() => {
    if (project.watermark) {
      setWatermark(getInitialWatermark(project.watermark));
    }
  }, [project.watermark]);

  const updateMutation = useMutation({
    mutationFn: (newWm: WatermarkConfig) => api.updateProject(project.id, { watermark: newWm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan watermark", "error");
    },
  });

  const commitWatermark = (next: WatermarkConfig, showToastNotice?: string) => {
    setWatermark(next);
    onWatermarkChange?.(next);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      updateMutation.mutate(next);
      if (showToastNotice) {
        showToast(showToastNotice, "info");
      }
    }, 350);
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const next: WatermarkConfig = {
      ...watermark,
      ...preset.config,
      enabled: true,
    };
    commitWatermark(next, `Preset "${preset.name}" diterapkan`);
  };

  const addPrefix = (prefix: string) => {
    const current = watermark.text;
    if (!current.startsWith(prefix)) {
      commitWatermark({ ...watermark, text: `${prefix}${current}` });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("File harus berupa gambar (PNG, JPG, WebP, SVG)", "error");
      return;
    }

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.uploadWatermarkImage(project.id, formData);
      if (res.url) {
        commitWatermark(
          {
            ...watermark,
            watermark_type: "image",
            image_url: res.url,
            image_path: res.file_path,
            enabled: true,
          },
          "Logo watermark berhasil diunggah"
        );
      }
    } catch {
      // Local preview fallback
      const reader = new FileReader();
      reader.onload = (ev) => {
        const localUrl = ev.target?.result as string;
        commitWatermark(
          {
            ...watermark,
            watermark_type: "image",
            image_url: localUrl,
            enabled: true,
          },
          "Gambar dimuat secara lokal"
        );
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isImageMode = watermark.watermark_type === "image";

  return (
    <div className="space-y-5 text-foreground text-xs">
      {/* Header & Main Toggle */}
      <div className="bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Stamp className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                Watermark Video
                {watermark.enabled ? (
                  <Badge
                    variant="default"
                    className="text-[10px] bg-[#ECF3EB] text-[#456A4E] border border-[#C9DDCF]"
                  >
                    Aktif
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-muted-foreground border-[#D2CDBF]"
                  >
                    Nonaktif
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Teks overlay atau custom logo untuk identitas video
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={watermark.enabled}
              onChange={(e) => {
                const next = { ...watermark, enabled: e.target.checked };
                commitWatermark(
                  next,
                  e.target.checked ? "Watermark diaktifkan" : "Watermark dinonaktifkan"
                );
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-[#E5E1D7] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#D2CDBF] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Watermark Type Selector: Text vs Custom Image */}
        <div className="grid grid-cols-2 p-1 bg-[#F1EEE6] rounded-lg border border-[#E5E1D7] gap-1">
          <button
            type="button"
            onClick={() => commitWatermark({ ...watermark, watermark_type: "text" })}
            className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              !isImageMode
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Teks Watermark</span>
          </button>
          <button
            type="button"
            onClick={() => commitWatermark({ ...watermark, watermark_type: "image" })}
            className={`py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              isImageMode
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Gambar / Logo</span>
          </button>
        </div>

        {/* Quick Presets Grid */}
        <div className="pt-1">
          <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
            Preset Cepat Watermark
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="p-2 rounded-lg bg-[#F3F0E8] hover:bg-[#EAE6DD] border border-[#E5E1D7] hover:border-primary/40 text-left transition flex flex-col justify-between group"
              >
                <div className="font-semibold text-xs text-foreground group-hover:text-primary transition truncate">
                  {p.name}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mode-Specific Content: IMAGE vs TEXT */}
      {isImageMode ? (
        /* Image Watermark Configuration */
        <div className="space-y-4 bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7]">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-primary" />
              Upload Logo / Gambar Watermark
            </label>
            <span className="text-[10px] text-muted-foreground">PNG transparan disarankan</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleFileUpload}
            className="hidden"
          />

          {watermark.image_url ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F1EEE6] border border-[#E5E1D7]">
              {/* Checkered pattern background for PNG transparency visibility */}
              <div
                className="w-16 h-16 rounded-lg border border-[#D2CDBF] flex items-center justify-center p-1.5 relative overflow-hidden"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg, #1f1f1f 25%, transparent 25%), linear-gradient(-45deg, #1f1f1f 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1f1f1f 75%), linear-gradient(-45deg, transparent 75%, #1f1f1f 75%)",
                  backgroundSize: "12px 12px",
                  backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0px",
                }}
              >
                <img
                  src={watermark.image_url}
                  alt="Watermark Logo"
                  className="max-w-full max-h-full object-contain"
                  style={{ opacity: watermark.opacity }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  Logo Kustom Terpilih
                </div>
                <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                  Lebar: {watermark.image_width || 160}px • Opacity:{" "}
                  {Math.round((watermark.opacity ?? 0.85) * 100)}%
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="px-2.5 py-1 rounded-md bg-[#222] hover:bg-[#D2CDBF] text-[11px] text-foreground border border-[#DCD6C8] transition flex items-center gap-1"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UploadCloud className="w-3 h-3 text-primary" />
                    )}
                    Ganti Logo
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitWatermark({
                        ...watermark,
                        image_url: null,
                        image_path: null,
                      })
                    }
                    className="px-2.5 py-1 rounded-md bg-[#F8EEEA] hover:bg-[#F3E1D9] text-[#A9472C] border border-[#E9C9BD] text-[11px] transition flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[#D2CDBF] hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition bg-[#F3F0E8] hover:bg-[#FBFAF7] group"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-2 text-primary group-hover:scale-110 transition">
                {isUploadingImage ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <UploadCloud className="w-5 h-5" />
                )}
              </div>
              <div className="font-semibold text-xs text-foreground group-hover:text-primary transition">
                {isUploadingImage ? "Mengunggah Logo..." : "Klik atau Seret Logo / Gambar ke Sini"}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Format didukung: PNG, WebP, JPG, SVG (Maks. 5MB)
              </p>
            </div>
          )}

          {/* Image Size (Width) & Opacity Sliders */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Ukuran / Lebar Gambar</span>
                <span className="font-mono text-foreground font-semibold">
                  {watermark.image_width || 160}px
                </span>
              </div>
              <input
                type="range"
                min="40"
                max="400"
                step="5"
                value={watermark.image_width || 160}
                onChange={(e) =>
                  commitWatermark({
                    ...watermark,
                    image_width: parseInt(e.target.value) || 160,
                  })
                }
                className="w-full accent-primary h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Transparansi / Opacity</span>
                <span className="font-mono text-foreground font-semibold">
                  {Math.round((watermark.opacity ?? 0.85) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.0"
                step="0.05"
                value={watermark.opacity ?? 0.85}
                onChange={(e) =>
                  commitWatermark({
                    ...watermark,
                    opacity: parseFloat(e.target.value) || 0.85,
                  })
                }
                className="w-full accent-primary h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      ) : (
        /* Text Watermark Configuration */
        <div className="space-y-4 bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7]">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-primary" />
              Isi Teks Watermark
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => addPrefix("@")}
                className="px-2 py-0.5 rounded bg-[#EAE6DD] hover:bg-[#D2CDBF] text-[10px] text-muted-foreground hover:text-foreground border border-[#D2CDBF] transition"
                title="Tambah prefix @"
              >
                @
              </button>
              <button
                type="button"
                onClick={() => addPrefix("© ")}
                className="px-2 py-0.5 rounded bg-[#EAE6DD] hover:bg-[#D2CDBF] text-[10px] text-muted-foreground hover:text-foreground border border-[#D2CDBF] transition"
                title="Tambah simbol ©"
              >
                ©
              </button>
            </div>
          </div>

          <input
            type="text"
            value={watermark.text}
            onChange={(e) => commitWatermark({ ...watermark, text: e.target.value })}
            placeholder="Contoh: @cliperpro atau Nama Channel"
            className="w-full px-3 py-2 bg-[#F1EEE6] rounded-lg border border-[#E5E1D7] text-foreground text-xs focus:outline-none focus:border-primary transition font-medium"
          />

          {/* Live Typography Preview Card */}
          <div className="p-3 rounded-lg bg-[#F1EEE6] border border-[#E5E1D7] flex items-center justify-center min-h-[50px] overflow-hidden">
            <span
              style={{
                fontFamily: `"${watermark.font_family}", sans-serif`,
                fontSize: `${Math.min(32, Math.max(14, watermark.font_size * 0.75))}px`,
                color: watermark.font_color,
                opacity: watermark.opacity,
                fontWeight: 600,
                textShadow: watermark.has_shadow ? "0 2px 4px rgba(0,0,0,0.85)" : undefined,
                backgroundColor: watermark.has_background
                  ? watermark.background_color
                  : "transparent",
                padding: watermark.has_background ? "4px 10px" : "0",
                borderRadius: "4px",
              }}
              className="tracking-wide select-none"
            >
              {watermark.text || "@watermark"}
            </span>
          </div>

          {/* Font Family Selection */}
          <div className="space-y-2 pt-2">
            <label className="font-semibold text-foreground flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-primary" />
              Pilihan Font Kustom
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AVAILABLE_FONTS.map((f) => {
                const isSelected = watermark.font_family === f.name;
                return (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => commitWatermark({ ...watermark, font_family: f.name })}
                    className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                      isSelected
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-[#F3F0E8] border-[#E5E1D7] hover:border-[#D2CDBF] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span
                      style={{ fontFamily: `"${f.name}", sans-serif` }}
                      className="text-sm font-bold truncate block mb-1"
                    >
                      {f.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">{f.style}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size & Opacity Controls */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Ukuran Font</span>
                <span className="font-mono text-foreground font-semibold">
                  {watermark.font_size}px
                </span>
              </div>
              <input
                type="range"
                min="16"
                max="72"
                step="2"
                value={watermark.font_size}
                onChange={(e) =>
                  commitWatermark({ ...watermark, font_size: parseInt(e.target.value) || 34 })
                }
                className="w-full accent-primary h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-muted-foreground">Transparansi / Opacity</span>
                <span className="font-mono text-foreground font-semibold">
                  {Math.round(watermark.opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.10"
                max="1.0"
                step="0.05"
                value={watermark.opacity}
                onChange={(e) =>
                  commitWatermark({ ...watermark, opacity: parseFloat(e.target.value) || 0.85 })
                }
                className="w-full accent-primary h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Font Color & Quick Swatches */}
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Warna Teks</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={watermark.font_color}
                  onChange={(e) => commitWatermark({ ...watermark, font_color: e.target.value })}
                  className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                />
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {watermark.font_color}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.name}
                  type="button"
                  onClick={() => commitWatermark({ ...watermark, font_color: sw.color })}
                  style={{ backgroundColor: sw.color }}
                  className={`w-6 h-6 rounded-full border transition flex items-center justify-center ${
                    watermark.font_color.toLowerCase() === sw.color.toLowerCase()
                      ? "border-primary ring-2 ring-primary/40 scale-110"
                      : "border-[#D2CDBF] hover:scale-105"
                  }`}
                  title={sw.name}
                >
                  {watermark.font_color.toLowerCase() === sw.color.toLowerCase() && (
                    <Check
                      className={`w-3.5 h-3.5 ${
                        sw.color === "#FFFFFF" || sw.color === "#FFE600"
                          ? "text-black"
                          : "text-white"
                      }`}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Shared Position Controls (9-Grid) */}
      <div className="space-y-3 bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7]">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5 text-primary" />
          Posisi Layar Video
        </label>
        <p className="text-[11px] text-muted-foreground">
          Pilih lokasi penempatan watermark pada kanvas video
        </p>

        {/* Interactive 3x3 Grid Visualizer */}
        <div className="bg-[#F1EEE6] p-3 rounded-lg border border-[#E5E1D7] flex justify-center">
          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
            {POSITION_GRID.map((pos) => {
              const isSelected = watermark.position === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => commitWatermark({ ...watermark, position: pos.id })}
                  className={`h-11 rounded-lg border text-center transition flex flex-col items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-primary/20 border-primary text-primary font-bold shadow-sm shadow-primary/20"
                      : "bg-[#FBFAF7] border-[#E5E1D7] hover:border-[#D2CDBF] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-sm border border-current flex ${pos.iconCoord}`}>
                    <div className="w-1 h-1 bg-current rounded-full" />
                  </div>
                  <span className="text-[10px] leading-none">{pos.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Position Mode Trigger & Coordinate Badge */}
        <button
          type="button"
          onClick={() => commitWatermark({ ...watermark, position: "custom" })}
          className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between group ${
            watermark.position === "custom"
              ? "bg-primary/15 border-primary text-primary shadow-sm"
              : "bg-[#F3F0E8] border-[#E5E1D7] hover:border-[#D2CDBF] text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
                watermark.position === "custom"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-[#EAE6DD] text-muted-foreground group-hover:text-foreground"
              }`}
            >
              <Move className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-xs block">Posisi Kustom Bebas (Drag & Drop)</span>
              <span className="text-[10px] text-muted-foreground">
                Tarik watermark sesuka hati langsung di area preview layar
              </span>
            </div>
          </div>
          {watermark.position === "custom" ? (
            <Badge
              variant="outline"
              className="border-primary text-primary bg-primary/10 text-[10px] font-mono shrink-0"
            >
              X: {Math.round(watermark.custom_x ?? 50)}% Y: {Math.round(watermark.custom_y ?? 50)}%
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground">
              Pilih
            </span>
          )}
        </button>
      </div>

      {/* Style Enhancements (Shadow & Background Badge) */}
      <div className="space-y-3 bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7]">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" />
          Efek & Visual Kontras
        </label>

        {/* Shadow & Outline Toggle */}
        <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#F3F0E8] border border-[#E5E1D7] cursor-pointer hover:border-[#DCD6C8] transition">
          <div>
            <div className="font-semibold text-xs text-foreground">
              Bayangan Kontras (Drop Shadow)
            </div>
            <div className="text-[10px] text-muted-foreground">
              Meningkatkan keterbacaan di atas video berwarna terang atau ramai
            </div>
          </div>
          <input
            type="checkbox"
            checked={watermark.has_shadow}
            onChange={(e) => commitWatermark({ ...watermark, has_shadow: e.target.checked })}
            className="rounded border-[#E5E1D7] text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
          />
        </label>

        {/* Background Box Badge Toggle (Only for text) */}
        {!isImageMode && (
          <div className="p-2.5 rounded-lg bg-[#F3F0E8] border border-[#E5E1D7] space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="font-semibold text-xs text-foreground">
                  Badge Latar Belakang (Box)
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Menambahkan kotak transparan di belakang teks watermark
                </div>
              </div>
              <input
                type="checkbox"
                checked={watermark.has_background}
                onChange={(e) =>
                  commitWatermark({ ...watermark, has_background: e.target.checked })
                }
                className="rounded border-[#E5E1D7] text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
              />
            </label>

            {watermark.has_background && (
              <div className="pt-2 border-t border-[#E5E1D7] grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-muted-foreground block mb-1">Warna Badge</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={watermark.background_color || "#000000"}
                      onChange={(e) =>
                        commitWatermark({ ...watermark, background_color: e.target.value })
                      }
                      className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">
                      {watermark.background_color || "#000000"}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Opacity Badge</span>
                    <span className="font-mono text-foreground font-semibold">
                      {Math.round((watermark.background_opacity ?? 0.5) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    value={watermark.background_opacity ?? 0.5}
                    onChange={(e) =>
                      commitWatermark({
                        ...watermark,
                        background_opacity: parseFloat(e.target.value) || 0.5,
                      })
                    }
                    className="w-full accent-primary h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

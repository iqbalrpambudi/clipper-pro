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
  { id: "top-left", label: "Kiri Atas", iconCoord: "justify-start items-start" },
  { id: "top-center", label: "Tengah Atas", iconCoord: "justify-center items-start" },
  { id: "top-right", label: "Kanan Atas", iconCoord: "justify-end items-start" },
  { id: "center", label: "Tengah", iconCoord: "justify-center items-center" },
  { id: "bottom-left", label: "Kiri Bawah", iconCoord: "justify-start items-end" },
  { id: "bottom-center", label: "Tengah Bawah", iconCoord: "justify-center items-end" },
  { id: "bottom-right", label: "Kanan Bawah", iconCoord: "justify-end items-end" },
];

const PRESETS: {
  name: string;
  desc: string;
  config: Partial<WatermarkConfig>;
}[] = [
  {
    name: "Handle Medsos",
    desc: "@username di kanan bawah",
    config: {
      enabled: true,
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
    name: "Badge Kreator",
    desc: "Box gelap punchy",
    config: {
      enabled: true,
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
];

function getInitialWatermark(wm?: WatermarkConfig | null): WatermarkConfig {
  return {
    enabled: wm?.enabled ?? false,
    text: wm?.text || "@cliperpro",
    font_family: wm?.font_family || "Poppins",
    font_size: wm?.font_size ?? 34,
    font_color: wm?.font_color || "#FFFFFF",
    opacity: wm?.opacity ?? 0.85,
    position: wm?.position || "bottom-right",
    offset_x: wm?.offset_x ?? 32,
    offset_y: wm?.offset_y ?? 32,
    has_background: wm?.has_background ?? false,
    background_color: wm?.background_color || "#000000",
    background_opacity: wm?.background_opacity ?? 0.5,
    has_shadow: wm?.has_shadow ?? true,
    shadow_color: wm?.shadow_color || "#000000",
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

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync when project.watermark updates externally
  useEffect(() => {
    if (project.watermark) {
      setWatermark(getInitialWatermark(project.watermark));
    }
  }, [project.watermark]);

  const updateMutation = useMutation({
    mutationFn: (newWm: WatermarkConfig) =>
      api.updateProject(project.id, { watermark: newWm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: any) => {
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

  const applyPreset = (preset: typeof PRESETS[0]) => {
    const next: WatermarkConfig = {
      ...watermark,
      ...preset.config,
      enabled: true,
    };
    commitWatermark(next, `Preset "${preset.name}" diterapkan`);
  };

  const addPrefix = (prefix: string) => {
    let current = watermark.text;
    if (!current.startsWith(prefix)) {
      commitWatermark({ ...watermark, text: `${prefix}${current}` });
    }
  };

  return (
    <div className="space-y-6 text-foreground text-xs">
      {/* Header & Main Toggle */}
      <div className="bg-[#181818] rounded-xl p-4 border border-[#2E2E2E] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Stamp className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-sm flex items-center gap-2">
                Watermark Video
                {watermark.enabled ? (
                  <Badge variant="default" className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Aktif
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground border-[#333]">
                    Nonaktif
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Teks overlay personalisasi untuk branding & identitas video
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
            <div className="w-11 h-6 bg-[#2A2A2A] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Quick Presets Carousel/Grid */}
        <div className="pt-2">
          <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">
            Preset Cepat Watermark
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="p-2 rounded-lg bg-[#141414] hover:bg-[#202020] border border-[#2E2E2E] hover:border-primary/40 text-left transition flex flex-col justify-between group"
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

      {/* Watermark Text Configuration */}
      <div className="space-y-4 bg-[#181818] rounded-xl p-4 border border-[#2E2E2E]">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-foreground flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-primary" />
            Isi Teks Watermark
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => addPrefix("@")}
              className="px-2 py-0.5 rounded bg-[#242424] hover:bg-[#333] text-[10px] text-muted-foreground hover:text-foreground border border-[#333] transition"
              title="Tambah prefix @"
            >
              @
            </button>
            <button
              type="button"
              onClick={() => addPrefix("© ")}
              className="px-2 py-0.5 rounded bg-[#242424] hover:bg-[#333] text-[10px] text-muted-foreground hover:text-foreground border border-[#333] transition"
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
          className="w-full px-3 py-2 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs focus:outline-none focus:border-primary transition font-medium"
        />

        {/* Live Typography Preview Card */}
        <div className="p-3 rounded-lg bg-[#121212] border border-[#2A2A2A] flex items-center justify-center min-h-[50px] overflow-hidden">
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
      </div>

      {/* Font Family Selection */}
      <div className="space-y-3 bg-[#181818] rounded-xl p-4 border border-[#2E2E2E]">
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
                    : "bg-[#141414] border-[#2E2E2E] hover:border-[#444] text-muted-foreground hover:text-foreground"
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

        {/* Font Size & Opacity Controls */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">Ukuran Font</span>
              <span className="font-mono text-foreground font-semibold">{watermark.font_size}px</span>
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
              className="w-full accent-primary h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer"
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
              min="0.15"
              max="1.0"
              step="0.05"
              value={watermark.opacity}
              onChange={(e) =>
                commitWatermark({ ...watermark, opacity: parseFloat(e.target.value) || 0.85 })
              }
              className="w-full accent-primary h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer"
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
                    : "border-[#444] hover:scale-105"
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

      {/* Position Selector (9-Grid) */}
      <div className="space-y-3 bg-[#181818] rounded-xl p-4 border border-[#2E2E2E]">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5 text-primary" />
          Posisi Layar Video
        </label>
        <p className="text-[11px] text-muted-foreground">
          Pilih lokasi penempatan watermark pada kanvas video
        </p>

        {/* Interactive 3x3 Grid Visualizer */}
        <div className="bg-[#121212] p-3 rounded-lg border border-[#2E2E2E] flex justify-center">
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
                      : "bg-[#181818] border-[#2A2A2A] hover:border-[#444] text-muted-foreground hover:text-foreground"
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

        {/* Margin / Offsets Sliders */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">Jarak X (Horizontal)</span>
              <span className="font-mono text-foreground font-semibold">{watermark.offset_x}px</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={watermark.offset_x}
              onChange={(e) =>
                commitWatermark({ ...watermark, offset_x: parseInt(e.target.value) || 30 })
              }
              className="w-full accent-primary h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">Jarak Y (Vertikal)</span>
              <span className="font-mono text-foreground font-semibold">{watermark.offset_y}px</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={watermark.offset_y}
              onChange={(e) =>
                commitWatermark({ ...watermark, offset_y: parseInt(e.target.value) || 30 })
              }
              className="w-full accent-primary h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Style Enhancements (Shadow & Background Badge) */}
      <div className="space-y-3 bg-[#181818] rounded-xl p-4 border border-[#2E2E2E]">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" />
          Efek & Latar Belakang
        </label>

        {/* Shadow & Outline Toggle */}
        <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#141414] border border-[#2A2A2A] cursor-pointer hover:border-[#3A3A3A] transition">
          <div>
            <div className="font-semibold text-xs text-foreground">Bayangan Teks (Shadow & Stroke)</div>
            <div className="text-[10px] text-muted-foreground">
              Menjaga keterbacaan teks di atas video berwarna terang
            </div>
          </div>
          <input
            type="checkbox"
            checked={watermark.has_shadow}
            onChange={(e) => commitWatermark({ ...watermark, has_shadow: e.target.checked })}
            className="rounded border-[#2E2E2E] text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
          />
        </label>

        {/* Background Box Badge Toggle */}
        <div className="p-2.5 rounded-lg bg-[#141414] border border-[#2A2A2A] space-y-2.5">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold text-xs text-foreground">Badge Latar Belakang (Box)</div>
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
              className="rounded border-[#2E2E2E] text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
            />
          </label>

          {watermark.has_background && (
            <div className="pt-2 border-t border-[#262626] grid grid-cols-2 gap-3">
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
                  className="w-full accent-primary h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

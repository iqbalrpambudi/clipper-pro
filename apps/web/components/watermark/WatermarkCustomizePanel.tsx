import React, { useState, useEffect, useRef } from "react";
import {
  Type,
  Layers,
  Palette,
  Move,
  Check,
  Loader2,
} from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
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

function getInitialWatermark(wm?: WatermarkConfig | null): WatermarkConfig {
  return {
    enabled: wm?.enabled ?? false,
    watermark_type: "text",
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
  };
}

export function WatermarkCustomizePanel({
  project,
  onWatermarkChange,
}: WatermarkCustomizePanelProps) {
  const { showToast } = useStudioStore();
  const queryClient = useQueryClient();

  const [watermark, setWatermark] = useState<WatermarkConfig>(() =>
    getInitialWatermark(project.watermark)
  );

  const lastCommitRef = useRef<WatermarkConfig | null>(project.watermark || null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const saveMutation = useMutation({
    mutationFn: (wm: WatermarkConfig) => api.updateProject(project.id, { watermark: wm }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", project.id], (old: any) =>
        old ? { ...old, watermark: updated.watermark } : old
      );
    },
  });

  // Sync when project.watermark updates externally (e.g. from canvas drag or server)
  useEffect(() => {
    if (project.watermark) {
      const serverKey = JSON.stringify(project.watermark);
      const localKey = JSON.stringify(lastCommitRef.current);
      if (serverKey !== localKey) {
        setWatermark(getInitialWatermark(project.watermark));
        lastCommitRef.current = project.watermark;
      }
    }
  }, [project.watermark]);

  const commitWatermark = (next: WatermarkConfig, showToastNotice?: string, immediate = false) => {
    setWatermark(next);
    lastCommitRef.current = next;
    onWatermarkChange?.(next);

    // Optimistic cache update so all tabs immediately reflect the new watermark
    queryClient.setQueryData(["project", project.id], (old: any) =>
      old ? { ...old, watermark: next } : old
    );

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (immediate) {
      saveMutation.mutate(next);
    } else {
      autosaveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(next);
      }, 500);
    }

    if (showToastNotice) {
      showToast(showToastNotice, "info");
    }
  };

  // Flush pending save on unmount (e.g. switching tabs / pages)
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current && lastCommitRef.current) {
        clearTimeout(autosaveTimerRef.current);
        api.updateProject(project.id, { watermark: lastCommitRef.current }).catch(() => {});
      }
    };
  }, [project.id]);

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const next: WatermarkConfig = {
      ...watermark,
      ...preset.config,
      enabled: true,
    };
    commitWatermark(next, `Preset "${preset.name}" diterapkan`, true);
  };

  const addPrefix = (prefix: string) => {
    const current = watermark.text;
    if (!current.startsWith(prefix)) {
      commitWatermark({ ...watermark, text: `${prefix}${current}` });
    }
  };



  return (
    <div className="space-y-5 text-foreground text-xs">
      {/* Header & Main Toggle */}
      <div className="bg-[#FBFAF7] rounded-xl p-4 border border-[#E5E1D7] shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="watermark-enable-check"
            className="flex items-center gap-3 cursor-pointer select-none flex-1"
          >
            <input
              id="watermark-enable-check"
              type="checkbox"
              checked={watermark.enabled}
              onChange={(e) => {
                const checked = e.target.checked;
                commitWatermark(
                  { ...watermark, enabled: checked },
                  checked ? "Watermark diaktifkan." : "Watermark dinonaktifkan."
                );
              }}
              className="w-4 h-4 rounded accent-[#C45B3A] cursor-pointer"
            />
            <div>
              <span className="block text-xs font-semibold text-[#26251F]">
                Gunakan Watermark pada Video
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {watermark.enabled
                  ? "Watermark tampil di preview dan akan dibakar ke render video"
                  : "Video bersih tanpa watermark (hanya visual adegan & audio narasi)"}
              </span>
            </div>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            {saveMutation.isPending && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-[#C45B3A]" />
                <span className="hidden sm:inline">Menyimpan...</span>
              </span>
            )}
            <Badge
              variant={watermark.enabled ? "default" : "secondary"}
              className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
                watermark.enabled
                  ? "bg-[#F8EEEA] text-[#A9472C] border border-[#C45B3A]/40"
                  : "bg-[#F1EEE6] text-[#77766D] border border-[#E5E1D7]"
              }`}
            >
              {watermark.enabled ? "AKTIF" : "NONAKTIF"}
            </Badge>
          </div>
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

      {/* Text Watermark Configuration */}
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

        {/* Background Box Badge Toggle */}
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
      </div>
    </div>
  );
}

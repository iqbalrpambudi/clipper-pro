"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Palette,
  FileCode,
  ArrowRight,
  Download,
  Sliders,
  CheckCircle2,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle, SubtitleStyleUpdateRequest, SubtitlePreset, Narration, AudioTrack, TimelineClip } from "@/types";
import { PreviewPlayer } from "@/components/render/PreviewPlayer";

interface SubtitleStudioTabProps {
  project: Project & {
    timeline?: { clips: TimelineClip[]; total_duration: number } | null;
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
  };
}

export function SubtitleStudioTab({ project }: SubtitleStudioTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  const [style, setStyle] = useState<SubtitleStyle>({
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
    emoji_enabled: true,
  });

  const [isAssModalOpen, setIsAssModalOpen] = useState(false);
  const [assContent, setAssContent] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);

  const { data: presets = [] } = useQuery({
    queryKey: ["subtitle-presets"],
    queryFn: api.getSubtitlePresets,
  });

  useEffect(() => {
    // Don't let a stale server response clobber unsaved local style edits
    if (styleDebounceRef.current) return;
    if (project.subtitle_style) {
      setStyle((prev) => ({
        ...prev,
        ...project.subtitle_style,
      }));
    }
  }, [project.subtitle_style]);

  const updateStyleMutation = useMutation({
    mutationFn: (data: SubtitleStyleUpdateRequest) => api.updateSubtitleStyle(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gaya subtitle berhasil disimpan!", "success");
      setIsSavePresetOpen(false);
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan gaya subtitle", "error");
    },
  });

  // Debounced style commit: color pickers fire on every input event, which
  // previously produced a PUT per pixel of mouse movement.
  const styleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (styleDebounceRef.current) clearTimeout(styleDebounceRef.current);
    },
    []
  );

  const commitStyle = (updated: SubtitleStyle) => {
    setStyle(updated);
    if (styleDebounceRef.current) clearTimeout(styleDebounceRef.current);
    styleDebounceRef.current = setTimeout(() => {
      updateStyleMutation.mutate(updated);
    }, 400);
  };

  const handleApplyPreset = (preset: SubtitlePreset) => {
    const updated: SubtitleStyle = {
      ...style,
      preset_name: preset.preset_name || preset.id,
      font_family: preset.font_family,
      font_size: preset.font_size,
      font_weight: preset.font_weight,
      primary_color: preset.primary_color,
      highlight_color: preset.highlight_color,
      outline_color: preset.outline_color,
      outline_width: preset.outline_width,
      box_color: preset.box_color,
      box_opacity: preset.box_opacity,
      position: preset.position,
      offset_y: preset.offset_y ?? 0,
      offset_x: preset.offset_x ?? 0,
      display_mode: preset.display_mode,
      burst_word_count: preset.burst_word_count ?? 2,
      highlight_animation: preset.highlight_animation ?? "color",
      scale_factor: preset.scale_factor ?? 1.0,
      emoji_enabled: preset.emoji_enabled ?? true,
    };
    setStyle(updated);
    updateStyleMutation.mutate(updated);
  };

  const handlePreviewASS = async () => {
    try {
      const res = await api.previewASS(project.id);
      setAssContent(res.ass_content);
      setIsAssModalOpen(true);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Gagal menghasilkan preview ASS", "error");
    }
  };

  const projectWithActiveStyle = {
    ...project,
    subtitle_style: style,
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ========================================================================= */}
      {/* KOLOM KIRI (7/12): PRESET GAYA & PANEL KUSTOMISASI DETAIL STYLING        */}
      {/* ========================================================================= */}
      <div className="lg:col-span-7 space-y-4">
        {/* Preset Selection & Quick Export Header Card */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-surface-border/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent-yellow" />
              <h3 className="text-sm font-bold text-white tracking-tight">Pilih Preset Subtitle</h3>
              <Link
                href="/settings"
                className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium underline transition"
                title="Buka Pengaturan Preset Subtitle"
              >
                <SettingsIcon className="w-2.5 h-2.5" />
                <span>Kelola Preset</span>
              </Link>
            </div>

            {/* Quick Export Tools */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handlePreviewASS}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-surface-border text-[11px] text-slate-300 hover:text-white bg-surface hover:bg-white/5 transition"
                title="Lihat Script File ASS"
              >
                <FileCode className="w-3 h-3 text-brand-400" />
                <span>ASS</span>
              </button>

              <a
                href={api.getSubtitleExportUrl(project.id, "ass")}
                download
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-border text-[10px] font-mono text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 transition"
                title="Download ASS"
              >
                <Download className="w-2.5 h-2.5" />
                <span>.ASS</span>
              </a>
              <a
                href={api.getSubtitleExportUrl(project.id, "srt")}
                download
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-border text-[10px] font-mono text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                title="Download SRT"
              >
                <Download className="w-2.5 h-2.5" />
                <span>.SRT</span>
              </a>
              <a
                href={api.getSubtitleExportUrl(project.id, "vtt")}
                download
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-surface-border text-[10px] font-mono text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 transition"
                title="Download VTT"
              >
                <Download className="w-2.5 h-2.5" />
                <span>.VTT</span>
              </a>
            </div>
          </div>

          {/* Preset Cards Grid (Compact & Scrollable) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
            {presets.map((p) => {
              const isSelected = style.preset_name === (p.preset_name || p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => handleApplyPreset(p)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-brand-500 bg-brand-500/15 shadow-md shadow-brand-500/10 ring-1 ring-brand-500/40"
                      : "border-surface-border bg-surface/50 hover:bg-surface hover:border-slate-500"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-1.5 min-w-0">
                      <span
                        className="text-xs font-bold text-white truncate min-w-0 flex-1"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                      )}
                    </div>

                    {/* Preview visual mini box */}
                    <div className="h-10 rounded-lg bg-black/60 flex items-center justify-center p-1.5 mb-2 border border-surface-border/70 overflow-hidden">
                      <span
                        style={{
                          color: p.primary_color,
                          fontFamily: `"${p.font_family}", sans-serif`,
                          fontWeight: p.font_weight?.toLowerCase() === "bold" ? "bold" : "normal",
                          textShadow: `-1.5px -1.5px 0 ${p.outline_color}, 1.5px -1.5px 0 ${p.outline_color}, -1.5px 1.5px 0 ${p.outline_color}, 1.5px 1.5px 0 ${p.outline_color}`,
                          backgroundColor: p.box_opacity > 0.05 ? p.box_color : "transparent",
                          padding: p.box_opacity > 0.05 ? "1px 4px" : "0",
                          borderRadius: "3px",
                        }}
                        className="text-[10px] uppercase font-bold tracking-wider truncate"
                      >
                        SUBTITLE <span style={{ color: p.highlight_color }}>VIRAL</span>
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 line-clamp-1">{p.description}</p>
                  </div>

                  <div className="pt-1.5 border-t border-surface-border/50 text-[9px] text-slate-500 flex justify-between mt-1.5">
                    <span className="capitalize">{p.display_mode.replace("_", " ")}</span>
                    <span className="capitalize">{p.position}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Style Customizer */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand-400" />
              <h4 className="text-sm font-bold text-white">Kustomisasi Style & Efek</h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSavePresetOpen(true)}
                className="px-2.5 py-1 rounded-lg border border-surface-border bg-surface hover:bg-white/5 text-[11px] text-slate-300 hover:text-white transition"
              >
                Simpan Preset
              </button>
              <button
                type="button"
                onClick={() => updateStyleMutation.mutate(style)}
                disabled={updateStyleMutation.isPending}
                className="px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs shadow-md transition"
              >
                {updateStyleMutation.isPending ? "Menyimpan..." : "Simpan Style"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            {/* Font Family */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Font Family</label>
              <select
                value={style.font_family}
                onChange={(e) => {
                  const updated = { ...style, font_family: e.target.value };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="Montserrat">Montserrat (Modern Bold)</option>
                <option value="Bebas Neue">Bebas Neue (Punch Hormozi)</option>
                <option value="Poppins">Poppins (Clean & Crisp)</option>
                <option value="Inter">Inter (Minimalist Clean)</option>
                <option value="Anton">Anton (Bold Poster)</option>
                <option value="Oswald">Oswald (Condensed Strong)</option>
                <option value="Roboto">Roboto (Clean Neutral)</option>
              </select>
            </div>

            {/* Font Size */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 font-semibold">Ukuran Font</label>
                <span className="font-mono text-brand-300 font-bold">{style.font_size}px</span>
              </div>
              <input
                type="range"
                min={36}
                max={84}
                step={2}
                value={style.font_size}
                onChange={(e) => setStyle({ ...style, font_size: parseInt(e.target.value) })}
                onPointerUp={(e) =>
                  commitStyle({
                    ...style,
                    font_size: parseInt((e.target as HTMLInputElement).value),
                  })
                }
                className="w-full mt-1.5 accent-brand-500 cursor-pointer"
              />
            </div>

            {/* Display Mode */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Mode Tampilan Teks</label>
              <select
                value={style.display_mode}
                onChange={(e) => {
                  const updated = {
                    ...style,
                    display_mode: e.target.value as SubtitleStyle["display_mode"],
                  };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="per_word">Per-Kata (Word-by-Word)</option>
                <option value="burst">Burst 2-3 Kata (Gaya Hormozi)</option>
                <option value="full_sentence">Kalimat Penuh Highlight</option>
              </select>
            </div>

            {/* Burst Count */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Kata per Burst Group
              </label>
              <select
                value={style.burst_word_count}
                onChange={(e) => {
                  const updated = { ...style, burst_word_count: parseInt(e.target.value) };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                disabled={style.display_mode !== "burst"}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-semibold disabled:opacity-40"
              >
                <option value={2}>2 Kata per Burst</option>
                <option value={3}>3 Kata per Burst</option>
              </select>
            </div>

            {/* Primary Color */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Warna Teks Normal</label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.primary_color}
                  onChange={(e) => setStyle({ ...style, primary_color: e.target.value })}
                  onBlur={(e) =>
                    commitStyle({ ...style, primary_color: (e.target as HTMLInputElement).value })
                  }
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-[11px]">{style.primary_color}</span>
              </div>
            </div>

            {/* Highlight Color */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Warna Highlight Aktif
              </label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.highlight_color}
                  onChange={(e) => setStyle({ ...style, highlight_color: e.target.value })}
                  onBlur={(e) =>
                    commitStyle({ ...style, highlight_color: (e.target as HTMLInputElement).value })
                  }
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-[11px]">
                  {style.highlight_color}
                </span>
              </div>
            </div>

            {/* Outline Color & Width */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Warna Outline/Stroke
              </label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.outline_color}
                  onChange={(e) => setStyle({ ...style, outline_color: e.target.value })}
                  onBlur={(e) =>
                    commitStyle({ ...style, outline_color: (e.target as HTMLInputElement).value })
                  }
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-[11px]">{style.outline_color}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 font-semibold">Tebal Outline</label>
                <span className="font-mono text-brand-300 font-bold">{style.outline_width}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                value={style.outline_width}
                onChange={(e) => setStyle({ ...style, outline_width: parseInt(e.target.value) })}
                onPointerUp={(e) =>
                  commitStyle({
                    ...style,
                    outline_width: parseInt((e.target as HTMLInputElement).value),
                  })
                }
                className="w-full mt-1.5 accent-brand-500 cursor-pointer"
              />
            </div>

            {/* Background Box Opacity & Color */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 font-semibold">Transparansi Box</label>
                <span className="font-mono text-brand-300 font-bold">
                  {Math.round((style.box_opacity || 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((style.box_opacity || 0) * 100)}
                onChange={(e) =>
                  setStyle({ ...style, box_opacity: parseFloat(e.target.value) / 100.0 })
                }
                onPointerUp={(e) =>
                  commitStyle({
                    ...style,
                    box_opacity: parseFloat((e.target as HTMLInputElement).value) / 100.0,
                  })
                }
                className="w-full mt-1.5 accent-brand-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Warna Box Background
              </label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.box_color || "#000000"}
                  onChange={(e) => setStyle({ ...style, box_color: e.target.value })}
                  onBlur={(e) =>
                    commitStyle({ ...style, box_color: (e.target as HTMLInputElement).value })
                  }
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-[11px]">
                  {style.box_color || "#000000"}
                </span>
              </div>
            </div>

            {/* Position Preset */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Posisi Layar Vertikal
              </label>
              <select
                value={style.position}
                onChange={(e) => {
                  const updated = {
                    ...style,
                    position: e.target.value as SubtitleStyle["position"],
                  };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="bottom">Bawah (Default Short)</option>
                <option value="center">Tengah Layar (Hormozi Center)</option>
                <option value="top">Atas Layar</option>
              </select>
            </div>

            {/* Animation */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Animasi Kata Aktif</label>
              <select
                value={style.highlight_animation}
                onChange={(e) => {
                  const updated = {
                    ...style,
                    highlight_animation: e.target.value as SubtitleStyle["highlight_animation"],
                  };
                  commitStyle(updated);
                }}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="color">Warna Glow (Halus)</option>
                <option value="scale">Scale & Zoom Pop (Hormozi)</option>
                <option value="none">Tanpa Animasi</option>
              </select>
            </div>
          </div>

          {/* Active Word Zoom Factor */}
          {style.highlight_animation === "scale" && (
            <div className="p-3.5 rounded-xl bg-brand-950/30 border border-brand-500/30 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-brand-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
                  Faktor Zoom Kata Aktif:
                </span>
                <span className="font-mono font-bold text-brand-200 text-xs px-2 py-0.5 rounded bg-brand-500/20 border border-brand-500/30">
                  {(style.scale_factor || 1.15).toFixed(2)}x
                </span>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: "1.10x (Sangat Halus)", val: 1.1 },
                  { label: "1.15x (Halus - Standar)", val: 1.15 },
                  { label: "1.25x (Sedang)", val: 1.25 },
                  { label: "1.35x (Tegas)", val: 1.35 },
                  { label: "1.50x (Ekstra)", val: 1.5 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => commitStyle({ ...style, scale_factor: item.val })}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition ${
                      Math.abs((style.scale_factor || 1.15) - item.val) < 0.03
                        ? "bg-brand-500 text-white shadow-sm font-bold scale-105"
                        : "bg-surface hover:bg-white/10 border border-surface-border text-slate-300 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <input
                type="range"
                min={1.05}
                max={1.8}
                step={0.05}
                value={style.scale_factor || 1.15}
                onChange={(e) => setStyle({ ...style, scale_factor: parseFloat(e.target.value) })}
                onPointerUp={(e) =>
                  commitStyle({
                    ...style,
                    scale_factor: parseFloat((e.target as HTMLInputElement).value),
                  })
                }
                className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-1 accent-brand-500"
              />
            </div>
          )}

          {/* Precision Offset Sliders */}
          <div className="p-3.5 rounded-xl bg-black/40 border border-surface-border space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-slate-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-brand-400" />
                Koreksi Koordinat Pixel
              </span>
              <span className="font-mono text-[11px] text-brand-300">
                X: {style.offset_x || 0}px • Y: {style.offset_y || 0}px
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <span className="text-slate-400">Offset Y:</span>
                  <span className="font-mono text-brand-300">{style.offset_y || 0}px</span>
                </div>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={5}
                  value={style.offset_y || 0}
                  onChange={(e) => setStyle({ ...style, offset_y: parseInt(e.target.value) })}
                  onPointerUp={(e) =>
                    commitStyle({
                      ...style,
                      offset_y: parseInt((e.target as HTMLInputElement).value),
                    })
                  }
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <span className="text-slate-400">Offset X:</span>
                  <span className="font-mono text-brand-300">{style.offset_x || 0}px</span>
                </div>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  step={5}
                  value={style.offset_x || 0}
                  onChange={(e) => setStyle({ ...style, offset_x: parseInt(e.target.value) })}
                  onPointerUp={(e) =>
                    commitStyle({
                      ...style,
                      offset_x: parseInt((e.target as HTMLInputElement).value),
                    })
                  }
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KOLOM KANAN (5/12): COMPACT PREVIEW PLAYER & SUBTITLE EXPORT              */}
      {/* ========================================================================= */}
      <div className="lg:col-span-5 space-y-4">
        {/* Compact Live Preview Player Card */}
        <div className="glass-panel rounded-2xl p-4 border border-surface-border flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-2.5 border-b border-surface-border pb-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              Live Subtitle Preview
            </h4>
            <span className="text-[10px] text-slate-400 font-mono bg-black/40 px-2 py-0.5 rounded-full border border-surface-border">
              X: {style.offset_x || 0}px • Y: {style.offset_y || 0}px
            </span>
          </div>

          <div className="w-full flex justify-center py-0.5">
            <PreviewPlayer
              project={projectWithActiveStyle}
              compact={true}
              onUpdateSubtitlePosition={(pos) => {
                const updated = {
                  ...style,
                  offset_x: pos.offset_x,
                  offset_y: pos.offset_y,
                };
                commitStyle(updated);
              }}
            />
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-2 leading-snug">
            💡 <em>Tips:</em> Klik & drag teks subtitle pada layar untuk menggeser posisi.
          </p>
        </div>

        {/* Subtitle Export & Script Card */}
        <div className="glass-panel rounded-2xl p-4 border border-surface-border space-y-4">
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-brand-400" />
                <span>Ekspor File Subtitle</span>
              </h4>
              <p className="text-[10px] text-slate-400">
                Unduh file subtitle sesuai standar format video
              </p>
            </div>
            <button
              type="button"
              onClick={handlePreviewASS}
              className="h-7 px-2.5 rounded-lg border border-surface-border text-[11px] text-slate-300 hover:text-white bg-surface hover:bg-white/5 transition flex items-center gap-1 shadow-sm cursor-pointer"
              title="Lihat kode script .ASS mentah"
            >
              <FileCode className="w-3 h-3 text-brand-400" />
              <span>Preview ASS</span>
            </button>
          </div>

          {/* Export Options Grid */}
          <div className="grid grid-cols-3 gap-2">
            <a
              href={api.getSubtitleExportUrl(project.id, "ass")}
              download
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface/70 border border-surface-border hover:border-brand-500/50 hover:bg-brand-500/10 transition text-center group"
            >
              <Download className="w-4 h-4 text-brand-400 group-hover:scale-110 transition-transform mb-1" />
              <span className="text-[11px] font-bold text-white">.ASS</span>
              <span className="text-[9px] text-slate-400">Full Styling</span>
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "srt")}
              download
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface/70 border border-surface-border hover:border-emerald-500/50 hover:bg-emerald-500/10 transition text-center group"
            >
              <Download className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform mb-1" />
              <span className="text-[11px] font-bold text-white">.SRT</span>
              <span className="text-[9px] text-slate-400">Standard Text</span>
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "vtt")}
              download
              className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-surface/70 border border-surface-border hover:border-indigo-500/50 hover:bg-indigo-500/10 transition text-center group"
            >
              <Download className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform mb-1" />
              <span className="text-[11px] font-bold text-white">.VTT</span>
              <span className="text-[9px] text-slate-400">WebVTT Web</span>
            </a>
          </div>

          {/* Voice Word Alignment Notice */}
          <div className="p-3 rounded-xl bg-surface/50 border border-surface-border/70 flex items-start gap-2.5">
            <div className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 mt-0.5 text-xs">
              🎙️
            </div>
            <div className="flex-1 text-[11px] leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-300">
                Koreksi kata & sinkronisasi suara:
              </span>{" "}
              Pengaturan timing per-kata, offset suara, dan Whisper AI Realignment dikelola di tab{" "}
              <button
                type="button"
                onClick={() => setActiveTab("tts")}
                className="text-brand-400 hover:text-brand-300 underline font-medium cursor-pointer inline"
              >
                Voice (TTS)
              </button>
              .
            </div>
          </div>

          {/* Navigation to Render */}
          <div className="pt-2 border-t border-surface-border flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Gaya subtitle tersimpan otomatis</span>
            <button
              type="button"
              onClick={() => setActiveTab("render")}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-brand-500/20 transition transform active:scale-95 cursor-pointer"
            >
              <span>Lanjut ke Render</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: ASS Script Viewer */}
      {isAssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh] animate-scale-pop">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-brand-400" />
              Preview File Subtitle ASS (libass)
            </h3>
            <div className="flex-1 overflow-y-auto bg-black/80 rounded-xl p-4 border border-surface-border font-mono text-xs text-emerald-400 whitespace-pre">
              {assContent || "Belum ada subtitle yang digenerate."}
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setIsAssModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface text-sm text-slate-300 hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save as Preset */}
      {isSavePresetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-pop">
            <h3 className="text-sm font-bold text-white">Simpan sebagai Preset Baru</h3>
            <input
              type="text"
              required
              placeholder="Nama Preset Kustom"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSavePresetOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newPresetName.trim()) return;
                  updateStyleMutation.mutate({
                    ...style,
                    save_as_preset: true,
                    new_preset_name: newPresetName.trim(),
                  });
                }}
                className="px-4 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

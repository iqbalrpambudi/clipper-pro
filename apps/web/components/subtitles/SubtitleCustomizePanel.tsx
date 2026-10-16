"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Palette,
  FileCode,
  Sliders,
  CheckCircle2,
  Settings as SettingsIcon,
  Type,
  Layers,
  Eye,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Flame,
  Zap,
  Plus,
  Trash2,
  Bookmark,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle, SubtitlePreset, Narration, AudioTrack } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface SubtitleCustomizePanelProps {
  project: Project & {
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
  };
  currentTime?: number;
  onSeek?: (time: number) => void;
  onStyleChange?: (style: SubtitleStyle) => void;
}

// Popular 1-Click Color Schemes
const COLOR_THEMES = [
  {
    name: "TikTok Viral",
    icon: Flame,
    primary: "#FFFFFF",
    highlight: "#FFE600",
    outline: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
  },
  {
    name: "Cyber Aqua",
    icon: Zap,
    primary: "#FFFFFF",
    highlight: "#00E5FF",
    outline: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
  },
  {
    name: "Neon Lime",
    icon: Sparkles,
    primary: "#FFFFFF",
    highlight: "#39FF14",
    outline: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
  },
  {
    name: "Hot Sunset",
    icon: Flame,
    primary: "#FFFFFF",
    highlight: "#FF453A",
    outline: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
  },
  {
    name: "Minimal Clean",
    icon: Eye,
    primary: "#F8FAFC",
    highlight: "#38BDF8",
    outline: "#0F172A",
    outline_width: 3,
    box_color: "#000000",
    box_opacity: 0,
  },
  {
    name: "Caption Box",
    icon: Layers,
    primary: "#FFFFFF",
    highlight: "#FFE600",
    outline: "#000000",
    outline_width: 2,
    box_color: "#000000",
    box_opacity: 0.7,
  },
];

export function SubtitleCustomizePanel({
  project,
  currentTime: _currentTime = 0,
  onSeek: _onSeek,
  onStyleChange,
}: SubtitleCustomizePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [style, setStyle] = useState<SubtitleStyle>(() => ({
    enabled: project.subtitle_style?.enabled !== false,
    preset_name: project.subtitle_style?.preset_name || "viral_tiktok",
    font_family: project.subtitle_style?.font_family || "Poppins",
    font_size: project.subtitle_style?.font_size ?? 56,
    font_weight: project.subtitle_style?.font_weight || "Bold",
    primary_color: project.subtitle_style?.primary_color || "#FFFFFF",
    highlight_color: project.subtitle_style?.highlight_color || "#FFE600",
    outline_color: project.subtitle_style?.outline_color || "#000000",
    outline_width: project.subtitle_style?.outline_width ?? 5,
    box_color: project.subtitle_style?.box_color || "#000000",
    box_opacity: project.subtitle_style?.box_opacity ?? 0.0,
    position: project.subtitle_style?.position || "bottom",
    offset_y: project.subtitle_style?.offset_y ?? -120,
    offset_x: project.subtitle_style?.offset_x ?? 0,
    display_mode: project.subtitle_style?.display_mode || "per_word",
    burst_word_count: project.subtitle_style?.burst_word_count ?? 2,
    highlight_animation: project.subtitle_style?.highlight_animation || "scale",
    scale_factor: project.subtitle_style?.scale_factor ?? 1.15,
    emoji_enabled: false,
  }));

  // Modals state
  const [isAssModalOpen, setIsAssModalOpen] = useState(false);
  const [assContent, setAssContent] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);

  // System builtin presets fallback (always available)
  const DEFAULT_BUILTIN_PRESETS: SubtitlePreset[] = [
    {
      id: "viral_tiktok",
      name: "Viral TikTok / Reels",
      description: "Font tebal sans-serif, highlight kuning cerah, animasi pop.",
      is_builtin: true,
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
      highlight_animation: "scale",
      scale_factor: 1.15,
      emoji_enabled: false,
    },
    {
      id: "hormozi_punch",
      name: "Alex Hormozi Punch",
      description: "Font kapital tebal tengah layar, mode burst dengan efek pop.",
      is_builtin: true,
      preset_name: "hormozi_punch",
      font_family: "Bebas Neue",
      font_size: 68,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#00FF66",
      outline_color: "#000000",
      outline_width: 6,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "center",
      offset_y: 0,
      offset_x: 0,
      display_mode: "burst",
      burst_word_count: 2,
      highlight_animation: "scale",
      scale_factor: 1.25,
      emoji_enabled: false,
    },
    {
      id: "neon_glow",
      name: "Cyber Neon Glow",
      description: "Font modern tebal dengan highlight magenta neon futuristik.",
      is_builtin: true,
      preset_name: "neon_glow",
      font_family: "Poppins",
      font_size: 54,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FF007A",
      outline_color: "#090A0F",
      outline_width: 4,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -110,
      offset_x: 0,
      display_mode: "burst",
      burst_word_count: 3,
      highlight_animation: "scale",
      scale_factor: 1.15,
      emoji_enabled: false,
    },
    {
      id: "minimalist",
      name: "Minimalist Clean",
      description: "Font modern bersih, highlight biru langit dengan outline halus.",
      is_builtin: true,
      preset_name: "minimalist",
      font_family: "Inter",
      font_size: 44,
      font_weight: "Regular",
      primary_color: "#EEEEEE",
      highlight_color: "#38BDF8",
      outline_color: "#0F172A",
      outline_width: 2,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -90,
      offset_x: 0,
      display_mode: "full_sentence",
      burst_word_count: 2,
      highlight_animation: "color",
      scale_factor: 1.0,
      emoji_enabled: false,
    },
  ];

  // Fetch all presets (builtin & custom)
  const { data: presets = [] } = useQuery<SubtitlePreset[]>({
    queryKey: ["subtitle-presets"],
    queryFn: api.getSubtitlePresets,
  });

  const builtinPresets =
    presets.filter((p) => p.is_builtin).length > 0
      ? presets.filter((p) => p.is_builtin)
      : DEFAULT_BUILTIN_PRESETS;
  const customPresets = presets.filter((p) => !p.is_builtin);

  useEffect(() => {
    if (project.subtitle_style) {
      setStyle((prev) => ({
        ...prev,
        ...project.subtitle_style,
      }));
    }
  }, [project.subtitle_style]);

  // Update style mutation
  const updateStyleMutation = useMutation({
    mutationFn: (data: any) => api.updateSubtitleStyle(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      showToast("Gaya subtitle berhasil disimpan!", "success");
      setIsSavePresetOpen(false);
      setNewPresetName("");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan gaya subtitle", "error");
    },
  });

  // Dedicated mutation to create a new preset
  const createPresetMutation = useMutation({
    mutationFn: (presetName: string) =>
      api.createSubtitlePreset({
        name: presetName,
        font_family: style.font_family,
        font_size: style.font_size,
        font_weight: style.font_weight,
        primary_color: style.primary_color,
        highlight_color: style.highlight_color,
        outline_color: style.outline_color,
        outline_width: style.outline_width,
        box_color: style.box_color || "#000000",
        box_opacity: style.box_opacity ?? 0.0,
        position: style.position,
        offset_y: style.offset_y,
        offset_x: style.offset_x,
        display_mode: style.display_mode,
        burst_word_count: style.burst_word_count,
        highlight_animation: style.highlight_animation,
        scale_factor: style.scale_factor,
        emoji_enabled: false,
      }),
    onSuccess: (newPreset) => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      const updatedStyle = {
        ...style,
        preset_name: newPreset.name || newPreset.preset_name || newPreset.id,
      };
      commitStyle(updatedStyle, true);
      showToast(`Preset "${newPreset.name}" berhasil disimpan!`, "success");
      setIsSavePresetOpen(false);
      setNewPresetName("");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan preset baru", "error");
    },
  });

  // Delete custom preset mutation
  const deletePresetMutation = useMutation({
    mutationFn: (presetId: string) => api.deleteSubtitlePreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      showToast("Preset kustom berhasil dihapus", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menghapus preset", "error");
    },
  });

  const commitStyle = (updated: SubtitleStyle, persist = true) => {
    setStyle(updated);
    if (onStyleChange) onStyleChange(updated);
    if (persist) {
      updateStyleMutation.mutate(updated);
    }
  };

  // Load ALL preset properties when a preset is clicked
  const handleApplyPreset = (preset: SubtitlePreset) => {
    const updated: SubtitleStyle = {
      enabled: style.enabled !== false,
      preset_name: preset.preset_name || preset.name || preset.id,
      font_family: preset.font_family || "Poppins",
      font_size: preset.font_size ?? 56,
      font_weight: preset.font_weight || "Bold",
      primary_color: preset.primary_color || "#FFFFFF",
      highlight_color: preset.highlight_color || "#FFE600",
      outline_color: preset.outline_color || "#000000",
      outline_width: preset.outline_width ?? 5,
      box_color: preset.box_color || "#000000",
      box_opacity: preset.box_opacity ?? 0.0,
      position: preset.position || "bottom",
      offset_y: preset.offset_y ?? -120,
      offset_x: preset.offset_x ?? 0,
      display_mode: preset.display_mode || "per_word",
      burst_word_count: preset.burst_word_count ?? 2,
      highlight_animation: preset.highlight_animation || "scale",
      scale_factor: preset.scale_factor ?? 1.15,
      emoji_enabled: false,
    };
    commitStyle(updated, true);
    showToast(`Preset "${preset.name}" berhasil diterapkan!`, "success");
  };

  const handleApplyColorTheme = (theme: typeof COLOR_THEMES[0]) => {
    const updated: SubtitleStyle = {
      ...style,
      primary_color: theme.primary,
      highlight_color: theme.highlight,
      outline_color: theme.outline,
      outline_width: theme.outline_width,
      box_color: theme.box_color,
      box_opacity: theme.box_opacity,
    };
    commitStyle(updated, true);
  };

  const handlePreviewASS = async () => {
    try {
      const res = await api.previewASS(project.id);
      setAssContent(res.ass_content);
      setIsAssModalOpen(true);
    } catch (err: any) {
      showToast(err.message || "Gagal menghasilkan preview ASS", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#121212] select-none overflow-hidden border-r border-[#2A2A2A]">
      {/* Top Header Toolbar */}
      <div className="px-4 py-2.5 border-b border-[#2A2A2A] bg-[#161616] shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="font-bold text-xs text-foreground uppercase tracking-wider">
            Pengaturan Gaya Subtitle
          </span>
          <Badge variant="supabase" className="text-[10px] px-2 py-0 font-mono capitalize">
            {style.preset_name ? style.preset_name.replace(/_/g, " ") : "Custom"}
          </Badge>
        </div>

        {/* Action buttons on header */}
        <div className="flex items-center gap-2">
          {/* Quick export formats */}
          <div className="flex items-center gap-1 bg-[#1A1A1A] p-0.5 rounded-lg border border-[#2E2E2E]">
            <a
              href={api.getSubtitleExportUrl(project.id, "ass")}
              download
              className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-primary hover:text-white bg-primary/10 hover:bg-primary/20 transition"
              title="Download File .ASS (Full styling & effects)"
            >
              .ASS
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "srt")}
              download
              className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition"
              title="Download File .SRT"
            >
              .SRT
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "vtt")}
              download
              className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold text-muted-foreground hover:text-white hover:bg-white/5 transition"
              title="Download File .VTT"
            >
              .VTT
            </a>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePreviewASS}
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            title="Lihat Script File ASS"
          >
            <FileCode className="w-3.5 h-3.5 text-primary" />
            <span className="hidden sm:inline">Script ASS</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsSavePresetOpen(true)}
            className="h-7 text-xs font-medium gap-1 px-2.5 border-[#333]"
            title="Simpan pengaturan aktif sebagai preset baru"
          >
            <Bookmark className="w-3 h-3 text-primary" />
            <span>Simpan Preset</span>
          </Button>

          <Button
            type="button"
            variant="supabase"
            size="sm"
            onClick={() => commitStyle(style, true)}
            disabled={updateStyleMutation.isPending}
            className="h-7 text-xs font-semibold px-3 gap-1 shadow-sm"
          >
            {updateStyleMutation.isPending ? "Menyimpan..." : "Simpan Style"}
          </Button>
        </div>
      </div>

      {/* Main Spacious Landscape Grid (3 Columns) */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 max-w-[1700px] mx-auto items-start">
          {/* =================================================================== */}
          {/* KOLOM 1 (4/12): PRESET SUBTITLE (CUSTOM & BUILTIN PRESETS)          */}
          {/* =================================================================== */}
          <div className="lg:col-span-4 space-y-4">
            {/* Enable / Disable Subtitle Checklist Card */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-between gap-3 shadow-xs">
              <label htmlFor="clipper-subtitles-enable" className="flex items-center gap-3 cursor-pointer select-none flex-1">
                <input
                  id="clipper-subtitles-enable"
                  type="checkbox"
                  checked={style.enabled !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const updated = { ...style, enabled: checked };
                    commitStyle(updated, true);
                    showToast(
                      checked ? "Subtitle diaktifkan." : "Subtitle dinonaktifkan (video bersih tanpa subtitle).",
                      "info"
                    );
                  }}
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-foreground block">Gunakan Subtitle pada Video</span>
                  <span className="text-[10px] text-muted-foreground block">
                    {style.enabled !== false
                      ? "Subtitle aktif di player monitor dan render final"
                      : "Subtitle dinonaktifkan (video bersih tanpa teks)"}
                  </span>
                </div>
              </label>

              <Badge
                variant={style.enabled !== false ? "default" : "secondary"}
                className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
                  style.enabled !== false
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-[#222222] text-slate-400 border border-[#333333]"
                }`}
              >
                {style.enabled !== false ? "AKTIF" : "NONAKTIF"}
              </Badge>
            </div>

            {/* Custom Presets Section */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#262626] pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-primary" />
                  Preset Kustom Saya
                  {customPresets.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-mono flex items-center justify-center">
                      {customPresets.length}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSavePresetOpen(true)}
                  className="h-6 text-[11px] text-primary hover:text-white px-2 gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Buat Baru</span>
                </Button>
              </div>

              {customPresets.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed border-[#2E2E2E] bg-[#141414] text-center space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    Belum ada preset kustom yang dibuat.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsSavePresetOpen(true)}
                    className="h-6 text-[10px] font-medium text-primary hover:text-white border-primary/30"
                  >
                    + Simpan Gaya Ini Sebagai Preset
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-0.5 custom-scrollbar">
                  {customPresets.map((p) => {
                    const isSelected =
                      style.preset_name === (p.preset_name || p.name || p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleApplyPreset(p)}
                        className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between group ${
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                            : "border-[#2A2A2A] bg-[#1A1A1A] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs font-bold text-foreground truncate">
                              {p.name}
                            </span>
                            {isSelected && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            <span className="truncate">{p.font_family}</span>
                            <span>•</span>
                            <span>{p.font_size}px</span>
                            <span>•</span>
                            <span className="uppercase">{p.display_mode.replace("_", " ")}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span
                              className="w-3 h-3 rounded-full border border-black/50 shadow-xs"
                              style={{ backgroundColor: p.primary_color || "#FFF" }}
                              title="Warna Teks"
                            />
                            <span
                              className="w-3 h-3 rounded-full border border-black/50 shadow-xs"
                              style={{ backgroundColor: p.highlight_color || "#FFE600" }}
                              title="Warna Highlight"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Hapus preset "${p.name}"?`)) {
                                deletePresetMutation.mutate(p.id);
                              }
                            }}
                            className="w-6 h-6 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                            title="Hapus preset ini"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Builtin Presets Section */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#262626] pb-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Preset Bawaan Sistem
                </span>
                <Link
                  href="/settings"
                  className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <SettingsIcon className="w-3 h-3" />
                  <span>Pengaturan</span>
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {builtinPresets.map((p) => {
                  const isSelected =
                    style.preset_name === (p.preset_name || p.id || p.name);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                          : "border-[#2A2A2A] bg-[#1A1A1A] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1 w-full">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {p.name}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center justify-between w-full pt-1.5 border-t border-white/5">
                        <div className="flex items-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/40"
                            style={{ backgroundColor: p.primary_color || "#FFF" }}
                            title="Warna Teks"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/40"
                            style={{ backgroundColor: p.highlight_color || "#FFE600" }}
                            title="Warna Highlight"
                          />
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">
                          {p.display_mode === "per_word"
                            ? "Word"
                            : p.display_mode === "burst"
                            ? "Burst"
                            : "Line"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =================================================================== */}
          {/* KOLOM 2 (4/12): TIPOGRAFI, DISPLAY MODE & ANIMASI HIGHLIGHT        */}
          {/* =================================================================== */}
          <div className="lg:col-span-4 space-y-4">
            {/* Typography Controls */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3.5 shadow-xs">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-primary" />
                Tipografi & Tata Letak
              </span>

              {/* Font Family */}
              <div>
                <label className="text-muted-foreground block mb-1 text-[11px] font-medium">
                  Jenis Font (Font Family)
                </label>
                <select
                  value={style.font_family}
                  onChange={(e) => commitStyle({ ...style, font_family: e.target.value })}
                  className="w-full px-3 py-1.5 bg-[#1A1A1A] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                >
                  <option value="Montserrat">Montserrat (Modern Viral)</option>
                  <option value="Bebas Neue">Bebas Neue (Hormozi Impact)</option>
                  <option value="Poppins">Poppins (Clean & Friendly)</option>
                  <option value="Inter">Inter (Minimalist Tech)</option>
                  <option value="Anton">Anton (Bold Poster)</option>
                  <option value="Oswald">Oswald (Condensed)</option>
                  <option value="Roboto">Roboto (Neutral Clean)</option>
                </select>
              </div>

              {/* Font Size Slider with Step Buttons */}
              <div>
                <div className="flex justify-between items-center mb-1 text-xs">
                  <span className="text-muted-foreground font-medium">Ukuran Huruf (Font Size)</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        commitStyle({ ...style, font_size: Math.max(28, style.font_size - 4) })
                      }
                      className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] rounded text-[10px] text-muted-foreground hover:text-white"
                      title="-4px"
                    >
                      -4px
                    </button>
                    <span className="font-mono text-primary font-bold text-xs bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {style.font_size}px
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        commitStyle({ ...style, font_size: Math.min(96, style.font_size + 4) })
                      }
                      className="px-1.5 py-0.5 bg-[#222] hover:bg-[#333] rounded text-[10px] text-muted-foreground hover:text-white"
                      title="+4px"
                    >
                      +4px
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={28}
                  max={96}
                  step={2}
                  value={style.font_size}
                  onChange={(e) =>
                    commitStyle({ ...style, font_size: parseInt(e.target.value) }, false)
                  }
                  onPointerUp={(e) =>
                    commitStyle(
                      { ...style, font_size: parseInt((e.target as HTMLInputElement).value) },
                      true
                    )
                  }
                  className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                />
              </div>

              {/* Font Weight */}
              <div>
                <label className="text-muted-foreground block mb-1 text-[11px] font-medium">
                  Ketebalan Huruf (Weight)
                </label>
                <select
                  value={style.font_weight}
                  onChange={(e) => commitStyle({ ...style, font_weight: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#1A1A1A] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                >
                  <option value="Bold">Bold (Tebal)</option>
                  <option value="ExtraBold">Extra Bold (Sangat Tebal)</option>
                  <option value="Black">Black / Heavy</option>
                </select>
              </div>

              {/* Display Mode */}
              <div>
                <label className="text-muted-foreground block mb-1.5 text-[11px] font-medium">
                  Mode Penayangan Kata
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => commitStyle({ ...style, display_mode: "per_word" })}
                    className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                      style.display_mode === "per_word"
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                        : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs font-bold text-foreground">Per-Kata</span>
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      1 kata bergantian
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => commitStyle({ ...style, display_mode: "burst" })}
                    className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                      style.display_mode === "burst"
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                        : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs font-bold text-foreground">Burst</span>
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      2-3 kata cepat
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => commitStyle({ ...style, display_mode: "full_sentence" })}
                    className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                      style.display_mode === "full_sentence"
                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                        : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs font-bold text-foreground">Kalimat</span>
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      Satu baris penuh
                    </span>
                  </button>
                </div>
              </div>

              {/* Burst Word Count (if Burst) */}
              {style.display_mode === "burst" && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                  <span className="text-xs font-semibold text-foreground">Kata per Kelompok</span>
                  <div className="flex gap-1">
                    {[2, 3].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => commitStyle({ ...style, burst_word_count: count })}
                        className={`px-3 py-1 rounded text-xs font-bold transition ${
                          (style.burst_word_count || 2) === count
                            ? "bg-primary text-black"
                            : "bg-[#252525] text-muted-foreground hover:text-white"
                        }`}
                      >
                        {count} Kata
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Motion & Highlight Animation */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3 shadow-xs">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary" />
                Animasi & Efek Gerak Highlight
              </span>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => commitStyle({ ...style, highlight_animation: "scale" })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition ${
                    style.highlight_animation === "scale"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground block">Scale Pop</span>
                  <span className="text-[9px] text-muted-foreground">Membesar & loncat</span>
                </button>

                <button
                  type="button"
                  onClick={() => commitStyle({ ...style, highlight_animation: "color" })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition ${
                    style.highlight_animation === "color"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground block">Warna Glow</span>
                  <span className="text-[9px] text-muted-foreground">Transisi halus</span>
                </button>

                <button
                  type="button"
                  onClick={() => commitStyle({ ...style, highlight_animation: "none" })}
                  className={`p-2 rounded-lg border text-left cursor-pointer transition ${
                    style.highlight_animation === "none"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="text-xs font-bold text-foreground block">Statis</span>
                  <span className="text-[9px] text-muted-foreground">Tanpa animasi</span>
                </button>
              </div>

              {/* Zoom Scale Factor Slider */}
              {style.highlight_animation === "scale" && (
                <div className="p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E] space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Tingkat Pembesaran</span>
                    <span className="font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      {(style.scale_factor || 1.15).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.05}
                    max={1.65}
                    step={0.05}
                    value={style.scale_factor || 1.15}
                    onChange={(e) =>
                      commitStyle({ ...style, scale_factor: parseFloat(e.target.value) }, false)
                    }
                    onPointerUp={(e) =>
                      commitStyle(
                        { ...style, scale_factor: parseFloat((e.target as HTMLInputElement).value) },
                        true
                      )
                    }
                    className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Halus (1.05x)</span>
                    <span>Standar (1.20x)</span>
                    <span>Ekstrem (1.60x)</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* =================================================================== */}
          {/* KOLOM 3 (4/12): PALET WARNA, OUTLINE, BOX, & POSISI LAYAR          */}
          {/* =================================================================== */}
          <div className="lg:col-span-4 space-y-4">
            {/* Color Themes & Manual Pickers */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3.5 shadow-xs">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-primary" />
                Warna Teks & Latar
              </span>

              {/* Quick Color Theme Chips */}
              <div className="grid grid-cols-3 gap-1.5">
                {COLOR_THEMES.map((th) => {
                  const isActive =
                    style.highlight_color.toLowerCase() === th.highlight.toLowerCase() &&
                    style.primary_color.toLowerCase() === th.primary.toLowerCase();
                  return (
                    <button
                      key={th.name}
                      type="button"
                      onClick={() => handleApplyColorTheme(th)}
                      className={`p-1.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                        isActive
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40 text-foreground font-semibold"
                          : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:border-[#3E3E3E] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className="w-3 h-3 rounded-full border border-black/50"
                          style={{ backgroundColor: th.primary }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-black/50"
                          style={{ backgroundColor: th.highlight }}
                        />
                      </div>
                      <span className="text-[10px] truncate max-w-full font-medium">{th.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Granular Color Pickers */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                {/* Normal Text Color */}
                <div className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                  <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
                    Teks Normal
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={style.primary_color}
                      onChange={(e) =>
                        commitStyle({ ...style, primary_color: e.target.value }, false)
                      }
                      onBlur={(e) =>
                        commitStyle(
                          { ...style, primary_color: (e.target as HTMLInputElement).value },
                          true
                        )
                      }
                      className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                      {style.primary_color}
                    </span>
                  </div>
                </div>

                {/* Highlight Active Word Color */}
                <div className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                  <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
                    Highlight Kata
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={style.highlight_color}
                      onChange={(e) =>
                        commitStyle({ ...style, highlight_color: e.target.value }, false)
                      }
                      onBlur={(e) =>
                        commitStyle(
                          { ...style, highlight_color: (e.target as HTMLInputElement).value },
                          true
                        )
                      }
                      className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-primary text-[11px] font-semibold truncate">
                      {style.highlight_color}
                    </span>
                  </div>
                </div>

                {/* Outline Border Color */}
                <div className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                  <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
                    Garis Luar (Outline)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={style.outline_color}
                      onChange={(e) =>
                        commitStyle({ ...style, outline_color: e.target.value }, false)
                      }
                      onBlur={(e) =>
                        commitStyle(
                          { ...style, outline_color: (e.target as HTMLInputElement).value },
                          true
                        )
                      }
                      className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                      {style.outline_color}
                    </span>
                  </div>
                </div>

                {/* Box Background Color */}
                <div className="p-2 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                  <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
                    Kotak Latar (Box)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={style.box_color || "#000000"}
                      onChange={(e) => commitStyle({ ...style, box_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle(
                          { ...style, box_color: (e.target as HTMLInputElement).value },
                          true
                        )
                      }
                      className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                      {style.box_color || "#000000"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Sliders: Outline Width & Box Opacity */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-muted-foreground">Tebal Outline</span>
                    <span className="font-mono text-primary font-bold">{style.outline_width}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={style.outline_width}
                    onChange={(e) =>
                      commitStyle({ ...style, outline_width: parseInt(e.target.value) }, false)
                    }
                    onPointerUp={(e) =>
                      commitStyle(
                        { ...style, outline_width: parseInt((e.target as HTMLInputElement).value) },
                        true
                      )
                    }
                    className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-muted-foreground">Opasitas Kotak</span>
                    <span className="font-mono text-primary font-bold">
                      {Math.round((style.box_opacity || 0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={style.box_opacity || 0}
                    onChange={(e) =>
                      commitStyle({ ...style, box_opacity: parseFloat(e.target.value) }, false)
                    }
                    onPointerUp={(e) =>
                      commitStyle(
                        { ...style, box_opacity: parseFloat((e.target as HTMLInputElement).value) },
                        true
                      )
                    }
                    className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Screen Position & Precision Offsets */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#262626] space-y-3 shadow-xs">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-primary" />
                Posisi Layar & Penataan Pixel
              </span>

              {/* Quick Anchor Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    commitStyle({ ...style, position: "bottom", offset_y: -120, offset_x: 0 })
                  }
                  className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    style.position === "bottom"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlignVerticalJustifyEnd className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold">Bawah</span>
                  <span className="text-[9px] text-muted-foreground font-mono">-120px</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    commitStyle({ ...style, position: "center", offset_y: 0, offset_x: 0 })
                  }
                  className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    style.position === "center"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlignVerticalJustifyCenter className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold">Tengah</span>
                  <span className="text-[9px] text-muted-foreground font-mono">0px</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    commitStyle({ ...style, position: "top", offset_y: 120, offset_x: 0 })
                  }
                  className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                    style.position === "top"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                      : "border-[#2E2E2E] bg-[#1A1A1A] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <AlignVerticalJustifyStart className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold">Atas</span>
                  <span className="text-[9px] text-muted-foreground font-mono">+120px</span>
                </button>
              </div>

              {/* Fine-Tuning Vertical Offset Y */}
              <div className="space-y-1.5 p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Offset Vertikal (Y)</span>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <span className="text-primary font-bold">{style.offset_y || 0}px</span>
                    <button
                      type="button"
                      onClick={() => commitStyle({ ...style, offset_y: -120 })}
                      className="text-[9px] bg-[#262626] hover:bg-[#333] text-muted-foreground hover:text-white px-1.5 py-0.5 rounded"
                      title="Reset ke -120px"
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={5}
                  value={style.offset_y || 0}
                  onChange={(e) =>
                    commitStyle({ ...style, offset_y: parseInt(e.target.value) }, false)
                  }
                  onPointerUp={(e) =>
                    commitStyle(
                      { ...style, offset_y: parseInt((e.target as HTMLInputElement).value) },
                      true
                    )
                  }
                  className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                />
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex gap-1">
                    {[-20, -5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          commitStyle({ ...style, offset_y: (style.offset_y || 0) + n })
                        }
                        className="px-2 py-0.5 rounded bg-[#262626] hover:bg-[#333] text-[10px] text-muted-foreground hover:text-white font-mono"
                      >
                        {n}px
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {[5, 20].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          commitStyle({ ...style, offset_y: (style.offset_y || 0) + n })
                        }
                        className="px-2 py-0.5 rounded bg-[#262626] hover:bg-[#333] text-[10px] text-muted-foreground hover:text-white font-mono"
                      >
                        +{n}px
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fine-Tuning Horizontal Offset X */}
              <div className="space-y-1.5 p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Offset Horizontal (X)</span>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    <span className="text-primary font-bold">{style.offset_x || 0}px</span>
                    <button
                      type="button"
                      onClick={() => commitStyle({ ...style, offset_x: 0 })}
                      className="text-[9px] bg-[#262626] hover:bg-[#333] text-muted-foreground hover:text-white px-1.5 py-0.5 rounded"
                      title="Center X: 0px"
                    >
                      Center
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  step={5}
                  value={style.offset_x || 0}
                  onChange={(e) =>
                    commitStyle({ ...style, offset_x: parseInt(e.target.value) }, false)
                  }
                  onPointerUp={(e) =>
                    commitStyle(
                      { ...style, offset_x: parseInt((e.target as HTMLInputElement).value) },
                      true
                    )
                  }
                  className="w-full accent-primary cursor-pointer h-1.5 bg-[#262626] rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: ASS Script Viewer */}
      {isAssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-[#181818] border border-[#2E2E2E] rounded-xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary" />
              Preview File Subtitle ASS (libass)
            </h3>
            <div className="flex-1 overflow-y-auto bg-[#121212] rounded-lg p-4 border border-[#2E2E2E] font-mono text-xs text-primary whitespace-pre">
              {assContent || "Belum ada subtitle yang digenerate."}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAssModalOpen(false)}
              >
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save Preset */}
      {isSavePresetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-[#181818] border border-[#2E2E2E] rounded-xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-primary" />
              Simpan sebagai Preset Baru
            </h3>
            <p className="text-xs text-muted-foreground">
              Semua pengaturan gaya subtitle aktif (font, warna, outline, posisi, animasi) akan disimpan sebagai preset yang dapat digunakan kembali.
            </p>
            <Input
              type="text"
              required
              placeholder="Contoh: TikTok Pop Kuning"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsSavePresetOpen(false);
                  setNewPresetName("");
                }}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="supabase"
                size="sm"
                disabled={!newPresetName.trim() || createPresetMutation.isPending}
                onClick={() => {
                  if (!newPresetName.trim()) return;
                  createPresetMutation.mutate(newPresetName.trim());
                }}
              >
                {createPresetMutation.isPending ? "Menyimpan..." : "Simpan Preset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

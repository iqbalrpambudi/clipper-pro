"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Palette,
  Check,
  FileCode,
  ArrowRight,
  Download,
  Edit3,
  Save,
  Clock,
  RotateCcw,
  Sliders,
  Type,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle, Narration, AudioTrack, TimelineClip } from "@/types";
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
    font_family: "Montserrat",
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
    scale_factor: 1.5,
    emoji_enabled: true,
  });

  // State for editable segments
  const [editableSegments, setEditableSegments] = useState<any[]>([]);
  const [isWordInspectorOpen, setIsWordInspectorOpen] = useState(true);
  const [isAssModalOpen, setIsAssModalOpen] = useState(false);
  const [assContent, setAssContent] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);

  const { data: presets = [] } = useQuery({
    queryKey: ["subtitle-presets"],
    queryFn: api.getSubtitlePresets,
  });

  useEffect(() => {
    if (project.subtitle_style) {
      setStyle((prev) => ({
        ...prev,
        ...project.subtitle_style,
      }));
    }
  }, [project.subtitle_style]);

  useEffect(() => {
    if (project.narration?.segments) {
      setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
    }
  }, [project.narration?.segments]);

  const updateStyleMutation = useMutation({
    mutationFn: (data: any) => api.updateSubtitleStyle(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gaya subtitle karaoke berhasil disimpan!", "success");
      setIsSavePresetOpen(false);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan gaya subtitle", "error");
    },
  });

  const commitStyle = (updated: SubtitleStyle) => {
    setStyle(updated);
    updateStyleMutation.mutate(updated);
  };

  const updateSegmentsMutation = useMutation({
    mutationFn: (segments: any[]) => api.updateNarrationSegments(project.id, segments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Koreksi kata & timing subtitle berhasil disimpan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan koreksi kata", "error");
    },
  });

  const matchAudioMutation = useMutation({
    mutationFn: () => api.matchSubtitleWithAudio(project.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      if (data?.segments) {
        setEditableSegments(JSON.parse(JSON.stringify(data.segments)));
      }
      showToast("Subtitle berhasil disinkronkan presisi dengan audio via Whisper AI!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mencocokkan subtitle dengan audio", "error");
    },
  });

  const handleApplyPreset = (preset: any) => {
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
      highlight_animation: preset.highlight_animation ?? "scale",
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
    } catch (err: any) {
      showToast(err.message || "Gagal menghasilkan preview ASS", "error");
    }
  };

  const handleWordChange = (segIdx: number, wordIdx: number, newWord: string) => {
    const next = [...editableSegments];
    if (next[segIdx] && next[segIdx].words && next[segIdx].words[wordIdx]) {
      next[segIdx].words[wordIdx].word = newWord;
      // Also reconstruct segment sentence text
      next[segIdx].text = next[segIdx].words.map((w: any) => w.word).join(" ");
      setEditableSegments(next);
    }
  };

  const handleWordTimingAdjust = (segIdx: number, wordIdx: number, field: "start_ms" | "end_ms", delta: number) => {
    const next = [...editableSegments];
    if (next[segIdx] && next[segIdx].words && next[segIdx].words[wordIdx]) {
      const current = next[segIdx].words[wordIdx][field] || 0;
      next[segIdx].words[wordIdx][field] = Math.max(0, current + delta);
      setEditableSegments(next);
    }
  };

  const projectWithActiveStyle = {
    ...project,
    subtitle_style: style,
  };

  return (
    <div className="space-y-8">
      {/* 1. Presets & Quick Export Toolbar */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-base font-bold text-white tracking-tight">
              1. Preset Gaya Subtitle Siap Pakai (100% WYSIWYG)
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePreviewASS}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-xs text-slate-300 hover:text-white bg-surface transition"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Lihat ASS Script</span>
            </button>

            {/* Subtitle Export Dropdowns */}
            <div className="flex items-center gap-1">
              <a
                href={api.getSubtitleExportUrl(project.id, "ass")}
                download
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-border text-[11px] font-mono text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 transition"
                title="Download Subtitle Format ASS"
              >
                <Download className="w-3 h-3" />
                <span>.ASS</span>
              </a>
              <a
                href={api.getSubtitleExportUrl(project.id, "srt")}
                download
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-border text-[11px] font-mono text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                title="Download Subtitle Format SRT"
              >
                <Download className="w-3 h-3" />
                <span>.SRT</span>
              </a>
              <a
                href={api.getSubtitleExportUrl(project.id, "vtt")}
                download
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-surface-border text-[11px] font-mono text-sky-300 hover:text-white bg-sky-500/10 hover:bg-sky-500/20 transition"
                title="Download Subtitle Format WebVTT"
              >
                <Download className="w-3 h-3" />
                <span>.VTT</span>
              </a>
            </div>
          </div>
        </div>

        {/* Preset Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((p) => {
            const isSelected = style.preset_name === (p.preset_name || p.id);
            return (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p)}
                className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/15"
                    : "border-surface-border hover:border-slate-500"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{p.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                  </div>

                  {/* Card Simulation Visual */}
                  <div className="h-16 rounded-lg bg-black/60 flex items-center justify-center p-2 mb-3 border border-surface-border">
                    <span
                      style={{
                        color: p.primary_color,
                        fontFamily: `"${p.font_family}", sans-serif`,
                        fontWeight: p.font_weight.toLowerCase() === "bold" ? "bold" : "normal",
                        textShadow: `-2px -2px 0 ${p.outline_color}, 2px -2px 0 ${p.outline_color}, -2px 2px 0 ${p.outline_color}, 2px 2px 0 ${p.outline_color}`,
                        backgroundColor: p.box_opacity > 0.05 ? p.box_color : "transparent",
                        padding: p.box_opacity > 0.05 ? "2px 6px" : "0",
                        borderRadius: "4px",
                      }}
                      className="text-xs uppercase tracking-wider"
                    >
                      KATA <span style={{ color: p.highlight_color }}>VIRAL</span> {p.emoji_enabled ? "🔥" : ""}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {p.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between mt-3">
                  <span className="capitalize">{p.display_mode.replace("_", " ")}</span>
                  <span className="capitalize">{p.position}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Side-by-Side: Live WYSIWYG Player & Detailed Style Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Embedded 9:16 Live Preview with Direct Draggable Position */}
        <div className="lg:col-span-5 flex flex-col items-center glass-panel rounded-2xl p-6 border border-surface-border">
          <div className="w-full flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brand-400" />
              Live WYSIWYG Player
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              X: {style.offset_x || 0}px • Y: {style.offset_y || 0}px
            </span>
          </div>

          <PreviewPlayer
            project={projectWithActiveStyle}
            onUpdateSubtitlePosition={(pos) => {
              const updated = {
                ...style,
                offset_x: pos.offset_x,
                offset_y: pos.offset_y,
              };
              commitStyle(updated);
            }}
          />

          <p className="text-[11px] text-slate-400 text-center mt-3 leading-snug">
            💡 <em>Tips:</em> Klik & drag langsung teks subtitle pada layar video untuk menggeser posisi vertikal / horizontal.
          </p>
        </div>

        {/* Right Column: Style Controls (Typography, Colors, Modes, Offsets) */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 border border-surface-border space-y-6">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand-400" />
              <h4 className="text-sm font-bold text-white">2. Kustomisasi Detail Style & Efek</h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSavePresetOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface text-xs text-slate-300 hover:text-white transition"
              >
                Simpan Preset
              </button>
              <button
                onClick={() => updateStyleMutation.mutate(style)}
                disabled={updateStyleMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition"
              >
                {updateStyleMutation.isPending ? "Menyimpan..." : "Simpan Style"}
              </button>
            </div>
          </div>

          {/* Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
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
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="Montserrat">Montserrat (Bold Modern)</option>
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
                <span className="font-mono text-brand-300">{style.font_size}px</span>
              </div>
              <input
                type="range"
                min={36}
                max={84}
                step={2}
                value={style.font_size}
                onChange={(e) => setStyle({ ...style, font_size: parseInt(e.target.value) })}
                onPointerUp={(e) => commitStyle({ ...style, font_size: parseInt((e.target as HTMLInputElement).value) })}
                className="w-full mt-2 accent-brand-500 cursor-pointer"
              />
            </div>

            {/* Display Mode */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Mode Tampilan Teks</label>
              <select
                value={style.display_mode}
                onChange={(e) => {
                  const updated = { ...style, display_mode: e.target.value as any };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="per_word">Per-Kata (Word-by-Word Active)</option>
                <option value="burst">Burst 2-3 Kata (Gaya Hormozi)</option>
                <option value="full_sentence">Kalimat Penuh Highlight Berjalan</option>
              </select>
            </div>

            {/* Burst Count */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Kata per Burst Group</label>
              <select
                value={style.burst_word_count}
                onChange={(e) => {
                  const updated = { ...style, burst_word_count: parseInt(e.target.value) };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                disabled={style.display_mode !== "burst"}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 disabled:opacity-40 font-semibold"
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
                  onBlur={(e) => commitStyle({ ...style, primary_color: (e.target as HTMLInputElement).value })}
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-xs">{style.primary_color}</span>
              </div>
            </div>

            {/* Highlight Color */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Warna Highlight Aktif</label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.highlight_color}
                  onChange={(e) => setStyle({ ...style, highlight_color: e.target.value })}
                  onBlur={(e) => commitStyle({ ...style, highlight_color: (e.target as HTMLInputElement).value })}
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-xs">{style.highlight_color}</span>
              </div>
            </div>

            {/* Outline Color & Width */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Warna Outline/Stroke</label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.outline_color}
                  onChange={(e) => setStyle({ ...style, outline_color: e.target.value })}
                  onBlur={(e) => commitStyle({ ...style, outline_color: (e.target as HTMLInputElement).value })}
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-xs">{style.outline_color}</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 font-semibold">Tebal Outline</label>
                <span className="font-mono text-brand-300">{style.outline_width}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                value={style.outline_width}
                onChange={(e) => setStyle({ ...style, outline_width: parseInt(e.target.value) })}
                onPointerUp={(e) => commitStyle({ ...style, outline_width: parseInt((e.target as HTMLInputElement).value) })}
                className="w-full mt-2 accent-brand-500 cursor-pointer"
              />
            </div>

            {/* Background Box Opacity & Color */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-400 font-semibold">Transparansi Kotak (Box Opacity)</label>
                <span className="font-mono text-brand-300">{Math.round((style.box_opacity || 0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((style.box_opacity || 0) * 100)}
                onChange={(e) => setStyle({ ...style, box_opacity: parseFloat(e.target.value) / 100.0 })}
                onPointerUp={(e) => commitStyle({ ...style, box_opacity: parseFloat((e.target as HTMLInputElement).value) / 100.0 })}
                className="w-full mt-2 accent-brand-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Warna Kotak Background</label>
              <div className="flex items-center gap-2 p-1.5 rounded-xl bg-surface border border-surface-border">
                <input
                  type="color"
                  value={style.box_color || "#000000"}
                  onChange={(e) => setStyle({ ...style, box_color: e.target.value })}
                  onBlur={(e) => commitStyle({ ...style, box_color: (e.target as HTMLInputElement).value })}
                  className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-slate-300 text-xs">{style.box_color || "#000000"}</span>
              </div>
            </div>

            {/* Position Preset */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Posisi Layar Vertikal</label>
              <select
                value={style.position}
                onChange={(e) => {
                  const updated = { ...style, position: e.target.value as any };
                  setStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="bottom">Bawah (Default Short)</option>
                <option value="center">Tengah Layar (Hormozi Center)</option>
                <option value="top">Atas Layar</option>
              </select>
            </div>

            {/* Animation */}
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Animasi Highlight Kata</label>
              <select
                value={style.highlight_animation}
                onChange={(e) => {
                  const updated = { ...style, highlight_animation: e.target.value as any };
                  commitStyle(updated);
                }}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 font-semibold"
              >
                <option value="scale">Scale & Zoom Pop (Aktif)</option>
                <option value="color">Perubahan Warna Lembut (Tanpa Zoom)</option>
                <option value="none">Tanpa Animasi</option>
              </select>
            </div>

            {/* Active Word Zoom Factor */}
            {style.highlight_animation === "scale" && (
              <div className="sm:col-span-2 p-4 rounded-xl bg-gradient-to-r from-brand-950/40 via-surface/60 to-surface/40 border border-brand-500/40 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-brand-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-400" />
                    Faktor Scale & Zoom Kata Aktif (100% Render Parity)
                  </span>
                  <span className="font-mono font-bold text-brand-200 text-sm px-2.5 py-0.5 rounded-md bg-brand-500/20 border border-brand-500/30">
                    {(style.scale_factor || 1.5).toFixed(2)}x
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: "1.15x (Halus)", val: 1.15 },
                    { label: "1.25x (Sedang)", val: 1.25 },
                    { label: "1.35x (Tegas)", val: 1.35 },
                    { label: "1.50x (Dinamis Hormozi)", val: 1.5 },
                    { label: "1.75x (Ekstra)", val: 1.75 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => commitStyle({ ...style, scale_factor: item.val })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        Math.abs((style.scale_factor || 1.5) - item.val) < 0.03
                          ? "bg-brand-500 text-white shadow-md shadow-brand-500/30 font-bold scale-105"
                          : "bg-surface/80 hover:bg-surface border border-surface-border text-slate-300 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Fine Range Slider */}
                <div className="pt-1">
                  <input
                    type="range"
                    min={1.0}
                    max={2.0}
                    step={0.05}
                    value={style.scale_factor || 1.5}
                    onChange={(e) => setStyle({ ...style, scale_factor: parseFloat(e.target.value) })}
                    onPointerUp={(e) =>
                      commitStyle({ ...style, scale_factor: parseFloat((e.target as HTMLInputElement).value) })
                    }
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                    <span>1.0x (Normal)</span>
                    <span className="text-brand-300 font-bold">1.50x (Default)</span>
                    <span>2.0x (Maks)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sliders for Fine Position Adjustments */}
          <div className="p-4 rounded-xl bg-black/40 border border-surface-border space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Sliders className="w-3.5 h-3.5 text-brand-400" />
              <span>Koreksi Presisi Koordinat Pixel (1080x1920)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Offset Vertikal (Y):</span>
                  <span className="font-mono text-brand-300">{style.offset_y || 0}px</span>
                </div>
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={5}
                  value={style.offset_y || 0}
                  onChange={(e) => setStyle({ ...style, offset_y: parseInt(e.target.value) })}
                  onPointerUp={(e) => commitStyle({ ...style, offset_y: parseInt((e.target as HTMLInputElement).value) })}
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-400">Offset Horizontal (X):</span>
                  <span className="font-mono text-brand-300">{style.offset_x || 0}px</span>
                </div>
                <input
                  type="range"
                  min={-200}
                  max={200}
                  step={5}
                  value={style.offset_x || 0}
                  onChange={(e) => setStyle({ ...style, offset_x: parseInt(e.target.value) })}
                  onPointerUp={(e) => commitStyle({ ...style, offset_x: parseInt((e.target as HTMLInputElement).value) })}
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Auto Emoji */}
          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="emojiToggle"
              checked={style.emoji_enabled}
              onChange={(e) => {
                const updated = { ...style, emoji_enabled: e.target.checked };
                setStyle(updated);
                updateStyleMutation.mutate(updated);
              }}
              className="w-4 h-4 rounded text-brand-600 cursor-pointer accent-brand-500"
            />
            <label htmlFor="emojiToggle" className="text-slate-300 font-semibold cursor-pointer text-xs">
              Sematkan Emoji Relevan Otomatis (mis. 🔥, 🚀, 💡, 💰)
            </label>
          </div>
        </div>
      </div>

      {/* 3. Word Inspector & In-Place Transcript Editor */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-3">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-emerald-400" />
              <span>Word Inspector & Koreksi Teks Transkrip</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Koreksi langsung kata typo, ubah kapitalisasi, atau sesuaikan timing milidetik tanpa perlu re-generate audio TTS.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => matchAudioMutation.mutate()}
              disabled={matchAudioMutation.isPending || !project.audio}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-accent-yellow/20 to-amber-500/20 hover:from-accent-yellow/30 hover:to-amber-500/30 border border-accent-yellow/40 text-accent-yellow font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-accent-yellow/5 disabled:opacity-40"
              title="Gunakan Whisper AI untuk mencocokkan kata transkrip dengan suara yang dibacakan pada audio"
            >
              <Wand2 className={`w-3.5 h-3.5 ${matchAudioMutation.isPending ? "animate-spin" : ""}`} />
              <span>{matchAudioMutation.isPending ? "Mencocokkan Audio via Whisper..." : "Cocokkan Subtitle dengan Audio"}</span>
            </button>
            <button
              onClick={() => {
                if (project.narration?.segments) {
                  setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
                  showToast("Daftar kata di-reset ke data tersimpan", "info");
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-surface-border text-xs text-slate-300 hover:text-white bg-surface transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              onClick={() => updateSegmentsMutation.mutate(editableSegments)}
              disabled={updateSegmentsMutation.isPending}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{updateSegmentsMutation.isPending ? "Menyimpan..." : "Simpan Koreksi Transkrip"}</span>
            </button>
          </div>
        </div>

        {/* Segments Accordion / List */}
        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
          {editableSegments.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              Belum ada segmen kata narasi. Generate naskah & TTS terlebih dahulu.
            </div>
          ) : (
            editableSegments.map((seg, segIdx) => (
              <div
                key={seg.id || segIdx}
                className="p-4 rounded-xl bg-surface/80 border border-surface-border space-y-3"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold text-white flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center text-[10px]">
                      #{segIdx + 1}
                    </span>
                    <span>Segmen Kalimat #{segIdx + 1}</span>
                  </span>
                  <span className="font-mono text-[11px] bg-black/40 px-2 py-0.5 rounded border border-surface-border">
                    {seg.start_ms}ms – {seg.end_ms}ms ({(seg.end_ms - seg.start_ms) / 1000}s)
                  </span>
                </div>

                {/* Words Grid */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(seg.words || []).map((w: any, wIdx: number) => (
                    <div
                      key={w.id || wIdx}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 border border-surface-border text-xs group hover:border-brand-500/50 transition"
                    >
                      <input
                        type="text"
                        value={w.word}
                        onChange={(e) => handleWordChange(segIdx, wIdx, e.target.value)}
                        className="bg-transparent text-white font-semibold focus:outline-none focus:bg-surface px-1 py-0.5 rounded w-20 text-xs"
                      />
                      <span className="font-mono text-[10px] text-slate-500">
                        {w.start_ms}ms
                      </span>
                      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", -50)}
                          className="text-[8px] text-slate-400 hover:text-white"
                          title="-50ms start"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", 50)}
                          className="text-[8px] text-slate-400 hover:text-white"
                          title="+50ms start"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: ASS Script Viewer */}
      {isAssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl space-y-4">
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

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Palette,
  FileCode,
  Edit3,
  Save,
  RotateCcw,
  Sliders,
  Wand2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  Settings as SettingsIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle, Narration, AudioTrack } from "@/types";

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

export function SubtitleCustomizePanel({
  project,
  currentTime = 0,
  onSeek,
  onStyleChange,
}: SubtitleCustomizePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [activeSubTab, setActiveSubTab] = useState<"style" | "inspector">("style");

  const [style, setStyle] = useState<SubtitleStyle>(() => ({
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
    emoji_enabled: project.subtitle_style?.emoji_enabled ?? true,
  }));

  const [editableSegments, setEditableSegments] = useState<any[]>(() =>
    project.narration?.segments ? JSON.parse(JSON.stringify(project.narration.segments)) : []
  );
  const [isAssModalOpen, setIsAssModalOpen] = useState(false);
  const [assContent, setAssContent] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);

  const { data: presets = [] } = useQuery({
    queryKey: ["subtitle-presets"],
    queryFn: api.getSubtitlePresets,
  });

  React.useEffect(() => {
    if (project.subtitle_style) {
      setStyle((prev) => ({
        ...prev,
        ...project.subtitle_style,
      }));
    }
  }, [project.subtitle_style]);

  React.useEffect(() => {
    if (project.narration?.segments) {
      setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
    }
  }, [project.narration?.segments]);

  const updateStyleMutation = useMutation({
    mutationFn: (data: any) => api.updateSubtitleStyle(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gaya subtitle berhasil disimpan!", "success");
      setIsSavePresetOpen(false);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan gaya subtitle", "error");
    },
  });

  const commitStyle = (updated: SubtitleStyle, persist = true) => {
    setStyle(updated);
    if (onStyleChange) onStyleChange(updated);
    if (persist) {
      updateStyleMutation.mutate(updated);
    }
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
      scale_factor: preset.scale_factor ?? 1.15,
      emoji_enabled: preset.emoji_enabled ?? true,
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

  const handleWordChange = (segIdx: number, wordIdx: number, newWord: string) => {
    const next = [...editableSegments];
    if (next[segIdx] && next[segIdx].words && next[segIdx].words[wordIdx]) {
      next[segIdx].words[wordIdx].word = newWord;
      next[segIdx].text = next[segIdx].words.map((w: any) => w.word).join(" ");
      setEditableSegments(next);
    }
  };

  const handleWordTimingAdjust = (segIdx: number, wordIdx: number, field: "start_ms" | "end_ms", delta: number) => {
    const next = [...editableSegments];
    if (next[segIdx] && next[segIdx].words && next[segIdx].words[wordIdx]) {
      const current = next[segIdx].words[wordIdx][field] || 0;
      next[segIdx].words[wordIdx][field] = Math.max(0, current + delta);
      const wList = next[segIdx].words;
      if (wList.length > 0) {
        next[segIdx].start_ms = wList[0].start_ms || 0;
        next[segIdx].end_ms = wList[wList.length - 1].end_ms || 0;
      }
      setEditableSegments(next);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-secondary select-none overflow-hidden">
      {/* Header with Sub-tabs */}
      <div className="px-3 py-2 border-b border-surface-border bg-surface/80 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-accent-yellow" />
            <span className="font-bold text-[11px] text-white uppercase tracking-wider">Kustomisasi Subtitle</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePreviewASS}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
              title="Lihat Script File ASS"
            >
              <FileCode className="w-3.5 h-3.5" />
            </button>
            <a
              href={api.getSubtitleExportUrl(project.id, "ass")}
              download
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20"
              title="Download ASS"
            >
              .ASS
            </a>
          </div>
        </div>

        {/* Sub-tab Switcher: Style / Word Inspector */}
        <div className="inline-flex w-auto p-0.5 bg-black/40 rounded-lg border border-surface-border">
          <button
            type="button"
            onClick={() => setActiveSubTab("style")}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
              activeSubTab === "style" ? "bg-brand-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Style & Preset
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("inspector")}
            className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition ${
              activeSubTab === "inspector" ? "bg-brand-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            <Edit3 className="w-3 h-3" />
            <span>Word Inspector</span>
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 custom-scrollbar text-xs">
        {activeSubTab === "style" ? (
          <div className="max-w-2xl space-y-3.5">
            {/* Presets List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
                  Preset Cepat
                </span>
                <Link href="/settings" className="text-[10px] text-brand-400 hover:underline flex items-center gap-0.5">
                  <SettingsIcon className="w-2.5 h-2.5" />
                  <span>Kelola</span>
                </Link>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-0.5">
                {presets.map((p) => {
                  const isSelected = style.preset_name === (p.preset_name || p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`p-2 rounded-lg border cursor-pointer transition ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/15 text-white ring-1 ring-brand-500/40"
                          : "border-surface-border bg-surface/50 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-bold truncate">{p.name}</span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-brand-400 shrink-0" />}
                      </div>
                      <div className="text-[9px] text-slate-400 capitalize truncate">
                        {p.display_mode.replace("_", " ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Typography Controls */}
            <div className="p-2.5 rounded-xl bg-surface/50 border border-surface-border space-y-2.5">
              <span className="text-[11px] font-bold text-slate-200 block">Typography & Layout</span>

              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Font Family</label>
                <select
                  value={style.font_family}
                  onChange={(e) => commitStyle({ ...style, font_family: e.target.value })}
                  className="w-full px-2 py-1.5 bg-surface rounded-lg border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                >
                  <option value="Montserrat">Montserrat (Modern Bold)</option>
                  <option value="Bebas Neue">Bebas Neue (Hormozi)</option>
                  <option value="Poppins">Poppins (Clean)</option>
                  <option value="Inter">Inter (Minimalist)</option>
                  <option value="Anton">Anton (Bold Poster)</option>
                  <option value="Oswald">Oswald (Condensed)</option>
                  <option value="Roboto">Roboto (Neutral)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[11px]">
                  <span className="text-slate-400">Ukuran Font</span>
                  <span className="font-mono text-brand-300 font-bold">{style.font_size}px</span>
                </div>
                <input
                  type="range"
                  min={36}
                  max={84}
                  step={2}
                  value={style.font_size}
                  onChange={(e) => commitStyle({ ...style, font_size: parseInt(e.target.value) }, false)}
                  onPointerUp={(e) =>
                    commitStyle({ ...style, font_size: parseInt((e.target as HTMLInputElement).value) }, true)
                  }
                  className="w-full accent-brand-500 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Display Mode</label>
                  <select
                    value={style.display_mode}
                    onChange={(e) => commitStyle({ ...style, display_mode: e.target.value as any })}
                    className="w-full px-2 py-1.5 bg-surface rounded-lg border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                  >
                    <option value="per_word">Per-Kata</option>
                    <option value="burst">Burst (2-3)</option>
                    <option value="full_sentence">Kalimat</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Posisi</label>
                  <select
                    value={style.position}
                    onChange={(e) => commitStyle({ ...style, position: e.target.value as any })}
                    className="w-full px-2 py-1.5 bg-surface rounded-lg border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                  >
                    <option value="bottom">Bawah</option>
                    <option value="center">Tengah</option>
                    <option value="top">Atas</option>
                  </select>
                </div>
              </div>

              {style.display_mode === "burst" && (
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Kata per Burst</label>
                  <select
                    value={style.burst_word_count}
                    onChange={(e) => commitStyle({ ...style, burst_word_count: parseInt(e.target.value) })}
                    className="w-full px-2 py-1.5 bg-surface rounded-lg border border-surface-border text-white text-xs font-semibold"
                  >
                    <option value={2}>2 Kata</option>
                    <option value={3}>3 Kata</option>
                  </select>
                </div>
              )}
            </div>

            {/* Color Controls */}
            <div className="p-2.5 rounded-xl bg-surface/50 border border-surface-border space-y-2.5">
              <span className="text-[11px] font-bold text-slate-200 block">Warna & Efek</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Normal</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-surface-border">
                    <input
                      type="color"
                      value={style.primary_color}
                      onChange={(e) => commitStyle({ ...style, primary_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, primary_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-slate-300 text-[10px] truncate">{style.primary_color}</span>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Highlight</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-surface-border">
                    <input
                      type="color"
                      value={style.highlight_color}
                      onChange={(e) => commitStyle({ ...style, highlight_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, highlight_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-slate-300 text-[10px] truncate">{style.highlight_color}</span>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">Outline</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-surface border border-surface-border">
                    <input
                      type="color"
                      value={style.outline_color}
                      onChange={(e) => commitStyle({ ...style, outline_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, outline_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-slate-300 text-[10px] truncate">{style.outline_color}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-slate-400">Tebal</span>
                    <span className="font-mono text-brand-300 font-bold">{style.outline_width}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={style.outline_width}
                    onChange={(e) => commitStyle({ ...style, outline_width: parseInt(e.target.value) }, false)}
                    onPointerUp={(e) =>
                      commitStyle({ ...style, outline_width: parseInt((e.target as HTMLInputElement).value) }, true)
                    }
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                </div>
              </div>

              {/* Animation */}
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">Animasi Highlight</label>
                <select
                  value={style.highlight_animation}
                  onChange={(e) => commitStyle({ ...style, highlight_animation: e.target.value as any })}
                  className="w-full px-2 py-1.5 bg-surface rounded-lg border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                >
                  <option value="scale">Scale & Zoom Pop</option>
                  <option value="color">Warna Halus</option>
                  <option value="none">Tanpa Animasi</option>
                </select>
              </div>

              {style.highlight_animation === "scale" && (
                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-slate-400">Zoom Factor</span>
                    <span className="font-mono text-brand-300 font-bold">
                      {(style.scale_factor || 1.15).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.05}
                    max={1.8}
                    step={0.05}
                    value={style.scale_factor || 1.15}
                    onChange={(e) => commitStyle({ ...style, scale_factor: parseFloat(e.target.value) }, false)}
                    onPointerUp={(e) =>
                      commitStyle({ ...style, scale_factor: parseFloat((e.target as HTMLInputElement).value) }, true)
                    }
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Position Offset Sliders */}
            <div className="p-2.5 rounded-xl bg-black/40 border border-surface-border space-y-2">
              <div className="flex items-center justify-between text-slate-300 font-semibold text-[11px]">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-brand-400" />
                  Koreksi Pixel
                </span>
                <span className="font-mono text-[10px] text-brand-300">
                  X:{style.offset_x || 0} Y:{style.offset_y || 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px] mb-0.5">Offset Y</span>
                  <input
                    type="range"
                    min={-300}
                    max={300}
                    step={5}
                    value={style.offset_y || 0}
                    onChange={(e) => commitStyle({ ...style, offset_y: parseInt(e.target.value) }, false)}
                    onPointerUp={(e) =>
                      commitStyle({ ...style, offset_y: parseInt((e.target as HTMLInputElement).value) }, true)
                    }
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] mb-0.5">Offset X</span>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    step={5}
                    value={style.offset_x || 0}
                    onChange={(e) => commitStyle({ ...style, offset_x: parseInt(e.target.value) }, false)}
                    onPointerUp={(e) =>
                      commitStyle({ ...style, offset_x: parseInt((e.target as HTMLInputElement).value) }, true)
                    }
                    className="w-full accent-brand-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsSavePresetOpen(true)}
                className="h-8 px-4 rounded-lg border border-surface-border bg-surface hover:bg-white/5 text-[11px] text-slate-300 hover:text-white transition"
              >
                Simpan Preset
              </button>
              <button
                type="button"
                onClick={() => commitStyle(style, true)}
                disabled={updateStyleMutation.isPending}
                className="h-8 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-semibold text-[11px] shadow transition"
              >
                {updateStyleMutation.isPending ? "Menyimpan..." : "Simpan Style"}
              </button>
            </div>
          </div>
        ) : (
          /* Word Inspector Tab */
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-1 pb-1 border-b border-surface-border">
              <button
                type="button"
                onClick={() => matchAudioMutation.mutate()}
                disabled={matchAudioMutation.isPending || !project.audio}
                className="h-7 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[10px] font-semibold flex items-center gap-1 transition disabled:opacity-40"
                title="Sinkronkan timing dengan Whisper AI"
              >
                <Wand2 className={`w-3 h-3 ${matchAudioMutation.isPending ? "animate-spin" : ""}`} />
                <span>{matchAudioMutation.isPending ? "Sync..." : "Cocokkan AI"}</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (project.narration?.segments) {
                      setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
                      showToast("Kata di-reset ke data tersimpan", "info");
                    }
                  }}
                  className="h-7 px-2 rounded-lg border border-surface-border text-[10px] text-slate-300 hover:text-white bg-surface"
                  title="Reset"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  onClick={() => updateSegmentsMutation.mutate(editableSegments)}
                  disabled={updateSegmentsMutation.isPending}
                  className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10px] flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  <span>{updateSegmentsMutation.isPending ? "..." : "Simpan"}</span>
                </button>
              </div>
            </div>

            {editableSegments.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Belum ada segmen narasi. Generate naskah & TTS terlebih dahulu.
              </div>
            ) : (
              editableSegments.map((seg, segIdx) => (
                <div key={seg.id || segIdx} className="p-2 rounded-xl bg-surface/70 border border-surface-border space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span className="font-bold text-white flex items-center gap-1">
                      <span className="w-3.5 h-3.5 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center text-[8px] font-mono">
                        {segIdx + 1}
                      </span>
                      <span>Segmen #{segIdx + 1}</span>
                    </span>
                    <span className="font-mono text-[9px] bg-black/40 px-1 py-0.5 rounded border border-surface-border">
                      {seg.start_ms}–{seg.end_ms}ms
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(seg.words || []).map((w: any, wIdx: number) => {
                      const wordStartSec = (w.start_ms || 0) / 1000;
                      const wordEndSec = (w.end_ms || 0) / 1000;
                      const isCurrent = currentTime >= wordStartSec && currentTime <= wordEndSec;
                      return (
                        <div
                          key={w.id || wIdx}
                          onClick={() => onSeek?.(wordStartSec)}
                          className={`inline-flex items-center gap-1 px-1 py-0.5 rounded border text-[10px] cursor-pointer transition ${
                            isCurrent
                              ? "bg-brand-500/25 border-brand-400 text-white shadow-sm ring-1 ring-brand-400"
                              : "bg-black/60 border-surface-border hover:border-brand-500/50"
                          }`}
                        >
                          <input
                            type="text"
                            value={w.word}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleWordChange(segIdx, wIdx, e.target.value)}
                            className="bg-surface/90 text-white font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 px-1 py-0.2 rounded w-14 text-[10px]"
                          />
                          <span className="font-mono text-[8px] text-slate-400">{w.start_ms}ms</span>
                          <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", -50)}
                              className="text-slate-400 hover:text-white leading-none"
                              title="-50ms"
                            >
                              <ChevronUp className="w-2 h-2" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", 50)}
                              className="text-slate-400 hover:text-white leading-none"
                              title="+50ms"
                            >
                              <ChevronDown className="w-2 h-2" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal: ASS Script Viewer */}
      {isAssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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

      {/* Modal: Save Preset */}
      {isSavePresetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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

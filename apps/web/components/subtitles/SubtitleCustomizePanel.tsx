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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div className="flex flex-col h-full bg-[#141414] select-none overflow-hidden border-r border-[#2E2E2E]">
      {/* Header with Sub-tabs */}
      <div className="px-3.5 py-2.5 border-b border-[#2E2E2E] bg-[#181818] shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-[11px] text-foreground uppercase tracking-wider">Kustomisasi Subtitle</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handlePreviewASS}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Lihat Script File ASS"
            >
              <FileCode className="w-3.5 h-3.5" />
            </Button>
            <a
              href={api.getSubtitleExportUrl(project.id, "ass")}
              download
              className="px-1.5 py-0.5 rounded text-[10px] font-mono text-primary hover:text-foreground bg-primary/10 hover:bg-primary/20 border border-primary/20 transition"
              title="Download ASS"
            >
              .ASS
            </a>
          </div>
        </div>

        {/* Sub-tab Switcher: Style / Word Inspector */}
        <div className="inline-flex w-full p-0.5 bg-[#121212] rounded-lg border border-[#2E2E2E]">
          <button
            type="button"
            onClick={() => setActiveSubTab("style")}
            className={`flex-1 py-1 rounded-md text-xs font-semibold transition text-center ${
              activeSubTab === "style" ? "bg-primary text-black shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Style & Preset
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("inspector")}
            className={`flex-1 py-1 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition ${
              activeSubTab === "inspector" ? "bg-primary text-black shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Edit3 className="w-3 h-3" />
            <span>Word Inspector</span>
          </button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
        {activeSubTab === "style" ? (
          <div className="max-w-2xl space-y-3.5">
            {/* Presets List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-foreground font-semibold">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Preset Cepat
                </span>
                <Link href="/settings" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                  <SettingsIcon className="w-2.5 h-2.5" />
                  <span>Kelola</span>
                </Link>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 max-h-[140px] overflow-y-auto pr-0.5">
                {presets.map((p) => {
                  const isSelected = style.preset_name === (p.preset_name || p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleApplyPreset(p)}
                      className={`p-2 rounded-lg border cursor-pointer transition ${
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/30"
                          : "border-[#2E2E2E] bg-[#161616] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold truncate">{p.name}</span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
                      </div>
                      <div className="text-[9px] text-muted-foreground capitalize truncate">
                        {p.display_mode.replace("_", " ")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Typography Controls */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#2E2E2E] space-y-3">
              <span className="text-[11px] font-semibold text-foreground block">Typography & Layout</span>

              <div>
                <label className="text-muted-foreground block mb-1 text-[11px]">Font Family</label>
                <select
                  value={style.font_family}
                  onChange={(e) => commitStyle({ ...style, font_family: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
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
                  <span className="text-muted-foreground">Ukuran Font</span>
                  <span className="font-mono text-primary font-bold">{style.font_size}px</span>
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
                  className="w-full accent-primary cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Display Mode</label>
                  <select
                    value={style.display_mode}
                    onChange={(e) => commitStyle({ ...style, display_mode: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                  >
                    <option value="per_word">Per-Kata</option>
                    <option value="burst">Burst (2-3)</option>
                    <option value="full_sentence">Kalimat</option>
                  </select>
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Posisi</label>
                  <select
                    value={style.position}
                    onChange={(e) => commitStyle({ ...style, position: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                  >
                    <option value="bottom">Bawah</option>
                    <option value="center">Tengah</option>
                    <option value="top">Atas</option>
                  </select>
                </div>
              </div>

              {style.display_mode === "burst" && (
                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Kata per Burst</label>
                  <select
                    value={style.burst_word_count}
                    onChange={(e) => commitStyle({ ...style, burst_word_count: parseInt(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                  >
                    <option value={2}>2 Kata</option>
                    <option value={3}>3 Kata</option>
                  </select>
                </div>
              )}
            </div>

            {/* Color Controls */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#2E2E2E] space-y-3">
              <span className="text-[11px] font-semibold text-foreground block">Warna & Efek</span>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Normal</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#121212] border border-[#2E2E2E]">
                    <input
                      type="color"
                      value={style.primary_color}
                      onChange={(e) => commitStyle({ ...style, primary_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, primary_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-muted-foreground text-[10px] truncate">{style.primary_color}</span>
                  </div>
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Highlight</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#121212] border border-[#2E2E2E]">
                    <input
                      type="color"
                      value={style.highlight_color}
                      onChange={(e) => commitStyle({ ...style, highlight_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, highlight_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-muted-foreground text-[10px] truncate">{style.highlight_color}</span>
                  </div>
                </div>

                <div>
                  <label className="text-muted-foreground block mb-1 text-[11px]">Outline</label>
                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#121212] border border-[#2E2E2E]">
                    <input
                      type="color"
                      value={style.outline_color}
                      onChange={(e) => commitStyle({ ...style, outline_color: e.target.value }, false)}
                      onBlur={(e) =>
                        commitStyle({ ...style, outline_color: (e.target as HTMLInputElement).value }, true)
                      }
                      className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                    />
                    <span className="font-mono text-muted-foreground text-[10px] truncate">{style.outline_color}</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-muted-foreground">Tebal Outline</span>
                    <span className="font-mono text-primary font-bold">{style.outline_width}px</span>
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
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>

              {/* Animation */}
              <div>
                <label className="text-muted-foreground block mb-1 text-[11px]">Animasi Highlight</label>
                <select
                  value={style.highlight_animation}
                  onChange={(e) => commitStyle({ ...style, highlight_animation: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
                >
                  <option value="scale">Scale & Zoom Pop</option>
                  <option value="color">Warna Halus</option>
                  <option value="none">Tanpa Animasi</option>
                </select>
              </div>

              {style.highlight_animation === "scale" && (
                <div>
                  <div className="flex justify-between items-center mb-1 text-[11px]">
                    <span className="text-muted-foreground">Zoom Factor</span>
                    <span className="font-mono text-primary font-bold">
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
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Position Offset Sliders */}
            <div className="p-3 rounded-xl bg-[#161616] border border-[#2E2E2E] space-y-2">
              <div className="flex items-center justify-between text-foreground font-semibold text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3 h-3 text-primary" />
                  Koreksi Pixel
                </span>
                <span className="font-mono text-[10px] text-primary">
                  X:{style.offset_x || 0} Y:{style.offset_y || 0}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block text-[10px] mb-0.5">Offset Y</span>
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
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>

                <div>
                  <span className="text-muted-foreground block text-[10px] mb-0.5">Offset X</span>
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
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSavePresetOpen(true)}
                className="text-xs font-medium"
              >
                Simpan Preset
              </Button>
              <Button
                type="button"
                variant="supabase"
                size="sm"
                onClick={() => commitStyle(style, true)}
                disabled={updateStyleMutation.isPending}
                className="text-xs font-semibold"
              >
                {updateStyleMutation.isPending ? "Menyimpan..." : "Simpan Style"}
              </Button>
            </div>
          </div>
        ) : (
          /* Word Inspector Tab */
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-1 pb-2 border-b border-[#2E2E2E]">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => matchAudioMutation.mutate()}
                disabled={matchAudioMutation.isPending || !project.audio}
                className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-[10px] font-semibold gap-1.5 h-7"
                title="Sinkronkan timing dengan Whisper AI"
              >
                <Wand2 className={`w-3 h-3 ${matchAudioMutation.isPending ? "animate-spin" : ""}`} />
                <span>{matchAudioMutation.isPending ? "Sync..." : "Cocokkan AI"}</span>
              </Button>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (project.narration?.segments) {
                      setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
                      showToast("Kata di-reset ke data tersimpan", "info");
                    }
                  }}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  title="Reset"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>

                <Button
                  type="button"
                  variant="supabase"
                  size="xs"
                  onClick={() => updateSegmentsMutation.mutate(editableSegments)}
                  disabled={updateSegmentsMutation.isPending}
                  className="h-7 gap-1 text-[10px] font-semibold"
                >
                  <Save className="w-3 h-3" />
                  <span>{updateSegmentsMutation.isPending ? "..." : "Simpan"}</span>
                </Button>
              </div>
            </div>

            {editableSegments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                Belum ada segmen narasi. Generate naskah & TTS terlebih dahulu.
              </div>
            ) : (
              editableSegments.map((seg, segIdx) => (
                <div key={seg.id || segIdx} className="p-2.5 rounded-xl bg-[#161616] border border-[#2E2E2E] space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-mono font-bold">
                        {segIdx + 1}
                      </span>
                      <span>Segmen #{segIdx + 1}</span>
                    </span>
                    <span className="font-mono text-[9px] bg-[#121212] px-1.5 py-0.5 rounded border border-[#2E2E2E]">
                      {seg.start_ms}–{seg.end_ms}ms
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(seg.words || []).map((w: any, wIdx: number) => {
                      const wordStartSec = (w.start_ms || 0) / 1000;
                      const wordEndSec = (w.end_ms || 0) / 1000;
                      const isCurrent = currentTime >= wordStartSec && currentTime <= wordEndSec;
                      return (
                        <div
                          key={w.id || wIdx}
                          onClick={() => onSeek?.(wordStartSec)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] cursor-pointer transition ${
                            isCurrent
                              ? "bg-primary/20 border-primary text-foreground shadow-xs ring-1 ring-primary/40"
                              : "bg-[#121212] border-[#2E2E2E] hover:border-primary/40 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <input
                            type="text"
                            value={w.word}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleWordChange(segIdx, wIdx, e.target.value)}
                            className="bg-transparent text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary px-1 py-0.5 rounded w-14 text-[10px]"
                          />
                          <span className="font-mono text-[8px] text-muted-foreground">{w.start_ms}ms</span>
                          <div className="flex flex-col" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", -50)}
                              className="text-muted-foreground hover:text-foreground leading-none"
                              title="-50ms"
                            >
                              <ChevronUp className="w-2 h-2" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWordTimingAdjust(segIdx, wIdx, "start_ms", 50)}
                              className="text-muted-foreground hover:text-foreground leading-none"
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
            <h3 className="text-sm font-semibold text-foreground">Simpan sebagai Preset Baru</h3>
            <Input
              type="text"
              required
              placeholder="Nama Preset Kustom"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              className="text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSavePresetOpen(false)}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="supabase"
                size="sm"
                onClick={() => {
                  if (!newPresetName.trim()) return;
                  updateStyleMutation.mutate({
                    ...style,
                    save_as_preset: true,
                    new_preset_name: newPresetName.trim(),
                  });
                }}
              >
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

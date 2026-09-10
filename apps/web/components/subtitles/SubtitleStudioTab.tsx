"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Subtitles,
  Palette,
  Type,
  Layout,
  Save,
  Check,
  FileCode,
  ArrowRight,
  Smile,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle } from "@/types";

interface SubtitleStudioTabProps {
  project: Project & {
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
    outline_width: 4,
    box_color: "#000000",
    box_opacity: 0.0,
    position: "bottom",
    offset_y: 0,
    offset_x: 0,
    display_mode: "per_word",
    burst_word_count: 2,
    highlight_animation: "scale",
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
    if (project.subtitle_style) {
      setStyle({
        ...style,
        ...project.subtitle_style,
      });
    }
  }, [project.subtitle_style]);

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

  const handleApplyPreset = (preset: any) => {
    const updated = {
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
      display_mode: preset.display_mode,
      burst_word_count: preset.burst_word_count,
      highlight_animation: preset.highlight_animation,
      emoji_enabled: preset.emoji_enabled,
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

  return (
    <div className="space-y-8">
      {/* 1. Presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-base font-bold text-white tracking-tight">
              1. Preset Gaya Subtitle Siap Pakai
            </h3>
          </div>
          <button
            onClick={handlePreviewASS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-border text-xs text-slate-300 hover:text-white bg-surface"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Lihat ASS Script</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presets.map((p) => {
            const isSelected = style.preset_name === (p.preset_name || p.id);
            return (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p)}
                className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10"
                    : "border-surface-border hover:border-slate-500"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{p.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-brand-400" />}
                  </div>

                  {/* Visual preview card */}
                  <div className="h-16 rounded-lg bg-black/60 flex items-center justify-center p-2 mb-3 border border-surface-border">
                    <span
                      style={{
                        color: p.primary_color,
                        fontFamily: p.font_family,
                        fontWeight: p.font_weight.toLowerCase() === "bold" ? "bold" : "normal",
                        textShadow: `-2px -2px 0 ${p.outline_color}, 2px -2px 0 ${p.outline_color}, -2px 2px 0 ${p.outline_color}, 2px 2px 0 ${p.outline_color}`,
                        backgroundColor: p.box_opacity > 0 ? p.box_color : "transparent",
                        padding: p.box_opacity > 0 ? "2px 6px" : "0",
                        borderRadius: "4px",
                      }}
                      className="text-xs uppercase tracking-wider"
                    >
                      KATA <span style={{ color: p.highlight_color }}>VIRAL</span> {p.emoji_enabled ? "🔥" : ""}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {p.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between mt-3">
                  <span>Mode: {p.display_mode}</span>
                  <span>Posisi: {p.position}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Custom Style Editor */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-brand-400" />
            <h4 className="text-sm font-bold text-white">2. Kustomisasi Detail Style (Typography & FX)</h4>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSavePresetOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface text-xs text-slate-300 hover:text-white transition"
            >
              Simpan sebagai Preset Baru
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

        {/* Live Simulation Card */}
        <div className="p-6 rounded-xl bg-black/80 border border-surface-border flex items-center justify-center min-h-[100px]">
          <div
            style={{
              fontFamily: style.font_family,
              fontSize: `${Math.max(style.font_size / 2.5, 18)}px`,
              fontWeight: style.font_weight.toLowerCase() === "bold" ? "bold" : "normal",
              color: style.primary_color,
              textShadow: `-2px -2px 0 ${style.outline_color}, 2px -2px 0 ${style.outline_color}, -2px 2px 0 ${style.outline_color}, 2px 2px 0 ${style.outline_color}`,
              backgroundColor: style.box_opacity > 0.1 ? style.box_color : "transparent",
              padding: style.box_opacity > 0.1 ? "4px 10px" : "0",
              borderRadius: "6px",
            }}
            className="text-center tracking-wide"
          >
            FAKTA <span style={{ color: style.highlight_color }} className="animate-pulse">MENGEJUTKAN</span>{" "}
            DUNIA {style.emoji_enabled ? "🚀" : ""}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Font Family */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Font Family</label>
            <select
              value={style.font_family}
              onChange={(e) => setStyle({ ...style, font_family: e.target.value })}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500"
            >
              <option value="Montserrat">Montserrat (Bold Modern)</option>
              <option value="Bebas Neue">Bebas Neue (Punch Hormozi)</option>
              <option value="Poppins">Poppins (Clean & Crisp)</option>
              <option value="Inter">Inter (Minimalist Regular)</option>
              <option value="Impact">Impact (Heavy Punch)</option>
            </select>
          </div>

          {/* Font Size */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Ukuran Font: {style.font_size}px</label>
            <input
              type="range"
              min={36}
              max={84}
              step={2}
              value={style.font_size}
              onChange={(e) => setStyle({ ...style, font_size: parseInt(e.target.value) })}
              className="w-full mt-2"
            />
          </div>

          {/* Display Mode */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Mode Tampilan Teks</label>
            <select
              value={style.display_mode}
              onChange={(e) => setStyle({ ...style, display_mode: e.target.value as any })}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500"
            >
              <option value="per_word">Per-Kata (Word by Word)</option>
              <option value="burst">Burst 2-3 Kata (Gaya Hormozi)</option>
              <option value="full_sentence">Kalimat Penuh Highlight</option>
            </select>
          </div>

          {/* Burst Count */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Kata per Burst: {style.burst_word_count}</label>
            <select
              value={style.burst_word_count}
              onChange={(e) => setStyle({ ...style, burst_word_count: parseInt(e.target.value) })}
              disabled={style.display_mode !== "burst"}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500 disabled:opacity-40"
            >
              <option value={2}>2 Kata per Kartu</option>
              <option value={3}>3 Kata per Kartu</option>
            </select>
          </div>

          {/* Colors */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Warna Teks Normal</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.primary_color}
                onChange={(e) => setStyle({ ...style, primary_color: e.target.value })}
                className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-300">{style.primary_color}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Warna Highlight Aktif</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.highlight_color}
                onChange={(e) => setStyle({ ...style, highlight_color: e.target.value })}
                className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-300">{style.highlight_color}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Warna Outline/Stroke</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={style.outline_color}
                onChange={(e) => setStyle({ ...style, outline_color: e.target.value })}
                className="w-8 h-8 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-300">{style.outline_color}</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-semibold mb-1">Tebal Outline: {style.outline_width}px</label>
            <input
              type="range"
              min={0}
              max={8}
              value={style.outline_width}
              onChange={(e) => setStyle({ ...style, outline_width: parseInt(e.target.value) })}
              className="w-full mt-2"
            />
          </div>

          {/* Position */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Posisi Layar</label>
            <select
              value={style.position}
              onChange={(e) => setStyle({ ...style, position: e.target.value as any })}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500"
            >
              <option value="bottom">Bawah (Default Short)</option>
              <option value="center">Tengah (Hormozi Center)</option>
              <option value="top">Atas</option>
            </select>
          </div>

          {/* Animation */}
          <div>
            <label className="block text-slate-400 font-semibold mb-1">Animasi Highlight</label>
            <select
              value={style.highlight_animation}
              onChange={(e) => setStyle({ ...style, highlight_animation: e.target.value as any })}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white focus:outline-none focus:border-brand-500"
            >
              <option value="scale">Scale & Zoom Pop</option>
              <option value="color">Perubahan Warna Lembut</option>
              <option value="none">Tanpa Animasi</option>
            </select>
          </div>

          {/* Auto Emoji */}
          <div className="flex items-center gap-3 pt-4">
            <input
              type="checkbox"
              id="emojiToggle"
              checked={style.emoji_enabled}
              onChange={(e) => setStyle({ ...style, emoji_enabled: e.target.checked })}
              className="w-4 h-4 rounded text-brand-600 cursor-pointer"
            />
            <label htmlFor="emojiToggle" className="text-slate-300 font-semibold cursor-pointer">
              Sematkan Auto-Emoji Otomatis 🚀🔥
            </label>
          </div>
        </div>

        <div className="pt-4 border-t border-surface-border flex justify-end">
          <button
            onClick={() => setActiveTab("render")}
            className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <span>Lanjut ke Preview & Render Final</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Modal: ASS Preview */}
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

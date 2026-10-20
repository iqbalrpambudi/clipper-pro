"use client";

import React from "react";
import {
  Type,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Save,
  X,
  CheckCircle2,
  Zap,
  Sliders,
  Palette,
  Move,
} from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import { SubtitleStyle } from "@/types";
import { Button, Badge, Input } from "@/components/ui";
import { SubtitleCustomPreset } from "@/lib/presetStorage";
import { COLOR_PRESETS } from "./constants";

interface SubtitleStudioPanelProps {
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  updateStyleMutation: UseMutationResult<unknown, Error, SubtitleStyle>;
  customSubtitlePresets: SubtitleCustomPreset[];
  selectedSubtitlePresetId: string;
  handleLoadSubtitlePreset: (presetId: string) => void;
  handleDeleteSubtitlePreset: (id: string, name: string) => void;
  showSaveSubtitleModal: boolean;
  setShowSaveSubtitleModal: (show: boolean) => void;
  newSubtitlePresetName: string;
  setNewSubtitlePresetName: (name: string) => void;
  handleSaveSubtitlePreset: (e: React.FormEvent) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function SubtitleStudioPanel({
  subtitleStyle,
  setSubtitleStyle,
  updateStyleMutation,
  customSubtitlePresets,
  selectedSubtitlePresetId,
  handleLoadSubtitlePreset,
  handleDeleteSubtitlePreset,
  showSaveSubtitleModal,
  setShowSaveSubtitleModal,
  newSubtitlePresetName,
  setNewSubtitlePresetName,
  handleSaveSubtitlePreset,
  showToast,
}: SubtitleStudioPanelProps) {
  return (
    <div className="space-y-4">
      {/* Checklist Toggle: Enable / Disable Subtitle */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#2A2A2A] shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="subtitle-enable-check"
            className="flex items-center gap-3 cursor-pointer select-none flex-1"
          >
            <input
              id="subtitle-enable-check"
              type="checkbox"
              checked={subtitleStyle.enabled !== false}
              onChange={(e) => {
                const checked = e.target.checked;
                const updated: SubtitleStyle = {
                  ...subtitleStyle,
                  enabled: checked,
                };
                setSubtitleStyle(updated);
                updateStyleMutation.mutate(updated);
                showToast(
                  checked
                    ? "Subtitle diaktifkan."
                    : "Subtitle dinonaktifkan (video bersih tanpa subtitle).",
                  "info"
                );
              }}
              className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-white block">
                Gunakan Subtitle pada Video
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {subtitleStyle.enabled !== false
                  ? "Subtitle tampil di preview dan akan dibakar ke render video"
                  : "Video bersih tanpa teks (hanya visual adegan & audio narasi)"}
              </span>
            </div>
          </label>

          <Badge
            variant={subtitleStyle.enabled !== false ? "default" : "secondary"}
            className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
              subtitleStyle.enabled !== false
                ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                : "bg-[#222222] text-slate-500 border border-[#333333]"
            }`}
          >
            {subtitleStyle.enabled !== false ? "AKTIF" : "NONAKTIF"}
          </Badge>
        </div>
      </div>

      {subtitleStyle.enabled === false && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
          <span>
            ⚠️ Subtitle sedang dinonaktifkan. Video akan dirender bersih tanpa subtitle. Beri
            centang pada checklist di atas jika ingin mengaktifkan subtitle kembali.
          </span>
        </div>
      )}

      {/* Preset Subtitle Kustom Tersimpan */}
      <div className="p-3 rounded-xl bg-[#141414] border border-[#2A2A2A] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bookmark className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-300 shrink-0">Preset Kustom:</span>
            <select
              value={selectedSubtitlePresetId}
              onChange={(e) => handleLoadSubtitlePreset(e.target.value)}
              className="bg-[#1C1C1C] border border-[#333] hover:border-violet-500/50 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-violet-500 font-medium truncate max-w-[200px]"
            >
              <option value="" disabled>
                -- Muat Preset Subtitle --
              </option>
              {customSubtitlePresets.length === 0 ? (
                <option value="" disabled>
                  Belum ada preset kustom tersimpan
                </option>
              ) : (
                customSubtitlePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
            {selectedSubtitlePresetId && (
              <button
                type="button"
                onClick={() => {
                  const cur = customSubtitlePresets.find((p) => p.id === selectedSubtitlePresetId);
                  if (cur) handleDeleteSubtitlePreset(cur.id, cur.name);
                }}
                title="Hapus Preset Ini"
                className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowSaveSubtitleModal(!showSaveSubtitleModal)}
            className="px-2.5 py-1 text-xs rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1 font-medium shrink-0"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Simpan Preset</span>
          </button>
        </div>

        {/* Save Subtitle Preset Inline Form */}
        {showSaveSubtitleModal && (
          <form
            onSubmit={handleSaveSubtitlePreset}
            className="flex items-center gap-2 pt-2 border-t border-[#222]"
          >
            <Input
              type="text"
              placeholder="Nama preset subtitle (mis. Style Kuning Bold)..."
              value={newSubtitlePresetName}
              onChange={(e) => setNewSubtitlePresetName(e.target.value)}
              autoFocus
              className="h-8 text-xs bg-[#1A1A1A] border-[#333] flex-1 text-white"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 gap-1 shrink-0"
            >
              <Save className="w-3 h-3" />
              <span>Simpan</span>
            </Button>
            <button
              type="button"
              onClick={() => setShowSaveSubtitleModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      {/* Presets 1-Click */}
      <div>
        <label className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center justify-between">
          <span>Pilihan Gaya Preset Cepat:</span>
          <span className="text-[10px] text-violet-400 font-mono">1-Click Theme</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_PRESETS.map((p) => {
            const isSelected =
              subtitleStyle.preset_name === p.name.toLowerCase().replace(/\s+/g, "_");
            const Icon = p.icon;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  const updated: SubtitleStyle = {
                    ...subtitleStyle,
                    preset_name: p.name.toLowerCase().replace(/\s+/g, "_"),
                    font_family: p.font_family,
                    font_weight: p.font_weight,
                    primary_color: p.primary_color,
                    highlight_color: p.highlight_color,
                    outline_color: p.outline_color,
                    outline_width: p.outline_width,
                    box_color: p.box_color,
                    box_opacity: p.box_opacity,
                    display_mode: p.display_mode,
                    burst_word_count: p.burst_word_count,
                    highlight_animation: p.highlight_animation,
                    scale_factor: p.scale_factor,
                  };
                  setSubtitleStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className={`p-2 rounded-xl text-xs border text-left flex items-center justify-between transition ${
                  isSelected
                    ? "bg-violet-500/20 border-violet-500 text-white font-semibold"
                    : "bg-[#141414] border-[#2A2A2A] text-slate-300 hover:border-violet-500/40"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="truncate">{p.name}</span>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-violet-400 shrink-0" />}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.primary_color }}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.highlight_color }}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.outline_color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Tampilan Kata */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-2.5">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-violet-400" />
          <span>Mode Tampilan Kata</span>
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "burst", label: "Burst", desc: "Kelompok kata" },
            { id: "per_word", label: "Per-Kata", desc: "1 kata bergantian" },
            { id: "full_sentence", label: "Kalimat", desc: "Baris penuh" },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  display_mode: m.id as SubtitleStyle["display_mode"],
                }))
              }
              className={`p-2 rounded-xl text-center border transition flex flex-col items-center ${
                subtitleStyle.display_mode === m.id
                  ? "bg-violet-600/30 border-violet-500 text-violet-200 font-semibold"
                  : "bg-[#101010] border-[#2A2A2A] text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-xs font-bold">{m.label}</span>
              <span className="text-[9px] text-muted-foreground">{m.desc}</span>
            </button>
          ))}
        </div>

        {/* Kata per Kelompok untuk Mode Burst */}
        {subtitleStyle.display_mode === "burst" && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-[#181818] border border-[#2E2E2E] mt-1">
            <span className="text-xs font-semibold text-slate-300">Kata per Kelompok Burst</span>
            <div className="flex gap-1.5">
              {[2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() =>
                    setSubtitleStyle((prev) => ({
                      ...prev,
                      burst_word_count: count,
                    }))
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    (subtitleStyle.burst_word_count || 2) === count
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-[#242424] text-slate-400 hover:text-white"
                  }`}
                >
                  {count} Kata
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Animasi & Efek Gerak Highlight */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <span>Animasi & Efek Gerak Highlight</span>
          </span>
          <span className="text-[10px] font-mono text-violet-300 uppercase px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
            {subtitleStyle.highlight_animation === "scale"
              ? "Scale Pop"
              : subtitleStyle.highlight_animation === "none"
                ? "Statis"
                : "Warna Glow"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "color" }))}
            className={`p-2 rounded-xl border text-left cursor-pointer transition ${
              subtitleStyle.highlight_animation === "color" || !subtitleStyle.highlight_animation
                ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold block">Warna Glow</span>
            <span className="text-[9px] text-muted-foreground">Transisi halus glow</span>
          </button>

          <button
            type="button"
            onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "scale" }))}
            className={`p-2 rounded-xl border text-left cursor-pointer transition ${
              subtitleStyle.highlight_animation === "scale"
                ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold block">Scale Pop</span>
            <span className="text-[9px] text-muted-foreground">Membesar & loncat</span>
          </button>

          <button
            type="button"
            onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "none" }))}
            className={`p-2 rounded-xl border text-left cursor-pointer transition ${
              subtitleStyle.highlight_animation === "none"
                ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
            }`}
          >
            <span className="text-xs font-bold block">Statis</span>
            <span className="text-[9px] text-muted-foreground">Tanpa animasi</span>
          </button>
        </div>

        {/* Tingkat Pembesaran Slider jika Scale Pop */}
        {subtitleStyle.highlight_animation === "scale" && (
          <div className="p-2.5 rounded-lg bg-[#181818] border border-[#2E2E2E] space-y-1.5 mt-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-300 font-medium">Tingkat Pembesaran (Scale Factor)</span>
              <span className="font-mono text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                {(subtitleStyle.scale_factor || 1.15).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={1.05}
              max={1.65}
              step={0.05}
              value={subtitleStyle.scale_factor || 1.15}
              onChange={(e) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  scale_factor: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg mt-1"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Halus (1.05x)</span>
              <span>Standar (1.20x)</span>
              <span>Ekstrem (1.60x)</span>
            </div>
          </div>
        )}
      </div>

      {/* Tipografi: Jenis Font & Ketebalan */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-violet-400" />
          <span>Tipografi & Ukuran Teks</span>
        </span>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Jenis Font:
            </label>
            <select
              value={subtitleStyle.font_family || "Poppins"}
              onChange={(e) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  font_family: e.target.value,
                }))
              }
              className="w-full bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
            >
              <option value="Poppins">Poppins (Modern Sans)</option>
              <option value="Montserrat">Montserrat (Geometric)</option>
              <option value="Bebas Neue">Bebas Neue (Punch)</option>
              <option value="Anton">Anton (Bold Heavy)</option>
              <option value="Oswald">Oswald (Condensed)</option>
              <option value="Inter">Inter (Clean)</option>
              <option value="Roboto">Roboto (Neutral)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Ketebalan Font:
            </label>
            <select
              value={subtitleStyle.font_weight || "Bold"}
              onChange={(e) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  font_weight: e.target.value,
                }))
              }
              className="w-full bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
            >
              <option value="Bold">Bold (Tebal)</option>
              <option value="SemiBold">SemiBold (Sedang Tebal)</option>
              <option value="Medium">Medium (Sedang)</option>
              <option value="Regular">Regular (Normal)</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
            <span>Ukuran Font:</span>
            <span className="font-mono text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
              {subtitleStyle.font_size || 38}px
            </span>
          </div>
          <input
            type="range"
            min={20}
            max={72}
            step={1}
            value={subtitleStyle.font_size || 38}
            onChange={(e) =>
              setSubtitleStyle((prev) => ({
                ...prev,
                font_size: Number(e.target.value),
              }))
            }
            className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg mt-1"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Kecil (24px)</span>
            <span>Sedang (38px)</span>
            <span>Besar (64px)</span>
          </div>
        </div>
      </div>

      {/* Palet Warna, Garis Luar (Outer Text), & Kotak Latar */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3.5">
        <span className="text-xs font-bold text-white flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-violet-400" />
          <span>Warna Teks & Garis Luar (Outer Text)</span>
        </span>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Warna Teks Normal */}
          <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
            <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
              Teks Normal
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.primary_color || "#FFFFFF"}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    primary_color: e.target.value,
                  }))
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-200 text-xs font-semibold">
                {subtitleStyle.primary_color || "#FFFFFF"}
              </span>
            </div>
          </div>

          {/* Warna Highlight Kata */}
          <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
            <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
              Highlight Kata
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.highlight_color || "#FFE600"}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    highlight_color: e.target.value,
                  }))
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-violet-400 text-xs font-semibold">
                {subtitleStyle.highlight_color || "#FFE600"}
              </span>
            </div>
          </div>

          {/* Garis Luar (Outer Text / Outline Color) */}
          <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
            <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
              Garis Luar (Outer)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.outline_color || "#000000"}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    outline_color: e.target.value,
                  }))
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-200 text-xs font-semibold">
                {subtitleStyle.outline_color || "#000000"}
              </span>
            </div>
          </div>

          {/* Kotak Latar (Box Color) */}
          <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
            <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
              Kotak Latar (Box)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={subtitleStyle.box_color || "#000000"}
                onChange={(e) =>
                  setSubtitleStyle((prev) => ({
                    ...prev,
                    box_color: e.target.value,
                  }))
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-slate-200 text-xs font-semibold">
                {subtitleStyle.box_color || "#000000"}
              </span>
            </div>
          </div>
        </div>

        {/* Sliders: Tebal Outline & Opasitas Kotak */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex justify-between items-center mb-1 text-[11px] font-semibold text-slate-300">
              <span>Tebal Outline</span>
              <span className="font-mono text-violet-400 font-bold">
                {subtitleStyle.outline_width ?? 4}px
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={subtitleStyle.outline_width ?? 4}
              onChange={(e) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  outline_width: parseInt(e.target.value) || 0,
                }))
              }
              className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-[11px] font-semibold text-slate-300">
              <span>Opasitas Kotak</span>
              <span className="font-mono text-violet-400 font-bold">
                {Math.round((subtitleStyle.box_opacity || 0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={subtitleStyle.box_opacity || 0}
              onChange={(e) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  box_opacity: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Posisi Layar & Offset */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Move className="w-3.5 h-3.5 text-violet-400" />
            <span>Posisi Layar Subtitle</span>
          </span>
          <button
            type="button"
            onClick={() =>
              setSubtitleStyle((prev) => ({
                ...prev,
                position: "bottom",
                offset_x: 0,
                offset_y: -30,
              }))
            }
            className="text-[10px] text-violet-400 hover:underline"
          >
            Reset Posisi
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "top", label: "Atas" },
            { id: "center", label: "Tengah" },
            { id: "bottom", label: "Bawah" },
          ].map((pos) => (
            <button
              key={pos.id}
              type="button"
              onClick={() =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  position: pos.id as SubtitleStyle["position"],
                  offset_y: pos.id === "bottom" ? -30 : 0,
                }))
              }
              className={`p-1.5 rounded-lg text-[11px] font-medium border text-center transition ${
                subtitleStyle.position === pos.id
                  ? "bg-violet-600/30 border-violet-500 text-violet-200 font-semibold"
                  : "bg-[#101010] border-[#2A2A2A] text-slate-400 hover:text-white"
              }`}
            >
              {pos.label}
            </button>
          ))}
        </div>

        {/* Offset Y Slider */}
        <div className="pt-1">
          <div className="flex justify-between items-center mb-1 text-[11px] text-slate-300">
            <span>Offset Posisi Vertikal (Y):</span>
            <span className="font-mono text-violet-400 font-bold">
              {subtitleStyle.offset_y || 0}px
            </span>
          </div>
          <input
            type="range"
            min={-120}
            max={120}
            step={2}
            value={subtitleStyle.offset_y || 0}
            onChange={(e) =>
              setSubtitleStyle((prev) => ({
                ...prev,
                offset_y: parseInt(e.target.value) || 0,
              }))
            }
            className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>Lebih Rendah</span>
            <span>Bisa digeser langsung di preview</span>
            <span>Lebih Tinggi</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <Button
        onClick={() => updateStyleMutation.mutate(subtitleStyle)}
        disabled={updateStyleMutation.isPending}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20 mt-2 py-2.5"
      >
        {updateStyleMutation.isPending ? (
          <span>Menyimpan...</span>
        ) : (
          <>
            <Save className="w-3.5 h-3.5" />
            <span>Simpan Gaya Subtitle</span>
          </>
        )}
      </Button>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Sparkles, BookmarkPlus, Trash2, Palette } from "lucide-react";
import { ThumbnailPreset, ThumbnailTextLayer } from "@/types";
import { DEFAULT_THUMBNAIL_PRESETS } from "./thumbnailPresets";
import { Button, Input, Badge } from "@/components/ui";

interface PresetManagerProps {
  currentLayers: ThumbnailTextLayer[];
  customPresets: ThumbnailPreset[];
  onApplyPreset: (preset: ThumbnailPreset) => void;
  onSaveCustomPreset: (preset: ThumbnailPreset) => void;
  onDeleteCustomPreset: (presetId: string) => void;
  showToast: (msg: string, type: "info" | "error") => void;
}

export function PresetManager({
  currentLayers,
  customPresets,
  onApplyPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  showToast,
}: PresetManagerProps) {
  const [newPresetName, setNewPresetName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) {
      showToast("Nama preset tidak boleh kosong.", "error");
      return;
    }

    if (currentLayers.length === 0) {
      showToast("Tidak ada layer aktif untuk disimpan sebagai preset.", "error");
      return;
    }

    const newPreset: ThumbnailPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      desc: `Preset kustom dengan ${currentLayers.length} format gaya teks`,
      previewColor: currentLayers[0]?.bgEnabled
        ? currentLayers[0]?.bgFill
        : currentLayers[0]?.fill || "#FFE600",
      isCustom: true,
      layers: currentLayers.map((l) => ({
        text: l.text,
        fontSize: l.fontSize,
        fontFamily: l.fontFamily,
        fill: l.fill,
        align: l.align,
        rotation: l.rotation,
        strokeEnabled: l.strokeEnabled,
        stroke: l.stroke,
        strokeWidth: l.strokeWidth,
        bgEnabled: l.bgEnabled,
        bgFill: l.bgFill,
        bgPaddingX: l.bgPaddingX,
        bgPaddingY: l.bgPaddingY,
        bgCornerRadius: l.bgCornerRadius,
        bgOpacity: l.bgOpacity,
        shadowEnabled: l.shadowEnabled,
        shadowColor: l.shadowColor,
        shadowBlur: l.shadowBlur,
        shadowOffsetX: l.shadowOffsetX,
        shadowOffsetY: l.shadowOffsetY,
        shadowOpacity: l.shadowOpacity,
      })),
    };

    onSaveCustomPreset(newPreset);
    setNewPresetName("");
    setIsSaving(false);
    showToast(`Preset '${newPreset.name}' berhasil disimpan!`, "info");
  };

  return (
    <div className="space-y-4">
      {/* Save Preset Card */}
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-semibold text-[#26251F]">
              Simpan Gaya Teks Sebagai Preset
            </h4>
          </div>
          <Badge variant="outline" className="border-[#E5E1D7] text-[10px] text-[#77766D]">
            {currentLayers.length} Gaya Layer
          </Badge>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Simpan kombinasi font, warna, stroke, dan background box aktif agar bisa dipakai berulang
          kali di video mendatang dalam 1 klik.
        </p>

        {isSaving ? (
          <form onSubmit={handleSave} className="space-y-2 pt-1">
            <Input
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Contoh: Signature Misteri Dark / MrBeast Style..."
              className="bg-black/50 border-[#E5E1D7] text-xs font-medium"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold h-7"
              >
                Simpan Preset
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSaving(false)}
                className="border-[#E5E1D7] text-xs h-7"
              >
                Batal
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsSaving(true)}
            className="w-full bg-[#C45B3A] hover:bg-[#A9472C] text-[#FFFAF6] border border-[#C45B3A] text-xs font-semibold h-8"
          >
            <BookmarkPlus className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            <span>+ Simpan Style Saat Ini</span>
          </Button>
        )}
      </div>

      {/* Built-in Presets */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Preset Bawaan YouTube Viral</span>
          </div>
          <span className="text-[10px] text-muted-foreground">Terapkan 1-Klik</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {DEFAULT_THUMBNAIL_PRESETS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => onApplyPreset(preset)}
              className="group p-3 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7] hover:border-[#C45B3A] hover:bg-[#F8EEEA] transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs border border-white/10"
                  style={{
                    backgroundColor: preset.previewColor || "#FFE600",
                    color: preset.previewColor === "#FFFFFF" ? "#000" : "#fff",
                  }}
                >
                  <Palette className="w-4 h-4 text-black/80" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                    {preset.name}
                  </h5>
                  <p className="text-[10px] text-muted-foreground truncate">{preset.desc}</p>
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="border-[#E5E1D7] text-[11px] h-7 px-2.5 group-hover:bg-amber-500 group-hover:text-black group-hover:border-amber-500 shrink-0 transition-all font-semibold"
              >
                <span>Pakai</span>
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* User Custom Presets */}
      {customPresets.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>Preset Kustom Anda</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {customPresets.length} Tersimpan
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {customPresets.map((preset) => (
              <div
                key={preset.id}
                onClick={() => onApplyPreset(preset)}
                className="group p-3 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7] hover:border-[#456A4E] hover:bg-[#F1EEE6] transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs border border-white/10"
                    style={{
                      backgroundColor: preset.previewColor || "#22C55E",
                    }}
                  >
                    <Palette className="w-4 h-4 text-black/80" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                      {preset.name}
                    </h5>
                    <p className="text-[10px] text-muted-foreground truncate">{preset.desc}</p>
                  </div>
                </div>

                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onApplyPreset(preset)}
                    className="border-[#E5E1D7] text-[11px] h-7 px-2.5 group-hover:bg-emerald-500 group-hover:text-white group-hover:border-emerald-500 transition-all font-semibold"
                  >
                    Pakai
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDeleteCustomPreset(preset.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Hapus Preset Kustom"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default PresetManager;

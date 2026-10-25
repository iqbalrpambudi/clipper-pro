"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookmarkPlus,
  SlidersHorizontal,
  Trash2,
  Check,
  Subtitles,
  Stamp,
  Maximize2,
} from "lucide-react";
import {
  presetStorage,
  TimelineStudioPreset,
  DEFAULT_TIMELINE_STUDIO_PRESETS,
} from "@/lib/presetStorage";
import { SubtitleStyle, WatermarkConfig, BackgroundFill } from "@/types";
import { useStudioStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface TimelineStudioPresetControlsProps {
  currentSubtitleStyle?: SubtitleStyle | null;
  currentWatermark?: WatermarkConfig | null;
  currentAspectRatio?: string;
  currentBackgroundFill?: BackgroundFill | null;
  onApplyPreset?: (preset: TimelineStudioPreset) => void;
}

export function TimelineStudioPresetControls({
  currentSubtitleStyle,
  currentWatermark,
  currentAspectRatio = "9:16",
  currentBackgroundFill,
  onApplyPreset,
}: TimelineStudioPresetControlsProps) {
  const { showToast } = useStudioStore();
  const [presets, setPresets] = useState<TimelineStudioPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Load presets on mount
  const refreshPresets = useCallback(() => {
    const list = presetStorage.getTimelineStudioPresets();
    setPresets(list);
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  const builtinPresets = useMemo(
    () => presets.filter((p) => p.isBuiltin),
    [presets]
  );
  const customPresets = useMemo(
    () => presets.filter((p) => !p.isBuiltin),
    [presets]
  );

  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId),
    [presets, selectedPresetId]
  );

  const handleSelectPreset = (presetId: string) => {
    const target = presets.find((p) => p.id === presetId);
    if (!target) return;
    setSelectedPresetId(presetId);
    onApplyPreset?.(target);
  };

  const handleSavePreset = () => {
    const trimmed = presetName.trim();
    if (!trimmed) {
      showToast("Nama preset tidak boleh kosong", "error");
      return;
    }

    const fallbackSubtitle: SubtitleStyle =
      currentSubtitleStyle || DEFAULT_TIMELINE_STUDIO_PRESETS[0].subtitle;
    const fallbackWatermark: WatermarkConfig =
      currentWatermark || DEFAULT_TIMELINE_STUDIO_PRESETS[0].watermark;
    const fallbackFill: BackgroundFill = currentBackgroundFill || {
      mode: "blur",
      zoom: 1.0,
      color: "#000000",
      anti_copyright: true,
      dynamic_zoom: true,
      color_grading: true,
    };

    const newPreset = presetStorage.saveTimelineStudioPreset({
      name: trimmed,
      aspectRatio: currentAspectRatio || "9:16",
      backgroundFill: fallbackFill,
      subtitle: fallbackSubtitle,
      watermark: fallbackWatermark,
    });

    refreshPresets();
    setSelectedPresetId(newPreset.id);
    setIsSaveModalOpen(false);
    setPresetName("");
    showToast(`Preset "${newPreset.name}" berhasil disimpan!`, "success");
  };

  const handleDeleteCurrentCustomPreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedPreset || selectedPreset.isBuiltin) return;
    if (confirm(`Hapus preset kustom "${selectedPreset.name}"?`)) {
      presetStorage.deleteTimelineStudioPreset(selectedPreset.id);
      refreshPresets();
      setSelectedPresetId("");
      showToast("Preset kustom berhasil dihapus", "info");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Preset Select Dropdown */}
        <Select value={selectedPresetId} onValueChange={handleSelectPreset}>
          <SelectTrigger
            className="h-7 text-xs w-[170px] sm:w-[210px] border-border bg-surface font-medium px-2.5 shadow-none focus:ring-1 focus:ring-primary/40"
            title="Pilih preset konfigurasi Subtitle, Watermark, dan Rasio Kanvas"
          >
            <div className="flex items-center gap-1.5 truncate">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary shrink-0" />
              <SelectValue placeholder="Pilih Preset Studio..." />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[320px] bg-card border-border">
            <SelectGroup>
              <SelectLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1">
                Preset Bawaan
              </SelectLabel>
              {builtinPresets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer py-1.5">
                  <div className="flex items-center justify-between w-full gap-2">
                    <span className="truncate">{p.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] font-mono px-1 py-0 h-4 border-border text-muted-foreground shrink-0"
                    >
                      {p.aspectRatio}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>

            {customPresets.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-1 mt-1 border-t border-border/40 pt-1.5">
                  Preset Kustom Anda
                </SelectLabel>
                {customPresets.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer py-1.5">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="truncate">{p.name}</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono px-1 py-0 h-4 border-primary/30 text-primary shrink-0"
                      >
                        {p.aspectRatio}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {/* Delete button if selected preset is custom */}
        {selectedPreset && !selectedPreset.isBuiltin && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDeleteCurrentCustomPreset}
            className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
            title="Hapus preset kustom terpilih ini"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}

        {/* Save Preset Button */}
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => {
            setPresetName("");
            setIsSaveModalOpen(true);
          }}
          className="h-7 text-xs font-semibold px-2.5 gap-1.5 border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary shrink-0"
          title="Simpan konfigurasi subtitle, watermark, dan rasio tampilan saat ini sebagai preset baru"
        >
          <BookmarkPlus className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">Simpan Preset</span>
          <span className="sm:hidden">Simpan</span>
        </Button>
      </div>

      {/* Save Preset Modal Dialog */}
      <Dialog open={isSaveModalOpen} onOpenChange={setIsSaveModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-foreground">
              <BookmarkPlus className="w-4 h-4 text-primary" />
              Simpan Preset Timeline Studio
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Simpan konfigurasi tampilan video aktif (Subtitle, Watermark, serta Mode & Rasio Kanvas) sebagai preset yang dapat digunakan kembali kapan saja.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Nama Preset <span className="text-destructive">*</span>
              </label>
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="contoh: TikTok Gaming 9:16, Reels Box Cyan"
                className="h-9 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && presetName.trim()) {
                    handleSavePreset();
                  }
                }}
              />
            </div>

            {/* Ringkasan Konfigurasi yang Disimpan */}
            <div className="rounded-xl border border-border bg-surface p-3 space-y-2.5 text-xs">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground block font-mono">
                Ringkasan Konfigurasi yang Disimpan:
              </span>

              {/* 1. Subtitle */}
              <div className="flex items-center justify-between text-muted-foreground gap-2">
                <span className="flex items-center gap-1.5 text-foreground font-medium shrink-0">
                  <Subtitles className="w-3.5 h-3.5 text-primary" /> Subtitle
                </span>
                <span className="font-mono text-[11px] truncate text-right">
                  {currentSubtitleStyle?.enabled !== false ? (
                    <>
                      {currentSubtitleStyle?.font_family || "Poppins"} • {currentSubtitleStyle?.font_size || 56}px •{" "}
                      <span className="capitalize">{currentSubtitleStyle?.position || "bottom"}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nonaktif</span>
                  )}
                </span>
              </div>

              {/* 2. Watermark */}
              <div className="flex items-center justify-between text-muted-foreground gap-2">
                <span className="flex items-center gap-1.5 text-foreground font-medium shrink-0">
                  <Stamp className="w-3.5 h-3.5 text-primary" /> Watermark
                </span>
                <span className="font-mono text-[11px] truncate text-right">
                  {currentWatermark?.enabled ? (
                    <>
                      &quot;{currentWatermark.text || "Watermark"}&quot; •{" "}
                      <span className="capitalize">{currentWatermark.position || "bottom-right"}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nonaktif</span>
                  )}
                </span>
              </div>

              {/* 3. Layout & Rasio */}
              <div className="flex items-center justify-between text-muted-foreground gap-2">
                <span className="flex items-center gap-1.5 text-foreground font-medium shrink-0">
                  <Maximize2 className="w-3.5 h-3.5 text-primary" /> Rasio & Mode
                </span>
                <span className="font-mono text-[11px] truncate text-right">
                  Rasio <strong className="text-primary">{currentAspectRatio || "9:16"}</strong> • Mode{" "}
                  <span className="capitalize">{currentBackgroundFill?.mode || "blur"}</span>
                </span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsSaveModalOpen(false)}
              className="h-8 text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="workspace-primary"
              size="sm"
              onClick={handleSavePreset}
              disabled={!presetName.trim()}
              className="h-8 text-xs font-semibold gap-1.5 px-3"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan Preset</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

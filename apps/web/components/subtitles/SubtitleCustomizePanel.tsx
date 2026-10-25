"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, FileCode, Bookmark } from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SubtitleStyle, SubtitlePreset, Narration, AudioTrack } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_BUILTIN_PRESETS, COLOR_THEMES } from "./constants";
import { SubtitlePresetsColumn } from "./SubtitlePresetsColumn";
import { SubtitleTypographyColumn } from "./SubtitleTypographyColumn";
import { SubtitleColorsPositionColumn } from "./SubtitleColorsPositionColumn";
import { SubtitleModals } from "./SubtitleModals";

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
    highlight_animation: project.subtitle_style?.highlight_animation || "color",
    scale_factor: project.subtitle_style?.scale_factor ?? 1.0,
    emoji_enabled: false,
  }));

  // Modals state
  const [isAssModalOpen, setIsAssModalOpen] = useState(false);
  const [assContent, setAssContent] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);

  // Fetch all presets
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
      setStyle((prev) => {
        if (
          prev.position === project.subtitle_style?.position &&
          prev.offset_x === project.subtitle_style?.offset_x &&
          prev.offset_y === project.subtitle_style?.offset_y &&
          prev.font_family === project.subtitle_style?.font_family &&
          prev.font_size === project.subtitle_style?.font_size &&
          prev.primary_color === project.subtitle_style?.primary_color &&
          prev.highlight_color === project.subtitle_style?.highlight_color &&
          prev.outline_color === project.subtitle_style?.outline_color &&
          prev.outline_width === project.subtitle_style?.outline_width &&
          prev.box_color === project.subtitle_style?.box_color &&
          prev.box_opacity === project.subtitle_style?.box_opacity &&
          prev.display_mode === project.subtitle_style?.display_mode &&
          prev.burst_word_count === project.subtitle_style?.burst_word_count &&
          prev.highlight_animation === project.subtitle_style?.highlight_animation &&
          prev.scale_factor === project.subtitle_style?.scale_factor &&
          prev.enabled === project.subtitle_style?.enabled
        ) {
          return prev;
        }
        return {
          ...prev,
          ...project.subtitle_style,
        };
      });
    }
  }, [project.subtitle_style]);

  // Update style mutation
  const updateStyleMutation = useMutation({
    mutationFn: (data: Partial<SubtitleStyle>) => api.updateSubtitleStyle(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      showToast("Gaya subtitle berhasil disimpan!", "success");
      setIsSavePresetOpen(false);
      setNewPresetName("");
    },
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
      showToast(err.message || "Gagal menghapus preset", "error");
    },
  });

  const commitStyle = (updated: SubtitleStyle, persist = true) => {
    setStyle(updated);
    if (onStyleChange) onStyleChange(updated);
    if (persist) {
      // Optimistically update React Query cache immediately
      queryClient.setQueryData<Project>(["project", project.id], (old) => {
        if (!old) return old;
        return { ...old, subtitle_style: updated };
      });
      updateStyleMutation.mutate(updated);
    }
  };

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
      highlight_animation: preset.highlight_animation || "color",
      scale_factor: preset.scale_factor ?? 1.0,
      emoji_enabled: false,
    };
    commitStyle(updated, true);
    showToast(`Preset "${preset.name}" berhasil diterapkan!`, "success");
  };

  const handleApplyColorTheme = (theme: (typeof COLOR_THEMES)[0]) => {
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
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Gagal menghasilkan preview ASS", "error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-background select-none overflow-hidden border-r border-border">
      {/* Top Header Toolbar */}
      <div className="px-4 py-2.5 border-b border-border bg-surface shrink-0 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="font-bold text-xs text-foreground uppercase tracking-wider">
            Pengaturan Gaya Subtitle
          </span>
          <Badge variant="workspace-success" className="px-2 py-0 font-mono text-[10px] capitalize">
            {style.preset_name ? style.preset_name.replace(/_/g, " ") : "Custom"}
          </Badge>
        </div>

        {/* Action buttons on header */}
        <div className="flex items-center gap-2">
          {/* Quick export formats */}
          <div className="flex items-center gap-1 bg-card p-0.5 rounded-lg border border-border">
            <a
              href={api.getSubtitleExportUrl(project.id, "ass")}
              download
              className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary transition hover:bg-primary/20"
              title="Download File .ASS (Full styling & effects)"
            >
              .ASS
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "srt")}
              download
              className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Download File .SRT"
            >
              .SRT
            </a>
            <a
              href={api.getSubtitleExportUrl(project.id, "vtt")}
              download
              className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
            className="h-7 text-xs font-medium gap-1 px-2.5 border-border"
            title="Simpan pengaturan aktif sebagai preset baru"
          >
            <Bookmark className="w-3 h-3 text-primary" />
            <span>Simpan Preset</span>
          </Button>

          <Button
            type="button"
            variant="workspace-primary"
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
          {/* KOLOM 1: PRESET SUBTITLE (CUSTOM & BUILTIN PRESETS) */}
          <SubtitlePresetsColumn
            style={style}
            customPresets={customPresets}
            builtinPresets={builtinPresets}
            onToggleEnabled={(enabled) => {
              const updated = { ...style, enabled };
              commitStyle(updated, true);
              showToast(
                enabled
                  ? "Subtitle diaktifkan."
                  : "Subtitle dinonaktifkan (video bersih tanpa subtitle).",
                "info"
              );
            }}
            onApplyPreset={handleApplyPreset}
            onOpenSavePreset={() => setIsSavePresetOpen(true)}
            onDeletePreset={(id, name) => {
              if (confirm(`Hapus preset "${name}"?`)) {
                deletePresetMutation.mutate(id);
              }
            }}
          />

          {/* KOLOM 2: TIPOGRAFI, DISPLAY MODE & ANIMASI HIGHLIGHT */}
          <SubtitleTypographyColumn style={style} onCommitStyle={commitStyle} />

          {/* KOLOM 3: PALET WARNA, OUTLINE, BOX, & POSISI LAYAR */}
          <SubtitleColorsPositionColumn
            style={style}
            onCommitStyle={commitStyle}
            onApplyColorTheme={handleApplyColorTheme}
          />
        </div>
      </div>

      {/* Modals: Preview ASS & Save Preset */}
      <SubtitleModals
        isAssModalOpen={isAssModalOpen}
        onCloseAssModal={() => setIsAssModalOpen(false)}
        assContent={assContent}
        isSavePresetOpen={isSavePresetOpen}
        onCloseSavePreset={() => {
          setIsSavePresetOpen(false);
          setNewPresetName("");
        }}
        newPresetName={newPresetName}
        onPresetNameChange={setNewPresetName}
        onSavePreset={() => {
          if (!newPresetName.trim()) return;
          createPresetMutation.mutate(newPresetName.trim());
        }}
        isSavingPreset={createPresetMutation.isPending}
      />
    </div>
  );
}

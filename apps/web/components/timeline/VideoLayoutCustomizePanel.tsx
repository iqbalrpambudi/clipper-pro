"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Maximize2,
  Scan,
  ZoomIn,
  Smartphone,
  Monitor,
  Square,
  Info,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type LayoutPreset = "cover" | "fit" | "custom";

interface VideoLayoutCustomizePanelProps {
  project: Project;
  onLayoutChange?: (aspectRatio: string, backgroundFill: any) => void;
}

function resolveInitialPreset(fill?: Project["background_fill"]): LayoutPreset {
  if (fill?.mode === "cover") return "cover";
  if (fill?.zoom && fill.zoom > 1.02) return "custom";
  return "fit";
}

function resolveInitialBlur(fill?: Project["background_fill"]): boolean {
  if (fill?.mode === "black") return false;
  return true; // default true (blur)
}

export function VideoLayoutCustomizePanel({
  project,
  onLayoutChange,
}: VideoLayoutCustomizePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [aspectRatio, setAspectRatio] = useState<string>(project.aspect_ratio || "9:16");
  const [activePreset, setActivePreset] = useState<LayoutPreset>(() =>
    resolveInitialPreset(project.background_fill)
  );
  const [isBlur, setIsBlur] = useState<boolean>(() =>
    resolveInitialBlur(project.background_fill)
  );
  const [customZoom, setCustomZoom] = useState<number>(() =>
    project.background_fill?.zoom && project.background_fill.zoom > 1.02
      ? project.background_fill.zoom
      : 1.35
  );

  const zoomDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Sync state if project background_fill changes externally
  useEffect(() => {
    if (project.aspect_ratio) setAspectRatio(project.aspect_ratio);
    if (project.background_fill) {
      setActivePreset(resolveInitialPreset(project.background_fill));
      setIsBlur(resolveInitialBlur(project.background_fill));
      if (project.background_fill.zoom && project.background_fill.zoom > 1.02) {
        setCustomZoom(project.background_fill.zoom);
      }
    }
  }, [project.aspect_ratio, project.background_fill]);

  const updateProjectMutation = useMutation({
    mutationFn: (data: any) => api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan perubahan layout", "error");
    },
  });

  const notifyChange = (
    nextAspect: string,
    nextMode: "cover" | "blur" | "black",
    nextZoom: number
  ) => {
    const nextFill = {
      mode: nextMode,
      zoom: nextZoom,
      color: "#000000",
      anti_copyright: project.background_fill?.anti_copyright ?? true,
      dynamic_zoom: project.background_fill?.dynamic_zoom ?? true,
      color_grading: project.background_fill?.color_grading ?? true,
    };
    onLayoutChange?.(nextAspect, nextFill);
    return nextFill;
  };

  const handleAspectRatioChange = (newRatio: string) => {
    setAspectRatio(newRatio);
    let nextMode: "cover" | "blur" | "black" = "cover";
    let nextZoom = 1.0;

    if (activePreset === "cover") {
      nextMode = "cover";
      nextZoom = 1.0;
    } else if (activePreset === "fit") {
      nextMode = isBlur ? "blur" : "black";
      nextZoom = 1.0;
    } else {
      nextMode = isBlur ? "blur" : "black";
      nextZoom = customZoom;
    }

    const fill = notifyChange(newRatio, nextMode, nextZoom);
    updateProjectMutation.mutate({
      aspect_ratio: newRatio,
      background_fill: fill,
    });
    showToast(`Rasio kanvas diubah ke ${newRatio}`, "info");
  };

  const handlePresetSelect = (preset: LayoutPreset) => {
    setActivePreset(preset);

    if (preset === "cover") {
      const fill = notifyChange(aspectRatio, "cover", 1.0);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast("Preset Cover (Fullscreen) diterapkan", "info");
    } else if (preset === "fit") {
      const nextMode = isBlur ? "blur" : "black";
      const fill = notifyChange(aspectRatio, nextMode, 1.0);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(isBlur ? "Preset Fit + Blur diterapkan" : "Preset Fit + Hitam Solid diterapkan", "info");
    } else if (preset === "custom") {
      const targetZoom = customZoom > 1.02 ? customZoom : 1.35;
      setCustomZoom(targetZoom);
      const nextMode = isBlur ? "blur" : "black";
      const fill = notifyChange(aspectRatio, nextMode, targetZoom);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(
        isBlur
          ? `Custom Zoom ${Math.round(targetZoom * 100)}% + Blur diterapkan`
          : `Custom Zoom ${Math.round(targetZoom * 100)}% + Hitam diterapkan`,
        "info"
      );
    }
  };

  const handleBlurToggle = (checked: boolean) => {
    setIsBlur(checked);
    const nextMode = checked ? "blur" : "black";

    if (activePreset === "fit") {
      const fill = notifyChange(aspectRatio, nextMode, 1.0);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(checked ? "Background blur diaktifkan (Fit)" : "Background hitam solid diaktifkan (Fit)", "info");
    } else if (activePreset === "custom") {
      const fill = notifyChange(aspectRatio, nextMode, customZoom);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(checked ? "Background blur diaktifkan (Custom Zoom)" : "Background hitam solid diaktifkan (Custom Zoom)", "info");
    } else {
      // In cover mode, we preserve mode="cover" while recording user blur preference
      const fill = notifyChange(aspectRatio, "cover", 1.0);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(
        checked
          ? "Pengaturan blur diaktifkan (akan berefek saat memilih Fit atau Custom Zoom)"
          : "Pengaturan hitam solid diaktifkan (akan berefek saat memilih Fit atau Custom Zoom)",
        "info"
      );
    }
  };

  const handleZoomSliderChange = (newZoom: number) => {
    setCustomZoom(newZoom);
    const nextMode = isBlur ? "blur" : "black";
    notifyChange(aspectRatio, nextMode, newZoom);

    if (zoomDebounceTimer.current) {
      clearTimeout(zoomDebounceTimer.current);
    }
    zoomDebounceTimer.current = setTimeout(() => {
      const fill = notifyChange(aspectRatio, nextMode, newZoom);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
    }, 300);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-surface-secondary overflow-hidden">
      {/* Header Panel */}
      <div className="p-3 border-b border-[#2E2E2E] bg-[#141414] shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground tracking-tight">
            Mode Tampilan & Rasio
          </h3>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
          {aspectRatio} • {activePreset === "cover" ? "Cover" : activePreset === "fit" ? (isBlur ? "Fit+Blur" : "Fit+Hitam") : (isBlur ? "Zoom+Blur" : "Zoom+Hitam")}
        </Badge>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4 no-scrollbar">
        {/* Section 1: Rasio Kanvas Proyek */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Rasio Kanvas Proyek</span>
            </label>
            <span className="text-[10px] text-muted-foreground font-mono">
              {aspectRatio === "9:16" ? "1080 × 1920" : aspectRatio === "16:9" ? "1920 × 1080" : "1080 × 1080"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* 9:16 Vertikal */}
            <button
              type="button"
              onClick={() => handleAspectRatioChange("9:16")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center gap-1.5 transition ${aspectRatio === "9:16"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <Smartphone className={`w-4 h-4 ${aspectRatio === "9:16" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <div className="text-xs font-semibold">9:16</div>
                <div className="text-[9px] text-muted-foreground leading-tight">TikTok/Reels</div>
              </div>
            </button>

            {/* 16:9 Horizontal */}
            <button
              type="button"
              onClick={() => handleAspectRatioChange("16:9")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center gap-1.5 transition ${aspectRatio === "16:9"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <Monitor className={`w-4 h-4 ${aspectRatio === "16:9" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <div className="text-xs font-semibold">16:9</div>
                <div className="text-[9px] text-muted-foreground leading-tight">Landscape</div>
              </div>
            </button>

            {/* 1:1 Persegi */}
            <button
              type="button"
              onClick={() => handleAspectRatioChange("1:1")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center gap-1.5 transition ${aspectRatio === "1:1"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <Square className={`w-4 h-4 ${aspectRatio === "1:1" ? "text-primary" : "text-muted-foreground"}`} />
              <div className="text-center">
                <div className="text-xs font-semibold">1:1</div>
                <div className="text-[9px] text-muted-foreground leading-tight">Square Feed</div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 2: Preset Mode Tampilan Video (3 Preset) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">
              Preset Tampilan Video
            </label>
            <span className="text-[10px] text-primary font-mono font-semibold uppercase">
              {activePreset === "cover"
                ? "1. COVER"
                : activePreset === "fit"
                  ? `2. FIT (${isBlur ? "BLUR" : "HITAM"})`
                  : `3. ZOOM (${Math.round(customZoom * 100)}%)`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* 1. Cover */}
            <button
              type="button"
              onClick={() => handlePresetSelect("cover")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${activePreset === "cover"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <div className="flex items-center justify-center">
                <Maximize2 className={`w-4 h-4 ${activePreset === "cover" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Cover</div>
                <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">Penuh (Crop)</div>
              </div>
            </button>

            {/* 2. Fit */}
            <button
              type="button"
              onClick={() => handlePresetSelect("fit")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${activePreset === "fit"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <div className="flex items-center justify-center">
                <Scan className={`w-4 h-4 ${activePreset === "fit" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Fit</div>
                <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">100% Utuh</div>
              </div>
            </button>

            {/* 3. Custom Zoom */}
            <button
              type="button"
              onClick={() => handlePresetSelect("custom")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${activePreset === "custom"
                ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                : "bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:border-[#3E3E3E] hover:text-foreground"
                }`}
            >
              <div className="flex items-center justify-center">
                <ZoomIn className={`w-4 h-4 ${activePreset === "custom" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Custom Zoom</div>
                <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">Slider Bebas</div>
              </div>
            </button>
          </div>
        </div>

        {/* Section 3: Checklist Background Blur */}
        <div className="space-y-1.5">
          <label className="flex items-start gap-3 p-3 rounded-xl bg-[#141414] border border-[#2E2E2E] cursor-pointer hover:border-primary/40 transition select-none">
            <input
              type="checkbox"
              checked={isBlur}
              onChange={(e) => handleBlurToggle(e.target.checked)}
              className="mt-0.5 rounded border-[#2E2E2E] text-primary focus:ring-primary/30 w-4 h-4 cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Background Blur
                </span>
                <Badge
                  variant="outline"
                  className={`text-[9px] font-mono ${isBlur
                    ? "text-primary border-primary/30 bg-primary/10"
                    : "text-muted-foreground border-[#2E2E2E] bg-[#1a1a1a]"
                    }`}
                >
                  {isBlur ? "Blur Aktif" : "Hitam Solid"}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                {isBlur
                  ? "Area sisa kanvas diisi dengan efek video blur yang dinamis."
                  : "Latar belakang menjadi hitam solid (tanpa efek blur)."}
              </p>
            </div>
          </label>
        </div>

        {/* Section 4: Sub-Panel Slider Custom Zoom (Hanya Tampil Jika Custom Zoom Aktif) */}
        {activePreset === "custom" && (
          <div className="p-3.5 rounded-xl bg-[#121212] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Tingkat Zoom Manual</span>
              </div>
              <Badge variant="outline" className="text-primary font-mono text-[10px]">
                {Math.round(customZoom * 100)}% ({customZoom.toFixed(2)}x)
              </Badge>
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={customZoom}
                onChange={(e) => handleZoomSliderChange(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer h-1.5 bg-[#1E1E1E] rounded-lg"
              />
              <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                <span>100%</span>
                <span>150%</span>
                <span>200%</span>
                <span>300%</span>
              </div>
            </div>

            {/* Quick Preset Pills */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {[
                { label: "100%", val: 1.0 },
                { label: "125%", val: 1.25 },
                { label: "140% (Optimal)", val: 1.4 },
                { label: "175%", val: 1.75 },
                { label: "200%", val: 2.0 },
              ].map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant={Math.abs(customZoom - p.val) < 0.03 ? "supabase" : "outline"}
                  size="xs"
                  onClick={() => handleZoomSliderChange(p.val)}
                  className="text-[10px] h-6 px-2"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Tip Informatif */}
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Perubahan tampilan langsung aktif di Player Monitor dan disimpan otomatis untuk proses render final.
          </p>
        </div>
      </div>
    </div>
  );
}

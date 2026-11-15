import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Maximize2, Scan, ZoomIn } from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, BackgroundFill } from "@/types";
import { Switch } from "@/components/ui";

type LayoutPreset = "cover" | "fit" | "custom";

interface VideoLayoutCustomizePanelProps {
  project: Project;
  onLayoutChange?: (aspectRatio: string, backgroundFill: BackgroundFill) => void;
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
  const [isBlur, setIsBlur] = useState<boolean>(() => resolveInitialBlur(project.background_fill));
  const [customZoom, setCustomZoom] = useState<number>(() =>
    project.background_fill?.zoom && project.background_fill.zoom > 1.02
      ? project.background_fill.zoom
      : 1.35
  );

  const zoomDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    mutationFn: (data: Parameters<typeof api.updateProject>[1]) =>
      api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: Error) => {
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
      color: project.background_fill?.color || "#000000",
      anti_copyright: project.background_fill?.anti_copyright ?? true,
      dynamic_zoom: project.background_fill?.dynamic_zoom ?? true,
      color_grading: project.background_fill?.color_grading ?? true,
    };
    onLayoutChange?.(nextAspect, nextFill);
    return nextFill;
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
      showToast(
        isBlur ? "Preset Fit + Blur diterapkan" : "Preset Fit + Hitam Solid diterapkan",
        "info"
      );
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
      showToast(
        checked ? "Background blur diaktifkan (Fit)" : "Background hitam solid diaktifkan (Fit)",
        "info"
      );
    } else if (activePreset === "custom") {
      const fill = notifyChange(aspectRatio, nextMode, customZoom);
      updateProjectMutation.mutate({
        background_fill: fill,
      });
      showToast(
        checked
          ? "Background blur diaktifkan (Custom Zoom)"
          : "Background hitam solid diaktifkan (Custom Zoom)",
        "info"
      );
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
    <div className="flex-1 min-h-0 flex flex-col bg-background overflow-hidden">
      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 no-scrollbar">
        {/* Preset Mode Tampilan Video (3 Preset) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground">Tampilan Video</label>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {aspectRatio}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* 1. Cover */}
            <button
              type="button"
              onClick={() => handlePresetSelect("cover")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${
                activePreset === "cover"
                  ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center">
                <Maximize2
                  className={`w-4 h-4 ${activePreset === "cover" ? "text-primary" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Cover</div>
                <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                  Penuh (Crop)
                </div>
              </div>
            </button>

            {/* 2. Fit */}
            <button
              type="button"
              onClick={() => handlePresetSelect("fit")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${
                activePreset === "fit"
                  ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center">
                <Scan
                  className={`w-4 h-4 ${activePreset === "fit" ? "text-primary" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Fit</div>
                <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                  100% Utuh
                </div>
              </div>
            </button>

            {/* 3. Custom Zoom */}
            <button
              type="button"
              onClick={() => handlePresetSelect("custom")}
              className={`p-2.5 rounded-lg border text-left flex flex-col items-center justify-center text-center gap-1.5 transition ${
                activePreset === "custom"
                  ? "bg-primary/10 border-primary ring-1 ring-primary/40 text-foreground shadow-xs"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <div className="flex items-center justify-center">
                <ZoomIn
                  className={`w-4 h-4 ${activePreset === "custom" ? "text-primary" : "text-muted-foreground"}`}
                />
              </div>
              <div>
                <div className="text-xs font-semibold leading-tight">Custom Zoom</div>
                <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                  Slider Bebas
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Background Blur Toggle */}
        <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <div className="text-xs font-semibold text-foreground">Background Blur</div>
            <div className="text-[11px] text-muted-foreground">
              {isBlur ? "Sisa kanvas diisi blur dinamis." : "Sisa kanvas hitam solid."}
            </div>
          </div>
          <Switch checked={isBlur} onCheckedChange={handleBlurToggle} />
        </label>

        {/* Sub-Panel Slider Custom Zoom */}
        {activePreset === "custom" && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Zoom Manual</span>
              <span className="font-mono text-xs tabular-nums text-primary">
                {Math.round(customZoom * 100)}% ({customZoom.toFixed(2)}x)
              </span>
            </div>

            <div className="space-y-1">
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.05"
                value={customZoom}
                onChange={(e) => handleZoomSliderChange(parseFloat(e.target.value))}
                className="h-1.5 w-full cursor-pointer rounded-lg bg-muted accent-primary"
              />
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-muted-foreground">
                <span>100%</span>
                <span>150%</span>
                <span>200%</span>
                <span>300%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

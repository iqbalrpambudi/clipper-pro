import { useState, useEffect, useRef } from "react";
import { Type, Layers, Palette, Move, Check, Loader2 } from "lucide-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, WatermarkConfig } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  WATERMARK_FONTS as AVAILABLE_FONTS,
  WATERMARK_COLOR_SWATCHES as COLOR_SWATCHES,
  WATERMARK_POSITION_GRID as POSITION_GRID,
  WATERMARK_PRESETS as PRESETS,
  normalizeWatermarkConfig as getInitialWatermark,
} from "./constants";

interface WatermarkCustomizePanelProps {
  project: Project;
  onWatermarkChange?: (watermark: WatermarkConfig) => void;
}

export function WatermarkCustomizePanel({
  project,
  onWatermarkChange,
}: WatermarkCustomizePanelProps) {
  const { showToast } = useStudioStore();
  const queryClient = useQueryClient();

  const [watermark, setWatermark] = useState<WatermarkConfig>(() =>
    getInitialWatermark(project.watermark)
  );

  const lastCommitRef = useRef<WatermarkConfig | null>(project.watermark || null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (wm: WatermarkConfig) => api.updateProject(project.id, { watermark: wm }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["project", project.id], (old: any) =>
        old ? { ...old, watermark: updated.watermark } : old
      );
    },
  });

  // Sync when project.watermark updates externally (e.g. from canvas drag or server)
  useEffect(() => {
    if (project.watermark) {
      const serverKey = JSON.stringify(project.watermark);
      const localKey = JSON.stringify(lastCommitRef.current);
      if (serverKey !== localKey) {
        setWatermark(getInitialWatermark(project.watermark));
        lastCommitRef.current = project.watermark;
      }
    }
  }, [project.watermark]);

  const commitWatermark = (next: WatermarkConfig, showToastNotice?: string, immediate = false) => {
    setWatermark(next);
    lastCommitRef.current = next;
    onWatermarkChange?.(next);

    // Optimistic cache update so all tabs immediately reflect the new watermark
    queryClient.setQueryData(["project", project.id], (old: any) =>
      old ? { ...old, watermark: next } : old
    );

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (immediate) {
      saveMutation.mutate(next);
    } else {
      autosaveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(next);
      }, 500);
    }

    if (showToastNotice) {
      showToast(showToastNotice, "info");
    }
  };

  // Flush pending save on unmount (e.g. switching tabs / pages)
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current && lastCommitRef.current) {
        clearTimeout(autosaveTimerRef.current);
        api.updateProject(project.id, { watermark: lastCommitRef.current }).catch(() => {});
      }
    };
  }, [project.id]);

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    const next: WatermarkConfig = {
      ...watermark,
      ...preset.config,
      enabled: true,
    };
    commitWatermark(next, `Preset "${preset.name}" diterapkan`, true);
  };

  const addPrefix = (prefix: string) => {
    const current = watermark.text;
    if (!current.startsWith(prefix)) {
      commitWatermark({ ...watermark, text: `${prefix}${current}` });
    }
  };

  return (
    <div className="space-y-5 text-foreground text-xs">
      {/* Header & Main Toggle */}
      <div className="bg-card rounded-xl p-4 border border-border shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="watermark-enable-check"
            className="flex items-center gap-3 cursor-pointer select-none flex-1"
          >
            <Switch
              id="watermark-enable-check"
              checked={watermark.enabled}
              onCheckedChange={(checked) => {
                commitWatermark(
                  { ...watermark, enabled: checked },
                  checked ? "Watermark diaktifkan." : "Watermark dinonaktifkan."
                );
              }}
            />
            <div>
              <span className="block text-xs font-semibold text-foreground">
                Gunakan Watermark pada Video
              </span>
              <span className="text-xs text-muted-foreground block">
                {watermark.enabled
                  ? "Watermark tampil di preview dan akan dibakar ke render video"
                  : "Video bersih tanpa watermark (hanya visual adegan & audio narasi)"}
              </span>
            </div>
          </label>

          <div className="flex items-center gap-2 shrink-0">
            {saveMutation.isPending && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="hidden sm:inline">Menyimpan...</span>
              </span>
            )}
            <Badge
              variant={watermark.enabled ? "default" : "secondary"}
              className={`text-xs font-mono px-2 py-0.5 shrink-0 ${
                watermark.enabled
                  ? "bg-accent text-accent-foreground border border-primary/40"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {watermark.enabled ? "AKTIF" : "NONAKTIF"}
            </Badge>
          </div>
        </div>

        {/* Quick Presets Grid */}
        <div className="pt-1">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Preset Cepat Watermark
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className="p-2 rounded-lg bg-background hover:bg-muted border border-border hover:border-primary/40 text-left transition flex flex-col justify-between group"
              >
                <div className="font-semibold text-xs text-foreground group-hover:text-primary transition truncate">
                  {p.name}
                </div>
                <div className="text-xs text-muted-foreground truncate">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Text Watermark Configuration */}
      <div className="space-y-4 bg-card rounded-xl p-4 border border-border">
        <div className="flex items-center justify-between">
          <label className="font-semibold text-foreground flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-primary" />
            Isi Teks Watermark
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => addPrefix("@")}
              className="px-2 py-0.5 rounded bg-muted hover:bg-input text-xs text-muted-foreground hover:text-foreground border border-input transition"
              title="Tambah prefix @"
            >
              @
            </button>
            <button
              type="button"
              onClick={() => addPrefix("© ")}
              className="px-2 py-0.5 rounded bg-muted hover:bg-input text-xs text-muted-foreground hover:text-foreground border border-input transition"
              title="Tambah simbol ©"
            >
              ©
            </button>
          </div>
        </div>

        <Input
          value={watermark.text}
          onChange={(e) => commitWatermark({ ...watermark, text: e.target.value })}
          placeholder="Contoh: @cliperpro atau Nama Channel"
          aria-label="Teks watermark"
        />

        {/* Live Typography Preview Card */}
        <div className="p-3 rounded-lg bg-muted border border-border flex items-center justify-center min-h-[50px] overflow-hidden">
          <span
            style={{
              fontFamily: `"${watermark.font_family}", sans-serif`,
              fontSize: `${Math.min(32, Math.max(14, watermark.font_size * 0.75))}px`,
              color: watermark.font_color,
              opacity: watermark.opacity,
              fontWeight: 600,
              textShadow: watermark.has_shadow ? "0 2px 4px rgba(0,0,0,0.85)" : undefined,
              backgroundColor: watermark.has_background
                ? watermark.background_color
                : "transparent",
              padding: watermark.has_background ? "4px 10px" : "0",
              borderRadius: "4px",
            }}
            className="tracking-wide select-none"
          >
            {watermark.text || "@watermark"}
          </span>
        </div>

        {/* Font Family Selection */}
        <div className="space-y-2 pt-2">
          <label className="font-semibold text-foreground flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-primary" />
            Pilihan Font Kustom
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AVAILABLE_FONTS.map((f) => {
              const isSelected = watermark.font_family === f.name;
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => commitWatermark({ ...watermark, font_family: f.name })}
                  className={`p-2.5 rounded-lg border text-left transition flex flex-col justify-between ${
                    isSelected
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-border hover:border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span
                    style={{ fontFamily: `"${f.name}", sans-serif` }}
                    className="text-sm font-bold truncate block mb-1"
                  >
                    {f.label}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{f.style}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Size & Opacity Controls */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Ukuran Font</span>
              <span className="font-mono text-foreground font-semibold">
                {watermark.font_size}px
              </span>
            </div>
            <Slider
              min={16}
              max={72}
              step={2}
              value={[watermark.font_size]}
              onValueChange={([v]) => commitWatermark({ ...watermark, font_size: v || 34 })}
              aria-label="Ukuran font watermark"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Transparansi / Opacity</span>
              <span className="font-mono text-foreground font-semibold">
                {Math.round(watermark.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0.1}
              max={1.0}
              step={0.05}
              value={[watermark.opacity]}
              onValueChange={([v]) => commitWatermark({ ...watermark, opacity: v || 0.85 })}
              aria-label="Opacity watermark"
            />
          </div>
        </div>

        {/* Font Color & Quick Swatches */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Warna Teks</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={watermark.font_color}
                onChange={(e) => commitWatermark({ ...watermark, font_color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
              />
              <span className="font-mono text-xs text-muted-foreground uppercase">
                {watermark.font_color}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {COLOR_SWATCHES.map((sw) => (
              <button
                key={sw.name}
                type="button"
                onClick={() => commitWatermark({ ...watermark, font_color: sw.color })}
                style={{ backgroundColor: sw.color }}
                className={`w-6 h-6 rounded-full border transition flex items-center justify-center ${
                  watermark.font_color.toLowerCase() === sw.color.toLowerCase()
                    ? "border-primary ring-2 ring-primary/40 scale-110"
                    : "border-input hover:scale-105"
                }`}
                title={sw.name}
              >
                {watermark.font_color.toLowerCase() === sw.color.toLowerCase() && (
                  <Check
                    className={`w-3.5 h-3.5 ${
                      sw.color === "#FFFFFF" || sw.color === "#FFE600" ? "text-black" : "text-white"
                    }`}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Shared Position Controls (9-Grid) */}
      <div className="space-y-3 bg-card rounded-xl p-4 border border-border">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Move className="w-3.5 h-3.5 text-primary" />
          Posisi Layar Video
        </label>
        <p className="text-xs text-muted-foreground">
          Pilih lokasi penempatan watermark pada kanvas video
        </p>

        {/* Interactive 3x3 Grid Visualizer */}
        <div className="bg-muted p-3 rounded-lg border border-border flex justify-center">
          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
            {POSITION_GRID.map((pos) => {
              const isSelected = watermark.position === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => commitWatermark({ ...watermark, position: pos.id })}
                  className={`h-11 rounded-lg border text-center transition flex flex-col items-center justify-center gap-1 ${
                    isSelected
                      ? "bg-primary/20 border-primary text-primary font-bold shadow-sm shadow-primary/20"
                      : "bg-card border-border hover:border-input text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`w-3 h-3 rounded-sm border border-current flex ${pos.iconCoord}`}>
                    <div className="w-1 h-1 bg-current rounded-full" />
                  </div>
                  <span className="text-xs leading-none">{pos.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Position Mode Trigger & Coordinate Badge */}
        <button
          type="button"
          onClick={() => commitWatermark({ ...watermark, position: "custom" })}
          className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between group ${
            watermark.position === "custom"
              ? "bg-primary/15 border-primary text-primary shadow-sm"
              : "bg-background border-border hover:border-input text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
                watermark.position === "custom"
                  ? "bg-primary text-primary-foreground font-bold"
                  : "bg-muted text-muted-foreground group-hover:text-foreground"
              }`}
            >
              <Move className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-xs block">Posisi Kustom Bebas (Drag & Drop)</span>
              <span className="text-xs text-muted-foreground">
                Tarik watermark sesuka hati langsung di area preview layar
              </span>
            </div>
          </div>
          {watermark.position === "custom" ? (
            <Badge
              variant="outline"
              className="border-primary text-primary bg-primary/10 text-xs font-mono shrink-0"
            >
              X: {Math.round(watermark.custom_x ?? 50)}% Y: {Math.round(watermark.custom_y ?? 50)}%
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground/70 group-hover:text-muted-foreground">
              Pilih
            </span>
          )}
        </button>
      </div>

      {/* Style Enhancements (Shadow & Background Badge) */}
      <div className="space-y-3 bg-card rounded-xl p-4 border border-border">
        <label className="font-semibold text-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" />
          Efek & Visual Kontras
        </label>

        {/* Shadow & Outline Toggle */}
        <label className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border cursor-pointer hover:border-input transition">
          <div>
            <div className="font-semibold text-xs text-foreground">
              Bayangan Kontras (Drop Shadow)
            </div>
            <div className="text-xs text-muted-foreground">
              Meningkatkan keterbacaan di atas video berwarna terang atau ramai
            </div>
          </div>
          <Switch
            checked={watermark.has_shadow}
            onCheckedChange={(checked) => commitWatermark({ ...watermark, has_shadow: checked })}
          />
        </label>

        {/* Background Box Badge Toggle */}
        <div className="p-2.5 rounded-lg bg-background border border-border space-y-2.5">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="font-semibold text-xs text-foreground">
                Badge Latar Belakang (Box)
              </div>
              <div className="text-xs text-muted-foreground">
                Menambahkan kotak transparan di belakang teks watermark
              </div>
            </div>
            <Switch
              checked={watermark.has_background}
              onCheckedChange={(checked) =>
                commitWatermark({ ...watermark, has_background: checked })
              }
            />
          </label>

          {watermark.has_background && (
            <div className="pt-2 border-t border-border grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Warna Badge</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={watermark.background_color || "#000000"}
                    onChange={(e) =>
                      commitWatermark({ ...watermark, background_color: e.target.value })
                    }
                    className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="font-mono text-xs text-muted-foreground uppercase">
                    {watermark.background_color || "#000000"}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Opacity Badge</span>
                  <span className="font-mono text-foreground font-semibold">
                    {Math.round((watermark.background_opacity ?? 0.5) * 100)}%
                  </span>
                </div>
                <Slider
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={[watermark.background_opacity ?? 0.5]}
                  onValueChange={([v]) =>
                    commitWatermark({
                      ...watermark,
                      background_opacity: v || 0.5,
                    })
                  }
                  aria-label="Opacity box watermark"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

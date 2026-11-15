import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Code2,
  Download,
  FileJson,
  Loader2,
  Mic,
  Palette,
  RotateCcw,
  Stamp,
  Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { cn, downloadJsonFile } from "@/lib/utils";
import type {
  ProjectDefaultsConfig,
  SubtitleStyle,
  TTSConfig,
  WatermarkConfig,
} from "@/types";
import { Badge, Button, Input, NativeSelect, Textarea } from "@/components/ui";
import {
  DEFAULT_SUBTITLE_STYLE,
  HIGHLIGHT_COLORS,
  POSITION_OFFSET,
  SUBTITLE_FONTS,
  SUBTITLE_PRESETS,
  toSubtitleStyle,
} from "@/features/subtitles/constants";
import {
  WATERMARK_COLOR_SWATCHES,
  WATERMARK_FONTS,
  WATERMARK_POSITION_GRID,
  WATERMARK_PRESETS,
  normalizeWatermarkConfig,
} from "@/features/watermark/constants";
import { DEFAULT_TTS_CONFIG, TTS_MODEL } from "@/features/tts/constants";
import { ShieldCheck } from "lucide-react";
import { QCConfig } from "@/types";
import {
  DEFAULT_QC_CONFIG,
  QC_PLATFORMS,
  normalizeQCConfig,
} from "@/features/qc/constants";

function makeInitialDraft(): ProjectDefaultsConfig {
  return {
    subtitle: { ...DEFAULT_SUBTITLE_STYLE },
    watermark: normalizeWatermarkConfig(),
    tts: { ...DEFAULT_TTS_CONFIG },
    qc: { ...DEFAULT_QC_CONFIG },
  };
}

export function ProjectDefaultsTab() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ProjectDefaultsConfig>(makeInitialDraft);
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawJsonText, setRawJsonText] = useState("");
  const [isTestingQcModel, setIsTestingQcModel] = useState(false);

  // Reuses the active API key & base URL; only the model name is swapped for the judge.
  const handleTestQcModel = async () => {
    const model = draft.qc?.qc_model?.trim();
    if (!model) return;
    setIsTestingQcModel(true);
    try {
      const res = await api.testConnection({ chat_model: model, vision_model: model });
      showToast(res.message, res.success ? "success" : "error");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Test koneksi gagal", "error");
    } finally {
      setIsTestingQcModel(false);
    }
  };

  const { data: serverDefaults, isLoading } = useQuery({
    queryKey: ["project-defaults"],
    queryFn: api.getProjectDefaults,
  });

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: api.getVoices,
  });

  useEffect(() => {
    if (!serverDefaults) return;
    const normalized: ProjectDefaultsConfig = {
      subtitle: toSubtitleStyle(serverDefaults.subtitle),
      watermark: normalizeWatermarkConfig(serverDefaults.watermark),
      tts: {
        ...DEFAULT_TTS_CONFIG,
        ...serverDefaults.tts,
      },
      qc: normalizeQCConfig(serverDefaults.qc),
    };
    setDraft(normalized);
    setRawJsonText(JSON.stringify(normalized, null, 2));
  }, [serverDefaults]);

  const syncRawJson = (next: ProjectDefaultsConfig) => {
    setDraft(next);
    setRawJsonText(JSON.stringify(next, null, 2));
  };

  const updateSubtitle = (patch: Partial<SubtitleStyle>) => {
    syncRawJson({
      ...draft,
      subtitle: { ...draft.subtitle, ...patch },
    });
  };

  const updateWatermark = (patch: Partial<WatermarkConfig>) => {
    syncRawJson({
      ...draft,
      watermark: { ...draft.watermark, ...patch },
    });
  };

  const updateTts = (patch: Partial<TTSConfig>) => {
    syncRawJson({
      ...draft,
      tts: { ...draft.tts, ...patch },
    });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: ProjectDefaultsConfig) => api.saveProjectDefaults(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData(["project-defaults"], saved);
      showToast("Default konfigurasi project berhasil disimpan ke config.json!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan default konfigurasi", "error");
    },
  });

  const importMutation = useMutation({
    mutationFn: (parsed: Record<string, unknown>) => api.importProjectDefaults(parsed),
    onSuccess: (saved) => {
      queryClient.setQueryData(["project-defaults"], saved);
      showToast("File config.json berhasil diimpor dan diterapkan!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengimpor config.json", "error");
    },
  });

  const resetMutation = useMutation({
    mutationFn: api.resetProjectDefaults,
    onSuccess: (saved) => {
      queryClient.setQueryData(["project-defaults"], saved);
      showToast("Default konfigurasi dikembalikan ke setelan awal.", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mereset konfigurasi", "error");
    },
  });

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Root config.json harus berupa object JSON");
      }
      importMutation.mutate(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? `File JSON tidak valid: ${err.message}` : "File JSON tidak valid",
        "error"
      );
    }
  };

  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Root JSON harus berupa object");
      }
      importMutation.mutate(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? `JSON tidak valid: ${err.message}` : "JSON tidak valid",
        "error"
      );
    }
  };

  const updateQc = (patch: Partial<QCConfig>) => {
    setDraft((prev) => ({
      ...prev,
      qc: normalizeQCConfig({ ...prev.qc, ...patch }),
    }));
  };

  const handleExport = () => {
    const cleanPayload: ProjectDefaultsConfig = {
      subtitle: draft.subtitle,
      watermark: draft.watermark,
      tts: draft.tts,
      qc: normalizeQCConfig(draft.qc),
    };
    downloadJsonFile(cleanPayload, "config.json");
    showToast("config.json berhasil diekspor!", "success");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(draft);
  };

  const providerVoices = voices.filter((v) => v.provider === draft.tts.provider);
  const isCustomVoice =
    !!draft.tts.voice &&
    !providerVoices.some((v) => v.id.toLowerCase() === draft.tts.voice.toLowerCase());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-12 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Memuat default konfigurasi...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handleImportFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {/* Top Banner: config.json Import / Export / Status */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileJson className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Default Project Baru (config.json)
              </h3>
              <Badge
                variant={serverDefaults?.from_file ? "workspace-accent" : "workspace"}
                className="font-mono text-xs"
              >
                {serverDefaults?.from_file ? "Aktif dari config.json" : "Default Bawaan"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Setiap project baru otomatis memakai Subtitle, Watermark, dan TTS config ini agar Anda
              tinggal klik Next tanpa mengatur ulang.
            </p>
            {serverDefaults?.config_path && (
              <p className="font-mono text-[11px] text-muted-foreground">
                Lokasi file: {serverDefaults.config_path}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="workspace-secondary"
              size="workspace-sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>Import config.json</span>
            </Button>

            <Button
              type="button"
              variant="workspace-secondary"
              size="workspace-sm"
              className="gap-1.5"
              onClick={handleExport}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export config.json</span>
            </Button>

            <Button
              type="button"
              variant="workspace-quiet"
              size="workspace-sm"
              className="gap-1.5"
              onClick={() => setShowRawJson((prev) => !prev)}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{showRawJson ? "Tutup JSON" : "Edit JSON"}</span>
            </Button>

            <Button
              type="button"
              variant="workspace-quiet"
              size="workspace-sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              title="Kembalikan ke setelan default bawaan"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          </div>
        </div>

        {showRawJson && (
          <div className="space-y-2 border-t border-border pt-3">
            <label
              htmlFor="raw-config-json"
              className="block text-xs font-semibold text-foreground"
            >
              Raw config.json
            </label>
            <Textarea
              id="raw-config-json"
              rows={14}
              value={rawJsonText}
              onChange={(e) => setRawJsonText(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="workspace-primary"
                size="workspace-sm"
                onClick={handleApplyRawJson}
                disabled={importMutation.isPending}
              >
                Terapkan &amp; Simpan JSON
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Section 1: Subtitle Config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">1. Subtitle Config</h3>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={draft.subtitle.enabled}
              onChange={(e) => updateSubtitle({ enabled: e.target.checked })}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
            Aktifkan Subtitle
          </label>
        </div>

        <div
          className={cn(
            "space-y-4",
            !draft.subtitle.enabled && "opacity-55"
          )}
        >
          {/* Gaya Preset */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted-foreground">Gaya Preset</span>
            <div className="flex flex-wrap gap-2">
              {SUBTITLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => updateSubtitle({ preset_name: p.id, ...p.style })}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition",
                    draft.subtitle.preset_name === p.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Highlight Color */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-muted-foreground">
                Warna Kata Aktif
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Warna ${c}`}
                    onClick={() => updateSubtitle({ highlight_color: c })}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition",
                      draft.subtitle.highlight_color.toUpperCase() === c
                        ? "border-primary scale-110"
                        : "border-border"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <Input
                  type="text"
                  value={draft.subtitle.highlight_color}
                  onChange={(e) => updateSubtitle({ highlight_color: e.target.value })}
                  className="h-8 w-24 font-mono text-xs uppercase"
                  aria-label="Hex warna highlight subtitle"
                />
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-1.5">
              <label
                htmlFor="default-sub-font"
                className="block text-xs font-semibold text-muted-foreground"
              >
                Font Subtitle
              </label>
              <NativeSelect
                id="default-sub-font"
                value={draft.subtitle.font_family}
                onChange={(e) => updateSubtitle({ font_family: e.target.value })}
              >
                {SUBTITLE_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Font Size */}
            <div className="space-y-1.5">
              <label
                htmlFor="default-sub-size"
                className="flex justify-between text-xs font-semibold text-muted-foreground"
              >
                <span>Ukuran Font</span>
                <span className="font-mono text-foreground">{draft.subtitle.font_size}px</span>
              </label>
              <input
                id="default-sub-size"
                type="range"
                min={24}
                max={110}
                step={2}
                value={draft.subtitle.font_size}
                onChange={(e) => updateSubtitle({ font_size: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>

            {/* Position + Offset Y */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-muted-foreground">Posisi</span>
              <div className="flex gap-2">
                {(["bottom", "center"] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() =>
                      updateSubtitle({ position: pos, offset_y: POSITION_OFFSET[pos] })
                    }
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      draft.subtitle.position === pos
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {pos === "bottom" ? "Bawah" : "Tengah"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="default-sub-offset-y"
                className="block text-xs font-semibold text-muted-foreground"
              >
                Offset Vertikal (px)
              </label>
              <Input
                id="default-sub-offset-y"
                type="number"
                min={-1000}
                max={1000}
                value={draft.subtitle.offset_y}
                onChange={(e) =>
                  updateSubtitle({ offset_y: parseInt(e.target.value || "0", 10) || 0 })
                }
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Burst word count */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-muted-foreground">
                Kata per Tampilan
              </span>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => updateSubtitle({ burst_word_count: cnt })}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      draft.subtitle.burst_word_count === cnt
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {cnt} kata
                  </button>
                ))}
              </div>
            </div>

            {/* Animation */}
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-muted-foreground">
                Animasi Kata Aktif
              </span>
              <div className="flex gap-2">
                {(
                  [
                    { id: "scale", label: "Pop" },
                    { id: "none", label: "Tanpa" },
                  ] as const
                ).map((anim) => (
                  <button
                    key={anim.id}
                    type="button"
                    onClick={() => updateSubtitle({ highlight_animation: anim.id })}
                    className={cn(
                      "flex-1 rounded-lg border px-2.5 py-1.5 text-xs transition",
                      draft.subtitle.highlight_animation === anim.id
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {anim.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Watermark Config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Stamp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">2. Watermark Config</h3>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={draft.watermark.enabled}
              onChange={(e) => updateWatermark({ enabled: e.target.checked })}
              className="h-4 w-4 accent-primary cursor-pointer"
            />
            Aktifkan Watermark Secara Default
          </label>
        </div>

        {/* Presets */}
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold text-muted-foreground">
            Preset Cepat Watermark
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {WATERMARK_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => updateWatermark({ ...p.config, enabled: true })}
                className="rounded-lg border border-border bg-background p-2.5 text-left transition hover:border-primary/40 hover:bg-muted"
              >
                <div className="text-xs font-semibold text-foreground truncate">{p.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Watermark Text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="default-wm-text"
                className="block text-xs font-semibold text-muted-foreground"
              >
                Teks Watermark
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!draft.watermark.text.startsWith("@")) {
                      updateWatermark({ text: `@${draft.watermark.text}` });
                    }
                  }}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  @
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!draft.watermark.text.startsWith("© ")) {
                      updateWatermark({ text: `© ${draft.watermark.text}` });
                    }
                  }}
                  className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  ©
                </button>
              </div>
            </div>
            <Input
              id="default-wm-text"
              type="text"
              placeholder="@cliperpro"
              value={draft.watermark.text}
              onChange={(e) => updateWatermark({ text: e.target.value })}
            />
          </div>

          {/* Font Family */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-wm-font"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Font Watermark
            </label>
            <NativeSelect
              id="default-wm-font"
              value={draft.watermark.font_family}
              onChange={(e) => updateWatermark({ font_family: e.target.value })}
            >
              {WATERMARK_FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label} — {f.style}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Font Size */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-wm-size"
              className="flex justify-between text-xs font-semibold text-muted-foreground"
            >
              <span>Ukuran Font</span>
              <span className="font-mono text-foreground">{draft.watermark.font_size}px</span>
            </label>
            <input
              id="default-wm-size"
              type="range"
              min={16}
              max={72}
              step={2}
              value={draft.watermark.font_size}
              onChange={(e) => updateWatermark({ font_size: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          {/* Opacity */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-wm-opacity"
              className="flex justify-between text-xs font-semibold text-muted-foreground"
            >
              <span>Opacity</span>
              <span className="font-mono text-foreground">
                {Math.round(draft.watermark.opacity * 100)}%
              </span>
            </label>
            <input
              id="default-wm-opacity"
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={draft.watermark.opacity}
              onChange={(e) => updateWatermark({ opacity: parseFloat(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          {/* Font Color */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted-foreground">Warna Teks</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {WATERMARK_COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.name}
                  type="button"
                  onClick={() => updateWatermark({ font_color: sw.color })}
                  style={{ backgroundColor: sw.color }}
                  title={sw.name}
                  className={cn(
                    "h-6 w-6 rounded-full border transition",
                    draft.watermark.font_color.toLowerCase() === sw.color.toLowerCase()
                      ? "border-primary ring-2 ring-primary/40 scale-110"
                      : "border-border"
                  )}
                />
              ))}
              <input
                type="color"
                value={draft.watermark.font_color}
                onChange={(e) => updateWatermark({ font_color: e.target.value })}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent"
                aria-label="Pilih warna watermark"
              />
            </div>
          </div>
        </div>

        {/* Position & Offsets */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-muted-foreground">
              Posisi Watermark
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {WATERMARK_POSITION_GRID.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => updateWatermark({ position: pos.id })}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-[11px] transition",
                    draft.watermark.position === pos.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {pos.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateWatermark({ position: "custom" })}
              className={cn(
                "w-full rounded-lg border px-3 py-1.5 text-xs transition",
                draft.watermark.position === "custom"
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              Posisi Kustom (X: {Math.round(draft.watermark.custom_x ?? 50)}%, Y:{" "}
              {Math.round(draft.watermark.custom_y ?? 50)}%)
            </button>
          </div>

          <div className="space-y-3">
            {draft.watermark.position === "custom" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="default-wm-cx"
                    className="mb-1 block text-xs font-semibold text-muted-foreground"
                  >
                    Custom X (%)
                  </label>
                  <Input
                    id="default-wm-cx"
                    type="number"
                    min={0}
                    max={100}
                    value={draft.watermark.custom_x ?? 50}
                    onChange={(e) =>
                      updateWatermark({ custom_x: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="default-wm-cy"
                    className="mb-1 block text-xs font-semibold text-muted-foreground"
                  >
                    Custom Y (%)
                  </label>
                  <Input
                    id="default-wm-cy"
                    type="number"
                    min={0}
                    max={100}
                    value={draft.watermark.custom_y ?? 50}
                    onChange={(e) =>
                      updateWatermark({ custom_y: parseFloat(e.target.value) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="default-wm-ox"
                    className="mb-1 block text-xs font-semibold text-muted-foreground"
                  >
                    Offset X (px)
                  </label>
                  <Input
                    id="default-wm-ox"
                    type="number"
                    min={0}
                    max={300}
                    value={draft.watermark.offset_x}
                    onChange={(e) =>
                      updateWatermark({ offset_x: parseInt(e.target.value || "0", 10) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div>
                  <label
                    htmlFor="default-wm-oy"
                    className="mb-1 block text-xs font-semibold text-muted-foreground"
                  >
                    Offset Y (px)
                  </label>
                  <Input
                    id="default-wm-oy"
                    type="number"
                    min={0}
                    max={300}
                    value={draft.watermark.offset_y}
                    onChange={(e) =>
                      updateWatermark({ offset_y: parseInt(e.target.value || "0", 10) || 0 })
                    }
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            )}

            {/* Effects toggles */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5 text-xs cursor-pointer">
                <span className="font-medium text-foreground">Drop Shadow Kontras</span>
                <input
                  type="checkbox"
                  checked={draft.watermark.has_shadow ?? true}
                  onChange={(e) => updateWatermark({ has_shadow: e.target.checked })}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
              </label>

              <div className="rounded-lg border border-border bg-background p-2.5 space-y-2">
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="font-medium text-foreground">Badge Latar Belakang (Box)</span>
                  <input
                    type="checkbox"
                    checked={draft.watermark.has_background ?? false}
                    onChange={(e) => updateWatermark({ has_background: e.target.checked })}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                </label>
                {draft.watermark.has_background && (
                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={draft.watermark.background_color || "#000000"}
                        onChange={(e) => updateWatermark({ background_color: e.target.value })}
                        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
                        aria-label="Warna box watermark"
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {draft.watermark.background_color || "#000000"}
                      </span>
                    </div>
                    <div>
                      <input
                        type="range"
                        min={0.1}
                        max={0.95}
                        step={0.05}
                        value={draft.watermark.background_opacity ?? 0.5}
                        onChange={(e) =>
                          updateWatermark({ background_opacity: parseFloat(e.target.value) })
                        }
                        className="w-full accent-primary"
                        aria-label="Opacity box watermark"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: TTS Config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">3. TTS Config (Suara Narasi)</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Provider */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted-foreground">
              Provider TTS
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "gemini", label: "Gemini TTS", defaultVoice: "Puck" },
                  { id: "elevenlabs", label: "ElevenLabs", defaultVoice: "Adam" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    updateTts({
                      provider: p.id,
                      voice: p.defaultVoice,
                      model: TTS_MODEL[p.id],
                    })
                  }
                  className={cn(
                    "h-9 rounded-xl border text-xs font-medium transition",
                    draft.tts.provider === p.id
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-tts-model"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Model TTS
            </label>
            <Input
              id="default-tts-model"
              type="text"
              value={draft.tts.model || ""}
              placeholder={TTS_MODEL[draft.tts.provider]}
              onChange={(e) => updateTts({ model: e.target.value })}
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Voice Preset Dropdown */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-tts-voice"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Karakter Suara Default
            </label>
            <NativeSelect
              id="default-tts-voice"
              value={isCustomVoice ? "__custom__" : draft.tts.voice}
              onChange={(e) => {
                if (e.target.value !== "__custom__") {
                  updateTts({ voice: e.target.value });
                }
              }}
            >
              {providerVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gender})
                </option>
              ))}
              {isCustomVoice && <option value="__custom__">Custom: {draft.tts.voice}</option>}
            </NativeSelect>
          </div>

          {/* Custom Voice ID input */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-tts-voice-id"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Voice ID / Nama Suara (bisa Custom ElevenLabs ID)
            </label>
            <Input
              id="default-tts-voice-id"
              type="text"
              value={draft.tts.voice}
              onChange={(e) => updateTts({ voice: e.target.value })}
              placeholder="Puck atau pNInz6obpgDQGcFmaJgB"
              className="font-mono text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Rate */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-tts-rate"
              className="flex justify-between text-xs font-semibold text-muted-foreground"
            >
              <span>Kecepatan (Rate)</span>
              <span className="font-mono text-foreground">
                {draft.tts.rate >= 0 ? `+${draft.tts.rate}` : draft.tts.rate}%
              </span>
            </label>
            <input
              id="default-tts-rate"
              type="range"
              min={-20}
              max={30}
              step={5}
              value={draft.tts.rate}
              onChange={(e) => updateTts({ rate: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          {/* Pitch */}
          <div className="space-y-1.5">
            <label
              htmlFor="default-tts-pitch"
              className="flex justify-between text-xs font-semibold text-muted-foreground"
            >
              <span>Tinggi Nada (Pitch)</span>
              <span className="font-mono text-foreground">
                {draft.tts.pitch >= 0 ? `+${draft.tts.pitch}` : draft.tts.pitch}Hz
              </span>
            </label>
            <input
              id="default-tts-pitch"
              type="range"
              min={-15}
              max={15}
              step={3}
              value={draft.tts.pitch}
              onChange={(e) => updateTts({ pitch: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
        </div>
      </div>

      {/* Section 4: AI Quality Control (qc) */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div>
              <h4 className="text-sm font-bold text-foreground">
                4. AI Quality Control (QC) Default
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Pengaturan reviewer AI. QC hanya jalan saat kamu klik "Cek QC" di studio — tidak pernah otomatis saat TTS atau render.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            qc
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor="default-qc-platform"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Target Platform FYP
            </label>
            <NativeSelect
              id="default-qc-platform"
              value={draft.qc?.platform || "all"}
              onChange={(e) =>
                updateQc({
                  platform: e.target.value as QCConfig["platform"],
                })
              }
            >
              {QC_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-qc-threshold"
              className="flex justify-between text-xs font-semibold text-muted-foreground"
            >
              <span>Skor Minimum Lolos</span>
              <span className="font-mono text-foreground">
                {(draft.qc?.threshold ?? 7.5).toFixed(1)} / 10
              </span>
            </label>
            <input
              id="default-qc-threshold"
              type="range"
              min={5}
              max={9.5}
              step={0.5}
              value={draft.qc?.threshold ?? 7.5}
              onChange={(e) => updateQc({ threshold: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-qc-rounds"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Maksimal Putaran Auto-Fix
            </label>
            <NativeSelect
              id="default-qc-rounds"
              value={String(draft.qc?.max_fix_rounds ?? 2)}
              onChange={(e) =>
                updateQc({ max_fix_rounds: Number(e.target.value) })
              }
            >
              <option value="1">1 Putaran</option>
              <option value="2">2 Putaran (Rekomendasi)</option>
              <option value="3">3 Putaran</option>
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="default-qc-model"
              className="block text-xs font-semibold text-muted-foreground"
            >
              Model QC Judge (opsional)
            </label>
            <div className="flex gap-2">
              <Input
                id="default-qc-model"
                placeholder="Kosong = pakai model chat & vision aktif"
                value={draft.qc?.qc_model ?? ""}
                onChange={(e) => updateQc({ qc_model: e.target.value.trim() || null })}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-2"
                disabled={!draft.qc?.qc_model?.trim() || isTestingQcModel}
                onClick={handleTestQcModel}
              >
                {isTestingQcModel && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Test Koneksi</span>
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Pakai model multimodal yang kuat dan beda dari model penulis naskah, agar penilaian jujur.
            </p>
          </div>
        </div>
      </div>

      {/* Save Submit */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          <span>Export config.json</span>
        </Button>
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          variant="workspace-primary"
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          <span>{saveMutation.isPending ? "Menyimpan..." : "Simpan Default Config"}</span>
        </Button>
      </div>
    </form>
  );
}

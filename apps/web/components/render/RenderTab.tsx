"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Film,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Sliders,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  HardDrive,
  Maximize2,
  Scan,
  ZoomIn,
  Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, TimelineClip, Narration, AudioTrack, SubtitleStyle, RenderJob } from "@/types";
import { PreviewPlayer } from "./PreviewPlayer";

interface RenderTabProps {
  project: Project & {
    timeline?: { clips: TimelineClip[]; total_duration: number } | null;
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
    render_jobs?: RenderJob[];
  };
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function RenderTab({ project }: RenderTabProps) {
  const queryClient = useQueryClient();
  const { showToast, activeTask } = useStudioStore();

  const [bgMode, setBgMode] = useState<"blur" | "black" | "cover">(
    project.background_fill?.mode === "cover"
      ? "cover"
      : project.background_fill?.mode === "black"
      ? "black"
      : "blur"
  );
  const [customZoom, setCustomZoom] = useState<number>(project.background_fill?.zoom ?? 1.0);
  const [activeLayoutTab, setActiveLayoutTab] = useState<"cover" | "fit_blur" | "fit_black" | "custom">(() => {
    if (project.background_fill?.mode === "cover") return "cover";
    if (project.background_fill?.zoom && project.background_fill.zoom > 1.02) return "custom";
    if (project.background_fill?.mode === "black") return "fit_black";
    return "fit_blur";
  });
  const zoomDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [resolution, setResolution] = useState(project.resolution || "1080p");
  const [antiCopyright, setAntiCopyright] = useState(project.background_fill?.anti_copyright ?? true);
  const [dynamicZoom, setDynamicZoom] = useState(project.background_fill?.dynamic_zoom ?? true);
  const [colorGrading, setColorGrading] = useState(project.background_fill?.color_grading ?? true);

  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const { data: renderJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["render-jobs", project.id],
    queryFn: () => api.getRenderJobs(project.id),
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  const totalStorageBytes = renderJobs.reduce(
    (acc, j) => acc + (j.file_size_bytes || 0),
    0
  );

  const updateProjectMutation = useMutation({
    mutationFn: (data: any) => api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const renderFinalMutation = useMutation({
    mutationFn: () => api.renderFinal(project.id),
    onSuccess: async () => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast("Job render final dimulai di background!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memulai render", "error");
    },
  });

  const renderPreviewMutation = useMutation({
    mutationFn: () => api.renderPreview(project.id),
    onSuccess: async () => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast("Job preview cepat dimulai di background!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memulai preview render", "error");
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => api.deleteRenderJob(project.id, jobId),
    onSuccess: async (data) => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      const freed = data.freed_bytes ? ` (${formatBytes(data.freed_bytes)} dihemat)` : "";
      showToast(`Riwayat render berhasil dihapus${freed}`, "success");
      setConfirmDeleteJobId(null);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menghapus riwayat render", "error");
    },
  });

  const clearAllJobsMutation = useMutation({
    mutationFn: () => api.clearRenderJobs(project.id),
    onSuccess: async (data) => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      const freed = data.freed_bytes ? ` (${formatBytes(data.freed_bytes)} dihemat)` : "";
      showToast(`${data.count || 0} riwayat render berhasil dibersihkan${freed}`, "success");
      setConfirmClearAll(false);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membersihkan riwayat render", "error");
    },
  });

  const updateLayoutSettings = (
    newTab: "cover" | "fit_blur" | "fit_black" | "custom",
    newZoom?: number,
    newBgMode?: "blur" | "black"
  ) => {
    setActiveLayoutTab(newTab);

    let nextMode: "cover" | "blur" | "black" = bgMode;
    let nextZoom: number = customZoom;

    if (newTab === "cover") {
      nextMode = "cover";
      nextZoom = 1.0;
    } else if (newTab === "fit_blur") {
      nextMode = "blur";
      nextZoom = 1.0;
    } else if (newTab === "fit_black") {
      nextMode = "black";
      nextZoom = 1.0;
    } else if (newTab === "custom") {
      nextMode = newBgMode ?? (bgMode === "cover" ? "blur" : bgMode);
      nextZoom = newZoom !== undefined ? newZoom : (customZoom > 1.02 ? customZoom : 1.35);
    }

    setBgMode(nextMode);
    setCustomZoom(nextZoom);

    updateProjectMutation.mutate({
      background_fill: {
        mode: nextMode,
        zoom: nextZoom,
        color: "#000000",
        anti_copyright: antiCopyright,
        dynamic_zoom: dynamicZoom,
        color_grading: colorGrading,
      },
    });
  };

  const handleZoomSliderChange = (val: number) => {
    setCustomZoom(val);
    if (zoomDebounceTimer.current) {
      clearTimeout(zoomDebounceTimer.current);
    }
    zoomDebounceTimer.current = setTimeout(() => {
      updateProjectMutation.mutate({
        background_fill: {
          mode: bgMode === "cover" ? "blur" : bgMode,
          zoom: val,
          color: "#000000",
          anti_copyright: antiCopyright,
          dynamic_zoom: dynamicZoom,
          color_grading: colorGrading,
        },
      });
    }, 250);
  };

  const updateAntiCopyrightSettings = (updates: Partial<{
    anti_copyright: boolean;
    dynamic_zoom: boolean;
    color_grading: boolean;
  }>) => {
    const newAnti = updates.anti_copyright !== undefined ? updates.anti_copyright : antiCopyright;
    const newZoom = updates.dynamic_zoom !== undefined ? updates.dynamic_zoom : dynamicZoom;
    const newColor = updates.color_grading !== undefined ? updates.color_grading : colorGrading;

    setAntiCopyright(newAnti);
    setDynamicZoom(newZoom);
    setColorGrading(newColor);

    updateProjectMutation.mutate({
      background_fill: {
        mode: bgMode,
        zoom: customZoom,
        color: "#000000",
        anti_copyright: newAnti,
        dynamic_zoom: newZoom,
        color_grading: newColor,
      },
    });
  };

  const projectWithLiveSettings = React.useMemo(() => {
    return {
      ...project,
      background_fill: {
        mode: bgMode,
        zoom: customZoom,
        color: "#000000",
        anti_copyright: antiCopyright,
        dynamic_zoom: dynamicZoom,
        color_grading: colorGrading,
      },
      resolution,
    };
  }, [project, bgMode, customZoom, antiCopyright, dynamicZoom, colorGrading, resolution]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Interactive Vertical Video Player */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Film className="w-4 h-4 text-brand-400" />
          Live Preview Player (9:16)
        </h3>
        <PreviewPlayer project={projectWithLiveSettings} />
      </div>

      {/* Right Column: Render Controls & History */}
      <div className="lg:col-span-7 space-y-6">
        {/* Render Settings Card */}
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-yellow" />
            <h4 className="text-sm font-bold text-white">Pengaturan Rendering Final</h4>
          </div>

          {/* Layout & Rasio Tampilan Video */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-300">
                Mode Tampilan Video (Rasio 9:16)
              </label>
              <span className="text-[10px] text-brand-400 font-mono font-semibold">
                {activeLayoutTab === "cover"
                  ? "FULLSCREEN 9:16 CROP"
                  : activeLayoutTab === "custom"
                  ? `CUSTOM ZOOM ${Math.round(customZoom * 100)}%`
                  : activeLayoutTab === "fit_black"
                  ? "FIT + SOLID BLACK"
                  : "FIT + BLUR"}
              </span>
            </div>

            {/* 4 Pilihan Mode Visual Card */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Option 1: Cover (Fullscreen 9:16) */}
              <button
                type="button"
                onClick={() => updateLayoutSettings("cover")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  activeLayoutTab === "cover"
                    ? "bg-brand-500/15 border-brand-500 ring-1 ring-brand-500 text-white shadow-lg shadow-brand-500/10"
                    : "bg-surface-secondary/50 border-surface-border text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Maximize2 className={`w-4 h-4 ${activeLayoutTab === "cover" ? "text-brand-400" : "text-slate-400"}`} />
                  {activeLayoutTab === "cover" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold leading-tight">Cover 9:16</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">Fullscreen crop vertikal</div>
                </div>
              </button>

              {/* Option 2: Fit + Blur */}
              <button
                type="button"
                onClick={() => updateLayoutSettings("fit_blur")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  activeLayoutTab === "fit_blur"
                    ? "bg-brand-500/15 border-brand-500 ring-1 ring-brand-500 text-white shadow-lg shadow-brand-500/10"
                    : "bg-surface-secondary/50 border-surface-border text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Layers className={`w-4 h-4 ${activeLayoutTab === "fit_blur" ? "text-brand-400" : "text-slate-400"}`} />
                  {activeLayoutTab === "fit_blur" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold leading-tight">Fit + Blur</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">Utuh 100% + latar blur</div>
                </div>
              </button>

              {/* Option 3: Fit + Black */}
              <button
                type="button"
                onClick={() => updateLayoutSettings("fit_black")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  activeLayoutTab === "fit_black"
                    ? "bg-brand-500/15 border-brand-500 ring-1 ring-brand-500 text-white shadow-lg shadow-brand-500/10"
                    : "bg-surface-secondary/50 border-surface-border text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Scan className={`w-4 h-4 ${activeLayoutTab === "fit_black" ? "text-brand-400" : "text-slate-400"}`} />
                  {activeLayoutTab === "fit_black" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold leading-tight">Fit + Hitam</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">Letterbox hitam klasik</div>
                </div>
              </button>

              {/* Option 4: Custom Zoom */}
              <button
                type="button"
                onClick={() => updateLayoutSettings("custom")}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  activeLayoutTab === "custom"
                    ? "bg-brand-500/15 border-brand-500 ring-1 ring-brand-500 text-white shadow-lg shadow-brand-500/10"
                    : "bg-surface-secondary/50 border-surface-border text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <ZoomIn className={`w-4 h-4 ${activeLayoutTab === "custom" ? "text-brand-400" : "text-slate-400"}`} />
                  {activeLayoutTab === "custom" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold leading-tight">Custom Zoom</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">Slider bebas (1.0x - 3.0x)</div>
                </div>
              </button>
            </div>

            {/* Sub-Panel untuk Custom Zoom */}
            {activeLayoutTab === "custom" && (
              <div className="p-4 rounded-xl bg-surface-secondary/40 border border-brand-500/30 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ZoomIn className="w-3.5 h-3.5 text-brand-400" />
                    <span className="text-xs font-semibold text-white">Tingkat Zoom Video</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {Math.round(customZoom * 100)}% ({customZoom.toFixed(2)}x)
                  </span>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="range"
                    min="1.0"
                    max="3.0"
                    step="0.05"
                    value={customZoom}
                    onChange={(e) => handleZoomSliderChange(parseFloat(e.target.value))}
                    className="w-full accent-brand-500 cursor-pointer h-1.5 bg-surface-border rounded-lg"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>100% (Fit)</span>
                    <span>150%</span>
                    <span>200%</span>
                    <span>300%</span>
                  </div>
                </div>

                {/* Preset Zoom Pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 mr-1">Preset:</span>
                  {[
                    { label: "100%", val: 1.0 },
                    { label: "125%", val: 1.25 },
                    { label: "140% (Optimal)", val: 1.4 },
                    { label: "175%", val: 1.75 },
                    { label: "200%", val: 2.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleZoomSliderChange(p.val)}
                      className={`text-[10px] font-medium px-2.5 py-0.5 rounded-lg border transition ${
                        Math.abs(customZoom - p.val) < 0.03
                          ? "bg-brand-500 text-white border-brand-400"
                          : "bg-surface/80 border-surface-border text-slate-300 hover:border-brand-500/50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Background Fill Selector untuk Custom Zoom */}
                <div className="pt-2.5 border-t border-surface-border/60 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs text-slate-300 font-medium">Latar Belakang Sisa Area:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateLayoutSettings("custom", customZoom, "blur")}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition ${
                        bgMode === "blur"
                          ? "bg-brand-500/20 border-brand-500 text-brand-300 font-semibold"
                          : "bg-surface border-surface-border text-slate-400 hover:text-white"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      Efek Blur
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLayoutSettings("custom", customZoom, "black")}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition ${
                        bgMode === "black"
                          ? "bg-brand-500/20 border-brand-500 text-brand-300 font-semibold"
                          : "bg-surface border-surface-border text-slate-400 hover:text-white"
                      }`}
                    >
                      <Scan className="w-3.5 h-3.5" />
                      Solid Black
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Resolusi Video Output */}
          <div className="pt-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Resolusi Video Output
            </label>
            <select
              value={resolution}
              onChange={(e) => {
                setResolution(e.target.value);
                updateProjectMutation.mutate({ resolution: e.target.value });
              }}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
            >
              <option value="1080p">1080x1920 (Full HD Vertical)</option>
              <option value="720p">720x1280 (HD Fast Export)</option>
            </select>
          </div>

          {/* Proteksi Hak Cipta & Transformative Editing (Anti-Copyright) */}
          <div className="rounded-xl p-4 bg-surface/70 border border-brand-500/20 space-y-3 mt-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Proteksi Hak Cipta & Transformative Editing</span>
              </div>
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Aman Upload TikTok / Reels / Shorts
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Menerapkan modifikasi visual dinamis saat render FFmpeg agar tayangan tidak terdeteksi duplikat oleh algoritma Content ID platform.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-secondary/40 border border-surface-border cursor-pointer hover:border-brand-500/40 transition">
                <input
                  type="checkbox"
                  checked={dynamicZoom}
                  onChange={(e) => updateAntiCopyrightSettings({ dynamic_zoom: e.target.checked })}
                  className="mt-0.5 rounded border-surface-border text-brand-500 focus:ring-brand-500/30"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Dynamic Ken Burns Zoom</div>
                  <div className="text-[10px] text-slate-400">Zoom halus bergantian (1.05x) mematahkan spatial hash pencocokan video.</div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-secondary/40 border border-surface-border cursor-pointer hover:border-brand-500/40 transition">
                <input
                  type="checkbox"
                  checked={colorGrading}
                  onChange={(e) => updateAntiCopyrightSettings({ color_grading: e.target.checked })}
                  className="mt-0.5 rounded border-surface-border text-brand-500 focus:ring-brand-500/30"
                />
                <div>
                  <div className="text-xs font-semibold text-white">Micro Color Grading</div>
                  <div className="text-[10px] text-slate-400">Penyesuaian kontras & saturasi mikro (+3%) mengubah signature digital piksel.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3">
            <button
              onClick={() => renderPreviewMutation.mutate()}
              disabled={renderPreviewMutation.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-accent-yellow" />
              <span>Fast Preview Render (Ultrafast)</span>
            </button>

            <button
              onClick={() => renderFinalMutation.mutate()}
              disabled={renderFinalMutation.isPending}
              className="flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-xs shadow-xl shadow-brand-500/25 flex items-center justify-center gap-2 transition transform active:scale-95 disabled:opacity-50"
            >
              {renderFinalMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Render Final Video (FFmpeg)</span>
            </button>
          </div>
        </div>

        {/* Render Jobs History & Downloads */}
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">
                Riwayat Render & File Siap Download ({renderJobs.length})
              </h4>
              {totalStorageBytes > 0 && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-secondary border border-surface-border text-slate-300 flex items-center gap-1"
                  title="Total kapasitas disk yang digunakan file video render"
                >
                  <HardDrive className="w-2.5 h-2.5 text-brand-400" />
                  {formatBytes(totalStorageBytes)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {renderJobs.length > 0 && (
                confirmClearAll ? (
                  <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/30 px-2 py-1 rounded-lg">
                    <span className="text-[11px] text-rose-300 font-medium">Hapus semua ({renderJobs.length})?</span>
                    <button
                      onClick={() => clearAllJobsMutation.mutate()}
                      disabled={clearAllJobsMutation.isPending}
                      className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold flex items-center gap-1 transition disabled:opacity-50"
                    >
                      {clearAllJobsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Ya"}
                    </button>
                    <button
                      onClick={() => setConfirmClearAll(false)}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[10px] transition"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearAll(true)}
                    className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-xs font-medium flex items-center gap-1.5 transition"
                    title="Hapus semua riwayat render dan file video untuk mengosongkan penyimpanan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Bersihkan Riwayat</span>
                  </button>
                )
              )}

              <button
                onClick={() => refetchJobs()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {renderJobs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-surface/50 rounded-xl border border-surface-border">
              Belum ada render job yang dijalankan. Klik tombol render di atas untuk memulai.
            </div>
          ) : (
            <div className="space-y-3">
              {renderJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-4 rounded-xl bg-surface border border-surface-border flex flex-col gap-2 text-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-surface-card border border-surface-border">
                        {job.render_type}
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        ID: {job.id.slice(0, 8)}
                      </span>
                      {job.file_size_bytes ? (
                        <span
                          className="text-[10px] font-mono text-slate-400 bg-surface-secondary px-1.5 py-0.5 rounded border border-surface-border flex items-center gap-1"
                          title="Ukuran file video hasil render di disk"
                        >
                          <HardDrive className="w-2.5 h-2.5 text-brand-400" />
                          {formatBytes(job.file_size_bytes)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {job.status === "completed" && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                        </span>
                      )}
                      {job.status === "rendering" && (
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
                          {activeTask?.task_type === "render" && (!activeTask.data?.job_id || activeTask.data?.job_id === job.id)
                            ? `${activeTask.progress}%`
                            : `${job.progress}%`}
                        </span>
                      )}
                      {job.status === "queued" && (
                        <span className="text-slate-400 font-semibold">Dalam Antrean</span>
                      )}
                      {job.status === "failed" && (
                        <span className="text-rose-400 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" /> Gagal
                        </span>
                      )}

                      {/* Delete Single Job Action */}
                      {confirmDeleteJobId === job.id ? (
                        <div className="flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded ml-1">
                          <span className="text-[10px] text-rose-300">Hapus?</span>
                          <button
                            onClick={() => deleteJobMutation.mutate(job.id)}
                            disabled={deleteJobMutation.isPending}
                            className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold transition flex items-center gap-1 disabled:opacity-50"
                          >
                            {deleteJobMutation.isPending && deleteJobMutation.variables === job.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              "Ya"
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteJobId(null)}
                            className="px-1.5 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-[9px] transition"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteJobId(job.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition ml-1"
                          title="Hapus riwayat render ini dan kosongkan file video dari penyimpanan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    const isCurrentActive =
                      activeTask?.task_type === "render" &&
                      (!activeTask.data?.job_id || activeTask.data?.job_id === job.id);
                    const currentProgress =
                      isCurrentActive && activeTask.status === "progress"
                        ? activeTask.progress
                        : job.progress;
                    const currentLog =
                      isCurrentActive && activeTask.status === "progress"
                        ? activeTask.message
                        : job.log_output;

                    return (
                      <>
                        {job.status === "rendering" && (
                          <div className="w-full bg-surface-card rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-brand-500 h-full transition-all duration-300"
                              style={{ width: `${currentProgress}%` }}
                            />
                          </div>
                        )}

                        {currentLog && (
                          <p className="text-[11px] text-slate-400 italic font-mono truncate">
                            {currentLog}
                          </p>
                        )}
                      </>
                    );
                  })()}


                  {job.status === "completed" && job.output_url && (
                    <div className="pt-2 border-t border-surface-border/60 flex items-center justify-between">
                      <a
                        href={job.output_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-400 hover:underline flex items-center gap-1 text-[11px]"
                      >
                        <Play className="w-3 h-3" /> Putar Video
                      </a>
                      <a
                        href={`/api/v1/projects/${project.id}/render/download/${job.id}`}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

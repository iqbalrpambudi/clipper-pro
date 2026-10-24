"use client";

import React, { useState, useEffect } from "react";
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
  Stamp,
  X,
  StopCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { StudioTabHeader } from "@/components/layout";
import {
  Project,
  TimelineClip,
  Narration,
  AudioTrack,
  SubtitleStyle,
  RenderJob,
  WatermarkConfig,
} from "@/types";
import { PreviewPlayer } from "./PreviewPlayer";
import { WatermarkCustomizePanel } from "../watermark/WatermarkCustomizePanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

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
  const { showToast, activeTask, setActiveTask } = useStudioStore();

  const [resolution, setResolution] = useState(project.resolution || "1080p");
  const [antiCopyright, setAntiCopyright] = useState(
    project.background_fill?.anti_copyright ?? true
  );
  const [dynamicZoom, setDynamicZoom] = useState(project.background_fill?.dynamic_zoom ?? true);
  const [colorGrading, setColorGrading] = useState(project.background_fill?.color_grading ?? true);

  const [liveWatermark, setLiveWatermark] = useState<WatermarkConfig | null>(
    project.watermark || null
  );
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [previewModalVideo, setPreviewModalVideo] = useState<{
    url: string;
    title: string;
    poster?: string | null;
  } | null>(null);

  useEffect(() => {
    if (project.watermark) {
      setLiveWatermark(project.watermark);
    }
  }, [project.watermark]);

  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const { data: renderJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["render-jobs", project.id],
    queryFn: () => api.getRenderJobs(project.id),
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  const totalStorageBytes = renderJobs.reduce((acc, j) => acc + (j.file_size_bytes || 0), 0);

  const updateProjectMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateProject>[1]) =>
      api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const renderFinalMutation = useMutation({
    mutationFn: () => api.renderFinal(project.id, { resolution }),
    onSuccess: async () => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast("Job render final dimulai di background!", "success");
    },
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
      showToast(err.message || "Gagal membersihkan riwayat render", "error");
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => api.cancelRenderJob(project.id, jobId),
    onSuccess: async (data) => {
      setActiveTask(null, project.id);
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast(data.message || "Rendering video berhasil dibatalkan", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membatalkan rendering", "error");
    },
  });

  const updateAntiCopyrightSettings = (
    updates: Partial<{
      anti_copyright: boolean;
      dynamic_zoom: boolean;
      color_grading: boolean;
    }>
  ) => {
    const newAnti = updates.anti_copyright !== undefined ? updates.anti_copyright : antiCopyright;
    const newZoom = updates.dynamic_zoom !== undefined ? updates.dynamic_zoom : dynamicZoom;
    const newColor = updates.color_grading !== undefined ? updates.color_grading : colorGrading;

    setAntiCopyright(newAnti);
    setDynamicZoom(newZoom);
    setColorGrading(newColor);

    updateProjectMutation.mutate({
      background_fill: {
        ...(project.background_fill || { mode: "blur", zoom: 1.0, color: "#000000" }),
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
        ...(project.background_fill || { mode: "blur", zoom: 1.0, color: "#000000" }),
        anti_copyright: antiCopyright,
        dynamic_zoom: dynamicZoom,
        color_grading: colorGrading,
      },
      watermark: liveWatermark,
      resolution,
    };
  }, [project, antiCopyright, dynamicZoom, colorGrading, liveWatermark, resolution]);

  return (
    <div>
      <StudioTabHeader
        icon={Download}
        title="Render & ekspor"
        description="Periksa pratinjau dan pengaturan sebelum membuat video final."
      />
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left Column: Interactive Vertical Video Player */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground tracking-tight uppercase">
                  Live Preview Player ({project.aspect_ratio || "9:16"})
                </h3>
              </div>
              <Badge
                variant="outline"
                className="border-border font-mono text-[10px] text-muted-foreground"
              >
                Compositor Live
              </Badge>
            </div>
            <PreviewPlayer project={projectWithLiveSettings} />
          </div>

          {/* Right Column: Render Controls & History */}
          <div className="lg:col-span-7 space-y-6">
            {/* Render Settings Panel */}
            <SectionPanel
              title="Pengaturan Rendering Final"
              description="Konfigurasi resolusi dan proteksi video sebelum render"
              icon={<Sliders className="w-4 h-4 text-primary" />}
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
            >
              <div className="space-y-4">
                {/* Resolusi Video Output */}
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">
                    Resolusi Video Output
                  </label>
                  <Select
                    value={resolution}
                    onValueChange={(val) => {
                      setResolution(val);
                      updateProjectMutation.mutate({ resolution: val });
                    }}
                  >
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent appearance="workspace">
                      <SelectItem value="1080p" className="text-xs">1080x1920 (Full HD Vertical)</SelectItem>
                      <SelectItem value="720p" className="text-xs">720x1280 (HD Fast Export)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Proteksi Hak Cipta & Transformative Editing (Anti-Copyright) */}
                <div className="space-y-3 rounded-xl border border-primary/20 bg-background p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Proteksi Hak Cipta & Transformative Editing
                      </span>
                    </div>
                    <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                      Aman Upload Platform
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Menerapkan modifikasi visual dinamis saat render FFmpeg agar tayangan tidak
                    terdeteksi duplikat oleh algoritma Content ID platform.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-2.5 transition hover:border-primary/40">
                      <input
                        type="checkbox"
                        checked={dynamicZoom}
                        onChange={(e) =>
                          updateAntiCopyrightSettings({ dynamic_zoom: e.target.checked })
                        }
                        className="mt-0.5 rounded border-input text-primary focus:ring-primary/30"
                      />
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Dynamic Ken Burns Zoom
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Zoom halus bergantian (1.05x) mematahkan spatial hash pencocokan video.
                        </div>
                      </div>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-2.5 transition hover:border-primary/40">
                      <input
                        type="checkbox"
                        checked={colorGrading}
                        onChange={(e) =>
                          updateAntiCopyrightSettings({ color_grading: e.target.checked })
                        }
                        className="mt-0.5 rounded border-input text-primary focus:ring-primary/30"
                      />
                      <div>
                        <div className="text-xs font-semibold text-foreground">
                          Micro Color Grading
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Penyesuaian kontras & saturasi mikro (+3%) mengubah signature digital
                          piksel.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Watermark Video (Teks Overlay) */}
                <div className="space-y-3 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Stamp className="w-4 h-4 text-primary" />
                      <span className="text-xs font-semibold text-foreground">
                        Watermark Video (Teks Overlay)
                      </span>
                    </div>
                    {liveWatermark?.enabled ? (
                      <Badge
                        variant="default"
                        className="text-[10px] bg-[#ECF3EB] text-[#456A4E] border border-[#C9DDCF]"
                      >
                        Aktif: {liveWatermark.text || "@watermark"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-border text-[10px] text-muted-foreground"
                      >
                        Nonaktif
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Menyematkan teks overlay transparan dengan font dan posisi kustom langsung ke
                    hasil render video.
                  </p>

                  <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowWatermarkModal(!showWatermarkModal)}
                      className="h-8 items-center gap-1.5 border-border text-xs text-foreground hover:border-primary/50"
                    >
                      <Stamp className="w-3.5 h-3.5 text-primary" />
                      <span>
                        {showWatermarkModal
                          ? "Tutup Pengaturan Watermark"
                          : "Sesuaikan Font & Posisi"}
                      </span>
                    </Button>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={liveWatermark?.enabled ?? false}
                        onChange={(e) => {
                          const updated = {
                            ...(liveWatermark || {
                              text: "@cliperpro",
                              font_family: "Poppins",
                              font_size: 34,
                              font_color: "#FFFFFF",
                              opacity: 0.85,
                              position: "bottom-right",
                              offset_x: 32,
                              offset_y: 32,
                              has_background: false,
                              has_shadow: true,
                            }),
                            enabled: e.target.checked,
                          };
                          setLiveWatermark(updated);
                          updateProjectMutation.mutate({ watermark: updated });
                        }}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary/30"
                      />
                      <span>Terapkan saat Render</span>
                    </label>
                  </div>

                  {showWatermarkModal && (
                    <div className="border-t border-border pt-3">
                      <WatermarkCustomizePanel
                        project={{ ...project, watermark: liveWatermark }}
                        onWatermarkChange={(wm) => setLiveWatermark(wm)}
                      />
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => renderPreviewMutation.mutate()}
                    disabled={renderPreviewMutation.isPending}
                    className="flex-1 border-primary/30 text-primary hover:bg-primary/10 text-xs font-semibold gap-2 h-10"
                  >
                    <Zap className="w-4 h-4" />
                    <span>Fast Preview Render (Ultrafast)</span>
                  </Button>

                  <Button
                    variant="workspace-primary"
                    size="lg"
                    onClick={() => renderFinalMutation.mutate()}
                    disabled={renderFinalMutation.isPending}
                    className="flex-1 text-xs font-bold gap-2 h-10 shadow-sm"
                  >
                    {renderFinalMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Render Final Video (FFmpeg)</span>
                  </Button>
                </div>
              </div>
            </SectionPanel>

            {/* Render Jobs History & Downloads Panel */}
            <SectionPanel
              title={`Riwayat Render & File Siap Download (${renderJobs.length})`}
              icon={<Film className="w-4 h-4 text-primary" />}
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
              badge={
                totalStorageBytes > 0 ? (
                  <Badge
                    variant="outline"
                    className="gap-1 border-border font-mono text-[10px] text-muted-foreground"
                  >
                    <HardDrive className="w-2.5 h-2.5 text-primary" />
                    {formatBytes(totalStorageBytes)}
                  </Badge>
                ) : undefined
              }
              actions={
                <div className="flex items-center gap-2">
                  {renderJobs.length > 0 &&
                    (confirmClearAll ? (
                      <div className="flex items-center gap-1.5 bg-destructive/10 border border-destructive/30 px-2 py-0.5 rounded-lg">
                        <span className="text-[11px] text-destructive font-medium">
                          Hapus semua ({renderJobs.length})?
                        </span>
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => clearAllJobsMutation.mutate()}
                          disabled={clearAllJobsMutation.isPending}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {clearAllJobsMutation.isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            "Ya"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setConfirmClearAll(false)}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setConfirmClearAll(true)}
                        className="text-muted-foreground hover:text-destructive text-xs gap-1 h-7"
                        title="Hapus semua riwayat render dan file video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[11px]">Bersihkan Riwayat</span>
                      </Button>
                    ))}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => refetchJobs()}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="Refresh"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              }
            >
              {renderJobs.length === 0 ? (
                <div className="rounded-xl border border-border bg-background p-6 text-center text-xs text-muted-foreground">
                  Belum ada render job yang dijalankan. Klik tombol render di atas untuk memulai.
                </div>
              ) : (
                <div className="space-y-3">
                  {renderJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col gap-2.5 rounded-xl border border-border bg-background p-4 text-xs shadow-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-semibold uppercase tracking-wider text-[10px]"
                          >
                            {job.render_type}
                          </Badge>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            ID: {job.id.slice(0, 8)}
                          </span>
                          {job.file_size_bytes ? (
                            <span
                              className="flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                              title="Ukuran file video hasil render di disk"
                            >
                              <HardDrive className="w-2.5 h-2.5 text-primary" />
                              {formatBytes(job.file_size_bytes)}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          {job.status === "completed" && (
                            <Badge
                              variant="workspace-success"
                              className="text-[10px] gap-1 font-semibold"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Selesai
                            </Badge>
                          )}
                          {job.status === "rendering" && (
                            <Badge
                              variant="outline"
                              className="text-[#8A6A2F] border-[#E8D9BC] text-[10px] gap-1 font-semibold"
                            >
                              <Loader2 className="w-3 h-3 animate-spin" />{" "}
                              {activeTask?.task_type === "render" &&
                              (!activeTask.data?.job_id || activeTask.data?.job_id === job.id)
                                ? `${activeTask.progress}%`
                                : `${job.progress}%`}
                            </Badge>
                          )}
                          {job.status === "queued" && (
                            <Badge variant="secondary" className="text-[10px]">
                              Dalam Antrean
                            </Badge>
                          )}
                          {job.status === "failed" && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] gap-1 font-semibold"
                            >
                              <AlertCircle className="w-3 h-3" /> Gagal
                            </Badge>
                          )}

                          {/* Cancel in-flight render job */}
                          {(job.status === "rendering" || job.status === "queued") && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelJobMutation.mutate(job.id)}
                              disabled={
                                cancelJobMutation.isPending &&
                                cancelJobMutation.variables === job.id
                              }
                              className="h-7 gap-1 px-2 text-[10px] font-semibold"
                              title="Batalkan proses render video ini"
                            >
                              {cancelJobMutation.isPending &&
                              cancelJobMutation.variables === job.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <StopCircle className="w-2.5 h-2.5" />
                              )}
                              <span>Batalkan</span>
                            </Button>
                          )}

                          {/* Delete Single Job Action */}
                          {confirmDeleteJobId === job.id ? (
                            <div className="flex items-center gap-1 bg-destructive/10 border border-destructive/30 px-1.5 py-0.5 rounded ml-1">
                              <span className="text-[10px] text-destructive">Hapus?</span>
                              <button
                                onClick={() => deleteJobMutation.mutate(job.id)}
                                disabled={deleteJobMutation.isPending}
                                className="flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-destructive-foreground transition disabled:opacity-50"
                              >
                                {deleteJobMutation.isPending &&
                                deleteJobMutation.variables === job.id ? (
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                ) : (
                                  "Ya"
                                )}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteJobId(null)}
                                className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-[9px] transition"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmDeleteJobId(job.id)}
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              title="Hapus riwayat render ini"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
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
                              <div className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-muted">
                                <div
                                  className="bg-primary h-full transition-all duration-300 rounded-full"
                                  style={{ width: `${currentProgress}%` }}
                                />
                              </div>
                            )}

                            {currentLog && (
                              <p className="text-[11px] text-muted-foreground italic font-mono truncate">
                                {currentLog}
                              </p>
                            )}
                          </>
                        );
                      })()}

                      {job.status === "completed" && job.output_url && (
                        <div className="flex items-center gap-3 border-t border-border pt-2.5">
                          {/* Video Thumbnail Preview */}
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewModalVideo({
                                url: job.output_url!,
                                title: `Hasil Render ${job.render_type.toUpperCase()} (${job.id.slice(0, 8)})`,
                                poster: job.thumbnail_url,
                              })
                            }
                            className="group relative h-28 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border bg-black shadow-sm transition hover:border-primary/60 focus:outline-none"
                            title="Klik untuk pratinjau video hasil render"
                          >
                            {job.thumbnail_url ? (
                              <img
                                src={job.thumbnail_url}
                                alt={`Thumbnail ${job.id}`}
                                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center bg-background p-1 text-center text-muted-foreground">
                                <Film className="w-5 h-5 text-muted-foreground/60 mb-1" />
                                <span className="text-[9px] leading-tight font-medium">
                                  Video Siap
                                </span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition flex items-center justify-center">
                              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md group-hover:scale-110 transition">
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                              </div>
                            </div>
                            <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[8px] font-mono text-white/90">
                              MP4
                            </div>
                          </button>

                          {/* Details & Actions */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch py-0.5">
                            <div className="space-y-1">
                              <div className="text-[11px] font-medium text-foreground truncate">
                                File video MP4 berhasil dirender & siap dipakai
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                {job.output_url.split("/").pop()}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() =>
                                  setPreviewModalVideo({
                                    url: job.output_url!,
                                    title: `Hasil Render ${job.render_type.toUpperCase()} (${job.id.slice(0, 8)})`,
                                    poster: job.thumbnail_url,
                                  })
                                }
                                className="h-7 gap-1 border-border text-[11px] text-foreground hover:border-primary/50"
                              >
                                <Play className="w-3 h-3 text-primary fill-primary" />
                                <span>Putar Video</span>
                              </Button>
                              <Button
                                variant="workspace-primary"
                                size="xs"
                                asChild
                                className="gap-1.5 font-semibold text-[11px] h-7"
                              >
                                <a
                                  href={`/api/v1/projects/${project.id}/render/download/${job.id}`}
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Download MP4</span>
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionPanel>
          </div>

          {/* Video Preview Modal */}
          {previewModalVideo && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4 backdrop-blur-sm"
              onClick={() => setPreviewModalVideo(null)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-lg animate-in flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Film className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-semibold text-foreground truncate">
                      {previewModalVideo.title}
                    </h4>
                  </div>
                  <button
                    onClick={() => setPreviewModalVideo(null)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-4 flex items-center justify-center bg-black">
                  <video
                    src={previewModalVideo.url}
                    poster={previewModalVideo.poster || undefined}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[65vh] w-auto rounded-lg shadow-lg"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-border bg-muted p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewModalVideo(null)}
                    className="h-8 border-border text-xs"
                  >
                    Tutup
                  </Button>
                  <Button
                    variant="workspace-primary"
                    size="sm"
                    asChild
                    className="h-8 gap-1.5 text-xs"
                  >
                    <a href={previewModalVideo.url} download>
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

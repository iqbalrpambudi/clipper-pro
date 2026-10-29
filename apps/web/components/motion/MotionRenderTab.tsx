"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Play,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  HardDrive,
  StopCircle,
  Code2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import type { MotionScene, Project, RenderJob } from "@/types";
import { getMotionTheme } from "@/lib/motion";
import { Button, Switch } from "@/components/ui";
import { StudioTabHeader } from "@/components/layout/StudioTabHeader";

interface MotionRenderTabProps {
  project: Project;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function MotionRenderTab({ project }: MotionRenderTabProps) {
  const queryClient = useQueryClient();
  const { showToast, activeTask, setActiveTask, setActiveTab } = useStudioStore();

  const [resolution, setResolution] = useState(project.resolution || "1080p");
  const [activePlaybackUrl, setActivePlaybackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (project.resolution) {
      setResolution(project.resolution);
    }
  }, [project.resolution]);

  const updateProjectMutation = useMutation({
    mutationFn: (data: Partial<Pick<Project, "resolution">>) =>
      api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const audio = project.audio || project.audio_track;
  const scenes: MotionScene[] = useMemo(() => {
    const raw = project.motion_scenes || [];
    return [...raw].sort((a, b) => a.order_index - b.order_index);
  }, [project.motion_scenes]);

  const readyScenesCount = useMemo(
    () => scenes.filter((s) => s.status === "ready" && Boolean(s.component_code)).length,
    [scenes]
  );

  const totalFrames = useMemo(
    () => scenes.reduce((acc, s) => acc + Math.max(45, s.duration_frames || 120), 0),
    [scenes]
  );

  const themeObj = useMemo(() => {
    const ws = project.world_setting as Record<string, unknown> | null | undefined;
    const id = typeof ws?.motion_theme === "string" ? ws.motion_theme : "claude_editorial";
    return getMotionTheme(id);
  }, [project.world_setting]);

  const safeProjectFilename = useMemo(() => {
    const raw = (project?.name || "motion_graphic").trim();
    const cleaned = raw.replace(/[\\/*?:"<>|]/g, "").replace(/\s+/g, " ").trim();
    return (cleaned || `motion_${project?.id?.slice(0, 8) || "export"}`) + ".mp4";
  }, [project?.name, project?.id]);

  const { data: renderJobs = [] } = useQuery({
    queryKey: ["render-jobs", project.id],
    queryFn: () => api.getRenderJobs(project.id),
    initialData: project.render_jobs || [],
    refetchInterval: (query) => {
      const data = query.state.data;
      const isRunning = data?.some(
        (j: RenderJob) => j.status === "rendering" || j.status === "queued"
      );
      return isRunning ? 2000 : false;
    },
  });

  const renderFinalMutation = useMutation({
    mutationFn: () => api.renderFinal(project.id, { resolution }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["render-jobs", project.id] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast(
        `Proses render deterministik Motion Graphic (${resolution}) dimulai di background!`,
        "info"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai render motion graphic", "error");
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => api.deleteRenderJob(project.id, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["render-jobs", project.id] });
      showToast("File render berhasil dihapus.", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menghapus file render", "error");
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => api.cancelRenderJob(project.id, jobId),
    onSuccess: () => {
      setActiveTask(null, project.id);
      queryClient.invalidateQueries({ queryKey: ["render-jobs", project.id] });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Rendering motion graphic dibatalkan.", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membatalkan render", "error");
    },
  });

  const activeRenderJob = renderJobs.find(
    (j) => j.status === "rendering" || j.status === "queued"
  );
  const isRendering =
    Boolean(activeRenderJob) ||
    (activeTask?.task_type === "render" &&
      (activeTask.status === "progress" || activeTask.status === "queued"));

  const aspectRatio = project.aspect_ratio || "16:9";
  const videoAspectClass =
    aspectRatio === "9:16"
      ? "aspect-[9/16] max-h-[520px] mx-auto"
      : aspectRatio === "1:1"
        ? "aspect-square max-h-[480px] mx-auto"
        : "aspect-video w-full";

  return (
    <div className="flex w-full flex-1 flex-col">
      <StudioTabHeader
        icon={Download}
        title="Render & Export Motion Graphic MP4"
        badge="Langkah 4 • Render MP4"
        secondaryBadge={`${aspectRatio} • ${resolution.toUpperCase()} • 30 FPS`}
        description="Render frame-demi-frame deterministik melalui Headless Chromium CDP + FFmpeg H.264 lengkap dengan voiceover."
        actions={
          <Button
            size="workspace-sm"
            onClick={() => setActiveTab("motion_studio")}
            variant="workspace-secondary"
            className="gap-1.5 text-xs"
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Kembali ke Motion Studio</span>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-5 pb-16 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left Column: Render Configuration & Specs */}
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-accent text-accent-foreground">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Konfigurasi Render Motion Final
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Chromium CDP Parallel Frame Capture • H.264 MP4
                </p>
              </div>
            </div>

            {/* Readiness Specs */}
            <div className="space-y-2 rounded-xl border border-border bg-muted/45 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Format Kanvas:</span>
                <span className="font-mono font-semibold tabular-nums text-primary">
                  {aspectRatio} @ 30 FPS
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tema Art Direction:</span>
                <span className="font-semibold text-foreground">{themeObj.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total Durasi & Frame:</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {Math.round((totalFrames / 30) * 10) / 10} dtk ({totalFrames} frame)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Komponen TSX Kustom:</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {readyScenesCount} / {scenes.length} Siap
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Voiceover Audio:</span>
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {audio?.duration
                    ? `${Math.round(audio.duration * 10) / 10} detik`
                    : "Visual Murni (Tanpa Audio)"}
                </span>
              </div>
            </div>

            {/* Optional Subtitle Overlay Switch */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/45 p-3.5 text-xs">
              <div>
                <div className="font-semibold text-foreground">
                  Overlay Subtitle Burn-in Tambahan
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Nonaktif secara bawaan agar tidak menumpuk di atas tipografi kinetik.
                </div>
              </div>
              <Switch
                checked={Boolean(project.subtitle_style?.enabled)}
                onCheckedChange={async (checked) => {
                  await api.updateSubtitleStyle(project.id, {
                    ...(project.subtitle_style || {}),
                    enabled: checked,
                  });
                  queryClient.invalidateQueries({ queryKey: ["project", project.id] });
                  showToast(
                    checked
                      ? "Subtitle tambahan diaktifkan untuk render."
                      : "Subtitle tambahan dinonaktifkan.",
                    "info"
                  );
                }}
              />
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Resolusi Output MP4
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    id: "1080p",
                    label: "1080p (Full HD)",
                    desc: "Vektor tajam maksimal untuk publikasi final",
                  },
                  {
                    id: "720p",
                    label: "720p (Fast HD)",
                    desc: "Render ~2,2× lebih cepat untuk review draft",
                  },
                ].map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      setResolution(res.id);
                      updateProjectMutation.mutate({ resolution: res.id });
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      resolution === res.id
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="font-mono text-xs font-bold tabular-nums">{res.label}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{res.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Render Action Button */}
            <div className="space-y-2.5 pt-1">
              <Button
                type="button"
                onClick={() => renderFinalMutation.mutate()}
                disabled={isRendering || renderFinalMutation.isPending || scenes.length === 0}
                variant="workspace-primary"
                className="w-full gap-2 py-3 text-xs"
              >
                {isRendering || renderFinalMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Me-render Motion Graphic ({resolution})...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Render Motion Graphic MP4 ({resolution.toUpperCase()})</span>
                  </>
                )}
              </Button>

              {scenes.length > 0 && readyScenesCount < scenes.length && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Catatan: {scenes.length - readyScenesCount} adegan belum disintesis TSX kustom
                  dan akan dirender menggunakan koreografi dinamis bawaan.
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Live Progress, Video Player & Export History */}
          <div className="space-y-6 lg:col-span-7">
            {isRendering && (
              <div className="space-y-4 rounded-2xl border border-primary/30 bg-accent/60 p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <h3 className="font-mono text-xs font-bold tabular-nums text-foreground">
                      Me-render Frame Remotion via Chromium CDP (
                      {activeTask?.task_type === "render" && activeTask.progress !== undefined
                        ? activeTask.progress
                        : activeRenderJob?.progress || 8}
                      %)
                    </h3>
                  </div>
                  {activeRenderJob && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelJobMutation.mutate(activeRenderJob.id)}
                      disabled={cancelJobMutation.isPending}
                      className="h-7 gap-1 text-xs text-accent-foreground hover:text-destructive"
                    >
                      {cancelJobMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <StopCircle className="h-3.5 w-3.5" />
                      )}
                      <span>Batalkan</span>
                    </Button>
                  )}
                </div>

                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        5,
                        activeTask?.task_type === "render" && activeTask.progress !== undefined
                          ? activeTask.progress
                          : activeRenderJob?.progress || 8
                      )}%`,
                    }}
                  />
                </div>

                <p className="font-mono text-xs text-muted-foreground">
                  {(activeTask?.task_type === "render" && activeTask.message) ||
                    activeRenderJob?.log_output ||
                    "Menangkap frame vektor Remotion secara paralel dan menggabungkan audio H.264..."}
                </p>
              </div>
            )}

            {activePlaybackUrl && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    Pratinjau Hasil Render MP4
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePlaybackUrl(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Tutup
                  </button>
                </div>
                <video
                  src={activePlaybackUrl}
                  controls
                  autoPlay
                  className={`rounded-xl border border-border bg-black ${videoAspectClass}`}
                />
              </div>
            )}

            <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold text-foreground">
                    Riwayat Export MP4 ({renderJobs.length})
                  </h3>
                </div>
              </div>

              {renderJobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Belum ada file MP4 yang dirender untuk project Motion Studio ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {renderJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-muted/25 p-4 transition hover:border-primary/40 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        {job.status === "completed" ? (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>
                        ) : job.status === "rendering" || job.status === "queued" ? (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                            <Loader2 className="h-5 w-5 animate-spin" />
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
                            <AlertCircle className="h-5 w-5" />
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">
                              Motion Graphic ({aspectRatio})
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                                job.status === "completed"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-accent text-accent-foreground"
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                            Ukuran: {formatBytes(job.file_size_bytes)} •{" "}
                            {new Date(job.created_at).toLocaleString("id-ID")}
                          </p>
                          {job.status === "failed" && job.error_message && (
                            <p className="mt-1 max-w-md text-[11px] text-destructive">
                              {job.error_message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {(job.status === "rendering" || job.status === "queued") && (
                          <Button
                            variant="workspace-secondary"
                            size="workspace-sm"
                            onClick={() => cancelJobMutation.mutate(job.id)}
                            disabled={
                              cancelJobMutation.isPending && cancelJobMutation.variables === job.id
                            }
                            className="gap-1.5 text-xs text-destructive"
                          >
                            <StopCircle className="h-3.5 w-3.5" />
                            <span>Batalkan</span>
                          </Button>
                        )}

                        {job.status === "completed" && job.output_url && (
                          <>
                            <Button
                              size="workspace-sm"
                              onClick={() => setActivePlaybackUrl(job.output_url!)}
                              variant="workspace-secondary"
                              className="gap-1.5 text-xs"
                            >
                              <Play className="h-3.5 w-3.5 text-primary" />
                              <span>Putar</span>
                            </Button>

                            <a
                              href={`/api/v1/projects/${project.id}/render/download/${job.id}`}
                              download={safeProjectFilename}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Unduh MP4</span>
                            </a>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteJobMutation.mutate(job.id)}
                          className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          title="Hapus riwayat render"
                          aria-label="Hapus riwayat render"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Youtube,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, RenderJob, StoryboardItem } from "@/types";
import { Button, Badge } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";

interface StoryboardRenderTabProps {
  project: Project;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function StoryboardRenderTab({ project }: StoryboardRenderTabProps) {
  const queryClient = useQueryClient();
  const { showToast, activeTask, setActiveTask, setActiveTab } = useStudioStore();

  const [resolution, setResolution] = useState(project.resolution || "1080p");
  const [activePlaybackUrl, setActivePlaybackUrl] = useState<string | null>(null);

  // Sync local resolution state if project.resolution updates
  useEffect(() => {
    if (project.resolution) {
      setResolution(project.resolution);
    }
  }, [project.resolution]);

  const updateProjectMutation = useMutation({
    mutationFn: (data: Partial<Pick<Project, "resolution">>) => api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const audio = project.audio || project.audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const readyItemsCount = items.filter((it) => it.status === "ready" && it.image_url).length;

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
      showToast(`Proses render video 16:9 (${resolution}) dimulai di background!`, "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai render video", "error");
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
      showToast("Rendering video berhasil dibatalkan.", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membatalkan render", "error");
    },
  });

  const activeRenderJob = renderJobs.find((j) => j.status === "rendering" || j.status === "queued");
  const isRendering =
    Boolean(activeRenderJob) ||
    (activeTask?.task_type === "render" &&
      (activeTask.status === "progress" || activeTask.status === "queued"));

  return (
    <div className="flex-1 flex flex-col w-full">
      {/* Step Header */}
      <StoryboardTabHeader
        icon={Download}
        title="Render & Export Video 16:9"
        badge="Langkah 5 • Render"
        secondaryBadge="Full HD 1080p"
        description="Susun gambar ilustrasi dengan Ken Burns dinamis, audio narasi, dan subtitle ASS ke MP4 Full HD."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_timeline")}
              variant="workspace-secondary"
              className="h-9 text-xs"
            >
              Kembali ke Timeline Studio
            </Button>

            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_youtube")}
              variant="workspace-primary"
              className="h-9 gap-1.5 text-xs"
            >
              <Youtube className="w-3.5 h-3.5 fill-current" />
              <span>Lanjut ke YouTube & Thumbnail</span>
              <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-5 pb-16 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Render Settings & CTA (5 Cols) */}
          <div className="space-y-6 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6 shadow-sm lg:col-span-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#26251F]">Pengaturan Render Final</h3>
                <p className="text-[11px] text-muted-foreground">Format 16:9 Landscape Full HD</p>
              </div>
            </div>

            {/* Video Specs Checklist */}
            <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5 text-xs">
              <div className="flex items-center justify-between text-[#4D4A42]">
                <span>Aspect Ratio:</span>
                <span className="font-mono font-bold text-[#C45B3A]">16:9 (Landscape)</span>
              </div>
              <div className="flex items-center justify-between text-[#4D4A42]">
                <span>Durasi Audio:</span>
                <span className="font-mono font-semibold text-[#26251F]">
                  {audio?.duration ? `${Math.round(audio.duration)} detik` : "Belum ada audio"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#4D4A42]">
                <span>Kesiapan Gambar:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {readyItemsCount} dari {items.length} Siap
                </span>
              </div>
              <div className="flex items-center justify-between text-[#4D4A42]">
                <span>Efek Transisi:</span>
                <span className="font-mono font-semibold text-[#26251F]">Ken Burns Zoom/Pan</span>
              </div>
              <div className="flex items-center justify-between border-t border-[#E5E1D7] pt-1 text-[#4D4A42]">
                <span>Status Subtitle:</span>
                <span
                  className={`font-mono font-bold ${project.subtitle_style?.enabled !== false ? "text-[#C45B3A]" : "text-amber-400"}`}
                >
                  {project.subtitle_style?.enabled !== false
                    ? "Aktif (Burn-in)"
                    : "Nonaktif (Tanpa Subtitle)"}
                </span>
              </div>
            </div>

            {/* Subtitle Option Toggle Checklist */}
            <div className="flex items-center justify-between rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5 text-xs">
              <label
                htmlFor="render-subtitles-toggle"
                className="flex items-center gap-2.5 cursor-pointer select-none"
              >
                <input
                  id="render-subtitles-toggle"
                  type="checkbox"
                  checked={project.subtitle_style?.enabled !== false}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    await api.updateSubtitleStyle(project.id, {
                      ...(project.subtitle_style || {}),
                      enabled: checked,
                    });
                    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
                    showToast(
                      checked
                        ? "Subtitle diaktifkan untuk render."
                        : "Subtitle dinonaktifkan (render tanpa subtitle).",
                      "info"
                    );
                  }}
                  className="w-4 h-4 rounded accent-[#C45B3A] cursor-pointer"
                />
                <span className="font-semibold text-[#26251F]">
                  Sertakan Subtitle pada Render Video
                </span>
              </label>
              <Badge
                variant={project.subtitle_style?.enabled !== false ? "default" : "secondary"}
                className={`text-[10px] font-mono ${
                  project.subtitle_style?.enabled !== false
                    ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
                    : "bg-[#F1EEE6] text-[#77766D] border border-[#E5E1D7]"
                }`}
              >
                {project.subtitle_style?.enabled !== false ? "AKTIF" : "NONAKTIF"}
              </Badge>
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
                Resolusi Video
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "1080p", label: "1080p (Full HD)", desc: "1920 × 1080 • Kualitas Terbaik" },
                  {
                    id: "720p",
                    label: "720p (HD)",
                    desc: "1280 × 720 • Render Cepat (2.5x lebih cepat)",
                  },
                ].map((res) => (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      setResolution(res.id);
                      updateProjectMutation.mutate({ resolution: res.id });
                    }}
                    className={`p-3 rounded-xl border text-left transition ${
                      resolution === res.id
                        ? "bg-[#F8EEEA] border-[#E9C9BD] text-[#A9472C]"
                        : "bg-[#FBFAF7] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                    }`}
                  >
                    <div className="text-xs font-bold">{res.label}</div>
                    <div className="text-[10px] text-muted-foreground">{res.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Render CTA */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={() => renderFinalMutation.mutate()}
                disabled={isRendering || renderFinalMutation.isPending || !audio}
                variant="workspace-primary"
                className="w-full gap-2 py-3 text-xs"
              >
                {isRendering || renderFinalMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sedang Me-render Video Final 16:9 ({resolution})...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Render Video Storyboard 16:9 ({resolution.toUpperCase()})</span>
                  </>
                )}
              </Button>

              {!audio && (
                <p className="text-[11px] text-amber-400/90 text-center">
                  ⚠ Harap generate suara narasi (TTS) terlebih dahulu pada Langkah 2 sebelum
                  me-render.
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Active Jobs & Render History (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Active Job Live Progress */}
            {isRendering && (
              <div className="p-5 rounded-2xl border border-[#E9C9BD] bg-[#F8EEEA] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-[#C45B3A] animate-spin" />
                    <h4 className="text-xs font-bold text-[#26251F] font-mono">
                      Sedang Me-render Video Final (
                      {activeTask?.task_type === "render" && activeTask.progress !== undefined
                        ? activeTask.progress
                        : activeRenderJob?.progress || 10}
                      %)
                    </h4>
                  </div>
                  {activeRenderJob && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => cancelJobMutation.mutate(activeRenderJob.id)}
                      disabled={cancelJobMutation.isPending}
                      className="text-rose-400 hover:text-rose-300 text-xs h-7 gap-1"
                    >
                      {cancelJobMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <StopCircle className="w-3.5 h-3.5" />
                      )}
                      <span>Batalkan Render</span>
                    </Button>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#E5E1D7] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-[#C45B3A] to-[#D4765E] h-full transition-all duration-300"
                    style={{
                      width: `${Math.max(
                        5,
                        activeTask?.task_type === "render" && activeTask.progress !== undefined
                          ? activeTask.progress
                          : activeRenderJob?.progress || 10
                      )}%`,
                    }}
                  />
                </div>

                <p className="text-xs text-muted-foreground font-mono">
                  {(activeTask?.task_type === "render" && activeTask.message) ||
                    activeRenderJob?.log_output ||
                    "FFmpeg sedang menggabungkan ilustrasi hand-drawn, audio, dan subtitle..."}
                </p>
              </div>
            )}

            {/* Video Player for Selected Output */}
            {activePlaybackUrl && (
              <div className="space-y-3 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#26251F]">
                    Pemutar Hasil Render Final
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePlaybackUrl(null)}
                    className="text-xs text-[#77766D] hover:text-[#26251F]"
                  >
                    Tutup
                  </button>
                </div>
                <video
                  src={activePlaybackUrl}
                  controls
                  autoPlay
                  className="w-full aspect-video rounded-xl border border-[#E5E1D7] bg-[#F1EEE6]"
                />
              </div>
            )}

            {/* Render History List */}
            <div className="space-y-4 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6">
              <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#C45B3A]" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#26251F]">
                    Riwayat File Render ({renderJobs.length})
                  </h4>
                </div>
              </div>

              {renderJobs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#77766D]">
                  Belum ada video yang dirender untuk project ini. Klik tombol render di samping
                  untuk memulai.
                </div>
              ) : (
                <div className="space-y-3">
                  {renderJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] p-4 transition hover:border-[#C45B3A] sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-3">
                        {job.status === "completed" ? (
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                            <CheckCircle2 className="w-5 h-5" />
                          </div>
                        ) : job.status === "rendering" || job.status === "queued" ? (
                          <div className="w-10 h-10 rounded-xl bg-[#F8EEEA] flex items-center justify-center text-[#C45B3A] shrink-0">
                            <Loader2 className="w-5 h-5 animate-spin" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0">
                            <AlertCircle className="w-5 h-5" />
                          </div>
                        )}

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#26251F]">
                              Video Storyboard 16:9
                            </span>
                            <span
                              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                job.status === "completed"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : job.status === "rendering"
                                    ? "bg-[#F8EEEA] text-[#A9472C]"
                                    : "bg-rose-500/10 text-rose-400"
                              }`}
                            >
                              {job.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                            Ukuran: {formatBytes(job.file_size_bytes)} •{" "}
                            {new Date(job.created_at).toLocaleString("id-ID")}
                          </p>
                          {job.status === "failed" && job.error_message && (
                            <p className="text-[11px] text-rose-400/90 mt-1 max-w-md">
                              {job.error_message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(job.status === "rendering" || job.status === "queued") && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelJobMutation.mutate(job.id)}
                            disabled={
                              cancelJobMutation.isPending && cancelJobMutation.variables === job.id
                            }
                            className="h-8 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5 px-3 font-semibold shadow-sm"
                            title="Batalkan proses render ini"
                          >
                            {cancelJobMutation.isPending &&
                            cancelJobMutation.variables === job.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <StopCircle className="w-3.5 h-3.5" />
                            )}
                            <span>Batalkan</span>
                          </Button>
                        )}

                        {job.status === "completed" && job.output_url && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => setActivePlaybackUrl(job.output_url!)}
                              variant="workspace-secondary"
                              className="h-9 gap-1.5 text-xs"
                            >
                              <Play className="w-3.5 h-3.5 text-[#C45B3A]" />
                              <span>Putar</span>
                            </Button>

                            <a
                              href={job.output_url}
                              download={`storyboard_${project.id}.mp4`}
                              className="flex items-center gap-1.5 rounded-lg bg-[#C45B3A] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#A9472C]"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Unduh MP4</span>
                            </a>

                            <Button
                              size="sm"
                              onClick={() => setActiveTab("storyboard_youtube")}
                              className="bg-red-600/90 hover:bg-red-500 text-white text-xs h-8 gap-1.5 font-semibold"
                            >
                              <Youtube className="w-3.5 h-3.5 fill-current" />
                              <span>YouTube & Thumbnail</span>
                            </Button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => deleteJobMutation.mutate(job.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                          title="Hapus riwayat render"
                        >
                          <Trash2 className="w-4 h-4" />
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

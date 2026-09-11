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

export function RenderTab({ project }: RenderTabProps) {
  const queryClient = useQueryClient();
  const { showToast, activeTask } = useStudioStore();

  const [bgMode, setBgMode] = useState(project.background_fill?.mode || "blur");
  const [resolution, setResolution] = useState(project.resolution || "1080p");

  const { data: renderJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["render-jobs", project.id],
    queryFn: () => api.getRenderJobs(project.id),
    staleTime: 5000,
    refetchInterval: (query) => {
      const jobs = query.state.data || [];
      const hasActiveJob = jobs.some(
        (j: any) =>
          j.status === "pending" ||
          j.status === "processing" ||
          j.status === "rendering" ||
          j.status === "queued"
      );
      return hasActiveJob ? 1500 : false;
    },
  });


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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Interactive WYSIWYG Vertical Video Player */}
      <div className="lg:col-span-5 flex flex-col items-center">
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Film className="w-4 h-4 text-brand-400" />
          WYSIWYG Preview Player (9:16)
        </h3>
        <PreviewPlayer project={project} />
      </div>

      {/* Right Column: Render Controls & History */}
      <div className="lg:col-span-7 space-y-6">
        {/* Render Settings Card */}
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-yellow" />
            <h4 className="text-sm font-bold text-white">Pengaturan Rendering Final</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Background Fill Mode
              </label>
              <select
                value={bgMode}
                onChange={(e) => {
                  setBgMode(e.target.value as any);
                  updateProjectMutation.mutate({
                    background_fill: { mode: e.target.value, color: "#000000" },
                  });
                }}
                className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="blur">Blurred Background (Disarankan)</option>
                <option value="black">Solid Black Letterbox</option>
              </select>
            </div>

            <div>
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
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-emerald-400" />
              Riwayat Render & File Siap Download ({renderJobs.length})
            </h4>
            <button
              onClick={() => refetchJobs()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white uppercase tracking-wider text-[10px] px-2 py-0.5 rounded bg-surface-card border border-surface-border">
                        {job.render_type}
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        ID: {job.id.slice(0, 8)}
                      </span>
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

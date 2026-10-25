"use client";

import React, { useState } from "react";
import {
  Youtube,
  Film,
  Volume2,
  Download,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Mic,
  StopCircle,
  Layers,
} from "lucide-react";
import { useStudioStore, TaskEvent } from "@/lib/store";
import { Badge } from "@/components/ui";
import { api } from "@/lib/api";

interface GlobalTaskIndicatorProps {
  projectId?: string;
}

export function GlobalTaskIndicator({ projectId }: GlobalTaskIndicatorProps) {
  const { activeTask, tasksByProject, currentProjectId, setActiveTask, showToast } =
    useStudioStore();

  const [showDetails, setShowDetails] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Resolve the task scoped to the active project
  const targetProjectId = projectId || currentProjectId;
  const currentTask = targetProjectId
    ? (tasksByProject[targetProjectId] ??
      (activeTask?.project_id === targetProjectId ? activeTask : null))
    : activeTask;

  // Check if there are background tasks running in other projects
  const otherProjectsCount = Object.entries(tasksByProject).filter(
    ([pId, t]) => pId !== targetProjectId && t && (t.status === "progress" || t.status === "queued")
  ).length;

  if (!currentTask) {
    if (otherProjectsCount > 0) {
      return (
        <div className="fixed bottom-5 left-3 right-3 z-50 animate-scale-pop pointer-events-auto sm:left-auto sm:right-5">
          <div className="flex items-center gap-2 rounded-full border border-[#E5E1D7] dark:border-border bg-[#FBFAF7]/95 dark:bg-card/95 px-3 py-1.5 font-mono text-xs text-[#77766D] dark:text-muted-foreground shadow-lg backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#76816B]" />
            <span className="font-sans text-[11px] font-medium text-[#26251F] dark:text-foreground">
              {otherProjectsCount} worker aktif di project lain
            </span>
          </div>
        </div>
      );
    }
    return null;
  }

  const isActive = currentTask.status === "progress" || currentTask.status === "queued";
  const isError = currentTask.status === "error";
  const isSuccess = currentTask.status === "success";

  const handleCancel = async () => {
    if (!currentTask || isCancelling) return;
    setIsCancelling(true);
    try {
      const vidId =
        typeof currentTask.data?.video_id === "string" ? currentTask.data.video_id : undefined;
      const jobId =
        typeof currentTask.data?.job_id === "string" ? currentTask.data.job_id : undefined;
      if (currentTask.task_type === "youtube_download" && vidId) {
        await api.cancelMedia(currentTask.project_id, vidId);
      } else if (currentTask.task_type === "render" && jobId) {
        await api.cancelRenderJob(currentTask.project_id, jobId);
      } else {
        await api.cancelProjectTasks(currentTask.project_id);
      }
      showToast("Sinyal pembatalan dikirim ke worker...", "info");
    } catch (err: unknown) {
      console.error("Gagal membatalkan task:", err);
      showToast(err instanceof Error ? err.message : "Gagal membatalkan task", "error");
    } finally {
      setIsCancelling(false);
    }
  };

  const getTaskMeta = (type: TaskEvent["task_type"]) => {
    switch (type) {
      case "youtube_download":
        return {
          label: "Download YouTube",
          icon: Youtube,
          badgeColor: "text-[#A9472C] border-[#E9C9BD] bg-[#F8EEEA]",
        };
      case "scene_detect":
        return {
          label: "Deteksi Visual AI",
          icon: Film,
          badgeColor: "text-[#A9472C] border-[#E9C9BD] bg-[#F8EEEA]",
        };
      case "scene_retag":
        return {
          label: "Tagging Visual AI",
          icon: Sparkles,
          badgeColor: "text-[#8A6A2F] border-[#E8D9BC] bg-[#F7EFE0]",
        };
      case "scene_transcribe":
        return {
          label: "Transkripsi Dialog",
          icon: Mic,
          badgeColor: "text-[#41627F] border-[#CFDDE9] bg-[#EAF0F5]",
        };
      case "tts_align":
        return {
          label: "Suara & Alignment",
          icon: Volume2,
          badgeColor: "text-[#A9472C] border-[#E9C9BD] bg-[#F8EEEA]",
        };
      case "render":
        return {
          label: "Render Video FFmpeg",
          icon: Download,
          badgeColor: "text-[#456A4E] border-[#C9DDCF] bg-[#ECF3EB]",
        };
      default:
        return {
          label: "Worker Task",
          icon: Sparkles,
          badgeColor: "text-[#456A4E] border-[#C9DDCF] bg-[#ECF3EB]",
        };
    }
  };

  const meta = getTaskMeta(currentTask.task_type);
  const IconComponent = meta.icon;

  if (isMinimized) {
    return (
      <div className="fixed bottom-5 left-3 right-3 z-50 flex items-center justify-end gap-1.5 animate-scale-pop pointer-events-auto sm:left-auto sm:right-5">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 rounded-full border border-[#E5E1D7] dark:border-border bg-[#FBFAF7]/95 dark:bg-card/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md transition-all hover:scale-[1.02] hover:border-[#C45B3A]/40 dark:hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title="Klik untuk membuka detail task"
          aria-label={`Buka detail ${meta.label}, progres ${currentTask.progress}%`}
        >
          {isError ? (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#A9472C] dark:text-rose-400" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#456A4E] dark:text-emerald-400" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#A9472C] dark:text-primary" />
          )}
          <span className="font-medium tracking-tight text-[#26251F] dark:text-foreground">{meta.label}</span>
          <span className="font-mono text-[11px] font-bold text-[#A9472C] dark:text-primary">
            {currentTask.progress}%
          </span>
        </button>

        {isActive && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E9C9BD] dark:border-destructive/30 bg-[#F8EEEA] dark:bg-destructive/20 text-[#A9472C] dark:text-rose-400 shadow-lg transition hover:scale-105 hover:bg-[#F3E1D9] dark:hover:bg-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            title="Batalkan proses worker"
            aria-label="Batalkan proses worker"
          >
            {isCancelling ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <StopCircle className="w-3 h-3" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 left-3 right-3 z-50 mx-auto w-auto animate-scale-pop pointer-events-auto sm:left-auto sm:right-5 sm:mx-0 sm:w-full sm:max-w-xs md:max-w-md">
      <div
        className={`relative overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          isError
            ? "border-[#E9C9BD] dark:border-rose-800/40 bg-[#F8EEEA] dark:bg-rose-950/60 shadow-[#A9472C]/20"
            : isSuccess
              ? "border-[#C9DDCF] dark:border-emerald-800/40 bg-[#ECF3EB] dark:bg-emerald-950/60 shadow-[#456A4E]/20"
              : "border-[#E5E1D7] dark:border-border bg-[#FBFAF7]/95 dark:bg-card/95 shadow-black/10 dark:shadow-black/40"
        }`}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                isError
                  ? "border-[#E9C9BD] dark:border-rose-800/40 bg-[#F8EEEA] dark:bg-rose-950/60 text-[#A9472C] dark:text-rose-400"
                  : isSuccess
                    ? "border-[#C9DDCF] dark:border-emerald-800/40 bg-white dark:bg-card text-[#456A4E] dark:text-emerald-400"
                    : "border-[#E9C9BD] dark:border-primary/30 bg-[#F8EEEA] dark:bg-primary/15 text-[#A9472C] dark:text-primary"
              }`}
            >
              {isError ? (
                <AlertCircle className="h-4 w-4 text-[#A9472C] dark:text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="h-4 w-4 text-[#456A4E] dark:text-emerald-400" />
              ) : (
                <IconComponent className="h-4 w-4 animate-pulse text-[#A9472C] dark:text-primary" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${meta.badgeColor}`}
                >
                  {meta.label}
                </span>

                {isActive && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#A9472C] dark:text-primary">
                    <Loader2 className="h-3 w-3 animate-spin text-[#A9472C] dark:text-primary" />
                    <span>{currentTask.progress}%</span>
                  </span>
                )}
                {isSuccess && (
                  <Badge variant="workspace-success" className="px-1.5 py-0 text-[9px]">
                    Selesai
                  </Badge>
                )}
                {isError && (
                  <Badge variant="destructive" className="text-[9px] py-0 px-1.5">
                    Gagal
                  </Badge>
                )}
              </div>

              {/* Message text */}
              <p
                className="mt-0.5 truncate text-xs font-medium text-[#26251F] dark:text-foreground"
                title={currentTask.message || ""}
              >
                {currentTask.message || "Memproses background task..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isActive && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[#E9C9BD] dark:border-destructive/30 bg-[#F8EEEA] dark:bg-destructive/20 px-2 text-[10px] font-medium text-[#A9472C] dark:text-rose-400 transition-colors hover:bg-[#F3E1D9] dark:hover:bg-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                title="Batalkan proses worker ini"
                aria-label="Batalkan proses worker ini"
              >
                {isCancelling ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <StopCircle className="w-2.5 h-2.5" />
                )}
                <span>Batal</span>
              </button>
            )}

            {currentTask.error && (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex h-8 items-center gap-1 rounded-lg border border-[#E9C9BD] dark:border-destructive/30 bg-[#F8EEEA] dark:bg-destructive/20 px-2 text-[10px] font-medium text-[#A9472C] dark:text-rose-400 transition-colors hover:bg-[#F3E1D9] dark:hover:bg-destructive/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={showDetails ? "Sembunyikan detail error" : "Lihat detail error"}
              >
                <span>Detail</span>
                {showDetails ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#77766D] dark:text-muted-foreground transition-colors hover:bg-[#F1EEE6] dark:hover:bg-muted hover:text-[#26251F] dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Kecilkan Notifikasi"
              aria-label="Kecilkan notifikasi"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (isActive) {
                  handleCancel();
                } else {
                  setActiveTask(null, targetProjectId || undefined);
                }
              }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#77766D] dark:text-muted-foreground transition-colors hover:bg-[#F1EEE6] dark:hover:bg-muted hover:text-[#26251F] dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={isActive ? "Batalkan dan Tutup" : "Tutup Notifikasi"}
              aria-label={isActive ? "Batalkan dan tutup notifikasi" : "Tutup notifikasi"}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isError && (
          <div className="mt-2.5">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[#77766D] dark:text-muted-foreground">
              <span className="truncate max-w-[240px]">
                Tahap:{" "}
                <span className="font-sans font-medium text-[#26251F] dark:text-foreground">
                  {currentTask.stage || "processing"}
                </span>
              </span>
              <span className="font-bold text-[#A9472C] dark:text-primary">{currentTask.progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full border border-[#E5E1D7] dark:border-border bg-[#F1EEE6] dark:bg-muted">
              <div
                className={`h-full rounded-full bg-[#C45B3A] dark:bg-primary transition-all duration-300 ease-out ${
                  currentTask.status === "progress" ? "opacity-95" : ""
                }`}
                style={{ width: `${Math.max(currentTask.progress, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* Expandable Error Details Box */}
        {showDetails && currentTask.error && (
          <div className="mt-2.5 max-h-36 space-y-1 overflow-x-auto rounded-lg border border-[#E9C9BD] dark:border-rose-900/40 bg-white/70 dark:bg-card/80 p-2.5 font-mono text-xs text-[#A9472C] dark:text-rose-400">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#A9472C] dark:text-rose-400">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>Detail Kesalahan dari Worker:</span>
            </div>
            <p className="whitespace-pre-wrap break-all text-[11px] leading-relaxed">
              {currentTask.error}
            </p>
          </div>
        )}

        {/* Other Projects Running Indicator */}
        {otherProjectsCount > 0 && (
          <div className="mt-2.5 flex items-center justify-between border-t border-[#E5E1D7] dark:border-border pt-2 font-mono text-[10px] text-[#77766D] dark:text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-[#76816B] dark:text-emerald-400" />
              <span>Project lain di background:</span>
            </span>
            <span className="font-semibold text-[#456A4E] dark:text-emerald-400">{otherProjectsCount} job berjalan</span>
          </div>
        )}
      </div>
    </div>
  );
}

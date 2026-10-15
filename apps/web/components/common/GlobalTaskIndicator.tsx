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
  const {
    activeTask,
    tasksByProject,
    currentProjectId,
    setActiveTask,
    showToast,
  } = useStudioStore();

  const [showDetails, setShowDetails] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Resolve the task scoped to the active project
  const targetProjectId = projectId || currentProjectId;
  const currentTask = targetProjectId
    ? (tasksByProject[targetProjectId] ?? (activeTask?.project_id === targetProjectId ? activeTask : null))
    : activeTask;

  // Check if there are background tasks running in other projects
  const otherProjectsCount = Object.entries(tasksByProject).filter(
    ([pId, t]) => pId !== targetProjectId && t && (t.status === "progress" || t.status === "queued")
  ).length;

  if (!currentTask) {
    // If no task for this project, but another project is working, show a subtle unobtrusive Supabase pill
    if (otherProjectsCount > 0) {
      return (
        <div className="fixed bottom-5 right-5 z-50 animate-scale-pop pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#2E2E2E] bg-[#181818]/95 backdrop-blur-md shadow-lg text-xs text-muted-foreground font-mono">
            <span className="w-2 h-2 rounded-full bg-[#3ECF8E] animate-pulse" />
            <span className="text-foreground text-[11px] font-sans font-medium">
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
      if (currentTask.task_type === "youtube_download" && currentTask.data?.video_id) {
        await api.cancelMedia(currentTask.project_id, currentTask.data.video_id);
      } else if (currentTask.task_type === "render" && currentTask.data?.job_id) {
        await api.cancelRenderJob(currentTask.project_id, currentTask.data.job_id);
      } else {
        await api.cancelProjectTasks(currentTask.project_id);
      }
      showToast("Sinyal pembatalan dikirim ke worker...", "info");
    } catch (err: any) {
      console.error("Gagal membatalkan task:", err);
      showToast(err.message || "Gagal membatalkan task", "error");
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
          badgeColor: "text-rose-400 border-rose-500/30 bg-rose-500/10",
        };
      case "scene_detect":
        return {
          label: "Deteksi Visual AI",
          icon: Film,
          badgeColor: "text-[#3ECF8E] border-[#3ECF8E]/30 bg-[#3ECF8E]/10",
        };
      case "scene_retag":
        return {
          label: "Tagging Visual AI",
          icon: Sparkles,
          badgeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
        };
      case "scene_transcribe":
        return {
          label: "Transkripsi Dialog",
          icon: Mic,
          badgeColor: "text-sky-400 border-sky-500/30 bg-sky-500/10",
        };
      case "tts_align":
        return {
          label: "Suara & Alignment",
          icon: Volume2,
          badgeColor: "text-purple-400 border-purple-500/30 bg-purple-500/10",
        };
      case "render":
        return {
          label: "Render Video FFmpeg",
          icon: Download,
          badgeColor: "text-[#3ECF8E] border-[#3ECF8E]/30 bg-[#3ECF8E]/10",
        };
      default:
        return {
          label: "Worker Task",
          icon: Sparkles,
          badgeColor: "text-[#3ECF8E] border-[#3ECF8E]/30 bg-[#3ECF8E]/10",
        };
    }
  };

  const meta = getTaskMeta(currentTask.task_type);
  const IconComponent = meta.icon;

  // Minimized Compact Pill Mode (Supabase Status Pill)
  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-scale-pop pointer-events-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-[#2E2E2E] hover:border-[#3ECF8E]/40 bg-[#1C1C1C]/95 backdrop-blur-md shadow-xl transition-all hover:scale-[1.02] text-xs"
          title="Klik untuk membuka detail task"
        >
          {isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3ECF8E] shrink-0" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3ECF8E] shrink-0" />
          )}
          <span className="font-medium text-foreground tracking-tight">{meta.label}</span>
          <span className="font-mono font-bold text-[#3ECF8E] text-[11px]">
            {currentTask.progress}%
          </span>
        </button>

        {isActive && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCancelling}
            className="flex items-center justify-center w-7 h-7 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition shadow-lg hover:scale-105 disabled:opacity-50"
            title="Batalkan proses worker"
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

  // Expanded Floating Card (Authentic Supabase Studio Design)
  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-xs sm:max-w-md animate-scale-pop pointer-events-auto">
      <div
        className={`relative overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          isError
            ? "bg-[#181315] border-rose-500/30 shadow-rose-950/20"
            : isSuccess
            ? "bg-[#121915] border-[#3ECF8E]/30 shadow-emerald-950/20"
            : "bg-[#1C1C1C]/95 border-[#2E2E2E] shadow-black/40"
        }`}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Supabase Styled Status Icon Box */}
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center border shrink-0 ${
                isError
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  : isSuccess
                  ? "bg-[#3ECF8E]/10 border-[#3ECF8E]/30 text-[#3ECF8E]"
                  : "bg-[#242424] border-[#2E2E2E] text-[#3ECF8E]"
              }`}
            >
              {isError ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3ECF8E]" />
              ) : (
                <IconComponent className="w-3.5 h-3.5 animate-pulse text-[#3ECF8E]" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`text-[9px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded border font-semibold ${meta.badgeColor}`}
                >
                  {meta.label}
                </span>

                {isActive && (
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#3ECF8E]">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-[#3ECF8E]" />
                    <span>{currentTask.progress}%</span>
                  </span>
                )}
                {isSuccess && (
                  <Badge variant="supabase" className="text-[9px] py-0 px-1.5">
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
                className="text-xs text-foreground/90 font-medium truncate mt-0.5"
                title={currentTask.message || ""}
              >
                {currentTask.message || "Memproses background task..."}
              </p>
            </div>
          </div>

          {/* Action Buttons in Supabase Style */}
          <div className="flex items-center gap-1 shrink-0">
            {isActive && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="h-6 px-2 text-[10px] font-medium rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                title="Batalkan proses worker ini"
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
                className="h-6 px-2 text-[10px] font-medium rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 flex items-center gap-1 transition-colors"
              >
                <span>Detail</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="h-6 w-6 rounded text-muted-foreground hover:text-white hover:bg-[#2A2A2A] transition-colors flex items-center justify-center cursor-pointer"
              title="Kecilkan Notifikasi"
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
              className="h-6 w-6 rounded text-muted-foreground hover:text-white hover:bg-[#2A2A2A] transition-colors flex items-center justify-center cursor-pointer"
              title={isActive ? "Batalkan dan Tutup" : "Tutup Notifikasi"}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Supabase Crisp Progress Bar */}
        {!isError && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
              <span className="truncate max-w-[240px]">
                Tahap: <span className="text-foreground font-sans font-medium">{currentTask.stage || "processing"}</span>
              </span>
              <span className="font-bold text-[#3ECF8E]">{currentTask.progress}%</span>
            </div>
            <div className="w-full bg-[#242424] rounded-full h-1.5 overflow-hidden border border-[#2E2E2E]/60">
              <div
                className={`h-full bg-[#3ECF8E] rounded-full transition-all duration-300 ease-out ${
                  currentTask.status === "progress" ? "opacity-95" : ""
                }`}
                style={{ width: `${Math.max(currentTask.progress, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* Expandable Error Details Box */}
        {showDetails && currentTask.error && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-[#141414] border border-rose-500/30 text-rose-300 text-xs font-mono space-y-1 overflow-x-auto max-h-36">
            <div className="font-semibold flex items-center gap-1.5 text-rose-400 text-[10px] uppercase tracking-wider">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>Detail Kesalahan dari Worker:</span>
            </div>
            <p className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-rose-200">
              {currentTask.error}
            </p>
          </div>
        )}

        {/* Other Projects Running Indicator */}
        {otherProjectsCount > 0 && (
          <div className="mt-2.5 pt-2 border-t border-[#262626] flex items-center justify-between text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-[#3ECF8E]" />
              <span>Project lain di background:</span>
            </span>
            <span className="text-[#3ECF8E] font-semibold">
              {otherProjectsCount} job berjalan
            </span>
          </div>
        )}
      </div>
    </div>
  );
}


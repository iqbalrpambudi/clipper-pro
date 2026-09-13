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
} from "lucide-react";
import { useStudioStore, TaskEvent } from "@/lib/store";

export function GlobalTaskIndicator() {
  const { activeTask, setActiveTask } = useStudioStore();
  const [showDetails, setShowDetails] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  if (!activeTask) return null;

  const getTaskMeta = (type: TaskEvent["task_type"]) => {
    switch (type) {
      case "youtube_download":
        return {
          label: "Download YouTube",
          icon: Youtube,
          color: "text-rose-400",
          border: "border-rose-500/40",
          bg: "from-rose-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-rose-600 to-rose-400",
          glow: "shadow-rose-600/20",
        };
      case "scene_detect":
        return {
          label: "Deteksi Scene & Vision AI",
          icon: Film,
          color: "text-brand-400",
          border: "border-brand-500/40",
          bg: "from-brand-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-brand-600 to-indigo-400",
          glow: "shadow-brand-500/20",
        };
      case "scene_retag":
        return {
          label: "Tagging Ulang Scene",
          icon: Sparkles,
          color: "text-accent-yellow",
          border: "border-accent-yellow/40",
          bg: "from-amber-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-amber-500 to-accent-yellow",
          glow: "shadow-accent-yellow/20",
        };
      case "scene_transcribe":
        return {
          label: "Transkripsi Dialog Audio",
          icon: Mic,
          color: "text-indigo-400",
          border: "border-indigo-500/40",
          bg: "from-indigo-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-indigo-600 to-purple-400",
          glow: "shadow-indigo-500/20",
        };
      case "tts_align":
        return {
          label: "Generate Suara & Alignment",
          icon: Volume2,
          color: "text-purple-400",
          border: "border-purple-500/40",
          bg: "from-purple-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-purple-600 to-pink-500",
          glow: "shadow-purple-500/20",
        };
      case "render":
        return {
          label: "Rendering Video FFmpeg",
          icon: Download,
          color: "text-emerald-400",
          border: "border-emerald-500/40",
          bg: "from-emerald-950/80 via-surface-card/95 to-surface/90",
          progressBg: "from-emerald-600 to-teal-400",
          glow: "shadow-emerald-500/20",
        };
      default:
        return {
          label: "Worker Task",
          icon: Sparkles,
          color: "text-brand-400",
          border: "border-surface-border",
          bg: "from-surface-card to-surface",
          progressBg: "from-brand-500 to-brand-400",
          glow: "shadow-brand-500/10",
        };
    }
  };

  const meta = getTaskMeta(activeTask.task_type);
  const IconComponent = meta.icon;
  const isError = activeTask.status === "error";
  const isSuccess = activeTask.status === "success";

  // Minimized Compact Pill Mode
  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 animate-scale-pop pointer-events-auto">
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-full border backdrop-blur-xl shadow-2xl bg-surface-card/95 transition hover:scale-105 ${meta.border} ${meta.glow}`}
          title="Klik untuk membuka detail background task"
        >
          {isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-brand-400 shrink-0" />
          )}
          <span className="text-xs font-bold text-white tracking-tight">{meta.label}</span>
          <span className="text-[11px] font-mono font-extrabold text-brand-300">
            {activeTask.progress}%
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-xs sm:max-w-md animate-scale-pop pointer-events-auto">
      <div
        className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl p-4 shadow-2xl transition-all duration-300 ${
          isError
            ? "border-rose-500/60 bg-gradient-to-br from-rose-950/90 via-surface-card/95 to-surface/95 shadow-rose-950/40"
            : isSuccess
            ? "border-emerald-500/60 bg-gradient-to-br from-emerald-950/90 via-surface-card/95 to-surface/95 shadow-emerald-950/40"
            : `border-surface-border/80 bg-gradient-to-br ${meta.bg} ${meta.glow}`
        }`}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Animated Status Icon */}
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                isError
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : isSuccess
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : `bg-black/40 ${meta.border} ${meta.color}`
              }`}
            >
              {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <IconComponent className="w-4 h-4 animate-pulse" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold tracking-wider uppercase font-mono px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white">
                  {meta.label}
                </span>

                {activeTask.status === "progress" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-300">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                    <span>{activeTask.progress}%</span>
                  </span>
                )}
                {isSuccess && (
                  <span className="text-[11px] font-bold text-emerald-400">
                    Selesai
                  </span>
                )}
                {isError && (
                  <span className="text-[11px] font-bold text-rose-400">
                    Error
                  </span>
                )}
              </div>

              {/* Message text */}
              <p className="text-xs text-slate-200 font-medium truncate mt-0.5" title={activeTask.message || ""}>
                {activeTask.message || "Memproses task di background..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activeTask.error && (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1 transition"
              >
                <span>Detail</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Kecilkan Notifikasi"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTask(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Tutup Notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar (Visible while in progress or success) */}
        {!isError && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
              <span className="truncate max-w-[220px]">
                Tahap: <strong className="text-slate-200">{activeTask.stage || "processing"}</strong>
              </span>
              <span className="font-bold text-white">{activeTask.progress}%</span>
            </div>
            <div className="w-full bg-black/50 rounded-full h-1.5 overflow-hidden border border-white/10">
              <div
                className={`h-full transition-all duration-300 ease-out bg-gradient-to-r ${meta.progressBg} ${
                  activeTask.status === "progress" ? "animate-pulse" : ""
                }`}
                style={{ width: `${Math.max(activeTask.progress, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* Expandable Error Details Box */}
        {showDetails && activeTask.error && (
          <div className="mt-3 p-3 rounded-xl bg-black/80 border border-rose-500/40 text-rose-300 text-xs font-mono space-y-1 overflow-x-auto max-h-36">
            <div className="font-bold flex items-center gap-1.5 text-rose-400 text-[11px] uppercase tracking-wider">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Detail Kesalahan dari Worker:</span>
            </div>
            <p className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-rose-200">
              {activeTask.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

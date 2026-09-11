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
} from "lucide-react";
import { useStudioStore, TaskEvent } from "@/lib/store";

export function GlobalTaskIndicator() {
  const { activeTask, setActiveTask } = useStudioStore();
  const [showDetails, setShowDetails] = useState(false);

  if (!activeTask) return null;

  const getTaskMeta = (type: TaskEvent["task_type"]) => {
    switch (type) {
      case "youtube_download":
        return {
          label: "Download YouTube",
          icon: Youtube,
          color: "text-rose-400",
          border: "border-rose-500/30",
          bg: "from-rose-950/40 via-surface to-surface",
          progressBg: "from-rose-600 to-rose-400",
        };
      case "scene_detect":
        return {
          label: "Deteksi Scene & Vision AI",
          icon: Film,
          color: "text-brand-400",
          border: "border-brand-500/30",
          bg: "from-brand-950/40 via-surface to-surface",
          progressBg: "from-brand-600 to-brand-400",
        };
      case "scene_retag":
        return {
          label: "Tagging Ulang Scene (Vision AI)",
          icon: Sparkles,
          color: "text-accent-yellow",
          border: "border-accent-yellow/30",
          bg: "from-amber-950/30 via-surface to-surface",
          progressBg: "from-amber-500 to-accent-yellow",
        };
      case "tts_align":
        return {
          label: "Generate Suara & Alignment",
          icon: Volume2,
          color: "text-purple-400",
          border: "border-purple-500/30",
          bg: "from-purple-950/40 via-surface to-surface",
          progressBg: "from-purple-600 to-pink-500",
        };
      case "render":
        return {
          label: "Rendering Video (FFmpeg)",
          icon: Download,
          color: "text-emerald-400",
          border: "border-emerald-500/30",
          bg: "from-emerald-950/40 via-surface to-surface",
          progressBg: "from-emerald-600 to-teal-400",
        };
      default:
        return {
          label: "Worker Task",
          icon: Sparkles,
          color: "text-brand-400",
          border: "border-surface-border",
          bg: "from-surface to-surface-card",
          progressBg: "from-brand-500 to-brand-400",
        };
    }
  };

  const meta = getTaskMeta(activeTask.task_type);
  const IconComponent = meta.icon;
  const isError = activeTask.status === "error";
  const isSuccess = activeTask.status === "success";

  return (
    <div className="w-full max-w-7xl mx-auto px-6 pt-4 pb-1">
      <div
        className={`relative overflow-hidden rounded-2xl border backdrop-blur-xl p-4 shadow-2xl transition-all duration-300 ${
          isError
            ? "border-rose-500/50 bg-gradient-to-r from-rose-950/60 via-surface to-rose-950/30 shadow-rose-950/30"
            : isSuccess
            ? "border-emerald-500/50 bg-gradient-to-r from-emerald-950/60 via-surface to-emerald-950/30 shadow-emerald-950/30"
            : `border-surface-border bg-gradient-to-r ${meta.bg} shadow-brand-500/10`
        }`}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Animated Status Icon */}
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                isError
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : isSuccess
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                  : `bg-surface-card ${meta.border} ${meta.color}`
              }`}
            >
              {isError ? (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <IconComponent className="w-4 h-4 animate-pulse" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-wider uppercase font-mono px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                  {meta.label}
                </span>

                {activeTask.status === "progress" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-300">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                    <span>Sedang Dikerjakan ({activeTask.progress}%)</span>
                  </span>
                )}
                {isSuccess && (
                  <span className="text-[11px] font-bold text-emerald-400">
                    Selesai 100%
                  </span>
                )}
                {isError && (
                  <span className="text-[11px] font-bold text-rose-400">
                    Gagal / Error
                  </span>
                )}
              </div>

              {/* Message text */}
              <p className="text-xs text-slate-200 font-medium truncate mt-0.5">
                {activeTask.message || "Memproses di background..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeTask.error && (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-1 transition"
              >
                <span>Lihat Detail</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTask(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Tutup Notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar (Visible while in progress or success) */}
        {!isError && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
              <span className="truncate max-w-md">
                Tahap: <strong className="text-slate-200">{activeTask.stage || "processing"}</strong>
              </span>
              <span className="font-bold text-white">{activeTask.progress}%</span>
            </div>
            <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
              <div
                className={`h-full transition-all duration-500 ease-out bg-gradient-to-r ${meta.progressBg} ${
                  activeTask.status === "progress" ? "animate-pulse" : ""
                }`}
                style={{ width: `${Math.max(activeTask.progress, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* Expandable Error Details Box */}
        {showDetails && activeTask.error && (
          <div className="mt-3 p-3 rounded-xl bg-black/60 border border-rose-500/30 text-rose-300 text-xs font-mono space-y-1 overflow-x-auto max-h-40">
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

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
import { Button, Badge } from "@/components/ui";

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
          border: "border-rose-500/30",
          bg: "from-rose-950/70 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-rose-600 to-rose-400",
          glow: "shadow-rose-600/10",
        };
      case "scene_detect":
        return {
          label: "Deteksi Scene & Vision AI",
          icon: Film,
          color: "text-[#3ECF8E]",
          border: "border-[#3ECF8E]/30",
          bg: "from-emerald-950/70 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-[#3ECF8E] to-emerald-400",
          glow: "shadow-[#3ECF8E]/10",
        };
      case "scene_retag":
        return {
          label: "Tagging Ulang Scene",
          icon: Sparkles,
          color: "text-amber-400",
          border: "border-amber-500/30",
          bg: "from-amber-950/70 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-amber-500 to-amber-300",
          glow: "shadow-amber-500/10",
        };
      case "scene_transcribe":
        return {
          label: "Transkripsi Dialog Audio",
          icon: Mic,
          color: "text-sky-400",
          border: "border-sky-500/30",
          bg: "from-sky-950/70 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-sky-600 to-sky-400",
          glow: "shadow-sky-500/10",
        };
      case "tts_align":
        return {
          label: "Generate Suara & Alignment",
          icon: Volume2,
          color: "text-purple-400",
          border: "border-purple-500/30",
          bg: "from-purple-950/70 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-purple-600 to-pink-500",
          glow: "shadow-purple-500/10",
        };
      case "render":
        return {
          label: "Rendering Video FFmpeg",
          icon: Download,
          color: "text-[#3ECF8E]",
          border: "border-[#3ECF8E]/40",
          bg: "from-emerald-950/80 via-[#1C1C1C] to-[#181818]",
          progressBg: "from-[#3ECF8E] to-[#2DA670]",
          glow: "shadow-[#3ECF8E]/20",
        };
      default:
        return {
          label: "Worker Task",
          icon: Sparkles,
          color: "text-[#3ECF8E]",
          border: "border-[#2E2E2E]",
          bg: "from-[#1C1C1C] to-[#181818]",
          progressBg: "from-[#3ECF8E] to-emerald-400",
          glow: "shadow-[#3ECF8E]/10",
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
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-full border backdrop-blur-xl shadow-2xl bg-[#1C1C1C]/95 transition hover:scale-105 ${meta.border} ${meta.glow}`}
          title="Klik untuk membuka detail background task"
        >
          {isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-[#3ECF8E] shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-[#3ECF8E] shrink-0" />
          )}
          <span className="text-xs font-bold text-white tracking-tight">{meta.label}</span>
          <span className="text-[11px] font-mono font-extrabold text-[#3ECF8E]">
            {activeTask.progress}%
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-xs sm:max-w-md animate-scale-pop pointer-events-auto">
      <div
        className={`relative overflow-hidden rounded-xl border backdrop-blur-xl p-4 shadow-2xl transition-all duration-300 ${
          isError
            ? "border-rose-500/50 bg-gradient-to-br from-rose-950/90 via-[#1C1C1C]/95 to-[#181818]/95 shadow-rose-950/40"
            : isSuccess
            ? "border-[#3ECF8E]/50 bg-gradient-to-br from-emerald-950/90 via-[#1C1C1C]/95 to-[#181818]/95 shadow-emerald-950/40"
            : `border-[#2E2E2E] bg-gradient-to-br ${meta.bg} ${meta.glow}`
        }`}
      >
        {/* Top Header Row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Animated Status Icon */}
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                isError
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                  : isSuccess
                  ? "bg-emerald-500/20 border-emerald-500/40 text-[#3ECF8E]"
                  : `bg-black/40 ${meta.border} ${meta.color}`
              }`}
            >
              {isError ? (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-[#3ECF8E]" />
              ) : (
                <IconComponent className="w-4 h-4 animate-pulse" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider px-2 py-0">
                  {meta.label}
                </Badge>

                {activeTask.status === "progress" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3ECF8E]">
                    <Loader2 className="w-3 h-3 animate-spin text-[#3ECF8E]" />
                    <span>{activeTask.progress}%</span>
                  </span>
                )}
                {isSuccess && (
                  <Badge variant="supabase" className="text-[10px] py-0">
                    Selesai
                  </Badge>
                )}
                {isError && (
                  <Badge variant="destructive" className="text-[10px] py-0">
                    Error
                  </Badge>
                )}
              </div>

              {/* Message text */}
              <p className="text-xs text-foreground/90 font-medium truncate mt-0.5" title={activeTask.message || ""}>
                {activeTask.message || "Memproses task di background..."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {activeTask.error && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-7 text-[10px] font-semibold text-rose-300 border-rose-500/40 hover:bg-rose-500/20 gap-1 px-2"
              >
                <span>Detail</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsMinimized(true)}
              className="text-muted-foreground hover:text-white hover:bg-white/10"
              title="Kecilkan Notifikasi"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setActiveTask(null)}
              className="text-muted-foreground hover:text-white hover:bg-white/10"
              title="Tutup Notifikasi"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Progress Bar (Visible while in progress or success) */}
        {!isError && (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
              <span className="truncate max-w-[220px]">
                Tahap: <strong className="text-foreground">{activeTask.stage || "processing"}</strong>
              </span>
              <span className="font-bold text-foreground">{activeTask.progress}%</span>
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
          <div className="mt-3 p-3 rounded-lg bg-black/80 border border-rose-500/40 text-rose-300 text-xs font-mono space-y-1 overflow-x-auto max-h-36">
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

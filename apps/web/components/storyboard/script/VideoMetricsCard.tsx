"use client";

import React from "react";
import { Clock, Check, Copy, Sparkles } from "lucide-react";

interface VideoMetricsCardProps {
  durationMins: number;
  imagesPerSegment: number;
  wordCount: number;
  charCount: number;
  resultDurationFormatted: string;
  hasSegments: boolean;
  hasCopiedNarration: boolean;
  onCopyAllNarration: () => void;
  onOpenNarrationAnalysis?: () => void;
  itemsCount: number;
}

export function VideoMetricsCard({
  durationMins,
  imagesPerSegment,
  wordCount,
  charCount,
  resultDurationFormatted,
  hasSegments,
  hasCopiedNarration,
  onCopyAllNarration,
  onOpenNarrationAnalysis,
  itemsCount,
}: VideoMetricsCardProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-violet-400" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#26251F]">
            Ringkasan Metrik Video
          </h4>
        </div>
        {hasSegments ? (
          <div className="flex items-center gap-2">
            {onOpenNarrationAnalysis && (
              <button
                type="button"
                onClick={onOpenNarrationAnalysis}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-300 hover:text-amber-200 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition shadow-sm"
                title="Analisis Skor Narasi untuk Retensi YouTube"
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Skor Narasi</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCopyAllNarration}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] px-2.5 py-1 text-[11px] font-semibold text-[#4D4A42] transition hover:bg-[#F1EEE6] hover:text-[#26251F]"
              title="Salin seluruh teks narasi ke clipboard"
            >
              {hasCopiedNarration ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-violet-400" />
              )}
              <span>{hasCopiedNarration ? "Tersalin!" : "Salin Narasi"}</span>
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 font-mono">Target Estimasi</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5">
        {/* Metric 1: Durasi */}
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
            Durasi Narasi
          </span>
          <div className="text-sm font-bold text-violet-400 mt-1 font-mono">
            {resultDurationFormatted}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
            {wordCount > 0
              ? `~${(wordCount / 135).toFixed(1)} mnt (135 kpm)`
              : `Target ${durationMins} mnt`}
          </span>
        </div>

        {/* Metric 2: Panjang Karakter & Kata */}
        <div className="border-x border-[#E5E1D7] text-center">
          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
            Panjang Teks
          </span>
          <div className="mt-1 font-mono text-sm font-bold text-[#26251F]">
            {charCount > 0 ? `${charCount.toLocaleString()} Karakter` : "0 Karakter"}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
            {wordCount > 0 ? `${wordCount.toLocaleString()} Kata` : "0 Kata"}
          </span>
        </div>

        {/* Metric 3: Estimasi Ilustrasi */}
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
            Estimasi Ilustrasi
          </span>
          <div className="text-sm font-bold text-emerald-400 mt-1 font-mono">
            {itemsCount > 0
              ? `${itemsCount} Slot Gambar`
              : `${durationMins * 2 * imagesPerSegment} Estimasi Slot`}
          </div>
          <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
            {imagesPerSegment} gambar / segmen
          </span>
        </div>
      </div>
    </div>
  );
}

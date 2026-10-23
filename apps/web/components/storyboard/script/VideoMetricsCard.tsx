"use client";

import React from "react";
import { Clock } from "lucide-react";

interface VideoMetricsCardProps {
  durationMins: number;
  imagesPerSegment: number;
  wordCount: number;
  charCount: number;
  resultDurationFormatted: string;
  itemsCount: number;
}

export function VideoMetricsCard({
  durationMins,
  imagesPerSegment,
  wordCount,
  charCount,
  resultDurationFormatted,
  itemsCount,
}: VideoMetricsCardProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2.5">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#C45B3A]" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[#26251F]">
            Ringkasan Metrik Video
          </h4>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5">
        {/* Metric 1: Durasi */}
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
            Durasi Narasi
          </span>
          <div className="text-sm font-bold text-[#C45B3A] mt-1 font-mono">
            {resultDurationFormatted}
          </div>
          <span className="text-[10px] text-[#858176] font-mono block mt-0.5">
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
          <span className="text-[10px] text-[#858176] font-mono block mt-0.5">
            {wordCount > 0 ? `${wordCount.toLocaleString()} Kata` : "0 Kata"}
          </span>
        </div>

        {/* Metric 3: Estimasi Ilustrasi */}
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
            Estimasi Ilustrasi
          </span>
          <div className="text-sm font-bold text-[#26251F] mt-1 font-mono">
            {itemsCount > 0
              ? `${itemsCount} Slot Gambar`
              : `${durationMins * 2 * imagesPerSegment} Estimasi Slot`}
          </div>
          <span className="text-[10px] text-[#858176] font-mono block mt-0.5">
            {imagesPerSegment} gambar / segmen
          </span>
        </div>
      </div>
    </div>
  );
}

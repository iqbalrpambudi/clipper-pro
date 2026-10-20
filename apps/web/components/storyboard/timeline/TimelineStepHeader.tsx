"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import { Button, Badge } from "@/components/ui";

interface TimelineStepHeaderProps {
  onNavigateImages: () => void;
  onNavigateWatermark: () => void;
}

export function TimelineStepHeader({
  onNavigateImages,
  onNavigateWatermark,
}: TimelineStepHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
            Langkah 4 dari 6
          </span>
          <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
            Timeline, Motion & Studio Subtitle WYSIWYG
          </Badge>
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">
          Preview Video 16:9 & Studio Kustomisasi Subtitle
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tonton simulasi preview video landscape 16:9 dengan live karaoke subtitle dan penataan visual
          adegan secara real-time.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onNavigateImages}
          className="border-[#2E2E2E] text-xs"
        >
          Kembali ke Ilustrasi
        </Button>

        <Button
          onClick={onNavigateWatermark}
          className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
        >
          <span>Lanjut ke Watermark & Audio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { ArrowRight, Layers } from "lucide-react";
import { Button } from "@/components/ui";
import { StoryboardTabHeader } from "../StoryboardTabHeader";

interface TimelineStepHeaderProps {
  onNavigateImages: () => void;
  onNavigateRender: () => void;
}

export function TimelineStepHeader({
  onNavigateImages,
  onNavigateRender,
}: TimelineStepHeaderProps) {
  return (
    <StoryboardTabHeader
      icon={Layers}
      title="Timeline, Subtitle & Visual Studio"
      badge="Langkah 4 • Studio"
      secondaryBadge="Live WYSIWYG"
      description="Simulasi preview video 16:9 dengan live karaoke subtitle, efek motion Ken Burns, watermark branding, dan musik latar."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onNavigateImages}
            className="h-8 border-[#2E2E2E] text-xs"
          >
            Kembali ke Ilustrasi
          </Button>

          <Button
            size="sm"
            onClick={onNavigateRender}
            className="h-8 bg-violet-600 hover:bg-violet-500 text-white gap-1.5 text-xs font-semibold shadow-md shadow-violet-500/20"
          >
            <span>Lanjut ke Render 16:9</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </>
      }
    />
  );
}

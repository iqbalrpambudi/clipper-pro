"use client";

import React, { use } from "react";
import { Loader2 } from "lucide-react";
import { useStudioStore } from "@/lib/store";
import { useProject } from "@/hooks/useProjects";
import { MediaPoolTab } from "@/components/media/MediaPoolTab";
import { NarrationTab } from "@/components/narration/NarrationTab";
import { TTSTab } from "@/components/tts/TTSTab";
import { TimelineTab } from "@/components/timeline/TimelineTab";
import { RenderTab } from "@/components/render/RenderTab";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ShortVideoStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const { activeTab } = useStudioStore();
  const { data: project, isLoading } = useProject(id);

  if (isLoading || !project) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Memuat workspace project...</p>
        </div>
      </div>
    );
  }


  // Timeline is a full-bleed editor surface; the other tabs own their own header + gutter.
  if (activeTab === "timeline") return <TimelineTab project={project} />;

  return (
    <>
      {(activeTab === "media" || !["narration", "tts", "render"].includes(activeTab)) && (
        <MediaPoolTab project={project} />
      )}
      {activeTab === "narration" && <NarrationTab project={project} />}
      {activeTab === "tts" && <TTSTab project={project} />}
      {activeTab === "render" && <RenderTab project={project} />}
    </>
  );
}

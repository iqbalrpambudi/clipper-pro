"use client";

import React, { use } from "react";
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
  const { data: project } = useProject(id);

  if (!project) return null;

  // Timeline is a full-bleed editor; every other tab shares the studio content gutter.
  if (activeTab === "timeline") return <TimelineTab project={project} />;

  return (
    <div className="mx-auto w-full max-w-[1920px] px-3 py-4 sm:px-6 sm:py-6">
      {(activeTab === "media" || !["narration", "tts", "render"].includes(activeTab)) && (
        <MediaPoolTab project={project} />
      )}
      {activeTab === "narration" && <NarrationTab project={project} />}
      {activeTab === "tts" && <TTSTab project={project} />}
      {activeTab === "render" && <RenderTab project={project} />}
    </div>
  );
}

"use client";

import React, { use } from "react";
import { useStudioStore } from "@/lib/store";
import { useProject } from "@/hooks/useProjects";
import {
  StoryboardScriptTab,
  StoryboardVoiceTab,
  StoryboardImagesTab,
  StoryboardTimelineTab,
  StoryboardRenderTab,
  StoryboardYoutubeTab,
} from "@/components/storyboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StoryboardStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const { activeTab } = useStudioStore();
  const { data: project } = useProject(id);

  if (!project) return null;

  return (
    <>
      {(activeTab === "storyboard_script" ||
        ![
          "storyboard_voice",
          "storyboard_images",
          "storyboard_timeline",
          "storyboard_watermark",
          "storyboard_render",
          "storyboard_publishing",
          "storyboard_youtube",
        ].includes(activeTab)) && <StoryboardScriptTab project={project} />}
      {activeTab === "storyboard_voice" && <StoryboardVoiceTab project={project} />}
      {activeTab === "storyboard_images" && <StoryboardImagesTab project={project} />}
      {(activeTab === "storyboard_timeline" || activeTab === "storyboard_watermark") && (
        <StoryboardTimelineTab project={project} />
      )}
      {activeTab === "storyboard_render" && <StoryboardRenderTab project={project} />}
      {(activeTab === "storyboard_publishing" || activeTab === "storyboard_youtube") && (
        <StoryboardYoutubeTab project={project} />
      )}
    </>

  );
}

"use client";

import React, { use } from "react";
import { useStudioStore } from "@/lib/store";
import { useProject } from "@/hooks/useProjects";
import {
  MotionScriptTab,
  MotionVoiceTab,
  MotionStudioTab,
  MotionRenderTab,
} from "@/components/motion";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function MotionStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const { activeTab } = useStudioStore();
  const { data: project } = useProject(id);

  if (!project) return null;

  return (
    <>
      {(activeTab === "motion_script" ||
        !["motion_voice", "motion_studio", "motion_render"].includes(activeTab)) && (
        <MotionScriptTab project={project} />
      )}
      {activeTab === "motion_voice" && <MotionVoiceTab project={project} />}
      {activeTab === "motion_studio" && <MotionStudioTab project={project} />}
      {activeTab === "motion_render" && <MotionRenderTab project={project} />}
    </>
  );
}


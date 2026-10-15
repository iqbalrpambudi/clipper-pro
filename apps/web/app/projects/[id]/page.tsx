"use client";

import React, { use, useEffect } from "react";
import Link from "next/link";
import {
  Film,
  FileText,
  Volume2,
  Layers,
  Download,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { useStudioStore } from "@/lib/store";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import { StudioLayout, StudioNavTab } from "@/components/layout";
import { Button } from "@/components/ui";
import { MediaPoolTab } from "@/components/media/MediaPoolTab";
import { NarrationTab } from "@/components/narration/NarrationTab";
import { TTSTab } from "@/components/tts/TTSTab";
import { TimelineTab } from "@/components/timeline/TimelineTab";
import { RenderTab } from "@/components/render/RenderTab";
import {
  StoryboardScriptTab,
  StoryboardVoiceTab,
  StoryboardImagesTab,
  StoryboardTimelineTab,
  StoryboardRenderTab,
} from "@/components/storyboard";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const {
    activeTab,
    setActiveTab,
    activeTask,
    setActiveTask,
    setCurrentProjectId,
    tasksByProject,
  } = useStudioStore();
  const updateProjectMutation = useUpdateProject();

  // Scope active project ID in store
  useEffect(() => {
    setCurrentProjectId(id);
    return () => {
      setCurrentProjectId(null);
    };
  }, [id, setCurrentProjectId]);

  // Establish SSE real-time connection for worker tasks
  useProjectEvents(id);

  const { data: project, isLoading, error } = useProject(id);

  // Normalize activeTab when project type is loaded
  useEffect(() => {
    if (!project) return;
    const isSb = project.project_type === "long_storyboard";
    const sbTabs = [
      "storyboard_script",
      "storyboard_voice",
      "storyboard_images",
      "storyboard_timeline",
      "storyboard_render",
    ];
    const shortTabList = ["media", "narration", "tts", "timeline", "render"];

    if (isSb && !sbTabs.includes(activeTab)) {
      if (activeTab === "narration") setActiveTab("storyboard_script");
      else if (activeTab === "tts") setActiveTab("storyboard_voice");
      else if (activeTab === "timeline") setActiveTab("storyboard_timeline");
      else if (activeTab === "render") setActiveTab("storyboard_render");
      else setActiveTab("storyboard_script");
    } else if (!isSb && !shortTabList.includes(activeTab)) {
      if (activeTab === "storyboard_script") setActiveTab("narration");
      else if (activeTab === "storyboard_voice") setActiveTab("tts");
      else if (activeTab === "storyboard_timeline") setActiveTab("timeline");
      else if (activeTab === "storyboard_render") setActiveTab("render");
      else setActiveTab("media");
    }
  }, [project, activeTab, setActiveTab]);

  // Restore activeTask on page refresh from project database state if not yet set by SSE
  useEffect(() => {
    if (!project || project.id !== id) return;
    const projectTask = tasksByProject[id];
    if (projectTask) return;

    const downloadingVid = project.source_videos?.find((v: any) => v.status === "downloading");
    if (downloadingVid) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "youtube_download",
          status: "progress",
          progress: downloadingVid.progress || 15,
          stage: "downloading",
          message: `Mendownload video '${downloadingVid.filename}'...`,
          error: null,
          data: { video_id: downloadingVid.id, filename: downloadingVid.filename },
        },
        id
      );
      return;
    }

    const processingVid = project.source_videos?.find(
      (v: any) => v.status === "processing" || v.status === "pending"
    );
    if (processingVid) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "scene_detect",
          status: "progress",
          progress: processingVid.progress || 25,
          stage: "vision_tagging",
          message: `Menganalisis visual AI scene '${processingVid.filename}'...`,
          error: null,
          data: { video_id: processingVid.id, filename: processingVid.filename },
        },
        id
      );
      return;
    }

    const activeJob = project.render_jobs?.find(
      (j: any) => j.status === "rendering" || j.status === "processing" || j.status === "queued"
    );
    if (activeJob) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "render",
          status: "progress",
          progress: activeJob.progress || 10,
          stage: "rendering",
          message: "Sedang me-render video final...",
          error: null,
          data: { job_id: activeJob.id },
        },
        id
      );
      return;
    }

    if (project.narration?.status === "tts_generating") {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "tts_align",
          status: "progress",
          progress: 25,
          stage: "tts_synthesizing",
          message: "Mensintesis audio narasi AI...",
          error: null,
          data: {},
        },
        id
      );
    }
  }, [project, id, tasksByProject, setActiveTask]);

  // Clean up activeTask if the task is already finished in DB
  useEffect(() => {
    if (!activeTask || !project || project.id !== id) return;
    if (activeTask.project_id !== id) return;

    if (activeTask.status === "progress") {
      const vidId = activeTask.data?.video_id;
      const vid = vidId ? project.source_videos?.find((v: any) => v.id === vidId) : null;

      if (activeTask.task_type === "youtube_download") {
        if (vid && vid.status !== "downloading") {
          setActiveTask(null, id);
        }
      }

      if (activeTask.task_type === "scene_detect") {
        if (vid && vid.status === "ready") {
          setActiveTask(null, id);
        }
      }
    }
  }, [project, id, activeTask, setActiveTask]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
        <Loader2 className="w-8 h-8 text-[#3ECF8E] animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Memuat Studio Project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
        <p className="text-sm text-rose-400 mb-4">Project tidak ditemukan atau gagal dimuat.</p>
        <Link href="/">
          <Button variant="outline" size="sm" className="border-[#2E2E2E]">
            Kembali ke Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const isStoryboard = project.project_type === "long_storyboard";

  const shortTabs: StudioNavTab[] = [
    {
      id: "media",
      label: "1. Media Pool",
      icon: Film,
      badge: `${project.source_videos?.length || 0}`,
    },
    {
      id: "narration",
      label: "2. Naskah AI",
      icon: FileText,
      badge: project.narration ? "Siap" : undefined,
    },
    {
      id: "tts",
      label: "3. Suara & TTS",
      icon: Volume2,
      badge: (project as any).audio_track || (project as any).audio ? "Siap" : undefined,
    },
    {
      id: "timeline",
      label: "4. Timeline & Subtitle",
      icon: Layers,
      badge: (project as any).timeline?.clips?.length
        ? `${(project as any).timeline.clips.length} Klip`
        : undefined,
    },
    {
      id: "render",
      label: "5. Render & Export",
      icon: Download,
      badge: (project as any).render_jobs?.length ? `${(project as any).render_jobs.length} Job` : undefined,
    },
  ];

  const storyboardTabs: StudioNavTab[] = [
    {
      id: "storyboard_script",
      label: "1. Ide & Naskah",
      icon: FileText,
      badge: project.narration ? "Siap" : undefined,
    },
    {
      id: "storyboard_voice",
      label: "2. Suara & Sync",
      icon: Volume2,
      badge: (project as any).audio ? "Siap" : undefined,
    },
    {
      id: "storyboard_images",
      label: "3. Ilustrasi AI",
      icon: ImageIcon,
      badge: (project as any).storyboard_items?.length
        ? `${(project as any).storyboard_items.length} Slot`
        : undefined,
    },
    {
      id: "storyboard_timeline",
      label: "4. Timeline & Motion",
      icon: Layers,
      badge: "16:9",
    },
    {
      id: "storyboard_render",
      label: "5. Render 16:9",
      icon: Download,
      badge: (project as any).render_jobs?.length ? `${(project as any).render_jobs.length} Job` : undefined,
    },
  ];

  const handleRenameProject = async (newName: string) => {
    await updateProjectMutation.mutateAsync({
      id: project.id,
      data: { name: newName },
    });
  };

  return (
    <StudioLayout
      projectId={project.id}
      projectName={project.name}
      aspectRatio={project.aspect_ratio}
      resolution={project.resolution}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={isStoryboard ? storyboardTabs : shortTabs}
      onRenameProject={handleRenameProject}
      isRenaming={updateProjectMutation.isPending}
      onRenderClick={() => setActiveTab(isStoryboard ? "storyboard_render" : "render")}
    >
      {isStoryboard ? (
        <>
          {(activeTab === "storyboard_script" ||
            !["storyboard_voice", "storyboard_images", "storyboard_timeline", "storyboard_render"].includes(
              activeTab
            )) && <StoryboardScriptTab project={project as any} />}
          {activeTab === "storyboard_voice" && (
            <StoryboardVoiceTab project={project as any} />
          )}
          {activeTab === "storyboard_images" && (
            <StoryboardImagesTab project={project as any} />
          )}
          {activeTab === "storyboard_timeline" && (
            <StoryboardTimelineTab project={project as any} />
          )}
          {activeTab === "storyboard_render" && (
            <StoryboardRenderTab project={project as any} />
          )}
        </>
      ) : (
        <>
          {(activeTab === "media" ||
            !["narration", "tts", "timeline", "render"].includes(activeTab)) && (
            <MediaPoolTab project={project} />
          )}
          {activeTab === "narration" && <NarrationTab project={project} />}
          {activeTab === "tts" && <TTSTab project={project} />}
          {activeTab === "timeline" && <TimelineTab project={project} />}
          {activeTab === "render" && <RenderTab project={project} />}
        </>
      )}
    </StudioLayout>
  );
}

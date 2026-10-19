"use client";

import React, { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Film,
  FileText,
  Volume2,
  Layers,
  Download,
  Loader2,
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

interface PageProps {
  params: Promise<{ id: string }>;
}

const SHORT_TABS = ["media", "narration", "tts", "timeline", "render"];

export default function ShortVideoStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    activeTask,
    setActiveTask,
    setCurrentProjectId,
    tasksByProject,
  } = useStudioStore();
  const updateProjectMutation = useUpdateProject();

  // Reset activeTab to initial Tab 1 whenever project opens or switches
  const lastMountedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastMountedProjectIdRef.current !== id) {
      lastMountedProjectIdRef.current = id;
      setActiveTab("media");
    }
  }, [id, setActiveTab]);

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

  // If this project is actually a long storyboard, redirect to storyboard studio
  useEffect(() => {
    if (project && project.project_type === "long_storyboard") {
      router.replace(`/project/storyboard/${id}`);
    }
  }, [project, id, router]);

  // Normalize activeTab for short video studio
  useEffect(() => {
    if (!SHORT_TABS.includes(activeTab)) {
      if (activeTab === "storyboard_script") setActiveTab("narration");
      else if (activeTab === "storyboard_voice") setActiveTab("tts");
      else if (activeTab === "storyboard_timeline") setActiveTab("timeline");
      else if (activeTab === "storyboard_render") setActiveTab("render");
      else setActiveTab("media");
    }
  }, [activeTab, setActiveTab]);

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
        <p className="text-sm text-muted-foreground">Memuat Studio Short Clipper...</p>
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
      aspectRatio={project.aspect_ratio || "9:16"}
      resolution={project.resolution || "1080p"}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={shortTabs}
      onRenameProject={handleRenameProject}
      isRenaming={updateProjectMutation.isPending}
    >
      {(activeTab === "media" || !["narration", "tts", "timeline", "render"].includes(activeTab)) && (
        <MediaPoolTab project={project} />
      )}
      {activeTab === "narration" && <NarrationTab project={project} />}
      {activeTab === "tts" && <TTSTab project={project} />}
      {activeTab === "timeline" && <TimelineTab project={project} />}
      {activeTab === "render" && <RenderTab project={project} />}
    </StudioLayout>
  );
}

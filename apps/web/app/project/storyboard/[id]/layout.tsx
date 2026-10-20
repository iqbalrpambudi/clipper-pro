"use client";

import React, { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Volume2,
  Image as ImageIcon,
  Layers,
  Download,
  Youtube,
  Loader2,
} from "lucide-react";
import { useStudioStore } from "@/lib/store";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import { StudioLayout, StudioNavTab } from "@/components/layout";
import { Button } from "@/components/ui";
import { RenderJob } from "@/types";

interface StoryboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

const STORYBOARD_TABS = [
  "storyboard_script",
  "storyboard_voice",
  "storyboard_images",
  "storyboard_timeline",
  "storyboard_render",
  "storyboard_youtube",
];

export default function StoryboardLayout({ children, params }: StoryboardLayoutProps) {
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
      setActiveTab("storyboard_script");
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

  // If this project is actually a short video, redirect to short studio
  useEffect(() => {
    if (project && (project.project_type || "short_video") === "short_video") {
      router.replace(`/project/short/${id}`);
    }
  }, [project, id, router]);

  // Normalize activeTab for storyboard studio
  useEffect(() => {
    if (!STORYBOARD_TABS.includes(activeTab)) {
      if (activeTab === "narration") setActiveTab("storyboard_script");
      else if (activeTab === "tts") setActiveTab("storyboard_voice");
      else if (activeTab === "timeline" || activeTab === "storyboard_watermark")
        setActiveTab("storyboard_timeline");
      else if (activeTab === "render") setActiveTab("storyboard_render");
      else setActiveTab("storyboard_script");
    }
  }, [activeTab, setActiveTab]);

  // Restore activeTask on page refresh from project database state if not yet set by SSE
  useEffect(() => {
    if (!project || project.id !== id) return;
    const projectTask = tasksByProject[id];
    if (projectTask) return;

    const activeJob = project.render_jobs?.find(
      (j: RenderJob) => j.status === "rendering" || j.status === "processing" || j.status === "queued"
    );
    if (activeJob) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "render",
          status: "progress",
          progress: activeJob.progress || 10,
          stage: "rendering",
          message: "Sedang me-render video storyboard 16:9...",
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

    if (activeTask.status === "progress" && activeTask.task_type === "render") {
      const activeJob = project.render_jobs?.find(
        (j: RenderJob) => j.status === "rendering" || j.status === "processing" || j.status === "queued"
      );
      if (!activeJob) {
        setActiveTask(null, id);
      }
    }
  }, [project, id, activeTask, setActiveTask]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#121212] text-white">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Memuat Studio Long Storyboard...</p>
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
      badge: project.audio ? "Siap" : undefined,
    },
    {
      id: "storyboard_images",
      label: "3. Ilustrasi AI",
      icon: ImageIcon,
      badge: project.storyboard_items?.length
        ? `${project.storyboard_items.length} Slot`
        : undefined,
    },
    {
      id: "storyboard_timeline",
      label: "4. Timeline & Studio",
      icon: Layers,
      badge: "16:9",
    },
    {
      id: "storyboard_render",
      label: "5. Render 16:9",
      icon: Download,
      badge: project.render_jobs?.length
        ? `${project.render_jobs.length} Job`
        : undefined,
    },
    {
      id: "storyboard_youtube",
      label: "6. YouTube & Thumbnail",
      icon: Youtube,
      badge: project.youtube_metadata?.title ? "Siap" : undefined,
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
      aspectRatio={project.aspect_ratio || "16:9"}
      resolution={project.resolution || "1080p"}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabs={storyboardTabs}
      onRenameProject={handleRenameProject}
      isRenaming={updateProjectMutation.isPending}
      onRenderClick={() => setActiveTab("storyboard_render")}
    >
      {children}
    </StudioLayout>
  );
}

"use client";

import React, { use, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Volume2, Code2, Download, Loader2 } from "lucide-react";
import { useStudioStore } from "@/lib/store";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import { StudioLayout, StudioNavTab } from "@/components/layout";
import { Button } from "@/components/ui";
import { RenderJob } from "@/types";

interface MotionLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default function MotionStudioLayout({ children, params }: MotionLayoutProps) {
  const { id } = use(params);
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    setProjectMode,
    activeTask,
    setActiveTask,
    setCurrentProjectId,
    tasksByProject,
  } = useStudioStore();
  const updateProjectMutation = useUpdateProject();

  const lastMountedProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    setProjectMode("motion");
    if (lastMountedProjectIdRef.current !== id) {
      lastMountedProjectIdRef.current = id;
      setActiveTab("motion_script");
    }
  }, [id, setActiveTab, setProjectMode]);

  useEffect(() => {
    setCurrentProjectId(id);
    return () => {
      setCurrentProjectId(null);
    };
  }, [id, setCurrentProjectId]);

  useProjectEvents(id);

  const { data: project, isLoading, error } = useProject(id);

  // Redirect if opened on wrong studio route
  useEffect(() => {
    if (!project) return;
    const pType = project.project_type || "short_video";
    if (pType === "short_video") {
      router.replace(`/project/short/${id}`);
    } else if (pType === "long_storyboard") {
      router.replace(`/project/storyboard/${id}`);
    }
  }, [project, id, router]);

  // Restore running background worker task state on refresh
  useEffect(() => {
    if (!project || project.id !== id) return;
    const projectTask = tasksByProject[id];
    if (projectTask) return;

    const activeJob = project.render_jobs?.find(
      (j: RenderJob) =>
        j.status === "rendering" || j.status === "processing" || j.status === "queued"
    );
    if (activeJob) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "render",
          status: "progress",
          progress: activeJob.progress || 10,
          stage: "rendering",
          message: "Sedang me-render video Motion Graphic...",
          error: null,
          data: { job_id: activeJob.id },
        },
        id
      );
      return;
    }

    const generatingMotion = project.motion_scenes?.some((s) => s.status === "generating");
    if (generatingMotion) {
      setActiveTask(
        {
          project_id: project.id,
          task_type: "motion_generate",
          status: "progress",
          progress: 35,
          stage: "generating_tsx",
          message: "Mensintesis komponen animasi React/Remotion TSX...",
          error: null,
          data: {},
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

  useEffect(() => {
    if (!activeTask || !project || project.id !== id) return;
    if (activeTask.project_id !== id) return;

    if (activeTask.status === "progress" && activeTask.task_type === "render") {
      const activeJob = project.render_jobs?.find(
        (j: RenderJob) =>
          j.status === "rendering" || j.status === "processing" || j.status === "queued"
      );
      if (!activeJob) {
        setActiveTask(null, id);
      }
    }
  }, [project, id, activeTask, setActiveTask]);

  if (isLoading) {
    return (
      <div className="workspace-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p role="status" className="text-sm text-muted-foreground">
          Memuat Generative Motion Graphic Studio...
        </p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="workspace-theme flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <p role="alert" className="mb-4 text-sm text-destructive">
          Project tidak ditemukan atau gagal dimuat.
        </p>
        <Link href="/">
          <Button variant="workspace-secondary" size="workspace-sm">
            Kembali ke Project
          </Button>
        </Link>
      </div>
    );
  }

  const scenesCount = project.motion_scenes?.length || 0;
  const readyCount =
    project.motion_scenes?.filter((s) => s.status === "ready" && Boolean(s.component_code))
      .length || 0;

  const motionTabs: StudioNavTab[] = [
    {
      id: "motion_script",
      label: "1. Naskah & Konsep",
      icon: FileText,
      badge: scenesCount > 0 ? `${scenesCount} Adegan` : undefined,
    },
    {
      id: "motion_voice",
      label: "2. Suara & Cue Sync",
      icon: Volume2,
      badge: project.audio || project.audio_track ? "Siap" : undefined,
    },
    {
      id: "motion_studio",
      label: "3. Motion Studio (TSX)",
      icon: Code2,
      badge: scenesCount > 0 ? `${readyCount}/${scenesCount}` : "Remotion",
    },
    {
      id: "motion_render",
      label: "4. Render MP4",
      icon: Download,
      badge: project.render_jobs?.length ? `${project.render_jobs.length} Job` : undefined,
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
      tabs={motionTabs}
      onRenameProject={handleRenameProject}
      isRenaming={updateProjectMutation.isPending}
      onRenderClick={() => setActiveTab("motion_render")}
    >
      {children}
    </StudioLayout>
  );
}


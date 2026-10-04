"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Film,
  FileText,
  Volume2,
  Layers,
  Download,
  Settings as SettingsIcon,
  Sparkles,
  Loader2,
  Edit3,
  Check,
  X,
} from "lucide-react";
import { useStudioStore, StudioTab } from "@/lib/store";
import { useProjectEvents } from "@/hooks/useProjectEvents";
import { useProject, useUpdateProject } from "@/hooks/useProjects";
import { GlobalTaskIndicator } from "@/components/common/GlobalTaskIndicator";
import { MediaPoolTab } from "@/components/media/MediaPoolTab";
import { NarrationTab } from "@/components/narration/NarrationTab";
import { TTSTab } from "@/components/tts/TTSTab";
import { TimelineTab } from "@/components/timeline/TimelineTab";
import { RenderTab } from "@/components/render/RenderTab";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const { activeTab, setActiveTab, activeTask, setActiveTask } = useStudioStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const updateProjectMutation = useUpdateProject();

  // Establish SSE real-time connection for worker tasks
  useProjectEvents(id);

  const { data: project, isLoading, error } = useProject(id);

  // Restore activeTask on page refresh from project database state if not yet set by SSE
  useEffect(() => {
    if (!project || activeTask) return;

    const downloadingVid = project.source_videos?.find((v: any) => v.status === "downloading");
    if (downloadingVid) {
      setActiveTask({
        project_id: project.id,
        task_type: "youtube_download",
        status: "progress",
        progress: downloadingVid.progress || 15,
        stage: "downloading",
        message: `Mendownload video '${downloadingVid.filename}'...`,
        error: null,
        data: { video_id: downloadingVid.id, filename: downloadingVid.filename },
      });
      return;
    }

    const processingVid = project.source_videos?.find((v: any) => v.status === "processing" || v.status === "pending");
    if (processingVid) {
      setActiveTask({
        project_id: project.id,
        task_type: "scene_detect",
        status: "progress",
        progress: processingVid.progress || 25,
        stage: "vision_tagging",
        message: `Menganalisis visual AI scene '${processingVid.filename}'...`,
        error: null,
        data: { video_id: processingVid.id, filename: processingVid.filename },
      });
      return;
    }

    const activeJob = project.render_jobs?.find(
      (j: any) => j.status === "rendering" || j.status === "processing" || j.status === "queued"
    );
    if (activeJob) {
      setActiveTask({
        project_id: project.id,
        task_type: "render",
        status: "progress",
        progress: activeJob.progress || 10,
        stage: "rendering",
        message: "Sedang me-render video final...",
        error: null,
        data: { job_id: activeJob.id },
      });
      return;
    }

    if (project.narration?.status === "tts_generating") {
      setActiveTask({
        project_id: project.id,
        task_type: "tts_align",
        status: "progress",
        progress: 25,
        stage: "tts_synthesizing",
        message: "Mensintesis audio narasi AI...",
        error: null,
        data: {},
      });
    }
  }, [project, activeTask, setActiveTask]);

  // Clean up activeTask if the task is already finished in DB
  useEffect(() => {
    if (!activeTask || !project) return;
    if (activeTask.status === "progress") {
      const vidId = activeTask.data?.video_id;
      const vid = vidId ? project.source_videos?.find((v: any) => v.id === vidId) : null;

      if (activeTask.task_type === "youtube_download") {
        // If video is no longer downloading, the task has transitioned to scene_detect or finished
        if (vid && vid.status !== "downloading") {
          setActiveTask(null);
        }
      }

      if (activeTask.task_type === "scene_detect") {
        if (vid && vid.status === "ready") {
          setActiveTask(null);
        }
      }
    }
  }, [project, activeTask, setActiveTask]);


  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#090A0F] text-white">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Memuat Studio Project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#090A0F] text-white">
        <p className="text-sm text-rose-400 mb-4">Project tidak ditemukan atau gagal dimuat.</p>
        <Link href="/" className="px-4 py-2 bg-surface rounded-xl border border-surface-border text-xs">
          Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  const tabs: { id: StudioTab; label: string; icon: any; badge?: string }[] = [
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
      badge: project.audio ? "Siap" : undefined,
    },
    {
      id: "timeline",
      label: "4. Timeline & Subtitle",
      icon: Layers,
      badge: project.timeline?.clips?.length ? `${project.timeline.clips.length} Klip` : undefined,
    },
    {
      id: "render",
      label: "5. Render & Export",
      icon: Download,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F]">
      {/* Top Header */}
      <header className="border-b border-surface-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition"
              title="Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <div>
              {isEditingTitle ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!editTitle.trim()) return;
                    updateProjectMutation.mutate(
                      {
                        id: project.id,
                        data: { name: editTitle.trim() },
                      },
                      {
                        onSuccess: () => setIsEditingTitle(false),
                      }
                    );
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    className="px-2.5 py-1 text-sm font-bold text-white bg-surface rounded-lg border border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 max-w-xs sm:max-w-sm"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={updateProjectMutation.isPending}
                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center justify-center shadow-sm"
                    title="Simpan Nama"
                  >
                    {updateProjectMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(false)}
                    className="p-1.5 rounded-lg bg-surface hover:bg-white/10 text-slate-400 hover:text-white border border-surface-border transition"
                    title="Batal"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h1
                    onClick={() => {
                      setEditTitle(project.name);
                      setIsEditingTitle(true);
                    }}
                    className="text-base font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md cursor-pointer hover:text-brand-300 transition"
                    title="Klik untuk mengubah nama project"
                  >
                    {project.name}
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTitle(project.name);
                      setIsEditingTitle(true);
                    }}
                    className="text-slate-500 hover:text-brand-300 p-1 rounded-md hover:bg-white/5 transition opacity-60 group-hover:opacity-100"
                    title="Edit Nama Project"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    {project.aspect_ratio} • {project.resolution}
                  </span>
                </div>
              )}
              <p className="text-[11px] text-slate-400">Cliper Pro Auto Studio</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/settings"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover border border-surface-border transition"
              title="Model Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </Link>

            <button
              onClick={() => setActiveTab("render")}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-xs shadow-lg shadow-brand-500/25 flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Render Short Video</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-6 flex gap-2 overflow-x-auto border-t border-surface-border/40 py-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                    : "text-slate-400 hover:text-white hover:bg-surface-hover"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? "bg-white/20 text-white" : "bg-surface border border-surface-border text-slate-400"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Global Real-Time Worker Task Progress Indicator */}
      <GlobalTaskIndicator />

      {/* Main Tab Body */}
      <main
        className={
          activeTab === "timeline"
            ? "w-full max-w-[1920px] mx-auto px-3 sm:px-5 py-2 flex-1 flex flex-col min-h-0"
            : "max-w-7xl mx-auto px-6 py-8 flex-1 w-full"
        }
      >

        {activeTab === "media" && <MediaPoolTab project={project} />}
        {activeTab === "narration" && <NarrationTab project={project} />}
        {activeTab === "tts" && <TTSTab project={project} />}
        {activeTab === "timeline" && <TimelineTab project={project} />}
        {activeTab === "render" && <RenderTab project={project} />}
      </main>
    </div>
  );
}

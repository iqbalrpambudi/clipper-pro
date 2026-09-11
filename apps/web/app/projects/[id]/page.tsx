"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Film,
  FileText,
  Volume2,
  Layers,
  Subtitles,
  Download,
  Settings as SettingsIcon,
  Sparkles,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore, StudioTab } from "@/lib/store";
import { MediaPoolTab } from "@/components/media/MediaPoolTab";
import { NarrationTab } from "@/components/narration/NarrationTab";
import { TTSTab } from "@/components/tts/TTSTab";
import { TimelineTab } from "@/components/timeline/TimelineTab";
import { SubtitleStudioTab } from "@/components/subtitles/SubtitleStudioTab";
import { RenderTab } from "@/components/render/RenderTab";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectStudioPage({ params }: PageProps) {
  const { id } = use(params);
  const { activeTab, setActiveTab } = useStudioStore();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.getProject(id),
    staleTime: 10000,
    refetchInterval: (query) => {
      const p = query.state.data;
      const isVideoBusy = p?.source_videos?.some(
        (v: any) => v.status === "processing" || v.status === "pending" || v.status === "downloading"
      );
      const isAudioBusy = p?.audio?.status === "generating" || p?.audio?.status === "processing";
      const isRenderBusy = p?.render_jobs?.some(
        (j: any) => j.status === "processing" || j.status === "pending"
      );
      const isNarrationBusy = p?.narration?.status === "generating";

      // Rapid reactive polling (1.5s) while any background AI task is active
      return isVideoBusy || isAudioBusy || isRenderBusy || isNarrationBusy ? 1500 : false;
    },
  });

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
      label: "4. Timeline",
      icon: Layers,
      badge: project.timeline?.clips?.length ? `${project.timeline.clips.length} Klip` : undefined,
    },
    {
      id: "subtitles",
      label: "5. Subtitle Karaoke",
      icon: Subtitles,
      badge: project.subtitle_style?.preset_name?.slice(0, 5),
    },
    {
      id: "render",
      label: "6. Render & Export",
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
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight truncate max-w-xs sm:max-w-md">
                  {project.name}
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {project.aspect_ratio} • {project.resolution}
                </span>
              </div>
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

      {/* Main Tab Body */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        {activeTab === "media" && <MediaPoolTab project={project} />}
        {activeTab === "narration" && <NarrationTab project={project} />}
        {activeTab === "tts" && <TTSTab project={project} />}
        {activeTab === "timeline" && <TimelineTab project={project} />}
        {activeTab === "subtitles" && <SubtitleStudioTab project={project} />}
        {activeTab === "render" && <RenderTab project={project} />}
      </main>
    </div>
  );
}

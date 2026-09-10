"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Film,
  Volume2,
  Subtitles,
  Clock,
  ArrowRight,
  MoveHorizontal,
  Layers,
  Check,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Timeline, TimelineClip, Scene, AudioTrack } from "@/types";

interface TimelineTabProps {
  project: Project & {
    timeline?: Timeline | null;
    scenes: Scene[];
    audio?: AudioTrack | null;
  };
}

export function TimelineTab({ project }: TimelineTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab, currentTime, setCurrentTime } = useStudioStore();

  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [clips, setClips] = useState<TimelineClip[]>(project.timeline?.clips || []);

  const autoMatchMutation = useMutation({
    mutationFn: () => api.autoMatchTimeline(project.id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setClips(data.clips);
      showToast("Scene berhasil dicocokkan otomatis dengan naskah!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mencocokkan scene", "error");
    },
  });

  const saveTimelineMutation = useMutation({
    mutationFn: () => api.updateTimeline(project.id, { clips }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Susunan timeline berhasil disimpan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan timeline", "error");
    },
  });

  const handleSwapScene = (scene: Scene) => {
    if (selectedClipIndex === null) {
      showToast("Pilih slot klip pada timeline terlebih dahulu untuk mengganti scene", "info");
      return;
    }

    const updated = [...clips];
    const target = updated[selectedClipIndex];
    const duration = target.timeline_end - target.timeline_start;

    updated[selectedClipIndex] = {
      ...target,
      scene_id: scene.id,
      source_video_id: scene.source_video_id,
      thumbnail_url: scene.thumbnail_url,
      clip_start: scene.start_time,
      clip_end: scene.start_time + duration,
    };

    setClips(updated);
    showToast(`Klip #${selectedClipIndex + 1} diganti dengan scene baru`, "success");
  };

  const totalDuration = clips.length > 0 ? clips[clips.length - 1].timeline_end : 0;

  return (
    <div className="space-y-8">
      {/* Top Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-400" />
            Timeline Editor ({clips.length} Klip Video)
          </h3>
          <p className="text-xs text-slate-400">
            Total Durasi: <span className="font-mono text-white font-bold">{Math.round(totalDuration)}s</span> •
            Klik klip untuk mengganti scene dari Media Pool di bawah.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            className="px-4 py-2 rounded-xl bg-brand-600/20 border border-brand-500/40 hover:bg-brand-500/30 text-brand-300 font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
            <span>{autoMatchMutation.isPending ? "Mencocokkan..." : "Auto-Match dengan AI"}</span>
          </button>

          <button
            onClick={() => saveTimelineMutation.mutate()}
            disabled={saveTimelineMutation.isPending}
            className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs transition"
          >
            {saveTimelineMutation.isPending ? "Menyimpan..." : "Simpan Timeline"}
          </button>
        </div>
      </div>

      {/* Multi-Track Timeline Visualizer */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        {/* Track 1: Video Clips */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-brand-400" /> Track 1: Klip Video (Scene Matching)
            </span>
            <span className="text-[10px]">Klik klip untuk memilih & swap</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 pt-1">
            {clips.map((clip, idx) => {
              const isSelected = selectedClipIndex === idx;
              const dur = Math.round(clip.timeline_end - clip.timeline_start);
              return (
                <div
                  key={clip.id || idx}
                  onClick={() => setSelectedClipIndex(idx)}
                  className={`min-w-[140px] max-w-[180px] flex-1 rounded-xl p-2 border cursor-pointer transition flex flex-col justify-between ${
                    isSelected
                      ? "border-brand-400 bg-brand-500/20 shadow-lg shadow-brand-500/20"
                      : "border-surface-border bg-surface hover:border-slate-500"
                  }`}
                >
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 mb-2">
                    {clip.thumbnail_url ? (
                      <img
                        src={clip.thumbnail_url}
                        alt="Clip thumbnail"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <Film className="w-5 h-5" />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white">
                      #{idx + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white">
                      {dur}s
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-300 line-clamp-2 leading-tight mb-2">
                    {clip.text || `Klip ${idx + 1}`}
                  </p>

                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-1 border-t border-surface-border/50">
                    <span>{Math.round(clip.timeline_start)}s</span>
                    <span>{Math.round(clip.timeline_end)}s</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Track 2: Audio Narasi */}
        <div className="pt-2 border-t border-surface-border">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> Track 2: Audio Narasi (TTS)
            </span>
          </div>

          <div className="h-10 bg-emerald-950/20 border border-emerald-500/30 rounded-xl px-4 flex items-center justify-between text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Voice: {project.audio?.voice || "Puck"}</span>
            </div>
            <span className="font-mono text-xs">{Math.round(project.audio?.duration || totalDuration)} detik</span>
          </div>
        </div>

        {/* Track 3: Subtitle Karaoke */}
        <div className="pt-2 border-t border-surface-border">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Subtitles className="w-3.5 h-3.5 text-accent-yellow" /> Track 3: Subtitle Karaoke ASS
            </span>
          </div>

          <div className="h-8 bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl px-4 flex items-center justify-between text-xs text-accent-yellow">
            <span>Sinkronisasi Milidetik Word-Level</span>
            <span className="text-[10px] uppercase font-mono">ASS Karaoke Enabled</span>
          </div>
        </div>
      </div>

      {/* Media Pool Drawer for Manual Swap */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-brand-400" />
              Koleksi Scene Media Pool (Pilih untuk Swap Klip #{selectedClipIndex !== null ? selectedClipIndex + 1 : "?"})
            </h4>
            <p className="text-xs text-slate-400">
              {selectedClipIndex !== null
                ? `Pilih salah satu scene di bawah untuk menggantikan klip #${selectedClipIndex + 1}`
                : "Klik salah satu klip di timeline di atas, lalu klik scene di bawah untuk mengganti."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 max-h-72 overflow-y-auto pr-1">
          {project.scenes.map((sc) => (
            <div
              key={sc.id}
              onClick={() => handleSwapScene(sc)}
              className="glass-panel rounded-xl overflow-hidden border border-surface-border hover:border-brand-500 cursor-pointer transition flex flex-col group"
            >
              <div className="relative aspect-video bg-black/60 overflow-hidden">
                {sc.thumbnail_url ? (
                  <img
                    src={sc.thumbnail_url}
                    alt={sc.description || "scene"}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    <Film className="w-5 h-5" />
                  </div>
                )}
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white">
                  {sc.duration}s
                </span>
              </div>
              <div className="p-2 flex-1 flex flex-col justify-between">
                <p className="text-[10px] text-slate-200 line-clamp-2 leading-tight mb-1">
                  {sc.description || "Scene"}
                </p>
                <button
                  type="button"
                  className="w-full py-1 text-[9px] font-bold rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 group-hover:bg-brand-500 group-hover:text-white transition text-center"
                >
                  Pilih Scene Ini
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-4 flex justify-end">
          <button
            onClick={() => setActiveTab("subtitles")}
            className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <span>Lanjut ke Subtitle Karaoke Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

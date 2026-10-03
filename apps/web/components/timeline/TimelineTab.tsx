"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Film,
  Volume2,
  Subtitles,
  ArrowRight,
  Layers,
  Check,
  RotateCcw,
  Play,
  Scissors,
  Sliders,
  Maximize2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { ScenePreviewModal } from "../media/ScenePreviewModal";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Timeline, TimelineClip, Scene, AudioTrack, Narration } from "@/types";

interface TimelineTabProps {
  project: Project & {
    timeline?: Timeline | null;
    scenes: Scene[];
    audio?: AudioTrack | null;
    narration?: Narration | null;
  };
}

export function TimelineTab({ project }: TimelineTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<{
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    startTime: number;
    endTime: number;
    title: string;
    description?: string | null;
    tags?: string[];
  } | null>(null);
  const [clips, setClips] = useState<TimelineClip[]>(project.timeline?.clips || []);

  // Resync local clips only when the server timeline changed AND there are no
  // unsaved local edits. Identity changes on every refetch, so compare content.
  const serverClipsKeyRef = useRef<string>(JSON.stringify(project.timeline?.clips || []));
  const localClipsKeyRef = useRef<string>(serverClipsKeyRef.current);
  useEffect(() => {
    localClipsKeyRef.current = JSON.stringify(clips);
  }, [clips]);
  useEffect(() => {
    const serverClips = project.timeline?.clips;
    if (!serverClips) return;
    const key = JSON.stringify(serverClips);
    if (key === serverClipsKeyRef.current) return;
    const isDirty = localClipsKeyRef.current !== serverClipsKeyRef.current;
    serverClipsKeyRef.current = key;
    if (!isDirty) setClips(serverClips);
  }, [project.timeline?.clips]);

  // Filter state for Scene Drawer in Timeline (All, Used in Timeline, Available)
  const [sceneDrawerFilter, setSceneDrawerFilter] = useState<"all" | "used" | "available">("all");

  // Map scene_id -> list of 1-indexed clip positions in the timeline
  const usedSceneMap = useMemo(() => {
    const map = new Map<string, number[]>();
    clips.forEach((clip, index) => {
      if (clip.scene_id) {
        const list = map.get(clip.scene_id) || [];
        list.push(index + 1);
        map.set(clip.scene_id, list);
      }
    });
    return map;
  }, [clips]);

  const usedCount = useMemo(() => {
    return project.scenes.filter((s) => usedSceneMap.has(s.id)).length;
  }, [project.scenes, usedSceneMap]);

  const availableCount = project.scenes.length - usedCount;

  const sortedAllScenes = useMemo(() => {
    if (!project.scenes) return [];
    return [...project.scenes].sort((a, b) => {
      if (a.source_video_id !== b.source_video_id) {
        return a.source_video_id.localeCompare(b.source_video_id);
      }
      if (a.scene_index !== b.scene_index) {
        return a.scene_index - b.scene_index;
      }
      return a.start_time - b.start_time;
    });
  }, [project.scenes]);

  const filteredScenes = useMemo(() => {
    if (sceneDrawerFilter === "used") {
      return sortedAllScenes.filter((s) => usedSceneMap.has(s.id));
    }
    if (sceneDrawerFilter === "available") {
      return sortedAllScenes.filter((s) => !usedSceneMap.has(s.id));
    }
    return sortedAllScenes;
  }, [sortedAllScenes, sceneDrawerFilter, usedSceneMap]);

  // Live Progress State for Auto-Match & Auto-Refresh
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchElapsed, setMatchElapsed] = useState(0);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});

  // Auto-match is a single blocking request, so only elapsed time is real. No fake %.
  useEffect(() => {
    if (!isAutoMatching) return;
    const timer = setInterval(() => setMatchElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isAutoMatching]);

  const autoMatchMutation = useMutation({
    mutationFn: () => {
      setIsAutoMatching(true);
      setMatchElapsed(0);
      return api.autoMatchTimeline(project.id);
    },
    onSuccess: async (data) => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      setClips(data.clips);
      showToast("Scene berhasil dicocokkan otomatis dengan naskah!", "success");
      setIsAutoMatching(false);
    },
    onError: (err: any) => {
      setIsAutoMatching(false);
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

  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  const clearTimelineMutation = useMutation({
    mutationFn: () => api.clearTimeline(project.id),
    onSuccess: () => {
      setClips([]);
      setSelectedClipIndex(null);
      setIsClearConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Timeline berhasil dikosongkan!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mengosongkan timeline", "error");
    },
  });

  // Metode C: Precision Trim Handlers untuk klip yang sedang dipilih
  const updateSelectedClipTrim = (updates: { clip_start?: number; clip_end?: number }) => {
    if (selectedClipIndex === null) return;
    const updated = [...clips];
    const target = { ...updated[selectedClipIndex] };
    const originalScene = project.scenes.find((s) => s.id === target.scene_id);

    const minAllowedStart = originalScene ? originalScene.start_time : 0;
    const maxAllowedEnd = originalScene ? originalScene.end_time : (target.clip_start + 20);

    let newStart = updates.clip_start !== undefined ? updates.clip_start : target.clip_start;
    let newEnd = updates.clip_end !== undefined ? updates.clip_end : target.clip_end;

    // Pastikan batas aman
    newStart = Math.max(minAllowedStart, newStart);
    newEnd = Math.min(maxAllowedEnd, newEnd);

    // Durasi minimum klip 0.5s
    if (newEnd - newStart < 0.5) {
      if (updates.clip_start !== undefined) {
        newStart = Number((newEnd - 0.5).toFixed(2));
      } else {
        newEnd = Number((newStart + 0.5).toFixed(2));
      }
    }

    target.clip_start = Number(newStart.toFixed(2));
    target.clip_end = Number(newEnd.toFixed(2));
    updated[selectedClipIndex] = target;
    setClips(updated);
  };

  const handleTrimHead = (delta: number = 0.3) => {
    if (selectedClipIndex === null) return;
    const target = clips[selectedClipIndex];
    const newStart = Number((target.clip_start + delta).toFixed(2));
    updateSelectedClipTrim({ clip_start: newStart });
    showToast(`Titik awal klip dimajukan +${delta}s (head bleed terpotong)!`, "info");
  };

  const handleTrimTail = (delta: number = 0.3) => {
    if (selectedClipIndex === null) return;
    const target = clips[selectedClipIndex];
    const newEnd = Number((target.clip_end - delta).toFixed(2));
    updateSelectedClipTrim({ clip_end: newEnd });
    showToast(`Titik akhir klip dimundurkan -${delta}s (tail bleed terpotong)!`, "info");
  };

  const handleCenterSelectedClip = () => {
    if (selectedClipIndex === null) return;
    const target = clips[selectedClipIndex];
    const originalScene = project.scenes.find((s) => s.id === target.scene_id);
    if (!originalScene) return;

    const clipDur = Number((target.clip_end - target.clip_start).toFixed(2));
    const slack = originalScene.duration - clipDur;
    if (slack > 0) {
      const offset = Number((slack / 2.0).toFixed(2));
      const newStart = Number((originalScene.start_time + offset).toFixed(2));
      const newEnd = Number((newStart + clipDur).toFixed(2));
      updateSelectedClipTrim({ clip_start: newStart, clip_end: newEnd });
      showToast("Klip ini berhasil dipusatkan (center-trim)!", "success");
    } else {
      showToast("Durasi scene asli pas dengan klip", "info");
    }
  };

  const handleResetSelectedClipTrim = () => {
    if (selectedClipIndex === null) return;
    const target = clips[selectedClipIndex];
    const originalScene = project.scenes.find((s) => s.id === target.scene_id);
    if (!originalScene) return;

    updateSelectedClipTrim({
      clip_start: originalScene.start_time,
      clip_end: originalScene.end_time,
    });
    showToast("Rentang klip dikembalikan ke ukuran penuh scene asli", "info");
  };

  const handleSwapScene = (scene: Scene) => {
    if (selectedClipIndex === null) {
      showToast("Pilih slot klip pada timeline terlebih dahulu untuk mengganti scene", "info");
      return;
    }

    const updated = [...clips];
    const target = updated[selectedClipIndex];
    const duration = target.timeline_end - target.timeline_start;

    // Center-weighted extraction for swapped scene
    const slack = Math.max(0, scene.duration - duration);
    const offset = Number((slack / 2.0).toFixed(2));
    const cStart = Number((scene.start_time + offset).toFixed(2));
    const cEnd = Number((cStart + duration).toFixed(2));

    updated[selectedClipIndex] = {
      ...target,
      scene_id: scene.id,
      source_video_id: scene.source_video_id,
      thumbnail_url: scene.thumbnail_url,
      clip_start: cStart,
      clip_end: cEnd,
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

        <div className="flex items-center gap-2 flex-wrap">
          {clips.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearConfirmOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
              title="Kosongkan seluruh susunan klip pada timeline"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Kosongkan Timeline</span>
            </button>
          )}

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

      {/* Live Progress Card for Auto-Match */}
      {isAutoMatching && (
        <div className="p-4 rounded-xl bg-surface border border-brand-500/40 space-y-2.5 animate-fadeIn shadow-lg shadow-brand-500/5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-brand-300 font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400 shrink-0" />
              <span className="truncate max-w-sm sm:max-w-md">Mencocokkan scene dengan naskah...</span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span>{Math.floor(matchElapsed / 60)}:{String(matchElapsed % 60).padStart(2, "0")}</span>
            </div>
          </div>
          <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
            <div className="w-1/3 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full rounded-full animate-progress-indeterminate" />
          </div>
        </div>
      )}

      {/* Multi-Track Timeline Visualizer */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        {/* Track 1: Video Clips */}
        <div>
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Film className="w-3.5 h-3.5 text-brand-400" /> Track 1: Klip Video (Scene Matching)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" /> Anti-Flash Pacing (≥2.0s)
              </span>
            </div>
            <span className="text-[10px]">Klik klip untuk memilih & swap</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 pt-1">
            {clips.map((clip, idx) => {
              const isSelected = selectedClipIndex === idx;
              const dur = Number((clip.timeline_end - clip.timeline_start).toFixed(1));
              const isFlashWarning = dur < 1.8;
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
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-black/60 mb-2 group/thumb">
                    {clip.thumbnail_url && !brokenThumbnails[clip.id || `clip-${idx}`] ? (
                      <img
                        src={clip.thumbnail_url}
                        alt="Clip thumbnail"
                        className="w-full h-full object-cover"
                        onError={() => setBrokenThumbnails((prev) => ({ ...prev, [clip.id || `clip-${idx}`]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 gap-0.5">
                        <Film className="w-5 h-5 text-slate-600" />
                        <span className="text-[9px] font-mono text-slate-500">Klip #{idx + 1}</span>
                      </div>
                    )}

                    {/* Quick Preview Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewData({
                          videoUrl: clip.video_url,
                          thumbnailUrl: clip.thumbnail_url,
                          startTime: clip.clip_start,
                          endTime: clip.clip_end,
                          title: `Klip #${idx + 1}`,
                          description: clip.text || `Klip visual #${idx + 1}`,
                        });
                      }}
                      className="absolute inset-0 bg-black/45 opacity-0 group-hover/thumb:opacity-100 transition flex items-center justify-center cursor-pointer"
                      title="Preview Potongan Klip Ini"
                    >
                      <span className="w-7 h-7 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg transform hover:scale-110 transition">
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      </span>
                    </button>

                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white pointer-events-none">
                      #{idx + 1}
                    </span>

                    {isFlashWarning ? (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-amber-500/90 text-[8px] font-bold text-black flex items-center gap-0.5 shadow">
                        <AlertCircle className="w-2.5 h-2.5" /> &lt;1.8s
                      </span>
                    ) : clip.speed && Math.abs(clip.speed - 1.0) > 0.02 ? (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-indigo-500/80 text-[8px] font-mono text-white">
                        {clip.speed}x
                      </span>
                    ) : null}

                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white pointer-events-none">
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

        {/* Track 3: Subtitle Karaoke (Interactive Track) */}
        <div className="pt-2 border-t border-surface-border">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Subtitles className="w-3.5 h-3.5 text-accent-yellow" /> Track 3: Subtitle Karaoke ASS
            </span>
            <button
              type="button"
              onClick={() => setActiveTab("subtitles")}
              className="text-[11px] text-brand-400 hover:text-brand-300 transition flex items-center gap-1 hover:underline"
            >
              <span>Edit di Subtitle Studio</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {project.narration?.segments && project.narration.segments.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {(project.narration.segments as any[]).map((seg: any, sIdx: number) => {
                const durSec = ((seg.end_ms - seg.start_ms) / 1000).toFixed(1);
                return (
                  <div
                    key={seg.id || sIdx}
                    onClick={() => setActiveTab("subtitles")}
                    className="min-w-[140px] max-w-[220px] shrink-0 p-2.5 rounded-xl bg-accent-yellow/10 border border-accent-yellow/25 hover:border-accent-yellow/60 transition cursor-pointer flex flex-col justify-between group"
                    title="Klik untuk kustomisasi subtitle di Studio"
                  >
                    <div className="flex items-center justify-between text-[10px] text-accent-yellow/80 mb-1">
                      <span className="font-bold">#{sIdx + 1}</span>
                      <span className="font-mono text-[9px]">{durSec}s • {seg.words?.length || 0} kata</span>
                    </div>
                    <p className="text-[11px] text-white font-medium line-clamp-2 leading-tight">
                      {seg.text}
                    </p>
                    <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 pt-1.5 mt-1 border-t border-accent-yellow/15">
                      <span>{(seg.start_ms / 1000).toFixed(1)}s</span>
                      <span>{(seg.end_ms / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-9 bg-accent-yellow/10 border border-accent-yellow/20 rounded-xl px-4 flex items-center justify-between text-xs text-accent-yellow">
              <span>Belum ada segmen narasi subtitle</span>
              <span className="text-[10px] uppercase font-mono">Menunggu TTS</span>
            </div>
          )}
        </div>
      </div>

      {/* Metode C: Precision Clip Trim Panel for Selected Clip */}
      {selectedClipIndex !== null && clips[selectedClipIndex] && (() => {
        const curClip = clips[selectedClipIndex];
        const origScene = project.scenes.find((s) => s.id === curClip.scene_id);
        const clipDur = Number((curClip.clip_end - curClip.clip_start).toFixed(2));
        const sceneMin = origScene ? origScene.start_time : 0;
        const sceneMax = origScene ? origScene.end_time : (curClip.clip_start + 10);
        const sceneDur = origScene ? origScene.duration : clipDur;

        return (
          <div className="glass-panel rounded-2xl p-6 border border-brand-500/50 space-y-4 shadow-xl shadow-brand-500/5 animate-fadeIn bg-surface/90">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-surface-border/80 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-300 font-bold text-xs">
                  #{selectedClipIndex + 1}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-accent-yellow" />
                    Koreksi Presisi Potongan Klip #{selectedClipIndex + 1} (Metode C)
                  </h4>
                  <p className="text-xs text-slate-300 line-clamp-1">
                    {curClip.text || "Potongan visual scene"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-surface border border-surface-border text-slate-300 font-mono">
                  Durasi Klip: <strong className="text-brand-300">{clipDur}s</strong>
                </span>
                {origScene && (
                  <span className="px-2.5 py-1 rounded-lg bg-surface border border-surface-border text-slate-400 font-mono text-[11px]">
                    Scene Asli: {origScene.start_time.toFixed(1)}s – {origScene.end_time.toFixed(1)}s ({sceneDur.toFixed(1)}s)
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewData({
                    videoUrl: curClip.video_url,
                    thumbnailUrl: curClip.thumbnail_url,
                    startTime: curClip.clip_start,
                    endTime: curClip.clip_end,
                    title: `Preview Trim Klip #${selectedClipIndex + 1}`,
                    description: `Rentang potong aktif: ${curClip.clip_start.toFixed(2)}s – ${curClip.clip_end.toFixed(2)}s (${clipDur}s)`,
                  })}
                  className="px-3 py-1 rounded-lg bg-brand-600/30 border border-brand-500/50 hover:bg-brand-500/40 text-brand-200 font-semibold flex items-center gap-1.5 transition"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Preview Trim</span>
                </button>
              </div>
            </div>

            {/* Quick Trim Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => handleTrimHead(0.3)}
                className="px-3 py-2 rounded-xl bg-surface hover:bg-surface-border border border-surface-border hover:border-brand-500/60 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
                title="Pangkas 0.3 detik di awal klip untuk menghilangkan kebocoran shot/transisi pohon di awal"
              >
                <Scissors className="w-3.5 h-3.5 text-accent-yellow" />
                <span>✂️ Pangkas Depan (+0.3s)</span>
              </button>

              <button
                type="button"
                onClick={() => handleTrimTail(0.3)}
                className="px-3 py-2 rounded-xl bg-surface hover:bg-surface-border border border-surface-border hover:border-brand-500/60 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
                title="Pangkas 0.3 detik di akhir klip untuk menghilangkan kebocoran shot/transisi pohon di akhir"
              >
                <Scissors className="w-3.5 h-3.5 text-rose-400 rotate-180" />
                <span>✂️ Pangkas Belakang (-0.3s)</span>
              </button>

              <button
                type="button"
                onClick={handleCenterSelectedClip}
                className="px-3 py-2 rounded-xl bg-surface hover:bg-surface-border border border-surface-border hover:border-emerald-500/60 text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition"
                title="Ambil bagian tengah persis dari scene sumber yang paling aman dari kebocoran"
              >
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>🎯 Pusatkan Klip Ini</span>
              </button>

              <button
                type="button"
                onClick={handleResetSelectedClipTrim}
                className="px-3 py-2 rounded-xl bg-surface hover:bg-surface-border border border-surface-border text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-2 transition"
                title="Kembalikan titik potong ke batas awal dan akhir scene asli"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>↺ Reset ke Asli</span>
              </button>
            </div>

            {/* Precision Slider Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5 p-3 rounded-xl bg-surface/60 border border-surface-border/60">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3 h-3 text-brand-400" /> Titik Awal Klip (In-Point)
                  </label>
                  <span className="font-mono font-bold text-brand-300">{curClip.clip_start.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={sceneMin}
                  max={Number((curClip.clip_end - 0.5).toFixed(2))}
                  step={0.05}
                  value={curClip.clip_start}
                  onChange={(e) => updateSelectedClipTrim({ clip_start: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-surface-card rounded-lg cursor-pointer accent-brand-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>Mulai: {sceneMin.toFixed(1)}s</span>
                  <span>Maks: {(curClip.clip_end - 0.5).toFixed(1)}s</span>
                </div>
              </div>

              <div className="space-y-1.5 p-3 rounded-xl bg-surface/60 border border-surface-border/60">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3 h-3 text-brand-400" /> Titik Akhir Klip (Out-Point)
                  </label>
                  <span className="font-mono font-bold text-brand-300">{curClip.clip_end.toFixed(2)}s</span>
                </div>
                <input
                  type="range"
                  min={Number((curClip.clip_start + 0.5).toFixed(2))}
                  max={sceneMax}
                  step={0.05}
                  value={curClip.clip_end}
                  onChange={(e) => updateSelectedClipTrim({ clip_end: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-surface-card rounded-lg cursor-pointer accent-brand-500"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>Min: {(curClip.clip_start + 0.5).toFixed(1)}s</span>
                  <span>Akhir: {sceneMax.toFixed(1)}s</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
              <p>
                💡 <em>Gunakan tombol pangkas di atas atau geser slider untuk memotong sisa potongan yang tidak pas. Jangan lupa klik <strong>Simpan Timeline</strong> setelah selesai.</em>
              </p>
              <button
                type="button"
                onClick={() => saveTimelineMutation.mutate()}
                disabled={saveTimelineMutation.isPending}
                className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-md transition"
              >
                {saveTimelineMutation.isPending ? "Menyimpan..." : "Simpan Koreksi Klip"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Media Pool Drawer for Manual Swap */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
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

          {/* Filter Pills for Scene Drawer */}
          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-surface-border">
            <button
              type="button"
              onClick={() => setSceneDrawerFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                sceneDrawerFilter === "all"
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Semua</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-surface-border">
                {project.scenes.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSceneDrawerFilter("used")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                sceneDrawerFilter === "used"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
              <span>Di Timeline</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-surface-border text-emerald-400 font-bold">
                {usedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSceneDrawerFilter("available")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                sceneDrawerFilter === "available"
                  ? "bg-slate-700/50 text-white border border-slate-600 shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>Tersedia</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface border border-surface-border text-slate-300">
                {availableCount}
              </span>
            </button>
          </div>
        </div>

        {filteredScenes.length === 0 ? (
          <div className="p-8 text-center border border-surface-border/50 rounded-xl bg-surface/40">
            <p className="text-xs text-slate-400">
              {sceneDrawerFilter === "used"
                ? "Belum ada scene yang digunakan pada timeline saat ini."
                : "Semua scene dari video telah terpakai di timeline."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 max-h-80 overflow-y-auto pr-1">
            {filteredScenes.map((sc) => {
              const isUsed = usedSceneMap.has(sc.id);
              const clipIndices = usedSceneMap.get(sc.id) || [];
              const isCurrentlySelectedClipScene =
                selectedClipIndex !== null && clips[selectedClipIndex]?.scene_id === sc.id;

              return (
                <div
                  key={sc.id}
                  onClick={() => handleSwapScene(sc)}
                  className={`glass-panel rounded-xl overflow-hidden cursor-pointer transition flex flex-col group ${
                    isCurrentlySelectedClipScene
                      ? "border-accent-yellow bg-accent-yellow/10 ring-2 ring-accent-yellow/40 shadow-lg shadow-accent-yellow/10"
                      : isUsed
                      ? "border-emerald-500/50 hover:border-emerald-400 bg-surface/85 shadow-md shadow-emerald-950/20 ring-1 ring-emerald-500/20"
                      : "border-surface-border hover:border-brand-500"
                  }`}
                >
                  <div className="relative aspect-video bg-black/60 overflow-hidden group/sc">
                    {sc.thumbnail_url && !brokenThumbnails[sc.id] ? (
                      <img
                        src={sc.thumbnail_url}
                        alt={sc.description || "scene"}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                        onError={() => setBrokenThumbnails((prev) => ({ ...prev, [sc.id]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-500 gap-0.5">
                        <Film className="w-5 h-5 text-slate-600" />
                        <span className="text-[9px] font-mono text-slate-500">Scene #{sc.scene_index + 1}</span>
                      </div>
                    )}

                    {/* Preview scene button in drawer */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewData({
                          videoUrl: sc.video_url,
                          thumbnailUrl: sc.thumbnail_url,
                          startTime: sc.start_time,
                          endTime: sc.end_time,
                          title: `Scene #${sc.scene_index + 1}`,
                          description: sc.description,
                          tags: sc.tags,
                        });
                      }}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover/sc:opacity-100 transition flex items-center justify-center"
                      title="Preview Scene Ini Sebelum Swap"
                    >
                      <span className="w-7 h-7 rounded-full bg-black/70 hover:bg-brand-600 border border-white/20 text-white flex items-center justify-center shadow-md transform hover:scale-110 transition">
                        <Play className="w-3.5 h-3.5 ml-0.5" />
                      </span>
                    </button>

                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white pointer-events-none">
                      {sc.duration}s
                    </span>

                    {/* Top Badges: Scene Index & Timeline Badge */}
                    <div className="absolute top-1 left-1 flex items-center gap-1 max-w-[90%]">
                      <span className="px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-slate-200 shrink-0">
                        #{sc.scene_index + 1}
                      </span>
                      {isUsed && (
                        <span
                          className="px-1.5 py-0.5 rounded-md bg-emerald-950/90 border border-emerald-400/70 text-[9px] font-bold text-emerald-300 flex items-center gap-0.5 shadow-md truncate backdrop-blur-sm"
                          title={`Terpakai di Timeline pada Klip #${clipIndices.join(", #")}`}
                        >
                          <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3] shrink-0" />
                          <span className="truncate">Klip #{clipIndices.slice(0, 2).join(", #")}{clipIndices.length > 2 ? "..." : ""}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-2 flex-1 flex flex-col justify-between gap-1.5">
                    <p className="text-[10px] text-slate-200 line-clamp-2 leading-tight">
                      {sc.description || "Scene"}
                    </p>

                    <div className="space-y-1">
                      <button
                        type="button"
                        className={`w-full py-1 text-[9px] font-bold rounded transition text-center ${
                          isCurrentlySelectedClipScene
                            ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40 font-extrabold"
                            : isUsed
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 group-hover:bg-emerald-500 group-hover:text-white"
                            : "bg-brand-500/20 text-brand-300 border border-brand-500/30 group-hover:bg-brand-500 group-hover:text-white"
                        }`}
                      >
                        {isCurrentlySelectedClipScene
                          ? "✓ Klip Aktif Ini"
                          : selectedClipIndex !== null
                          ? isUsed
                            ? `Swap Klip #${selectedClipIndex + 1} (Terpakai)`
                            : `Swap Klip #${selectedClipIndex + 1}`
                          : "Pilih Scene Ini"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <button
            onClick={() => setActiveTab("subtitles")}
            className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
          >
            <span>Lanjut ke Subtitle</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Scene Preview Modal */}
      {previewData && (
        <ScenePreviewModal
          isOpen={Boolean(previewData)}
          onClose={() => setPreviewData(null)}
          videoUrl={previewData.videoUrl}
          thumbnailUrl={previewData.thumbnailUrl}
          startTime={previewData.startTime}
          endTime={previewData.endTime}
          title={previewData.title}
          description={previewData.description}
          tags={previewData.tags}
        />
      )}

      {/* Modal: Confirm Clear Timeline */}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-pop">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Kosongkan Timeline?</h3>
                <p className="text-xs text-slate-400">Seluruh klip video pada timeline akan dihapus</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin mengosongkan seluruh susunan timeline? Anda dapat menyusun klip baru secara manual atau menggunakan <span className="font-semibold text-white">Auto-Match AI</span> kembali kapan saja.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border/60">
              <button
                type="button"
                onClick={() => setIsClearConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={clearTimelineMutation.isPending}
                onClick={() => clearTimelineMutation.mutate()}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/20 transition flex items-center gap-2"
              >
                {clearTimelineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Kosongkan Timeline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
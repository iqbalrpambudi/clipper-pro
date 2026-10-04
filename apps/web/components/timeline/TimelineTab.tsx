"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Save,
  Trash2,
  ArrowRight,
  Film,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Subtitles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { ScenePreviewModal } from "../media/ScenePreviewModal";
import { TimelineMonitor, SeekRequest } from "./TimelineMonitor";
import { TimelineTracks, SceneDropTarget } from "./TimelineTracks";
import { TimelineMediaPool } from "./TimelineMediaPool";
import { ClipInspector } from "./ClipInspector";
import { SubtitleCustomizePanel } from "../subtitles/SubtitleCustomizePanel";
import { useHistoryState } from "@/hooks/useHistoryState";
import { useAudioPeaks } from "@/hooks/useAudioPeaks";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Timeline, TimelineClip, Scene, AudioTrack, Narration, SourceVideo } from "@/types";
import {
  SceneMap,
  appendScene,
  canSplitAt,
  cutPoints,
  deleteClip,
  edgeRange,
  fillWholeScene,
  insertSceneAt,
  replaceScene,
  rollEdge,
  setClipSpeed,
  splitAt,
  swapWithNeighbor,
  timelineEnd,
} from "@/lib/timeline/editOps";

interface TimelineTabProps {
  project: Project & {
    timeline?: Timeline | null;
    scenes: Scene[];
    audio?: AudioTrack | null;
    narration?: Narration | null;
    source_videos?: SourceVideo[];
  };
}

export function TimelineTab({ project }: TimelineTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  // Undo/redo history container for clips
  const initialClips = useMemo(() => project.timeline?.clips || [], [project.timeline?.clips]);
  const {
    value: clips,
    set: setClips,
    begin: beginGesture,
    cancelIfUnchanged,
    undo,
    redo,
    reset: resetClips,
    canUndo,
    canRedo,
  } = useHistoryState<TimelineClip[]>(initialClips);

  // Sync server updates only if there are no local unsaved edits
  const serverClipsKey = useRef(JSON.stringify(initialClips));
  useEffect(() => {
    const key = JSON.stringify(project.timeline?.clips || []);
    if (key !== serverClipsKey.current) {
      serverClipsKey.current = key;
      resetClips(project.timeline?.clips || []);
    }
  }, [project.timeline?.clips, resetClips]);

  // Is dirty state
  const isDirty = useMemo(() => {
    return JSON.stringify(clips) !== serverClipsKey.current;
  }, [clips]);

  // Scene lookup maps
  const sceneMap: SceneMap = useMemo(() => {
    const map = new Map<string, Scene>();
    (project.scenes || []).forEach((s) => map.set(s.id, s));
    return map;
  }, [project.scenes]);

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

  // Playhead & transport state
  const [time, setTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<SeekRequest>({ t: 0, id: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [isLoopingClip, setIsLoopingClip] = useState(false);

  // Left sidebar & drawer state: "pool" (Media Pool), "inspector" (Clip Inspector), or "subtitles" (Subtitle Customizer)
  const [activeSideTab, setActiveSideTab] = useState<"pool" | "inspector" | "subtitles">("pool");
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);

  // Resizable panel dimensions: drawer width and tracks panel height
  const [drawerWidth, setDrawerWidth] = useState<number>(380);
  const [tracksHeight, setTracksHeight] = useState<number>(230);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const [isResizingTracks, setIsResizingTracks] = useState(false);

  // Vertical layout (9:16 or any non-16:9) resizer for vertical preview column width
  const [verticalPreviewWidth, setVerticalPreviewWidth] = useState<number>(440);
  const [isResizingVerticalPreview, setIsResizingVerticalPreview] = useState(false);

  const isVertical = project.aspect_ratio !== "16:9";

  // Active subtitle style preview state (syncs live to monitor)
  const [liveSubtitleStyle, setLiveSubtitleStyle] = useState(project.subtitle_style || null);

  useEffect(() => {
    if (project.subtitle_style) {
      setLiveSubtitleStyle(project.subtitle_style);
    }
  }, [project.subtitle_style]);

  // When a clip is selected, auto-switch the side drawer to inspector
  const handleSelectClip = useCallback((idx: number | null) => {
    setSelectedClipIndex(idx);
    if (idx !== null) {
      setActiveSideTab("inspector");
      setIsDrawerCollapsed(false);
    }
  }, []);

  // Compute total timeline duration
  const totalDuration = useMemo(() => {
    const lastClipEnd = timelineEnd(clips);
    const audioDur = project.audio?.duration || 0;
    return Math.max(lastClipEnd, audioDur, 1);
  }, [clips, project.audio?.duration]);

  // Seek helper
  const seekTo = useCallback((t: number) => {
    const target = Math.max(0, t);
    setTime(target);
    setSeekRequest((prev) => ({ t: target, id: prev.id + 1 }));
  }, []);

  // Step playhead by frame (1/30s) or seconds
  const stepFrames = useCallback(
    (frames: number) => {
      seekTo(time + frames * (1 / 30));
    },
    [seekTo, time]
  );

  // Jump to previous / next cut point
  const jumpCut = useCallback(
    (dir: -1 | 1) => {
      const cuts = cutPoints(clips);
      if (cuts.length === 0) return;
      if (dir === -1) {
        const prev = [...cuts].reverse().find((c) => c < time - 0.04);
        seekTo(prev !== undefined ? prev : 0);
      } else {
        const next = cuts.find((c) => c > time + 0.04);
        seekTo(next !== undefined ? next : totalDuration);
      }
    },
    [clips, seekTo, time, totalDuration]
  );

  // Loop range for active clip
  const loopRange = useMemo(() => {
    if (!isLoopingClip || selectedClipIndex === null || !clips[selectedClipIndex]) return null;
    const c = clips[selectedClipIndex];
    return { start: c.timeline_start, end: c.timeline_end };
  }, [isLoopingClip, selectedClipIndex, clips]);

  const toggleLoop = useCallback(() => {
    if (selectedClipIndex === null) {
      showToast("Pilih salah satu klip untuk mengaktifkan loop", "info");
      return;
    }
    setIsLoopingClip((prev) => !prev);
  }, [selectedClipIndex, showToast]);

  // Audio waveform peaks
  const { peaks } = useAudioPeaks(project.audio?.audio_url);

  // Preview modal data (for single scene inspection)
  const [previewData, setPreviewData] = useState<{
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    startTime: number;
    endTime: number;
    title: string;
    description?: string | null;
    tags?: string[];
  } | null>(null);

  // Live Auto-Match AI state
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchElapsed, setMatchElapsed] = useState(0);

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
    mutationFn: () =>
      api.updateTimeline(project.id, {
        clips,
        total_duration: timelineEnd(clips),
      }),
    onSuccess: () => {
      serverClipsKey.current = JSON.stringify(clips);
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
      serverClipsKey.current = JSON.stringify([]);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Timeline berhasil dikosongkan!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mengosongkan timeline", "error");
    },
  });

  // Resize handlers for panels
  useEffect(() => {
    if (!isResizingDrawer && !isResizingTracks && !isResizingVerticalPreview) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDrawer) {
        // Rail width is ~48px
        const newWidth = Math.max(280, Math.min(650, e.clientX - 48));
        setDrawerWidth(newWidth);
      }
      if (isResizingTracks) {
        const windowHeight = window.innerHeight;
        const newHeight = Math.max(160, Math.min(480, windowHeight - e.clientY));
        setTracksHeight(newHeight);
      }
      if (isResizingVerticalPreview) {
        const windowWidth = window.innerWidth;
        const newWidth = Math.max(300, Math.min(680, windowWidth - e.clientX));
        setVerticalPreviewWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingDrawer(false);
      setIsResizingTracks(false);
      setIsResizingVerticalPreview(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingDrawer, isResizingTracks, isResizingVerticalPreview]);

  // Split clip at playhead
  const canSplit = useMemo(() => canSplitAt(clips, time) !== -1, [clips, time]);

  const handleSplit = useCallback(() => {
    const res = splitAt(clips, time);
    if (!res) {
      showToast("Posisikan playhead di dalam klip (min 0.5s dari tepi) untuk memotong", "info");
      return;
    }
    setClips(res.clips);
    setSelectedClipIndex(res.rightIndex);
    showToast(`Klip berhasil dipotong menjadi 2 bagian!`, "success");
  }, [clips, time, setClips, showToast]);

  // Delete clip
  const handleDeleteSelectedClip = useCallback(() => {
    if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
    const nextClips = deleteClip(clips, selectedClipIndex, sceneMap);
    setClips(nextClips);
    if (nextClips.length === 0) {
      setSelectedClipIndex(null);
    } else {
      setSelectedClipIndex(Math.min(selectedClipIndex, nextClips.length - 1));
    }
    showToast("Klip dihapus dari timeline", "info");
  }, [clips, selectedClipIndex, sceneMap, setClips, showToast]);

  // Roll / extend edge handling
  const getEdgeRange = useCallback(
    (i: number) => {
      return edgeRange(clips, i, sceneMap);
    },
    [clips, sceneMap]
  );

  const handleEdgeDragStart = useCallback(
    (_i: number) => {
      beginGesture();
    },
    [beginGesture]
  );

  const handleEdgeDrag = useCallback(
    (i: number, t: number) => {
      const next = rollEdge(clips, i, t, sceneMap);
      setClips(next, false);
    },
    [clips, sceneMap, setClips]
  );

  const handleEdgeDragEnd = useCallback(() => {
    cancelIfUnchanged();
  }, [cancelIfUnchanged]);

  // Drop scene onto timeline
  const handleDropScene = useCallback(
    (sceneId: string, target: SceneDropTarget) => {
      const sc = sceneMap.get(sceneId);
      if (!sc) return;

      if (target.type === "replace") {
        const next = replaceScene(clips, target.index, sc);
        setClips(next);
        setSelectedClipIndex(target.index);
        showToast(`Klip #${target.index + 1} diganti dengan Scene #${sc.scene_index + 1}`, "success");
      } else if (target.type === "insert") {
        const res = insertSceneAt(clips, target.t, sc);
        if (res) {
          setClips(res.clips);
          setSelectedClipIndex(res.index);
          showToast(`Scene #${sc.scene_index + 1} disisipkan di posisi ${target.t.toFixed(1)}s`, "success");
        }
      } else if (target.type === "append") {
        const next = appendScene(clips, sc);
        setClips(next);
        setSelectedClipIndex(next.length - 1);
        showToast(`Scene #${sc.scene_index + 1} ditambahkan di akhir timeline`, "success");
      }
    },
    [clips, sceneMap, setClips, showToast]
  );

  // Inspector actions
  const handleReplaceSelectedClip = useCallback(
    (sc: Scene) => {
      if (selectedClipIndex === null) {
        showToast("Pilih salah satu klip di timeline terlebih dahulu", "info");
        return;
      }
      const next = replaceScene(clips, selectedClipIndex, sc);
      setClips(next);
      showToast(`Klip #${selectedClipIndex + 1} diganti dengan Scene #${sc.scene_index + 1}`, "success");
    },
    [clips, selectedClipIndex, setClips, showToast]
  );

  const handleInsertAtPlayhead = useCallback(
    (sc: Scene) => {
      const res = insertSceneAt(clips, time, sc);
      if (res) {
        setClips(res.clips);
        setSelectedClipIndex(res.index);
        showToast(`Scene #${sc.scene_index + 1} disisipkan di playhead (${time.toFixed(1)}s)`, "success");
      } else {
        showToast("Tidak dapat menyisipkan di posisi ini", "error");
      }
    },
    [clips, time, setClips, showToast]
  );

  const handleAppendScene = useCallback(
    (sc: Scene) => {
      const next = appendScene(clips, sc);
      setClips(next);
      setSelectedClipIndex(next.length - 1);
      showToast(`Scene #${sc.scene_index + 1} ditambahkan di akhir`, "success");
    },
    [clips, setClips, showToast]
  );

  // Clip duration change from inspector
  const handleSetClipDuration = useCallback(
    (newDur: number) => {
      if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
      const c = clips[selectedClipIndex];
      const targetEdge = c.timeline_start + newDur;
      const next = rollEdge(clips, selectedClipIndex, targetEdge, sceneMap);
      setClips(next);
    },
    [clips, selectedClipIndex, sceneMap, setClips]
  );

  const handleSetClipSpeed = useCallback(
    (speed: number) => {
      if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
      const c = clips[selectedClipIndex];
      const updated = setClipSpeed(c, speed, sceneMap);
      const out = [...clips];
      out[selectedClipIndex] = updated;
      setClips(out);
      showToast(`Kecepatan klip diubah ke ${speed}x`, "info");
    },
    [clips, selectedClipIndex, sceneMap, setClips, showToast]
  );

  const handleCenterClip = useCallback(() => {
    if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
    const c = clips[selectedClipIndex];
    const sc = sceneMap.get(c.scene_id);
    if (!sc) return;
    const next = replaceScene(clips, selectedClipIndex, sc);
    setClips(next);
    showToast("Bagian scene dipusatkan (center-weighted)", "success");
  }, [clips, selectedClipIndex, sceneMap, setClips, showToast]);

  const handleFillScene = useCallback(() => {
    if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
    const c = clips[selectedClipIndex];
    const updated = fillWholeScene(c, sceneMap);
    const out = [...clips];
    out[selectedClipIndex] = updated;
    setClips(out);
    showToast(`Klip disetel menggunakan keseluruhan scene (${updated.speed}x)`, "success");
  }, [clips, selectedClipIndex, sceneMap, setClips, showToast]);

  const handleSwapNeighbor = useCallback(
    (dir: -1 | 1) => {
      if (selectedClipIndex === null) return;
      const next = swapWithNeighbor(clips, selectedClipIndex, dir, sceneMap);
      setClips(next);
      setSelectedClipIndex(selectedClipIndex + dir);
      showToast("Urutan klip ditukar", "info");
    },
    [clips, selectedClipIndex, sceneMap, setClips, showToast]
  );

  // Inspector preview of clip source
  const handlePreviewSelectedClipSource = useCallback(() => {
    if (selectedClipIndex === null || !clips[selectedClipIndex]) return;
    const c = clips[selectedClipIndex];
    const sc = sceneMap.get(c.scene_id);
    setPreviewData({
      videoUrl: c.video_url || sc?.video_url,
      thumbnailUrl: c.thumbnail_url || sc?.thumbnail_url,
      startTime: c.clip_start,
      endTime: c.clip_end,
      title: `Preview Klip #${selectedClipIndex + 1}`,
      description: c.text || sc?.description,
      tags: sc?.tags,
    });
  }, [clips, selectedClipIndex, sceneMap]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z") ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveTimelineMutation.mutate();
        return;
      }

      // Play / Pause
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((p) => !p);
        return;
      }

      // Split
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSplit();
        return;
      }

      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelectedClip();
        return;
      }

      // Loop
      if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        toggleLoop();
        return;
      }

      // Frame stepping
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepFrames(e.shiftKey ? -30 : -1);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        stepFrames(e.shiftKey ? 30 : 1);
        return;
      }

      // Cut jumping
      if (e.key === "ArrowUp") {
        e.preventDefault();
        jumpCut(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        jumpCut(1);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, saveTimelineMutation, handleSplit, handleDeleteSelectedClip, toggleLoop, stepFrames, jumpCut]);

  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] || null : null;
  const selectedScene = selectedClip ? sceneMap.get(selectedClip.scene_id) : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] min-h-[640px] max-h-[calc(100vh-120px)] w-full rounded-2xl border border-surface-border bg-[#090A0F] overflow-hidden shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border bg-surface/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-sm text-white tracking-tight flex items-center gap-1.5">
            <Film className="w-4 h-4 text-brand-400" />
            Timeline Studio
          </span>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-surface-card border border-surface-border text-slate-300">
            {clips.length} klip
          </span>
          {isDirty ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 flex items-center gap-1 animate-pulse">
              <AlertCircle className="w-3 h-3" /> Belum disimpan
            </span>
          ) : clips.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Tersimpan
            </span>
          ) : null}
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Durasi: <strong className="text-slate-300 font-mono">{Math.round(totalDuration)}s</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {clips.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearConfirmOpen(true)}
              className="px-2.5 py-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-semibold flex items-center gap-1 transition"
              title="Kosongkan timeline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Kosongkan</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            className="px-3 py-1.5 rounded-xl bg-brand-600/20 border border-brand-500/40 hover:bg-brand-500/30 text-brand-300 font-semibold text-xs flex items-center gap-1.5 transition"
            title="Cocokkan otomatis klip video dengan naskah menggunakan AI"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
            <span>{autoMatchMutation.isPending ? "Mencocokkan..." : "Auto-Match AI"}</span>
          </button>

          <button
            type="button"
            onClick={() => saveTimelineMutation.mutate()}
            disabled={saveTimelineMutation.isPending || !isDirty}
            className={`px-3.5 py-1.5 rounded-xl text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm ${
              isDirty
                ? "bg-brand-600 hover:bg-brand-500 shadow-brand-600/30"
                : "bg-surface-border text-slate-400 cursor-default"
            }`}
            title="Simpan timeline (Ctrl/Cmd + S)"
          >
            {saveTimelineMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saveTimelineMutation.isPending ? "Menyimpan..." : "Simpan"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("render")}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow-md shadow-brand-600/20 transition"
          >
            <span>Render</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Auto-match live progress indicator */}
      {isAutoMatching && (
        <div className="px-4 py-2 bg-brand-950/40 border-b border-brand-500/40 flex items-center justify-between text-xs text-brand-300 shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
            <span>AI sedang mencocokkan potongan video dengan naskah...</span>
          </div>
          <span className="font-mono text-slate-400">
            {Math.floor(matchElapsed / 60)}:{String(matchElapsed % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {/* Main Studio Body: Zero-Scroll NLE Layout */}
      {isVertical ? (
        /* Vertical Layout: Left area (Rail + Panel on top, Tracks on bottom) & Right area (Full-height Preview) */
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* Left Column: Editor controls & Tracks */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Upper row: Left Rail + Active Panel (Pool / Inspector / Subtitles) */}
            <div className="flex-1 min-h-0 flex flex-row overflow-hidden border-b border-surface-border/70">
              {/* Vertical Icon Rail */}
              <div className="w-12 shrink-0 border-r border-surface-border bg-surface/70 flex flex-col items-center py-2.5 justify-between select-none">
                <div className="flex flex-col items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => setActiveSideTab("pool")}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                      activeSideTab === "pool"
                        ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                        : "text-slate-400 hover:text-white hover:bg-surface"
                    }`}
                    title="Media Pool (Koleksi Scene)"
                  >
                    <Film className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSideTab("inspector")}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition relative ${
                      activeSideTab === "inspector"
                        ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40"
                        : "text-slate-400 hover:text-white hover:bg-surface"
                    }`}
                    title="Clip Inspector (Pengaturan Klip)"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    {selectedClipIndex !== null && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow absolute top-1.5 right-1.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSideTab("subtitles")}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                      activeSideTab === "subtitles"
                        ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                        : "text-slate-400 hover:text-white hover:bg-surface"
                    }`}
                    title="Subtitle & Word Inspector"
                  >
                    <Subtitles className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Active Tab Panel (fills remaining width of upper-left section) */}
              <div className="flex-1 min-w-0 bg-surface-secondary flex flex-col overflow-hidden">
                {activeSideTab === "pool" ? (
                  <TimelineMediaPool
                    scenes={project.scenes || []}
                    sourceVideos={project.source_videos || []}
                    usedSceneMap={usedSceneMap}
                    selectedClipNumber={selectedClipIndex !== null ? selectedClipIndex + 1 : null}
                    selectedSceneId={selectedClip?.scene_id || null}
                    canInsertAtPlayhead={time >= 0 && time <= totalDuration}
                    onReplace={handleReplaceSelectedClip}
                    onInsert={handleInsertAtPlayhead}
                    onAppend={handleAppendScene}
                    onPreview={(sc) =>
                      setPreviewData({
                        videoUrl: sc.video_url,
                        thumbnailUrl: sc.thumbnail_url,
                        startTime: sc.start_time,
                        endTime: sc.end_time,
                        title: `Scene #${sc.scene_index + 1}`,
                        description: sc.description,
                        tags: sc.tags,
                      })
                    }
                  />
                ) : activeSideTab === "inspector" ? (
                  <ClipInspector
                    clip={selectedClip}
                    index={selectedClipIndex}
                    total={clips.length}
                    scene={selectedScene}
                    sceneMap={sceneMap}
                    time={time}
                    canSplit={canSplit}
                    isLooping={Boolean(loopRange)}
                    onCommit={(updated) => {
                      if (selectedClipIndex === null) return;
                      const out = [...clips];
                      out[selectedClipIndex] = updated;
                      setClips(out);
                    }}
                    onGestureStart={beginGesture}
                    onGestureUpdate={(updated) => {
                      if (selectedClipIndex === null) return;
                      const out = [...clips];
                      out[selectedClipIndex] = updated;
                      setClips(out, false);
                    }}
                    onGestureEnd={cancelIfUnchanged}
                    onSetDuration={handleSetClipDuration}
                    onSetSpeed={handleSetClipSpeed}
                    onSplit={handleSplit}
                    onDelete={handleDeleteSelectedClip}
                    onMove={handleSwapNeighbor}
                    onCenter={handleCenterClip}
                    onFillScene={handleFillScene}
                    onPreviewSource={handlePreviewSelectedClipSource}
                    onToggleLoop={toggleLoop}
                  />
                ) : (
                  <SubtitleCustomizePanel
                    project={project}
                    currentTime={time}
                    onSeek={seekTo}
                    onStyleChange={(style) => setLiveSubtitleStyle(style)}
                  />
                )}
              </div>
            </div>

            {/* Resizer Handle: Tracks Height */}
            <div
              onMouseDown={() => setIsResizingTracks(true)}
              className="h-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-row-resize transition flex items-center justify-center group z-10 select-none"
              title="Drag to resize tracks"
            >
              <div className="h-[1px] w-12 bg-surface-border group-hover:bg-brand-400" />
            </div>

            {/* Lower row: Multi-Track Timeline */}
            <div
              style={{ height: tracksHeight }}
              className="shrink-0 flex flex-col bg-surface-secondary overflow-hidden transition-[height] duration-75"
            >
              <TimelineTracks
                clips={clips}
                segments={project.narration?.segments || []}
                peaks={peaks}
                audioDuration={project.audio?.duration || totalDuration}
                voice={project.audio?.voice}
                duration={totalDuration}
                time={time}
                isPlaying={isPlaying}
                selectedIndex={selectedClipIndex}
                loopRange={loopRange}
                onSelect={handleSelectClip}
                onSeek={seekTo}
                getEdgeRange={getEdgeRange}
                onEdgeDragStart={handleEdgeDragStart}
                onEdgeDrag={handleEdgeDrag}
                onEdgeDragEnd={handleEdgeDragEnd}
                onDropScene={handleDropScene}
                onEditSubtitles={() => {
                  setActiveSideTab("subtitles");
                }}
              />
            </div>
          </div>

          {/* Resizer Handle: Vertical Preview Column Width */}
          <div
            onMouseDown={() => setIsResizingVerticalPreview(true)}
            className="w-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-col-resize transition flex items-center justify-center group z-10 select-none"
            title="Drag to resize preview monitor"
          >
            <div className="w-[1px] h-12 bg-surface-border group-hover:bg-brand-400" />
          </div>

          {/* Right Column: Full-Height Vertical Program Monitor */}
          <div
            style={{ width: verticalPreviewWidth }}
            className="shrink-0 flex flex-col p-2 bg-black/40 border-l border-surface-border/70 overflow-hidden"
          >
            <TimelineMonitor
              clips={clips}
              audioUrl={project.audio?.audio_url}
              duration={totalDuration}
              segments={project.narration?.segments || []}
              aspectRatio={project.aspect_ratio || "9:16"}
              backgroundFill={project.background_fill}
              bgMode={project.background_fill?.mode || "blur"}
              subtitleStyle={liveSubtitleStyle}
              time={time}
              seekRequest={seekRequest}
              isPlaying={isPlaying}
              loopRange={loopRange}
              onPlayingChange={setIsPlaying}
              onTimeChange={setTime}
              onSeek={seekTo}
              onStep={stepFrames}
              onJumpCut={jumpCut}
              onToggleLoop={toggleLoop}
              canLoop={selectedClipIndex !== null}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onSplit={handleSplit}
              canSplit={canSplit}
              onUpdateSubtitlePosition={(pos) => {
                setLiveSubtitleStyle((prev) => (prev ? { ...prev, ...pos } : null));
              }}
            />
          </div>
        </div>
      ) : (
        /* Horizontal Layout: Upper Section (Rail + Drawer + Center Monitor) & Lower Section (Full-width Tracks) */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Upper Section: Left Rail + Left Side Drawer + Center Program Monitor */}
          <div className="flex-1 min-h-0 flex flex-row border-b border-surface-border/70 overflow-hidden">
            {/* Vertical Icon Rail */}
            <div className="w-12 shrink-0 border-r border-surface-border bg-surface/70 flex flex-col items-center py-2.5 justify-between select-none">
              <div className="flex flex-col items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSideTab("pool");
                    setIsDrawerCollapsed(false);
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    activeSideTab === "pool" && !isDrawerCollapsed
                      ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                      : "text-slate-400 hover:text-white hover:bg-surface"
                  }`}
                  title="Media Pool (Koleksi Scene)"
                >
                  <Film className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSideTab("inspector");
                    setIsDrawerCollapsed(false);
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition relative ${
                    activeSideTab === "inspector" && !isDrawerCollapsed
                      ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40"
                      : "text-slate-400 hover:text-white hover:bg-surface"
                  }`}
                  title="Clip Inspector (Pengaturan Klip)"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {selectedClipIndex !== null && (
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow absolute top-1.5 right-1.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSideTab("subtitles");
                    setIsDrawerCollapsed(false);
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
                    activeSideTab === "subtitles" && !isDrawerCollapsed
                      ? "bg-brand-600 text-white shadow-md shadow-brand-600/30"
                      : "text-slate-400 hover:text-white hover:bg-surface"
                  }`}
                  title="Subtitle & Word Inspector"
                >
                  <Subtitles className="w-4 h-4" />
                </button>
              </div>

              {/* Collapse toggle */}
              <button
                type="button"
                onClick={() => setIsDrawerCollapsed(!isDrawerCollapsed)}
                className="w-8 h-8 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-surface flex items-center justify-center transition"
                title={isDrawerCollapsed ? "Buka panel drawer" : "Tutup panel drawer"}
              >
                {isDrawerCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>

            {/* Left Drawer Container (Media Pool OR Clip Inspector OR Subtitle Panel) */}
            <div
              style={{ width: isDrawerCollapsed ? 0 : drawerWidth }}
              className={`shrink-0 border-r border-surface-border bg-surface-secondary flex flex-col overflow-hidden transition-[width] duration-75 ${
                isDrawerCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
              }`}
            >
              {activeSideTab === "pool" ? (
                <TimelineMediaPool
                  scenes={project.scenes || []}
                  sourceVideos={project.source_videos || []}
                  usedSceneMap={usedSceneMap}
                  selectedClipNumber={selectedClipIndex !== null ? selectedClipIndex + 1 : null}
                  selectedSceneId={selectedClip?.scene_id || null}
                  canInsertAtPlayhead={time >= 0 && time <= totalDuration}
                  onReplace={handleReplaceSelectedClip}
                  onInsert={handleInsertAtPlayhead}
                  onAppend={handleAppendScene}
                  onPreview={(sc) =>
                    setPreviewData({
                      videoUrl: sc.video_url,
                      thumbnailUrl: sc.thumbnail_url,
                      startTime: sc.start_time,
                      endTime: sc.end_time,
                      title: `Scene #${sc.scene_index + 1}`,
                      description: sc.description,
                      tags: sc.tags,
                    })
                  }
                />
              ) : activeSideTab === "inspector" ? (
                <ClipInspector
                  clip={selectedClip}
                  index={selectedClipIndex}
                  total={clips.length}
                  scene={selectedScene}
                  sceneMap={sceneMap}
                  time={time}
                  canSplit={canSplit}
                  isLooping={Boolean(loopRange)}
                  onCommit={(updated) => {
                    if (selectedClipIndex === null) return;
                    const out = [...clips];
                    out[selectedClipIndex] = updated;
                    setClips(out);
                  }}
                  onGestureStart={beginGesture}
                  onGestureUpdate={(updated) => {
                    if (selectedClipIndex === null) return;
                    const out = [...clips];
                    out[selectedClipIndex] = updated;
                    setClips(out, false);
                  }}
                  onGestureEnd={cancelIfUnchanged}
                  onSetDuration={handleSetClipDuration}
                  onSetSpeed={handleSetClipSpeed}
                  onSplit={handleSplit}
                  onDelete={handleDeleteSelectedClip}
                  onMove={handleSwapNeighbor}
                  onCenter={handleCenterClip}
                  onFillScene={handleFillScene}
                  onPreviewSource={handlePreviewSelectedClipSource}
                  onToggleLoop={toggleLoop}
                />
              ) : (
                <SubtitleCustomizePanel
                  project={project}
                  currentTime={time}
                  onSeek={seekTo}
                  onStyleChange={(style) => setLiveSubtitleStyle(style)}
                />
              )}
            </div>

            {/* Resizer Handle: Drawer Width */}
            {!isDrawerCollapsed && (
              <div
                onMouseDown={() => setIsResizingDrawer(true)}
                className="w-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-col-resize transition flex items-center justify-center group z-10 select-none"
                title="Drag to resize panel"
              >
                <div className="w-[1px] h-8 bg-surface-border group-hover:bg-brand-400" />
              </div>
            )}

            {/* Right Main Area: Program Monitor */}
            <div className="flex-1 min-h-0 flex flex-col p-2 bg-black/40 overflow-hidden">
              <TimelineMonitor
                clips={clips}
                audioUrl={project.audio?.audio_url}
                duration={totalDuration}
                segments={project.narration?.segments || []}
                aspectRatio={project.aspect_ratio || "16:9"}
                backgroundFill={project.background_fill}
                bgMode={project.background_fill?.mode || "blur"}
                subtitleStyle={liveSubtitleStyle}
                time={time}
                seekRequest={seekRequest}
                isPlaying={isPlaying}
                loopRange={loopRange}
                onPlayingChange={setIsPlaying}
                onTimeChange={setTime}
                onSeek={seekTo}
                onStep={stepFrames}
                onJumpCut={jumpCut}
                onToggleLoop={toggleLoop}
                canLoop={selectedClipIndex !== null}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onSplit={handleSplit}
                canSplit={canSplit}
                onUpdateSubtitlePosition={(pos) => {
                  setLiveSubtitleStyle((prev) => (prev ? { ...prev, ...pos } : null));
                }}
              />
            </div>
          </div>

          {/* Resizer Handle: Tracks Height */}
          <div
            onMouseDown={() => setIsResizingTracks(true)}
            className="h-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-row-resize transition flex items-center justify-center group z-10 select-none"
            title="Drag to resize tracks"
          >
            <div className="h-[1px] w-12 bg-surface-border group-hover:bg-brand-400" />
          </div>

          {/* Lower Section: Full-Width Multi-Track Timeline */}
          <div
            style={{ height: tracksHeight }}
            className="shrink-0 flex flex-col bg-surface-secondary overflow-hidden transition-[height] duration-75"
          >
            <TimelineTracks
              clips={clips}
              segments={project.narration?.segments || []}
              peaks={peaks}
              audioDuration={project.audio?.duration || totalDuration}
              voice={project.audio?.voice}
              duration={totalDuration}
              time={time}
              isPlaying={isPlaying}
              selectedIndex={selectedClipIndex}
              loopRange={loopRange}
              onSelect={handleSelectClip}
              onSeek={seekTo}
              getEdgeRange={getEdgeRange}
              onEdgeDragStart={handleEdgeDragStart}
              onEdgeDrag={handleEdgeDrag}
              onEdgeDragEnd={handleEdgeDragEnd}
              onDropScene={handleDropScene}
              onEditSubtitles={() => {
                setActiveSideTab("subtitles");
                setIsDrawerCollapsed(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Single Scene Preview Modal */}
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

      {/* Confirm Clear Timeline Modal */}
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
              Apakah Anda yakin ingin mengosongkan seluruh susunan timeline? Anda dapat menyusun klip baru secara manual dengan drag & drop scene dari Media Pool atau menggunakan <span className="font-semibold text-white">Auto-Match AI</span> kembali kapan saja.
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
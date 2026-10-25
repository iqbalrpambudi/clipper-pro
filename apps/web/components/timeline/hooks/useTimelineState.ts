"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHistoryState } from "@/hooks/useHistoryState";
import { useAudioPeaks } from "@/hooks/useAudioPeaks";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { useEditorConfigStore } from "@/lib/editorConfigStore";
import {
  Project,
  Timeline,
  TimelineClip,
  Scene,
  AudioTrack,
  Narration,
  SourceVideo,
  WatermarkConfig,
  BackgroundFill,
  SentenceSegment,
  SubtitleStyle,
} from "@/types";
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
import { SceneDropTarget } from "../TimelineTracks";
import { SeekRequest } from "../TimelineMonitor";
import { SideTab } from "../TimelineSideDrawer";

const EMPTY_SEGMENTS: SentenceSegment[] = [];

export interface TimelineProjectData extends Project {
  timeline?: Timeline | null;
  scenes: Scene[];
  audio?: AudioTrack | null;
  narration?: Narration | null;
  source_videos?: SourceVideo[];
}

export function useTimelineState(project: TimelineProjectData) {
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
  const timeRef = useRef(time);
  timeRef.current = time;

  const handleTimeChange = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);

  const [seekRequest, setSeekRequest] = useState<SeekRequest>({ t: 0, id: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [isLoopingClip, setIsLoopingClip] = useState(false);

  // Left sidebar & drawer state
  const [activeSideTab, setActiveSideTab] = useState<SideTab>("pool");
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);

  // Resizable panel dimensions
  const [drawerWidth, setDrawerWidth] = useState<number>(380);
  const [tracksHeight, setTracksHeight] = useState<number>(230);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const [isResizingTracks, setIsResizingTracks] = useState(false);

  // Live aspect ratio and background fill states
  const [liveAspectRatio, setLiveAspectRatio] = useState<string>(project.aspect_ratio || "9:16");
  const [liveBackgroundFill, setLiveBackgroundFill] = useState<BackgroundFill | null>(
    project.background_fill || null
  );

  useEffect(() => {
    if (project.aspect_ratio) setLiveAspectRatio(project.aspect_ratio);
  }, [project.aspect_ratio]);

  useEffect(() => {
    if (project.background_fill) setLiveBackgroundFill(project.background_fill);
  }, [project.background_fill]);

  // Vertical layout resizer
  const [verticalPreviewWidth, setVerticalPreviewWidth] = useState<number>(440);
  const [isResizingVerticalPreview, setIsResizingVerticalPreview] = useState(false);

  const isVertical = liveAspectRatio !== "16:9";

  // Active subtitle style preview state with persistence & autosave
  const [liveSubtitleStyle, setLiveSubtitleStyle] = useState<SubtitleStyle | null>(
    project.subtitle_style || null
  );
  const liveSubtitleStyleRef = useRef<SubtitleStyle | null>(liveSubtitleStyle);
  liveSubtitleStyleRef.current = liveSubtitleStyle;

  const subtitleAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when project.subtitle_style from server changes (only if different to prevent clobbering mid-edit)
  useEffect(() => {
    if (project.subtitle_style) {
      if (JSON.stringify(project.subtitle_style) !== JSON.stringify(liveSubtitleStyleRef.current)) {
        setLiveSubtitleStyle(project.subtitle_style);
      }
    }
  }, [project.subtitle_style]);

  const handleSubtitleChange = useCallback(
    (newStyle: SubtitleStyle, immediate = false) => {
      setLiveSubtitleStyle(newStyle);
      liveSubtitleStyleRef.current = newStyle;

      // Optimistically update React Query cache so other tabs/components have the new state immediately
      queryClient.setQueryData<Project>(["project", project.id], (old) => {
        if (!old) return old;
        return { ...old, subtitle_style: newStyle };
      });

      // Sync to EditorConfigStore single source of truth
      const subPayload = {
        enabled: newStyle.enabled !== false,
        style: newStyle,
        position: (newStyle.position as any) || "bottom",
        customOffset: { x: newStyle.offset_x ?? 0, y: newStyle.offset_y ?? 0 },
      };
      if (project.project_type === "long_storyboard") {
        useEditorConfigStore.getState().setStoryboardStepConfig(project.id, "subtitle", subPayload, false);
      } else {
        useEditorConfigStore.getState().setShortsStepConfig(project.id, "subtitle", subPayload, false);
      }

      if (subtitleAutosaveTimerRef.current) {

        clearTimeout(subtitleAutosaveTimerRef.current);
        subtitleAutosaveTimerRef.current = null;
      }

      const saveToServer = async (styleToSave: SubtitleStyle) => {
        try {
          await api.updateSubtitleStyle(project.id, styleToSave);
        } catch (err) {
          console.error("Autosave subtitle style failed:", err);
        }
      };

      if (immediate) {
        saveToServer(newStyle);
      } else {
        subtitleAutosaveTimerRef.current = setTimeout(() => {
          saveToServer(newStyle);
        }, 500);
      }
    },
    [project.id, queryClient]
  );

  const handleCustomSubtitlePositionChange = useCallback(
    (pos: { offset_x: number; offset_y: number }) => {
      const base: SubtitleStyle = liveSubtitleStyleRef.current || project.subtitle_style || {
        enabled: true,
        preset_name: "custom",
        font_family: "Poppins",
        font_size: 56,
        font_weight: "Bold",
        primary_color: "#FFFFFF",
        highlight_color: "#FFE600",
        outline_color: "#000000",
        outline_width: 5,
        box_color: "#000000",
        box_opacity: 0.0,
        position: "bottom",
        offset_y: -120,
        offset_x: 0,
        display_mode: "per_word",
        burst_word_count: 2,
        highlight_animation: "color",
        scale_factor: 1.0,
        emoji_enabled: false,
      };
      const updated: SubtitleStyle = {
        ...base,
        offset_x: pos.offset_x,
        offset_y: pos.offset_y,
      };
      handleSubtitleChange(updated, false);
    },
    [project.subtitle_style, handleSubtitleChange]
  );

  const handleSubtitleDragEnd = useCallback(() => {
    if (liveSubtitleStyleRef.current) {
      handleSubtitleChange(liveSubtitleStyleRef.current, true);
    }
  }, [handleSubtitleChange]);

  // Flush any pending subtitle autosave on unmount (e.g. switching tabs/pages)
  useEffect(() => {
    return () => {
      if (subtitleAutosaveTimerRef.current && liveSubtitleStyleRef.current) {
        clearTimeout(subtitleAutosaveTimerRef.current);
        api.updateSubtitleStyle(project.id, liveSubtitleStyleRef.current).catch(() => {});
      }
    };
  }, [project.id]);

  // Active watermark preview state with persistence & autosave
  const [liveWatermark, setLiveWatermark] = useState<WatermarkConfig | null>(
    project.watermark || null
  );
  const liveWatermarkRef = useRef<WatermarkConfig | null>(liveWatermark);
  liveWatermarkRef.current = liveWatermark;

  const watermarkAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync when project.watermark from server changes (only if different to prevent clobbering mid-edit)
  useEffect(() => {
    if (project.watermark) {
      if (JSON.stringify(project.watermark) !== JSON.stringify(liveWatermarkRef.current)) {
        setLiveWatermark(project.watermark);
      }
    }
  }, [project.watermark]);

  const handleWatermarkChange = useCallback(
    (newWm: WatermarkConfig, immediate = false) => {
      setLiveWatermark(newWm);
      liveWatermarkRef.current = newWm;

      // Optimistically update React Query cache so other tabs/components have the new state immediately
      queryClient.setQueryData<Project>(["project", project.id], (old) => {
        if (!old) return old;
        return { ...old, watermark: newWm };
      });

      // Sync to EditorConfigStore single source of truth
      const wmPayload = {
        ...newWm,
        customOffset: {
          x: newWm.custom_x ?? newWm.offset_x ?? 0,
          y: newWm.custom_y ?? newWm.offset_y ?? 0,
        },
      };

      if (project.project_type === "long_storyboard") {
        useEditorConfigStore.getState().setStoryboardStepConfig(project.id, "watermark", wmPayload, false);
      } else {
        useEditorConfigStore.getState().setShortsStepConfig(project.id, "watermark", wmPayload, false);
      }

      if (watermarkAutosaveTimerRef.current) {

        clearTimeout(watermarkAutosaveTimerRef.current);
        watermarkAutosaveTimerRef.current = null;
      }

      const saveToServer = async (cfg: WatermarkConfig) => {
        try {
          await api.updateProject(project.id, { watermark: cfg });
        } catch (err) {
          console.error("Autosave watermark failed:", err);
        }
      };

      if (immediate) {
        saveToServer(newWm);
      } else {
        watermarkAutosaveTimerRef.current = setTimeout(() => {
          saveToServer(newWm);
        }, 500);
      }
    },
    [project.id, queryClient]
  );

  const handleCustomWatermarkPositionChange = useCallback(
    (pos: { custom_x: number; custom_y: number }) => {
      const base: WatermarkConfig = liveWatermarkRef.current || project.watermark || {
        enabled: true,
        text: project.name || "Watermark",
        font_family: "Poppins",
        font_size: 24,
        font_color: "#FFFFFF",
        opacity: 0.8,
        position: "bottom-right",
        offset_x: 30,
        offset_y: 30,
      };
      const updated: WatermarkConfig = {
        ...base,
        position: "custom",
        custom_x: pos.custom_x,
        custom_y: pos.custom_y,
      };
      handleWatermarkChange(updated, false);
    },
    [project.name, project.watermark, handleWatermarkChange]
  );

  const handleWatermarkDragEnd = useCallback(() => {
    if (liveWatermarkRef.current) {
      handleWatermarkChange(liveWatermarkRef.current, true);
    }
  }, [handleWatermarkChange]);

  // Flush any pending watermark autosave on unmount (e.g. switching tabs/pages)
  useEffect(() => {
    return () => {
      if (watermarkAutosaveTimerRef.current && liveWatermarkRef.current) {
        clearTimeout(watermarkAutosaveTimerRef.current);
        api.updateProject(project.id, { watermark: liveWatermarkRef.current }).catch(() => {});
      }
    };
  }, [project.id]);

  // Track attachment state
  const [isAudioAttached, setIsAudioAttached] = useState<boolean>(
    project.timeline?.has_audio ?? true
  );
  const [isSubtitlesAttached, setIsSubtitlesAttached] = useState<boolean>(
    project.timeline?.has_subtitles ?? true
  );

  useEffect(() => {
    if (project.timeline) {
      setIsAudioAttached(project.timeline.has_audio ?? true);
      setIsSubtitlesAttached(project.timeline.has_subtitles ?? true);
    }
  }, [project.timeline?.has_audio, project.timeline?.has_subtitles]);

  const attachedSegments = useMemo(() => {
    return isSubtitlesAttached ? project.narration?.segments || EMPTY_SEGMENTS : EMPTY_SEGMENTS;
  }, [isSubtitlesAttached, project.narration?.segments]);

  // When a clip is selected, auto-switch side drawer to inspector
  const handleSelectClip = useCallback((idx: number | null) => {
    setSelectedClipIndex(idx);
    if (idx !== null) {
      setActiveSideTab("inspector");
      setIsDrawerCollapsed(false);
    }
  }, []);

  // Total timeline duration
  const totalDuration = useMemo(() => {
    const lastClipEnd = timelineEnd(clips);
    const audioDur = isAudioAttached ? project.audio?.duration || 0 : 0;
    return Math.max(lastClipEnd, audioDur, clips.length > 0 || isAudioAttached ? 1 : 0);
  }, [clips, isAudioAttached, project.audio?.duration]);

  // Seek helper
  const seekTo = useCallback((t: number) => {
    const target = Math.max(0, t);
    timeRef.current = target;
    setTime(target);
    setSeekRequest((prev) => ({ t: target, id: prev.id + 1 }));
  }, []);

  // Step playhead by frames
  const stepFrames = useCallback(
    (frames: number) => {
      setIsPlaying(false);
      const curFrame = Math.round(timeRef.current * 30);
      const targetFrame = Math.max(0, Math.min(Math.round(totalDuration * 30), curFrame + frames));
      const targetTime = targetFrame / 30;
      timeRef.current = targetTime;
      setTime(targetTime);
      setSeekRequest((prev) => ({ t: targetTime, id: prev.id + 1 }));
    },
    [totalDuration]
  );

  // Jump cut points
  const jumpCut = useCallback(
    (dir: -1 | 1) => {
      const cuts = cutPoints(clips);
      if (cuts.length === 0) return;
      const cur = timeRef.current;
      if (dir === -1) {
        const prev = [...cuts].reverse().find((c) => c < cur - 0.04);
        seekTo(prev !== undefined ? prev : 0);
      } else {
        const next = cuts.find((c) => c > cur + 0.04);
        seekTo(next !== undefined ? next : totalDuration);
      }
    },
    [clips, seekTo, totalDuration]
  );

  // Loop range for active clip or whole timeline
  const loopRange = useMemo(() => {
    if (!isLoopingClip) return null;
    if (selectedClipIndex !== null && clips[selectedClipIndex]) {
      const c = clips[selectedClipIndex];
      return { start: c.timeline_start, end: c.timeline_end };
    }
    if (totalDuration > 0) {
      return { start: 0, end: totalDuration };
    }
    return null;
  }, [isLoopingClip, selectedClipIndex, clips, totalDuration]);

  const toggleLoop = useCallback(() => {
    const next = !isLoopingClip;
    setIsLoopingClip(next);
    if (next) {
      if (selectedClipIndex !== null) {
        showToast(`Loop klip #${selectedClipIndex + 1} aktif`, "info");
      } else {
        showToast("Loop seluruh video aktif", "info");
      }
    } else {
      showToast("Loop dinonaktifkan", "info");
    }
  }, [isLoopingClip, selectedClipIndex, showToast]);

  // Audio peaks
  const { peaks } = useAudioPeaks(isAudioAttached ? project.audio?.audio_url : null);

  // Preview modal data
  const [previewData, setPreviewData] = useState<{
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    startTime: number;
    endTime: number;
    title: string;
    description?: string | null;
    tags?: string[];
  } | null>(null);

  // Auto-Match mutation & state
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
      setIsAudioAttached(data.has_audio ?? true);
      setIsSubtitlesAttached(data.has_subtitles ?? true);
      showToast("Scene berhasil dicocokkan otomatis dengan naskah!", "success");
      setIsAutoMatching(false);
    },
    onError: (err: Error) => {
      setIsAutoMatching(false);
      showToast(err.message || "Gagal mencocokkan scene", "error");
    },
  });

  const saveTimelineMutation = useMutation({
    mutationFn: (_opts?: { manual?: boolean }) =>
      api.updateTimeline(project.id, {
        clips,
        total_duration: totalDuration,
        has_audio: isAudioAttached,
        has_subtitles: isSubtitlesAttached,
      }),
    onSuccess: (_data, variables) => {
      serverClipsKey.current = JSON.stringify(clips);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      if (variables?.manual) {
        showToast("Susunan timeline berhasil disimpan!", "success");
      }
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan timeline", "error");
    },
  });

  // Autosave timeline edits with debounce (1000ms)
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (!isDirty) return;

    const timer = setTimeout(() => {
      saveTimelineMutation.mutate({});
    }, 1000);

    return () => clearTimeout(timer);
  }, [clips, isDirty]);

  // Clear timeline modal state & mutation
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [clearScope, setClearScope] = useState<"all" | "video_only">("all");

  const clearTimelineMutation = useMutation({
    mutationFn: (scope: "all" | "video_only" = clearScope) =>
      api.clearTimeline(project.id, {
        clear_audio: scope === "all",
        clear_subtitles: scope === "all",
      }),
    onSuccess: (_data, variables) => {
      const scope = variables || clearScope;
      setClips([]);
      setSelectedClipIndex(null);
      if (scope === "all") {
        setIsAudioAttached(false);
        setIsSubtitlesAttached(false);
      }
      setTime(0);
      setSeekRequest((prev) => ({ t: 0, id: prev.id + 1 }));
      setIsClearConfirmOpen(false);
      serverClipsKey.current = JSON.stringify([]);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast(
        scope === "all"
          ? "Seluruh track timeline berhasil dikosongkan!"
          : "Klip video berhasil dikosongkan!",
        "info"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengosongkan timeline", "error");
    },
  });

  const readdNarrationMutation = useMutation({
    mutationFn: (params?: { readd_audio?: boolean; readd_subtitles?: boolean }) =>
      api.readdNarrationToTimeline(project.id, params),
    onSuccess: (_data, variables) => {
      const addedAudio = variables?.readd_audio ?? true;
      const addedSubs = variables?.readd_subtitles ?? true;
      if (addedAudio) setIsAudioAttached(true);
      if (addedSubs) setIsSubtitlesAttached(true);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Audio & Subtitle berhasil ditambahkan kembali ke timeline!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menambahkan audio/subtitle", "error");
    },
  });

  const handleReaddAll = useCallback(() => {
    readdNarrationMutation.mutate({ readd_audio: true, readd_subtitles: true });
  }, [readdNarrationMutation]);

  const handleReaddAudio = useCallback(() => {
    readdNarrationMutation.mutate({ readd_audio: true, readd_subtitles: false });
  }, [readdNarrationMutation]);

  const handleReaddSubtitles = useCallback(() => {
    readdNarrationMutation.mutate({ readd_audio: false, readd_subtitles: true });
  }, [readdNarrationMutation]);

  // Resize window mouse handlers
  useEffect(() => {
    if (!isResizingDrawer && !isResizingTracks && !isResizingVerticalPreview) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingDrawer) {
        const newWidth = Math.max(280, Math.min(900, e.clientX - 48));
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
    showToast("Klip berhasil dipotong menjadi 2 bagian!", "success");
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
        showToast(
          `Klip #${target.index + 1} diganti dengan Scene #${sc.scene_index + 1}`,
          "success"
        );
      } else if (target.type === "insert") {
        const res = insertSceneAt(clips, target.t, sc);
        if (res) {
          setClips(res.clips);
          setSelectedClipIndex(res.index);
          showToast(
            `Scene #${sc.scene_index + 1} disisipkan di posisi ${target.t.toFixed(1)}s`,
            "success"
          );
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
      showToast(
        `Klip #${selectedClipIndex + 1} diganti dengan Scene #${sc.scene_index + 1}`,
        "success"
      );
    },
    [clips, selectedClipIndex, setClips, showToast]
  );

  const handleInsertAtPlayhead = useCallback(
    (sc: Scene) => {
      const res = insertSceneAt(clips, time, sc);
      if (res) {
        setClips(res.clips);
        setSelectedClipIndex(res.index);
        showToast(
          `Scene #${sc.scene_index + 1} disisipkan di playhead (${time.toFixed(1)}s)`,
          "success"
        );
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
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
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

      // Save (Ctrl/Cmd + S)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveTimelineMutation.mutate({ manual: true });
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
  }, [
    undo,
    redo,
    saveTimelineMutation,
    handleSplit,
    handleDeleteSelectedClip,
    toggleLoop,
    stepFrames,
    jumpCut,
  ]);

  return {
    clips,
    setClips,
    beginGesture,
    cancelIfUnchanged,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    sceneMap,
    usedSceneMap,
    time,
    handleTimeChange,
    seekRequest,
    isPlaying,
    setIsPlaying,
    selectedClipIndex,
    handleSelectClip,
    isLoopingClip,
    loopRange,
    toggleLoop,
    activeSideTab,
    setActiveSideTab,
    isDrawerCollapsed,
    setIsDrawerCollapsed,
    drawerWidth,
    tracksHeight,
    setIsResizingDrawer,
    setIsResizingTracks,
    liveAspectRatio,
    setLiveAspectRatio,
    liveBackgroundFill,
    setLiveBackgroundFill,
    verticalPreviewWidth,
    setIsResizingVerticalPreview,
    isVertical,
    liveSubtitleStyle,
    setLiveSubtitleStyle,
    handleSubtitleChange,
    handleCustomSubtitlePositionChange,
    handleSubtitleDragEnd,
    liveWatermark,
    setLiveWatermark,
    handleWatermarkChange,
    handleCustomWatermarkPositionChange,
    handleWatermarkDragEnd,
    isAudioAttached,
    isSubtitlesAttached,
    attachedSegments,
    totalDuration,
    seekTo,
    stepFrames,
    jumpCut,
    peaks,
    previewData,
    setPreviewData,
    isAutoMatching,
    matchElapsed,
    autoMatchMutation,
    saveTimelineMutation,
    isClearConfirmOpen,
    setIsClearConfirmOpen,
    clearScope,
    setClearScope,
    clearTimelineMutation,
    readdNarrationMutation,
    handleReaddAll,
    handleReaddAudio,
    handleReaddSubtitles,
    canSplit,
    handleSplit,
    handleDeleteSelectedClip,
    getEdgeRange,
    handleEdgeDragStart,
    handleEdgeDrag,
    handleEdgeDragEnd,
    handleDropScene,
    handleReplaceSelectedClip,
    handleInsertAtPlayhead,
    handleAppendScene,
    handleSetClipDuration,
    handleSetClipSpeed,
    handleCenterClip,
    handleFillScene,
    handleSwapNeighbor,
    handlePreviewSelectedClipSource,
    setActiveTab,
  };
}

"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Project,
  ProjectDetail,
  StoryboardItem,
  SubtitleStyle,
  SentenceSegment,
  WordTimestamp,
  WatermarkConfig,
} from "@/types";
import { presetStorage, SubtitleCustomPreset } from "@/lib/presetStorage";
import { DEFAULT_SUBTITLE_STYLE } from "../constants";

export interface BurstGroupItem extends WordTimestamp {
  isActive: boolean;
}

export function useStoryboardTimelineState(project: Project) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast, subtitleDraftsByProject, setSubtitleDraft } = useStudioStore();

  const narration = project.narration;
  const audio = project.audio || project.audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const segments: SentenceSegment[] = narration?.segments || [];

  const draft = subtitleDraftsByProject[project.id];

  // Playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Inspector tab: "subtitles" vs "motion" vs "watermark" vs "bgm"
  const [activeRightTab, setActiveRightTab] = useState<
    "subtitles" | "motion" | "watermark" | "bgm"
  >("subtitles");

  // Watermark Live State (synchronized to project.watermark)
  const [liveWatermark, setLiveWatermark] = useState<WatermarkConfig | null>(
    project.watermark || null
  );

  useEffect(() => {
    if (project.watermark) {
      setLiveWatermark(project.watermark);
    }
  }, [project.watermark]);

  const handleCustomWatermarkPositionChange = (pos: { custom_x: number; custom_y: number }) => {
    if (!liveWatermark) return;
    const next: WatermarkConfig = {
      ...liveWatermark,
      position: "custom",
      custom_x: pos.custom_x,
      custom_y: pos.custom_y,
      enabled: true,
    };
    setLiveWatermark(next);
  };

  const handleWatermarkDragEnd = async () => {
    if (!liveWatermark) return;
    try {
      await api.updateProject(project.id, { watermark: liveWatermark });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      // ignore
    }
  };

  const handleWatermarkChange = async (newWm: WatermarkConfig) => {
    setLiveWatermark(newWm);
    try {
      await api.updateProject(project.id, { watermark: newWm });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      // ignore
    }
  };

  // Background Music (BGM) state
  const [selectedBgm, setSelectedBgm] = useState<string>("cinematic");
  const [bgmVolume, setBgmVolume] = useState<number>(15);
  const [autoDucking, setAutoDucking] = useState<boolean>(true);

  // Subtitle Style State (WYSIWYG 16:9 canvas)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() => {
    const base: SubtitleStyle = {
      ...DEFAULT_SUBTITLE_STYLE,
      enabled: project.subtitle_style?.enabled !== false,
      preset_name: project.subtitle_style?.preset_name || DEFAULT_SUBTITLE_STYLE.preset_name,
      font_family: project.subtitle_style?.font_family || DEFAULT_SUBTITLE_STYLE.font_family,
      font_size: project.subtitle_style?.font_size ?? DEFAULT_SUBTITLE_STYLE.font_size,
      font_weight: project.subtitle_style?.font_weight || DEFAULT_SUBTITLE_STYLE.font_weight,
      primary_color: project.subtitle_style?.primary_color || DEFAULT_SUBTITLE_STYLE.primary_color,
      highlight_color:
        project.subtitle_style?.highlight_color || DEFAULT_SUBTITLE_STYLE.highlight_color,
      outline_color: project.subtitle_style?.outline_color || DEFAULT_SUBTITLE_STYLE.outline_color,
      outline_width: project.subtitle_style?.outline_width ?? DEFAULT_SUBTITLE_STYLE.outline_width,
      box_color: project.subtitle_style?.box_color || DEFAULT_SUBTITLE_STYLE.box_color,
      box_opacity: project.subtitle_style?.box_opacity ?? DEFAULT_SUBTITLE_STYLE.box_opacity,
      position: project.subtitle_style?.position || DEFAULT_SUBTITLE_STYLE.position,
      offset_y: project.subtitle_style?.offset_y ?? DEFAULT_SUBTITLE_STYLE.offset_y,
      offset_x: project.subtitle_style?.offset_x ?? DEFAULT_SUBTITLE_STYLE.offset_x,
      display_mode: project.subtitle_style?.display_mode || DEFAULT_SUBTITLE_STYLE.display_mode,
      burst_word_count:
        project.subtitle_style?.burst_word_count ?? DEFAULT_SUBTITLE_STYLE.burst_word_count,
      highlight_animation:
        project.subtitle_style?.highlight_animation || DEFAULT_SUBTITLE_STYLE.highlight_animation,
      scale_factor: project.subtitle_style?.scale_factor ?? DEFAULT_SUBTITLE_STYLE.scale_factor,
      emoji_enabled: false,
    };
    if (draft?.style) return { ...base, ...draft.style };
    return base;
  });

  // Custom Subtitle Presets state
  const [customSubtitlePresets, setCustomSubtitlePresets] = useState<SubtitleCustomPreset[]>([]);
  const [selectedSubtitlePresetId, setSelectedSubtitlePresetId] = useState<string>(
    draft?.selectedPresetId || ""
  );
  const [showSaveSubtitleModal, setShowSaveSubtitleModal] = useState<boolean>(false);
  const [newSubtitlePresetName, setNewSubtitlePresetName] = useState<string>("");

  // Sync draft to store on change so switching tabs retains user modifications
  useEffect(() => {
    setSubtitleDraft(project.id, {
      style: subtitleStyle,
      selectedPresetId: selectedSubtitlePresetId,
    });
  }, [project.id, subtitleStyle, selectedSubtitlePresetId, setSubtitleDraft]);

  // Debounced auto-save to backend
  const isInitialSubtitleMountRef = useRef(true);
  useEffect(() => {
    if (isInitialSubtitleMountRef.current) {
      isInitialSubtitleMountRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      api
        .updateSubtitleStyle(project.id, subtitleStyle)
        .then((res) => {
          queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
            if (!old) return old;
            return { ...old, subtitle_style: res || subtitleStyle };
          });
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [subtitleStyle, project.id, queryClient]);

  useEffect(() => {
    setCustomSubtitlePresets(presetStorage.getSubtitlePresets());
  }, []);

  // Update item motion mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StoryboardItem> }) =>
      api.updateStoryboardItem(project.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Efek motion gambar diperbarui!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memperbarui motion", "error");
    },
  });

  // Save Subtitle Style mutation
  const updateStyleMutation = useMutation({
    mutationFn: (newStyle: SubtitleStyle) => api.updateSubtitleStyle(project.id, newStyle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gaya subtitle tersimpan untuk render final!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan subtitle", "error");
    },
  });

  const handleLoadSubtitlePreset = (presetId: string) => {
    setSelectedSubtitlePresetId(presetId);
    const found = customSubtitlePresets.find((p) => p.id === presetId);
    if (!found) return;
    setSubtitleStyle(found.style);
    updateStyleMutation.mutate(found.style);
    showToast(`Preset subtitle "${found.name}" berhasil dimuat!`, "success");
  };

  const handleSaveSubtitlePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtitlePresetName.trim()) {
      showToast("Nama preset subtitle tidak boleh kosong", "error");
      return;
    }
    const saved = presetStorage.saveSubtitlePreset(newSubtitlePresetName.trim(), subtitleStyle);
    setCustomSubtitlePresets(presetStorage.getSubtitlePresets());
    setSelectedSubtitlePresetId(saved.id);
    setNewSubtitlePresetName("");
    setShowSaveSubtitleModal(false);
    showToast(`Preset subtitle "${saved.name}" berhasil disimpan!`, "success");
  };

  const handleDeleteSubtitlePreset = (id: string, name: string) => {
    presetStorage.deleteSubtitlePreset(id);
    const remaining = presetStorage.getSubtitlePresets();
    setCustomSubtitlePresets(remaining);
    if (selectedSubtitlePresetId === id) setSelectedSubtitlePresetId("");
    showToast(`Preset subtitle "${name}" dihapus`, "info");
  };

  // Frame dimension measurement for pixel-perfect responsive scaling
  const [frameDimensions, setFrameDimensions] = useState({ width: 640, height: 360 });
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0, initialOffsetX: 0, initialOffsetY: 0 });

  useEffect(() => {
    if (!videoFrameRef.current) return;
    const updateSize = () => {
      if (videoFrameRef.current) {
        setFrameDimensions({
          width: videoFrameRef.current.clientWidth || 640,
          height: videoFrameRef.current.clientHeight || 360,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(videoFrameRef.current);
    return () => observer.disconnect();
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || audio?.duration || 0);
    }
  };

  const handleSeek = (timeSecs: number) => {
    setCurrentTime(timeSecs);
    if (audioRef.current) {
      audioRef.current.currentTime = timeSecs;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Active storyboard item selector without gap glitch!
  // Uses the latest item whose start_time <= currentTime, spanning naturally until next item starts.
  const activeItem = useMemo(() => {
    if (!items.length) return null;
    for (let i = items.length - 1; i >= 0; i--) {
      if (currentTime >= (items[i].start_time || 0)) {
        return items[i];
      }
    }
    return items[0];
  }, [items, currentTime]);

  // Active narration segment selector (with generous audio pause bridging)
  const activeSegment = useMemo(() => {
    if (!segments.length) return null;
    const curMs = currentTime * 1000;
    const direct = segments.find(
      (seg: SentenceSegment) => curMs >= seg.start_ms && curMs <= seg.end_ms + 250
    );
    if (direct) return direct;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (
        curMs >= segments[i].start_ms &&
        (i === segments.length - 1 || curMs < segments[i + 1].start_ms)
      ) {
        return segments[i];
      }
    }
    return segments[0] || null;
  }, [segments, currentTime]);

  // Subtitle Scaling Math relative to 1920x1080 Landscape
  const scale = frameDimensions.width / 1920;
  const scaleY = frameDimensions.height / 1080;
  const scaledFontSize = Math.max(9, Math.round((subtitleStyle.font_size || 38) * scale));
  const scaledOutlineWidth = Math.max(
    0,
    Number(((subtitleStyle.outline_width ?? 4) * scale).toFixed(2))
  );
  const scaledOffsetY = Math.round((subtitleStyle.offset_y || 0) * scaleY);
  const scaledOffsetX = Math.round((subtitleStyle.offset_x || 0) * scale);
  const isScaleAnim = subtitleStyle.highlight_animation === "scale";
  const isHighlightEnabled = subtitleStyle.highlight_animation !== "none";
  const zoomScale = isScaleAnim ? (subtitleStyle.scale_factor ?? 1.15) : 1.0;
  const fw = (subtitleStyle.font_weight || "Bold").toLowerCase();
  const fontWeightValue =
    fw === "bold" ? 800 : fw === "semibold" ? 700 : fw === "medium" ? 500 : 400;

  // Active words & burst calculations
  const curMs = currentTime * 1000;
  const segWords: WordTimestamp[] = activeSegment?.words || [];
  let activeWordIndex = -1;
  if (segWords.length > 0) {
    activeWordIndex = segWords.findIndex(
      (w: WordTimestamp) => curMs >= w.start_ms && curMs <= w.end_ms + 180
    );
    // Smooth hold across small inter-word pause within segment (up to 300ms pause)
    if (
      activeWordIndex === -1 &&
      curMs >= segWords[0].start_ms &&
      curMs <= segWords[segWords.length - 1].end_ms + 300
    ) {
      for (let i = segWords.length - 1; i >= 0; i--) {
        if (curMs >= segWords[i].start_ms) {
          const nextW = segWords[i + 1];
          const gap = nextW ? nextW.start_ms - segWords[i].end_ms : 999;
          if (curMs <= segWords[i].end_ms + (gap <= 350 ? gap : 200)) {
            activeWordIndex = i;
          }
          break;
        }
      }
    }
  }

  const burstCount = Math.max(2, subtitleStyle.burst_word_count || 2);
  let activeBurstGroup: BurstGroupItem[] = [];
  if (subtitleStyle.display_mode === "burst" && segWords.length > 0) {
    for (let i = 0; i < segWords.length; i += burstCount) {
      const group = segWords.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      const nextSlice = segWords.slice(i + burstCount, i + burstCount + 1);
      const maxGEnd =
        nextSlice.length > 0
          ? Math.min(nextSlice[0].start_ms, gEnd + 350)
          : Math.min(activeSegment?.end_ms ?? gEnd + 350, gEnd + 350);

      if (curMs >= gStart && curMs <= maxGEnd) {
        activeBurstGroup = group.map((item: WordTimestamp, localIdx: number) => ({
          ...item,
          isActive: isHighlightEnabled && i + localIdx === activeWordIndex,
        }));
        break;
      }
    }
  }

  // Interactive Drag-to-Position on Subtitle
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDraggingSubtitle(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: subtitleStyle.offset_x || 0,
      initialOffsetY: subtitleStyle.offset_y || 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    const newAssDeltaX = Math.round(deltaX / (scale || 1));
    // Invert Y when subtitle at bottom — CSS applies negative offset
    const pos = subtitleStyle.position || "bottom";
    const ySign = pos === "bottom" ? -1 : 1;
    const newAssDeltaY = Math.round((deltaY * ySign) / (scaleY || 1));
    setSubtitleStyle((prev) => ({
      ...prev,
      offset_x: dragStartPos.current.initialOffsetX + newAssDeltaX,
      offset_y: dragStartPos.current.initialOffsetY + newAssDeltaY,
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle) return;
    setIsDraggingSubtitle(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    // Use functional read to get latest subtitle style (avoids stale closure)
    setSubtitleStyle((latest) => {
      updateStyleMutation.mutate(latest);
      return latest;
    });
  };

  // Compute CSS animation class for active motion effect
  const getMotionAnimationClass = (effect?: string) => {
    switch (effect) {
      case "zoom_in":
        return "scale-110 transition-transform duration-[6000ms] ease-out";
      case "zoom_out":
        return "scale-100 scale-x-105 transition-transform duration-[6000ms] ease-out";
      case "pan_left":
        return "translate-x-3 scale-105 transition-transform duration-[6000ms] ease-out";
      case "pan_right":
        return "-translate-x-3 scale-105 transition-transform duration-[6000ms] ease-out";
      default:
        return "scale-100 transition-none";
    }
  };

  return {
    // Project & derived data
    project,
    audio,
    items,
    segments,
    activeItem,
    activeSegment,
    // Playback state & handlers
    audioRef,
    videoFrameRef,
    isPlaying,
    currentTime,
    duration,
    isMuted,
    setIsMuted,
    togglePlay,
    handleSeek,
    handleTimeUpdate,
    handleLoadedMetadata,
    formatTime,
    // Inspector & tab state
    activeRightTab,
    setActiveRightTab,
    setActiveTab,
    // Subtitle style & mutation
    subtitleStyle,
    setSubtitleStyle,
    updateStyleMutation,
    updateItemMutation,
    // Custom presets state & handlers
    customSubtitlePresets,
    selectedSubtitlePresetId,
    showSaveSubtitleModal,
    setShowSaveSubtitleModal,
    newSubtitlePresetName,
    setNewSubtitlePresetName,
    handleLoadSubtitlePreset,
    handleSaveSubtitlePreset,
    handleDeleteSubtitlePreset,
    // Subtitle responsive metrics & drag handlers
    scaledFontSize,
    scaledOutlineWidth,
    scaledOffsetY,
    scaledOffsetX,
    zoomScale,
    fontWeightValue,
    isScaleAnim,
    isHighlightEnabled,
    segWords,
    activeWordIndex,
    activeBurstGroup,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    // Motion animation classes
    getMotionAnimationClass,
    // Watermark state & handlers
    liveWatermark,
    setLiveWatermark,
    handleCustomWatermarkPositionChange,
    handleWatermarkDragEnd,
    handleWatermarkChange,
    // Background Music (BGM) state
    selectedBgm,
    setSelectedBgm,
    bgmVolume,
    setBgmVolume,
    autoDucking,
    setAutoDucking,
  };
}

export type StoryboardTimelineState = ReturnType<typeof useStoryboardTimelineState>;

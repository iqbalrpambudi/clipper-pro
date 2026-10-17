"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  Clock,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Type,
  Sparkles,
  Move,
  Flame,
  Zap,
  Eye,
  Save,
  Palette,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem, SubtitleStyle } from "@/types";
import { Button, Badge } from "@/components/ui";

interface StoryboardTimelineTabProps {
  project: Project & {
    narration?: any;
    audio?: any;
    storyboard_items?: StoryboardItem[];
    subtitle_style?: SubtitleStyle | null;
  };
}

function hexToRgba(hex: string, opacity: number = 1): string {
  if (!hex) return `rgba(0, 0, 0, ${opacity})`;
  const clean = hex.replace("#", "");
  const fullHex = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(fullHex.substring(0, 2), 16) || 0;
  const g = parseInt(fullHex.substring(2, 4), 16) || 0;
  const b = parseInt(fullHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Popular 1-Click Color Schemes matching Short Clipper
const COLOR_PRESETS = [
  {
    name: "TikTok Viral",
    icon: Flame,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
  {
    name: "Alex Hormozi",
    icon: Zap,
    font_family: "Bebas Neue",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#00FF66",
    outline_color: "#000000",
    outline_width: 6,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "scale" as const,
    scale_factor: 1.25,
  },
  {
    name: "Cyber Aqua",
    icon: Zap,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#00E5FF",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
  {
    name: "Neon Lime",
    icon: Sparkles,
    font_family: "Montserrat",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#39FF14",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
  {
    name: "Hot Sunset",
    icon: Flame,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FF453A",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
  {
    name: "Minimal Clean",
    icon: Eye,
    font_family: "Inter",
    font_weight: "Regular",
    primary_color: "#F8FAFC",
    highlight_color: "#38BDF8",
    outline_color: "#0F172A",
    outline_width: 3,
    box_color: "#000000",
    box_opacity: 0,
    display_mode: "full_sentence" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
  {
    name: "Caption Box",
    icon: Layers,
    font_family: "Poppins",
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 2,
    box_color: "#000000",
    box_opacity: 0.75,
    display_mode: "burst" as const,
    burst_word_count: 2,
    highlight_animation: "color" as const,
    scale_factor: 1.0,
  },
];

export function StoryboardTimelineTab({ project }: StoryboardTimelineTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const narration = project.narration;
  const audio = (project as any).audio || (project as any).audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const segments: any[] = narration?.segments || [];

  // Playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoFrameRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Inspector tab: "motion" vs "subtitles"
  const [activeRightTab, setActiveRightTab] = useState<"motion" | "subtitles">("subtitles");

  // Subtitle Style State (WYSIWYG 16:9 canvas)
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(() => ({
    enabled: project.subtitle_style?.enabled !== false,
    preset_name: project.subtitle_style?.preset_name || "viral_tiktok",
    font_family: project.subtitle_style?.font_family || "Poppins",
    font_size: project.subtitle_style?.font_size ?? 38,
    font_weight: project.subtitle_style?.font_weight || "Bold",
    primary_color: project.subtitle_style?.primary_color || "#FFFFFF",
    highlight_color: project.subtitle_style?.highlight_color || "#FFE600",
    outline_color: project.subtitle_style?.outline_color || "#000000",
    outline_width: project.subtitle_style?.outline_width ?? 4,
    box_color: project.subtitle_style?.box_color || "#000000",
    box_opacity: project.subtitle_style?.box_opacity ?? 0.0,
    position: project.subtitle_style?.position || "bottom",
    offset_y: project.subtitle_style?.offset_y ?? -30,
    offset_x: project.subtitle_style?.offset_x ?? 0,
    display_mode: project.subtitle_style?.display_mode || "burst",
    burst_word_count: project.subtitle_style?.burst_word_count ?? 2,
    highlight_animation: project.subtitle_style?.highlight_animation || "color",
    scale_factor: project.subtitle_style?.scale_factor ?? 1.0,
    emoji_enabled: false,
  }));

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

  // Update item motion mutation
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StoryboardItem> }) =>
      api.updateStoryboardItem(project.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Efek motion gambar diperbarui!", "success");
    },
    onError: (err: any) => {
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
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan subtitle", "error");
    },
  });

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

  // FIX: Active storyboard item selector without gap glitch!
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
    const direct = segments.find((seg: any) => curMs >= seg.start_ms && curMs <= (seg.end_ms + 250));
    if (direct) return direct;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (curMs >= segments[i].start_ms && (i === segments.length - 1 || curMs < segments[i + 1].start_ms)) {
        return segments[i];
      }
    }
    return segments[0] || null;
  }, [segments, currentTime]);

  // Subtitle Scaling Math relative to 1920x1080 Landscape
  const scale = frameDimensions.width / 1920;
  const scaleY = frameDimensions.height / 1080;
  const scaledFontSize = Math.max(9, Math.round((subtitleStyle.font_size || 38) * scale));
  const scaledOutlineWidth = Math.max(0, Number(((subtitleStyle.outline_width ?? 4) * scale).toFixed(2)));
  const scaledOffsetY = Math.round((subtitleStyle.offset_y || 0) * scaleY);
  const scaledOffsetX = Math.round((subtitleStyle.offset_x || 0) * scale);
  const isScaleAnim = subtitleStyle.highlight_animation === "scale";
  const isHighlightEnabled = subtitleStyle.highlight_animation !== "none";
  const zoomScale = isScaleAnim ? (subtitleStyle.scale_factor ?? 1.15) : 1.0;
  const fw = (subtitleStyle.font_weight || "Bold").toLowerCase();
  const fontWeightValue = fw === "bold" ? 800 : fw === "semibold" ? 700 : fw === "medium" ? 500 : 400;

  // Active words & burst calculations
  const curMs = currentTime * 1000;
  const segWords: any[] = activeSegment?.words || [];
  let activeWordIndex = -1;
  if (segWords.length > 0) {
    activeWordIndex = segWords.findIndex((w: any) => curMs >= w.start_ms && curMs <= (w.end_ms + 180));
    // Smooth hold across small inter-word pause within segment (up to 300ms pause)
    if (activeWordIndex === -1 && curMs >= segWords[0].start_ms && curMs <= segWords[segWords.length - 1].end_ms + 300) {
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
  let activeBurstGroup: { word: string; start_ms: number; end_ms: number; isActive: boolean }[] = [];
  if (subtitleStyle.display_mode === "burst" && segWords.length > 0) {
    for (let i = 0; i < segWords.length; i += burstCount) {
      const group = segWords.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      const nextSlice = segWords.slice(i + burstCount, i + burstCount + 1);
      const maxGEnd = nextSlice.length > 0
        ? Math.min(nextSlice[0].start_ms, gEnd + 350)
        : Math.min((activeSegment?.end_ms ?? gEnd + 350), gEnd + 350);

      if (curMs >= gStart && curMs <= maxGEnd) {
        activeBurstGroup = group.map((item: any, localIdx: number) => ({
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
    const newAssDeltaY = Math.round(deltaY / (scaleY || 1));
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
    updateStyleMutation.mutate(subtitleStyle);
  };

  // Compute CSS animation class for active motion effect
  const getMotionAnimationClass = (effect: string) => {
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

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 4 dari 5
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Timeline, Motion & Studio Subtitle WYSIWYG
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Preview Video 16:9 & Studio Kustomisasi Subtitle
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tonton simulasi preview video landscape 16:9 dengan live karaoke subtitle dan penataan visual adegan secara real-time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("storyboard_images")}
            className="border-[#2E2E2E] text-xs"
          >
            Kembali ke Ilustrasi
          </Button>

          <Button
            onClick={() => setActiveTab("storyboard_render")}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
          >
            <span>Lanjut ke Render & Export</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Hidden Audio Element */}
      {audio && (
        <audio
          ref={audioRef}
          src={audio.audio_url || audio.file_url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Main Preview Player & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 16:9 Landscape Video Player Screen (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div
            ref={videoFrameRef}
            className="relative aspect-video rounded-2xl bg-black border border-[#2E2E2E] overflow-hidden shadow-2xl flex items-center justify-center select-none"
          >
            {activeItem && activeItem.image_url ? (
              <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                <img
                  key={activeItem.id}
                  src={activeItem.image_url}
                  alt={activeItem.image_prompt}
                  className={`w-full h-full object-cover origin-center ${
                    isPlaying ? getMotionAnimationClass(activeItem.motion_effect) : "scale-100"
                  }`}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-slate-500">
                <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                <span className="text-xs font-mono">
                  {items.length === 0 ? "Belum ada gambar" : "Gambar sedang diproses"}
                </span>
              </div>
            )}

            {/* WYSIWYG Live Subtitle Overlay */}
            {subtitleStyle.enabled !== false && activeSegment && (
              <div
                className="absolute left-0 right-0 z-20 px-6 flex justify-center text-center select-none pointer-events-none"
                style={{
                  top: subtitleStyle.position === "top" ? "10%" : subtitleStyle.position === "center" ? "50%" : undefined,
                  bottom: subtitleStyle.position === "bottom" || !subtitleStyle.position ? "12%" : undefined,
                  transform: `translate(${scaledOffsetX}px, ${
                    subtitleStyle.position === "center"
                      ? `calc(-50% + ${scaledOffsetY}px)`
                      : subtitleStyle.position === "bottom"
                      ? `${-scaledOffsetY}px`
                      : `${scaledOffsetY}px`
                  })`,
                }}
              >
                {/* 1. Burst Mode (2-3 kata) */}
                {subtitleStyle.display_mode === "burst" ? (
                  activeBurstGroup.length > 0 ? (
                    <div
                      style={{
                        fontSize: `${scaledFontSize}px`,
                        fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                        fontWeight: fontWeightValue,
                        color: subtitleStyle.primary_color || "#FFFFFF",
                        WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                        paintOrder: "stroke fill",
                        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                        backgroundColor:
                          (subtitleStyle.box_opacity ?? 0) > 0.05
                            ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                            : "transparent",
                        padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                        borderRadius: "8px",
                      }}
                      className="flex items-center justify-center gap-2 uppercase tracking-wide"
                    >
                      {activeBurstGroup.map((w, idx) => (
                        <span
                          key={idx}
                          style={{
                            color: w.isActive ? subtitleStyle.highlight_color || "#FFE600" : subtitleStyle.primary_color || "#FFFFFF",
                            transform: w.isActive && isScaleAnim ? `scale(${zoomScale})` : "none",
                            transition: "all 0.08s ease-out",
                            display: "inline-block",
                          }}
                        >
                          {w.word}
                        </span>
                      ))}
                    </div>
                  ) : null
                ) : subtitleStyle.display_mode === "per_word" ? (
                  /* 2. Per Word Mode */
                  activeWordIndex !== -1 && segWords[activeWordIndex] ? (
                    <div
                      style={{
                        fontSize: `${scaledFontSize * 1.05}px`,
                        fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                        fontWeight: fontWeightValue,
                        color: isHighlightEnabled ? subtitleStyle.highlight_color || "#FFE600" : subtitleStyle.primary_color || "#FFFFFF",
                        WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                        paintOrder: "stroke fill",
                        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                        transform: isHighlightEnabled && isScaleAnim ? `scale(${zoomScale})` : "none",
                        backgroundColor:
                          (subtitleStyle.box_opacity ?? 0) > 0.05
                            ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                            : "transparent",
                        padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                        borderRadius: "8px",
                        display: "inline-block",
                      }}
                      className="uppercase tracking-wide"
                    >
                      {segWords[activeWordIndex].word}
                    </div>
                  ) : null
                ) : (
                  /* 3. Full Sentence Mode with Karaoke Word Highlight */
                  <div
                    style={{
                      fontSize: `${Math.round(scaledFontSize * 0.9)}px`,
                      fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                      fontWeight: fontWeightValue,
                      color: subtitleStyle.primary_color || "#FFFFFF",
                      WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                      paintOrder: "stroke fill",
                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                      backgroundColor:
                        (subtitleStyle.box_opacity ?? 0) > 0.05
                          ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                          : "transparent",
                      padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                      borderRadius: "8px",
                    }}
                    className="inline-block uppercase tracking-wide leading-snug max-w-[85%]"
                  >
                    {segWords.length > 0
                      ? segWords.map((w: any, i: number) => {
                          const isActive = isHighlightEnabled && i === activeWordIndex;
                          return (
                            <span
                              key={i}
                              style={{
                                color: isActive ? subtitleStyle.highlight_color || "#FFE600" : subtitleStyle.primary_color || "#FFFFFF",
                                transform: isActive && isScaleAnim ? `scale(${zoomScale})` : "none",
                                transition: "all 0.08s ease-out",
                                display: "inline-block",
                              }}
                              className="mr-1.5"
                            >
                              {w.word}
                            </span>
                          );
                        })
                      : activeSegment.text}
                  </div>
                )}
              </div>
            )}

            {/* Interactive Drag Handle for Subtitle Position */}
            {subtitleStyle.enabled !== false && (
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute left-6 right-6 z-30 flex justify-center text-center select-none cursor-move group"
                style={{
                  top: subtitleStyle.position === "top" ? "10%" : subtitleStyle.position === "center" ? "50%" : undefined,
                  bottom: subtitleStyle.position === "bottom" || !subtitleStyle.position ? "12%" : undefined,
                  transform: `translate(${scaledOffsetX}px, ${
                    subtitleStyle.position === "center"
                      ? `calc(-50% + ${scaledOffsetY}px)`
                      : subtitleStyle.position === "bottom"
                      ? `${-scaledOffsetY}px`
                      : `${scaledOffsetY}px`
                  })`,
                }}
              >
                <div className="w-full max-w-[340px] h-12 rounded-xl border border-dashed border-transparent group-hover:border-violet-400/70 transition-all flex items-center justify-center pointer-events-auto">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 text-[10px] text-violet-300 px-2.5 py-1 rounded font-mono flex items-center gap-1.5 shadow-lg pointer-events-none">
                    <Move className="w-3 h-3" />
                    <span>Tarik untuk geser posisi subtitle</span>
                  </div>
                </div>
              </div>
            )}

            {/* Top Left Badge: Timestamp & Scene */}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white font-bold border border-white/10">
                {formatTime(currentTime)} / {formatTime(duration || audio?.duration || 0)}
              </span>
              {activeItem && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-600/80 backdrop-blur-md text-violet-100 font-semibold border border-violet-400/30">
                  Motion: {activeItem.motion_effect}
                </span>
              )}
            </div>
          </div>

          {/* Player Controls Bar */}
          <div className="p-4 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 transition"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleSeek(Math.max(0, currentTime - 5))}
                  className="p-2 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition"
                  title="Mundur 5 detik"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const newEnabled = subtitleStyle.enabled === false;
                    const updated = { ...subtitleStyle, enabled: newEnabled };
                    setSubtitleStyle(updated);
                    updateStyleMutation.mutate(updated);
                    showToast(
                      newEnabled ? "Subtitle diaktifkan." : "Subtitle dinonaktifkan (video bersih).",
                      "info"
                    );
                  }}
                  className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 text-xs font-mono font-semibold border ${
                    subtitleStyle.enabled !== false
                      ? "bg-violet-600/20 text-violet-300 border-violet-500/40"
                      : "bg-[#222222] text-slate-500 border-[#2E2E2E]"
                  }`}
                  title={subtitleStyle.enabled !== false ? "Matikan Subtitle Video" : "Aktifkan Subtitle Video"}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold">{subtitleStyle.enabled !== false ? "SUBTITLE ON" : "SUBTITLE OFF"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="p-2 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <span className="text-xs font-mono font-bold text-violet-400">
                  {formatTime(currentTime)} / {formatTime(duration || audio?.duration || 0)}
                </span>
              </div>
            </div>

            {/* Seekbar */}
            <input
              type="range"
              min={0}
              max={duration || audio?.duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer h-2 bg-[#2A2A2A] rounded-lg"
            />
          </div>
        </div>

        {/* Right Column: Tabbed Inspector (Motion vs Subtitle Studio) (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-5 shadow-xl">
          {/* Tab Switcher */}
          <div className="flex items-center gap-2 p-1 bg-[#121212] rounded-xl border border-[#2E2E2E]">
            <button
              type="button"
              onClick={() => setActiveRightTab("subtitles")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition ${
                activeRightTab === "subtitles"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Studio Subtitle</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveRightTab("motion")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition ${
                activeRightTab === "motion"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Adegan & Motion</span>
            </button>
          </div>

          {/* Subtitle Customization Studio Panel */}
          {activeRightTab === "subtitles" ? (
            <div className="space-y-4">
              {/* Checklist Toggle: Enable / Disable Subtitle */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#2A2A2A] shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="subtitle-enable-check" className="flex items-center gap-3 cursor-pointer select-none flex-1">
                    <input
                      id="subtitle-enable-check"
                      type="checkbox"
                      checked={subtitleStyle.enabled !== false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const updated: SubtitleStyle = {
                          ...subtitleStyle,
                          enabled: checked,
                        };
                        setSubtitleStyle(updated);
                        updateStyleMutation.mutate(updated);
                        showToast(
                          checked ? "Subtitle diaktifkan." : "Subtitle dinonaktifkan (video bersih tanpa subtitle).",
                          "info"
                        );
                      }}
                      className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Gunakan Subtitle pada Video</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {subtitleStyle.enabled !== false
                          ? "Subtitle tampil di preview dan akan dibakar ke render video"
                          : "Video bersih tanpa teks (hanya visual adegan & audio narasi)"}
                      </span>
                    </div>
                  </label>

                  <Badge
                    variant={subtitleStyle.enabled !== false ? "default" : "secondary"}
                    className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
                      subtitleStyle.enabled !== false
                        ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                        : "bg-[#222222] text-slate-500 border border-[#333333]"
                    }`}
                  >
                    {subtitleStyle.enabled !== false ? "AKTIF" : "NONAKTIF"}
                  </Badge>
                </div>
              </div>

              {subtitleStyle.enabled === false && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                  <span>⚠️ Subtitle sedang dinonaktifkan. Video akan dirender bersih tanpa subtitle. Beri centang pada checklist di atas jika ingin mengaktifkan subtitle kembali.</span>
                </div>
              )}

              {/* Presets 1-Click */}
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-2 flex items-center justify-between">
                  <span>Pilihan Gaya Preset Cepat:</span>
                  <span className="text-[10px] text-violet-400 font-mono">1-Click Theme</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {COLOR_PRESETS.map((p) => {
                    const isSelected = subtitleStyle.preset_name === p.name.toLowerCase().replace(/\s+/g, "_");
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => {
                          const updated: SubtitleStyle = {
                            ...subtitleStyle,
                            preset_name: p.name.toLowerCase().replace(/\s+/g, "_"),
                            font_family: p.font_family,
                            font_weight: p.font_weight,
                            primary_color: p.primary_color,
                            highlight_color: p.highlight_color,
                            outline_color: p.outline_color,
                            outline_width: p.outline_width,
                            box_color: p.box_color,
                            box_opacity: p.box_opacity,
                            display_mode: p.display_mode,
                            burst_word_count: p.burst_word_count,
                            highlight_animation: p.highlight_animation,
                            scale_factor: p.scale_factor,
                          };
                          setSubtitleStyle(updated);
                          updateStyleMutation.mutate(updated);
                        }}
                        className={`p-2 rounded-xl text-xs border text-left flex items-center justify-between transition ${
                          isSelected
                            ? "bg-violet-500/20 border-violet-500 text-white font-semibold"
                            : "bg-[#141414] border-[#2A2A2A] text-slate-300 hover:border-violet-500/40"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Icon className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                          <span className="truncate">{p.name}</span>
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-violet-400 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/40"
                            style={{ backgroundColor: p.primary_color }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/40"
                            style={{ backgroundColor: p.highlight_color }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-black/40"
                            style={{ backgroundColor: p.outline_color }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Tampilan Kata */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-2.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-violet-400" />
                  <span>Mode Tampilan Kata</span>
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "burst", label: "Burst", desc: "Kelompok kata" },
                    { id: "per_word", label: "Per-Kata", desc: "1 kata bergantian" },
                    { id: "full_sentence", label: "Kalimat", desc: "Baris penuh" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          display_mode: m.id as any,
                        }))
                      }
                      className={`p-2 rounded-xl text-center border transition flex flex-col items-center ${
                        subtitleStyle.display_mode === m.id
                          ? "bg-violet-600/30 border-violet-500 text-violet-200 font-semibold"
                          : "bg-[#101010] border-[#2A2A2A] text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className="text-[9px] text-muted-foreground">{m.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Kata per Kelompok untuk Mode Burst */}
                {subtitleStyle.display_mode === "burst" && (
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181818] border border-[#2E2E2E] mt-1">
                    <span className="text-xs font-semibold text-slate-300">Kata per Kelompok Burst</span>
                    <div className="flex gap-1.5">
                      {[2, 3].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() =>
                            setSubtitleStyle((prev) => ({
                              ...prev,
                              burst_word_count: count,
                            }))
                          }
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            (subtitleStyle.burst_word_count || 2) === count
                              ? "bg-violet-600 text-white shadow-sm"
                              : "bg-[#242424] text-slate-400 hover:text-white"
                          }`}
                        >
                          {count} Kata
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Animasi & Efek Gerak Highlight */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-violet-400" />
                    <span>Animasi & Efek Gerak Highlight</span>
                  </span>
                  <span className="text-[10px] font-mono text-violet-300 uppercase px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
                    {subtitleStyle.highlight_animation === "scale"
                      ? "Scale Pop"
                      : subtitleStyle.highlight_animation === "none"
                      ? "Statis"
                      : "Warna Glow"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "color" }))}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition ${
                      subtitleStyle.highlight_animation === "color" || !subtitleStyle.highlight_animation
                        ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                        : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block">Warna Glow</span>
                    <span className="text-[9px] text-muted-foreground">Transisi halus glow</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "scale" }))}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition ${
                      subtitleStyle.highlight_animation === "scale"
                        ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                        : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block">Scale Pop</span>
                    <span className="text-[9px] text-muted-foreground">Membesar & loncat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubtitleStyle((prev) => ({ ...prev, highlight_animation: "none" }))}
                    className={`p-2 rounded-xl border text-left cursor-pointer transition ${
                      subtitleStyle.highlight_animation === "none"
                        ? "border-violet-500 bg-violet-500/20 text-white font-semibold"
                        : "border-[#2A2A2A] bg-[#101010] text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="text-xs font-bold block">Statis</span>
                    <span className="text-[9px] text-muted-foreground">Tanpa animasi</span>
                  </button>
                </div>

                {/* Tingkat Pembesaran Slider jika Scale Pop */}
                {subtitleStyle.highlight_animation === "scale" && (
                  <div className="p-2.5 rounded-lg bg-[#181818] border border-[#2E2E2E] space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-medium">Tingkat Pembesaran (Scale Factor)</span>
                      <span className="font-mono text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                        {(subtitleStyle.scale_factor || 1.15).toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.05}
                      max={1.65}
                      step={0.05}
                      value={subtitleStyle.scale_factor || 1.15}
                      onChange={(e) =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          scale_factor: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg mt-1"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Halus (1.05x)</span>
                      <span>Standar (1.20x)</span>
                      <span>Ekstrem (1.60x)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Tipografi: Jenis Font & Ketebalan */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-violet-400" />
                  <span>Tipografi & Ukuran Teks</span>
                </span>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Jenis Font:
                    </label>
                    <select
                      value={subtitleStyle.font_family || "Poppins"}
                      onChange={(e) =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          font_family: e.target.value,
                        }))
                      }
                      className="w-full bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="Poppins">Poppins (Modern Sans)</option>
                      <option value="Montserrat">Montserrat (Geometric)</option>
                      <option value="Bebas Neue">Bebas Neue (Punch)</option>
                      <option value="Anton">Anton (Bold Heavy)</option>
                      <option value="Oswald">Oswald (Condensed)</option>
                      <option value="Inter">Inter (Clean)</option>
                      <option value="Roboto">Roboto (Neutral)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Ketebalan Font:
                    </label>
                    <select
                      value={subtitleStyle.font_weight || "Bold"}
                      onChange={(e) =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          font_weight: e.target.value,
                        }))
                      }
                      className="w-full bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="Bold">Bold (Tebal)</option>
                      <option value="SemiBold">SemiBold (Sedang Tebal)</option>
                      <option value="Medium">Medium (Sedang)</option>
                      <option value="Regular">Regular (Normal)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-1">
                    <span>Ukuran Font:</span>
                    <span className="font-mono text-violet-400 font-bold bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                      {subtitleStyle.font_size || 38}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={72}
                    step={1}
                    value={subtitleStyle.font_size || 38}
                    onChange={(e) =>
                      setSubtitleStyle((prev) => ({
                        ...prev,
                        font_size: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg mt-1"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Kecil (24px)</span>
                    <span>Sedang (38px)</span>
                    <span>Besar (64px)</span>
                  </div>
                </div>
              </div>

              {/* Palet Warna, Garis Luar (Outer Text), & Kotak Latar */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-violet-400" />
                  <span>Warna Teks & Garis Luar (Outer Text)</span>
                </span>

                <div className="grid grid-cols-2 gap-2.5">
                  {/* Warna Teks Normal */}
                  <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
                    <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
                      Teks Normal
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={subtitleStyle.primary_color || "#FFFFFF"}
                        onChange={(e) =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            primary_color: e.target.value,
                          }))
                        }
                        className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-slate-200 text-xs font-semibold">
                        {subtitleStyle.primary_color || "#FFFFFF"}
                      </span>
                    </div>
                  </div>

                  {/* Warna Highlight Kata */}
                  <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
                    <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
                      Highlight Kata
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={subtitleStyle.highlight_color || "#FFE600"}
                        onChange={(e) =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            highlight_color: e.target.value,
                          }))
                        }
                        className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-violet-400 text-xs font-semibold">
                        {subtitleStyle.highlight_color || "#FFE600"}
                      </span>
                    </div>
                  </div>

                  {/* Garis Luar (Outer Text / Outline Color) */}
                  <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
                    <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
                      Garis Luar (Outer)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={subtitleStyle.outline_color || "#000000"}
                        onChange={(e) =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            outline_color: e.target.value,
                          }))
                        }
                        className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-slate-200 text-xs font-semibold">
                        {subtitleStyle.outline_color || "#000000"}
                      </span>
                    </div>
                  </div>

                  {/* Kotak Latar (Box Color) */}
                  <div className="p-2.5 rounded-xl bg-[#1A1A1A] border border-[#2E2E2E]">
                    <label className="text-slate-400 block mb-1 text-[10px] font-medium uppercase font-mono">
                      Kotak Latar (Box)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={subtitleStyle.box_color || "#000000"}
                        onChange={(e) =>
                          setSubtitleStyle((prev) => ({
                            ...prev,
                            box_color: e.target.value,
                          }))
                        }
                        className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                      />
                      <span className="font-mono text-slate-200 text-xs font-semibold">
                        {subtitleStyle.box_color || "#000000"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sliders: Tebal Outline & Opasitas Kotak */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <div className="flex justify-between items-center mb-1 text-[11px] font-semibold text-slate-300">
                      <span>Tebal Outline</span>
                      <span className="font-mono text-violet-400 font-bold">{subtitleStyle.outline_width ?? 4}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={subtitleStyle.outline_width ?? 4}
                      onChange={(e) =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          outline_width: parseInt(e.target.value) || 0,
                        }))
                      }
                      className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1 text-[11px] font-semibold text-slate-300">
                      <span>Opasitas Kotak</span>
                      <span className="font-mono text-violet-400 font-bold">
                        {Math.round((subtitleStyle.box_opacity || 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={subtitleStyle.box_opacity || 0}
                      onChange={(e) =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          box_opacity: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Posisi Layar & Offset */}
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Move className="w-3.5 h-3.5 text-violet-400" />
                    <span>Posisi Layar Subtitle</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSubtitleStyle((prev) => ({
                        ...prev,
                        position: "bottom",
                        offset_x: 0,
                        offset_y: -30,
                      }))
                    }
                    className="text-[10px] text-violet-400 hover:underline"
                  >
                    Reset Posisi
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "top", label: "Atas" },
                    { id: "center", label: "Tengah" },
                    { id: "bottom", label: "Bawah" },
                  ].map((pos) => (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() =>
                        setSubtitleStyle((prev) => ({
                          ...prev,
                          position: pos.id as any,
                          offset_y: pos.id === "bottom" ? -30 : 0,
                        }))
                      }
                      className={`p-1.5 rounded-lg text-[11px] font-medium border text-center transition ${
                        subtitleStyle.position === pos.id
                          ? "bg-violet-600/30 border-violet-500 text-violet-200 font-semibold"
                          : "bg-[#101010] border-[#2A2A2A] text-slate-400 hover:text-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>

                {/* Offset Y Slider */}
                <div className="pt-1">
                  <div className="flex justify-between items-center mb-1 text-[11px] text-slate-300">
                    <span>Offset Posisi Vertikal (Y):</span>
                    <span className="font-mono text-violet-400 font-bold">{subtitleStyle.offset_y || 0}px</span>
                  </div>
                  <input
                    type="range"
                    min={-120}
                    max={120}
                    step={2}
                    value={subtitleStyle.offset_y || 0}
                    onChange={(e) =>
                      setSubtitleStyle((prev) => ({
                        ...prev,
                        offset_y: parseInt(e.target.value) || 0,
                      }))
                    }
                    className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>Lebih Rendah</span>
                    <span>Bisa digeser langsung di preview</span>
                    <span>Lebih Tinggi</span>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <Button
                onClick={() => updateStyleMutation.mutate(subtitleStyle)}
                disabled={updateStyleMutation.isPending}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20 mt-2 py-2.5"
              >
                {updateStyleMutation.isPending ? (
                  <span>Menyimpan...</span>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Gaya Subtitle</span>
                  </>
                )}
              </Button>
            </div>
          ) : (
            /* Adegan & Motion Effect Inspector */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
                <span className="text-xs font-semibold text-white">Adegan Saat Ini</span>
                {activeItem && (
                  <span className="text-[11px] font-mono text-slate-400">
                    Detik {activeItem.start_time}s – {activeItem.end_time}s
                  </span>
                )}
              </div>

              {activeItem ? (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
                      Naskah Narasi Suara:
                    </span>
                    <p className="text-xs text-slate-200 bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
                      &ldquo;{activeItem.script_text}&rdquo;
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
                      Prompt Gambar Ilustrasi:
                    </span>
                    <p className="text-xs text-slate-300 font-mono bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
                      {activeItem.image_prompt}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Efek Gerakan Ken Burns:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: "zoom_in", label: "Slow Zoom In" },
                        { id: "zoom_out", label: "Slow Zoom Out" },
                        { id: "pan_left", label: "Pan Left" },
                        { id: "pan_right", label: "Pan Right" },
                        { id: "static", label: "Statis (Diam)" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            updateItemMutation.mutate({
                              id: activeItem.id,
                              data: { motion_effect: m.id as any },
                            })
                          }
                          className={`p-2 rounded-xl text-xs font-medium border text-center transition ${
                            activeItem.motion_effect === m.id
                              ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                              : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Pilih titik timeline untuk melihat detail adegan.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Storyboard Track List */}
      <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Urutan Timeline Adegan Gambar ({items.length} Klip)
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            Klik kartu untuk melompat ke detik tersebut
          </span>
        </div>

        <div className="flex items-stretch gap-3 overflow-x-auto pb-4 pt-1">
          {items.map((item, idx) => {
            const isCurrent = activeItem?.id === item.id;

            return (
              <div
                key={item.id}
                onClick={() => handleSeek(item.start_time)}
                className={`min-w-[200px] max-w-[220px] rounded-xl border p-2.5 cursor-pointer transition flex flex-col justify-between shrink-0 ${
                  isCurrent
                    ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/30"
                    : "border-[#2E2E2E] bg-[#141414] hover:border-violet-500/40"
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video rounded-lg bg-black overflow-hidden mb-2 border border-[#262626]">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.image_prompt}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}

                  <span className="absolute top-1 left-1 text-[9px] font-mono px-1 py-0.5 rounded bg-black/80 text-white font-bold">
                    #{idx + 1}
                  </span>
                </div>

                {/* Timing Badge */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="font-bold text-violet-300">
                      {formatTime(item.start_time)} - {formatTime(item.end_time)}
                    </span>
                    <span>{item.duration > 0 ? `${item.duration}s` : ""}</span>
                  </div>
                  <p className="text-[10px] text-slate-300 line-clamp-2 leading-snug">
                    {item.script_text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

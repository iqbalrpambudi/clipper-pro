"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Repeat,
  Film,
  Scissors,
  RotateCcw,
  RotateCw,
  Maximize2,
  Move,
} from "lucide-react";
import { SentenceSegment, TimelineClip, SubtitleStyle } from "@/types";
import { generateAssSubtitles } from "@/lib/assGenerator";
import {
  COMPOSITION_FPS,
  calculateKenBurnsZoom,
  COLOR_GRADING_CANVAS_FILTER,
} from "@/lib/timeline/frameMath";
import { formatTimecode } from "./timelineFormat";

export function hexToRgba(hex: string, alpha: number = 1.0): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface SeekRequest {
  t: number;
  id: number;
}

interface TimelineMonitorProps {
  clips: TimelineClip[];
  audioUrl?: string | null;
  duration: number;
  segments: SentenceSegment[];
  subtitleStyle?: SubtitleStyle | null;
  aspectRatio: string;
  backgroundFill?: {
    mode?: "blur" | "black" | "cover" | "custom";
    color?: string;
    zoom?: number;
    anti_copyright?: boolean;
    dynamic_zoom?: boolean;
    color_grading?: boolean;
  };
  bgMode?: string;
  time: number;
  seekRequest: SeekRequest;
  isPlaying: boolean;
  loopRange: { start: number; end: number } | null;
  onPlayingChange: (playing: boolean) => void;
  onTimeChange: (t: number) => void;
  onSeek: (t: number) => void;
  onStep: (frames: number) => void;
  onJumpCut: (dir: -1 | 1) => void;
  onToggleLoop: () => void;
  canLoop: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSplit?: () => void;
  canSplit?: boolean;
  onUpdateSubtitlePosition?: (pos: { offset_x: number; offset_y: number }) => void;
}

export function TimelineMonitor({
  clips,
  audioUrl,
  duration,
  segments,
  subtitleStyle,
  aspectRatio,
  backgroundFill,
  bgMode = "blur",
  time,
  seekRequest,
  isPlaying,
  loopRange,
  onPlayingChange,
  onTimeChange,
  onSeek,
  onStep,
  onJumpCut,
  onToggleLoop,
  canLoop,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onSplit,
  canSplit = false,
  onUpdateSubtitlePosition,
}: TimelineMonitorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const jassubRef = useRef<any>(null);
  const thumbnailImgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const activeVideoSlot = useRef<0 | 1>(0);
  const currentClipIndexRef = useRef<number>(0);
  const lastPreloadedClipIndex = useRef<number | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [frameDimensions, setFrameDimensions] = useState({ width: 360, height: 640 });
  const [isJassubReady, setIsJassubReady] = useState(false);
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);

  const videoFrameRef = useRef<HTMLDivElement>(null);

  const currentTimeRef = useRef(time);
  currentTimeRef.current = time;

  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const cbRef = useRef({ onTimeChange, onPlayingChange });
  cbRef.current = { onTimeChange, onPlayingChange };

  // Dragging state for subtitle position
  const dragStartPos = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number }>({
    x: 0,
    y: 0,
    initialOffsetX: 0,
    initialOffsetY: 0,
  });

  // Canonical canvas resolution matching project aspect ratio
  const canvasWidth = aspectRatio === "16:9" ? 1920 : 1080;
  const canvasHeight = aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;

  // Measure actual preview container width & height for 100% pixel-perfect scaling
  useEffect(() => {
    if (!videoFrameRef.current) return;
    const updateSize = () => {
      if (videoFrameRef.current) {
        setFrameDimensions({
          width: videoFrameRef.current.clientWidth || 360,
          height: videoFrameRef.current.clientHeight || 640,
        });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(videoFrameRef.current);
    return () => ro.disconnect();
  }, []);

  // Sync dual-video sources when clips change
  useEffect(() => {
    if (clips.length === 0) return;

    const seekTime = currentTimeRef.current;
    let idx = clips.findIndex((c) => seekTime >= c.timeline_start && seekTime < c.timeline_end);
    if (idx === -1) idx = 0;
    currentClipIndexRef.current = idx;

    const curClip = clips[idx];
    const vidA = videoRefA.current;
    if (vidA) {
      if (vidA.getAttribute("src") !== curClip.video_url) {
        vidA.src = curClip.video_url || "";
      }
      const clipProg = Math.max(0, seekTime - curClip.timeline_start);
      vidA.currentTime = curClip.clip_start + clipProg * (curClip.speed || 1.0);
      vidA.playbackRate = curClip.speed || 1.0;
      vidA.muted = true;
    }

    const nextIdx = idx + 1;
    const vidB = videoRefB.current;
    if (vidB && nextIdx < clips.length) {
      const nextClip = clips[nextIdx];
      if (vidB.getAttribute("src") !== nextClip.video_url) {
        vidB.src = nextClip.video_url || "";
      }
      vidB.currentTime = nextClip.clip_start;
      vidB.playbackRate = nextClip.speed || 1.0;
      vidB.muted = true;
      lastPreloadedClipIndex.current = nextIdx;
    }

    activeVideoSlot.current = 0;
  }, [clips]);

  // Hardware-Accelerated 2D Canvas Compositor (identical to PreviewPlayer)
  const renderCanvasFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cW = canvas.width;
      const cH = canvas.height;

      const fillMode = backgroundFill?.mode || bgMode || "blur";
      const bgColor = backgroundFill?.color || "#000000";
      const userZoom = Math.max(0.5, backgroundFill?.zoom ?? 1.0);
      const antiCopyright = backgroundFill?.anti_copyright ?? true;
      const dynamicZoom = antiCopyright ? (backgroundFill?.dynamic_zoom ?? true) : false;
      const colorGrading = antiCopyright ? (backgroundFill?.color_grading ?? true) : false;

      const clipIdx = clips.findIndex((c) => timeSec >= c.timeline_start && timeSec < c.timeline_end);
      const activeIdx = clipIdx !== -1 ? clipIdx : timeSec >= duration ? Math.max(0, clips.length - 1) : 0;
      const curClip = clips[activeIdx];
      const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;

      ctx.clearRect(0, 0, cW, cH);

      const isVideoReady = Boolean(activeVid && activeVid.readyState >= 2 && activeVid.videoWidth > 0);

      // 1. Render Background
      if (fillMode === "cover") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, cW, cH);
      } else if (fillMode === "blur" && isVideoReady && activeVid) {
        ctx.save();
        ctx.filter = "blur(30px) brightness(0.70)";
        ctx.drawImage(activeVid, -25, -25, cW + 50, cH + 50);
        ctx.restore();
      } else if (fillMode === "blur" && curClip?.thumbnail_url) {
        let thumbImg = thumbnailImgCache.current.get(curClip.thumbnail_url);
        if (!thumbImg) {
          thumbImg = new Image();
          thumbImg.crossOrigin = "anonymous";
          thumbImg.src = curClip.thumbnail_url;
          thumbnailImgCache.current.set(curClip.thumbnail_url, thumbImg);
          thumbImg.onload = () => renderCanvasFrame(timeSec);
        }
        if (thumbImg.complete && thumbImg.naturalWidth > 0) {
          ctx.save();
          ctx.filter = "blur(30px) brightness(0.70)";
          ctx.drawImage(thumbImg, -25, -25, cW + 50, cH + 50);
          ctx.restore();
        } else {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, cW, cH);
        }
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, cW, cH);
      }

      // 2. Render Main Video
      if (isVideoReady && activeVid) {
        ctx.save();

        const vW = activeVid.videoWidth;
        const vH = activeVid.videoHeight;
        const videoAspect = vW / vH;
        const canvasAspect = cW / cH;

        let destW = cW;
        let destH = cH;
        let destX = 0;
        let destY = 0;

        if (fillMode === "cover") {
          if (videoAspect > canvasAspect) {
            destH = cH;
            destW = cH * videoAspect;
            destX = (cW - destW) / 2;
            destY = 0;
          } else {
            destW = cW;
            destH = cW / videoAspect;
            destX = 0;
            destY = (cH - destH) / 2;
          }
        } else {
          if (videoAspect > canvasAspect) {
            destW = cW * userZoom;
            destH = (cW / videoAspect) * userZoom;
            destX = (cW - destW) / 2;
            destY = (cH - destH) / 2;
          } else {
            destH = cH * userZoom;
            destW = (cH * videoAspect) * userZoom;
            destX = (cW - destW) / 2;
            destY = (cH - destH) / 2;
          }
        }

        if (dynamicZoom && curClip) {
          const elapsedInClip = Math.max(0, timeSec - curClip.timeline_start);
          const frameInClip = Math.floor(elapsedInClip * COMPOSITION_FPS);
          const zoom = calculateKenBurnsZoom(frameInClip, activeIdx % 2 === 0);

          ctx.translate(cW / 2, cH / 2);
          ctx.scale(zoom, zoom);
          ctx.translate(-cW / 2, -cH / 2);
        }

        if (colorGrading) {
          ctx.filter = COLOR_GRADING_CANVAS_FILTER;
        } else {
          ctx.filter = "none";
        }

        ctx.drawImage(activeVid, destX, destY, destW, destH);
        ctx.restore();
      } else if (curClip?.thumbnail_url) {
        const thumbImg = thumbnailImgCache.current.get(curClip.thumbnail_url);
        if (thumbImg && thumbImg.complete && thumbImg.naturalWidth > 0) {
          ctx.save();
          const vW = thumbImg.naturalWidth;
          const vH = thumbImg.naturalHeight;
          const videoAspect = vW / vH;
          const canvasAspect = cW / cH;

          let destW = cW;
          let destH = cH;
          let destX = 0;
          let destY = 0;

          if (fillMode === "cover") {
            if (videoAspect > canvasAspect) {
              destH = cH;
              destW = cH * videoAspect;
              destX = (cW - destW) / 2;
              destY = 0;
            } else {
              destW = cW;
              destH = cW / videoAspect;
              destX = 0;
              destY = (cH - destH) / 2;
            }
          } else {
            if (videoAspect > canvasAspect) {
              destW = cW * userZoom;
              destH = (cW / videoAspect) * userZoom;
              destX = (cW - destW) / 2;
              destY = (cH - destH) / 2;
            } else {
              destH = cH * userZoom;
              destW = (cH * videoAspect) * userZoom;
              destX = (cW - destW) / 2;
              destY = (cH - destH) / 2;
            }
          }

          if (colorGrading) {
            ctx.filter = COLOR_GRADING_CANVAS_FILTER;
          }
          ctx.drawImage(thumbImg, destX, destY, destW, destH);
          ctx.restore();
        }
      }
    },
    [clips, backgroundFill, bgMode, duration]
  );

  // Single seek execution for video decoders and compositor
  const executeSeek = useCallback(
    (t: number) => {
      const audio = audioRef.current;
      if (audio && Number.isFinite(audio.duration)) {
        if (t < audio.duration) {
          audio.currentTime = t;
          if (playingRef.current && audio.paused) audio.play().catch(() => {});
        } else if (!audio.paused) {
          audio.pause();
        }
      }

      const seekIdx = clips.findIndex((c) => t >= c.timeline_start && t < c.timeline_end);
      const idx = seekIdx !== -1 ? seekIdx : 0;
      currentClipIndexRef.current = idx;
      const seekClip = clips[idx];

      if (seekClip) {
        const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;
        const otherVid = activeVideoSlot.current === 0 ? videoRefB.current : videoRefA.current;

        const clipProgress = Math.max(0, t - seekClip.timeline_start);
        const targetTime = Math.min(
          seekClip.clip_start + clipProgress * (seekClip.speed || 1.0),
          seekClip.clip_end
        );

        if (activeVid) {
          if (activeVid.getAttribute("src") !== seekClip.video_url) {
            activeVid.src = seekClip.video_url || "";
          }
          activeVid.currentTime = targetTime;
          activeVid.playbackRate = seekClip.speed || 1.0;
          if (playingRef.current) activeVid.play().catch(() => {});
        }

        const nextIdx = idx + 1;
        if (nextIdx < clips.length && otherVid) {
          const nextClip = clips[nextIdx];
          if (otherVid.getAttribute("src") !== nextClip.video_url) {
            otherVid.src = nextClip.video_url || "";
          }
          otherVid.currentTime = nextClip.clip_start;
          otherVid.playbackRate = nextClip.speed || 1.0;
          lastPreloadedClipIndex.current = nextIdx;
        }
      }

      renderCanvasFrame(t);

      if (jassubRef.current && isJassubReady) {
        jassubRef.current.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: t,
        });
      }
    },
    [clips, canvasWidth, canvasHeight, isJassubReady, renderCanvasFrame]
  );

  // External seek requests
  useEffect(() => {
    executeSeek(seekRequest.t);
  }, [seekRequest, executeSeek]);

  // Edits while paused refresh canvas
  useEffect(() => {
    if (!isPlaying) {
      renderCanvasFrame(currentTimeRef.current);
    }
  }, [clips, isPlaying, renderCanvasFrame]);

  // High-Precision Playback Compositor Loop (Audio clock / RAF)
  useEffect(() => {
    if (!isPlaying) {
      renderCanvasFrame(currentTimeRef.current);
      if (jassubRef.current && isJassubReady) {
        jassubRef.current.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeRef.current,
        });
      }
      return;
    }

    const audio = audioRef.current;
    let t0 = currentTimeRef.current;
    if (loopRange && (t0 < loopRange.start || t0 >= loopRange.end - 0.05)) t0 = loopRange.start;
    else if (t0 >= duration - 0.05) t0 = 0;

    if (audio && audioUrl) {
      audio.currentTime = t0;
      audio.play().catch(() => {});
    }

    const activeVidInit = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;
    if (activeVidInit) activeVidInit.play().catch(() => {});

    let animId: number;
    let lastTime = performance.now();
    let clock = t0;
    let lastPub = t0;

    const compositorLoop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      let curTime =
        audio && audioUrl && !audio.paused && !audio.ended ? audio.currentTime : clock + dt;
      clock = curTime;

      if (loopRange && curTime >= loopRange.end) {
        curTime = loopRange.start;
        clock = curTime;
        if (audio && audioUrl) audio.currentTime = curTime;
        executeSeek(curTime);
      } else if (curTime >= duration) {
        audio?.pause();
        videoRefA.current?.pause();
        videoRefB.current?.pause();
        cbRef.current.onTimeChange(duration);
        cbRef.current.onPlayingChange(false);
        renderCanvasFrame(duration);
        return;
      }

      if (Math.abs(curTime - lastPub) >= 1 / 30) {
        lastPub = curTime;
        cbRef.current.onTimeChange(curTime);
      }

      // Clip boundary ping-pong switch
      const newIdx = clips.findIndex(
        (c) => curTime >= c.timeline_start && curTime < c.timeline_end
      );
      const validIdx = newIdx !== -1 ? newIdx : curTime >= duration ? Math.max(0, clips.length - 1) : 0;

      if (validIdx !== currentClipIndexRef.current && validIdx < clips.length) {
        const nextSlot = (activeVideoSlot.current === 0 ? 1 : 0) as 0 | 1;
        const newActiveVid = nextSlot === 0 ? videoRefA.current : videoRefB.current;
        const oldActiveVid = nextSlot === 0 ? videoRefB.current : videoRefA.current;

        const targetClip = clips[validIdx];
        if (newActiveVid && targetClip) {
          const clipProg = Math.max(0, curTime - targetClip.timeline_start);
          const targetVideoTime = targetClip.clip_start + clipProg * (targetClip.speed || 1.0);

          if (Math.abs(newActiveVid.currentTime - targetVideoTime) > 0.1) {
            newActiveVid.currentTime = targetVideoTime;
          }
          newActiveVid.playbackRate = targetClip.speed || 1.0;
          newActiveVid.muted = true;
          newActiveVid.play().catch(() => {});
        }

        if (oldActiveVid) oldActiveVid.pause();

        activeVideoSlot.current = nextSlot;
        currentClipIndexRef.current = validIdx;

        const preloadIdx = validIdx + 1;
        if (preloadIdx < clips.length && oldActiveVid) {
          const preloadClip = clips[preloadIdx];
          if (oldActiveVid.getAttribute("src") !== preloadClip.video_url) {
            oldActiveVid.src = preloadClip.video_url || "";
          }
          oldActiveVid.currentTime = preloadClip.clip_start;
          oldActiveVid.playbackRate = preloadClip.speed || 1.0;
          oldActiveVid.muted = true;
          lastPreloadedClipIndex.current = preloadIdx;
        }
      } else {
        const curClip = clips[validIdx];
        if (curClip) {
          const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;
          if (activeVid) {
            const targetSpeed = curClip.speed || 1.0;
            if (Math.abs(activeVid.playbackRate - targetSpeed) > 0.01) {
              activeVid.playbackRate = targetSpeed;
            }
            const expectedVidTime =
              curClip.clip_start + Math.max(0, curTime - curClip.timeline_start) * targetSpeed;
            if (Math.abs(activeVid.currentTime - expectedVidTime) > 0.15) {
              activeVid.currentTime = expectedVidTime;
            }
            if (activeVid.paused) {
              activeVid.play().catch(() => {});
            }
          }
        }
      }

      renderCanvasFrame(curTime);

      if (jassubRef.current && isJassubReady) {
        jassubRef.current.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: curTime,
        });
      }

      animId = requestAnimationFrame(compositorLoop);
    };

    animId = requestAnimationFrame(compositorLoop);

    return () => {
      cancelAnimationFrame(animId);
      audio?.pause();
      videoRefA.current?.pause();
      videoRefB.current?.pause();
    };
  }, [
    isPlaying,
    clips,
    duration,
    audioUrl,
    loopRange,
    isJassubReady,
    canvasWidth,
    canvasHeight,
    executeSeek,
    renderCanvasFrame,
  ]);

  // JASSUB (libass) initialization for 100% exact ASS subtitle rendering identical to render tab
  useEffect(() => {
    let mounted = true;
    let canvasEl: HTMLCanvasElement | null = null;
    let jassubInstance: any = null;

    async function initJassub() {
      if (!canvasContainerRef.current) return;

      try {
        const JASSUBModule = await import("jassub");
        const JASSUB = JASSUBModule.default || JASSUBModule;

        if (!mounted || !canvasContainerRef.current) return;

        canvasContainerRef.current.innerHTML = "";
        canvasEl = document.createElement("canvas");
        canvasEl.width = canvasWidth;
        canvasEl.height = canvasHeight;
        canvasEl.style.width = "100%";
        canvasEl.style.height = "100%";
        canvasEl.style.position = "absolute";
        canvasEl.style.inset = "0";
        canvasEl.style.pointerEvents = "none";
        canvasContainerRef.current.appendChild(canvasEl);

        const initialAss = generateAssSubtitles(
          segments,
          subtitleStyle || {},
          canvasWidth,
          canvasHeight
        );

        const baseUrl = window.location.origin;

        jassubInstance = new JASSUB({
          canvas: canvasEl,
          subContent: initialAss,
          workerUrl: `${baseUrl}/jassub/jassub-worker.js`,
          wasmUrl: `${baseUrl}/jassub/jassub-worker.wasm`,
          modernWasmUrl: `${baseUrl}/jassub/jassub-worker-modern.wasm`,
          availableFonts: {
            "liberation sans": `${baseUrl}/jassub/default.woff2`,
          },
          fonts: [
            `${baseUrl}/fonts/Montserrat.ttf`,
            `${baseUrl}/fonts/BebasNeue.ttf`,
            `${baseUrl}/fonts/Poppins.ttf`,
            `${baseUrl}/fonts/Inter.ttf`,
            `${baseUrl}/fonts/Anton.ttf`,
            `${baseUrl}/fonts/Oswald.ttf`,
            `${baseUrl}/fonts/Roboto.ttf`,
          ],
          debug: false,
        });

        await jassubInstance.ready;

        if (!mounted) {
          try {
            jassubInstance.destroy();
          } catch {}
          return;
        }

        jassubRef.current = jassubInstance;
        setIsJassubReady(true);

        jassubInstance.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeRef.current,
        });
      } catch (err: any) {
        console.error("[Timeline JASSUB] initialization failed:", err);
        setIsJassubReady(false);
      }
    }

    initJassub();

    return () => {
      mounted = false;
      setIsJassubReady(false);
      if (jassubRef.current) {
        try {
          jassubRef.current.destroy();
        } catch {}
        jassubRef.current = null;
      }
      if (canvasEl) canvasEl.remove();
    };
  }, [canvasWidth, canvasHeight, segments, subtitleStyle]);

  // Update JASSUB track live when subtitleStyle or segments change
  useEffect(() => {
    if (!jassubRef.current || !isJassubReady) return;
    try {
      const newAss = generateAssSubtitles(
        segments,
        subtitleStyle || {},
        canvasWidth,
        canvasHeight
      );
      if (jassubRef.current.renderer?.setTrack) {
        jassubRef.current.renderer.setTrack(newAss);
      }
      jassubRef.current.manualRender(
        {
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeRef.current,
        },
        true
      );
    } catch (err) {
      console.error("Failed to update JASSUB track in timeline:", err);
    }
  }, [subtitleStyle, segments, isJassubReady, canvasWidth, canvasHeight]);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  // Fallback CSS Subtitle Calculations
  const scale = frameDimensions.width / canvasWidth;
  const scaleY = frameDimensions.height / canvasHeight;

  const fontBaseSize = subtitleStyle?.font_size || 56;
  const scaledFontSize = Math.max(6, Number((fontBaseSize * scale).toFixed(2)));
  const scaledOutlineWidth = Math.max(0.5, Number(((subtitleStyle?.outline_width ?? 4) * scale).toFixed(2)));
  const scaledOffsetY = Math.round((subtitleStyle?.offset_y || 0) * scaleY);
  const scaledOffsetX = Math.round((subtitleStyle?.offset_x || 0) * scale);
  const boxOpacity = subtitleStyle?.box_opacity ?? 0.0;
  const isScaleAnim = subtitleStyle?.highlight_animation !== "color" && subtitleStyle?.highlight_animation !== "none";
  const zoomScale = isScaleAnim ? (subtitleStyle?.scale_factor ?? 1.15) : 1.0;

  const curMs = time * 1000;
  const activeSegment = segments.find((s) => curMs >= s.start_ms && curMs <= s.end_ms + 250);
  const segWords = activeSegment?.words || [];
  let activeWordIndex = -1;
  if (segWords.length > 0) {
    activeWordIndex = segWords.findIndex((w) => curMs >= w.start_ms && curMs <= w.end_ms + 200);
  }

  const burstCount = Math.max(2, subtitleStyle?.burst_word_count || 2);
  let activeBurstGroup: { word: string; start_ms: number; end_ms: number; isActive: boolean }[] = [];
  if (subtitleStyle?.display_mode === "burst" && segWords.length > 0) {
    for (let i = 0; i < segWords.length; i += burstCount) {
      const group = segWords.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      if (curMs >= gStart && curMs <= gEnd + 250) {
        activeBurstGroup = group.map((item, localIdx) => ({
          ...item,
          isActive: i + localIdx === activeWordIndex,
        }));
        break;
      }
    }
  }

  // Pointer drag for subtitle positioning
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onUpdateSubtitlePosition) return;
    setIsDraggingSubtitle(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: subtitleStyle?.offset_x || 0,
      initialOffsetY: subtitleStyle?.offset_y || 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle || !onUpdateSubtitlePosition) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    const newAssDeltaX = Math.round(deltaX / scale);
    const newAssDeltaY = Math.round(deltaY / scaleY);
    onUpdateSubtitlePosition({
      offset_x: dragStartPos.current.initialOffsetX + newAssDeltaX,
      offset_y: dragStartPos.current.initialOffsetY + newAssDeltaY,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle) return;
    setIsDraggingSubtitle(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const ratio = aspectRatio === "16:9" ? "16 / 9" : aspectRatio === "1:1" ? "1 / 1" : "9 / 16";
  const activeClipIdx = clips.findIndex((c) => time >= c.timeline_start && time < c.timeline_end);
  const activeClip = activeClipIdx !== -1 ? clips[activeClipIdx] : null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full rounded-xl border border-[#2E2E2E] bg-[#121212] overflow-hidden shadow-sm"
    >
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" muted={isMuted} />}

      {/* Hidden Dual-Video Decoder Pipeline */}
      <video
        ref={videoRefA}
        playsInline
        muted
        preload="auto"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: "1px", height: "1px", zIndex: -100 }}
      />
      <video
        ref={videoRefB}
        playsInline
        muted
        preload="auto"
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: "1px", height: "1px", zIndex: -100 }}
      />

      {/* Video display canvas container */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center p-2 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06),transparent_70%)] overflow-hidden">
        <div
          ref={videoFrameRef}
          className="relative bg-black rounded-xl overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/10 max-h-full max-w-full flex items-center justify-center"
          style={{
            aspectRatio: ratio,
            height: "100%",
            maxHeight: "100%",
          }}
        >
          {/* Main 2D Canvas Compositor */}
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="w-full h-full object-contain pointer-events-none"
          />

          {/* JASSUB WebAssembly Canvas Overlay */}
          <div
            ref={canvasContainerRef}
            className="absolute inset-0 pointer-events-none"
            style={{ width: "100%", height: "100%" }}
          />

          {/* Fallback CSS Subtitle Overlay (if WASM not yet ready) */}
          {!isJassubReady && activeSegment && (
            <div
              className="absolute left-0 right-0 z-20 px-4 flex justify-center text-center select-none pointer-events-none"
              style={{
                top: subtitleStyle?.position === "top" ? "9.375%" : subtitleStyle?.position === "center" ? "50%" : undefined,
                bottom: subtitleStyle?.position === "bottom" || !subtitleStyle?.position ? "11.45%" : undefined,
                transform: `translate(${scaledOffsetX}px, ${
                  subtitleStyle?.position === "center"
                    ? `calc(-50% + ${scaledOffsetY}px)`
                    : subtitleStyle?.position === "bottom"
                    ? `${-scaledOffsetY}px`
                    : `${scaledOffsetY}px`
                })`,
              }}
            >
              {subtitleStyle?.display_mode === "burst" && activeBurstGroup.length > 0 ? (
                <div
                  style={{
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                    fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                    color: subtitleStyle?.primary_color || "#FFFFFF",
                    WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                    textShadow: `0 2px 4px rgba(0,0,0,0.8)`,
                    backgroundColor: boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                    padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                    borderRadius: "4px",
                  }}
                  className="flex items-center justify-center gap-1.5 uppercase tracking-wide"
                >
                  {activeBurstGroup.map((w, idx) => (
                    <span
                      key={idx}
                      style={{
                        color: w.isActive ? subtitleStyle?.highlight_color || "#FFE600" : subtitleStyle?.primary_color || "#FFFFFF",
                        transform: w.isActive && isScaleAnim ? `scale(${zoomScale})` : "none",
                        transition: "all 0.08s ease-out",
                        display: "inline-block",
                      }}
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              ) : subtitleStyle?.display_mode === "per_word" && activeWordIndex !== -1 && segWords[activeWordIndex] ? (
                <div
                  style={{
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                    fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                    color: subtitleStyle?.highlight_color || "#FFE600",
                    WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                    textShadow: `0 2px 4px rgba(0,0,0,0.8)`,
                    transform: isScaleAnim ? `scale(${zoomScale})` : "none",
                    backgroundColor: boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                    padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                    borderRadius: "4px",
                    display: "inline-block",
                  }}
                  className="uppercase tracking-wide"
                >
                  {segWords[activeWordIndex].word}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: `${scaledFontSize}px`,
                    fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                    fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                    color: subtitleStyle?.primary_color || "#FFFFFF",
                    WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                    textShadow: `0 2px 4px rgba(0,0,0,0.8)`,
                    backgroundColor: boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                    padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                    borderRadius: "4px",
                  }}
                  className="inline-block uppercase tracking-wide leading-snug"
                >
                  {segWords.length
                    ? segWords.map((w, i) => {
                        const isActive = i === activeWordIndex;
                        return (
                          <span
                            key={i}
                            style={{
                              color: isActive ? subtitleStyle?.highlight_color || "#FFE600" : subtitleStyle?.primary_color || "#FFFFFF",
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

          {/* Interactive Drag Handle for Subtitle Positioning */}
          {onUpdateSubtitlePosition && (
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="absolute left-4 right-4 z-30 flex justify-center text-center select-none cursor-move group"
              style={{
                top: subtitleStyle?.position === "top" ? "9.375%" : subtitleStyle?.position === "center" ? "50%" : undefined,
                bottom: subtitleStyle?.position === "bottom" || !subtitleStyle?.position ? "11.45%" : undefined,
                transform: `translate(${scaledOffsetX}px, ${
                  subtitleStyle?.position === "center"
                    ? `calc(-50% + ${scaledOffsetY}px)`
                    : subtitleStyle?.position === "bottom"
                    ? `${-scaledOffsetY}px`
                    : `${scaledOffsetY}px`
                })`,
              }}
            >
              <div className="w-full max-w-[260px] h-12 rounded-xl border border-dashed border-transparent group-hover:border-brand-400/60 transition-all flex items-center justify-center pointer-events-auto">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-[10px] text-brand-300 px-2 py-0.5 rounded font-mono flex items-center gap-1 shadow-lg pointer-events-none">
                  <Move className="w-2.5 h-2.5" />
                  <span>Geser Posisi Subtitle</span>
                </div>
              </div>
            </div>
          )}

          {/* Empty timeline state */}
          {clips.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs text-center px-4">
              <Film className="w-8 h-8 opacity-40 text-slate-400" />
              <span>Timeline kosong — seret scene dari Media Pool</span>
            </div>
          )}

          {activeClip && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white font-mono pointer-events-none shadow z-30">
              #{activeClipIdx + 1}
              {activeClip.speed && Math.abs(activeClip.speed - 1) > 0.02 ? ` • ${activeClip.speed}x` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Scrubber line */}
      <div className="px-3 pt-1">
        <input
          type="range"
          min={0}
          max={Math.max(0.1, duration)}
          step={1 / 30}
          value={Math.min(time, duration)}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full h-1 bg-[#1E1E1E] accent-primary cursor-pointer"
          aria-label="Posisi playhead"
        />
      </div>

      {/* Integrated NLE Transport Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-[#2E2E2E] bg-[#181818] flex-wrap">
        {/* Left actions: Undo, Redo, Cut/Split */}
        <div className="flex items-center gap-1">
          {onUndo && (
            <TransportBtn title="Undo (Ctrl/Cmd + Z)" onClick={onUndo} disabled={!canUndo}>
              <RotateCcw className="w-3.5 h-3.5" />
            </TransportBtn>
          )}
          {onRedo && (
            <TransportBtn title="Redo (Ctrl/Cmd + Shift + Z)" onClick={onRedo} disabled={!canRedo}>
              <RotateCw className="w-3.5 h-3.5" />
            </TransportBtn>
          )}
          {onSplit && (
            <button
              type="button"
              onClick={onSplit}
              disabled={!canSplit}
              title="Potong klip di playhead (S)"
              className="h-7 px-2 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] border border-[#2E2E2E] hover:border-primary/50 text-foreground text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Scissors className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Potong (S)</span>
            </button>
          )}
        </div>

        {/* Center: Playhead transport controls & Timecode */}
        <div className="flex items-center gap-1.5">
          {activeClip?.speed && Math.abs(activeClip.speed - 1) > 0.02 && (
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 text-[10px] font-mono font-bold hidden sm:inline">
              {activeClip.speed}x
            </span>
          )}

          <TransportBtn title="Cut sebelumnya (↑)" onClick={() => onJumpCut(-1)}>
            <SkipBack className="w-3.5 h-3.5" />
          </TransportBtn>
          <TransportBtn title="Mundur 1 frame (←)" onClick={() => onStep(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </TransportBtn>

          <button
            type="button"
            onClick={() => onPlayingChange(!isPlaying)}
            disabled={clips.length === 0}
            className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-black flex items-center justify-center shadow-xs transition active:scale-95 mx-0.5 font-semibold"
            title={isPlaying ? "Jeda (Spasi)" : "Putar (Spasi)"}
            id="timeline-monitor-play"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
          </button>

          <TransportBtn title="Maju 1 frame (→)" onClick={() => onStep(1)}>
            <ChevronRight className="w-4 h-4" />
          </TransportBtn>
          <TransportBtn title="Cut berikutnya (↓)" onClick={() => onJumpCut(1)}>
            <SkipForward className="w-3.5 h-3.5" />
          </TransportBtn>

          <div className="font-mono text-[11px] text-foreground tabular-nums ml-2 hidden sm:inline">
            <span className="text-primary font-bold">{formatTimecode(time)}</span>
            <span className="text-muted-foreground"> / {formatTimecode(duration)}</span>
          </div>
        </div>

        {/* Right actions: Loop, Mute, Aspect ratio badge, Fullscreen */}
        <div className="flex items-center gap-1">
          <TransportBtn
            title="Loop klip terpilih (L)"
            onClick={onToggleLoop}
            active={Boolean(loopRange)}
            disabled={!canLoop && !loopRange}
          >
            <Repeat className="w-3.5 h-3.5" />
          </TransportBtn>

          <TransportBtn
            title={isMuted ? "Unmute audio narasi" : "Mute audio narasi"}
            onClick={() => setIsMuted((m) => !m)}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-destructive" /> : <Volume2 className="w-3.5 h-3.5" />}
          </TransportBtn>

          <span className="px-2 py-0.5 rounded-lg bg-[#141414] border border-[#2E2E2E] text-[10px] font-mono text-muted-foreground font-semibold hidden md:inline">
            {aspectRatio}
          </span>

          <TransportBtn title="Layar Penuh" onClick={handleToggleFullscreen}>
            <Maximize2 className="w-3.5 h-3.5" />
          </TransportBtn>
        </div>
      </div>
    </div>
  );
}

function TransportBtn({
  children,
  title,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 rounded-lg flex items-center justify-center transition disabled:opacity-25 disabled:cursor-not-allowed ${
        active
          ? "bg-primary text-black font-semibold shadow-xs"
          : "text-muted-foreground hover:text-foreground hover:bg-[#1E1E1E]"
      }`}
    >
      {children}
    </button>
  );
}
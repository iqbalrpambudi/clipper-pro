"use client";

import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Film } from "lucide-react";
import {
  SentenceSegment,
  TimelineClip,
  SubtitleStyle,
  WatermarkConfig,
  JassubInstance,
  BackgroundFill,
} from "@/types";
import { WatermarkOverlay } from "../watermark/WatermarkOverlay";
import { generateAssSubtitles } from "@/lib/assGenerator";
import {
  COMPOSITION_FPS,
  calculateKenBurnsZoom,
  COLOR_GRADING_CANVAS_FILTER,
} from "@/lib/timeline/frameMath";
import { MonitorTransportToolbar } from "./monitor/MonitorTransportToolbar";
import { FallbackSubtitleOverlay } from "./monitor/FallbackSubtitleOverlay";

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
  backgroundFill?: Partial<BackgroundFill> | null;
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
  watermark?: WatermarkConfig | null;
  onUpdateSubtitlePosition?: (pos: { offset_x: number; offset_y: number }) => void;
}

export function TimelineMonitor({
  clips,
  audioUrl,
  duration,
  segments,
  subtitleStyle,
  watermark,
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
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const jassubRef = useRef<JassubInstance | null>(null);
  const thumbnailImgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const activeVideoSlot = useRef<0 | 1>(0);
  const currentClipIndexRef = useRef<number>(0);
  const lastPreloadedClipIndex = useRef<number | null>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [frameDimensions, setFrameDimensions] = useState({ width: 360, height: 640 });
  const [isJassubReady, setIsJassubReady] = useState(false);

  const videoFrameRef = useRef<HTMLDivElement>(null);

  const currentTimeRef = useRef(time);
  currentTimeRef.current = time;

  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const cbRef = useRef({ onTimeChange, onPlayingChange });
  cbRef.current = { onTimeChange, onPlayingChange };

  // Preview resolution quality (default 540p for ultra-smooth 60fps playback)
  const [previewQuality, setPreviewQuality] = useState<"540p" | "720p" | "1080p">("540p");

  const { canvasWidth, canvasHeight } = useMemo(() => {
    if (previewQuality === "1080p") {
      return {
        canvasWidth: aspectRatio === "16:9" ? 1920 : 1080,
        canvasHeight: aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920,
      };
    }
    if (previewQuality === "720p") {
      return {
        canvasWidth: aspectRatio === "16:9" ? 1280 : 720,
        canvasHeight: aspectRatio === "16:9" ? 720 : aspectRatio === "1:1" ? 720 : 1280,
      };
    }
    return {
      canvasWidth: aspectRatio === "16:9" ? 960 : 540,
      canvasHeight: aspectRatio === "16:9" ? 540 : aspectRatio === "1:1" ? 540 : 960,
    };
  }, [previewQuality, aspectRatio]);

  // Measure actual preview container width & height
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

  // Hardware-Accelerated 2D Canvas Compositor
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

      const clipIdx = clips.findIndex(
        (c) => timeSec >= c.timeline_start && timeSec < c.timeline_end
      );
      const activeIdx =
        clipIdx !== -1 ? clipIdx : timeSec >= duration ? Math.max(0, clips.length - 1) : 0;
      const curClip = clips[activeIdx];
      const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;

      const isVideoReady = Boolean(
        activeVid && activeVid.videoWidth > 0 && activeVid.readyState >= 1
      );

      let thumbImg: HTMLImageElement | undefined = undefined;
      if (curClip?.thumbnail_url) {
        thumbImg = thumbnailImgCache.current.get(curClip.thumbnail_url);
        if (!thumbImg) {
          thumbImg = new Image();
          thumbImg.crossOrigin = "anonymous";
          thumbImg.src = curClip.thumbnail_url;
          thumbnailImgCache.current.set(curClip.thumbnail_url, thumbImg);
          thumbImg.onload = () => {
            renderCanvasFrame(currentTimeRef.current);
          };
        }
      }

      // 1. Render Background
      if (fillMode === "cover") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, cW, cH);
      } else if (fillMode === "blur" && isVideoReady && activeVid) {
        if (!blurCanvasRef.current) {
          blurCanvasRef.current = document.createElement("canvas");
        }
        const bCanvas = blurCanvasRef.current;
        const bW = Math.max(160, Math.round(cW / 3));
        const bH = Math.max(160, Math.round(cH / 3));
        if (bCanvas.width !== bW || bCanvas.height !== bH) {
          bCanvas.width = bW;
          bCanvas.height = bH;
        }
        const bCtx = bCanvas.getContext("2d");
        if (bCtx) {
          bCtx.drawImage(activeVid, 0, 0, bW, bH);
        }
        ctx.save();
        ctx.filter = "blur(12px) brightness(0.70)";
        ctx.drawImage(bCanvas, -25, -25, cW + 50, cH + 50);
        ctx.restore();
      } else if (
        fillMode === "blur" &&
        thumbImg &&
        thumbImg.complete &&
        thumbImg.naturalWidth > 0
      ) {
        ctx.save();
        ctx.filter = "blur(30px) brightness(0.70)";
        ctx.drawImage(thumbImg, -25, -25, cW + 50, cH + 50);
        ctx.restore();
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
            destW = cH * videoAspect * userZoom;
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
      } else if (thumbImg && thumbImg.complete && thumbImg.naturalWidth > 0) {
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
            destW = cH * videoAspect * userZoom;
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
        ctx.drawImage(thumbImg, destX, destY, destW, destH);
        ctx.restore();
      }
    },
    [clips, backgroundFill, bgMode, duration]
  );

  // Eagerly preload thumbnails for all timeline clips
  useEffect(() => {
    clips.forEach((c) => {
      if (c.thumbnail_url && !thumbnailImgCache.current.has(c.thumbnail_url)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = c.thumbnail_url;
        img.onload = () => {
          if (!playingRef.current) {
            renderCanvasFrame(currentTimeRef.current);
          }
        };
        thumbnailImgCache.current.set(c.thumbnail_url, img);
      }
    });
  }, [clips, renderCanvasFrame]);

  // Single seek execution for video decoders and compositor
  const executeSeek = useCallback(
    (t: number) => {
      currentTimeRef.current = t;

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
        const currentSlot = activeVideoSlot.current;
        let activeVid = currentSlot === 0 ? videoRefA.current : videoRefB.current;
        let otherVid = currentSlot === 0 ? videoRefB.current : videoRefA.current;

        const seekUrl = seekClip.video_url || "";
        const isOtherReady = Boolean(
          otherVid &&
          seekUrl &&
          (otherVid.getAttribute("src") === seekUrl || otherVid.src === seekUrl) &&
          otherVid.videoWidth > 0
        );
        const isActiveCur = Boolean(
          activeVid &&
          seekUrl &&
          (activeVid.getAttribute("src") === seekUrl || activeVid.src === seekUrl)
        );

        if (isOtherReady && !isActiveCur) {
          activeVideoSlot.current = currentSlot === 0 ? 1 : 0;
          activeVid = otherVid;
          otherVid = currentSlot === 0 ? videoRefA.current : videoRefB.current;
        }

        const clipProgress = Math.max(0, t - seekClip.timeline_start);
        const targetTime = Math.min(
          seekClip.clip_start + clipProgress * (seekClip.speed || 1.0),
          seekClip.clip_end
        );

        if (activeVid) {
          const curSrc = activeVid.getAttribute("src") || activeVid.src;
          if (curSrc !== seekClip.video_url && seekClip.video_url) {
            activeVid.src = seekClip.video_url;
          }
          if (Math.abs(activeVid.currentTime - targetTime) > 0.001) {
            activeVid.currentTime = targetTime;
          }
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

  // Listen for video decoder seeked/loadeddata
  useEffect(() => {
    const handleFrameReady = (slot: 0 | 1) => () => {
      if (!playingRef.current && activeVideoSlot.current === slot) {
        renderCanvasFrame(currentTimeRef.current);
        if (jassubRef.current && isJassubReady) {
          jassubRef.current.manualRender({
            expectedDisplayTime: performance.now(),
            width: canvasWidth,
            height: canvasHeight,
            mediaTime: currentTimeRef.current,
          });
        }
      }
    };

    const vidA = videoRefA.current;
    const vidB = videoRefB.current;

    const onSeekedA = handleFrameReady(0);
    const onLoadedA = handleFrameReady(0);
    const onSeekedB = handleFrameReady(1);
    const onLoadedB = handleFrameReady(1);

    vidA?.addEventListener("seeked", onSeekedA);
    vidA?.addEventListener("loadeddata", onLoadedA);
    vidB?.addEventListener("seeked", onSeekedB);
    vidB?.addEventListener("loadeddata", onLoadedB);

    return () => {
      vidA?.removeEventListener("seeked", onSeekedA);
      vidA?.removeEventListener("loadeddata", onLoadedA);
      vidB?.removeEventListener("seeked", onSeekedB);
      vidB?.removeEventListener("loadeddata", onLoadedB);
    };
  }, [renderCanvasFrame, isJassubReady, canvasWidth, canvasHeight]);

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
    let lastAudioTime = t0;
    let lastAudioSyncTime = performance.now();

    const compositorLoop = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      let curTime: number;
      if (audio && audioUrl && !audio.paused && !audio.ended) {
        const aTime = audio.currentTime;
        if (aTime !== lastAudioTime) {
          lastAudioTime = aTime;
          lastAudioSyncTime = now;
          curTime = aTime;
        } else {
          const audioDt = (now - lastAudioSyncTime) / 1000;
          curTime = Math.min(duration, lastAudioTime + audioDt);
        }
      } else {
        clock += dt;
        curTime = clock;
      }
      currentTimeRef.current = curTime;

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
      const validIdx =
        newIdx !== -1 ? newIdx : curTime >= duration ? Math.max(0, clips.length - 1) : 0;

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
            if (Math.abs(activeVid.currentTime - expectedVidTime) > 0.25) {
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
      cbRef.current.onTimeChange(currentTimeRef.current);
      renderCanvasFrame(currentTimeRef.current);
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

  // JASSUB initialization
  useEffect(() => {
    let mounted = true;
    let canvasEl: HTMLCanvasElement | null = null;

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

        const refResX = aspectRatio === "16:9" ? 1920 : 1080;
        const refResY = aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
        const initialAss = generateAssSubtitles(segments, subtitleStyle || {}, refResX, refResY);

        const baseUrl = window.location.origin;

        const instance = new JASSUB({
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

        await instance.ready;

        if (!mounted) {
          try {
            instance.destroy();
          } catch {}
          return;
        }

        jassubRef.current = instance;
        setIsJassubReady(true);

        instance.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeRef.current,
        });
      } catch (err: unknown) {
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
  }, [canvasWidth, canvasHeight, segments, subtitleStyle, aspectRatio]);

  // Update JASSUB track live when subtitleStyle or segments change
  useEffect(() => {
    if (!jassubRef.current || !isJassubReady) return;
    try {
      const refResX = aspectRatio === "16:9" ? 1920 : 1080;
      const refResY = aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
      const newAss =
        subtitleStyle?.enabled !== false
          ? generateAssSubtitles(segments, subtitleStyle || {}, refResX, refResY)
          : "";
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
  }, [subtitleStyle, segments, isJassubReady, canvasWidth, canvasHeight, aspectRatio]);

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  };

  const ratio = aspectRatio === "16:9" ? "16 / 9" : aspectRatio === "1:1" ? "1 / 1" : "9 / 16";
  const activeClipIdx = clips.findIndex((c) => time >= c.timeline_start && time < c.timeline_end);
  const activeClip = activeClipIdx !== -1 ? clips[activeClipIdx] : null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full rounded-xl border border-border bg-background overflow-hidden shadow-sm"
    >
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" muted={isMuted} />}

      {/* Hidden Dual-Video Decoder Pipeline */}
      <video
        ref={videoRefA}
        playsInline
        muted
        preload="auto"
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: "1px",
          height: "1px",
          zIndex: -100,
        }}
      />
      <video
        ref={videoRefB}
        playsInline
        muted
        preload="auto"
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: "1px",
          height: "1px",
          zIndex: -100,
        }}
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

          {/* Watermark Video Text Overlay */}
          <WatermarkOverlay
            watermark={watermark}
            containerWidth={frameDimensions.width}
            containerHeight={frameDimensions.height}
          />

          {/* Fallback CSS Subtitle Overlay */}
          <FallbackSubtitleOverlay
            isJassubReady={isJassubReady}
            subtitleStyle={subtitleStyle}
            segments={segments}
            time={time}
            frameDimensions={frameDimensions}
            aspectRatio={aspectRatio}
            onUpdateSubtitlePosition={onUpdateSubtitlePosition}
          />

          {/* Empty timeline state */}
          {clips.length === 0 && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/70">
              <Film className="h-8 w-8 text-white/60" />
              <span>Timeline kosong — seret scene dari Media Pool</span>
            </div>
          )}

          {activeClip && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none z-30">
              <span className="px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white font-mono shadow backdrop-blur-xs border border-white/10">
                #{activeClipIdx + 1}
                {activeClip.speed && Math.abs(activeClip.speed - 1) > 0.02
                  ? ` • ${activeClip.speed}x`
                  : ""}
              </span>
              {!isPlaying && (
                <span className="px-1.5 py-0.5 rounded bg-black/80 text-primary border border-primary/30 text-[10px] font-mono font-bold shadow backdrop-blur-xs">
                  F{Math.round(Math.max(0, time - activeClip.timeline_start) * 30)}/
                  {Math.round((activeClip.timeline_end - activeClip.timeline_start) * 30)}
                </span>
              )}
            </div>
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
          className="w-full h-1 bg-surface accent-primary cursor-pointer"
          aria-label="Posisi playhead"
        />
      </div>

      {/* Integrated NLE Transport Toolbar */}
      <MonitorTransportToolbar
        time={time}
        duration={duration}
        isPlaying={isPlaying}
        isMuted={isMuted}
        clips={clips}
        activeClip={activeClip}
        loopRange={loopRange}
        canLoop={canLoop}
        canUndo={canUndo}
        canRedo={canRedo}
        canSplit={canSplit}
        aspectRatio={aspectRatio}
        previewQuality={previewQuality}
        onPlayingChange={onPlayingChange}
        onStep={onStep}
        onJumpCut={onJumpCut}
        onToggleLoop={onToggleLoop}
        onToggleMute={() => setIsMuted((m) => !m)}
        onToggleFullscreen={handleToggleFullscreen}
        onCyclePreviewQuality={() =>
          setPreviewQuality((prev) =>
            prev === "540p" ? "720p" : prev === "720p" ? "1080p" : "540p"
          )
        }
        onUndo={onUndo}
        onRedo={onRedo}
        onSplit={onSplit}
      />
    </div>
  );
}

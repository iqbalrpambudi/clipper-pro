"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Move } from "lucide-react";
import { Project, TimelineClip, Narration, AudioTrack, SubtitleStyle } from "@/types";
import { generateAssSubtitles } from "@/lib/assGenerator";
import {
  COMPOSITION_FPS,
  calculateKenBurnsZoom,
  COLOR_GRADING_CANVAS_FILTER,
  snapToFrame,
} from "@/lib/timeline/frameMath";



export function hexToRgba(hex: string, alpha: number = 1.0): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PreviewPlayerProps {
  project: Project & {
    timeline?: { clips: TimelineClip[]; total_duration: number } | null;
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
  };
  onUpdateSubtitlePosition?: (pos: { offset_x: number; offset_y: number }) => void;
}

export function PreviewPlayer({ project, onUpdateSubtitlePosition }: PreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbnailImgCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const activeVideoSlot = useRef<0 | 1>(0);
  const [, setActiveSlotState] = useState<0 | 1>(0);
  const currentClipIndexRef = useRef<number>(0);
  const lastPreloadedClipIndex = useRef<number | null>(null);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const jassubRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(project.timeline?.total_duration || 30);
  const [isMuted, setIsMuted] = useState(false);
  const [frameWidth, setFrameWidth] = useState(320);
  const [isJassubReady, setIsJassubReady] = useState(false);
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);

  // Dragging state for subtitle position
  const dragStartPos = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number }>({
    x: 0,
    y: 0,
    initialOffsetX: 0,
    initialOffsetY: 0,
  });

  const clips = project.timeline?.clips || [];
  const subtitleStyle = project.subtitle_style;
  const segments = project.narration?.segments || [];

  // Canonical canvas resolution matching project aspect ratio
  const canvasWidth = project.aspect_ratio === "16:9" ? 1920 : 1080;
  const canvasHeight = project.aspect_ratio === "16:9" ? 1080 : project.aspect_ratio === "1:1" ? 1080 : 1920;

  // Measure actual preview container width for 100% pixel-perfect scaling
  useEffect(() => {
    if (!frameRef.current) return;
    const updateSize = () => {
      if (frameRef.current) {
        setFrameWidth(frameRef.current.clientWidth || 320);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, []);

  // Find active clip at current time
  const activeClipIndex = clips.findIndex(
    (c) => currentTimeSec >= c.timeline_start && currentTimeSec < c.timeline_end
  );
  const currentIdx = activeClipIndex !== -1 ? activeClipIndex : 0;
  const activeClip = clips[currentIdx] || clips[0];

  // Active Segment & Active Word Calculation (with micro-pause buffer)
  const curMs = currentTimeSec * 1000;
  const activeSegmentIndex = segments.findIndex((s, idx) => {
    const nextSeg = segments[idx + 1];
    const maxEnd = nextSeg ? Math.min(s.end_ms + 250, nextSeg.start_ms) : s.end_ms + 350;
    return curMs >= s.start_ms && curMs <= maxEnd;
  });
  const activeSegment = activeSegmentIndex !== -1 ? segments[activeSegmentIndex] : null;

  const segWords = activeSegment?.words || [];
  let activeWordIndex = -1;

  if (segWords.length > 0) {
    activeWordIndex = segWords.findIndex((w, idx) => {
      const nextW = segWords[idx + 1];
      const maxWEnd = nextW ? Math.min(w.end_ms + 200, nextW.start_ms) : w.end_ms + 250;
      return curMs >= w.start_ms && curMs <= maxWEnd;
    });

    // If in tiny pause within segment, stick to most recent word
    if (activeWordIndex === -1 && curMs >= segWords[0].start_ms && curMs <= segWords[segWords.length - 1].end_ms + 300) {
      for (let i = segWords.length - 1; i >= 0; i--) {
        if (curMs >= segWords[i].start_ms) {
          activeWordIndex = i;
          break;
        }
      }
    }
  }

  // Burst Mode Calculation
  const burstCount = Math.max(2, subtitleStyle?.burst_word_count || 2);
  let activeBurstGroup: { word: string; start_ms: number; end_ms: number; isActive: boolean; cleanWord: string }[] = [];

  if (segWords.length > 0) {
    for (let i = 0; i < segWords.length; i += burstCount) {
      const group = segWords.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      const nextSlice = segWords.slice(i + burstCount, i + burstCount + 1);
      const maxGEnd = nextSlice.length > 0 ? Math.min(gEnd + 200, nextSlice[0].start_ms) : gEnd + 300;

      if (curMs >= gStart && curMs <= maxGEnd) {
        activeBurstGroup = group.map((item, localIdx) => {
          const globalIdx = i + localIdx;
          const clean = item.word.toLowerCase().replace(/[^\w]/g, "");
          return {
            ...item,
            cleanWord: clean,
            isActive: globalIdx === activeWordIndex,
          };
        });
        break;
      }
    }
  }

  // Update total duration when project updates
  useEffect(() => {
    if (project.timeline?.total_duration) {
      setDurationSec(project.timeline.total_duration);
    } else if (project.audio?.duration) {
      setDurationSec(project.audio.duration);
    }
  }, [project.timeline?.total_duration, project.audio?.duration]);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTimeSec(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeSec(0);
      handleReset();
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDurationSec(audio.duration);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, []);

  // Timer fallback if no audio track exists yet
  useEffect(() => {
    if (project.audio?.audio_url) return;
    if (!isPlaying) return;

    let lastTime = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setCurrentTimeSec((cur) => {
        const next = cur + delta;
        if (next >= durationSec) {
          setIsPlaying(false);
          handleReset();
          return 0;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, project.audio?.audio_url, durationSec]);

  // Initial & Clips-Change Setup for Video Elements
  useEffect(() => {
    if (clips.length === 0) return;

    let idx = clips.findIndex((c) => currentTimeSec >= c.timeline_start && currentTimeSec < c.timeline_end);
    if (idx === -1) idx = 0;
    currentClipIndexRef.current = idx;

    const curClip = clips[idx];
    const vidA = videoRefA.current;
    if (vidA) {
      if (vidA.getAttribute("src") !== curClip.video_url) {
        vidA.src = curClip.video_url || "";
      }
      const clipProg = Math.max(0, currentTimeSec - curClip.timeline_start);
      vidA.currentTime = curClip.clip_start + clipProg * (curClip.speed || 1.0);
      vidA.playbackRate = curClip.speed || 1.0;
      vidA.muted = true;
    }

    // Preload next clip on slot B
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
    setActiveSlotState(0);
  }, [clips]);

  // Hardware-Accelerated 2D Canvas Compositor
  // Emulates FFmpeg's video pipeline: live moving blur background, dynamic zoom (Ken Burns), and color grading
  const renderCanvasFrame = useCallback(
    (timeSec: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const cW = canvas.width;
      const cH = canvas.height;

      const bgMode = project.background_fill?.mode || "blur";
      const bgColor = project.background_fill?.color || "#000000";
      const userZoom = Math.max(0.5, project.background_fill?.zoom ?? 1.0);
      const antiCopyright = project.background_fill?.anti_copyright ?? true;
      const dynamicZoom = antiCopyright ? (project.background_fill?.dynamic_zoom ?? true) : false;
      const colorGrading = antiCopyright ? (project.background_fill?.color_grading ?? true) : false;

      // Active clip lookup
      const clipIdx = clips.findIndex((c) => timeSec >= c.timeline_start && timeSec < c.timeline_end);
      const activeIdx = clipIdx !== -1 ? clipIdx : timeSec >= durationSec ? Math.max(0, clips.length - 1) : 0;
      const curClip = clips[activeIdx];
      const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;

      ctx.clearRect(0, 0, cW, cH);

      const isVideoReady = Boolean(activeVid && activeVid.readyState >= 2 && activeVid.videoWidth > 0);

      // 1. Render Background
      if (bgMode === "cover") {
        // Fullscreen cover: video fills entire canvas, background layer is omitted
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, cW, cH);
      } else if (bgMode === "blur" && isVideoReady && activeVid) {
        ctx.save();
        // Hardware accelerated dynamic blur matching FFmpeg boxblur=25:5
        ctx.filter = "blur(30px) brightness(0.70)";
        ctx.drawImage(activeVid, -25, -25, cW + 50, cH + 50);
        ctx.restore();
      } else if (bgMode === "blur" && curClip?.thumbnail_url) {
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

      // 2. Render Main Video Content (Letterboxed / Cover / Custom Zoom + Ken Burns Zoom + Color Grading)
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

        if (bgMode === "cover") {
          // Cover: Fill entire canvas, crop overflowing edges symmetrically
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
          // Fit (zoom = 1.0) or Custom Zoom with background blur/color
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

        // Apply Dynamic Zoom (Ken Burns) matching FFmpeg zoompan
        if (dynamicZoom && curClip) {
          const elapsedInClip = Math.max(0, timeSec - curClip.timeline_start);
          const frameInClip = Math.floor(elapsedInClip * COMPOSITION_FPS);
          const zoom = calculateKenBurnsZoom(frameInClip, activeIdx % 2 === 0);

          ctx.translate(cW / 2, cH / 2);
          ctx.scale(zoom, zoom);
          ctx.translate(-cW / 2, -cH / 2);
        }

        // Apply Color Grading matching FFmpeg eq=contrast=1.03:saturation=1.04:brightness=0.01
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

          if (bgMode === "cover") {
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
    [clips, project.background_fill, durationSec]
  );

  // High-Precision Unified Compositor Loop (Audio Clock + Dual-Video Ping-Pong + Canvas + JASSUB)
  useEffect(() => {
    let animId: number;

    const compositorLoop = () => {
      const audio = audioRef.current;
      const curTime = isPlaying && audio && !audio.paused ? audio.currentTime : currentTimeSec;

      if (isPlaying && audio && !audio.paused) {
        setCurrentTimeSec(curTime);

        // Find which clip belongs to curTime
        const newIdx = clips.findIndex(
          (c) => curTime >= c.timeline_start && curTime < c.timeline_end
        );
        const validIdx = newIdx !== -1 ? newIdx : curTime >= durationSec ? Math.max(0, clips.length - 1) : 0;

        if (validIdx !== currentClipIndexRef.current && validIdx < clips.length) {
          // Transition boundary hit! Ping-pong switch to the other video element
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

          if (oldActiveVid) {
            oldActiveVid.pause();
          }

          activeVideoSlot.current = nextSlot;
          setActiveSlotState(nextSlot);
          currentClipIndexRef.current = validIdx;

          // Preload the next clip on the now-inactive video element
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
          // Inside current clip: enforce playback speed & drift alignment
          const curClip = clips[validIdx];
          if (curClip) {
            const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;
            if (activeVid) {
              const targetSpeed = curClip.speed || 1.0;
              if (Math.abs(activeVid.playbackRate - targetSpeed) > 0.01) {
                activeVid.playbackRate = targetSpeed;
              }
              const expectedVidTime = curClip.clip_start + Math.max(0, curTime - curClip.timeline_start) * targetSpeed;
              if (Math.abs(activeVid.currentTime - expectedVidTime) > 0.15) {
                activeVid.currentTime = expectedVidTime;
              }
              if (activeVid.paused && !audio.paused) {
                activeVid.play().catch(() => {});
              }
            }
          }
        }
      }

      // Render frame to Canvas 2D compositor
      renderCanvasFrame(curTime);

      // Render Subtitles via JASSUB libass
      if (jassubRef.current && isJassubReady) {
        jassubRef.current.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: curTime,
        });
      }

      if (isPlaying) {
        animId = requestAnimationFrame(compositorLoop);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(compositorLoop);
    } else {
      // Single paint when paused
      renderCanvasFrame(currentTimeSec);
      if (jassubRef.current && isJassubReady) {
        jassubRef.current.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeSec,
        });
      }
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, clips, durationSec, isJassubReady, canvasWidth, canvasHeight, renderCanvasFrame, currentTimeSec]);

  // Initialize JASSUB (WebAssembly libass) for 100% true WYSIWYG subtitle rendering
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
        (window as any).__jassub = jassubInstance;
        (window as any).__isJassubReady = true;

        jassubInstance.manualRender({
          expectedDisplayTime: performance.now(),
          width: canvasWidth,
          height: canvasHeight,
          mediaTime: currentTimeSec,
        });
      } catch (err: any) {
        console.error("[JASSUB] initialization failed:", err);
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
      if (canvasEl) {
        canvasEl.remove();
      }
    };
  }, [canvasWidth, canvasHeight]);

  // Update JASSUB track in real-time when subtitleStyle or segments change
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
          mediaTime: currentTimeSec,
        },
        true
      );
    } catch (err) {
      console.error("Failed to update JASSUB track:", err);
    }
  }, [subtitleStyle, segments, isJassubReady, canvasWidth, canvasHeight, currentTimeSec]);

  // Listen for video decoder seeked/loaded events to redraw canvas when paused
  useEffect(() => {
    const onFrameUpdate = () => {
      if (!isPlaying) {
        renderCanvasFrame(currentTimeSec);
      }
    };

    const vA = videoRefA.current;
    const vB = videoRefB.current;

    vA?.addEventListener("seeked", onFrameUpdate);
    vA?.addEventListener("loadeddata", onFrameUpdate);
    vB?.addEventListener("seeked", onFrameUpdate);
    vB?.addEventListener("loadeddata", onFrameUpdate);

    return () => {
      vA?.removeEventListener("seeked", onFrameUpdate);
      vA?.removeEventListener("loadeddata", onFrameUpdate);
      vB?.removeEventListener("seeked", onFrameUpdate);
      vB?.removeEventListener("loadeddata", onFrameUpdate);
    };
  }, [isPlaying, renderCanvasFrame, currentTimeSec]);

  const togglePlay = () => {
    if (isPlaying) {
      if (audioRef.current) audioRef.current.pause();
      if (videoRefA.current) videoRefA.current.pause();
      if (videoRefB.current) videoRefB.current.pause();
      setIsPlaying(false);
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = currentTimeSec;
        audioRef.current.play().catch(() => {});
      }
      const activeVid = activeVideoSlot.current === 0 ? videoRefA.current : videoRefB.current;
      if (activeVid) {
        activeVid.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawT = parseFloat(e.target.value);
    const t = snapToFrame(rawT);
    setCurrentTimeSec(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
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
        if (isPlaying) activeVid.play().catch(() => {});
      }

      // Pre-seek next clip on the other slot
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
  };

  const handleReset = () => {
    setCurrentTimeSec(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
    activeVideoSlot.current = 0;
    setActiveSlotState(0);
    currentClipIndexRef.current = 0;

    if (clips.length > 0 && videoRefA.current) {
      videoRefA.current.src = clips[0].video_url || "";
      videoRefA.current.currentTime = clips[0].clip_start;
      videoRefA.current.playbackRate = clips[0].speed || 1.0;
    }
    if (clips.length > 1 && videoRefB.current) {
      videoRefB.current.src = clips[1].video_url || "";
      videoRefB.current.currentTime = clips[1].clip_start;
      videoRefB.current.playbackRate = clips[1].speed || 1.0;
      lastPreloadedClipIndex.current = 1;
    }

    renderCanvasFrame(0);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // 100% WYSIWYG Scale Ratios: Reference matching canvas dimensions
  const scale = frameWidth / canvasWidth;
  const aspectMultiplier = canvasHeight / canvasWidth;
  const frameHeight = frameWidth * aspectMultiplier;
  const scaleY = frameHeight / canvasHeight;

  const fontBaseSize = subtitleStyle?.font_size || 56;
  const scaledFontSize = Math.max(6, Number((fontBaseSize * scale).toFixed(2)));
  const scaledOutlineWidth = Math.max(0.5, Number(((subtitleStyle?.outline_width ?? 4) * scale).toFixed(2)));

  const offsetY = subtitleStyle?.offset_y || 0;
  const offsetX = subtitleStyle?.offset_x || 0;
  const scaledOffsetY = Math.round(offsetY * scaleY);
  const scaledOffsetX = Math.round(offsetX * scale);

  const boxOpacity = subtitleStyle?.box_opacity ?? 0.0;
  const boxBgColor = boxOpacity > 0.05 ? hexToRgba(subtitleStyle?.box_color || "#000000", boxOpacity) : "transparent";

  // Drag position handlers
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
    if (isDraggingSubtitle) {
      setIsDraggingSubtitle(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const isScaleAnim = subtitleStyle?.highlight_animation !== "color" && subtitleStyle?.highlight_animation !== "none";
  const zoomScale = isScaleAnim ? (subtitleStyle?.scale_factor ?? 1.5) : 1.0;

  // Aspect ratio responsive frame wrapper styling
  const aspectClass =
    project.aspect_ratio === "16:9"
      ? "w-[320px] sm:w-[480px] aspect-[16/9]"
      : project.aspect_ratio === "1:1"
      ? "w-[280px] sm:w-[340px] aspect-square"
      : "w-[280px] sm:w-[320px] aspect-[9/16]";

  return (
    <div className="flex flex-col items-center">
      {/* Hidden audio element for speech */}
      {project.audio?.audio_url && (
        <audio ref={audioRef} src={project.audio.audio_url} preload="auto" />
      )}

      {/* Dynamic Screen Frame */}
      <div
        ref={frameRef}
        className={`relative ${aspectClass} bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-surface-border flex flex-col justify-between select-none`}
      >
        {/* Hardware-Accelerated Canvas Compositor (Moving Video Blur + Dynamic Zoom + Color Grading) */}
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
        />

        {/* 100% Bit-for-Bit WYSIWYG Subtitle Canvas Layer (JASSUB WebAssembly libass) */}
        <div
          ref={canvasContainerRef}
          className="absolute inset-0 z-20 pointer-events-none w-full h-full overflow-hidden flex items-center justify-center"
        />

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

        {/* If no clips in timeline */}
        {clips.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-slate-600 text-xs text-center p-4">
            Belum ada video di timeline
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
            <div className="w-full max-w-[260px] h-14 rounded-xl border border-dashed border-transparent group-hover:border-brand-400/60 transition-all flex items-center justify-center pointer-events-auto">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-[10px] text-brand-300 px-2 py-0.5 rounded font-mono flex items-center gap-1 shadow-lg pointer-events-none">
                <Move className="w-2.5 h-2.5" />
                <span>Geser Posisi Subtitle</span>
              </div>
            </div>
          </div>
        )}

        {/* Fallback CSS Subtitle Overlay (active only before WASM is initialized) */}
        {!isJassubReady && (
          <div
            className="absolute left-0 right-0 z-20 px-3 flex justify-center text-center select-none pointer-events-none"
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
            {/* 1. Burst Mode (Hormozi 2-3 words group) */}
            {subtitleStyle?.display_mode === "burst" && activeBurstGroup.length > 0 ? (
              <div
                style={{
                  fontFamily: `"${subtitleStyle?.font_family || "Montserrat"}", sans-serif`,
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 500,
                  color: subtitleStyle?.primary_color || "#FFFFFF",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                  paintOrder: "stroke fill",
                  backgroundColor: boxBgColor,
                  padding: boxOpacity > 0.05 ? "3px 8px" : "0",
                  borderRadius: "6px",
                }}
                className="uppercase tracking-wide inline-flex items-center justify-center flex-wrap"
              >
                {activeBurstGroup.map((w, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: w.isActive ? subtitleStyle?.highlight_color || "#00FF66" : subtitleStyle?.primary_color || "#FFFFFF",
                      transform: w.isActive ? `scale(${zoomScale})` : "scale(1.0)",
                      transformOrigin: "center bottom",
                      transition: "transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1), color 80ms ease-out",
                    }}
                    className="mx-1 inline-block"
                  >
                    {w.word.toUpperCase()}
                  </span>
                ))}
              </div>
            ) : subtitleStyle?.display_mode === "per_word" && activeWordIndex !== -1 && segWords[activeWordIndex] ? (
              /* 2. Per-word Mode */
              (() => {
                const currentW = segWords[activeWordIndex];
                return (
                  <div
                    style={{
                      fontFamily: `"${subtitleStyle?.font_family || "Montserrat"}", sans-serif`,
                      fontSize: `${scaledFontSize}px`,
                      fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 500,
                      color: subtitleStyle?.highlight_color || "#FFE600",
                      WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                      paintOrder: "stroke fill",
                      backgroundColor: boxBgColor,
                      padding: boxOpacity > 0.05 ? "3px 8px" : "0",
                      borderRadius: "6px",
                      transform: `scale(${zoomScale})`,
                      transformOrigin: "center bottom",
                      transition: "transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}
                    className="uppercase tracking-wider inline-block"
                  >
                    {currentW.word.toUpperCase()}
                  </div>
                );
              })()
            ) : activeSegment ? (
              /* 3. Full Sentence Mode (Classic Karaoke) */
              <div
                style={{
                  fontFamily: `"${subtitleStyle?.font_family || "Montserrat"}", sans-serif`,
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 500,
                  color: subtitleStyle?.primary_color || "#EEEEEE",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#0F172A"}`,
                  paintOrder: "stroke fill",
                  backgroundColor: boxBgColor,
                  padding: boxOpacity > 0.05 ? "3px 8px" : "0",
                  borderRadius: "6px",
                }}
                className="leading-snug flex flex-wrap justify-center"
              >
                {segWords.length > 0 ? (
                  segWords.map((w, idx) => {
                    const isActive = idx === activeWordIndex;
                    return (
                      <span
                        key={idx}
                        style={{
                          color: isActive ? subtitleStyle?.highlight_color || "#38BDF8" : subtitleStyle?.primary_color || "#EEEEEE",
                          transform: isActive ? `scale(${zoomScale})` : "scale(1.0)",
                          transformOrigin: "center bottom",
                          transition: "color 80ms ease-out, transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                        }}
                        className="mx-0.5 inline-block"
                      >
                        {w.word}
                      </span>
                    );
                  })
                ) : (
                  <span>{activeSegment.text}</span>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Top Watermark Overlay */}
        <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-sm text-[10px] text-white/90 font-mono shadow-lg">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span>{project.aspect_ratio || "9:16"} LIVE PREVIEW</span>
          <span className="text-white/30">•</span>
          <span className="text-amber-400/90 font-semibold uppercase">
            {project.background_fill?.mode === "cover"
              ? "Cover 9:16"
              : (project.background_fill?.zoom && project.background_fill.zoom > 1.05)
              ? `Zoom ${Math.round(project.background_fill.zoom * 100)}%`
              : project.background_fill?.mode === "black"
              ? "Fit Black"
              : "Fit Blur"}
          </span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="w-full max-w-sm mt-4 glass-panel rounded-2xl p-4 border border-surface-border space-y-2">
        {/* Scrubber */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>{formatTime(currentTimeSec)}</span>
          <input
            type="range"
            min="0"
            max={durationSec || 1}
            step="0.0333"
            value={currentTimeSec}
            onChange={handleSeek}
            className="flex-1 accent-brand-500 cursor-pointer h-1.5 bg-surface rounded-lg"
          />
          <span>{formatTime(durationSec)}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="p-2 rounded-xl bg-surface hover:bg-surface-border text-slate-300 hover:text-white transition"
              title="Reset ke Awal"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={togglePlay}
              className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-lg shadow-brand-500/20"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-xl border border-surface-border text-xs transition ${
                isMuted ? "text-rose-400 bg-rose-500/10" : "text-slate-300 bg-surface"
              }`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

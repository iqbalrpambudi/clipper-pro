"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SourceVideo, HeatmapBucket } from "@/types";

interface SourceVideoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  video: SourceVideo;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SourceVideoPlayer({
  isOpen,
  onClose,
  video,
}: SourceVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const lastPublishedTimeRef = useRef(0);
  const publishTime = useCallback((t: number) => {
    if (Math.abs(t - lastPublishedTimeRef.current) < 0.05) return;
    lastPublishedTimeRef.current = t;
    setCurrentTime(t);
  }, []);

  const heatmap = video.heatmap_data;

  // Normalized heatmap for rendering (0-1 values already)
  const maxHeatValue = useMemo(() => {
    if (!heatmap?.length) return 1;
    return Math.max(...heatmap.map((b) => b.value), 0.01);
  }, [heatmap]);

  // Init playback
  useEffect(() => {
    if (!isOpen) {
      videoRef.current?.pause();
      setIsPlaying(false);
      return;
    }
    setCurrentTime(0);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      v.playbackRate = playbackRate;
    }
  }, [isOpen, video.file_url]);

  // rAF time sync
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    let animId: number;
    const tick = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        publishTime(v.currentTime);
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isPlaying, publishTime]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          v.paused ? v.play() : v.pause();
          break;
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          v.currentTime = Math.max(0, v.currentTime - 5);
          publishTime(v.currentTime);
          break;
        case "ArrowRight":
          v.currentTime = Math.min(duration, v.currentTime + 5);
          publishTime(v.currentTime);
          break;
        case "m":
          v.muted = !v.muted;
          setIsMuted(v.muted);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, duration, onClose, publishTime]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    const track = trackRef.current;
    if (!v || !track || !duration) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    publishTime(v.currentTime);
  };

  const handleSeekStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsSeeking(true);
    handleSeek(e);

    const handleMove = (ev: MouseEvent) => {
      const v = videoRef.current;
      const track = trackRef.current;
      if (!v || !track || !duration) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      v.currentTime = ratio * duration;
      publishTime(v.currentTime);
    };

    const handleUp = () => {
      setIsSeeking(false);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2, 0.5];
    const idx = speeds.indexOf(playbackRate);
    const next = speeds[(idx + 1) % speeds.length];
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const toggleFullscreen = () => {
    // ponytail: basic fullscreen via video element. Add container fullscreen when needed.
    const v = videoRef.current;
    if (!v) return;
    if (!document.fullscreenElement) {
      v.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  if (!isOpen) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex flex-col w-full max-w-3xl mx-4 bg-card rounded-xl shadow-2xl overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground truncate pr-4">
            {video.filename}
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Video */}
        <div className="relative bg-black aspect-video cursor-pointer" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={video.file_url || ""}
            className="w-full h-full object-contain"
            muted={isMuted}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              setDuration(v.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            preload="metadata"
          />
          {/* Center play overlay when paused */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg">
                <Play className="w-7 h-7 ml-1 fill-current" />
              </span>
            </div>
          )}
        </div>

        {/* Heatmap + Seek Track */}
        <div className="px-4 pt-2">
          {/* Heatmap bars */}
          {heatmap && heatmap.length > 0 && (
            <div className="flex items-end h-8 gap-px mb-0.5 rounded overflow-hidden">
              {heatmap.map((bucket, i) => {
                const normalizedValue = bucket.value / maxHeatValue;
                const height = Math.max(2, normalizedValue * 100);
                // Color: low=muted, high=orange/red
                const hue = 30 - normalizedValue * 30; // 30(yellow-orange) → 0(red)
                const sat = 40 + normalizedValue * 55;
                const light = 70 - normalizedValue * 30;
                const isCurrent =
                  duration > 0 &&
                  currentTime >= bucket.start_time &&
                  currentTime < bucket.end_time;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm transition-colors"
                    style={{
                      height: `${height}%`,
                      backgroundColor: isCurrent
                        ? `hsl(${hue}, ${sat + 10}%, ${light - 10}%)`
                        : `hsl(${hue}, ${sat}%, ${light}%)`,
                      opacity: isCurrent ? 1 : 0.7,
                    }}
                    title={`${formatTime(bucket.start_time)} – ${formatTime(bucket.end_time)}: ${Math.round(bucket.value * 100)}%`}
                  />
                );
              })}
            </div>
          )}

          {/* Seek bar */}
          <div
            ref={trackRef}
            className="relative h-2 bg-muted rounded-full cursor-pointer group"
            onMouseDown={handleSeekStart}
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow border-2 border-background transition-[left] duration-75 opacity-0 group-hover:opacity-100"
              style={{ left: `calc(${progress}% - 7px)` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-2 gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={togglePlay}>
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              )}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => {
              const v = videoRef.current;
              if (v) { v.muted = !v.muted; setIsMuted(!isMuted); }
            }}>
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded bg-muted hover:bg-accent text-foreground transition-colors"
              title="Kecepatan putar"
            >
              {playbackRate}x
            </button>
            <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen}>
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Heatmap legend */}
        {heatmap && heatmap.length > 0 && (
          <div className="px-4 pb-2">
            <p className="text-[10px] text-muted-foreground">
              🔥 Heatmap &quot;Most Replayed&quot; dari YouTube — bar tinggi = bagian paling banyak ditonton ulang
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

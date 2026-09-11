"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Repeat,
  Sparkles,
  Clock,
  Film,
} from "lucide-react";

export interface ScenePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  startTime: number;
  endTime: number;
  title?: string;
  description?: string | null;
  tags?: string[];
  sceneIndex?: number;
}

export function ScenePreviewModal({
  isOpen,
  onClose,
  videoUrl,
  thumbnailUrl,
  startTime,
  endTime,
  title,
  description,
  tags = [],
  sceneIndex,
}: ScenePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const duration = Math.max(0.1, endTime - startTime);
  const currentOffset = Math.max(0, Math.min(duration, currentTime - startTime));

  // Initialize playback when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
      return;
    }

    setCurrentTime(startTime);
    setIsLoading(true);

    const video = videoRef.current;
    if (video) {
      video.currentTime = startTime;
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          // Autoplay may be blocked by browser policy without user interaction
          setIsPlaying(false);
          setIsLoading(false);
        });
    }
  }, [isOpen, videoUrl, startTime, endTime]);

  // Handle timeupdate boundary enforcement
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    setCurrentTime(t);

    if (t >= endTime) {
      if (isLooping) {
        video.currentTime = startTime;
        video.play().catch(() => {});
      } else {
        video.pause();
        video.currentTime = startTime;
        setIsPlaying(false);
      }
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime;
      }
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const offset = parseFloat(e.target.value);
    const targetTime = startTime + offset;
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const cycleSpeed = () => {
    const rates = [1, 1.25, 1.5, 0.5];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const video = videoRef.current;
        if (video) {
          const next = Math.max(startTime, video.currentTime - 0.5);
          video.currentTime = next;
          setCurrentTime(next);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const video = videoRef.current;
        if (video) {
          const next = Math.min(endTime, video.currentTime + 0.5);
          video.currentTime = next;
          setCurrentTime(next);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isPlaying, startTime, endTime, isLooping]);

  if (!isOpen) return null;

  const formatSec = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-scale-pop">
      <div className="relative w-full max-w-2xl bg-surface-card border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface/50">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-accent-yellow/10 text-accent-yellow border border-accent-yellow/20">
              <Film className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                {title || (sceneIndex !== undefined ? `Preview Scene #${sceneIndex + 1}` : "Preview Scene")}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface border border-surface-border text-slate-300">
                  {duration.toFixed(1)}s Snippet
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Rentang: {formatSec(startTime)} → {formatSec(endTime)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-surface rounded-lg transition"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Display */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              playsInline
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onWaiting={() => setIsLoading(true)}
              onPlaying={() => {
                setIsLoading(false);
                setIsPlaying(true);
              }}
              className="w-full h-full object-contain"
            />
          ) : thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt="Scene preview"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-slate-500 text-xs flex flex-col items-center gap-2">
              <Film className="w-8 h-8 opacity-40" />
              <span>Video tidak tersedia</span>
            </div>
          )}

          {/* Big Play Overlay if Paused */}
          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-brand-600/80 border border-white/20 text-white flex items-center justify-center transition shadow-2xl backdrop-blur-sm group"
            >
              <Play className="w-6 h-6 ml-1 group-hover:scale-110 transition" />
            </button>
          )}

          {/* Snippet Badge */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>CLIP [{currentOffset.toFixed(1)}s / {duration.toFixed(1)}s]</span>
          </div>

          {/* Speed Indicator */}
          {playbackRate !== 1 && (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-brand-500/80 text-[10px] font-bold text-white font-mono">
              {playbackRate}x
            </div>
          )}
        </div>

        {/* Scrubber & Controls */}
        <div className="p-4 bg-surface/70 space-y-3 border-t border-surface-border">
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="text-accent-yellow font-semibold">+{currentOffset.toFixed(1)}s</span>
              <span>{duration.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={currentOffset}
              onChange={handleSeek}
              className="w-full h-1.5 bg-surface-border rounded-lg cursor-pointer accent-accent-yellow"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 transition transform active:scale-95"
                title={isPlaying ? "Jeda (Spasi)" : "Putar (Spasi)"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <button
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = startTime;
                    setCurrentTime(startTime);
                  }
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-surface rounded-lg transition"
                title="Kembali ke Awal Klip"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`p-2 rounded-lg transition flex items-center gap-1 text-xs ${
                  isLooping
                    ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/40"
                    : "text-slate-400 hover:text-white hover:bg-surface"
                }`}
                title="Looping Klip"
              >
                <Repeat className="w-4 h-4" />
                <span className="text-[10px] hidden sm:inline">Loop</span>
              </button>

              <button
                onClick={cycleSpeed}
                className="px-2.5 py-1 text-[11px] font-mono font-bold text-slate-300 hover:text-white bg-surface hover:bg-surface-border border border-surface-border rounded-lg transition"
                title="Ubah Kecepatan Putar"
              >
                {playbackRate}x
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 text-slate-400 hover:text-white hover:bg-surface rounded-lg transition"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Description & Tags */}
          {(description || tags.length > 0) && (
            <div className="pt-2 border-t border-surface-border/60 text-xs space-y-1.5">
              {description && (
                <p className="text-slate-200 text-xs leading-relaxed line-clamp-2">
                  <span className="text-slate-400 font-semibold mr-1">Deskripsi AI:</span>
                  {description}
                </p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag, i) => (
                    <span
                      key={i}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-surface-border text-slate-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

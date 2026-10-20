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
  Film,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  transcript?: string | null;
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
  transcript,
  sceneIndex,
}: ScenePreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [brokenThumb, setBrokenThumb] = useState(false);

  // The rAF loop runs at 60fps; only publish to state when the value visibly moves.
  const lastPublishedTimeRef = useRef(startTime);
  const publishTime = (t: number) => {
    if (Math.abs(t - lastPublishedTimeRef.current) < 0.05) return;
    lastPublishedTimeRef.current = t;
    setCurrentTime(t);
  };

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
          setIsPlaying(false);
          setIsLoading(false);
        });
    }
  }, [isOpen, videoUrl, startTime, endTime]);

  // High-precision frame boundary enforcement using requestAnimationFrame
  useEffect(() => {
    if (!isOpen || !isPlaying) return;

    let animId: number;
    const effectiveEndTime = Math.max(startTime + 0.1, endTime - 0.04);

    const checkFrame = () => {
      const video = videoRef.current;
      if (video) {
        const t = video.currentTime;
        publishTime(t);

        if (t >= effectiveEndTime) {
          if (isLooping) {
            video.currentTime = startTime;
            video.play().catch(() => {});
          } else {
            video.pause();
            video.currentTime = startTime;
            setIsPlaying(false);
            return;
          }
        }
      }
      animId = requestAnimationFrame(checkFrame);
    };

    animId = requestAnimationFrame(checkFrame);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, isPlaying, startTime, endTime, isLooping]);

  // Fallback boundary check on timeupdate
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const t = video.currentTime;
    publishTime(t);

    const effectiveEndTime = Math.max(startTime + 0.1, endTime - 0.04);
    if (t >= effectiveEndTime) {
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

    const effectiveEndTime = Math.max(startTime + 0.1, endTime - 0.04);
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      if (video.currentTime >= effectiveEndTime || video.currentTime < startTime) {
        video.currentTime = startTime;
      }
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
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

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
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
          const effectiveEndTime = Math.max(startTime + 0.1, endTime - 0.04);
          const next = Math.min(effectiveEndTime, video.currentTime + 0.5);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-[#181818] border border-[#2E2E2E] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2E2E2E] bg-[#141414]">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Film className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-2">
                {title ||
                  (sceneIndex !== undefined ? `Preview Scene #${sceneIndex + 1}` : "Preview Scene")}
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] py-0 text-muted-foreground border-[#2E2E2E]"
                >
                  {duration.toFixed(1)}s Snippet
                </Badge>
              </h3>
              <p className="text-[11px] text-muted-foreground font-mono">
                Rentang: {formatSec(startTime)} → {formatSec(endTime)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Tutup (Esc)"
          >
            <X className="w-4 h-4" />
          </Button>
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
          ) : thumbnailUrl && !brokenThumb ? (
            <img
              src={thumbnailUrl}
              alt="Scene preview"
              className="w-full h-full object-contain"
              onError={() => setBrokenThumb(true)}
            />
          ) : (
            <div className="text-muted-foreground text-xs flex flex-col items-center gap-2">
              <Film className="w-8 h-8 opacity-40 text-muted-foreground" />
              <span>Preview Klip #{sceneIndex !== undefined ? sceneIndex + 1 : ""}</span>
            </div>
          )}

          {/* Big Play Overlay if Paused */}
          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-black/60 hover:bg-primary hover:text-black border border-white/20 text-white flex items-center justify-center transition shadow-2xl backdrop-blur-xs group"
            >
              <Play className="w-6 h-6 ml-1 group-hover:scale-105 transition fill-current" />
            </button>
          )}

          {/* Snippet Badge */}
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/80 backdrop-blur-xs border border-[#2E2E2E] text-[10px] font-mono text-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span>
              CLIP [{currentOffset.toFixed(1)}s / {duration.toFixed(1)}s]
            </span>
          </div>

          {/* Speed Indicator */}
          {playbackRate !== 1 && (
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-primary text-[10px] font-bold text-black font-mono">
              {playbackRate}x
            </div>
          )}
        </div>

        {/* Scrubber & Controls */}
        <div className="p-4 bg-[#141414] space-y-3 border-t border-[#2E2E2E]">
          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span className="text-primary font-semibold">+{currentOffset.toFixed(1)}s</span>
              <span>{duration.toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={currentOffset}
              onChange={handleSeek}
              className="w-full h-1.5 bg-[#1E1E1E] rounded-lg cursor-pointer accent-primary"
            />
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Button
                variant="supabase"
                size="icon"
                onClick={togglePlay}
                className="w-8 h-8 rounded-lg shadow-sm"
                title={isPlaying ? "Jeda (Spasi)" : "Putar (Spasi)"}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5 fill-current" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = startTime;
                    setCurrentTime(startTime);
                  }
                }}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Kembali ke Awal Klip"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>

              <Button
                variant={isLooping ? "supabase" : "outline"}
                size="xs"
                onClick={() => setIsLooping(!isLooping)}
                className="h-8 gap-1.5"
                title="Looping Klip"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden sm:inline">Loop</span>
              </Button>

              <Button
                variant="outline"
                size="xs"
                onClick={cycleSpeed}
                className="h-8 text-[11px] font-mono font-semibold"
                title="Ubah Kecepatan Putar"
              >
                {playbackRate}x
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-destructive" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Transcript / Dialogue */}
          {transcript && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-xs text-foreground flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-primary block text-[11px] mb-0.5">
                  Dialog Percakapan (Whisper):
                </span>
                <p className="italic text-foreground/90 leading-relaxed">"{transcript}"</p>
              </div>
            </div>
          )}

          {/* Description & Tags */}
          {(description || tags.length > 0) && (
            <div className="pt-2 border-t border-[#2E2E2E] text-xs space-y-1.5">
              {description && (
                <p className="text-foreground text-xs leading-relaxed line-clamp-2">
                  <span className="text-muted-foreground font-semibold mr-1">Deskripsi AI:</span>
                  {description}
                </p>
              )}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="text-[10px] py-0 text-muted-foreground border-[#2E2E2E]"
                    >
                      #{tag}
                    </Badge>
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

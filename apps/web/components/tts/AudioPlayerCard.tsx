"use client";

import React from "react";
import { Volume2, VolumeX, Play, Pause, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatAudioTime } from "./constants";

interface AudioPlayerCardProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl?: string;
  projectName: string;
  voiceName: string;
  provider: string;
  rate?: string;
  isPlaying: boolean;
  currentTime: number;
  audioDuration: number;
  volume: number;
  isMuted: boolean;
  onTimeUpdate: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onSkip: (seconds: number) => void;
  onToggleMute: () => void;
  onVolumeChange: (newVol: number) => void;
}

export function AudioPlayerCard({
  audioRef,
  audioUrl,
  projectName,
  voiceName,
  provider,
  rate,
  isPlaying,
  currentTime,
  audioDuration,
  volume,
  isMuted,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
  onTogglePlay,
  onSeek,
  onSkip,
  onToggleMute,
  onVolumeChange,
}: AudioPlayerCardProps) {
  return (
    <>
      {/* Hidden Native Audio Element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
        />
      )}

      {/* MODERN SLEEK AUDIO PLAYER CARD */}
      <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
        {/* Top Info with Visualizer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground">Narasi: {projectName}</h4>
              <p className="text-[11px] text-muted-foreground">
                Voice: <strong className="text-foreground">{voiceName}</strong> (
                {provider.toUpperCase()}) • Kecepatan: {rate || "+0%"}
              </p>
            </div>
          </div>

          {/* Equalizer animation when playing */}
          <div className="flex items-end gap-1 h-6">
            {[40, 70, 30, 90, 60, 100, 45, 80, 50].map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full bg-primary transition-all duration-300 ${
                  isPlaying ? "animate-pulse" : "opacity-30"
                }`}
                style={{
                  height: isPlaying
                    ? `${Math.max(20, (h * ((currentTime * 3 + i) % 10)) / 10)}%`
                    : "20%",
                }}
              />
            ))}
          </div>
        </div>

        {/* Progress / Seekbar */}
        <div className="space-y-1.5">
          <div
            className="relative h-2.5 w-full cursor-pointer overflow-hidden rounded-full border border-border bg-muted"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, clickX / rect.width));
              onSeek(pct * audioDuration);
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 bg-primary rounded-full transition-all"
              style={{
                width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%`,
              }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(audioDuration)}</span>
          </div>
        </div>

        {/* Player Controls Bar */}
        <div className="flex items-center justify-between pt-1">
          {/* Skip Buttons & Main Play */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSkip(-5)}
              title="Mundur 5 detik"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <Button
              type="button"
              variant="workspace-primary"
              size="icon"
              onClick={onTogglePlay}
              className="h-9 w-9 rounded-full shadow-sm"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSkip(5)}
              title="Maju 5 detik"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className="text-muted-foreground hover:text-foreground transition"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-destructive" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="h-1.5 w-20 cursor-pointer rounded-lg bg-muted accent-primary"
            />
          </div>
        </div>
      </div>
    </>
  );
}

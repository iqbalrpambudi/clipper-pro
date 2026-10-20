"use client";

import React from "react";
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
  Scissors,
  RotateCcw,
  RotateCw,
  Maximize2,
} from "lucide-react";
import { formatTimecode } from "../timelineFormat";
import { TimelineClip } from "@/types";

interface MonitorTransportToolbarProps {
  time: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  clips: TimelineClip[];
  activeClip: TimelineClip | null;
  loopRange: { start: number; end: number } | null;
  canLoop: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  canSplit?: boolean;
  aspectRatio: string;
  previewQuality: "540p" | "720p" | "1080p";
  onPlayingChange: (playing: boolean) => void;
  onStep: (frames: number) => void;
  onJumpCut: (dir: -1 | 1) => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onCyclePreviewQuality: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSplit?: () => void;
}

export function MonitorTransportToolbar({
  time,
  duration,
  isPlaying,
  isMuted,
  clips,
  activeClip,
  loopRange,
  canLoop,
  canUndo = false,
  canRedo = false,
  canSplit = false,
  aspectRatio,
  previewQuality,
  onPlayingChange,
  onStep,
  onJumpCut,
  onToggleLoop,
  onToggleMute,
  onToggleFullscreen,
  onCyclePreviewQuality,
  onUndo,
  onRedo,
  onSplit,
}: MonitorTransportToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-border bg-surface flex-wrap">
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
            className="h-7 px-2 rounded-lg bg-background hover:bg-accent border border-border hover:border-primary/50 text-foreground text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-30 disabled:cursor-not-allowed"
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
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
          )}
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

      {/* Right actions: Loop, Mute, Resolution, Aspect Ratio, Fullscreen */}
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
          onClick={onToggleMute}
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </TransportBtn>

        {/* Preview Resolution Quality Selector */}
        <button
          type="button"
          onClick={onCyclePreviewQuality}
          className="px-2 py-0.5 rounded-lg bg-background border border-border hover:border-primary/50 text-[10px] font-mono font-semibold transition flex items-center gap-1 text-foreground hover:text-primary cursor-pointer"
          title="Klik untuk mengganti resolusi canvas preview (540p Cepat & Lancar / 720p / 1080p Penuh)"
        >
          <span className="text-primary font-bold">{previewQuality}</span>
          <span className="text-[8px] text-muted-foreground uppercase font-sans">
            {previewQuality === "540p" ? "Smooth" : previewQuality === "720p" ? "HD" : "Full"}
          </span>
        </button>

        <span className="px-2 py-0.5 rounded-lg bg-background border border-border text-[10px] font-mono text-muted-foreground font-semibold hidden md:inline">
          {aspectRatio}
        </span>

        <TransportBtn title="Layar Penuh" onClick={onToggleFullscreen}>
          <Maximize2 className="w-3.5 h-3.5" />
        </TransportBtn>
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
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

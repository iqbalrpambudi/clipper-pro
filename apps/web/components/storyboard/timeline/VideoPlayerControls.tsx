"use client";

import React from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Type } from "lucide-react";

interface VideoPlayerControlsProps {
  isPlaying: boolean;
  togglePlay: () => void;
  currentTime: number;
  duration: number;
  handleSeek: (timeSecs: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
  subtitleEnabled: boolean;
  onToggleSubtitle: () => void;
  formatTime: (secs: number) => string;
}

export function VideoPlayerControls({
  isPlaying,
  togglePlay,
  currentTime,
  duration,
  handleSeek,
  isMuted,
  toggleMute,
  subtitleEnabled,
  onToggleSubtitle,
  formatTime,
}: VideoPlayerControlsProps) {
  return (
    <div className="px-3.5 py-2 rounded-xl bg-[#141414] border border-[#222] space-y-1.5 shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="w-8 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-md shadow-violet-500/20 transition shrink-0"
            title={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => handleSeek(Math.max(0, currentTime - 5))}
            className="h-8 w-8 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition flex items-center justify-center shrink-0"
            title="Mundur 5 detik"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleSeek(Math.min(duration, currentTime + 5))}
            className="h-8 w-8 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition flex items-center justify-center shrink-0"
            title="Maju 5 detik"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSubtitle}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 text-xs font-mono font-semibold border ${
              subtitleEnabled
                ? "bg-violet-600/20 text-violet-300 border-violet-500/40"
                : "bg-[#222222] text-slate-500 border-[#2E2E2E]"
            }`}
            title={subtitleEnabled ? "Matikan Subtitle Video" : "Aktifkan Subtitle Video"}
          >
            <Type className="w-3 h-3" />
            <span className="text-[10px] font-bold hidden sm:inline">
              {subtitleEnabled ? "SUBTITLE ON" : "SUBTITLE OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="h-8 w-8 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition flex items-center justify-center shrink-0"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="text-xs font-mono font-bold text-violet-400 shrink-0">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Seekbar */}
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.1}
        value={currentTime}
        onChange={(e) => handleSeek(Number(e.target.value))}
        className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg block"
      />
    </div>
  );
}

"use client";

import React from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Type } from "lucide-react";

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
            onClick={onToggleSubtitle}
            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 text-xs font-mono font-semibold border ${
              subtitleEnabled
                ? "bg-violet-600/20 text-violet-300 border-violet-500/40"
                : "bg-[#222222] text-slate-500 border-[#2E2E2E]"
            }`}
            title={subtitleEnabled ? "Matikan Subtitle Video" : "Aktifkan Subtitle Video"}
          >
            <Type className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">
              {subtitleEnabled ? "SUBTITLE ON" : "SUBTITLE OFF"}
            </span>
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="p-2 rounded-lg bg-[#222222] hover:bg-white/10 text-slate-300 transition"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          <span className="text-xs font-mono font-bold text-violet-400">
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
        className="w-full accent-violet-500 cursor-pointer h-2 bg-[#2A2A2A] rounded-lg"
      />
    </div>
  );
}

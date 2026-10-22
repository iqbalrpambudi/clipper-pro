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
    <div className="space-y-1.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] px-3.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C45B3A] text-white shadow-sm transition hover:bg-[#A9472C]"
            title={isPlaying ? "Jeda" : "Putar"}
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSeek(Math.max(0, currentTime - 5))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] text-[#5E5C54] transition hover:bg-[#EAE6DD]"
            title="Mundur 5 detik"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => handleSeek(Math.min(duration, currentTime + 5))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] text-[#5E5C54] transition hover:bg-[#EAE6DD]"
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
                ? "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                : "bg-[#F3F0E8] text-[#77766D] border-[#E5E1D7]"
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] text-[#5E5C54] transition hover:bg-[#EAE6DD]"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>

          <span className="text-xs font-mono font-bold text-[#C45B3A] shrink-0">
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
        className="block h-1.5 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
      />
    </div>
  );
}

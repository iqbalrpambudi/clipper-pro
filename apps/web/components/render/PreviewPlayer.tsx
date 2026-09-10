"use client";

import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize } from "lucide-react";
import { Project, TimelineClip, Narration, AudioTrack, SubtitleStyle } from "@/types";

interface PreviewPlayerProps {
  project: Project & {
    timeline?: { clips: TimelineClip[]; total_duration: number } | null;
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
  };
}

export function PreviewPlayer({ project }: PreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(project.timeline?.total_duration || 30);
  const [isMuted, setIsMuted] = useState(false);

  const clips = project.timeline?.clips || [];
  const subtitleStyle = project.subtitle_style;
  const segments = project.narration?.segments || [];

  // Find active clip at current time
  const activeClip = clips.find(
    (c) => currentTimeSec >= c.timeline_start && currentTimeSec <= c.timeline_end
  ) || clips[0];

  // Find active subtitle text and active word at current time
  const curMs = currentTimeSec * 1000;
  const activeSegment = segments.find(
    (s) => curMs >= s.start_ms && curMs <= s.end_ms
  );

  let activeWord = "";
  let burstWords: string[] = [];

  if (activeSegment && activeSegment.words) {
    const w = activeSegment.words.find(
      (w) => curMs >= w.start_ms && curMs <= w.end_ms
    );
    if (w) activeWord = w.word;

    // Burst mode group
    const burstCount = subtitleStyle?.burst_word_count || 2;
    for (let i = 0; i < activeSegment.words.length; i += burstCount) {
      const group = activeSegment.words.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      if (curMs >= gStart && curMs <= gEnd) {
        burstWords = group.map((item) => item.word);
        break;
      }
    }
  }

  // Audio sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTimeSec(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTimeSec(0);
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

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTimeSec(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="flex flex-col items-center">
      {/* Hidden audio element for speech */}
      {project.audio?.audio_url && (
        <audio ref={audioRef} src={project.audio.audio_url} preload="auto" />
      )}

      {/* 9:16 Vertical Screen Frame */}
      <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-surface-border flex flex-col justify-between select-none">
        {/* Blurred Background Layer (if blur mode) */}
        {project.background_fill?.mode !== "black" && activeClip?.thumbnail_url && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-150 blur-xl opacity-60 pointer-events-none"
            style={{ backgroundImage: `url(${activeClip.thumbnail_url})` }}
          />
        )}

        {/* Center Main Video Content */}
        <div className="relative z-10 w-full h-full flex items-center justify-center p-1">
          {activeClip?.thumbnail_url ? (
            <img
              src={activeClip.thumbnail_url}
              alt="Scene preview"
              className="w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : (
            <div className="text-slate-600 text-xs text-center p-4">
              Belum ada video di timeline
            </div>
          )}
        </div>

        {/* WYSIWYG Subtitle Karaoke Overlay */}
        <div
          className={`absolute left-0 right-0 z-20 px-4 pointer-events-none flex justify-center text-center ${
            subtitleStyle?.position === "top"
              ? "top-14"
              : subtitleStyle?.position === "center"
              ? "top-1/2 -translate-y-1/2"
              : "bottom-14"
          }`}
          style={{
            transform: subtitleStyle?.offset_y
              ? `translateY(${subtitleStyle.offset_y}px)`
              : undefined,
          }}
        >
          {subtitleStyle?.display_mode === "burst" && burstWords.length > 0 ? (
            <div
              style={{
                fontFamily: subtitleStyle?.font_family || "Montserrat",
                fontSize: `${(subtitleStyle?.font_size || 56) / 3.2}px`,
                fontWeight: subtitleStyle?.font_weight.toLowerCase() === "bold" ? "bold" : "normal",
                color: subtitleStyle?.primary_color || "#FFFFFF",
                textShadow: `-2px -2px 0 ${subtitleStyle?.outline_color || "#000"}, 2px -2px 0 ${subtitleStyle?.outline_color || "#000"}, -2px 2px 0 ${subtitleStyle?.outline_color || "#000"}, 2px 2px 0 ${subtitleStyle?.outline_color || "#000"}`,
                backgroundColor:
                  subtitleStyle?.box_opacity && subtitleStyle.box_opacity > 0.1
                    ? subtitleStyle.box_color
                    : "transparent",
                padding: "4px 8px",
                borderRadius: "6px",
              }}
              className="uppercase tracking-wide transition-transform scale-105 duration-150"
            >
              {burstWords.map((w, i) => (
                <span
                  key={i}
                  style={{
                    color: w === activeWord ? subtitleStyle?.highlight_color : undefined,
                  }}
                  className="mx-1 inline-block"
                >
                  {w}
                </span>
              ))}
              {subtitleStyle?.emoji_enabled && " 🔥"}
            </div>
          ) : subtitleStyle?.display_mode === "per_word" && activeWord ? (
            <div
              style={{
                fontFamily: subtitleStyle?.font_family || "Montserrat",
                fontSize: `${(subtitleStyle?.font_size || 56) / 3.0}px`,
                fontWeight: subtitleStyle?.font_weight.toLowerCase() === "bold" ? "bold" : "normal",
                color: subtitleStyle?.highlight_color || "#FFE600",
                textShadow: `-2px -2px 0 ${subtitleStyle?.outline_color || "#000"}, 2px -2px 0 ${subtitleStyle?.outline_color || "#000"}, -2px 2px 0 ${subtitleStyle?.outline_color || "#000"}, 2px 2px 0 ${subtitleStyle?.outline_color || "#000"}`,
                padding: "2px 8px",
              }}
              className="uppercase tracking-wider transition-all transform scale-110 font-black"
            >
              {activeWord}
              {subtitleStyle?.emoji_enabled && " 🚀"}
            </div>
          ) : activeSegment ? (
            <div
              style={{
                fontFamily: subtitleStyle?.font_family || "Inter",
                fontSize: `${(subtitleStyle?.font_size || 56) / 3.8}px`,
                color: subtitleStyle?.primary_color || "#FFFFFF",
                textShadow: `-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000`,
              }}
              className="leading-snug"
            >
              {activeSegment.words && activeSegment.words.length > 0 ? (
                activeSegment.words.map((w, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: w.word === activeWord ? subtitleStyle?.highlight_color : undefined,
                      fontWeight: w.word === activeWord ? "bold" : "normal",
                    }}
                    className="mx-0.5 inline-block"
                  >
                    {w.word}
                  </span>
                ))
              ) : (
                <span>{activeSegment.text}</span>
              )}
            </div>
          ) : null}
        </div>

        {/* Top Watermark Overlay */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-[10px] text-white/80 font-mono">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <span>9:16 PREVIEW</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="w-full max-w-sm mt-4 glass-panel rounded-2xl p-4 border border-surface-border space-y-2">
        {/* Scrubber */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span>{formatTime(currentTimeSec)}</span>
          <input
            type="range"
            min={0}
            max={durationSec || 1}
            step={0.1}
            value={currentTimeSec}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-surface rounded cursor-pointer"
          />
          <span>{formatTime(durationSec)}</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            onClick={() => {
              setCurrentTimeSec(0);
              if (audioRef.current) audioRef.current.currentTime = 0;
            }}
            className="p-2 text-slate-400 hover:text-white transition"
            title="Reset to Start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 transition transform active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <button
            onClick={() => {
              if (audioRef.current) {
                audioRef.current.muted = !isMuted;
                setIsMuted(!isMuted);
              }
            }}
            className="p-2 text-slate-400 hover:text-white transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

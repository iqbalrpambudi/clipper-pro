"use client";

import React, { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  ArrowRight,
  Clock,
  Image as ImageIcon,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem } from "@/types";
import { Button, Badge } from "@/components/ui";

interface StoryboardTimelineTabProps {
  project: Project & {
    narration?: any;
    audio?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardTimelineTab({ project }: StoryboardTimelineTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const narration = project.narration;
  const audio = (project as any).audio || (project as any).audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const segments: any[] = narration?.segments || [];

  // Playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StoryboardItem> }) =>
      api.updateStoryboardItem(project.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Efek motion gambar diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui motion", "error");
    },
  });

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || audio?.duration || 0);
    }
  };

  const handleSeek = (timeSecs: number) => {
    setCurrentTime(timeSecs);
    if (audioRef.current) {
      audioRef.current.currentTime = timeSecs;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Find active storyboard item for currentTime
  const activeItem =
    items.find((it) => currentTime >= it.start_time && currentTime < it.end_time) ||
    items[0] ||
    null;

  // Find active narration segment
  const activeSegment =
    segments.find((seg) => {
      const start = (seg.start_ms || 0) / 1000;
      const end = (seg.end_ms || 0) / 1000;
      return currentTime >= start && currentTime <= end;
    }) || null;

  // Compute CSS animation class for active motion effect
  const getMotionAnimationClass = (effect: string) => {
    switch (effect) {
      case "zoom_in":
        return "scale-110 transition-transform duration-[6000ms] ease-out";
      case "zoom_out":
        return "scale-100 scale-x-105 transition-transform duration-[6000ms] ease-out";
      case "pan_left":
        return "translate-x-2 scale-105 transition-transform duration-[6000ms] ease-out";
      case "pan_right":
        return "-translate-x-2 scale-105 transition-transform duration-[6000ms] ease-out";
      default:
        return "scale-100 transition-none";
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 4 dari 5
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Timeline & Motion Sync
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Preview Video 16:9 & Penataan Motion Ken Burns
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tonton simulasi preview video landscape 16:9 dengan sinkronisasi gambar dan narasi suara secara real-time sebelum proses render final.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("storyboard_images")}
            className="border-[#2E2E2E] text-xs"
          >
            Kembali ke Ilustrasi
          </Button>

          <Button
            onClick={() => setActiveTab("storyboard_render")}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
          >
            <span>Lanjut ke Render & Export</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Hidden Audio Element */}
      {audio && (
        <audio
          ref={audioRef}
          src={audio.audio_url || audio.file_url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Main Preview Player & Active Scene Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 16:9 Landscape Video Player Screen (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="relative aspect-video rounded-2xl bg-black border border-[#2E2E2E] overflow-hidden shadow-2xl flex items-center justify-center">
            {activeItem && activeItem.image_url ? (
              <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
                <img
                  key={activeItem.id}
                  src={activeItem.image_url}
                  alt={activeItem.image_prompt}
                  className={`w-full h-full object-cover origin-center ${
                    isPlaying ? getMotionAnimationClass(activeItem.motion_effect) : "scale-100"
                  }`}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-slate-500">
                <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                <span className="text-xs font-mono">
                  {items.length === 0 ? "Belum ada gambar" : "Gambar sedang diproses"}
                </span>
              </div>
            )}

            {/* Subtitle / Narration Lower-Third Overlay */}
            {activeSegment && (
              <div className="absolute bottom-5 inset-x-6 text-center z-10 pointer-events-none">
                <div className="inline-block bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
                  <p className="text-sm font-medium text-white drop-shadow-md leading-relaxed">
                    {activeSegment.text}
                  </p>
                </div>
              </div>
            )}

            {/* Top Left Badge: Timestamp & Motion */}
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white font-bold border border-white/10">
                {formatTime(currentTime)} / {formatTime(duration || audio?.duration || 0)}
              </span>
              {activeItem && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-600/80 backdrop-blur-md text-violet-100 font-semibold border border-violet-400/30">
                  Motion: {activeItem.motion_effect}
                </span>
              )}
            </div>
          </div>

          {/* Player Controls Bar */}
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
                  className="p-2 rounded-lg bg-surface hover:bg-white/10 text-slate-300"
                  title="Mundur 5 detik"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="p-2 rounded-lg bg-surface hover:bg-white/10 text-slate-300"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <span className="text-xs font-mono font-bold text-violet-400">
                  {formatTime(currentTime)} / {formatTime(duration || audio?.duration || 0)}
                </span>
              </div>
            </div>

            {/* Seekbar */}
            <input
              type="range"
              min={0}
              max={duration || audio?.duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full accent-violet-500 cursor-pointer h-2 bg-[#2A2A2A] rounded-lg"
            />
          </div>
        </div>

        {/* Right Column: Active Scene & Motion Inspector (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-violet-400" />
              <span>Inspector Adegan Aktif</span>
            </h3>
            {activeItem && (
              <span className="text-[11px] font-mono text-slate-400">
                Detik {activeItem.start_time}s – {activeItem.end_time}s
              </span>
            )}
          </div>

          {activeItem ? (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
                  Naskah Narasi Suara:
                </span>
                <p className="text-xs text-slate-200 bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
                  &ldquo;{activeItem.script_text}&rdquo;
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
                  Prompt Gambar Ilustrasi:
                </span>
                <p className="text-xs text-slate-300 font-mono bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
                  {activeItem.image_prompt}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Efek Gerakan Ken Burns pada Adegan Ini:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "zoom_in", label: "Slow Zoom In" },
                    { id: "zoom_out", label: "Slow Zoom Out" },
                    { id: "pan_left", label: "Pan Left" },
                    { id: "pan_right", label: "Pan Right" },
                    { id: "static", label: "Statis (Diam)" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        updateItemMutation.mutate({
                          id: activeItem.id,
                          data: { motion_effect: m.id as any },
                        })
                      }
                      className={`p-2 rounded-xl text-xs font-medium border text-center transition ${
                        activeItem.motion_effect === m.id
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                          : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              Pilih titik timeline untuk melihat detail adegan.
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Storyboard Track List */}
      <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Urutan Timeline Adegan Gambar ({items.length} Klip)
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            Klik kartu untuk melompat ke detik tersebut
          </span>
        </div>

        <div className="flex items-stretch gap-3 overflow-x-auto pb-4 pt-1">
          {items.map((item, idx) => {
            const isCurrent = currentTime >= item.start_time && currentTime < item.end_time;

            return (
              <div
                key={item.id}
                onClick={() => handleSeek(item.start_time)}
                className={`min-w-[200px] max-w-[220px] rounded-xl border p-2.5 cursor-pointer transition flex flex-col justify-between shrink-0 ${
                  isCurrent
                    ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/30"
                    : "border-[#2E2E2E] bg-[#141414] hover:border-violet-500/40"
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video rounded-lg bg-black overflow-hidden mb-2 border border-[#262626]">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.image_prompt}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-600">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}

                  <span className="absolute top-1 left-1 text-[9px] font-mono px-1 py-0.5 rounded bg-black/80 text-white font-bold">
                    #{idx + 1}
                  </span>
                </div>

                {/* Timing Badge */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="font-bold text-violet-300">
                      {formatTime(item.start_time)} - {formatTime(item.end_time)}
                    </span>
                    <span>{item.duration > 0 ? `${item.duration}s` : ""}</span>
                  </div>
                  <p className="text-[10px] text-slate-300 line-clamp-2 leading-snug">
                    {item.script_text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

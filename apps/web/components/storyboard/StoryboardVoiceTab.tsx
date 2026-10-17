"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Volume2,
  Play,
  Pause,
  Loader2,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Mic,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem } from "@/types";
import { Button, Badge } from "@/components/ui";

interface StoryboardVoiceTabProps {
  project: Project & {
    narration?: any;
    audio?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardVoiceTab({ project }: StoryboardVoiceTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const narration = project.narration;
  const audio = (project as any).audio || (project as any).audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const segments: any[] = narration?.segments || [];

  const [provider, setProvider] = useState<string>("gemini");
  const [voice, setVoice] = useState<string>("Puck");
  const [rate, setRate] = useState<number>(0);
  const [pitch, setPitch] = useState<number>(0);
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(true);

  // Fetch active config to sync fallback setting
  const { data: appConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  useEffect(() => {
    if (appConfig?.tts_fallback_enabled !== undefined) {
      setFallbackEnabled(appConfig.tts_fallback_enabled);
    }
  }, [appConfig]);

  // Audio Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const ttsMutation = useMutation({
    mutationFn: () =>
      api.generateTTS(project.id, {
        provider,
        voice,
        rate: rate >= 0 ? `+${rate}%` : `${rate}%`,
        pitch: pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`,
        fallback_enabled: fallbackEnabled,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Suara narasi berhasil dibuat dan disinkronkan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membuat audio suara narasi", "error");
    },
  });

  const syncTimingMutation = useMutation({
    mutationFn: () => api.syncStoryboardTiming(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Timing gambar storyboard berhasil disinkronkan dengan Whisper!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal sinkronisasi timing", "error");
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

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Check if items have timing synced
  const hasTimingSynced = items.some((it) => it.end_time > 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 2 dari 5
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Sintesis Vokal & Audio Alignment
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Voiceover TTS & Sinkronisasi Narasi Audio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pilih model vokal AI untuk membaca naskah video Anda. Mesin Whisper akan memetakan durasi kata demi kata ke tiap gambar ilustrasi.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("storyboard_script")}
            className="border-[#2E2E2E] text-xs"
          >
            Kembali ke Naskah
          </Button>

          {audio && (
            <Button
              onClick={() => setActiveTab("storyboard_images")}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
            >
              <span>Lanjut ke Ilustrasi AI</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Voiceover Controls (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Pengaturan Suara Narasi</h3>
              <p className="text-[11px] text-muted-foreground">Pilih provider dan karakter suara</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Provider */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Provider TTS
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProvider("gemini");
                    setVoice("Puck");
                  }}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    provider === "gemini"
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-xs font-bold">Gemini TTS</div>
                  <div className="text-[10px] text-muted-foreground">Natural Studio Voice</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProvider("edge");
                    setVoice("id-ID-ArdiNeural");
                  }}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    provider === "edge"
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="text-xs font-bold">Edge-TTS</div>
                  <div className="text-[10px] text-muted-foreground">Indonesian Neural (Free)</div>
                </button>
              </div>
            </div>

            {/* Voice Characters */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Karakter Vokal
              </label>
              {provider === "gemini" ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "Puck", name: "Puck", gender: "Pria (Santai/Bercerita)" },
                    { id: "Charon", name: "Charon", gender: "Pria (Dalam/Misteri)" },
                    { id: "Aoede", name: "Aoede", gender: "Wanita (Lembut/Edukasi)" },
                    { id: "Kore", name: "Kore", gender: "Wanita (Hangat/Ceria)" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoice(v.id)}
                      className={`p-2 rounded-lg border text-left transition ${
                        voice === v.id
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                          : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-bold">{v.name}</div>
                      <div className="text-[10px] text-muted-foreground">{v.gender}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "id-ID-ArdiNeural", name: "Ardi (Pria)", desc: "Formal & Dokumenter" },
                    { id: "id-ID-GadisNeural", name: "Gadis (Wanita)", desc: "Jernih & Ramah" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVoice(v.id)}
                      className={`p-2 rounded-lg border text-left transition ${
                        voice === v.id
                          ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                          : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="text-xs font-bold">{v.name}</div>
                      <div className="text-[10px] text-muted-foreground">{v.desc}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Speed & Pitch Slider */}
            <div className="space-y-3 pt-2">
              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="text-slate-300 font-semibold">Kecepatan Bicara</span>
                  <span className="font-mono text-violet-400">{rate >= 0 ? `+${rate}%` : `${rate}%`}</span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={30}
                  step={5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="text-slate-300 font-semibold">Pitch Nada</span>
                  <span className="font-mono text-violet-400">{pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`}</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={15}
                  step={3}
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg"
                />
              </div>
            </div>

            {/* Fallback Checkbox */}
            <div className="pt-2 border-t border-[#2E2E2E]">
              <label className="flex items-start gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-[#2E2E2E] bg-[#141414] text-violet-500 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                    Fallback otomatis ke Edge-TTS saat error/kuota habis
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                    Jika tidak dicentang, proses berhenti dengan error dan audio terpotong pada bagian yang gagal.
                  </p>
                </div>
              </label>
            </div>

            <Button
              type="button"
              onClick={() => ttsMutation.mutate()}
              disabled={ttsMutation.isPending || segments.length === 0}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-lg shadow-violet-500/20 gap-2 mt-2"
            >
              {ttsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Mensintesis Audio & Alignment (15–30s)...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>{audio ? "Generate Ulang Suara TTS" : "Generate Suara Narasi (TTS)"}</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Audio Playback & Alignment Status (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {!audio ? (
            <div className="rounded-2xl border border-dashed border-[#2E2E2E] bg-[#181818]/60 p-12 text-center">
              <Volume2 className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1.5">Audio Belum Dibuat</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4 leading-relaxed">
                Pilih karakter vokal di panel sebelah kiri lalu klik tombol <strong>Generate Suara Narasi</strong>. Sistem akan mensintesis audio lengkap dan memetakan waktu kemunculan tiap gambar.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-6 shadow-xl">
              {/* Audio Player Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#171717] to-[#141414] border border-[#2E2E2E] space-y-4">
                <audio
                  ref={audioRef}
                  src={audio.audio_url || audio.file_url}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="w-12 h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 transition"
                    >
                      {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Audio Narasi Storyboard</span>
                        <Badge variant="supabase" className="text-[10px] uppercase font-mono">
                          {audio.provider} • {audio.voice}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Durasi Total: {formatTime(duration || audio.duration || 0)}
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-violet-400">
                    {formatTime(currentTime)} / {formatTime(duration || audio.duration || 0)}
                  </span>
                </div>

                {/* Seekbar */}
                <input
                  type="range"
                  min={0}
                  max={duration || audio.duration || 1}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full accent-violet-500 cursor-pointer h-2 bg-[#262626] rounded-lg"
                />
              </div>

              {/* Timing Alignment Status */}
              <div className="p-4 rounded-xl border border-[#2E2E2E] bg-[#141414] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white">
                      Status Sinkronisasi Waktu (Whisper Alignment)
                    </h4>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncTimingMutation.mutate()}
                    disabled={syncTimingMutation.isPending}
                    className="border-[#2E2E2E] text-[11px] gap-1.5 h-7"
                  >
                    {syncTimingMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    <span>Sinkronkan Ulang</span>
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {hasTimingSynced
                    ? `Waktu naskah berhasil disinkronkan. Sebanyak ${items.length} slot ilustrasi gambar telah memiliki durasi detik yang presisi sesuai ucapan narator.`
                    : "Klik tombol sinkronkan untuk memetakan timestamp narasi audio ke setiap slot gambar."}
                </p>
              </div>

              {/* Segments Live Highlights */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Naskah Berjalan Sesuai Audio:
                </h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {segments.map((seg: any, idx: number) => {
                    const segStart = (seg.start_ms || 0) / 1000;
                    const segEnd = (seg.end_ms || 0) / 1000;
                    const isActive = currentTime >= segStart && currentTime <= segEnd;

                    return (
                      <div
                        key={seg.id || idx}
                        onClick={() => {
                          if (audioRef.current && segStart > 0) {
                            audioRef.current.currentTime = segStart;
                          }
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition text-xs leading-relaxed ${
                          isActive
                            ? "border-violet-500 bg-violet-500/10 text-white font-medium shadow-md shadow-violet-500/5 ring-1 ring-violet-500/30"
                            : "border-[#2E2E2E] bg-[#141414] text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                          <span className="font-mono font-bold text-violet-300">
                            Segmen #{idx + 1}
                          </span>
                          <span className="font-mono">
                            {formatTime(segStart)} - {formatTime(segEnd)}
                          </span>
                        </div>
                        <p>{seg.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Action */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setActiveTab("storyboard_images")}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2 font-semibold text-xs shadow-lg shadow-violet-500/20"
                >
                  <span>Langkah Berikutnya: Studio Ilustrasi AI ➔</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

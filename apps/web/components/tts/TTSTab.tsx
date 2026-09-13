"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sparkles,
  DollarSign,
  Clock,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sliders,
  AlignLeft,
  RotateCcw,
  RotateCw,
  Activity,
  Mic,
  Music,
  Check,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Narration, AudioTrack, VoiceInfo } from "@/types";

interface TTSTabProps {
  project: Project & {
    narration?: Narration | null;
    audio?: AudioTrack | null;
  };
}

function formatAudioTime(secs: number): string {
  if (isNaN(secs) || secs < 0) return "00:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TTSTab({ project }: TTSTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab, activeTask } = useStudioStore();

  const [selectedVoice, setSelectedVoice] = useState("Puck");
  const [provider, setProvider] = useState("gemini");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");

  // Sample voice audio state
  const [sampleAudioPlaying, setSampleAudioPlaying] = useState<string | null>(null);
  const [loadingSampleVoiceId, setLoadingSampleVoiceId] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  // Main custom audio player state
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(project.audio?.duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Live Progress State for TTS Generation (driven by SSE activeTask)
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(
    project.audio?.status === "generating"
  );
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStepText, setGenerationStepText] = useState("");
  const [generationElapsed, setGenerationElapsed] = useState(0);

  useEffect(() => {
    return () => {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
      }
      if (mainAudioRef.current) {
        mainAudioRef.current.pause();
      }
    };
  }, []);

  // Listen to real-time TTS task events from worker
  useEffect(() => {
    if (activeTask && activeTask.task_type === "tts_align") {
      if (activeTask.status === "progress") {
        setIsGeneratingTTS(true);
        setGenerationProgress(activeTask.progress);
        setGenerationStepText(activeTask.message);
      } else if (activeTask.status === "success") {
        setGenerationProgress(100);
        setGenerationStepText(activeTask.message || "Audio narasi & timeline selesai disiapkan!");
        const timeout = setTimeout(() => {
          setIsGeneratingTTS(false);
          setGenerationProgress(0);
        }, 1500);
        return () => clearTimeout(timeout);
      } else if (activeTask.status === "error") {
        setGenerationProgress(0);
        setGenerationStepText(activeTask.error || activeTask.message || "Gagal membuat audio narasi");
        const timeout = setTimeout(() => {
          setIsGeneratingTTS(false);
        }, 4000);
        return () => clearTimeout(timeout);
      }
    }
  }, [activeTask]);

  // Elapsed second counter during active generation
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isGeneratingTTS) {
      timer = setInterval(() => {
        setGenerationElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setGenerationElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGeneratingTTS]);

  // Detect completion when project.audio changes to ready
  useEffect(() => {
    if (isGeneratingTTS && project.audio && (project.audio.status === "ready" || project.audio.audio_url)) {
      setGenerationProgress(100);
      setGenerationStepText("Audio narasi & forced alignment berhasil dibuat!");
      const timeout = setTimeout(() => {
        setIsGeneratingTTS(false);
        setGenerationProgress(0);
        setGenerationElapsed(0);
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [project.audio, isGeneratingTTS]);

  useEffect(() => {
    if (project.audio?.duration) {
      setAudioDuration(project.audio.duration);
    }
    if (project.audio?.provider) {
      setProvider(project.audio.provider);
    }
    if (project.audio?.voice) {
      setSelectedVoice(project.audio.voice);
    }
    if (project.audio?.rate) {
      setRate(project.audio.rate);
    }
    if (project.audio?.pitch) {
      setPitch(project.audio.pitch);
    }
  }, [project.audio]);

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: api.getVoices,
  });

  const narrationText = project.narration?.raw_text || "";

  const { data: costEstimate } = useQuery({
    queryKey: ["tts-cost", narrationText, provider],
    queryFn: () => api.estimateCost(narrationText, provider),
    enabled: !!narrationText,
  });

  const generateTTSMutation = useMutation({
    mutationFn: () => {
      setIsGeneratingTTS(true);
      setGenerationProgress(10);
      setGenerationElapsed(0);
      setGenerationStepText("Memulai sintesis audio AI...");
      return api.generateTTS(project.id, {
        provider,
        voice: selectedVoice,
        rate,
        pitch,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: any) => {
      setIsGeneratingTTS(false);
      setGenerationProgress(0);
      showToast(err.message || "Gagal generate audio TTS", "error");
    },
  });

  const playVoiceSample = (voiceId: string) => {
    if (sampleAudioPlaying === voiceId) {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
      }
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
      return;
    }

    if (!sampleAudioRef.current) {
      sampleAudioRef.current = new Audio();
    }

    const audio = sampleAudioRef.current;
    audio.pause();
    setSampleAudioPlaying(voiceId);
    setLoadingSampleVoiceId(voiceId);

    const sampleUrl = `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}`;
    audio.src = sampleUrl;
    audio.oncanplay = () => {
      setLoadingSampleVoiceId(null);
    };
    audio.onended = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
    };
    audio.onerror = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
      showToast("Gagal memutar sampel audio untuk " + voiceId, "error");
    };

    audio.play().catch((e) => {
      console.warn("Audio play blocked or failed:", e);
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
    });
  };

  // Main player controls
  const toggleMainPlay = () => {
    if (!mainAudioRef.current) return;
    if (isPlaying) {
      mainAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      mainAudioRef.current.play().catch((e) => {
        console.warn("Playback error:", e);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (timeSec: number) => {
    if (!mainAudioRef.current) return;
    const clamped = Math.max(0, Math.min(timeSec, audioDuration));
    mainAudioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  };

  const handleSkip = (seconds: number) => {
    if (!mainAudioRef.current) return;
    handleSeek(mainAudioRef.current.currentTime + seconds);
  };

  const toggleMute = () => {
    if (!mainAudioRef.current) return;
    mainAudioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (newVol: number) => {
    if (!mainAudioRef.current) return;
    mainAudioRef.current.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && isMuted) {
      mainAudioRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const filteredVoices = voices.filter((v) =>
    provider === "gemini" ? v.provider === "gemini" : v.provider === "edge"
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ========================================================================= */}
      {/* KOLOM KIRI (5/12): PEMILIHAN KARAKTER SUARA & PARAMETER TUNING           */}
      {/* ========================================================================= */}
      <div className="lg:col-span-5 space-y-4">
        {/* Voice Selection Card */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Pilih Karakter Suara
              </h3>
            </div>

            {/* Provider Switcher */}
            <div className="flex items-center gap-1 p-0.5 bg-surface rounded-lg border border-surface-border text-xs">
              <button
                type="button"
                onClick={() => {
                  setProvider("gemini");
                  setSelectedVoice("Puck");
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                  provider === "gemini"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Gemini 2.5
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider("edge");
                  setSelectedVoice("id-ID-GadisNeural");
                }}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                  provider === "edge"
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Edge Natural
              </button>
            </div>
          </div>

          {/* Voice Cards List (scrollable) */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredVoices.map((v) => {
              const isSelected = selectedVoice === v.id;
              const isPlayingSample = sampleAudioPlaying === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-brand-500 bg-brand-500/15 shadow-md shadow-brand-500/10 ring-1 ring-brand-500/40"
                      : "border-surface-border bg-surface/40 hover:bg-surface hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-bold text-white truncate min-w-0" title={v.name}>{v.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-surface-border text-slate-400 shrink-0">
                        {v.gender}
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed mb-2.5 line-clamp-2">
                    {v.description}
                  </p>

                  <div className="pt-2 border-t border-surface-border/50 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoiceSample(v.id);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                        isPlayingSample
                          ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                          : "bg-surface hover:bg-white/10 text-brand-400"
                      }`}
                    >
                      {loadingSampleVoiceId === v.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
                      ) : isPlayingSample ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                      <span>
                        {loadingSampleVoiceId === v.id
                          ? "Memuat..."
                          : isPlayingSample
                          ? "Stop Sample"
                          : "Dengar Sampel"}
                      </span>
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono">ID: {v.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audio Tuning Parameters */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent-yellow" />
              <h4 className="text-sm font-bold text-white">Parameter Suara & Biaya</h4>
            </div>

            {costEstimate && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono font-semibold">
                Est: ${costEstimate.estimated_cost_usd} USD
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Kecepatan (Rate)
              </label>
              <select
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="-10%">Lambat (-10%)</option>
                <option value="+0%">Normal (+0%)</option>
                <option value="+10%">Cepat (+10%)</option>
                <option value="+20%">Sangat Cepat (+20%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tinggi Nada (Pitch)
              </label>
              <select
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="-5Hz">Lebih Berat (-5Hz)</option>
                <option value="+0Hz">Standar (+0Hz)</option>
                <option value="+5Hz">Lebih Cerah (+5Hz)</option>
              </select>
            </div>
          </div>

          {/* Live Progress Card for TTS */}
          {isGeneratingTTS && (
            <div className="p-3.5 rounded-xl bg-surface border border-brand-500/40 space-y-2 animate-fadeIn shadow-lg shadow-brand-500/5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-brand-300 font-semibold truncate max-w-[240px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400 shrink-0" />
                  <span className="truncate">{generationStepText || "Memproses audio TTS..."}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 shrink-0">
                  <span>
                    {Math.floor(generationElapsed / 60)}:
                    {String(generationElapsed % 60).padStart(2, "0")}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 font-bold">
                    {Math.round(generationProgress)}%
                  </span>
                </div>
              </div>
              <div className="w-full bg-surface-card rounded-full h-1.5 overflow-hidden border border-surface-border">
                <div
                  className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, generationProgress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={() => generateTTSMutation.mutate()}
            disabled={generateTTSMutation.isPending || isGeneratingTTS || !narrationText}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-brand-500/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingTTS ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-accent-yellow" />
                <span>Generate Suara & Word Alignment</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KOLOM KANAN (7/12): MODERN CUSTOM AUDIO PLAYER & WORD ALIGNMENT          */}
      {/* ========================================================================= */}
      <div className="lg:col-span-7 space-y-4">
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-5">
          {/* Header Panel Kanan */}
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Audio Narasi & Forced Alignment
              </h3>
            </div>

            {project.audio && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                {formatAudioTime(audioDuration)} • {project.audio.voice}
              </span>
            )}
          </div>

          {project.audio && project.audio.audio_url ? (
            <div className="space-y-5">
              {/* Hidden Native Audio Element */}
              <audio
                ref={mainAudioRef}
                src={project.audio.audio_url}
                onTimeUpdate={() => {
                  if (mainAudioRef.current) {
                    setCurrentTime(mainAudioRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (mainAudioRef.current && !isNaN(mainAudioRef.current.duration)) {
                    setAudioDuration(mainAudioRef.current.duration);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
              />

              {/* MODERN SLEEK AUDIO PLAYER CARD */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-surface to-surface-card border border-surface-border shadow-xl space-y-4">
                {/* Top Info with Visualizer Mockup */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shadow-inner">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        Narasi: {project.name}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Voice: <strong className="text-brand-300">{project.audio.voice}</strong> ({project.audio.provider.toUpperCase()}) • Kecepatan: {project.audio.rate || "+0%"}
                      </p>
                    </div>
                  </div>

                  {/* Equalizer animation when playing */}
                  <div className="flex items-end gap-0.5 h-6">
                    {[40, 70, 30, 90, 60, 100, 45, 80, 50].map((h, i) => (
                      <div
                        key={i}
                        className={`w-1 rounded-full bg-brand-400 transition-all duration-300 ${
                          isPlaying ? "animate-pulse" : "opacity-30"
                        }`}
                        style={{
                          height: isPlaying ? `${Math.max(20, (h * ((currentTime * 3 + i) % 10)) / 10)}%` : "20%",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Progress / Seekbar */}
                <div className="space-y-1.5">
                  <div
                    className="relative w-full h-3 bg-black/40 rounded-full cursor-pointer overflow-hidden group border border-surface-border/80"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const pct = Math.max(0, Math.min(1, clickX / rect.width));
                      handleSeek(pct * audioDuration);
                    }}
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 rounded-full transition-all"
                      style={{
                        width: `${audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>{formatAudioTime(currentTime)}</span>
                    <span>{formatAudioTime(audioDuration)}</span>
                  </div>
                </div>

                {/* Player Controls Bar */}
                <div className="flex items-center justify-between pt-1">
                  {/* Skip Buttons & Main Play */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSkip(-5)}
                      className="p-2 rounded-xl bg-surface hover:bg-white/10 text-slate-300 hover:text-white transition"
                      title="Mundur 5 detik"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={toggleMainPlay}
                      className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-400 hover:scale-105 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 transition transform active:scale-95"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkip(5)}
                      className="p-2 rounded-xl bg-surface hover:bg-white/10 text-slate-300 hover:text-white transition"
                      title="Maju 5 detik"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="text-slate-400 hover:text-white transition"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
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
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20 h-1.5 bg-black/40 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* WORD-LEVEL FORCED ALIGNMENT & KARAOKE BREAKDOWN */}
              {project.narration?.segments && project.narration.segments.length > 0 && (
                <div className="pt-2 border-t border-surface-border space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <AlignLeft className="w-3.5 h-3.5 text-accent-yellow" />
                      <span>
                        Hasil Word-Level Alignment ({project.narration.segments.length} Segmen)
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Klik kata untuk melompat ke audio
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                    {project.narration.segments.map((seg, i) => {
                      const isSegActive =
                        currentTime * 1000 >= seg.start_ms && currentTime * 1000 <= seg.end_ms;
                      return (
                        <div
                          key={seg.id || i}
                          className={`p-3 rounded-xl border transition-all ${
                            isSegActive
                              ? "bg-brand-500/15 border-brand-500/50 shadow-md shadow-brand-500/10 ring-1 ring-brand-500/30"
                              : "bg-surface/60 border-surface-border/70 hover:border-slate-600"
                          }`}
                        >
                          <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1.5">
                            <span className="text-brand-300 font-bold">Segmen #{i + 1}</span>
                            <span>
                              {formatAudioTime(seg.start_ms / 1000)} — {formatAudioTime(seg.end_ms / 1000)}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {seg.words && seg.words.length > 0 ? (
                              seg.words.map((w, wi) => {
                                const isWordActive =
                                  currentTime * 1000 >= w.start_ms &&
                                  currentTime * 1000 <= w.end_ms;
                                return (
                                  <button
                                    key={wi}
                                    type="button"
                                    onClick={() => handleSeek(w.start_ms / 1000)}
                                    className={`px-2 py-0.5 rounded-md text-xs transition font-sans cursor-pointer ${
                                      isWordActive
                                        ? "bg-brand-500 text-white font-bold scale-105 shadow-sm shadow-brand-500/40"
                                        : "bg-surface-card border border-surface-border text-slate-300 hover:text-white hover:border-brand-500/40"
                                    }`}
                                    title={`${w.start_ms}ms - ${w.end_ms}ms`}
                                  >
                                    {w.word}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-slate-300">{seg.text}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Next Tab Button */}
              <div className="pt-4 border-t border-surface-border flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Audio siap! Lanjutkan ke perakitan Timeline & Subtitle.
                </span>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition transform active:scale-95 cursor-pointer"
                >
                  <span>Lanjut ke Timeline & Subtitle</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Empty State saat belum ada audio */
            <div className="py-16 px-6 text-center rounded-xl bg-surface/30 border border-dashed border-surface-border flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Volume2 className="w-7 h-7" />
              </div>
              <div className="max-w-sm space-y-1">
                <h4 className="text-sm font-bold text-white">Audio Narasi Belum Dibuat</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pilih karakter suara narator di kolom kiri, sesuaikan kecepatan dan nada, lalu klik{" "}
                  <strong>Generate Suara & Word Alignment</strong>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Volume2,
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

export function TTSTab({ project }: TTSTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab, activeTask } = useStudioStore();

  const [selectedVoice, setSelectedVoice] = useState("Puck");
  const [provider, setProvider] = useState("gemini");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");
  const [sampleAudioPlaying, setSampleAudioPlaying] = useState<string | null>(null);
  const [loadingSampleVoiceId, setLoadingSampleVoiceId] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

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

  return (
    <div className="space-y-8">
      {/* Voice Selection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-brand-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              1. Pilih Karakter Suara Narator
            </h3>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Provider:</span>
            <button
              onClick={() => {
                setProvider("gemini");
                setSelectedVoice("Puck");
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                provider === "gemini"
                  ? "bg-brand-500/20 border-brand-500 text-brand-300"
                  : "bg-surface border-surface-border text-slate-400"
              }`}
            >
              Gemini 2.5 Flash TTS
            </button>
            <button
              onClick={() => {
                setProvider("edge");
                setSelectedVoice("id-ID-GadisNeural");
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                provider === "edge"
                  ? "bg-brand-500/20 border-brand-500 text-brand-300"
                  : "bg-surface border-surface-border text-slate-400"
              }`}
            >
              Edge Natural (Free)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {voices
            .filter((v) => (provider === "gemini" ? v.provider === "gemini" : v.provider === "edge"))
            .map((v) => {
              const isSelected = selectedVoice === v.id;
              const isPlayingSample = sampleAudioPlaying === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10"
                      : "border-surface-border hover:border-slate-500"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{v.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-surface-border text-slate-400">
                          {v.gender}
                        </span>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                      {v.description}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-surface-border/50 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoiceSample(v.id);
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
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
                          ? "Stop"
                          : "Dengar Sample"}
                      </span>
                    </button>
                    <span className="text-[10px] text-slate-500 font-mono">ID: {v.id}</span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Speed, Pitch & Cost Estimator */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-yellow" />
            <h4 className="text-sm font-bold text-white">2. Parameter Audio & Estimasi Biaya</h4>
          </div>

          {costEstimate && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">
                {costEstimate.char_count} Karakter (~{costEstimate.estimated_duration_sec}s)
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold font-mono">
                Est. Biaya: ${costEstimate.estimated_cost_usd} USD
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kecepatan Bicara (Rate)
            </label>
            <select
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
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
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="-5Hz">Lebih Berat (-5Hz)</option>
              <option value="+0Hz">Standar (+0Hz)</option>
              <option value="+5Hz">Lebih Cerah (+5Hz)</option>
            </select>
          </div>
        </div>

        {/* Live Progress Card for TTS */}
        {isGeneratingTTS && (
          <div className="p-4 rounded-xl bg-surface border border-brand-500/40 space-y-2.5 animate-fadeIn shadow-lg shadow-brand-500/5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-brand-300 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400 shrink-0" />
                <span className="truncate max-w-sm sm:max-w-md">{generationStepText || "Sedang memproses audio..."}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <span>{Math.floor(generationElapsed / 60)}:{String(generationElapsed % 60).padStart(2, "0")}</span>
                <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30">
                  {Math.round(generationProgress)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
              <div
                className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: Math.max(5, generationProgress) + "%" }}
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-surface-border flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {isGeneratingTTS
              ? "Sedang mensintesis audio narasi secara otomatis..."
              : "Audio & word timestamp akan dibuat otomatis saat tombol diklik."}
          </span>
          <button
            onClick={() => generateTTSMutation.mutate()}
            disabled={generateTTSMutation.isPending || isGeneratingTTS || !narrationText}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-sm shadow-xl shadow-brand-500/25 flex items-center gap-2 transition transform active:scale-95 disabled:opacity-50"
          >
            {isGeneratingTTS ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Suara & Jalankan Alignment</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Audio Track Result */}
      {project.audio && (
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">Audio Narasi Siap</h4>
            </div>

            <span className="text-xs text-slate-400">
              Durasi: {Math.round(project.audio.duration)} detik • Voice: {project.audio.voice}
            </span>
          </div>

          {project.audio.audio_url && (
            <div className="p-3 bg-surface rounded-xl border border-surface-border">
              <audio controls className="w-full h-10">
                <source src={project.audio.audio_url} type="audio/mpeg" />
                Browser Anda tidak mendukung elemen audio.
              </audio>
            </div>
          )}

          {/* Word-level breakdown indicator */}
          {project.narration?.segments && (
            <div className="pt-3 border-t border-surface-border">
              <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlignLeft className="w-3.5 h-3.5 text-accent-yellow" />
                Hasil Forced Word-Level Alignment ({project.narration.segments.length} Segmen Kalimat)
              </h5>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {project.narration.segments.map((seg, i) => (
                  <div
                    key={seg.id || i}
                    className="p-2.5 rounded-lg bg-surface border border-surface-border text-xs"
                  >
                    <div className="flex justify-between font-mono text-[10px] text-slate-400 mb-1">
                      <span>#{i + 1}</span>
                      <span>
                        {seg.start_ms}ms — {seg.end_ms}ms
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {seg.words && seg.words.length > 0 ? (
                        seg.words.map((w, wi) => (
                          <span
                            key={wi}
                            className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-[11px] text-brand-300"
                            title={`${w.start_ms}ms - ${w.end_ms}ms`}
                          >
                            {w.word}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400">{seg.text}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button
              onClick={() => setActiveTab("timeline")}
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <span>Lanjut ke Timeline Editor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

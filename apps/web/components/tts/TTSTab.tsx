"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Sliders,
  AlignLeft,
  RotateCcw,
  RotateCw,
  Mic,
  Music,
  Wand2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Narration, AudioTrack } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { EmptyState } from "@/components/fragments/EmptyState";

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
        const errMsg = activeTask.error || activeTask.message || "Gagal membuat audio narasi";
        setGenerationStepText(errMsg);
        showToast(errMsg, "error");
        const timeout = setTimeout(() => {
          setIsGeneratingTTS(false);
        }, 4000);
        return () => clearTimeout(timeout);
      }
    }
  }, [activeTask, showToast]);

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

  // Sync state only when not actively generating to prevent overwriting user's new voice selection
  useEffect(() => {
    if (project.audio?.duration) {
      setAudioDuration(project.audio.duration);
    }
    if (!isGeneratingTTS) {
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
    }
  }, [project.audio?.id, project.audio?.status, isGeneratingTTS]);

  // Invalidate and reload main audio when audio URL or ID changes
  useEffect(() => {
    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      mainAudioRef.current.load();
    }
  }, [project.audio?.audio_url, project.audio?.id]);

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

  // Realignment & Timing Micro-Adjustment State
  const [offsetMs, setOffsetMs] = useState(0);
  const [isEditTimingMode, setIsEditTimingMode] = useState(false);
  const [editableSegments, setEditableSegments] = useState<any[]>([]);

  useEffect(() => {
    if (project.narration?.segments) {
      setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
    }
  }, [project.narration?.segments]);

  const realignMutation = useMutation({
    mutationFn: (params?: { offset_ms?: number; model_size?: string }) => {
      const targetOffset = params?.offset_ms !== undefined ? params.offset_ms : offsetMs;
      return api.realignTTS(project.id, {
        offset_ms: targetOffset,
        language: "id",
        model_size: params?.model_size || "base",
      });
    },
    onSuccess: (data) => {
      if (data?.segments) {
        setEditableSegments(JSON.parse(JSON.stringify(data.segments)));
      }
      queryClient.setQueryData(["project", project.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          narration: {
            ...old.narration,
            segments: data.segments,
            status: "aligned",
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Word timestamps berhasil diselaraskan ulang via Whisper AI!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal melakukan realignment kata", "error");
    },
  });

  const updateSegmentsMutation = useMutation({
    mutationFn: (segments: any[]) => api.updateNarrationSegments(project.id, segments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Koreksi timing kata berhasil disimpan!", "success");
      setIsEditTimingMode(false);
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan timing kata", "error");
    },
  });

  const handleWordTimingNudge = (segIdx: number, wordIdx: number, deltaMs: number) => {
    setEditableSegments((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const targetWord = next[segIdx]?.words?.[wordIdx];
      if (targetWord) {
        targetWord.start_ms = Math.max(0, (targetWord.start_ms || 0) + deltaMs);
        targetWord.end_ms = Math.max(targetWord.start_ms + 50, (targetWord.end_ms || 0) + deltaMs);
        if (next[segIdx].words?.length > 0) {
          next[segIdx].start_ms = next[segIdx].words[0].start_ms;
          next[segIdx].end_ms = next[segIdx].words[next[segIdx].words.length - 1].end_ms;
        }
      }
      return next;
    });
  };

  const handleGlobalOffsetShift = (deltaMs: number) => {
    const newOffset = offsetMs + deltaMs;
    setOffsetMs(newOffset);
    realignMutation.mutate({ offset_ms: newOffset });
  };

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

    const sampleUrl = `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}&t=${Date.now()}`;
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
      <div className="lg:col-span-5 space-y-5">
        {/* Voice Selection Panel */}
        <SectionPanel
          title="Pilih Karakter Suara"
          description="Pilih narrator voice yang sesuai dengan tema video"
          icon={<Mic className="w-4 h-4 text-primary" />}
          actions={
            <div className="flex items-center gap-1 p-0.5 bg-[#121212] rounded-lg border border-[#2E2E2E]">
              <button
                type="button"
                onClick={() => {
                  setProvider("gemini");
                  setSelectedVoice("Puck");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  provider === "gemini"
                    ? "bg-primary text-black font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
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
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  provider === "edge"
                    ? "bg-primary text-black font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Edge Natural
              </button>
            </div>
          }
        >
          {/* Voice Cards List (scrollable) */}
          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {filteredVoices.map((v) => {
              const isSelected = selectedVoice === v.id;
              const isPlayingSample = sampleAudioPlaying === v.id;
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "border-[#2E2E2E] bg-[#141414] hover:bg-[#1A1A1A] hover:border-[#3E3E3E]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-semibold text-foreground truncate min-w-0" title={v.name}>
                        {v.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-muted-foreground">
                        {v.gender}
                      </Badge>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">
                    {v.description}
                  </p>

                  <div className="pt-2 border-t border-[#2E2E2E]/60 flex items-center justify-between text-xs">
                    <Button
                      type="button"
                      variant={isPlayingSample ? "supabase" : "outline"}
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        playVoiceSample(v.id);
                      }}
                      className="gap-1.5 h-6 text-[10px]"
                    >
                      {loadingSampleVoiceId === v.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isPlayingSample ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                      <span>
                        {loadingSampleVoiceId === v.id
                          ? "Memuat..."
                          : isPlayingSample
                          ? "Berhenti"
                          : "Dengar Sampel"}
                      </span>
                    </Button>
                    <span className="text-[10px] text-muted-foreground font-mono">ID: {v.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionPanel>

        {/* Audio Tuning Parameters Panel */}
        <SectionPanel
          title="Parameter Suara & Estimasi"
          description="Sesuaikan tempo, intonasi, dan pantau estimasi biaya"
          icon={<Sliders className="w-4 h-4 text-primary" />}
          actions={
            costEstimate ? (
              <Badge variant="outline" className="text-primary border-primary/30 font-mono text-[10px]">
                Est: ${costEstimate.estimated_cost_usd} USD
              </Badge>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Kecepatan (Rate)
                </label>
                <select
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs focus:outline-none focus:border-primary transition"
                >
                  <option value="-10%">Lambat (-10%)</option>
                  <option value="+0%">Normal (+0%)</option>
                  <option value="+10%">Cepat (+10%)</option>
                  <option value="+20%">Sangat Cepat (+20%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Tinggi Nada (Pitch)
                </label>
                <select
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs focus:outline-none focus:border-primary transition"
                >
                  <option value="-5Hz">Lebih Berat (-5Hz)</option>
                  <option value="+0Hz">Standar (+0Hz)</option>
                  <option value="+5Hz">Lebih Cerah (+5Hz)</option>
                </select>
              </div>
            </div>

            {/* Live Progress Card for TTS */}
            {isGeneratingTTS && (
              <div className="p-3.5 rounded-xl bg-[#141414] border border-primary/40 space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-primary font-medium truncate max-w-[240px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{generationStepText || "Memproses audio TTS..."}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground shrink-0">
                    <span>
                      {Math.floor(generationElapsed / 60)}:
                      {String(generationElapsed % 60).padStart(2, "0")}
                    </span>
                    <Badge variant="supabase" className="text-[10px] py-0 px-1.5 font-bold">
                      {Math.round(generationProgress)}%
                    </Badge>
                  </div>
                </div>
                <div className="w-full bg-[#1C1C1C] rounded-full h-1.5 overflow-hidden border border-[#2E2E2E]">
                  <div
                    className="bg-primary h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.max(5, generationProgress)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Generate Button */}
            <Button
              variant="supabase"
              size="lg"
              className="w-full h-11 text-xs font-semibold gap-2"
              onClick={() => generateTTSMutation.mutate()}
              disabled={generateTTSMutation.isPending || isGeneratingTTS || !narrationText}
            >
              {isGeneratingTTS ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Suara & Word Alignment</span>
                </>
              )}
            </Button>
          </div>
        </SectionPanel>
      </div>

      {/* ========================================================================= */}
      {/* KOLOM KANAN (7/12): MODERN CUSTOM AUDIO PLAYER & WORD ALIGNMENT          */}
      {/* ========================================================================= */}
      <div className="lg:col-span-7 space-y-5">
        <SectionPanel
          title="Audio Narasi & Forced Alignment"
          description="Review hasil rendering suara dan sinkronisasi kata"
          icon={<Music className="w-4 h-4 text-primary" />}
          badge={
            project.audio ? (
              <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
                {formatAudioTime(audioDuration)} • {project.audio.voice}
              </Badge>
            ) : undefined
          }
        >
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
              <div className="p-4 rounded-xl bg-[#121212] border border-[#2E2E2E] shadow-sm space-y-4">
                {/* Top Info with Visualizer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <Volume2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-foreground">
                        Narasi: {project.name}
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Voice: <strong className="text-foreground">{project.audio.voice}</strong> ({project.audio.provider.toUpperCase()}) • Kecepatan: {project.audio.rate || "+0%"}
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
                          height: isPlaying ? `${Math.max(20, (h * ((currentTime * 3 + i) % 10)) / 10)}%` : "20%",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Progress / Seekbar */}
                <div className="space-y-1.5">
                  <div
                    className="relative w-full h-2.5 bg-[#1E1E1E] rounded-full cursor-pointer overflow-hidden border border-[#2E2E2E]"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const pct = Math.max(0, Math.min(1, clickX / rect.width));
                      handleSeek(pct * audioDuration);
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
                      onClick={() => handleSkip(-5)}
                      title="Mundur 5 detik"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="supabase"
                      size="icon"
                      onClick={toggleMainPlay}
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
                      onClick={() => handleSkip(5)}
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
                      onClick={toggleMute}
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
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20 h-1.5 bg-[#1E1E1E] accent-primary rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* WORD-LEVEL FORCED ALIGNMENT & KARAOKE BREAKDOWN */}
              {project.narration?.segments && project.narration.segments.length > 0 && (
                <div className="pt-2 border-t border-[#2E2E2E] space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5 text-primary" />
                        <span>
                          Hasil Word-Level Alignment ({project.narration.segments.length} Segmen)
                        </span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isEditTimingMode
                          ? "Mode koreksi aktif: sesuaikan timing per kata lalu klik Simpan"
                          : "Klik kata untuk melompat audio • Gunakan Re-align Kata jika timestamp belum presisi"}
                      </p>
                    </div>

                    {/* Action Toolbar: Realignment AI & Offset Controls */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Realignment Trigger Button */}
                      <Button
                        type="button"
                        variant="supabase"
                        size="xs"
                        onClick={() => realignMutation.mutate({ offset_ms: offsetMs })}
                        disabled={realignMutation.isPending || isGeneratingTTS || !project.audio?.audio_url}
                        className="gap-1.5 font-semibold shadow-xs"
                        title="Jalankan ulang forced word alignment dengan Whisper AI"
                      >
                        {realignMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Wand2 className="w-3 h-3" />
                        )}
                        <span>{realignMutation.isPending ? "Re-aligning..." : "Re-align Kata (AI)"}</span>
                      </Button>

                      {/* Global Offset Calibration Box */}
                      <div className="flex items-center bg-[#181818] border border-[#2E2E2E] rounded-md px-1 py-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleGlobalOffsetShift(-50)}
                          disabled={realignMutation.isPending}
                          className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-[#242424] rounded text-[10px] font-mono transition"
                          title="Geser semua kata 50ms lebih awal (-50ms)"
                        >
                          -50ms
                        </button>
                        <span className="px-1.5 text-[10px] font-mono text-primary font-bold border-x border-[#2E2E2E]">
                          {offsetMs >= 0 ? `+${offsetMs}` : offsetMs}ms
                        </span>
                        <button
                          type="button"
                          onClick={() => handleGlobalOffsetShift(50)}
                          disabled={realignMutation.isPending}
                          className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-[#242424] rounded text-[10px] font-mono transition"
                          title="Geser semua kata 50ms lebih lambat (+50ms)"
                        >
                          +50ms
                        </button>
                      </div>

                      {/* Toggle Edit Timing Mode */}
                      <Button
                        type="button"
                        variant={isEditTimingMode ? "supabase" : "outline"}
                        size="xs"
                        onClick={() => {
                          if (!isEditTimingMode && project.narration?.segments) {
                            setEditableSegments(JSON.parse(JSON.stringify(project.narration.segments)));
                          }
                          setIsEditTimingMode(!isEditTimingMode);
                        }}
                        className="h-7 text-[11px] gap-1"
                        title="Koreksi manual per-kata"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>{isEditTimingMode ? "Batal Edit" : "Edit Timing"}</span>
                      </Button>

                      {isEditTimingMode && (
                        <Button
                          type="button"
                          variant="supabase"
                          size="xs"
                          onClick={() => updateSegmentsMutation.mutate(editableSegments)}
                          disabled={updateSegmentsMutation.isPending}
                          className="h-7 text-[11px] gap-1 font-semibold"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{updateSegmentsMutation.isPending ? "Menyimpan..." : "Simpan"}</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Segments & Word Badges Breakdown */}
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {(isEditTimingMode ? editableSegments : project.narration.segments).map((seg, i) => {
                      const isSegActive =
                        currentTime * 1000 >= seg.start_ms && currentTime * 1000 <= seg.end_ms;
                      return (
                        <div
                          key={seg.id || i}
                          className={`p-3 rounded-xl border transition-all ${
                            isSegActive
                              ? "bg-primary/10 border-primary/40 shadow-xs ring-1 ring-primary/20"
                              : "bg-[#141414] border-[#2E2E2E] hover:border-[#3E3E3E]"
                          }`}
                        >
                          <div className="flex justify-between font-mono text-[10px] text-muted-foreground mb-1.5">
                            <span className="text-primary font-semibold">Segmen #{i + 1}</span>
                            <span>
                              {formatAudioTime(seg.start_ms / 1000)} — {formatAudioTime(seg.end_ms / 1000)} ({((seg.end_ms - seg.start_ms) / 1000).toFixed(2)}s)
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {seg.words && seg.words.length > 0 ? (
                              seg.words.map((w: any, wi: number) => {
                                const isWordActive =
                                  currentTime * 1000 >= w.start_ms &&
                                  currentTime * 1000 <= w.end_ms;

                                if (isEditTimingMode) {
                                  return (
                                    <div
                                      key={wi}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-[#181818] border border-[#2E2E2E]"
                                    >
                                      <span className="font-semibold text-foreground">{w.word}</span>
                                      <span className="font-mono text-[9px] text-muted-foreground bg-[#121212] px-1 rounded border border-[#2E2E2E]">
                                        {w.start_ms}ms
                                      </span>
                                      <div className="flex items-center gap-0.5 ml-0.5">
                                        <button
                                          type="button"
                                          onClick={() => handleWordTimingNudge(i, wi, -50)}
                                          className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-[#242424]"
                                          title="Mundurkan 50ms"
                                        >
                                          -
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleWordTimingNudge(i, wi, 50)}
                                          className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-[#242424]"
                                          title="Majukan 50ms"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <button
                                    key={wi}
                                    type="button"
                                    onClick={() => handleSeek(w.start_ms / 1000)}
                                    className={`px-2 py-0.5 rounded-md text-xs transition cursor-pointer ${
                                      isWordActive
                                        ? "bg-primary text-black font-semibold shadow-xs"
                                        : "bg-[#181818] border border-[#2E2E2E] text-muted-foreground hover:text-foreground hover:border-primary/40"
                                    }`}
                                    title={`${w.word} • ${w.start_ms}ms - ${w.end_ms}ms`}
                                  >
                                    {w.word}
                                  </button>
                                );
                              })
                            ) : (
                              <span className="text-xs text-foreground">{seg.text}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Next Tab Button */}
              <div className="pt-4 border-t border-[#2E2E2E] flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Audio siap! Lanjutkan ke perakitan Timeline & Subtitle.
                </span>
                <Button
                  variant="supabase"
                  size="sm"
                  onClick={() => setActiveTab("timeline")}
                  className="gap-2 font-semibold"
                >
                  <span>Lanjut ke Timeline</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            /* Empty State saat belum ada audio */
            <EmptyState
              icon={<Volume2 className="w-8 h-8 text-primary" />}
              title="Audio Narasi Belum Dibuat"
              description="Pilih karakter suara narator di kolom kiri, sesuaikan parameter, lalu klik Generate Suara & Word Alignment."
            />
          )}
        </SectionPanel>
      </div>
    </div>
  );
}

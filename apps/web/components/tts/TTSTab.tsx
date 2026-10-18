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
  Cpu,
  Info,
  StopCircle,
  RefreshCw,
  ExternalLink,
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

export const GEMINI_TTS_MODELS = [
  {
    id: "gemini-2.5-flash-preview-tts",
    name: "Gemini 2.5 Flash TTS",
    badge: "Direkomendasikan (Paling Stabil)",
    desc: "Tone & intonasi persona paling konsisten tanpa drift antar segmen narasi panjang.",
  },
  {
    id: "gemini-3.8-flash-lite-tts",
    name: "Gemini 3.8 Flash-Lite TTS",
    badge: "Cepat & Hemat",
    desc: "Latensi super cepat, artikulasi jernih, dan hemat kuota.",
  },
  {
    id: "gemini-3.8-flash-tts",
    name: "Gemini 3.8 Flash TTS",
    badge: "Kualitas Studio",
    desc: "Vokal kualitas studio, dinamika emosi & intonasi acting lebih ekspresif.",
  },
  {
    id: "gemini-3.1-flash-tts-preview",
    name: "Gemini 3.1 Flash TTS Preview",
    badge: "Preview 3.1",
    desc: "Arsitektur preview 3.1 dengan kestabilan ritme vokal.",
  },
  {
    id: "gemini-flash-latest",
    name: "Gemini Flash Latest",
    badge: "Auto Latest",
    desc: "Model Gemini Flash versi terbaru yang otomatis diperbarui oleh Google.",
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    name: "Gemini 2.5 Pro TTS Preview",
    badge: "Pro High-Res",
    desc: "Model Pro dengan bobot vokal tebal untuk storytelling dokumenter.",
  },
];

export const ELEVENLABS_TTS_MODELS = [
  {
    id: "eleven_v4_turbo",
    name: "Eleven v4 Turbo",
    badge: "Next-Gen Low Latency",
    desc: "Arsitektur v4 terbaru, latensi ultra-cepat (~100ms), 90+ bahasa, intonasi emosional tinggi.",
  },
  {
    id: "eleven_v4",
    name: "Eleven v4",
    badge: "Flagship Ultra-Realism",
    desc: "Model v4 tertinggi untuk kualitas vokal sinematik dan ekspresi emosional paling mendalam.",
  },
  {
    id: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    badge: "Gold Standard (Paling Stabil)",
    desc: "Kualitas vokal paling stabil tanpa tone drift, artikulasi emosional tinggi.",
  },
  {
    id: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    badge: "Super Cepat & Hemat Kuota",
    desc: "Latensi super cepat & hemat kuota karakter 50% untuk video harian.",
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Eleven Flash / Turbo 2.5",
    badge: "Fast Generation",
    desc: "Generasi Turbo v2.5 seimbang antara kecepatan dan kestabilan.",
  },
];

export const RUNWARE_TTS_MODELS = [
  {
    id: "fishaudio:s2.1@pro",
    name: "Fish Audio S2.1 Pro",
    badge: "Ultra-Natural",
    desc: "Sintesis vokal S2.1 Pro dengan kestabilan ritme vokal dan intonasi natural.",
  },
  {
    id: "alibaba:qwen3-tts-1.7b-customvoice",
    name: "Alibaba Qwen3-TTS 1.7B",
    badge: "Aksen Natural",
    desc: "Aksen Asia & Indonesia sangat natural dan ritme artikulasi lancar.",
  },
  {
    id: "inworld:tts@2",
    name: "Inworld Realtime TTS-2",
    badge: "Dinamis & Interaktif",
    desc: "Vokal dinamis & dialog emosional untuk storytelling interaktif.",
  },
  {
    id: "xai:tts@0",
    name: "xAI TTS (Grok)",
    badge: "Ekspresif & Modern",
    desc: "Model TTS xAI dengan vokal ekspresif dan pelafalan multi-bahasa cerdas.",
  },
  {
    id: "minimax:speech@2.8",
    name: "MiniMax Speech 2.8",
    badge: "High-Realism Prosody",
    desc: "Sintesis vokal resolusi tinggi dengan intonasi emosional kaya dan artikulasi tajam.",
  },
];

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
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash-preview-tts");
  const [elevenlabsModel, setElevenlabsModel] = useState("eleven_multilingual_v2");
  const [runwareModel, setRunwareModel] = useState("fishaudio:s2.1@pro");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");
  const [fallbackEnabled, setFallbackEnabled] = useState(true);

  // Fetch active config to sync saved tts_provider & fallback setting
  const { data: appConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  useEffect(() => {
    if (appConfig?.tts_provider) {
      if (appConfig.tts_provider === "elevenlabs") {
        setProvider("elevenlabs");
        setSelectedVoice("Adam");
      } else if (appConfig.tts_provider === "runware") {
        setProvider("runware");
        setSelectedVoice("fishaudio:s2.1@pro");
      } else if (appConfig.tts_provider === "edge") {
        setProvider("edge");
        setSelectedVoice("id-ID-GadisNeural");
      } else if (appConfig.tts_provider.startsWith("gemini-")) {
        setGeminiModel(appConfig.tts_provider);
      }
    }
    if (appConfig?.elevenlabs_model) setElevenlabsModel(appConfig.elevenlabs_model);
    if (appConfig?.runware_tts_model) setRunwareModel(appConfig.runware_tts_model);
    if (appConfig?.tts_fallback_enabled !== undefined) {
      setFallbackEnabled(appConfig.tts_fallback_enabled);
    }
  }, [appConfig]);

  const selectedModelObj =
    provider === "gemini"
      ? GEMINI_TTS_MODELS.find((m) => m.id === geminiModel) || GEMINI_TTS_MODELS[0]
      : provider === "elevenlabs"
      ? ELEVENLABS_TTS_MODELS.find((m) => m.id === elevenlabsModel) || ELEVENLABS_TTS_MODELS[0]
      : RUNWARE_TTS_MODELS.find((m) => m.id === runwareModel) || RUNWARE_TTS_MODELS[0];

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
      let activeModel: string | undefined = undefined;
      if (provider === "gemini") activeModel = geminiModel;
      else if (provider === "elevenlabs") activeModel = elevenlabsModel;
      else if (provider === "runware") activeModel = runwareModel;

      return api.generateTTS(project.id, {
        provider,
        voice: selectedVoice,
        rate,
        pitch,
        model: activeModel,
        fallback_enabled: fallbackEnabled,
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

  const handleCancelTTS = async () => {
    try {
      await api.cancelProjectTasks(project.id);
      setIsGeneratingTTS(false);
      showToast("Proses pembuatan audio dibatalkan", "info");
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
    } catch (err: any) {
      showToast(err.message || "Gagal membatalkan TTS", "error");
    }
  };

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

    let modelParam = "";
    if (provider === "gemini") modelParam = `&model=${encodeURIComponent(geminiModel)}`;
    else if (provider === "elevenlabs") modelParam = `&model=${encodeURIComponent(elevenlabsModel)}`;
    else if (provider === "runware") modelParam = `&model=${encodeURIComponent(runwareModel)}`;

    const sampleUrl = `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}${modelParam}&t=${Date.now()}`;
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

  // ElevenLabs dynamic account voice sync & custom voice ID
  const [elevenLabsCustomVoices, setElevenLabsCustomVoices] = useState<any[]>([]);
  const [isSyncingElevenLabs, setIsSyncingElevenLabs] = useState<boolean>(false);
  const [customVoiceInput, setCustomVoiceInput] = useState<string>("");
  const [syncError, setSyncError] = useState<string | null>(null);

  // Runware custom voice / speaker ID input
  const [runwareCustomVoiceInput, setRunwareCustomVoiceInput] = useState<string>("");

  const handleSyncElevenLabsVoices = async () => {
    setIsSyncingElevenLabs(true);
    setSyncError(null);
    try {
      const data = await api.getElevenLabsVoices();
      if (Array.isArray(data) && data.length > 0) {
        setElevenLabsCustomVoices(data);
        showToast(`Berhasil menyinkronkan ${data.length} karakter suara dari ElevenLabs!`, "success");
      } else {
        showToast("Tidak ada karakter suara yang ditemukan di akun ElevenLabs.", "info");
      }
    } catch (err: any) {
      const msg = err.message || "Gagal menarik daftar suara dari ElevenLabs";
      setSyncError(msg);
      showToast(msg, "error");
    } finally {
      setIsSyncingElevenLabs(false);
    }
  };

  const baseVoices = voices.filter((v) => v.provider === provider);
  const filteredVoices =
    provider === "elevenlabs" && elevenLabsCustomVoices.length > 0
      ? [
          ...elevenLabsCustomVoices,
          ...baseVoices.filter(
            (bv) =>
              !elevenLabsCustomVoices.some(
                (cv) =>
                  cv.id === bv.id ||
                  cv.name.toLowerCase().startsWith(bv.name.toLowerCase().split(" ")[0])
              )
          ),
        ]
      : baseVoices;

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
                Gemini
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider("elevenlabs");
                  setSelectedVoice("Adam");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  provider === "elevenlabs"
                    ? "bg-primary text-black font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ElevenLabs
              </button>
              <button
                type="button"
                onClick={() => {
                  setProvider("runware");
                  setSelectedVoice("fishaudio:s2.1@pro");
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                  provider === "runware"
                    ? "bg-primary text-black font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Runware
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
                Edge
              </button>
            </div>
          }
        >
          {/* Gemini Model Selection Box */}
          {provider === "gemini" && (
            <div className="mb-3.5 p-3 rounded-xl bg-[#121212] border border-[#2E2E2E] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Model Gemini TTS</span>
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0">
                  {selectedModelObj?.badge || "Gemini"}
                </Badge>
              </div>

              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#181818] rounded-lg border border-[#333] text-foreground text-xs focus:outline-none focus:border-primary transition"
              >
                {GEMINI_TTS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.badge}
                  </option>
                ))}
              </select>

              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
                <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
                <p>
                  {selectedModelObj?.desc}{" "}
                  <span className="text-primary/90 font-medium">
                    (Single-pass kini mendukung hingga 2.200 karakter untuk intonasi vokal seragam).
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* ElevenLabs Model Selection Box */}
          {provider === "elevenlabs" && (
            <div className="mb-3.5 p-3 rounded-xl bg-[#121212] border border-[#2E2E2E] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Model ElevenLabs</span>
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0">
                  {selectedModelObj?.badge || "ElevenLabs"}
                </Badge>
              </div>

              <select
                value={elevenlabsModel}
                onChange={(e) => setElevenlabsModel(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#181818] rounded-lg border border-[#333] text-foreground text-xs focus:outline-none focus:border-primary transition"
              >
                {ELEVENLABS_TTS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.badge}
                  </option>
                ))}
              </select>

              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
                <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
                <p>
                  {selectedModelObj?.desc}{" "}
                  <span className="text-primary/90 font-medium">
                    (Stabilitas 0.75 menjamin nol intonation drift dari awal hingga akhir video).
                  </span>
                </p>
              </div>

              {/* ElevenLabs Voice Sync & Custom Voice ID Box */}
              <div className="pt-2.5 border-t border-[#2E2E2E]/80 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-300">Suara Akun / Web Library:</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={isSyncingElevenLabs}
                    onClick={handleSyncElevenLabsVoices}
                    className="h-6 text-[10px] gap-1 px-2 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
                  >
                    {isSyncingElevenLabs ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {elevenLabsCustomVoices.length > 0 ? "Sinkron Ulang" : "Tarik Suara dari Akun"}
                  </Button>
                </div>

                {syncError && (
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 leading-normal">
                    {syncError}
                  </div>
                )}

                {/* Custom Voice ID Direct Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Atau gunakan Voice ID dari web ElevenLabs:</span>
                    <a
                      href="https://elevenlabs.io/voice-library"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:text-violet-300 hover:underline flex items-center gap-0.5"
                    >
                      Buka Voice Library <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customVoiceInput}
                      onChange={(e) => setCustomVoiceInput(e.target.value)}
                      placeholder="Contoh: pNInz6obpgDQGcFmaJgB (20 karakter ID)"
                      className="flex-1 px-2.5 py-1 bg-[#181818] rounded-lg border border-[#333] text-foreground text-xs focus:outline-none focus:border-violet-500 font-mono"
                    />
                    <Button
                      type="button"
                      variant="supabase"
                      size="xs"
                      disabled={!customVoiceInput.trim()}
                      onClick={() => {
                        const clean = customVoiceInput.trim();
                        setSelectedVoice(clean);
                        showToast(`Voice ID '${clean}' dipilih untuk narasi!`, "success");
                      }}
                      className="h-7 text-[10px] px-2.5 bg-violet-600 hover:bg-violet-500"
                    >
                      Pilih ID Ini
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={!customVoiceInput.trim()}
                      onClick={() => playVoiceSample(customVoiceInput.trim())}
                      className="h-7 text-[10px] px-2"
                      title="Tes sampel audio Voice ID"
                    >
                      {sampleAudioPlaying === customVoiceInput.trim() ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Active Custom Voice indicator if selectedVoice is custom */}
                {selectedVoice && !filteredVoices.some((v) => v.id.toLowerCase() === selectedVoice.toLowerCase()) && (
                  <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="text-[11px] font-medium text-violet-200 truncate">
                        Voice ID Aktif: <span className="font-mono">{selectedVoice}</span>
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-violet-400 text-violet-300">
                      Custom ID
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Runware Model Selection Box */}
          {provider === "runware" && (
            <div className="mb-3.5 p-3 rounded-xl bg-[#121212] border border-[#2E2E2E] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Model Runware TTS</span>
                </div>
                <Badge variant="outline" className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0">
                  {selectedModelObj?.badge || "Runware"}
                </Badge>
              </div>

              <select
                value={runwareModel}
                onChange={(e) => setRunwareModel(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#181818] rounded-lg border border-[#333] text-foreground text-xs focus:outline-none focus:border-primary transition"
              >
                {RUNWARE_TTS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.badge}
                  </option>
                ))}
              </select>

              <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
                <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
                <p>
                  {selectedModelObj?.desc}{" "}
                  <span className="text-primary/90 font-medium">
                    (Hemat biaya ~$0.0005/detik dengan performa suara jernih).
                  </span>
                </p>
              </div>

              {/* Runware Custom Voice / Speaker ID Input */}
              <div className="pt-2.5 border-t border-[#2E2E2E]/80 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Custom Voice ID / Speaker Name:</span>
                  <span className="text-violet-400 text-[10px]">Opsional / Voice Library</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={runwareCustomVoiceInput}
                    onChange={(e) => setRunwareCustomVoiceInput(e.target.value)}
                    placeholder="Contoh: Ashley, Eve, Leo, presenter_male, atau ID kustom"
                    className="flex-1 px-2.5 py-1 bg-[#181818] rounded-lg border border-[#333] text-foreground text-xs focus:outline-none focus:border-violet-500 font-mono"
                  />
                  <Button
                    type="button"
                    variant="supabase"
                    size="xs"
                    disabled={!runwareCustomVoiceInput.trim()}
                    onClick={() => {
                      const clean = runwareCustomVoiceInput.trim();
                      setSelectedVoice(clean);
                      showToast(`Voice '${clean}' dipilih untuk Runware!`, "success");
                    }}
                    className="h-7 text-[10px] px-2.5 bg-violet-600 hover:bg-violet-500"
                  >
                    Pilih ID
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!runwareCustomVoiceInput.trim()}
                    onClick={() => playVoiceSample(runwareCustomVoiceInput.trim())}
                    className="h-7 text-[10px] px-2"
                    title="Tes sampel audio Runware Voice"
                  >
                    {sampleAudioPlaying === runwareCustomVoiceInput.trim() ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                  </Button>
                </div>
                {selectedVoice && !filteredVoices.some((v) => v.id.toLowerCase() === selectedVoice.toLowerCase()) && (
                  <div className="p-2 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                      <span className="text-[11px] font-medium text-violet-200 truncate">
                        Voice Aktif: <span className="font-mono">{selectedVoice}</span>
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[9px] py-0 px-1 border-violet-400 text-violet-300">
                      Custom Speaker
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          )}

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

            {/* Fallback to Edge-TTS Checkbox */}
            <div className="pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border-[#2E2E2E] bg-[#141414] text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                />
                <div>
                  <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                    Fallback otomatis ke Edge-TTS jika API error / kuota habis
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                    Jika tidak dicentang, proses akan berhenti dengan error dan audio terpotong pada bagian yang gagal.
                  </p>
                </div>
              </label>
            </div>

            {/* Live Progress Card for TTS */}
            {isGeneratingTTS && (
              <div className="p-3.5 rounded-xl bg-[#141414] border border-primary/40 space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-primary font-medium truncate max-w-[200px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">{generationStepText || "Memproses audio TTS..."}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground shrink-0">
                    <span>
                      {Math.floor(generationElapsed / 60)}:
                      {String(generationElapsed % 60).padStart(2, "0")}
                    </span>
                    <Badge variant="supabase" className="text-[10px] py-0 px-1.5 font-bold">
                      {Math.round(generationProgress)}%
                    </Badge>
                    <button
                      type="button"
                      onClick={handleCancelTTS}
                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold transition cursor-pointer"
                      title="Batalkan proses TTS"
                    >
                      Batal
                    </button>
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

            {/* Generate & Cancel Buttons */}
            {isGeneratingTTS ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="supabase"
                  size="lg"
                  className="flex-1 h-11 text-xs font-semibold gap-2 cursor-wait opacity-85"
                  disabled
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="h-11 px-4 text-xs font-bold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                  onClick={handleCancelTTS}
                  title="Batalkan pembuatan audio & alignment"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Batal</span>
                </Button>
              </div>
            ) : (
              <Button
                variant="supabase"
                size="lg"
                className="w-full h-11 text-xs font-semibold gap-2"
                onClick={() => generateTTSMutation.mutate()}
                disabled={generateTTSMutation.isPending || !narrationText}
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Suara & Word Alignment</span>
              </Button>
            )}
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

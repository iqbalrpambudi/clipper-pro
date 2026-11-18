import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { resolveApiUrl } from "@/env";
import { useStudioStore } from "@/lib/store";
import { Project, ProjectDetail, Narration, AudioTrack, SentenceSegment, VoiceInfo } from "@/types";
import { TTS_MODEL } from "../constants";

export interface UseTTSStateProps {
  project: Project & {
    narration?: Narration | null;
    audio?: AudioTrack | null;
    audio_track?: AudioTrack | null;
  };
}

export function useTTSState({ project }: UseTTSStateProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab, activeTask, voiceDraftsByProject, setVoiceDraft } =
    useStudioStore();

  const draft = voiceDraftsByProject[project.id];
  const audio = project.audio || project.audio_track;
  const projTts = project.tts_config;

  const initialProvider = draft?.provider || audio?.provider || projTts?.provider || "gemini";
  const initialVoice =
    draft?.voice ||
    audio?.voice ||
    projTts?.voice ||
    (initialProvider === "elevenlabs" ? "Adam" : "Puck");
  const parseRate = (val: string | number | undefined | null) => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    return parseInt(String(val).replace(/[%+]/g, "")) || 0;
  };
  const initialRate = parseRate(draft?.rate ?? audio?.rate ?? projTts?.rate);
  const initialPitch = parseRate(draft?.pitch ?? audio?.pitch ?? projTts?.pitch);

  const [selectedVoice, setSelectedVoice] = useState(initialVoice);
  const [provider, setProvider] = useState(initialProvider);
  const [rate, setRate] = useState<number>(initialRate);
  const [pitch, setPitch] = useState<number>(initialPitch);

  // Keep the voice draft while switching tabs
  useEffect(() => {
    const voicePayload = {
      provider,
      voice: selectedVoice,
      model: (projTts?.provider === provider && projTts?.model) || TTS_MODEL[provider],
      rate,
      pitch,
      customVoiceInput: draft?.customVoiceInput || "",
      selectedVoicePresetId: "",
    };

    setVoiceDraft(project.id, voicePayload);
  }, [
    project.id,
    provider,
    selectedVoice,
    rate,
    pitch,
    projTts?.provider,
    projTts?.model,
    draft?.customVoiceInput,
    setVoiceDraft,
  ]);

  // Fetch active config & project defaults for older projects without tts_config
  const { data: appConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });
  const { data: projectDefaults } = useQuery({
    queryKey: ["project-defaults"],
    queryFn: api.getProjectDefaults,
    enabled: !draft && !audio?.provider && !projTts?.provider,
  });

  const hasInitializedConfigRef = useRef(false);
  useEffect(() => {
    if (hasInitializedConfigRef.current) return;
    if (draft || audio?.provider || projTts?.provider) {
      hasInitializedConfigRef.current = true;
      return;
    }
    if (projectDefaults?.tts) {
      hasInitializedConfigRef.current = true;
      setProvider(projectDefaults.tts.provider);
      setSelectedVoice(projectDefaults.tts.voice);
      setRate(projectDefaults.tts.rate);
      setPitch(projectDefaults.tts.pitch);
      return;
    }
    if (!appConfig) return;
    hasInitializedConfigRef.current = true;

    if (appConfig.tts_provider === "elevenlabs") {
      setProvider("elevenlabs");
      setSelectedVoice("Adam");
    }
  }, [appConfig, projectDefaults, draft, audio?.provider, projTts?.provider]);

  // Sample voice audio state
  const [sampleAudioPlaying, setSampleAudioPlaying] = useState<string | null>(null);
  const [loadingSampleVoiceId, setLoadingSampleVoiceId] = useState<string | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  // Main custom audio player state
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(audio?.duration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Live Progress State for TTS Generation (driven by SSE activeTask)
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(audio?.status === "generating");
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
    let timer: ReturnType<typeof setTimeout> | null = null;
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

  // Detect completion when audio changes to ready
  useEffect(() => {
    if (isGeneratingTTS && audio && (audio.status === "ready" || audio.audio_url)) {
      setGenerationProgress(100);
      setGenerationStepText("Audio narasi & forced alignment berhasil dibuat!");
      const timeout = setTimeout(() => {
        setIsGeneratingTTS(false);
        setGenerationProgress(0);
        setGenerationElapsed(0);
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [audio, isGeneratingTTS]);

  // Sync state only when not actively generating to prevent overwriting user's new voice selection
  useEffect(() => {
    if (audio?.duration) {
      setAudioDuration(audio.duration);
    }
    if (!isGeneratingTTS && !draft) {
      if (audio?.provider) {
        setProvider(audio.provider);
      }
      if (audio?.voice) {
        setSelectedVoice(audio.voice);
      }
      if (audio?.rate) {
        setRate(parseRate(audio.rate));
      }
      if (audio?.pitch) {
        setPitch(parseRate(audio.pitch));
      }
    }
  }, [audio?.id, audio?.status, isGeneratingTTS]);

  const handleTimeUpdate = () => {
    if (mainAudioRef.current) {
      setCurrentTime(mainAudioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (mainAudioRef.current && !isNaN(mainAudioRef.current.duration)) {
      setAudioDuration(mainAudioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Invalidate and reload main audio when audio URL or ID changes
  useEffect(() => {
    if (mainAudioRef.current) {
      mainAudioRef.current.pause();
      setIsPlaying(false);
      setCurrentTime(0);
      mainAudioRef.current.load();
    }
  }, [audio?.audio_url, audio?.id]);

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

  const projectLanguage = (project.narration?.language || project.language || "id").toLowerCase();

  useEffect(() => {
    const isEn = projectLanguage === "en";
    if (isEn) {
      if (selectedVoice.startsWith("id-")) setSelectedVoice("Puck");
    } else {
      if (selectedVoice.startsWith("en-")) setSelectedVoice("Puck");
    }
  }, [projectLanguage, provider, selectedVoice]);

  const generateTTSMutation = useMutation({
    mutationFn: () => {
      setIsGeneratingTTS(true);
      setGenerationProgress(10);
      setGenerationElapsed(0);
      return api.generateTTS(project.id, {
        provider,
        voice: selectedVoice,
        rate: `${rate >= 0 ? "+" : ""}${rate}%`,
        pitch: `${pitch >= 0 ? "+" : ""}${pitch}Hz`,
        model: (projTts?.provider === provider && projTts?.model) || TTS_MODEL[provider],
        language: projectLanguage,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
    },
    onError: (err: Error) => {
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
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Gagal membatalkan TTS", "error");
    }
  };

  // Realignment & Timing Micro-Adjustment State
  const [offsetMs, setOffsetMs] = useState(0);
  const [isEditTimingMode, setIsEditTimingMode] = useState(false);
  const [editableSegments, setEditableSegments] = useState<SentenceSegment[]>([]);

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
        language: projectLanguage,
        model_size: params?.model_size || "base",
      });
    },
    onSuccess: (data) => {
      if (data?.segments) {
        setEditableSegments(JSON.parse(JSON.stringify(data.segments)));
      }
      queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
        if (!old) return old;
        return {
          ...old,
          narration: old.narration
            ? {
                ...old.narration,
                segments: data.segments,
                status: "aligned",
              }
            : null,
        };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Word timestamps berhasil diselaraskan ulang via Whisper AI!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal melakukan realignment kata", "error");
    },
  });

  const updateSegmentsMutation = useMutation({
    mutationFn: (segments: SentenceSegment[]) => api.updateNarrationSegments(project.id, segments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Koreksi timing kata berhasil disimpan!", "success");
      setIsEditTimingMode(false);
    },
    onError: (err: Error) => {
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

    const player = sampleAudioRef.current;
    player.pause();
    setSampleAudioPlaying(voiceId);
    setLoadingSampleVoiceId(voiceId);

    const modelParam = `&model=${encodeURIComponent(TTS_MODEL[provider] || "")}`;

    const sampleUrl = resolveApiUrl(
      `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}${modelParam}&language=${encodeURIComponent(projectLanguage)}&t=${Date.now()}`
    );
    player.src = sampleUrl;
    player.oncanplay = () => {
      setLoadingSampleVoiceId(null);
    };
    player.onended = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
    };
    player.onerror = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
      showToast("Gagal memutar sampel audio untuk " + voiceId, "error");
    };

    player.play().catch((e) => {
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
  const [elevenLabsCustomVoices, setElevenLabsCustomVoices] = useState<VoiceInfo[]>([]);
  const [isSyncingElevenLabs, setIsSyncingElevenLabs] = useState<boolean>(false);
  const [customVoiceInput, setCustomVoiceInput] = useState<string>(draft?.customVoiceInput || "");
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleSyncElevenLabsVoices = async () => {
    setIsSyncingElevenLabs(true);
    setSyncError(null);
    try {
      const data = await api.getElevenLabsVoices();
      if (Array.isArray(data) && data.length > 0) {
        setElevenLabsCustomVoices(data);
        showToast(
          `Berhasil menyinkronkan ${data.length} karakter suara dari ElevenLabs!`,
          "success"
        );
      } else {
        showToast("Tidak ada karakter suara yang ditemukan di akun ElevenLabs.", "info");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menarik daftar suara dari ElevenLabs";
      setSyncError(msg);
      showToast(msg, "error");
    } finally {
      setIsSyncingElevenLabs(false);
    }
  };

  const baseVoices = voices.filter((v) => v.provider === provider);
  const rawVoicesList =
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

  const isEnProject = projectLanguage === "en";
  const filteredVoices = rawVoicesList.filter((v) => {
    if (isEnProject) return !v.id.startsWith("id-") && !v.id.startsWith("ja-");
    return !v.id.startsWith("en-") && !v.id.startsWith("ja-");
  });

  return {
    // Project & derived
    project,
    audio,
    narrationText,
    projectLanguage,
    isEnProject,
    // Providers & models
    provider,
    setProvider,
    selectedVoice,
    setSelectedVoice,
    // Tuning params
    rate,
    setRate,
    pitch,
    setPitch,
    // Voices list & filtering
    voices,
    filteredVoices,
    costEstimate,
    // Voice preview audio
    sampleAudioPlaying,
    loadingSampleVoiceId,
    playVoiceSample,
    // Main audio playback
    mainAudioRef,
    isPlaying,
    currentTime,
    audioDuration,
    volume,
    isMuted,
    toggleMainPlay,
    handleSeek,
    handleSkip,
    toggleMute,
    handleVolumeChange,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
    // Generation & cancellation
    isGeneratingTTS,
    generationProgress,
    generationStepText,
    generationElapsed,
    generateTTSMutation,
    handleCancelTTS,
    // ElevenLabs custom voices & sync
    elevenLabsCustomVoices,
    isSyncingElevenLabs,
    customVoiceInput,
    setCustomVoiceInput,
    syncError,
    handleSyncElevenLabsVoices,
    // Realignment & Timing
    offsetMs,
    isEditTimingMode,
    setIsEditTimingMode,
    editableSegments,
    setEditableSegments,
    realignMutation,
    updateSegmentsMutation,
    handleWordTimingNudge,
    handleGlobalOffsetShift,
    // Studio store actions
    showToast,
    setActiveTab,
  };
}

export type TTSState = ReturnType<typeof useTTSState>;

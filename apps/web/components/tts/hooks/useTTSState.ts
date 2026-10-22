"use client";

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { presetStorage, VoicePreset } from "@/lib/presetStorage";
import { Project, ProjectDetail, Narration, AudioTrack, SentenceSegment, VoiceInfo } from "@/types";
import { GEMINI_TTS_MODELS, ELEVENLABS_TTS_MODELS, RUNWARE_TTS_MODELS } from "../constants";

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

  const initialProvider = draft?.provider || audio?.provider || "gemini";
  const initialVoice =
    draft?.voice || audio?.voice || (initialProvider === "edge" ? "id-ID-GadisNeural" : "Puck");
  const initialGeminiModel =
    draft?.geminiModel ||
    (audio?.provider === "gemini" && audio?.model) ||
    "gemini-2.5-flash-preview-tts";
  const initialElevenlabsModel =
    draft?.elevenlabsModel ||
    (audio?.provider === "elevenlabs" && audio?.model) ||
    "eleven_multilingual_v2";
  const initialRunwareModel =
    draft?.runwareModel || (audio?.provider === "runware" && audio?.model) || "fishaudio:s2.1@pro";
  const parseRate = (val: string | number | undefined | null) => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    return parseInt(String(val).replace(/[%+]/g, "")) || 0;
  };
  const initialRate = parseRate(draft?.rate ?? audio?.rate);
  const initialPitch = parseRate(draft?.pitch ?? audio?.pitch);
  const initialFallback = draft?.fallbackEnabled ?? true;

  const [selectedVoice, setSelectedVoice] = useState(initialVoice);
  const [provider, setProvider] = useState(initialProvider);
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel);
  const [elevenlabsModel, setElevenlabsModel] = useState(initialElevenlabsModel);
  const [runwareModel, setRunwareModel] = useState(initialRunwareModel);
  const [rate, setRate] = useState<number>(initialRate);
  const [pitch, setPitch] = useState<number>(initialPitch);
  const [fallbackEnabled, setFallbackEnabled] = useState(initialFallback);
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState<string>(
    draft?.selectedVoicePresetId || ""
  );

  // Sync draft whenever user changes voice settings in short studio
  useEffect(() => {
    setVoiceDraft(project.id, {
      provider,
      voice: selectedVoice,
      geminiModel,
      elevenlabsModel,
      runwareModel,
      rate,
      pitch,
      fallbackEnabled,
      customVoiceInput: draft?.customVoiceInput,
      selectedVoicePresetId,
    });
  }, [
    project.id,
    provider,
    selectedVoice,
    geminiModel,
    elevenlabsModel,
    runwareModel,
    rate,
    pitch,
    fallbackEnabled,
    selectedVoicePresetId,
    setVoiceDraft,
  ]);

  // Fetch active config to sync saved tts_provider & fallback setting
  const { data: appConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  const hasInitializedConfigRef = useRef(false);
  useEffect(() => {
    if (hasInitializedConfigRef.current) return;
    if (draft || audio?.provider) {
      hasInitializedConfigRef.current = true;
      return;
    }
    if (!appConfig) return;
    hasInitializedConfigRef.current = true;

    if (appConfig.tts_provider) {
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
    if (appConfig.elevenlabs_model) setElevenlabsModel(appConfig.elevenlabs_model);
    if (appConfig.runware_tts_model) setRunwareModel(appConfig.runware_tts_model);
    if (appConfig.tts_fallback_enabled !== undefined) {
      setFallbackEnabled(appConfig.tts_fallback_enabled);
    }
  }, [appConfig, draft, audio?.provider]);

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
      if (selectedVoice.startsWith("id-")) {
        setSelectedVoice(provider === "edge" ? "en-US-JennyNeural" : "Puck");
      }
    } else {
      if (selectedVoice.startsWith("en-")) {
        setSelectedVoice(provider === "edge" ? "id-ID-ArdiNeural" : "Puck");
      }
    }
  }, [projectLanguage, provider, selectedVoice]);

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
        rate: `${rate >= 0 ? "+" : ""}${rate}%`,
        pitch: `${pitch >= 0 ? "+" : ""}${pitch}Hz`,
        model: activeModel,
        fallback_enabled: fallbackEnabled,
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

    let modelParam = "";
    if (provider === "gemini") modelParam = `&model=${encodeURIComponent(geminiModel)}`;
    else if (provider === "elevenlabs")
      modelParam = `&model=${encodeURIComponent(elevenlabsModel)}`;
    else if (provider === "runware") modelParam = `&model=${encodeURIComponent(runwareModel)}`;

    const sampleUrl = `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}${modelParam}&language=${encodeURIComponent(projectLanguage)}&t=${Date.now()}`;
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

  // Runware custom voice / speaker ID input
  const [runwareCustomVoiceInput, setRunwareCustomVoiceInput] = useState<string>(
    draft?.runwareCustomVoiceInput || ""
  );

  // Voice presets (shared by short & storyboard studios)
  const [voicePresets, setVoicePresets] = useState<VoicePreset[]>([]);
  const [showSaveVoiceModal, setShowSaveVoiceModal] = useState(false);
  const [newVoicePresetName, setNewVoicePresetName] = useState("");

  useEffect(() => {
    setVoicePresets(presetStorage.getVoicePresets());
  }, []);

  const handleLoadVoicePreset = (presetId: string) => {
    setSelectedVoicePresetId(presetId);
    const found = voicePresets.find((p) => p.id === presetId);
    if (!found) return;
    setProvider(found.provider);
    setSelectedVoice(found.voice);
    if (found.provider === "gemini") setGeminiModel(found.model);
    else if (found.provider === "elevenlabs") setElevenlabsModel(found.model);
    else if (found.provider === "runware") setRunwareModel(found.model);
    if (found.customVoiceInput) setCustomVoiceInput(found.customVoiceInput);
    if (found.runwareCustomVoiceInput) setRunwareCustomVoiceInput(found.runwareCustomVoiceInput);
    setRate(found.rate ?? 0);
    setPitch(found.pitch ?? 0);
    showToast(`Preset suara "${found.name}" berhasil dimuat!`, "success");
  };

  const handleSaveVoicePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVoicePresetName.trim()) {
      showToast("Nama preset suara tidak boleh kosong", "error");
      return;
    }
    const model =
      provider === "gemini"
        ? geminiModel
        : provider === "elevenlabs"
          ? elevenlabsModel
          : provider === "runware"
            ? runwareModel
            : "edge";

    const saved = presetStorage.saveVoicePreset({
      name: newVoicePresetName.trim(),
      provider,
      model,
      voice: selectedVoice,
      customVoiceInput: customVoiceInput || undefined,
      runwareCustomVoiceInput: runwareCustomVoiceInput || undefined,
      rate,
      pitch,
    });
    setVoicePresets(presetStorage.getVoicePresets());
    setSelectedVoicePresetId(saved.id);
    setNewVoicePresetName("");
    setShowSaveVoiceModal(false);
    showToast(`Preset suara "${saved.name}" berhasil disimpan!`, "success");
  };

  const handleDeleteVoicePreset = (id: string, name: string) => {
    presetStorage.deleteVoicePreset(id);
    setVoicePresets(presetStorage.getVoicePresets());
    if (selectedVoicePresetId === id) setSelectedVoicePresetId("");
    showToast(`Preset suara "${name}" dihapus`, "info");
  };

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
    if (isEnProject) {
      if (v.provider === "edge") return v.id.startsWith("en-");
      return !v.id.startsWith("id-") && !v.id.startsWith("ja-");
    } else {
      if (v.provider === "edge") return v.id.startsWith("id-");
      return !v.id.startsWith("en-") && !v.id.startsWith("ja-");
    }
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
    geminiModel,
    setGeminiModel,
    elevenlabsModel,
    setElevenlabsModel,
    runwareModel,
    setRunwareModel,
    selectedModelObj,
    // Tuning params
    rate,
    setRate,
    pitch,
    setPitch,
    fallbackEnabled,
    setFallbackEnabled,
    // Voice presets
    voicePresets,
    selectedVoicePresetId,
    showSaveVoiceModal,
    setShowSaveVoiceModal,
    newVoicePresetName,
    setNewVoicePresetName,
    handleLoadVoicePreset,
    handleSaveVoicePreset,
    handleDeleteVoicePreset,
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
    // Runware custom voice input
    runwareCustomVoiceInput,
    setRunwareCustomVoiceInput,
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

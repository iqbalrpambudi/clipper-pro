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
  ExternalLink,
  Bookmark,
  BookmarkPlus,
  Save,
  Trash2,
  X,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem, SentenceSegment } from "@/types";
import { Button, Badge, Input } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";
import { presetStorage, VoicePreset } from "@/lib/presetStorage";
import {
  GEMINI_TTS_MODELS,
  ELEVENLABS_TTS_MODELS,
  RUNWARE_TTS_MODELS,
} from "@/components/tts/TTSTab";

interface StoryboardVoiceTabProps {
  project: Project;
}

export function StoryboardVoiceTab({ project }: StoryboardVoiceTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast, voiceDraftsByProject, setVoiceDraft } = useStudioStore();

  const narration = project.narration;
  const audio = project.audio || project.audio_track;
  const items: StoryboardItem[] = project.storyboard_items || [];
  const segments: SentenceSegment[] = narration?.segments || [];

  const draft = voiceDraftsByProject[project.id];

  const parseRate = (val: string | number | undefined | null) => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    return parseInt(String(val).replace(/[%+]/g, "")) || 0;
  };
  const parsePitch = (val: string | number | undefined | null) => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    return parseInt(String(val).replace(/[Hz+]/g, "")) || 0;
  };

  const initialProvider = draft?.provider || audio?.provider || "gemini";
  const initialVoice =
    draft?.voice || audio?.voice || (initialProvider === "edge" ? "id-ID-ArdiNeural" : "Puck");
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
  const initialRate = draft?.rate !== undefined ? parseRate(draft.rate) : parseRate(audio?.rate);
  const initialPitch =
    draft?.pitch !== undefined ? parsePitch(draft.pitch) : parsePitch(audio?.pitch);
  const initialFallback = draft?.fallbackEnabled ?? true;
  const initialCustomVoiceInput = draft?.customVoiceInput || "";
  const initialRunwareCustomVoiceInput = draft?.runwareCustomVoiceInput || "";
  const initialPresetId = draft?.selectedVoicePresetId || "";

  const [provider, setProvider] = useState<string>(initialProvider);
  const [voice, setVoice] = useState<string>(initialVoice);
  const [geminiModel, setGeminiModel] = useState<string>(initialGeminiModel);
  const [elevenlabsModel, setElevenlabsModel] = useState<string>(initialElevenlabsModel);
  const [runwareModel, setRunwareModel] = useState<string>(initialRunwareModel);
  const [rate, setRate] = useState<number>(initialRate);
  const [pitch, setPitch] = useState<number>(initialPitch);
  const [fallbackEnabled, setFallbackEnabled] = useState<boolean>(initialFallback);
  const [customVoiceInput, setCustomVoiceInput] = useState<string>(initialCustomVoiceInput);
  const [runwareCustomVoiceInput, setRunwareCustomVoiceInput] = useState<string>(
    initialRunwareCustomVoiceInput
  );

  // Voice Presets state
  const [voicePresets, setVoicePresets] = useState<VoicePreset[]>([]);
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState<string>(initialPresetId);
  const [showSaveVoiceModal, setShowSaveVoiceModal] = useState<boolean>(false);
  const [newVoicePresetName, setNewVoicePresetName] = useState<string>("");

  // Sync draft whenever user changes voice settings
  useEffect(() => {
    setVoiceDraft(project.id, {
      provider,
      voice,
      geminiModel,
      elevenlabsModel,
      runwareModel,
      rate,
      pitch,
      fallbackEnabled,
      customVoiceInput,
      runwareCustomVoiceInput,
      selectedVoicePresetId,
    });
  }, [
    project.id,
    provider,
    voice,
    geminiModel,
    elevenlabsModel,
    runwareModel,
    rate,
    pitch,
    fallbackEnabled,
    customVoiceInput,
    runwareCustomVoiceInput,
    selectedVoicePresetId,
    setVoiceDraft,
  ]);

  useEffect(() => {
    setVoicePresets(presetStorage.getVoicePresets());
  }, []);

  const handleLoadVoicePreset = (presetId: string) => {
    setSelectedVoicePresetId(presetId);
    const found = voicePresets.find((p) => p.id === presetId);
    if (!found) return;
    setProvider(found.provider);
    setVoice(found.voice);
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
    let currentModel = "";
    if (provider === "gemini") currentModel = geminiModel;
    else if (provider === "elevenlabs") currentModel = elevenlabsModel;
    else if (provider === "runware") currentModel = runwareModel;
    else currentModel = "edge";

    const saved = presetStorage.saveVoicePreset({
      name: newVoicePresetName.trim(),
      provider,
      model: currentModel,
      voice,
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
    const remaining = presetStorage.getVoicePresets();
    setVoicePresets(remaining);
    if (selectedVoicePresetId === id) setSelectedVoicePresetId("");
    showToast(`Preset suara "${name}" dihapus`, "info");
  };

  // Sample Audio Player State
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const [sampleAudioPlaying, setSampleAudioPlaying] = useState<string | null>(null);
  const [loadingSampleVoiceId, setLoadingSampleVoiceId] = useState<string | null>(null);

  // Narration copy state & handler
  const [hasCopiedNarration, setHasCopiedNarration] = useState(false);
  const handleCopyAllNarration = () => {
    let fullText = "";
    if (segments && segments.length > 0) {
      fullText = segments
        .map((s: SentenceSegment) => (s.text || "").trim())
        .filter(Boolean)
        .join("\n\n");
    }
    if (!fullText && narration?.raw_text) {
      fullText = narration.raw_text.trim();
    }

    if (!fullText) {
      showToast("Belum ada teks narasi untuk disalin", "info");
      return;
    }

    navigator.clipboard.writeText(fullText);
    setHasCopiedNarration(true);
    setTimeout(() => setHasCopiedNarration(false), 2500);
    showToast("Seluruh teks narasi berhasil disalin ke clipboard!", "success");
  };

  const projectLanguage = (project.narration?.language || project.language || "id").toLowerCase();

  useEffect(() => {
    const isEn = projectLanguage === "en";
    if (isEn) {
      if (voice.startsWith("id-")) {
        setVoice(provider === "edge" ? "en-US-JennyNeural" : "Puck");
      }
    } else {
      if (voice.startsWith("en-")) {
        setVoice(provider === "edge" ? "id-ID-ArdiNeural" : "Puck");
      }
    }
  }, [projectLanguage, provider, voice]);

  const { data: voices = [] } = useQuery({
    queryKey: ["voices"],
    queryFn: api.getVoices,
  });

  const rawVoices = voices.filter((v) => v.provider === provider);
  const isEnProject = projectLanguage === "en";
  const filteredVoices = rawVoices.filter((v) => {
    if (isEnProject) {
      if (v.provider === "edge") return v.id.startsWith("en-");
      return !v.id.startsWith("id-") && !v.id.startsWith("ja-");
    } else {
      if (v.provider === "edge") return v.id.startsWith("id-");
      return !v.id.startsWith("en-") && !v.id.startsWith("ja-");
    }
  });

  const playVoiceSample = (voiceId: string) => {
    if (sampleAudioPlaying === voiceId) {
      if (sampleAudioRef.current) sampleAudioRef.current.pause();
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
      return;
    }

    if (!sampleAudioRef.current) {
      sampleAudioRef.current = new Audio();
    }

    const a = sampleAudioRef.current;
    a.pause();
    setSampleAudioPlaying(voiceId);
    setLoadingSampleVoiceId(voiceId);

    let modelParam = "";
    if (provider === "gemini") modelParam = `&model=${encodeURIComponent(geminiModel)}`;
    else if (provider === "elevenlabs")
      modelParam = `&model=${encodeURIComponent(elevenlabsModel)}`;
    else if (provider === "runware") modelParam = `&model=${encodeURIComponent(runwareModel)}`;

    const sampleUrl = `/api/v1/tts/sample?provider=${encodeURIComponent(provider)}&voice=${encodeURIComponent(voiceId)}${modelParam}&language=${encodeURIComponent(projectLanguage)}&t=${Date.now()}`;
    a.src = sampleUrl;
    a.oncanplay = () => setLoadingSampleVoiceId(null);
    a.onended = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
    };
    a.onerror = () => {
      setSampleAudioPlaying(null);
      setLoadingSampleVoiceId(null);
      showToast("Gagal memuat sampel audio untuk " + voiceId, "error");
    };
    a.play().catch(() => {});
  };

  // Fetch active config to sync fallback setting
  const { data: appConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  const hasInitializedConfigRef = useRef(false);
  useEffect(() => {
    if (hasInitializedConfigRef.current) return;
    // If draft or existing project audio exists, DO NOT override with default appConfig!
    if (draft || audio?.provider) {
      hasInitializedConfigRef.current = true;
      return;
    }
    if (!appConfig) return;
    hasInitializedConfigRef.current = true;

    if (appConfig.tts_fallback_enabled !== undefined) {
      setFallbackEnabled(appConfig.tts_fallback_enabled);
    }
    if (appConfig.tts_provider) {
      if (appConfig.tts_provider === "elevenlabs") {
        setProvider("elevenlabs");
        setVoice("Adam");
      } else if (appConfig.tts_provider === "runware") {
        setProvider("runware");
        setVoice("fishaudio:s2.1@pro");
      } else if (appConfig.tts_provider === "edge") {
        setProvider("edge");
        setVoice("id-ID-ArdiNeural");
      } else {
        setProvider("gemini");
        setVoice("Puck");
      }
    }
    if (appConfig.elevenlabs_model) setElevenlabsModel(appConfig.elevenlabs_model);
    if (appConfig.runware_tts_model) setRunwareModel(appConfig.runware_tts_model);
  }, [appConfig, draft, audio?.provider]);

  // Audio Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const ttsMutation = useMutation({
    mutationFn: () => {
      let activeModel: string | undefined = undefined;
      if (provider === "gemini") activeModel = geminiModel;
      else if (provider === "elevenlabs") activeModel = elevenlabsModel;
      else if (provider === "runware") activeModel = runwareModel;

      return api.generateTTS(project.id, {
        provider,
        voice,
        rate: rate >= 0 ? `+${rate}%` : `${rate}%`,
        pitch: pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`,
        model: activeModel,
        fallback_enabled: fallbackEnabled,
        language: projectLanguage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Suara narasi berhasil dibuat dan disinkronkan!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membuat audio suara narasi", "error");
    },
  });

  const syncTimingMutation = useMutation({
    mutationFn: () => api.syncStoryboardTiming(project.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Timing gambar storyboard berhasil disinkronkan dengan Whisper!", "success");
    },
    onError: (err: Error) => {
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
    <div className="flex flex-col w-full pb-16">
      {/* Step Header - Menempel pada Header Stepper */}
      <StoryboardTabHeader
        icon={Volume2}
        title="Voiceover TTS & Sinkronisasi Narasi"
        badge="Langkah 2 • Suara"
        secondaryBadge="Whisper Alignment"
        description="Pilih provider dan model vokal AI untuk membaca naskah. Whisper memetakan durasi tiap segmen ke gambar."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_script")}
              variant="workspace-secondary"
              className="h-9 text-xs"
            >
              Kembali ke Naskah
            </Button>

            {audio && (
              <Button
                size="sm"
                onClick={() => setActiveTab("storyboard_images")}
                variant="workspace-primary"
                className="h-9 gap-1.5 text-xs"
              >
                <span>Lanjut ke Ilustrasi AI</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </>
        }
      />

      {/* Main Tab Content */}
      <div className="max-w-[1920px] w-full mx-auto px-4 sm:px-6 py-5 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Voiceover Controls (5 Cols) */}
          <div className="space-y-5 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6 shadow-sm lg:col-span-5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#C9DDCF] bg-[#ECF3EB] text-[#456A4E]">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#26251F]">Pengaturan Suara Narasi</h3>
                <p className="text-xs text-[#77766D]">Pilih provider dan karakter suara</p>
              </div>
            </div>

            {/* Preset Selector & Save Bar */}
            <div className="space-y-2.5 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bookmark className="w-3.5 h-3.5 text-[#456A4E] shrink-0" />
                  <span className="shrink-0 text-xs font-semibold text-[#4D4A42]">Preset:</span>
                  <select
                    value={selectedVoicePresetId}
                    onChange={(e) => handleLoadVoicePreset(e.target.value)}
                    className="max-w-[200px] truncate rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-xs font-medium text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                  >
                    <option value="" disabled>
                      -- Muat Preset Suara --
                    </option>
                    {voicePresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isBuiltin ? "(Bawaan)" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedVoicePresetId &&
                    !voicePresets.find((p) => p.id === selectedVoicePresetId)?.isBuiltin && (
                      <button
                        type="button"
                        onClick={() => {
                          const cur = voicePresets.find((p) => p.id === selectedVoicePresetId);
                          if (cur) handleDeleteVoicePreset(cur.id, cur.name);
                        }}
                        title="Hapus Preset Kustom Ini"
                        className="p-1 text-[#A9472C] hover:text-[#A9472C] hover:bg-[#F3E1D9] rounded transition shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSaveVoiceModal(!showSaveVoiceModal)}
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-[#C9DDCF] bg-[#ECF3EB] px-2.5 py-1 text-xs font-medium text-[#456A4E] transition hover:bg-[#DFEBDD]"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Simpan Preset</span>
                </button>
              </div>

              {/* Save Voice Preset Inline Form */}
              {showSaveVoiceModal && (
                <form
                  onSubmit={handleSaveVoicePreset}
                  className="flex items-center gap-2 border-t border-[#E5E1D7] pt-2"
                >
                  <Input
                    type="text"
                    placeholder="Nama preset suara (mis. ElevenLabs Adam Cepat)..."
                    value={newVoicePresetName}
                    onChange={(e) => setNewVoicePresetName(e.target.value)}
                    autoFocus
                    className="h-9 flex-1 text-xs"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="workspace-primary"
                    className="h-9 shrink-0 gap-1 px-3 text-xs"
                  >
                    <Save className="w-3 h-3" />
                    <span>Simpan</span>
                  </Button>
                  <button
                    type="button"
                    onClick={() => setShowSaveVoiceModal(false)}
                    className="shrink-0 rounded-lg p-1.5 text-[#77766D] transition hover:bg-[#EAE6DD] hover:text-[#26251F]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>

            <div className="space-y-4">
              {/* Provider */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
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
                        ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42]"
                        : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                    }`}
                  >
                    <div className="text-xs font-bold">Gemini TTS</div>
                    <div className="text-[10px] text-muted-foreground">Natural Studio Voice</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider("elevenlabs");
                      setVoice("Adam");
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      provider === "elevenlabs"
                        ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42]"
                        : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                    }`}
                  >
                    <div className="text-xs font-bold">ElevenLabs</div>
                    <div className="text-[10px] text-muted-foreground">Zero Tone Drift (Gold)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider("runware");
                      setVoice("fishaudio:s2.1@pro");
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      provider === "runware"
                        ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42]"
                        : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                    }`}
                  >
                    <div className="text-xs font-bold">Runware TTS</div>
                    <div className="text-[10px] text-muted-foreground">
                      Fish / Qwen3 / xAI / MiniMax
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider("edge");
                      setVoice(isEnProject ? "en-US-JennyNeural" : "id-ID-ArdiNeural");
                    }}
                    className={`p-2.5 rounded-xl border text-left transition ${
                      provider === "edge"
                        ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42]"
                        : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                    }`}
                  >
                    <div className="text-xs font-bold">Edge-TTS</div>
                    <div className="text-[10px] text-muted-foreground">
                      Multi-Language Neural (Free)
                    </div>
                  </button>
                </div>
              </div>

              {/* Model Selection Dropdown */}
              {provider === "gemini" && (
                <div className="space-y-1.5 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#4D4A42]">Model Gemini TTS</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 text-[#A9472C] border-[#C45B3A]/40"
                    >
                      2.5 Flash Utama
                    </Badge>
                  </div>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] text-foreground text-xs font-medium focus:outline-none focus:border-[#C45B3A]"
                  >
                    {GEMINI_TTS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.badge}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {provider === "elevenlabs" && (
                <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#4D4A42]">Model ElevenLabs</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 text-[#A9472C] border-[#C45B3A]/40"
                    >
                      Multilingual v2
                    </Badge>
                  </div>
                  <select
                    value={elevenlabsModel}
                    onChange={(e) => setElevenlabsModel(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] text-foreground text-xs font-medium focus:outline-none focus:border-[#C45B3A]"
                  >
                    {ELEVENLABS_TTS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.badge}
                      </option>
                    ))}
                  </select>

                  {/* Custom Voice ID Input */}
                  <div className="space-y-1.5 border-t border-[#E5E1D7] pt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Atau masukkan Voice ID dari elevenlabs.io:</span>
                      <a
                        href="https://elevenlabs.io/voice-library"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#C45B3A] hover:underline flex items-center gap-0.5"
                      >
                        Voice Library <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customVoiceInput}
                        onChange={(e) => setCustomVoiceInput(e.target.value)}
                        placeholder="Contoh: pNInz6obpgDQGcFmaJgB"
                        className="flex-1 px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-foreground text-xs font-mono"
                      />
                      <button
                        type="button"
                        disabled={!customVoiceInput.trim()}
                        onClick={() => {
                          const clean = customVoiceInput.trim();
                          setVoice(clean);
                          showToast(`Voice ID '${clean}' dipilih!`, "success");
                        }}
                        className="rounded bg-[#C45B3A] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#A9472C] disabled:opacity-50"
                      >
                        Gunakan
                      </button>
                      <button
                        type="button"
                        disabled={!customVoiceInput.trim()}
                        onClick={() => playVoiceSample(customVoiceInput.trim())}
                        className="rounded border border-[#E5E1D7] bg-[#FBFAF7] p-1.5 text-[#5E5C54] hover:bg-[#F1EEE6]"
                        title="Tes sampel suara"
                      >
                        {sampleAudioPlaying === customVoiceInput.trim() ? (
                          <Pause className="w-3.5 h-3.5 text-[#C45B3A]" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {voice &&
                      !filteredVoices.some((v) => v.id.toLowerCase() === voice.toLowerCase()) && (
                        <div className="text-[10px] text-[#A9472C] font-mono">
                          Voice ID Aktif: {voice}
                        </div>
                      )}
                  </div>
                </div>
              )}

              {provider === "runware" && (
                <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#4D4A42]">Model Runware TTS</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 text-[#A9472C] border-[#C45B3A]/40"
                    >
                      Audio Engine
                    </Badge>
                  </div>
                  <select
                    value={runwareModel}
                    onChange={(e) => {
                      const newM = e.target.value;
                      setRunwareModel(newM);
                      setVoice(newM);
                    }}
                    className="w-full px-2 py-1.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] text-foreground text-xs font-medium focus:outline-none focus:border-[#C45B3A]"
                  >
                    {RUNWARE_TTS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — {m.badge}
                      </option>
                    ))}
                  </select>

                  {/* Custom Voice ID / Speaker Input */}
                  <div className="space-y-1.5 border-t border-[#E5E1D7] pt-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Custom Voice ID / Speaker Name:</span>
                      <span className="text-[#C45B3A] text-[10px]">Opsional</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={runwareCustomVoiceInput}
                        onChange={(e) => setRunwareCustomVoiceInput(e.target.value)}
                        placeholder="Contoh: Ashley, Eve, Leo, presenter_male"
                        className="flex-1 px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-foreground text-xs font-mono"
                      />
                      <button
                        type="button"
                        disabled={!runwareCustomVoiceInput.trim()}
                        onClick={() => {
                          const clean = runwareCustomVoiceInput.trim();
                          setVoice(clean);
                          showToast(`Voice '${clean}' dipilih untuk Runware!`, "success");
                        }}
                        className="rounded bg-[#C45B3A] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#A9472C] disabled:opacity-50"
                      >
                        Gunakan
                      </button>
                      <button
                        type="button"
                        disabled={!runwareCustomVoiceInput.trim()}
                        onClick={() => playVoiceSample(runwareCustomVoiceInput.trim())}
                        className="rounded border border-[#E5E1D7] bg-[#FBFAF7] p-1.5 text-[#5E5C54] hover:bg-[#F1EEE6]"
                        title="Tes sampel audio"
                      >
                        {sampleAudioPlaying === runwareCustomVoiceInput.trim() ? (
                          <Pause className="w-3.5 h-3.5 text-[#C45B3A]" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    {voice &&
                      !filteredVoices.some((v) => v.id.toLowerCase() === voice.toLowerCase()) && (
                        <div className="text-[10px] text-[#A9472C] font-mono">
                          Voice Aktif: {voice}
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Voice Characters Selection (with Audio Sample Tester) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[#4D4A42]">
                    Pustaka Suara ({filteredVoices.length} Karakter)
                  </label>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {filteredVoices.map((v) => {
                    const isSelected = voice === v.id;
                    const isPlayingSample = sampleAudioPlaying === v.id;
                    const isEn = v.id.startsWith("en-");
                    const isId = v.id.startsWith("id-");
                    const isJa = v.id.startsWith("ja-");
                    return (
                      <div
                        key={v.id}
                        onClick={() => setVoice(v.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          isSelected
                            ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42] ring-1 ring-[#C45B3A]/30"
                            : "bg-[#FFFEFA] border-[#E5E1D7] text-[#4D4A42] hover:bg-[#F1EEE6] hover:border-[#C9C3B6]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <span className="text-xs font-bold truncate">{v.name}</span>
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 text-muted-foreground"
                            >
                              {v.gender}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className={`text-[9px] py-0 px-1 font-mono ${
                                isEn
                                  ? "bg-[#EAF0F5] text-[#41627F] border-[#CFDDE9]"
                                  : isId
                                    ? "bg-[#ECF3EB] text-[#456A4E] border-[#C9DDCF]"
                                    : isJa
                                      ? "bg-[#F7EFE0] text-[#8A6A2F] border-[#E8D9BC]"
                                      : "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                              }`}
                            >
                              {isEn ? "🇬🇧 EN" : isId ? "🇮🇩 ID" : isJa ? "🇯🇵 JA" : "🌐 Multi"}
                            </Badge>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#C45B3A] shrink-0" />
                          )}
                        </div>

                        <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                          {v.description}
                        </p>

                        <div className="flex items-center justify-between border-t border-[#E5E1D7] pt-1.5 text-xs">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playVoiceSample(v.id);
                            }}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] transition ${
                              isPlayingSample
                                ? "bg-[#C45B3A] font-medium text-white"
                                : "border border-[#E5E1D7] bg-[#FBFAF7] text-[#4D4A42] hover:bg-[#F1EEE6]"
                            }`}
                          >
                            {loadingSampleVoiceId === v.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : isPlayingSample ? (
                              <Pause className="w-3 h-3 fill-current" />
                            ) : (
                              <Play className="w-3 h-3 fill-current" />
                            )}
                            <span>{isPlayingSample ? "Jeda" : "Dengar Sampel"}</span>
                          </button>
                          <span className="text-[9px] text-muted-foreground font-mono">{v.id}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Speed & Pitch Slider */}
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-semibold text-[#4D4A42]">Kecepatan Bicara</span>
                    <span className="font-mono text-[#C45B3A]">
                      {rate >= 0 ? `+${rate}%` : `${rate}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-20}
                    max={30}
                    step={5}
                    value={rate}
                    onChange={(e) => setRate(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className="font-semibold text-[#4D4A42]">Pitch Nada</span>
                    <span className="font-mono text-[#C45B3A]">
                      {pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={3}
                    value={pitch}
                    onChange={(e) => setPitch(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
                  />
                </div>
              </div>

              {/* Fallback Checkbox */}
              <div className="border-t border-[#E5E1D7] pt-2">
                <label className="flex items-start gap-2 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={fallbackEnabled}
                    onChange={(e) => setFallbackEnabled(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-[#D2CDBF] bg-[#FFFEFA] text-[#C45B3A] focus:ring-[#C45B3A] focus:ring-offset-0"
                  />
                  <div>
                    <span className="text-[11px] font-medium text-[#4D4A42] transition-colors group-hover:text-[#26251F]">
                      Fallback otomatis ke Edge-TTS saat error/kuota habis
                    </span>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      Jika tidak dicentang, proses berhenti dengan error dan audio terpotong pada
                      bagian yang gagal.
                    </p>
                  </div>
                </label>
              </div>

              <Button
                type="button"
                onClick={() => ttsMutation.mutate()}
                disabled={ttsMutation.isPending || segments.length === 0}
                variant="workspace-primary"
                className="mt-2 w-full gap-2 py-2.5 text-xs"
              >
                {ttsMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mensintesis Audio & Alignment (15–30s)...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>
                      {audio ? "Generate Ulang Suara TTS" : "Generate Suara Narasi (TTS)"}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right Column: Audio Playback & Alignment Status (7 Cols) */}
          <div className="lg:col-span-7 space-y-5">
            {!audio ? (
              <div className="rounded-2xl border border-dashed border-[#D2CDBF] bg-[#FBFAF7] p-12 text-center">
                <Volume2 className="w-12 h-12 text-[#858176] mx-auto mb-3" />
                <h3 className="mb-1.5 text-base font-semibold text-[#26251F]">
                  Audio Belum Dibuat
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4 leading-relaxed">
                  Pilih karakter vokal di panel sebelah kiri lalu klik tombol{" "}
                  <strong>Generate Suara Narasi</strong>. Sistem akan mensintesis audio lengkap dan
                  memetakan waktu kemunculan tiap gambar.
                </p>
              </div>
            ) : (
              <div className="space-y-6 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6 shadow-sm">
                {/* Audio Player Card */}
                <div className="space-y-4 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-4">
                  <audio
                    ref={audioRef}
                    src={audio.audio_url || audio.file_url || undefined}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={togglePlay}
                        className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#C45B3A] text-white shadow-sm transition hover:bg-[#A9472C]"
                      >
                        {isPlaying ? (
                          <Pause className="w-5 h-5" />
                        ) : (
                          <Play className="w-5 h-5 ml-0.5" />
                        )}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#26251F]">
                          <span>Audio Narasi Storyboard</span>
                          <Badge variant="workspace" className="text-[10px] uppercase font-mono">
                            {audio.provider} • {audio.voice}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Durasi Total: {formatTime(duration || audio.duration || 0)}
                        </p>
                      </div>
                    </div>

                    <span className="text-xs font-mono font-bold text-[#C45B3A]">
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
                    className="h-2 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
                  />
                </div>

                {/* Timing Alignment Status */}
                <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#456A4E]" />
                      <h4 className="text-xs font-semibold text-[#26251F]">
                        Status Sinkronisasi Waktu (Whisper Alignment)
                      </h4>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncTimingMutation.mutate()}
                      disabled={syncTimingMutation.isPending}
                      className="border-[#E5E1D7] text-[11px] gap-1.5 h-7"
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
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#26251F]">
                      Naskah Berjalan Sesuai Audio:
                    </h4>
                    {(segments.length > 0 || narration?.raw_text) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyAllNarration}
                        className="flex h-8 items-center gap-1.5 border-[#E5E1D7] bg-[#FFFEFA] px-2.5 text-[11px] font-medium transition-all hover:border-[#C45B3A] hover:bg-[#F8EEEA] hover:text-[#A9472C]"
                      >
                        {hasCopiedNarration ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#456A4E]" />
                            <span className="text-[#456A4E] font-semibold">Tersalin!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#77766D]" />
                            <span>Salin Semua Narasi</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {segments.map((seg: SentenceSegment, idx: number) => {
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
                              ? "border-[#C45B3A] bg-[#F8EEEA] font-medium text-[#A9472C] ring-1 ring-[#E9C9BD]"
                              : "border-[#E5E1D7] bg-[#FFFEFA] text-[#4D4A42] hover:border-[#C9C3B6]"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span className="font-mono font-bold text-[#A9472C]">
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
                    variant="workspace-primary"
                    className="gap-2 text-xs"
                  >
                    <span>Langkah Berikutnya: Studio Ilustrasi AI ➔</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

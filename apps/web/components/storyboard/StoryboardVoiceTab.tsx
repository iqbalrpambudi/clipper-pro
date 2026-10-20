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
    <div className="space-y-8 max-w-8xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 2 dari 6
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Sintesis Vokal & Audio Alignment
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Voiceover TTS & Sinkronisasi Narasi Audio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pilih model vokal AI untuk membaca naskah video Anda. Mesin Whisper akan memetakan
            durasi kata demi kata ke tiap gambar ilustrasi.
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

          {/* Preset Selector & Save Bar */}
          <div className="p-3 rounded-xl bg-[#141414] border border-[#2A2A2A] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bookmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-300 shrink-0">Preset:</span>
                <select
                  value={selectedVoicePresetId}
                  onChange={(e) => handleLoadVoicePreset(e.target.value)}
                  className="bg-[#1C1C1C] border border-[#333] hover:border-emerald-500/50 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500 font-medium truncate max-w-[200px]"
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
                      className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
              </div>

              <button
                type="button"
                onClick={() => setShowSaveVoiceModal(!showSaveVoiceModal)}
                className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 hover:text-white transition flex items-center gap-1 font-medium shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Simpan Preset</span>
              </button>
            </div>

            {/* Save Voice Preset Inline Form */}
            {showSaveVoiceModal && (
              <form
                onSubmit={handleSaveVoicePreset}
                className="flex items-center gap-2 pt-2 border-t border-[#222]"
              >
                <Input
                  type="text"
                  placeholder="Nama preset suara (mis. ElevenLabs Adam Cepat)..."
                  value={newVoicePresetName}
                  onChange={(e) => setNewVoicePresetName(e.target.value)}
                  autoFocus
                  className="h-8 text-xs bg-[#1A1A1A] border-[#333] flex-1 text-white"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 gap-1 shrink-0"
                >
                  <Save className="w-3 h-3" />
                  <span>Simpan</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setShowSaveVoiceModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
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
                    setProvider("elevenlabs");
                    setVoice("Adam");
                  }}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    provider === "elevenlabs"
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
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
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
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
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
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
              <div className="p-2.5 rounded-xl bg-[#141414] border border-[#2E2E2E] space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Model Gemini TTS</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 text-violet-300 border-violet-500/40"
                  >
                    2.5 Flash Utama
                  </Badge>
                </div>
                <select
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#1A1A1A] rounded-lg border border-[#333] text-foreground text-xs font-medium focus:outline-none focus:border-violet-500"
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
              <div className="p-2.5 rounded-xl bg-[#141414] border border-[#2E2E2E] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Model ElevenLabs</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 text-violet-300 border-violet-500/40"
                  >
                    Multilingual v2
                  </Badge>
                </div>
                <select
                  value={elevenlabsModel}
                  onChange={(e) => setElevenlabsModel(e.target.value)}
                  className="w-full px-2 py-1.5 bg-[#1A1A1A] rounded-lg border border-[#333] text-foreground text-xs font-medium focus:outline-none focus:border-violet-500"
                >
                  {ELEVENLABS_TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.badge}
                    </option>
                  ))}
                </select>

                {/* Custom Voice ID Input */}
                <div className="pt-2 border-t border-[#2E2E2E] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Atau masukkan Voice ID dari elevenlabs.io:</span>
                    <a
                      href="https://elevenlabs.io/voice-library"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-400 hover:underline flex items-center gap-0.5"
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
                      className="flex-1 px-2 py-1 bg-[#1A1A1A] rounded border border-[#333] text-foreground text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={!customVoiceInput.trim()}
                      onClick={() => {
                        const clean = customVoiceInput.trim();
                        setVoice(clean);
                        showToast(`Voice ID '${clean}' dipilih!`, "success");
                      }}
                      className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Gunakan
                    </button>
                    <button
                      type="button"
                      disabled={!customVoiceInput.trim()}
                      onClick={() => playVoiceSample(customVoiceInput.trim())}
                      className="p-1.5 bg-[#222] hover:bg-[#333] text-slate-300 rounded border border-[#333]"
                      title="Tes sampel suara"
                    >
                      {sampleAudioPlaying === customVoiceInput.trim() ? (
                        <Pause className="w-3.5 h-3.5 text-violet-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {voice &&
                    !filteredVoices.some((v) => v.id.toLowerCase() === voice.toLowerCase()) && (
                      <div className="text-[10px] text-violet-300 font-mono">
                        Voice ID Aktif: {voice}
                      </div>
                    )}
                </div>
              </div>
            )}

            {provider === "runware" && (
              <div className="p-2.5 rounded-xl bg-[#141414] border border-[#2E2E2E] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Model Runware TTS</span>
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 text-violet-300 border-violet-500/40"
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
                  className="w-full px-2 py-1.5 bg-[#1A1A1A] rounded-lg border border-[#333] text-foreground text-xs font-medium focus:outline-none focus:border-violet-500"
                >
                  {RUNWARE_TTS_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.badge}
                    </option>
                  ))}
                </select>

                {/* Custom Voice ID / Speaker Input */}
                <div className="pt-2 border-t border-[#2E2E2E] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Custom Voice ID / Speaker Name:</span>
                    <span className="text-violet-400 text-[10px]">Opsional</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={runwareCustomVoiceInput}
                      onChange={(e) => setRunwareCustomVoiceInput(e.target.value)}
                      placeholder="Contoh: Ashley, Eve, Leo, presenter_male"
                      className="flex-1 px-2 py-1 bg-[#1A1A1A] rounded border border-[#333] text-foreground text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={!runwareCustomVoiceInput.trim()}
                      onClick={() => {
                        const clean = runwareCustomVoiceInput.trim();
                        setVoice(clean);
                        showToast(`Voice '${clean}' dipilih untuk Runware!`, "success");
                      }}
                      className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded text-xs font-medium"
                    >
                      Gunakan
                    </button>
                    <button
                      type="button"
                      disabled={!runwareCustomVoiceInput.trim()}
                      onClick={() => playVoiceSample(runwareCustomVoiceInput.trim())}
                      className="p-1.5 bg-[#222] hover:bg-[#333] text-slate-300 rounded border border-[#333]"
                      title="Tes sampel audio"
                    >
                      {sampleAudioPlaying === runwareCustomVoiceInput.trim() ? (
                        <Pause className="w-3.5 h-3.5 text-violet-400" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {voice &&
                    !filteredVoices.some((v) => v.id.toLowerCase() === voice.toLowerCase()) && (
                      <div className="text-[10px] text-violet-300 font-mono">
                        Voice Aktif: {voice}
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Voice Characters Selection (with Audio Sample Tester) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300">
                  Pustaka Suara ({filteredVoices.length} Karakter)
                </label>
                {/* Locked Language Status Badge */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground/75 font-mono">🔒</span>
                  {projectLanguage === "en" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25">
                      <span>🇬🇧</span> English (Terkunci)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                      <span>🇮🇩</span> Indonesia (Terkunci)
                    </span>
                  )}
                </div>
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
                          ? "bg-violet-500/20 border-violet-500 text-violet-200 ring-1 ring-violet-500/40"
                          : "bg-[#141414] border-[#2E2E2E] text-slate-300 hover:bg-[#1A1A1A] hover:border-[#3E3E3E]"
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
                                ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                                : isId
                                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                  : isJa
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                    : "bg-purple-500/15 text-purple-300 border-purple-500/30"
                            }`}
                          >
                            {isEn ? "🇬🇧 EN" : isId ? "🇮🇩 ID" : isJa ? "🇯🇵 JA" : "🌐 Multi"}
                          </Badge>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                        )}
                      </div>

                      <p className="text-[11px] text-muted-foreground line-clamp-2 mb-2">
                        {v.description}
                      </p>

                      <div className="flex items-center justify-between pt-1.5 border-t border-[#2E2E2E]/60 text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playVoiceSample(v.id);
                          }}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] transition ${
                            isPlayingSample
                              ? "bg-violet-600 text-white font-medium"
                              : "bg-[#222] hover:bg-[#333] text-slate-300 border border-[#333]"
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
                  <span className="text-slate-300 font-semibold">Kecepatan Bicara</span>
                  <span className="font-mono text-violet-400">
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
                  className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="text-slate-300 font-semibold">Pitch Nada</span>
                  <span className="font-mono text-violet-400">
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
                Pilih karakter vokal di panel sebelah kiri lalu klik tombol{" "}
                <strong>Generate Suara Narasi</strong>. Sistem akan mensintesis audio lengkap dan
                memetakan waktu kemunculan tiap gambar.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-6 shadow-xl">
              {/* Audio Player Card */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#171717] to-[#141414] border border-[#2E2E2E] space-y-4">
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
                      className="w-12 h-12 rounded-xl bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow-lg shadow-violet-500/20 transition"
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" />
                      )}
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
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Naskah Berjalan Sesuai Audio:
                  </h4>
                  {(segments.length > 0 || narration?.raw_text) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyAllNarration}
                      className="h-7 px-2.5 text-[11px] font-medium border-[#333] bg-[#181818] hover:bg-violet-600/20 hover:text-violet-300 hover:border-violet-500/50 transition-all flex items-center gap-1.5"
                    >
                      {hasCopiedNarration ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
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

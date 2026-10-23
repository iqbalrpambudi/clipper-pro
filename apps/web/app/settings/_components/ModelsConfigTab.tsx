"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Volume2,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  RotateCcw,
  Check,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { DEFAULT_IMAGE_STYLE_PROMPT } from "@/lib/constants";
import { useStudioStore } from "@/lib/store";
import { Badge, Button, Input, NativeSelect, Textarea, WorkspaceChip } from "@/components/ui";

interface TestConnectionResult {
  success: boolean;
  message: string;
  latency_ms?: number;
}

interface TestTtsResult {
  success: boolean;
  message: string;
  latency_ms?: number;
  provider_status?: string;
}

interface TestImageResult {
  success: boolean;
  message: string;
  latency_ms?: number;
  image_model_status?: string;
}

export function ModelsConfigTab() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("gemini-2.5-flash");
  const [visionModel, setVisionModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [ttsProvider, setTtsProvider] = useState("gemini");
  const [ttsModel, setTtsModel] = useState("gemini-2.5-flash-preview-tts");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");
  const [elevenlabsModel, setElevenlabsModel] = useState("eleven_multilingual_v2");
  const [runwareApiKey, setRunwareApiKey] = useState("");
  const [runwareTtsModel, setRunwareTtsModel] = useState("fishaudio:s2.1@pro");
  const [testTtsResult, setTestTtsResult] = useState<TestTtsResult | null>(null);
  const [isTestingTts, setIsTestingTts] = useState(false);

  // AI Image Generator State
  const [imageBaseUrl, setImageBaseUrl] = useState("");
  const [imageModel, setImageModel] = useState("dall-e-3");
  const [imageConcurrency, setImageConcurrency] = useState<number>(2);
  const [imageApiKey, setImageApiKey] = useState("");
  const [imageSystemPrompt, setImageSystemPrompt] = useState(DEFAULT_IMAGE_STYLE_PROMPT);
  const [testImageResult, setTestImageResult] = useState<TestImageResult | null>(null);
  const [isTestingImage, setIsTestingImage] = useState(false);
  const [availableImageModels, setAvailableImageModels] = useState<string[]>([]);
  const [featuredImageModels, setFeaturedImageModels] = useState<string[]>([]);
  const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
  const [isImageDropdownOpen, setIsImageDropdownOpen] = useState(false);
  const [imageModelSearch, setImageModelSearch] = useState("");
  const [imageTabFilter, setImageTabFilter] = useState<"image_only" | "all">("image_only");
  const imageDropdownRef = useRef<HTMLDivElement>(null);

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (imageDropdownRef.current && !imageDropdownRef.current.contains(event.target as Node)) {
        setIsImageDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const { data: config } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.base_url || "");
      setChatModel(config.chat_model || "gemini-2.5-flash");
      setVisionModel(config.vision_model || "gemini-2.5-flash");
      if (
        config.tts_provider === "elevenlabs" ||
        config.tts_provider === "runware" ||
        config.tts_provider === "edge"
      ) {
        setTtsProvider(config.tts_provider);
      } else {
        setTtsProvider("gemini");
      }
      if (config.tts_provider && config.tts_provider.startsWith("gemini-")) {
        setTtsModel(config.tts_provider);
      } else {
        setTtsModel("gemini-2.5-flash-preview-tts");
      }
      if (config.elevenlabs_model) setElevenlabsModel(config.elevenlabs_model);
      if (config.runware_tts_model) setRunwareTtsModel(config.runware_tts_model);
      setImageBaseUrl(config.image_base_url || "");
      setImageModel(config.image_model || "dall-e-3");
      setImageConcurrency(config.image_concurrency || 2);
      if (config.image_system_prompt) {
        setImageSystemPrompt(config.image_system_prompt);
      }
    }
  }, [config]);

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    try {
      const res = await api.getAvailableModels(baseUrl.trim(), apiKey.trim());
      if (res.models && res.models.length > 0) {
        setAvailableModels(res.models);
        showToast(`Ditemukan ${res.models.length} model dari endpoint!`, "success");
      } else {
        showToast("Tidak ada model yang ditemukan dari endpoint", "info");
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Gagal mengambil daftar model", "error");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleFetchImageModels = async () => {
    setIsFetchingImageModels(true);
    try {
      const res = await api.getAvailableModels(imageBaseUrl.trim(), imageApiKey.trim(), "image");
      const models = res.models || [];
      const imageModels = res.image_models || [];
      setAvailableImageModels(models);
      setFeaturedImageModels(imageModels);
      setIsImageDropdownOpen(true);
      if (models.length > 0) {
        showToast(
          `Ditemukan ${models.length} model dari endpoint (${imageModels.length} model gambar)!`,
          "success"
        );
      } else {
        showToast("Tidak ada model yang ditemukan dari endpoint image", "info");
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Gagal mengambil daftar model image", "error");
    } finally {
      setIsFetchingImageModels(false);
    }
  };

  const isImageModelName = (name: string) => {
    if (featuredImageModels.length > 0) {
      return featuredImageModels.includes(name);
    }
    const lower = name.toLowerCase();
    return (
      lower.includes("image") ||
      lower.includes("flux") ||
      lower.includes("dall") ||
      lower.includes("runware") ||
      lower.includes("recraft") ||
      lower.includes("diffusion") ||
      lower.includes("sdxl") ||
      lower.includes("midjourney") ||
      lower.includes("imagen")
    );
  };

  const saveMutation = useMutation({
    mutationFn: api.saveModelConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-config"] });
      showToast("Konfigurasi model & AI image berhasil disimpan terenkripsi!", "success");
      setApiKey("");
      setTtsApiKey("");
      setElevenlabsApiKey("");
      setRunwareApiKey("");
      setImageApiKey("");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan konfigurasi", "error");
    },
  });

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        base_url: baseUrl.trim() || undefined,
        chat_model: chatModel.trim(),
        vision_model: visionModel.trim(),
        api_key: apiKey.trim() || undefined,
      });
      setTestResult(res);
      if (res.success) {
        showToast(res.message, "success");
      } else {
        showToast(res.message, "error");
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Koneksi gagal",
      });
      showToast("Test koneksi gagal", "error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestTts = async () => {
    setIsTestingTts(true);
    setTestTtsResult(null);
    try {
      let key = "";
      let model = "";
      if (ttsProvider === "gemini") {
        key = ttsApiKey;
        model = ttsModel;
      } else if (ttsProvider === "elevenlabs") {
        key = elevenlabsApiKey;
        model = elevenlabsModel;
      } else if (ttsProvider === "runware") {
        key = runwareApiKey || imageApiKey;
        model = runwareTtsModel;
      }
      const res = await api.testTtsConnection({
        provider: ttsProvider,
        api_key: key.trim() || undefined,
        model: model.trim() || undefined,
      });
      setTestTtsResult(res);
      if (res.success) {
        showToast(res.message, "success");
      } else {
        showToast(res.message, "error");
      }
    } catch (err: unknown) {
      const failed: TestTtsResult = {
        success: false,
        message: err instanceof Error ? err.message : "Gagal tes koneksi TTS",
        latency_ms: 0,
      };
      setTestTtsResult(failed);
      showToast(failed.message, "error");
    } finally {
      setIsTestingTts(false);
    }
  };

  const handleTestImageConnection = async () => {
    setIsTestingImage(true);
    setTestImageResult(null);
    try {
      const res = await api.testImageConnection({
        base_url: imageBaseUrl.trim() || undefined,
        image_model: imageModel.trim() || undefined,
        api_key: imageApiKey.trim() || undefined,
      });
      setTestImageResult(res);
      if (res.success) {
        showToast(res.message, "success");
      } else {
        showToast(res.message, "error");
      }
    } catch (err: unknown) {
      setTestImageResult({
        success: false,
        message: err instanceof Error ? err.message : "Test koneksi gambar gagal",
      });
      showToast("Test koneksi gambar gagal", "error");
    } finally {
      setIsTestingImage(false);
    }
  };

  const handleSaveModel = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      base_url: baseUrl.trim() || null,
      chat_model: chatModel.trim(),
      vision_model: visionModel.trim(),
      api_key: apiKey.trim() || undefined,
      tts_provider: ttsProvider === "gemini" ? ttsModel : ttsProvider,
      tts_api_key: ttsApiKey.trim() || undefined,
      elevenlabs_api_key: elevenlabsApiKey.trim() || undefined,
      elevenlabs_model: elevenlabsModel,
      runware_api_key: runwareApiKey.trim() || undefined,
      runware_tts_model: runwareTtsModel,
      image_base_url: imageBaseUrl.trim() || null,
      image_model: imageModel.trim() || "dall-e-3",
      image_concurrency: imageConcurrency,
      image_api_key: imageApiKey.trim() || undefined,
      image_system_prompt: imageSystemPrompt.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSaveModel} className="space-y-6">
      {/* Section 1: LLM & Vision Config */}
      <div className="rounded-xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white">1. Konfigurasi LLM & Vision Model</h3>
          </div>
          <Badge variant="workspace-accent" className="px-2 py-0.5 font-mono text-[10px]">
            OpenAI & Gemini Compatible
          </Badge>
        </div>

        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">API Base URL</label>
            <Input
              type="text"
              placeholder="http://localhost:20128/v1 atau https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          {/* Datalist for Available Models */}
          <datalist id="available-models-list">
            {availableModels.length > 0 ? (
              availableModels.map((m) => <option key={m} value={m} />)
            ) : (
              <>
                <option value="gemini-2.5-flash" />
                <option value="gemini-2.5-pro" />
                <option value="gemini-flash-latest" />
                <option value="gpt-4o" />
                <option value="gpt-4o-mini" />
              </>
            )}
          </datalist>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Chat Model (Naskah Narasi)
                </label>
                <Button
                  type="button"
                  onClick={handleFetchModels}
                  disabled={isFetchingModels}
                  variant="workspace-quiet"
                  size="workspace-sm"
                  className="h-7 px-2 gap-1 font-mono text-[10px]"
                >
                  {isFetchingModels ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-2.5 h-2.5" />
                  )}
                  <span>
                    {availableModels.length > 0 ? `${availableModels.length} Model` : "Tarik Model"}
                  </span>
                </Button>
              </div>
              <Input
                type="text"
                required
                list="available-models-list"
                placeholder="gemini atau gpt-4o-mini"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Vision Model (Tagging Scene Video)
                </label>
                {availableModels.length > 0 && (
                  <span className="text-[10px] text-slate-400 font-mono">Datalist aktif</span>
                )}
              </div>
              <Input
                type="text"
                required
                list="available-models-list"
                placeholder="gemini atau gpt-4o-mini"
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">API Key</label>
              {config?.has_api_key && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  Tersimpan: {config.api_key_masked}
                </span>
              )}
            </div>
            <Input
              type="password"
              placeholder={
                config?.has_api_key
                  ? "Ketik untuk mengganti API key..."
                  : "Masukkan API key AI (opsional untuk 9Router)..."
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
        </div>

        {/* Test Connection Button */}
        <div className="pt-3 flex items-center justify-between border-t border-surface-border">
          <Button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            variant="workspace-secondary"
            className="gap-2"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
            )}
            <span>Test Connection</span>
          </Button>

          {testResult && (
            <div
              className={`text-xs font-mono flex items-center gap-1.5 ${testResult.success ? "text-emerald-400" : "text-rose-400"}`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>
                {testResult.message} ({testResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Section 2: TTS Configuration */}
      <div className="rounded-xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">2. Konfigurasi Text-to-Speech (TTS)</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="workspace-success" className="px-2 py-0.5 font-mono text-[10px]">
              Gemini / ElevenLabs / Runware
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Default TTS Provider
            </label>
            <NativeSelect value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value)}>
              <option value="gemini">Gemini TTS (Google AI High-Fidelity)</option>
              <option value="elevenlabs">
                ElevenLabs TTS (Gold Standard — Zero Intonation Drift)
              </option>
              <option value="runware">
                Runware TTS (Fish Audio / Qwen3 / Inworld — Hemat & Cepat)
              </option>
              <option value="edge">Edge-TTS (Natural Indonesian Neural, Gratis)</option>
            </NativeSelect>
          </div>

          {/* Gemini Model & Key */}
          {ttsProvider === "gemini" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Gemini TTS Model
                </label>
                <NativeSelect value={ttsModel} onChange={(e) => setTtsModel(e.target.value)}>
                  <option value="gemini-2.5-flash-preview-tts">
                    Gemini 2.5 Flash TTS (direkomendasikan, paling stabil & konsisten)
                  </option>
                  <option value="gemini-3.8-flash-lite-tts">
                    Gemini 3.8 Flash-Lite TTS (cepat & hemat)
                  </option>
                  <option value="gemini-3.8-flash-tts">
                    Gemini 3.8 Flash TTS (kualitas studio)
                  </option>
                  <option value="gemini-3.1-flash-tts-preview">Gemini 3.1 Flash TTS Preview</option>
                  <option value="gemini-flash-latest">
                    Gemini Flash Latest (auto versi terbaru)
                  </option>
                  <option value="gemini-2.5-pro-preview-tts">
                    Gemini 2.5 Pro TTS Preview (high-res)
                  </option>
                </NativeSelect>
                <p className="text-[10px] text-slate-500 mt-1">
                  Gemini 2.5 Flash TTS kini mendukung single-pass hingga 2.200 karakter (~2.5 menit)
                  untuk intonasi vokal seragam.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Gemini TTS API Key (Tersimpan Terenkripsi)
                  </label>
                  {config?.has_tts_api_key && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tersimpan: {config.tts_api_key_masked}
                    </span>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={
                    config?.has_tts_api_key
                      ? "Ketik untuk mengganti Gemini TTS key..."
                      : "Gemini API Key khusus TTS (opsional jika sama dengan LLM)..."
                  }
                  value={ttsApiKey}
                  onChange={(e) => setTtsApiKey(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </>
          )}

          {/* ElevenLabs Model & Key */}
          {ttsProvider === "elevenlabs" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ElevenLabs Model
                </label>
                <NativeSelect
                  value={elevenlabsModel}
                  onChange={(e) => setElevenlabsModel(e.target.value)}
                >
                  <option value="eleven_v4_turbo">
                    Eleven v4 Turbo (Generasi Terbaru — Latensi Cepat & Emosional)
                  </option>
                  <option value="eleven_v4">
                    Eleven v4 (Flagship — Kualitas Sinematik Tertinggi)
                  </option>
                  <option value="eleven_multilingual_v2">
                    Eleven Multilingual v2 (Direkomendasikan — Kualitas vokal paling stabil)
                  </option>
                  <option value="eleven_flash_v2_5">
                    Eleven Flash v2.5 (Hemat Kuota 50% & Super Cepat)
                  </option>
                  <option value="eleven_turbo_v2_5">Eleven Turbo v2.5 (Generasi Sebelumnya)</option>
                </NativeSelect>
                <p className="text-[10px] text-slate-500 mt-1">
                  Mendukung hingga 4.500 karakter per request tanpa pemisahan audio, intonasi vokal
                  100% konsisten dari awal hingga akhir.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    ElevenLabs API Key (Tersimpan Terenkripsi)
                  </label>
                  {config?.has_elevenlabs_api_key && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tersimpan: {config.elevenlabs_api_key_masked}
                    </span>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={
                    config?.has_elevenlabs_api_key
                      ? "Ketik untuk mengganti ElevenLabs API key..."
                      : "xi-api-key (dari elevenlabs.io)..."
                  }
                  value={elevenlabsApiKey}
                  onChange={(e) => setElevenlabsApiKey(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </>
          )}

          {/* Runware Model & Key */}
          {ttsProvider === "runware" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Runware TTS Model
                </label>
                <NativeSelect
                  value={runwareTtsModel}
                  onChange={(e) => setRunwareTtsModel(e.target.value)}
                >
                  <option value="fishaudio:s2.1@pro">
                    Fish Audio S2.1 Pro (Ultra-natural TTS & intonasi stabil)
                  </option>
                  <option value="alibaba:qwen3-tts-1.7b-customvoice">
                    Alibaba Qwen3-TTS 1.7B (Aksen Asia & Indonesia natural)
                  </option>
                  <option value="inworld:tts@2">
                    Inworld Realtime TTS-2 (Vokal dinamis untuk storytelling)
                  </option>
                  <option value="xai:tts@0">xAI TTS Grok (Vokal ekspresif & speech tags)</option>
                  <option value="minimax:speech@2.8">
                    MiniMax Speech 2.8 (High-realism prosody & emosional)
                  </option>
                </NativeSelect>
                <p className="text-[10px] text-slate-500 mt-1">
                  Model audioInference Runware.ai dengan biaya sangat hemat ($0.0005/detik) dan
                  latensi tinggi.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Runware API Key (Tersimpan Terenkripsi)
                  </label>
                  {(config?.has_runware_api_key || config?.has_image_api_key) && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tersimpan: {config.runware_api_key_masked || config.image_api_key_masked}
                    </span>
                  )}
                </div>
                <Input
                  type="password"
                  placeholder={
                    config?.has_runware_api_key || config?.has_image_api_key
                      ? "Ketik untuk mengganti Runware API key (atau kosongkan untuk pakai key Image)..."
                      : "Runware API Key (dari runware.ai)..."
                  }
                  value={runwareApiKey}
                  onChange={(e) => setRunwareApiKey(e.target.value)}
                  className="text-xs font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Otomatis menggunakan Image API Key jika Anda sudah mengonfigurasi Runware pada
                  Section 3 di bawah.
                </p>
              </div>
            </>
          )}

        </div>

        {/* TTS Test Connection Button & Result */}
        <div className="pt-3 border-t border-surface-border/50 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleTestTts}
            disabled={isTestingTts}
            variant="workspace-secondary"
            className="gap-2"
          >
            {isTestingTts ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Test Koneksi TTS ({ttsProvider.toUpperCase()})</span>
          </Button>

          {testTtsResult && (
            <div
              className={`text-xs font-mono flex items-center gap-1.5 ${testTtsResult.success ? "text-emerald-400" : "text-rose-400"}`}
            >
              {testTtsResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>
                {testTtsResult.message} ({testTtsResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: AI Image Generator Configuration */}
      <div className="rounded-xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">
              3. Konfigurasi AI Image Generator (Storyboard Explainer)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="workspace-success" className="px-2 py-0.5 font-mono text-[10px]">
              Paralel {imageConcurrency}x Request
            </Badge>
            <Badge variant="workspace-accent" className="px-2 py-0.5 font-mono text-[10px]">
              Runware / Gemini / OpenAI / SD
            </Badge>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Image API Base URL
            </label>
            <Input
              type="text"
              placeholder="https://api.runware.ai/v1, http://localhost:port/v1, atau https://api.openai.com/v1..."
              value={imageBaseUrl}
              onChange={(e) => setImageBaseUrl(e.target.value)}
              className="text-xs font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative" ref={imageDropdownRef}>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Image Model Name
                </label>
                <Button
                  type="button"
                  onClick={handleFetchImageModels}
                  disabled={isFetchingImageModels}
                  variant="workspace-quiet"
                  size="workspace-sm"
                  className="h-7 px-2 gap-1 font-mono text-[10px]"
                  title="Ambil model dari endpoint Image Base URL"
                >
                  {isFetchingImageModels ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-2.5 h-2.5" />
                  )}
                  <span>
                    {availableImageModels.length > 0
                      ? `${availableImageModels.length} Model`
                      : "Tarik Model dari Endpoint"}
                  </span>
                </Button>
              </div>

              <div className="relative">
                <Input
                  type="text"
                  list="available-image-models-list"
                  placeholder="Ketik atau cari model, misal: inferhub/cb/gemini-2.5-flash-image"
                  value={imageModel}
                  onChange={(e) => {
                    setImageModel(e.target.value);
                    setImageModelSearch(e.target.value);
                    setIsImageDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (availableImageModels.length === 0) {
                      handleFetchImageModels();
                    } else {
                      setIsImageDropdownOpen(true);
                    }
                  }}
                  className="pr-9 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setIsImageDropdownOpen((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg transition"
                  title="Tampilkan daftar model"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isImageDropdownOpen ? "rotate-180 text-violet-400" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Datalist native fallback */}
              <datalist id="available-image-models-list">
                {availableImageModels.length > 0 ? (
                  availableImageModels.map((m) => <option key={m} value={m} />)
                ) : (
                  <>
                    <option value="runware:100@1" />
                    <option value="inferhub/cb/gemini-2.5-flash-image" />
                    <option value="dall-e-3" />
                    <option value="flux-schnell" />
                  </>
                )}
              </datalist>

              {/* Custom Searchable Autocomplete Dropdown */}
              {isImageDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-2.5 shadow-xl animate-scale-pop">
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#E5E1D7] bg-[#F1EEE6] px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <Input
                      type="text"
                      placeholder="Cari model dari endpoint..."
                      value={imageModelSearch}
                      onChange={(e) => setImageModelSearch(e.target.value)}
                      className="h-8 border-0 bg-transparent text-xs font-mono shadow-none focus-visible:ring-0"
                    />
                    {imageModelSearch && (
                      <button
                        type="button"
                        onClick={() => setImageModelSearch("")}
                        className="text-slate-500 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Filter tabs */}
                  {featuredImageModels.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2 px-1">
                      <WorkspaceChip
                        type="button"
                        onClick={() => setImageTabFilter("image_only")}
                        selected={imageTabFilter === "image_only"}
                        className="font-sans text-[10px]"
                      >
                        Khusus Gambar ({featuredImageModels.length})
                      </WorkspaceChip>
                      <WorkspaceChip
                        type="button"
                        onClick={() => setImageTabFilter("all")}
                        selected={imageTabFilter === "all"}
                        className="font-sans text-[10px]"
                      >
                        Semua Model ({availableImageModels.length})
                      </WorkspaceChip>
                    </div>
                  )}

                  {/* Models list */}
                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {isFetchingImageModels ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                        <span className="text-[11px] font-mono">
                          Mengambil model dari endpoint...
                        </span>
                      </div>
                    ) : (
                      (() => {
                        const pool =
                          imageTabFilter === "image_only" && featuredImageModels.length > 0
                            ? featuredImageModels
                            : availableImageModels.length > 0
                              ? availableImageModels
                              : [
                                  "runware:100@1",
                                  "inferhub/cb/gemini-2.5-flash-image",
                                  "dall-e-3",
                                  "flux-schnell",
                                ];
                        const filtered = pool.filter((m) =>
                          imageModelSearch.trim() === ""
                            ? true
                            : m.toLowerCase().includes(imageModelSearch.toLowerCase())
                        );

                        if (filtered.length === 0) {
                          return (
                            <div className="py-5 text-center text-slate-500 text-xs px-2">
                              Tidak ada model yang cocok dengan pencarian. Anda tetap dapat mengetik
                              nama model sendiri.
                            </div>
                          );
                        }

                        return filtered.map((m) => {
                          const isSelected = imageModel === m;
                          const isImage = isImageModelName(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setImageModel(m);
                                setIsImageDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition flex items-center justify-between gap-2 border ${
                                isSelected
                                  ? "bg-[#F8EEEA] border-[#C45B3A] text-[#A9472C] font-semibold"
                                  : "border-transparent text-[#5E5C54] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                              }`}
                            >
                              <span className="truncate">{m}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isImage && (
                                  <Badge
                                    variant="workspace"
                                    className="px-1.5 py-0.5 font-sans text-[9px]"
                                  >
                                    Gambar
                                  </Badge>
                                )}
                                {isSelected && <Check className="w-3.5 h-3.5 text-[#C45B3A]" />}
                              </div>
                            </button>
                          );
                        });
                      })()
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-slate-500">Preset:</span>
                {[
                  "runware:100@1",
                  "inferhub/cb/gemini-2.5-flash-image",
                  "dall-e-3",
                  "flux-schnell",
                ].map((preset) => (
                  <WorkspaceChip
                    key={preset}
                    onClick={() => setImageModel(preset)}
                    selected={imageModel === preset}
                    className="font-mono text-[10px]"
                  >
                    {preset}
                  </WorkspaceChip>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Image API Key (Tersimpan Terenkripsi)
                </label>
                {config?.has_image_api_key && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    Tersimpan: {config.image_api_key_masked}
                  </span>
                )}
              </div>
              <Input
                type="password"
                placeholder={
                  config?.has_image_api_key
                    ? "Ketik untuk mengganti Image API key..."
                    : "API key untuk image provider..."
                }
                value={imageApiKey}
                onChange={(e) => setImageApiKey(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          {/* Concurrency Selector 1-4 (default 2) */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Jumlah Paralel Request Generator (1 - 4 Concurrent)
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">
                Aktif: {imageConcurrency} request serentak
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                {
                  val: 1,
                  label: "1x (Serial)",
                  desc: "1 request per waktu (hemat resource / low-end GPU)",
                },
                {
                  val: 2,
                  label: "2x (Default)",
                  desc: "2 request serentak (stabil & seimbang)",
                },
                { val: 3, label: "3x (Cepat)", desc: "3 request serentak (performa tinggi)" },
                {
                  val: 4,
                  label: "4x (Maksimal)",
                  desc: "4 request serentak (cloud / Runware)",
                },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  aria-pressed={imageConcurrency === opt.val}
                  onClick={() => setImageConcurrency(opt.val)}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] ${
                    imageConcurrency === opt.val
                      ? "bg-[#F8EEEA] border-[#C45B3A] text-[#A9472C] ring-1 ring-[#C45B3A]/30"
                      : "bg-[#FBFAF7] border-[#E5E1D7] text-[#5E5C54] hover:text-[#26251F] hover:bg-[#F1EEE6]"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className={`text-xs font-bold font-mono ${imageConcurrency === opt.val ? "text-[#A9472C]" : "text-[#4D4A42]"}`}
                    >
                      {opt.label}
                    </span>
                    {imageConcurrency === opt.val && (
                      <span className="w-2 h-2 rounded-full bg-[#C45B3A]"></span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#77766D] leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Mengontrol jumlah gambar yang di-generate secara paralel saat proses batch. Default
              adalah <strong>2</strong>.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Master Style Prompt Preset (Doodle Explainer / Parchment Stickman)
              </label>
              <div className="flex items-center gap-3">
                <Link
                  href="/image-studio"
                  className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-semibold hover:underline"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Buka Art Studio ➔</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setImageSystemPrompt(DEFAULT_IMAGE_STYLE_PROMPT)}
                  className="text-[10px] text-slate-400 hover:text-slate-300 flex items-center gap-1 font-mono"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset ke Default</span>
                </button>
              </div>
            </div>
            <Textarea
              rows={4}
              value={imageSystemPrompt}
              onChange={(e) => setImageSystemPrompt(e.target.value)}
              placeholder="Instruksi gaya visual yang akan digabungkan ke setiap adegan..."
              className="text-xs font-mono leading-relaxed"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Prompt ini otomatis disematkan pada setiap scene adegan naskah untuk memastikan gaya
              visual ilustrasi tetap seragam (doodle stickman kepala bulat botak, tinta hitam,
              parchment tea-stained watercolor) dari awal sampai akhir. Gunakan{" "}
              <strong>Art Studio</strong> untuk membuat preset gaya ilustrasi dan karakter dari teks
              maupun gambar referensi.
            </p>
          </div>
        </div>

        {/* Test Image Connection Button */}
        <div className="pt-3 flex items-center justify-between border-t border-surface-border">
          <Button
            type="button"
            onClick={handleTestImageConnection}
            disabled={isTestingImage}
            variant="workspace-secondary"
            className="gap-2"
          >
            {isTestingImage ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            )}
            <span>Test Image API Connection</span>
          </Button>

          {testImageResult && (
            <div
              className={`text-xs font-mono flex items-center gap-1.5 ${testImageResult.success ? "text-emerald-400" : "text-rose-400"}`}
            >
              {testImageResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <span>
                {testImageResult.message} ({testImageResult.latency_ms}ms)
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          variant="workspace-primary"
          className="gap-2"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>{saveMutation.isPending ? "Menyimpan..." : "Simpan Konfigurasi Model"}</span>
        </Button>
      </div>
    </form>
  );
}

"use client";

import React, { useState, useEffect } from "react";
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
  Check,
  Plus,
  Minus,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Autocomplete,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
  AutocompleteEmpty,
} from "@/components/ui";

const DEFAULT_CHAT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
  "deepseek-chat",
];

const DEFAULT_VISION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-flash-latest",
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet-20241022",
];

const RUNWARE_IMAGE_MODELS = [
  {
    id: "runware:400@2",
    name: "FLUX.2 [klein] 9B",
    badge: "Default ⭐",
    desc: "Model distilled 4-step terbaru dari BFL untuk text-to-image super cepat dan hemat.",
  },
  {
    id: "runware:100@1",
    name: "FLUX.1 Schnell",
    badge: "Semi-Realistis & Cepat",
    desc: "Model ultra-cepat (1-2 detik) dengan kecenderungan visual semi-realistis dan concept art sinematik ($0.001).",
  },
  {
    id: "runware:101@1",
    name: "FLUX.1 Dev",
    badge: "Kualitas Tertinggi",
    desc: "Bisa diatur ke 10 steps ($0.0013) untuk hemat atau 28 steps ($0.0037) untuk detail estetika sinematik maksimal.",
  },
  {
    id: "recraft:v4.1@flash",
    name: "Recraft V4.1 Flash",
    badge: "Desain Grafis & Vektor ⭐",
    desc: "Model spesialis ilustrasi 2D, vektor, dan seni desain bersih. Sangat tajam untuk infografis dan explainer bergaya modern ($0.003/gambar).",
  },
  {
    id: "google:nano-banana@2.1",
    name: "Google: Nano Banana 2.1 (Gemini Flash Image)",
    badge: "Persis Referensi Anda ⭐",
    desc: "Model resmi Google (Gemini Flash Image) di Runware. Paham prompt cerita panjang & budaya lokal Nusantara, bebas dari 3D CGI ($0.034/gambar).",
  },
  {
    id: "civitai:30240@78775",
    name: "ToonYou (2D Animated Comic)",
    badge: "Rekomendasi Komik 2D",
    desc: "Sangat mirip gaya animasi explainer YouTube (Malin Kundang). Garis tebal, ekspresi kartun hidup, cel-shading bersih, super hemat (~$0.0008).",
  },
  {
    id: "civitai:36520@76907",
    name: "GhostMix (Webtoon & Dark Comic)",
    badge: "Komik Suasana Malam",
    desc: "Spesialis panel komik bernuansa malam/misteri, arsiran tinta tegas, pencahayaan lentera dramatis tanpa menjadi 3D.",
  },
  {
    id: "civitai:260267@403131",
    name: "Animagine XL 3.1",
    badge: "Komik Resolusi Tinggi",
    desc: "Model SDXL 16:9 native untuk ilustrasi komik dan anime berkualitas tinggi, ekspresi dinamis, bebas tekstur 3D.",
  },
  {
    id: "civitai:82098@128078",
    name: "DreamShaper XL",
    badge: "Ilustratif Dongeng",
    desc: "Gaya seni fleksibel antara ilustrasi buku dongeng rakyat, komik digital, dan pencahayaan atmosferik.",
  },
  {
    id: "civitai:101055@128078",
    name: "SDXL 1.0 Base",
    badge: "Widescreen Komposisi",
    desc: "Kaya variasi background & lanskap luas dengan komposisi sinematik seimbang.",
  },
];

const isVisionModelName = (name: string) => {
  const lower = name.toLowerCase();
  return (
    lower.includes("vision") ||
    lower.includes("vl") ||
    lower.includes("flash") ||
    lower.includes("4o") ||
    lower.includes("pro") ||
    lower.includes("gemini") ||
    lower.includes("sonnet") ||
    lower.includes("opus")
  );
};

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

  // LLM Chat & Vision Model Dropdown State
  const [isChatDropdownOpen, setIsChatDropdownOpen] = useState(false);
  const [isVisionDropdownOpen, setIsVisionDropdownOpen] = useState(false);

  const [ttsProvider, setTtsProvider] = useState("gemini");
  const [ttsModel, setTtsModel] = useState("gemini-2.5-flash-preview-tts");
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");
  const [elevenlabsModel, setElevenlabsModel] = useState("eleven_multilingual_v2");
  const [runwareApiKey, setRunwareApiKey] = useState("");
  const [runwareTtsModel, setRunwareTtsModel] = useState("fishaudio:s2.1@pro");
  const [testTtsResult, setTestTtsResult] = useState<TestTtsResult | null>(null);
  const [isTestingTts, setIsTestingTts] = useState(false);

  // AI Image Generator Provider Selection
  const [imageProvider, setImageProvider] = useState<"runware" | "custom">("runware");

  // Runware Image Config
  const [runwareImageModel, setRunwareImageModel] = useState("runware:400@2");
  const [isRunwareDropdownOpen, setIsRunwareDropdownOpen] = useState(false);

  // Custom Endpoint Image Config
  const [customImageBaseUrl, setCustomImageBaseUrl] = useState("");
  const [customImageModel, setCustomImageModel] = useState("dall-e-3");
  const [customImageApiKey, setCustomImageApiKey] = useState("");
  const [availableImageModels, setAvailableImageModels] = useState<string[]>([]);
  const [featuredImageModels, setFeaturedImageModels] = useState<string[]>([]);
  const [isFetchingImageModels, setIsFetchingImageModels] = useState(false);
  const [isImageDropdownOpen, setIsImageDropdownOpen] = useState(false);
  const [imageTabFilter, setImageTabFilter] = useState<"image_only" | "all">("image_only");

  // Shared Image Generator Config
  const [imageConcurrency, setImageConcurrency] = useState<number>(2);
  const [imageSteps, setImageSteps] = useState<number>(5);
  const [imageCfgScale, setImageCfgScale] = useState<number>(3.5);
  const [testImageResult, setTestImageResult] = useState<TestImageResult | null>(null);
  const [isTestingImage, setIsTestingImage] = useState(false);

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

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

      // AI Image Generator Provider & Model Mapping
      const prov = config.image_provider === "custom" ? "custom" : "runware";
      setImageProvider(prov);
      setCustomImageBaseUrl(config.image_base_url || "");

      if (
        config.image_model &&
        (config.image_model.startsWith("runware:") ||
          config.image_model.startsWith("civitai:") ||
          RUNWARE_IMAGE_MODELS.some((m) => m.id === config.image_model))
      ) {
        setRunwareImageModel(config.image_model);
      } else if (prov === "runware" && config.image_model) {
        setRunwareImageModel(config.image_model);
      }

      if (prov === "custom" && config.image_model) {
        setCustomImageModel(config.image_model);
      } else if (
        config.image_model &&
        !config.image_model.startsWith("runware:") &&
        !config.image_model.startsWith("civitai:")
      ) {
        setCustomImageModel(config.image_model);
      }

      setImageConcurrency(config.image_concurrency || 2);
      setImageSteps(config.image_steps ?? 5);
      setImageCfgScale(config.image_cfg_scale ?? 3.5);
    }
  }, [config]);

  const handleFetchModels = async (target?: "chat" | "vision") => {
    setIsFetchingModels(true);
    try {
      const res = await api.getAvailableModels(baseUrl.trim(), apiKey.trim());
      if (res.models && res.models.length > 0) {
        setAvailableModels(res.models);
        if (target === "vision") {
          setIsVisionDropdownOpen(true);
        } else {
          setIsChatDropdownOpen(true);
        }
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
      const res = await api.getAvailableModels(
        customImageBaseUrl.trim(),
        customImageApiKey.trim(),
        "image"
      );
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
      setCustomImageApiKey("");
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
        key = runwareApiKey;
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
      const isRunware = imageProvider === "runware";
      const key = isRunware ? runwareApiKey.trim() : customImageApiKey.trim();
      const model = isRunware ? runwareImageModel.trim() : customImageModel.trim();
      const bUrl = isRunware ? "https://api.runware.ai/v1" : customImageBaseUrl.trim();

      const res = await api.testImageConnection({
        provider: imageProvider,
        base_url: bUrl || undefined,
        image_model: model || undefined,
        api_key: key || undefined,
        steps: imageSteps,
        cfg_scale: imageCfgScale,
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
    const isRunware = imageProvider === "runware";
    const activeImageModel = isRunware
      ? runwareImageModel.trim() || "runware:400@2"
      : customImageModel.trim() || "dall-e-3";
    const activeBaseUrl = isRunware
      ? "https://api.runware.ai/v1"
      : customImageBaseUrl.trim() || null;

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
      image_provider: imageProvider,
      image_base_url: activeBaseUrl,
      image_model: activeImageModel,
      image_concurrency: imageConcurrency,
      image_steps: imageSteps,
      image_cfg_scale: imageCfgScale,
      image_api_key: customImageApiKey.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSaveModel} className="space-y-6">
      {/* Section 1: LLM & Vision Config */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-foreground">1. Konfigurasi LLM & Vision Model</h3>
          </div>
          <Badge variant="workspace-accent" className="px-2 py-0.5 font-mono text-xs">
            OpenAI & Gemini Compatible
          </Badge>
        </div>

        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">API Base URL</label>
            <Input
              type="text"
              autoComplete="off"
              placeholder="http://localhost:20128/v1 atau https://api.openai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Chat Model (LLM) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Chat Model (Naskah Narasi)
                </label>
                <Button
                  type="button"
                  onClick={() => handleFetchModels("chat")}
                  disabled={isFetchingModels}
                  variant="workspace-quiet"
                  size="workspace-sm"
                  className="h-7 px-2 gap-1 font-mono text-xs"
                  title="Ambil model dari endpoint Base URL"
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

              <Autocomplete
                value={chatModel}
                onValueChange={setChatModel}
                open={isChatDropdownOpen}
                onOpenChange={setIsChatDropdownOpen}
                items={availableModels.length > 0 ? availableModels : DEFAULT_CHAT_MODELS}
              >
                <AutocompleteInput
                  required
                  placeholder="Ketik atau cari model, misal: gemini-2.5-flash"
                  className="font-mono"
                  isLoading={isFetchingModels}
                />
                <AutocompleteContent>
                  <AutocompleteEmpty>
                    Tidak ada model yang cocok. Anda tetap dapat mengetik nama model sendiri.
                  </AutocompleteEmpty>
                  <AutocompleteList>
                    {(m: string) => {
                      const isFromEndpoint = availableModels.includes(m);
                      return (
                        <AutocompleteItem key={m} value={m}>
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="truncate">{m}</span>
                            <Badge
                              variant="workspace"
                              className="px-1.5 py-0.5 font-sans text-xs shrink-0"
                            >
                              {isFromEndpoint ? "Endpoint" : "Default"}
                            </Badge>
                          </div>
                        </AutocompleteItem>
                      );
                    }}
                  </AutocompleteList>
                </AutocompleteContent>
              </Autocomplete>
            </div>

            {/* Vision Model */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Vision Model (Tagging Scene Video)
                </label>
                <Button
                  type="button"
                  onClick={() => handleFetchModels("vision")}
                  disabled={isFetchingModels}
                  variant="workspace-quiet"
                  size="workspace-sm"
                  className="h-7 px-2 gap-1 font-mono text-xs"
                  title="Ambil model dari endpoint Base URL"
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

              <Autocomplete
                value={visionModel}
                onValueChange={setVisionModel}
                open={isVisionDropdownOpen}
                onOpenChange={setIsVisionDropdownOpen}
                items={availableModels.length > 0 ? availableModels : DEFAULT_VISION_MODELS}
              >
                <AutocompleteInput
                  required
                  placeholder="Ketik atau cari model, misal: gemini-2.5-flash"
                  className="font-mono"
                  isLoading={isFetchingModels}
                />
                <AutocompleteContent>
                  <AutocompleteEmpty>
                    Tidak ada model yang cocok. Anda tetap dapat mengetik nama model sendiri.
                  </AutocompleteEmpty>
                  <AutocompleteList>
                    {(m: string) => {
                      const isFromEndpoint = availableModels.includes(m);
                      const isVision = isVisionModelName(m);
                      return (
                        <AutocompleteItem key={m} value={m}>
                          <div className="flex items-center justify-between gap-2 w-full">
                            <span className="truncate">{m}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isVision && (
                                <Badge
                                  variant="workspace"
                                  className="px-1.5 py-0.5 font-sans text-xs"
                                >
                                  Vision
                                </Badge>
                              )}
                              <Badge
                                variant="workspace"
                                className="px-1.5 py-0.5 font-sans text-xs"
                              >
                                {isFromEndpoint ? "Endpoint" : "Default"}
                              </Badge>
                            </div>
                          </div>
                        </AutocompleteItem>
                      );
                    }}
                  </AutocompleteList>
                </AutocompleteContent>
              </Autocomplete>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-muted-foreground">API Key</label>
              {config?.has_api_key && (
                <span className="text-xs text-emerald-600 font-mono">
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
              className="font-mono"
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
              className={`text-xs font-mono flex items-center gap-1.5 ${testResult.success ? "text-emerald-600" : "text-rose-600"}`}
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
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-foreground">2. Konfigurasi Text-to-Speech (TTS)</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="workspace-success" className="px-2 py-0.5 font-mono text-xs">
              Gemini / ElevenLabs / Runware
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Default TTS Provider
            </label>
            <Select value={ttsProvider} onValueChange={setTtsProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih TTS Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Gemini TTS (Google AI High-Fidelity)</SelectItem>
                <SelectItem value="elevenlabs">
                  ElevenLabs TTS (Gold Standard — Zero Intonation Drift)
                </SelectItem>
                <SelectItem value="runware">
                  Runware TTS (Fish Audio / Qwen3 / Inworld — Hemat & Cepat)
                </SelectItem>
                <SelectItem value="edge">Edge-TTS (Natural Indonesian Neural, Gratis)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Gemini Model & Key */}
          {ttsProvider === "gemini" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Gemini TTS Model
                </label>
                <Select value={ttsModel} onValueChange={setTtsModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Gemini TTS Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-flash-preview-tts">
                      Gemini 2.5 Flash TTS (direkomendasikan, paling stabil & konsisten)
                    </SelectItem>
                    <SelectItem value="gemini-3.8-flash-lite-tts">
                      Gemini 3.8 Flash-Lite TTS (cepat & hemat)
                    </SelectItem>
                    <SelectItem value="gemini-3.8-flash-tts">
                      Gemini 3.8 Flash TTS (kualitas studio)
                    </SelectItem>
                    <SelectItem value="gemini-3.1-flash-tts-preview">
                      Gemini 3.1 Flash TTS Preview
                    </SelectItem>
                    <SelectItem value="gemini-flash-latest">
                      Gemini Flash Latest (auto versi terbaru)
                    </SelectItem>
                    <SelectItem value="gemini-2.5-pro-preview-tts">
                      Gemini 2.5 Pro TTS Preview (high-res)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Gemini 2.5 Flash TTS kini mendukung single-pass hingga 2.200 karakter (~2.5 menit)
                  untuk intonasi vokal seragam.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Gemini TTS API Key (Tersimpan Terenkripsi)
                  </label>
                  {config?.has_tts_api_key && (
                    <span className="text-xs text-emerald-600 font-mono">
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
                  className="font-mono"
                />
              </div>
            </>
          )}

          {/* ElevenLabs Model & Key */}
          {ttsProvider === "elevenlabs" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  ElevenLabs Model
                </label>
                <Select value={elevenlabsModel} onValueChange={setElevenlabsModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih ElevenLabs Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eleven_v4_turbo">
                      Eleven v4 Turbo (Generasi Terbaru — Latensi Cepat & Emosional)
                    </SelectItem>
                    <SelectItem value="eleven_v4">
                      Eleven v4 (Flagship — Kualitas Sinematik Tertinggi)
                    </SelectItem>
                    <SelectItem value="eleven_multilingual_v2">
                      Eleven Multilingual v2 (Direkomendasikan — Kualitas vokal paling stabil)
                    </SelectItem>
                    <SelectItem value="eleven_flash_v2_5">
                      Eleven Flash v2.5 (Hemat Kuota 50% & Super Cepat)
                    </SelectItem>
                    <SelectItem value="eleven_turbo_v2_5">
                      Eleven Turbo v2.5 (Generasi Sebelumnya)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Mendukung hingga 4.500 karakter per request tanpa pemisahan audio, intonasi vokal
                  100% konsisten dari awal hingga akhir.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    ElevenLabs API Key (Tersimpan Terenkripsi)
                  </label>
                  {config?.has_elevenlabs_api_key && (
                    <span className="text-xs text-emerald-600 font-mono">
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
                  className="font-mono"
                />
              </div>
            </>
          )}

          {/* Runware Model & Key */}
          {ttsProvider === "runware" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Runware TTS Model
                </label>
                <Select value={runwareTtsModel} onValueChange={setRunwareTtsModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih Runware TTS Model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fishaudio:s2.1@pro">
                      Fish Audio S2.1 Pro (Ultra-natural TTS & intonasi stabil)
                    </SelectItem>
                    <SelectItem value="alibaba:qwen3-tts-1.7b-customvoice">
                      Alibaba Qwen3-TTS 1.7B (Aksen Asia & Indonesia natural)
                    </SelectItem>
                    <SelectItem value="inworld:tts@2">
                      Inworld Realtime TTS-2 (Vokal dinamis untuk storytelling)
                    </SelectItem>
                    <SelectItem value="xai:tts@0">xAI TTS Grok (Vokal ekspresif & speech tags)</SelectItem>
                    <SelectItem value="minimax:speech@2.8">
                      MiniMax Speech 2.8 (High-realism prosody & emosional)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Model audioInference Runware.ai dengan biaya sangat hemat ($0.0005/detik) dan
                  latensi tinggi.
                </p>
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Runware API Key (Tersimpan Terenkripsi)
                  </label>
                  {(config?.has_runware_api_key || config?.has_image_api_key) && (
                    <span className="text-xs text-emerald-600 font-mono">
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
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
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
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>Test Koneksi TTS ({ttsProvider.toUpperCase()})</span>
          </Button>

          {testTtsResult && (
            <div
              className={`text-xs font-mono flex items-center gap-1.5 ${testTtsResult.success ? "text-emerald-600" : "text-rose-600"}`}
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
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-bold text-foreground">
              3. Konfigurasi AI Image Generator (Storyboard Explainer)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="workspace-success" className="px-2 py-0.5 font-mono text-xs">
              Paralel {imageConcurrency}x Request
            </Badge>
            <Badge variant="workspace-accent" className="px-2 py-0.5 font-mono text-xs">
              {imageProvider === "runware" ? "Runware.ai" : "Custom Endpoint"}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          {/* Provider Selector: 1. Runware, 2. Custom Endpoint */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Pilih AI Image Provider
            </label>
            <Select
              value={imageProvider}
              onValueChange={(val) => setImageProvider(val as "runware" | "custom")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih AI Image Provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="runware">
                  1. Runware (Cloud Fast & Cheap — FLUX.1 Schnell, FLUX.1 Dev, CivitAI)
                </SelectItem>
                <SelectItem value="custom">
                  2. Custom Endpoint (Base URL + API Key + List Model dari Endpoint)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode 1: Runware */}
          {imageProvider === "runware" && (
            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  Konfigurasi Runware.ai (Native 16:9 Widescreen)
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  Biaya ~$0.001/gambar • Latensi 1-2 detik
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Runware API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Runware API Key (Tersimpan Terenkripsi)
                    </label>
                    {config?.has_runware_api_key && (
                      <span className="text-xs text-emerald-600 font-mono">
                        Tersimpan: {config.runware_api_key_masked}
                      </span>
                    )}
                  </div>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      config?.has_runware_api_key
                        ? "Ketik untuk mengganti Runware API key..."
                        : "Masukkan Runware API Key (dari runware.ai)..."
                    }
                    value={runwareApiKey}
                    onChange={(e) => setRunwareApiKey(e.target.value)}
                    className="font-mono"
                  />
                </div>

                {/* Runware Model Selection with Autocomplete */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Model Image Runware
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">
                      {RUNWARE_IMAGE_MODELS.length} Model Pilihan
                    </span>
                  </div>

                  <Autocomplete
                    value={runwareImageModel}
                    onValueChange={setRunwareImageModel}
                    open={isRunwareDropdownOpen}
                    onOpenChange={setIsRunwareDropdownOpen}
                    items={RUNWARE_IMAGE_MODELS}
                    getItemValue={(m) => m.id}
                    getItemLabel={(m) => `${m.name} ${m.id}`}
                  >
                    <AutocompleteInput
                      placeholder="Pilih atau ketik model id, misal: runware:400@2"
                      className="font-mono"
                    />
                    <AutocompleteContent>
                      <AutocompleteEmpty>
                        Tidak ada model yang cocok. Tekan Enter untuk menggunakan ID yang diketik.
                      </AutocompleteEmpty>
                      <AutocompleteList>
                        {(m) => (
                          <AutocompleteItem key={m.id} value={m.id} className="py-1.5">
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="truncate">{m.name}</span>
                              <span className="font-mono text-xs text-muted-foreground shrink-0">
                                {m.id}
                              </span>
                            </div>
                          </AutocompleteItem>
                        )}
                      </AutocompleteList>
                    </AutocompleteContent>
                  </Autocomplete>
                </div>
              </div>

              {/* Sampling Steps & Guidance Scale Controls (+ / - without presets) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/60">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Sampling Steps (Min 1, Max 50)
                    </label>
                    <span className="text-xs text-violet-400 font-mono font-bold">
                      {imageSteps} Steps
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg text-xs"
                      onClick={() => setImageSteps((prev) => Math.max(1, prev - 1))}
                      disabled={imageSteps <= 1}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={imageSteps}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val)) setImageSteps(Math.min(50, Math.max(1, val)));
                      }}
                      className="h-8 text-center font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg text-xs"
                      onClick={() => setImageSteps((prev) => Math.min(50, prev + 1))}
                      disabled={imageSteps >= 50}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Guidance Scale / CFG Scale
                    </label>
                    <span className="text-xs text-violet-400 font-mono font-bold">
                      {imageCfgScale.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg text-xs"
                      onClick={() => setImageCfgScale((prev) => Math.max(1.0, Math.round((prev - 0.1) * 10) / 10))}
                      disabled={imageCfgScale <= 1.0}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min={1.0}
                      max={50.0}
                      step={0.1}
                      value={imageCfgScale}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) setImageCfgScale(Math.min(50.0, Math.max(1.0, val)));
                      }}
                      className="h-8 text-center font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0 rounded-lg text-xs"
                      onClick={() => setImageCfgScale((prev) => Math.min(50.0, Math.round((prev + 0.1) * 10) / 10))}
                      disabled={imageCfgScale >= 50.0}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode 2: Custom Endpoint */}
          {imageProvider === "custom" && (
            <div className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  Konfigurasi Custom Endpoint (OpenAI / InferHub / CodeBuddy / Local SD)
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  Base URL + API Key + List Model
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Custom Image API Base URL
                </label>
                <Input
                  type="text"
                  autoComplete="off"
                  placeholder="https://api.openai.com/v1 atau http://localhost:20128/v1..."
                  value={customImageBaseUrl}
                  onChange={(e) => setCustomImageBaseUrl(e.target.value)}
                  className="font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Custom API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Custom Image API Key (Tersimpan Terenkripsi)
                    </label>
                    {config?.has_image_api_key && (
                      <span className="text-xs text-emerald-600 font-mono">
                        Tersimpan: {config.image_api_key_masked}
                      </span>
                    )}
                  </div>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      config?.has_image_api_key
                        ? "Ketik untuk mengganti Custom Image API key..."
                        : "API key untuk custom image provider..."
                    }
                    value={customImageApiKey}
                    onChange={(e) => setCustomImageApiKey(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tersimpan terpisah & tidak menimpa Runware API Key.
                  </p>
                </div>

                {/* Custom Image Model with Endpoint Pull & Autocomplete */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-muted-foreground">
                      Image Model Name
                    </label>
                    <Button
                      type="button"
                      onClick={handleFetchImageModels}
                      disabled={isFetchingImageModels}
                      variant="workspace-quiet"
                      size="workspace-sm"
                      className="h-7 px-2 gap-1 font-mono text-xs"
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

                  <Autocomplete
                    value={customImageModel}
                    onValueChange={setCustomImageModel}
                    open={isImageDropdownOpen}
                    onOpenChange={setIsImageDropdownOpen}
                    items={
                      imageTabFilter === "image_only" && featuredImageModels.length > 0
                        ? featuredImageModels
                        : availableImageModels.length > 0
                          ? availableImageModels
                          : [
                            "dall-e-3",
                            "dall-e-2",
                            "flux-schnell",
                            "flux-dev",
                          ]
                    }
                  >
                    <AutocompleteInput
                      placeholder="Ketik atau pilih model, misal: dall-e-3"
                      className="font-mono"
                      isLoading={isFetchingImageModels}
                      onFocus={() => {
                        if (availableImageModels.length === 0) {
                          handleFetchImageModels();
                        }
                      }}
                    />
                    <AutocompleteContent>
                      {/* Filter tabs */}
                      {featuredImageModels.length > 0 && (
                        <div className="workspace-filter-pills flex items-center gap-1 mb-2 px-1">
                          <button
                            type="button"
                            onClick={() => setImageTabFilter("image_only")}
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition whitespace-nowrap ${
                              imageTabFilter === "image_only"
                                ? "workspace-filter-active"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Khusus Gambar ({featuredImageModels.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setImageTabFilter("all")}
                            className={`rounded-lg px-2 py-1 text-xs font-medium transition whitespace-nowrap ${
                              imageTabFilter === "all"
                                ? "workspace-filter-active"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Semua Model ({availableImageModels.length})
                          </button>
                        </div>
                      )}

                      <AutocompleteEmpty>
                        Tidak ada model yang cocok dengan pencarian. Anda tetap dapat mengetik nama model sendiri.
                      </AutocompleteEmpty>
                      <AutocompleteList>
                        {(m: string) => {
                          const isImage = isImageModelName(m);
                          return (
                            <AutocompleteItem key={m} value={m}>
                              <div className="flex items-center justify-between gap-2 w-full">
                                <span className="truncate">{m}</span>
                                {isImage && (
                                  <Badge
                                    variant="workspace"
                                    className="px-1.5 py-0.5 font-sans text-xs shrink-0"
                                  >
                                    Gambar
                                  </Badge>
                                )}
                              </div>
                            </AutocompleteItem>
                          );
                        }}
                      </AutocompleteList>
                    </AutocompleteContent>
                  </Autocomplete>
                </div>
              </div>
            </div>
          )}

          {/* Concurrency Selector 1-4 (default 2) */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-muted-foreground">
                Jumlah Paralel Request Generator (1 - 4 Concurrent)
              </label>
              <span className="text-xs text-emerald-600 font-mono">
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
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] ${imageConcurrency === opt.val
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
                  <span className="text-xs text-[#77766D] leading-tight">{opt.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Mengontrol jumlah gambar yang di-generate secara paralel saat proses batch. Default
              adalah <strong>2</strong>.
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
            <span>
              Test Image API Connection ({imageProvider === "runware" ? "RUNWARE" : "CUSTOM"})
            </span>
          </Button>

          {testImageResult && (
            <div
              className={`text-xs font-mono flex items-center gap-1.5 ${testImageResult.success ? "text-emerald-600" : "text-rose-600"}`}
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

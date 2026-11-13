"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cpu,
  Volume2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Badge,
  Button,
  Input,
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

  const [ttsApiKey, setTtsApiKey] = useState("");
  const [elevenlabsApiKey, setElevenlabsApiKey] = useState("");

  // AI Image Generator Provider Selection
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

  const saveMutation = useMutation({
    mutationFn: api.saveModelConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-config"] });
      showToast("Konfigurasi model berhasil disimpan terenkripsi!", "success");
      setApiKey("");
      setTtsApiKey("");
      setElevenlabsApiKey("");
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

  const handleSaveModel = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      base_url: baseUrl.trim() || null,
      chat_model: chatModel.trim(),
      vision_model: visionModel.trim(),
      api_key: apiKey.trim() || undefined,
      tts_api_key: ttsApiKey.trim() || undefined,
      elevenlabs_api_key: elevenlabsApiKey.trim() || undefined,
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

      {/* Section 2: TTS API Keys */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-foreground">2. API Key Text-to-Speech</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-muted-foreground">Gemini TTS API Key</label>
              {config?.has_tts_api_key && (
                <span className="text-xs text-emerald-600 font-mono">Tersimpan: {config.tts_api_key_masked}</span>
              )}
            </div>
            <Input
              type="password"
              placeholder={config?.has_tts_api_key ? "Ketik untuk mengganti..." : "Opsional jika sama dengan key LLM"}
              value={ttsApiKey}
              onChange={(e) => setTtsApiKey(e.target.value)}
              className="font-mono"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-muted-foreground">ElevenLabs API Key</label>
              {config?.has_elevenlabs_api_key && (
                <span className="text-xs text-emerald-600 font-mono">Tersimpan: {config.elevenlabs_api_key_masked}</span>
              )}
            </div>
            <Input
              type="password"
              placeholder={config?.has_elevenlabs_api_key ? "Ketik untuk mengganti..." : "xi-api-key dari elevenlabs.io"}
              value={elevenlabsApiKey}
              onChange={(e) => setElevenlabsApiKey(e.target.value)}
              className="font-mono"
            />
          </div>
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

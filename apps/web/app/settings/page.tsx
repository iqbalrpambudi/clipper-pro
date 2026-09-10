"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Sparkles,
  Key,
  Database,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Cpu,
  Volume2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("gemini-2.0-flash");
  const [visionModel, setVisionModel] = useState("gemini-2.0-flash");
  const [apiKey, setApiKey] = useState("");
  const [ttsProvider, setTtsProvider] = useState("gemini");
  const [ttsApiKey, setTtsApiKey] = useState("");

  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.base_url || "");
      setChatModel(config.chat_model || "gemini-2.0-flash");
      setVisionModel(config.vision_model || "gemini-2.0-flash");
      setTtsProvider(config.tts_provider || "gemini");
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: api.saveModelConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["model-config"] });
      showToast("Konfigurasi model berhasil disimpan terenkripsi!", "success");
      setApiKey("");
      setTtsApiKey("");
    },
    onError: (err: any) => {
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
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Koneksi gagal",
      });
      showToast("Test koneksi gagal", "error");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      base_url: baseUrl.trim() || null,
      chat_model: chatModel.trim(),
      vision_model: visionModel.trim(),
      api_key: apiKey.trim() || undefined,
      tts_provider: ttsProvider,
      tts_api_key: ttsApiKey.trim() || undefined,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090A0F]">
      {/* Header */}
      <header className="border-b border-surface-border bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface-hover transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <SettingsIcon className="w-4 h-4 text-brand-400" />
                Model Configuration
              </h1>
              <p className="text-[11px] text-slate-400">Pengaturan Pluggable LLM, Vision & Gemini TTS</p>
            </div>
          </div>
        </div>
      </header>

      {/* Form Body */}
      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: LLM & Vision Config */}
          <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">1. Konfigurasi LLM & Vision Model</h3>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/20 text-brand-300 font-mono">
                OpenAI & Gemini Compatible
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Konfigurasi endpoint dan model untuk narrative generation serta vision tagging. Anda dapat menggunakan Google Gemini API, OpenAI, DeepSeek, Groq, atau self-hosted endpoint (Ollama/vLLM).
            </p>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  API Base URL (Opsional jika memakai default Google / OpenAI)
                </label>
                <input
                  type="text"
                  placeholder="https://generativelanguage.googleapis.com/v1beta/openai/ atau https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Chat Model (Narration Script)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="gemini-2.0-flash atau gpt-4o-mini"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Vision Model (Scene Tagging)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="gemini-2.0-flash atau gpt-4o-mini"
                    value={visionModel}
                    onChange={(e) => setVisionModel(e.target.value)}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    API Key (Disimpan Terenkripsi Fernet)
                  </label>
                  {config?.has_api_key && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tersimpan: {config.api_key_masked}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={config?.has_api_key ? "Ketik untuk mengganti API key..." : "Masukkan API key AI..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="pt-3 flex items-center justify-between border-t border-surface-border">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-4 py-2 rounded-xl bg-surface border border-surface-border hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />}
                <span>Test Connection</span>
              </button>

              {testResult && (
                <div className={`text-xs font-mono flex items-center gap-1.5 ${testResult.success ? "text-emerald-400" : "text-rose-400"}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{testResult.message} ({testResult.latency_ms}ms)</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: TTS Configuration */}
          <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">2. Konfigurasi Text-to-Speech (TTS)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Default TTS Provider
                </label>
                <select
                  value={ttsProvider}
                  onChange={(e) => setTtsProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                >
                  <option value="gemini">Gemini 2.5 Flash TTS (gemini-2.5-flash-preview-tts)</option>
                  <option value="edge">Edge-TTS (Natural Indonesian, Free)</option>
                </select>
              </div>

              <div>
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
                <input
                  type="password"
                  placeholder={config?.has_tts_api_key ? "Ketik untuk mengganti TTS key..." : "Gemini API Key khusus TTS (opsional jika sama)..."}
                  value={ttsApiKey}
                  onChange={(e) => setTtsApiKey(e.target.value)}
                  className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm shadow-xl shadow-brand-500/25 transition transform active:scale-95"
            >
              {saveMutation.isPending ? "Menyimpan..." : "Simpan Konfigurasi Model"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

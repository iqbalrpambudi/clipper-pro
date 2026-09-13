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
  FileText,
  RotateCcw,
  Code,
  Check,
  BookOpen,
  Flame,
  Lightbulb,
  Film,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { NarrationTemplate } from "@/types";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [activeSettingsTab, setActiveSettingsTab] = useState<"models" | "prompts">("models");

  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("gemini-2.5-flash");
  const [visionModel, setVisionModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [ttsProvider, setTtsProvider] = useState("gemini");
  const [ttsApiKey, setTtsApiKey] = useState("");

  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Template Prompt Editor State
  const [selectedTemplateId, setSelectedTemplateId] = useState("fakta_unik");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    system_prompt: "",
    user_prompt_template: "",
    default_tone: "santai",
    default_voice: "Puck",
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  const { data: templates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.base_url || "");
      setChatModel(config.chat_model || "gemini-2.5-flash");
      setVisionModel(config.vision_model || "gemini-2.5-flash");
      setTtsProvider(config.tts_provider || "gemini");
    }
  }, [config]);

  // Sync selected template into form
  useEffect(() => {
    const current = templates.find((t) => t.id === selectedTemplateId) || templates[0];
    if (current) {
      setTemplateForm({
        name: current.name,
        description: current.description || "",
        system_prompt: current.system_prompt,
        user_prompt_template: current.user_prompt_template,
        default_tone: current.default_tone,
        default_voice: current.default_voice,
      });
      if (selectedTemplateId !== current.id) {
        setSelectedTemplateId(current.id);
      }
    }
  }, [selectedTemplateId, templates]);

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
    } catch (e: any) {
      showToast(e.message || "Gagal mengambil daftar model", "error");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const applyPreset = (preset: { base_url: string; chat_model: string; vision_model: string }) => {
    setBaseUrl(preset.base_url);
    setChatModel(preset.chat_model);
    setVisionModel(preset.vision_model);
    showToast(`Preset "${preset.chat_model}" diterapkan!`, "info");
  };

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

  const updateTemplateMutation = useMutation({
    mutationFn: (data: Partial<NarrationTemplate>) =>
      api.updateTemplate(selectedTemplateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast("Prompt AI template berhasil diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan perubahan template", "error");
    },
  });

  const resetTemplateMutation = useMutation({
    mutationFn: () => api.resetTemplate(selectedTemplateId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setTemplateForm({
        name: updated.name,
        description: updated.description || "",
        system_prompt: updated.system_prompt,
        user_prompt_template: updated.user_prompt_template,
        default_tone: updated.default_tone,
        default_voice: updated.default_voice,
      });
      showToast("Prompt AI berhasil di-reset ke default pabrik!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal me-reset template", "error");
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

  const handleSaveModel = (e: React.FormEvent) => {
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

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    updateTemplateMutation.mutate(templateForm);
  };

  const currentSelectedTemplate = templates.find((t) => t.id === selectedTemplateId);

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
                Pengaturan Sistem & Konfigurasi AI
              </h1>
              <p className="text-[11px] text-slate-400">Model LLM, Vision, TTS & Kustomisasi Prompt Naskah</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-surface-border pb-3">
          <button
            type="button"
            onClick={() => setActiveSettingsTab("models")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSettingsTab === "models"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "text-slate-400 hover:text-white hover:bg-surface-hover"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Model AI & API Keys</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab("prompts")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeSettingsTab === "prompts"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "text-slate-400 hover:text-white hover:bg-surface-hover"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Prompt AI & Template Naskah</span>
          </button>
        </div>

        {/* TAB 1: MODEL & TTS CONFIGURATION */}
        {activeSettingsTab === "models" && (
          <form onSubmit={handleSaveModel} className="space-y-6">
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
                Konfigurasi endpoint dan model untuk narrative generation serta vision tagging. Anda dapat menggunakan <strong>9Router</strong>, Google Gemini API, OpenAI, DeepSeek, atau self-hosted endpoint.
              </p>

              {/* Quick Provider Presets */}
              <div className="bg-surface/60 rounded-xl p-3 border border-surface-border space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 block">Preset Cepat:</span>
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset({ base_url: "http://localhost:20128/v1", chat_model: "gemini", vision_model: "gemini" })}
                  className="px-3 py-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-300 text-xs font-medium transition flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3 text-brand-400" />
                  <span>9Router (gemini)</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset({ base_url: "http://localhost:20128/v1", chat_model: "kr/claude-sonnet-4.5", vision_model: "gemini" })}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-white/5 border border-surface-border text-slate-300 text-xs font-medium transition"
                >
                  9Router (Claude Sonnet 4.5)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset({ base_url: "https://generativelanguage.googleapis.com/v1beta/openai/", chat_model: "gemini-2.5-flash", vision_model: "gemini-2.5-flash" })}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-white/5 border border-surface-border text-slate-300 text-xs font-medium transition"
                >
                  Google Gemini Direct
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset({ base_url: "https://api.openai.com/v1", chat_model: "gpt-4o-mini", vision_model: "gpt-4o-mini" })}
                  className="px-3 py-1.5 rounded-lg bg-surface hover:bg-white/5 border border-surface-border text-slate-300 text-xs font-medium transition"
                >
                  OpenAI Official (gpt-4o-mini)
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  API Base URL (Contoh: http://localhost:20128/v1 untuk 9Router)
                </label>
                <input
                  type="text"
                  placeholder="http://localhost:20128/v1 atau https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Datalist for Available Models */}
              <datalist id="available-models-list">
                {availableModels.length > 0 ? (
                  availableModels.map((m) => (
                    <option key={m} value={m} />
                  ))
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
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="text-[10px] text-brand-400 hover:text-brand-300 flex items-center gap-1 font-mono disabled:opacity-50"
                    >
                      {isFetchingModels ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                      <span>{availableModels.length > 0 ? `${availableModels.length} Model` : "Tarik Model"}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    list="available-models-list"
                    placeholder="gemini atau gpt-4o-mini"
                    value={chatModel}
                    onChange={(e) => setChatModel(e.target.value)}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
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
                  <input
                    type="text"
                    required
                    list="available-models-list"
                    placeholder="gemini atau gpt-4o-mini"
                    value={visionModel}
                    onChange={(e) => setVisionModel(e.target.value)}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    API Key (Disimpan Terenkripsi Fernet — Kosongkan jika 9Router tidak memerlukan auth)
                  </label>
                  {config?.has_api_key && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Tersimpan: {config.api_key_masked}
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={config?.has_api_key ? "Ketik untuk mengganti API key..." : "Masukkan API key AI (opsional untuk 9Router)..."}
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
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm shadow-xl shadow-brand-500/25 transition transform active:scale-95 flex items-center gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{saveMutation.isPending ? "Menyimpan..." : "Simpan Konfigurasi Model"}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: PROMPT AI & TEMPLATE NASKAH */}
      {activeSettingsTab === "prompts" && (
        <div className="space-y-6">
          {/* Template Selector Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Pilih Template Naskah untuk Diedit</h3>
              </div>
              <span className="text-[11px] text-slate-400">
                {templates.length} template naskah tersedia
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {templates.map((tpl) => {
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/15 ring-1 ring-brand-500/30"
                        : "border-surface-border hover:border-slate-500 bg-surface/50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          {tpl.id === "fakta_unik" && <Lightbulb className="w-3.5 h-3.5 text-accent-yellow" />}
                          {tpl.id === "konten_viral" && <Flame className="w-3.5 h-3.5 text-rose-400" />}
                          {tpl.id === "edukasi_singkat" && <BookOpen className="w-3.5 h-3.5 text-accent-blue" />}
                          {tpl.id === "alur_film" && <Film className="w-3.5 h-3.5 text-purple-400" />}
                          {tpl.name}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between items-center">
                      <span className="font-mono text-slate-400">{tpl.id}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                        tpl.is_builtin ? "bg-brand-500/20 text-brand-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {tpl.is_builtin ? "Bawaan" : "Kustom"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prompt Editor Form */}
          {currentSelectedTemplate && (
            <form onSubmit={handleSaveTemplate} className="glass-panel rounded-2xl p-6 border border-surface-border space-y-6">
              <div className="flex items-center justify-between border-b border-surface-border pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Code className="w-4 h-4 text-accent-yellow" />
                    Editor Prompt: {currentSelectedTemplate.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ID Template: <code className="text-brand-300 font-mono text-[11px] bg-brand-500/10 px-1.5 py-0.5 rounded">{currentSelectedTemplate.id}</code>
                  </p>
                </div>

                {currentSelectedTemplate.is_builtin && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Reset prompt template ini ke setelan bawaan standar?")) {
                        resetTemplateMutation.mutate();
                      }
                    }}
                    disabled={resetTemplateMutation.isPending}
                    className="px-3 py-1.5 rounded-xl bg-surface border border-surface-border hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                    title="Kembalikan prompt ke teks standar pabrik"
                  >
                    {resetTemplateMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5" />
                    )}
                    <span>Reset ke Default</span>
                  </button>
                )}
              </div>

              {/* Template Meta Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nama Template
                  </label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Deskripsi Ringkas
                  </label>
                  <input
                    type="text"
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* 1. System Prompt Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white flex items-center gap-1.5">
                    <span>1. System Prompt (Aturan Persona, Gaya Bahasa & Struktur AI)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Instruksi Primer LLM
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  System prompt mendikte peran AI, pembatasan bahasa, hook awal (maksimal 10 kata), struktur poin fakta/klimaks, larangan tanda kurung arahan panggung, dan pertanyaan penutup.
                </p>
                <textarea
                  rows={9}
                  value={templateForm.system_prompt}
                  onChange={(e) => setTemplateForm({ ...templateForm, system_prompt: e.target.value })}
                  className="w-full p-4 bg-black/60 rounded-xl border border-surface-border text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-brand-500 transition selection:bg-brand-500/30"
                  placeholder="Instruksi system prompt untuk AI..."
                  required
                />
              </div>

              {/* 2. User Prompt Template Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white">
                    2. User Prompt Template (Format Input & Variabel)
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Template Format Dinamis
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Gunakan placeholder variabel dalam tanda kurung kurawal yang akan diisi secara otomatis oleh sistem saat generasi naskah:
                </p>
                <div className="flex flex-wrap gap-1.5 py-1">
                  {["{topic}", "{tone}", "{target_duration}", "{word_count}", "{scene_context}"].map((token) => (
                    <span
                      key={token}
                      className="px-2 py-0.5 rounded bg-surface border border-surface-border text-[11px] font-mono text-brand-300"
                    >
                      {token}
                    </span>
                  ))}
                </div>
                <textarea
                  rows={6}
                  value={templateForm.user_prompt_template}
                  onChange={(e) => setTemplateForm({ ...templateForm, user_prompt_template: e.target.value })}
                  className="w-full p-4 bg-black/60 rounded-xl border border-surface-border text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-brand-500 transition selection:bg-brand-500/30"
                  placeholder="Template prompt user..."
                  required
                />
              </div>

              {/* Default Tone & Voice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-surface-border">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Default Tone
                  </label>
                  <select
                    value={templateForm.default_tone}
                    onChange={(e) => setTemplateForm({ ...templateForm, default_tone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="santai">Santai (Casual & Friendly)</option>
                    <option value="formal">Formal (Professional & Clear)</option>
                    <option value="dramatis">Dramatis (Tense & Emotional)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Default Voice Name (TTS)
                  </label>
                  <input
                    type="text"
                    value={templateForm.default_voice}
                    onChange={(e) => setTemplateForm({ ...templateForm, default_voice: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                <button
                  type="submit"
                  disabled={updateTemplateMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-xl shadow-brand-500/25 transition transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                >
                  {updateTemplateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>
                    {updateTemplateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan Prompt"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      </main>
    </div>
  );
}

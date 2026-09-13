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
  Plus,
  Trash2,
  X,
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
  });

  // Modal State for New Template
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState({
    id: "",
    name: "",
    description: "",
    system_prompt: "",
    user_prompt_template: "",
    default_tone: "santai",
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
      showToast("Preset template naskah berhasil diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan perubahan template", "error");
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: Partial<NarrationTemplate>) => api.createTemplate(data),
    onSuccess: (newTpl) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSelectedTemplateId(newTpl.id);
      setIsCreateModalOpen(false);
      showToast("Preset naskah baru berhasil ditambahkan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membuat template baru", "error");
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      const firstBuiltin = templates.find((t) => t.is_builtin)?.id || "fakta_unik";
      setSelectedTemplateId(firstBuiltin);
      showToast("Preset naskah berhasil dihapus", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menghapus template", "error");
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
      });
      showToast("Prompt preset berhasil di-reset ke default bawaan!", "info");
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

  const handleOpenCreateModal = () => {
    setNewTemplateForm({
      id: `preset_${Date.now().toString(36)}`,
      name: "",
      description: "",
      system_prompt: `Peran Anda adalah scriptwriter video pendek profesional. Tulis naskah yang padat, menarik, dan memikat penonton sejak detik pertama.`,
      user_prompt_template: `Topik: {topic}\nNada Bicara: {tone}\nTarget Durasi: {target_duration} detik\nTarget Kata: {word_count} kata\n\nKonteks Scene Visual Video:\n{scene_context}`,
      default_tone: "santai",
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateForm.id.trim() || !newTemplateForm.name.trim()) {
      showToast("ID dan Nama Preset wajib diisi", "error");
      return;
    }
    // Clean id slug
    const cleanId = newTemplateForm.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    createTemplateMutation.mutate({
      ...newTemplateForm,
      id: cleanId,
    });
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
              <p className="text-[11px] text-slate-400">Model LLM, Vision, TTS & Kustomisasi Preset Naskah</p>
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
            <span>Prompt AI & Preset Naskah</span>
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

      {/* TAB 2: PROMPT AI & PRESET NASKAH */}
      {activeSettingsTab === "prompts" && (
        <div className="space-y-6">
          {/* Template Selector Grid Header */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white">Preset Template Naskah</h3>
                <span className="text-[11px] text-slate-400">
                  ({templates.length} preset tersedia)
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/20 transition transform active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Preset Baru</span>
              </button>
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
                      <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          {tpl.id === "fakta_unik" && <Lightbulb className="w-3.5 h-3.5 text-accent-yellow shrink-0" />}
                          {tpl.id === "konten_viral" && <Flame className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                          {tpl.id === "edukasi_singkat" && <BookOpen className="w-3.5 h-3.5 text-accent-blue shrink-0" />}
                          {tpl.id === "alur_film" && <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
                          {!["fakta_unik", "konten_viral", "edukasi_singkat", "alur_film"].includes(tpl.id) && (
                            <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                          <span className="text-xs font-bold text-white truncate min-w-0" title={tpl.name}>
                            {tpl.name}
                          </span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-2">
                        {tpl.description || "Tidak ada deskripsi"}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between items-center">
                      <span className="font-mono text-slate-400 truncate max-w-[120px]">{tpl.id}</span>
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
                    Editor Preset: {currentSelectedTemplate.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                    <span>ID Preset:</span>
                    <code className="text-brand-300 font-mono text-[11px] bg-brand-500/10 px-1.5 py-0.5 rounded">
                      {currentSelectedTemplate.id}
                    </code>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                      currentSelectedTemplate.is_builtin ? "bg-brand-500/20 text-brand-300" : "bg-emerald-500/20 text-emerald-300"
                    }`}>
                      {currentSelectedTemplate.is_builtin ? "Preset Bawaan" : "Preset Kustom"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {currentSelectedTemplate.is_builtin ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Reset prompt preset ini ke setelan standar bawaan pabrik?")) {
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Hapus preset naskah "${currentSelectedTemplate.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
                          deleteTemplateMutation.mutate(currentSelectedTemplate.id);
                        }
                      }}
                      disabled={deleteTemplateMutation.isPending}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                      title="Hapus preset kustom ini"
                    >
                      {deleteTemplateMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span>Hapus Preset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Template Meta Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nama Preset Naskah
                  </label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                    placeholder="Contoh: Fakta Sains Populer"
                    required
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tone Bawaan (Gaya Bahasa)
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

                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Deskripsi Ringkas
                  </label>
                  <input
                    type="text"
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                    placeholder="Contoh: Format naskah ringkas edukatif..."
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
                  System prompt mendikte peran AI, pembatasan bahasa, hook awal (maksimal 10 kata), struktur poin cerita/klimaks, larangan tanda kurung arahan panggung, dan pertanyaan penutup (CTA).
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
                  Klik tag variabel di bawah untuk menyisipkan placeholder otomatis ke dalam prompt:
                </p>
                <div className="flex flex-wrap gap-1.5 py-1">
                  {["{topic}", "{tone}", "{target_duration}", "{word_count}", "{scene_context}"].map((token) => (
                    <button
                      type="button"
                      key={token}
                      onClick={() => {
                        setTemplateForm((prev) => ({
                          ...prev,
                          user_prompt_template: prev.user_prompt_template + " " + token,
                        }));
                      }}
                      className="px-2 py-0.5 rounded bg-surface hover:bg-brand-500/20 border border-surface-border text-[11px] font-mono text-brand-300 transition"
                      title="Klik untuk menambahkan variabel"
                    >
                      + {token}
                    </button>
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
                    {updateTemplateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan Preset"}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      </main>

      {/* MODAL: TAMBAH PRESET NASKAH BARU */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-2xl bg-[#0E1017] border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Buat Preset Naskah Baru</h3>
                  <p className="text-[11px] text-slate-400">Tambahkan struktur dan formula prompt khusus untuk video Anda</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateTemplateSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Preset <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Review Produk Unboxing"
                    value={newTemplateForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^_+|_+$/g, "");
                      setNewTemplateForm({
                        ...newTemplateForm,
                        name,
                        id: slug ? `preset_${slug}` : newTemplateForm.id,
                      });
                    }}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-medium focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    ID Identifier (Slug Unik) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="preset_review_unboxing"
                    value={newTemplateForm.id}
                    onChange={(e) =>
                      setNewTemplateForm({
                        ...newTemplateForm,
                        id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                      })
                    }
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tone Bawaan
                  </label>
                  <select
                    value={newTemplateForm.default_tone}
                    onChange={(e) => setNewTemplateForm({ ...newTemplateForm, default_tone: e.target.value })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="santai">Santai (Casual & Friendly)</option>
                    <option value="formal">Formal (Professional & Clear)</option>
                    <option value="dramatis">Dramatis (Tense & Emotional)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Deskripsi Ringkas
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Format naskah khusus affiliate dan unboxing"
                    value={newTemplateForm.description}
                    onChange={(e) => setNewTemplateForm({ ...newTemplateForm, description: e.target.value })}
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  1. System Prompt (Instruksi Persona & Struktur Naskah) <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={5}
                  required
                  value={newTemplateForm.system_prompt}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, system_prompt: e.target.value })}
                  placeholder="Instruksi sistem persona dan format naskah..."
                  className="w-full p-3 bg-black/60 rounded-xl border border-surface-border text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    2. User Prompt Template (Format Input) <span className="text-rose-400">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {["{topic}", "{tone}", "{target_duration}", "{word_count}", "{scene_context}"].map((token) => (
                      <button
                        type="button"
                        key={token}
                        onClick={() => {
                          setNewTemplateForm((prev) => ({
                            ...prev,
                            user_prompt_template: prev.user_prompt_template + " " + token,
                          }));
                        }}
                        className="px-1.5 py-0.2 rounded bg-surface hover:bg-brand-500/20 border border-surface-border text-[10px] font-mono text-brand-300 transition"
                      >
                        + {token}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  value={newTemplateForm.user_prompt_template}
                  onChange={(e) => setNewTemplateForm({ ...newTemplateForm, user_prompt_template: e.target.value })}
                  placeholder="Template format variabel..."
                  className="w-full p-3 bg-black/60 rounded-xl border border-surface-border text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-surface-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createTemplateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-lg shadow-brand-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {createTemplateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{createTemplateMutation.isPending ? "Menyimpan..." : "Buat Preset Naskah"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

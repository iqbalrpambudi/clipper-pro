"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Sparkles,
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
  Palette,
  Sliders,
  Type,
  Move,
  Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { NarrationTemplate, SubtitlePreset } from "@/types";

const FONT_OPTIONS = [
  "Montserrat",
  "Bebas Neue",
  "Inter",
  "Poppins",
  "Anton",
  "Oswald",
  "Roboto",
];

const COLOR_PILLS = [
  { label: "Kuning", color: "#FFE600" },
  { label: "Hijau Neon", color: "#00FF66" },
  { label: "Cyan", color: "#38BDF8" },
  { label: "Magenta", color: "#FF007A" },
  { label: "Putih", color: "#FFFFFF" },
  { label: "Merah", color: "#FF3344" },
  { label: "Oranye", color: "#FF8800" },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const [activeSettingsTab, setActiveSettingsTab] = useState<"models" | "prompts" | "subtitles">("models");

  // ==========================================
  // TAB 1: MODEL & TTS CONFIG STATE
  // ==========================================
  const [baseUrl, setBaseUrl] = useState("");
  const [chatModel, setChatModel] = useState("gemini-2.5-flash");
  const [visionModel, setVisionModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [ttsProvider, setTtsProvider] = useState("gemini");
  const [ttsModel, setTtsModel] = useState("gemini-2.5-flash-preview-tts");
  const [ttsApiKey, setTtsApiKey] = useState("");

  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // ==========================================
  // TAB 2: TEMPLATE PROMPT STATE
  // ==========================================
  const [selectedTemplateId, setSelectedTemplateId] = useState("fakta_unik");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "custom",
    sub_category: "",
    system_prompt: "",
    user_prompt_template: "",
    default_tone: "santai",
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState({
    id: "",
    name: "",
    description: "",
    category: "custom",
    sub_category: "",
    system_prompt: "",
    user_prompt_template: "",
    default_tone: "santai",
  });

  // ==========================================
  // TAB 3: SUBTITLE PRESETS STATE
  // ==========================================
  const [selectedSubtitlePresetId, setSelectedSubtitlePresetId] = useState("viral_tiktok");
  const [subtitlePresetForm, setSubtitlePresetForm] = useState<SubtitlePreset>({
    id: "viral_tiktok",
    name: "Viral TikTok / Reels",
    description: "Font tebal sans-serif...",
    preset_name: "viral_tiktok",
    is_builtin: true,
    font_family: "Poppins",
    font_size: 56,
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0.0,
    position: "bottom",
    offset_y: -120,
    offset_x: 0,
    display_mode: "per_word",
    burst_word_count: 2,
    highlight_animation: "scale",
    scale_factor: 1.15,
    emoji_enabled: true,
  });

  const [isCreateSubtitleModalOpen, setIsCreateSubtitleModalOpen] = useState(false);
  const [newSubtitlePresetForm, setNewSubtitlePresetForm] = useState({
    id: "",
    name: "",
    description: "",
    font_family: "Poppins",
    font_size: 56,
    font_weight: "Bold",
    primary_color: "#FFFFFF",
    highlight_color: "#FFE600",
    outline_color: "#000000",
    outline_width: 5,
    box_color: "#000000",
    box_opacity: 0.0,
    position: "bottom" as "bottom" | "center" | "top",
    offset_y: -120,
    offset_x: 0,
    display_mode: "per_word" as "per_word" | "burst" | "full_sentence",
    burst_word_count: 2,
    highlight_animation: "scale" as "scale" | "color" | "box" | "none",
    scale_factor: 1.15,
    emoji_enabled: true,
  });

  // Live Preview Animation Step for Subtitle
  const [previewWordIndex, setPreviewWordIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPreviewWordIndex((prev) => (prev + 1) % 4);
    }, 900);
    return () => clearInterval(timer);
  }, []);

  // ==========================================
  // QUERIES
  // ==========================================
  const { data: config } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

  const { data: subtitlePresets = [] } = useQuery({
    queryKey: ["subtitle-presets"],
    queryFn: api.getSubtitlePresets,
  });

  useEffect(() => {
    if (config) {
      setBaseUrl(config.base_url || "");
      setChatModel(config.chat_model || "gemini-2.5-flash");
      setVisionModel(config.vision_model || "gemini-2.5-flash");
      setTtsProvider(config.tts_provider || "gemini");
      if (config.tts_provider && config.tts_provider.startsWith("gemini-")) {
        setTtsModel(config.tts_provider);
      } else {
        setTtsModel("gemini-2.5-flash-preview-tts");
      }
    }
  }, [config]);

  // Sync selected narration template into form
  useEffect(() => {
    const current = templates.find((t) => t.id === selectedTemplateId) || templates[0];
    if (current) {
      setTemplateForm({
        name: current.name,
        description: current.description || "",
        category: current.category,
        sub_category: current.sub_category || "",
        system_prompt: current.system_prompt,
        user_prompt_template: current.user_prompt_template,
        default_tone: current.default_tone,
      });
      if (selectedTemplateId !== current.id) {
        setSelectedTemplateId(current.id);
      }
    }
  }, [selectedTemplateId, templates]);

  // Sync selected subtitle preset into form
  useEffect(() => {
    const current = subtitlePresets.find((p) => p.id === selectedSubtitlePresetId) || subtitlePresets[0];
    if (current) {
      setSubtitlePresetForm({
        ...current,
        id: current.id,
        name: current.name || current.preset_name,
        description: current.description || "",
        scale_factor: current.scale_factor ?? 1.15,
        box_opacity: current.box_opacity ?? 0.0,
      });
      if (selectedSubtitlePresetId !== current.id) {
        setSelectedSubtitlePresetId(current.id);
      }
    }
  }, [selectedSubtitlePresetId, subtitlePresets]);

  // ==========================================
  // MUTATIONS (MODELS)
  // ==========================================
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
      tts_provider: ttsProvider === "gemini" ? ttsModel : ttsProvider,
      tts_api_key: ttsApiKey.trim() || undefined,
    });
  };

  // ==========================================
  // MUTATIONS (TEMPLATES)
  // ==========================================
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
        category: updated.category,
        sub_category: updated.sub_category || "",
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

  // ==========================================
  // MUTATIONS (SUBTITLE PRESETS)
  // ==========================================
  const updateSubtitlePresetMutation = useMutation({
    mutationFn: (data: Partial<SubtitlePreset>) =>
      api.updateSubtitlePreset(selectedSubtitlePresetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      showToast("Preset gaya subtitle berhasil diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui preset subtitle", "error");
    },
  });

  const createSubtitlePresetMutation = useMutation({
    mutationFn: (data: Partial<SubtitlePreset>) => api.createSubtitlePreset(data),
    onSuccess: (newPreset) => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      setSelectedSubtitlePresetId(newPreset.id);
      setIsCreateSubtitleModalOpen(false);
      showToast("Preset subtitle baru berhasil ditambahkan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membuat preset subtitle", "error");
    },
  });

  const deleteSubtitlePresetMutation = useMutation({
    mutationFn: (id: string) => api.deleteSubtitlePreset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      const firstBuiltin = subtitlePresets.find((p) => p.is_builtin)?.id || "viral_tiktok";
      setSelectedSubtitlePresetId(firstBuiltin);
      showToast("Preset subtitle berhasil dihapus", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menghapus preset subtitle", "error");
    },
  });

  const resetSubtitlePresetMutation = useMutation({
    mutationFn: () => api.resetSubtitlePreset(selectedSubtitlePresetId),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["subtitle-presets"] });
      setSubtitlePresetForm(updated);
      showToast("Preset subtitle berhasil di-reset ke setelan standar pabrik!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal me-reset preset subtitle", "error");
    },
  });

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleOpenCreateModal = () => {
    setNewTemplateForm({
      id: `preset_${Date.now().toString(36)}`,
      name: "",
      description: "",
      category: "custom",
      sub_category: "",
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
    const cleanId = newTemplateForm.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    createTemplateMutation.mutate({ ...newTemplateForm, id: cleanId });
  };

  const handleOpenCreateSubtitleModal = () => {
    setNewSubtitlePresetForm({
      id: `sub_${Date.now().toString(36)}`,
      name: "",
      description: "",
      font_family: "Poppins",
      font_size: 56,
      font_weight: "Bold",
      primary_color: "#FFFFFF",
      highlight_color: "#FFE600",
      outline_color: "#000000",
      outline_width: 5,
      box_color: "#000000",
      box_opacity: 0.0,
      position: "bottom",
      offset_y: -120,
      offset_x: 0,
      display_mode: "per_word",
      burst_word_count: 2,
      highlight_animation: "scale",
      scale_factor: 1.15,
      emoji_enabled: true,
    });
    setIsCreateSubtitleModalOpen(true);
  };

  const handleCreateSubtitleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtitlePresetForm.name.trim()) {
      showToast("Nama Preset Subtitle wajib diisi", "error");
      return;
    }
    const cleanId = (newSubtitlePresetForm.id || `sub_${Date.now().toString(36)}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");

    createSubtitlePresetMutation.mutate({
      ...newSubtitlePresetForm,
      id: cleanId,
    });
  };

  const currentSelectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const currentSelectedSubtitlePreset = subtitlePresets.find((p) => p.id === selectedSubtitlePresetId);

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
                Pengaturan Sistem & Preset
              </h1>
              <p className="text-[11px] text-slate-400">Model AI, Preset Naskah Prompt & Kustomisasi Gaya Subtitle</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-4xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-surface-border pb-3 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSettingsTab("models")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeSettingsTab === "prompts"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "text-slate-400 hover:text-white hover:bg-surface-hover"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Prompt AI & Preset Naskah</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSettingsTab("subtitles")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeSettingsTab === "subtitles"
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "text-slate-400 hover:text-white hover:bg-surface-hover"
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Preset Gaya Subtitle</span>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: MODEL & TTS CONFIGURATION                                          */}
        {/* ========================================================================= */}
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
                    <option value="gemini">Gemini TTS</option>
                    <option value="edge">Edge-TTS (Natural Indonesian, Free)</option>
                  </select>
                </div>

                {ttsProvider === "gemini" && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Gemini TTS Model
                    </label>
                    <select
                      value={ttsModel}
                      onChange={(e) => setTtsModel(e.target.value)}
                      className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                    >
                      <option value="gemini-2.5-flash-preview-tts">Gemini 2.5 Flash TTS (stabil)</option>
                      <option value="gemini-3.8-flash-tts">Gemini 3.8 Flash TTS (kualitas studio)</option>
                      <option value="gemini-3.8-flash-lite-tts">Gemini 3.8 Flash-Lite TTS (murah, volume tinggi)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      3.8: kualitas acting lebih bagus &amp; stabil untuk narasi panjang. 2.5: default lama, tidak berubah.
                    </p>
                  </div>
                )}

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

        {/* ========================================================================= */}
        {/* TAB 2: PROMPT AI & PRESET NASKAH                                          */}
        {/* ========================================================================= */}
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

                      <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between items-center gap-1.5">
                        <span className="font-mono text-slate-400 truncate max-w-[100px]">{tpl.id}</span>
                        {tpl.sub_category && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-slate-300 truncate max-w-[90px]" title={tpl.sub_category}>
                            {tpl.sub_category}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${
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
              <form onSubmit={(e) => { e.preventDefault(); updateTemplateMutation.mutate(templateForm); }} className="glass-panel rounded-2xl p-6 border border-surface-border space-y-6">
                <div className="flex items-center justify-between border-b border-surface-border pb-4 flex-wrap gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2 truncate">
                      <Code className="w-4 h-4 text-accent-yellow shrink-0" />
                      <span className="truncate">Editor Preset: {currentSelectedTemplate.name}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <option value="tegang">Tegang (Tense & Gripping)</option>
                      <option value="formal">Formal (Professional & Clear)</option>
                      <option value="dramatis">Dramatis (Tense & Emotional)</option>
                      <option value="kocak">Kocak (Funny & Lempeng)</option>
                      <option value="berwibawa">Berwibawa (Authoritative)</option>
                      <option value="mencekam">Mencekam (Creepy & Dark)</option>
                      <option value="hangat">Hangat (Warm & Touching)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Preset / Kategori
                    </label>
                    <select
                      value={templateForm.category}
                      onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                    >
                      <option value="film">Alur Cerita Film</option>
                      <option value="viral">Konten Viral</option>
                      <option value="fakta">Fakta & Trivia</option>
                      <option value="edukasi">Edukasi & Tips</option>
                      <option value="custom">Kustom</option>
                    </select>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Sub-kategori (Opsional)
                    </label>
                    <input
                      type="text"
                      value={templateForm.sub_category}
                      onChange={(e) => setTemplateForm({ ...templateForm, sub_category: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      placeholder="Mis. Aksi, Komedi, POV Imersif, Bongkar Mitos..."
                    />
                  </div>

                  <div className="sm:col-span-2">
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

        {/* ========================================================================= */}
        {/* TAB 3: PRESET GAYA SUBTITLE                                               */}
        {/* ========================================================================= */}
        {activeSettingsTab === "subtitles" && (
          <div className="space-y-6">
            {/* Subtitle Presets Header & Selector Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-accent-yellow" />
                  <h3 className="text-sm font-bold text-white">Preset Gaya Subtitle Video</h3>
                  <span className="text-[11px] text-slate-400">
                    ({subtitlePresets.length} preset tersedia)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreateSubtitleModal}
                  className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/20 transition transform active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Preset Subtitle Baru</span>
                </button>
              </div>

              {/* Subtitle Preset Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {subtitlePresets.map((preset) => {
                  const isSelected = selectedSubtitlePresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() => setSelectedSubtitlePresetId(preset.id)}
                      className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                        isSelected
                          ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/15 ring-1 ring-brand-500/30"
                          : "border-surface-border hover:border-slate-500 bg-surface/50"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <Palette className="w-3.5 h-3.5 text-accent-yellow shrink-0" />
                            <span className="text-xs font-bold text-white truncate min-w-0" title={preset.name}>
                              {preset.name}
                            </span>
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-2">
                          {preset.description || "Gaya subtitle kustom"}
                        </p>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-surface-border/50">
                        {/* Style badges */}
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-surface border border-surface-border text-slate-300 font-mono">
                            {preset.font_family} ({preset.font_size}px)
                          </span>
                          <span className="flex items-center gap-1">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/40"
                              style={{ backgroundColor: preset.highlight_color }}
                              title={`Highlight: ${preset.highlight_color}`}
                            />
                            <span className="text-slate-400 font-mono text-[9px] uppercase">{preset.display_mode}</span>
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span className="font-mono text-slate-400 truncate max-w-[120px]">{preset.id}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${
                            preset.is_builtin ? "bg-brand-500/20 text-brand-300" : "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {preset.is_builtin ? "Bawaan" : "Kustom"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Subtitle Preset Live Editor */}
            {currentSelectedSubtitlePreset && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateSubtitlePresetMutation.mutate(subtitlePresetForm);
                }}
                className="glass-panel rounded-2xl p-6 border border-surface-border space-y-6"
              >
                {/* Editor Header */}
                <div className="flex items-center justify-between border-b border-surface-border pb-4 flex-wrap gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white flex items-center gap-2 truncate">
                      <Sliders className="w-4 h-4 text-accent-yellow shrink-0" />
                      <span className="truncate">Editor Gaya Subtitle: {currentSelectedSubtitlePreset.name}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>ID Preset:</span>
                      <code className="text-brand-300 font-mono text-[11px] bg-brand-500/10 px-1.5 py-0.5 rounded">
                        {currentSelectedSubtitlePreset.id}
                      </code>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                        currentSelectedSubtitlePreset.is_builtin ? "bg-brand-500/20 text-brand-300" : "bg-emerald-500/20 text-emerald-300"
                      }`}>
                        {currentSelectedSubtitlePreset.is_builtin ? "Preset Bawaan" : "Preset Kustom"}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentSelectedSubtitlePreset.is_builtin ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Reset preset subtitle "${currentSelectedSubtitlePreset.name}" ke setelan standar pabrik?`)) {
                            resetSubtitlePresetMutation.mutate();
                          }
                        }}
                        disabled={resetSubtitlePresetMutation.isPending}
                        className="px-3 py-1.5 rounded-xl bg-surface border border-surface-border hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                        title="Kembalikan preset ke setelan default pabrik"
                      >
                        {resetSubtitlePresetMutation.isPending ? (
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
                          if (confirm(`Hapus preset subtitle "${currentSelectedSubtitlePreset.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
                            deleteSubtitlePresetMutation.mutate(currentSelectedSubtitlePreset.id);
                          }
                        }}
                        disabled={deleteSubtitlePresetMutation.isPending}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                        title="Hapus preset subtitle kustom ini"
                      >
                        {deleteSubtitlePresetMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span>Hapus Preset</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* LIVE VISUAL PREVIEW BOX */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
                      <span>Live Visual Preview Animasi Subtitle</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Animasi Otomatis (Demo Karaoke)
                    </span>
                  </div>

                  <div className="relative w-full h-36 bg-gradient-to-b from-[#161922] to-[#0A0C10] rounded-2xl border border-surface-border overflow-hidden flex items-center justify-center p-4 shadow-inner">
                    {/* Background subtle video grid effect */}
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#4f46e5_1px,transparent_1px)] [background-size:16px_16px]" />
                    
                    {/* Subtitle Positioning Container */}
                    <div
                      className={`relative z-10 text-center transition-all duration-300 ${
                        subtitlePresetForm.position === "top"
                          ? "self-start pt-2"
                          : subtitlePresetForm.position === "center"
                          ? "self-center"
                          : "self-end pb-2"
                      }`}
                      style={{
                        transform: `translate(${subtitlePresetForm.offset_x * 0.25}px, ${subtitlePresetForm.offset_y * 0.25}px)`,
                      }}
                    >
                      {/* Box Backdrop if active */}
                      <div
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl transition-all"
                        style={{
                          backgroundColor: subtitlePresetForm.box_opacity > 0
                            ? `${subtitlePresetForm.box_color}${Math.round(subtitlePresetForm.box_opacity * 255).toString(16).padStart(2, "0")}`
                            : "transparent",
                        }}
                      >
                        {["RAHASIA", "BESAR", "DI BALIK", "DUNIA"].map((word, wIdx) => {
                          const isHighlighted =
                            subtitlePresetForm.display_mode === "full_sentence"
                              ? true
                              : subtitlePresetForm.display_mode === "burst"
                              ? (subtitlePresetForm.burst_word_count === 3 ? wIdx <= 2 : wIdx <= 1)
                              : previewWordIndex === wIdx;

                          const strokeWidth = Math.max(1, Math.round(subtitlePresetForm.outline_width * 0.5));
                          const color = isHighlighted ? subtitlePresetForm.highlight_color : subtitlePresetForm.primary_color;
                          const isScale = isHighlighted && subtitlePresetForm.highlight_animation === "scale";

                          return (
                            <span
                              key={word}
                              className="inline-block transition-all duration-200 tracking-wide select-none"
                              style={{
                                fontFamily: subtitlePresetForm.font_family,
                                fontSize: `${Math.round(subtitlePresetForm.font_size * 0.45)}px`,
                                fontWeight: subtitlePresetForm.font_weight === "ExtraBold" ? 800 : subtitlePresetForm.font_weight === "Bold" ? 700 : 500,
                                color: color,
                                WebkitTextStroke: `${strokeWidth}px ${subtitlePresetForm.outline_color}`,
                                paintOrder: "stroke fill",
                                transform: isScale ? `scale(${subtitlePresetForm.scale_factor || 1.15})` : "scale(1)",
                                textShadow: `0 2px 8px ${subtitlePresetForm.outline_color}`,
                              }}
                            >
                              {word}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* META INFO */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Nama Preset Subtitle
                    </label>
                    <input
                      type="text"
                      value={subtitlePresetForm.name}
                      onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs font-semibold focus:outline-none focus:border-brand-500"
                      placeholder="Contoh: Viral TikTok Neon"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Deskripsi Ringkas
                    </label>
                    <input
                      type="text"
                      value={subtitlePresetForm.description || ""}
                      onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      placeholder="Contoh: Gaya bold dengan outline hitam tebal..."
                    />
                  </div>
                </div>

                {/* 1. TIPOGRAFI & FONT */}
                <div className="p-4 rounded-xl bg-surface/50 border border-surface-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-brand-400" />
                    <h4 className="text-xs font-bold text-white">1. Tipografi & Huruf</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Font Family
                      </label>
                      <select
                        value={subtitlePresetForm.font_family}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, font_family: e.target.value })}
                        className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 font-sans"
                      >
                        {FONT_OPTIONS.map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Ukuran Font</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {subtitlePresetForm.font_size}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={30}
                        max={90}
                        step={2}
                        value={subtitlePresetForm.font_size}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, font_size: parseInt(e.target.value) })}
                        className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Ketebalan Font (Weight)
                      </label>
                      <select
                        value={subtitlePresetForm.font_weight}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, font_weight: e.target.value })}
                        className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="Normal">Normal</option>
                        <option value="Bold">Bold (Tebal)</option>
                        <option value="ExtraBold">Extra Bold (Sangat Tebal)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 2. WARNA & OUTLINE */}
                <div className="p-4 rounded-xl bg-surface/50 border border-surface-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-accent-yellow" />
                    <h4 className="text-xs font-bold text-white">2. Warna Teks, Highlight & Outline</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Primary Color */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Warna Utama Teks
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={subtitlePresetForm.primary_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, primary_color: e.target.value })}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={subtitlePresetForm.primary_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, primary_color: e.target.value })}
                          className="w-full px-3 py-1.5 bg-surface rounded-lg border border-surface-border text-white font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Highlight Color */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Warna Highlight (Kata Aktif)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={subtitlePresetForm.highlight_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, highlight_color: e.target.value })}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={subtitlePresetForm.highlight_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, highlight_color: e.target.value })}
                          className="w-full px-3 py-1.5 bg-surface rounded-lg border border-surface-border text-white font-mono text-xs focus:outline-none"
                        />
                      </div>
                      {/* Color pills quick select */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {COLOR_PILLS.map((pill) => (
                          <button
                            type="button"
                            key={pill.color}
                            onClick={() => setSubtitlePresetForm({ ...subtitlePresetForm, highlight_color: pill.color })}
                            className="w-4 h-4 rounded-full border border-black/50 transition transform hover:scale-125"
                            style={{ backgroundColor: pill.color }}
                            title={pill.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Outline Color & Width */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Warna & Lebar Outline</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {subtitlePresetForm.outline_width}px
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={subtitlePresetForm.outline_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, outline_color: e.target.value })}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="range"
                          min={0}
                          max={10}
                          step={1}
                          value={subtitlePresetForm.outline_width}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, outline_width: parseInt(e.target.value) })}
                          className="w-full h-2 bg-surface rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. BACKGROUND BOX & ANIMATION */}
                <div className="p-4 rounded-xl bg-surface/50 border border-surface-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <h4 className="text-xs font-bold text-white">3. Mode Tampilan, Animasi & Kotak Background</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Display Mode */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Mode Penampilan Kata
                      </label>
                      <select
                        value={subtitlePresetForm.display_mode}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, display_mode: e.target.value as any })}
                        className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="per_word">Per Kata (Karaoke)</option>
                        <option value="burst">Burst (2-3 Kata Hormozi)</option>
                        <option value="full_sentence">Kalimat Penuh</option>
                      </select>
                    </div>

                    {/* Highlight Animation */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Animasi Highlight
                      </label>
                      <select
                        value={subtitlePresetForm.highlight_animation}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, highlight_animation: e.target.value as any })}
                        className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="scale">Scale Up (Efek Punch Pop)</option>
                        <option value="color">Perubahan Warna Saja</option>
                        <option value="box">Kotak Highlight Latar</option>
                        <option value="none">Tanpa Animasi</option>
                      </select>
                    </div>

                    {/* Scale Factor */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Skala Pembesaran Kata</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {(subtitlePresetForm.scale_factor || 1.15).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1.05}
                        max={1.8}
                        step={0.05}
                        value={subtitlePresetForm.scale_factor || 1.15}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, scale_factor: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-surface-border/50">
                    {/* Box Color */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Warna Kotak Background
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={subtitlePresetForm.box_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, box_color: e.target.value })}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={subtitlePresetForm.box_color}
                          onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, box_color: e.target.value })}
                          className="w-full px-3 py-1.5 bg-surface rounded-lg border border-surface-border text-white font-mono text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Box Opacity */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Opasitas Kotak Background</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {Math.round(subtitlePresetForm.box_opacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={subtitlePresetForm.box_opacity}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, box_opacity: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. POSISI & OFFSET */}
                <div className="p-4 rounded-xl bg-surface/50 border border-surface-border space-y-3">
                  <div className="flex items-center gap-2">
                    <Move className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white">4. Posisi Layar & Offset Presisi</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Posisi Vertikal Dasar
                      </label>
                      <select
                        value={subtitlePresetForm.position}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, position: e.target.value as any })}
                        className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                      >
                        <option value="bottom">Bawah Layar (Bottom)</option>
                        <option value="center">Tengah Layar (Center)</option>
                        <option value="top">Atas Layar (Top)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Offset Y (Vertikal)</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {subtitlePresetForm.offset_y}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-250}
                        max={250}
                        step={5}
                        value={subtitlePresetForm.offset_y}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, offset_y: parseInt(e.target.value) })}
                        className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Offset X (Horizontal)</label>
                        <span className="text-[10px] font-mono text-brand-400 font-bold">
                          {subtitlePresetForm.offset_x}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-150}
                        max={150}
                        step={5}
                        value={subtitlePresetForm.offset_x}
                        onChange={(e) => setSubtitlePresetForm({ ...subtitlePresetForm, offset_x: parseInt(e.target.value) })}
                        className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
                  <button
                    type="submit"
                    disabled={updateSubtitlePresetMutation.isPending}
                    className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-xl shadow-brand-500/25 transition transform active:scale-95 flex items-center gap-2 disabled:opacity-50"
                  >
                    {updateSubtitlePresetMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {updateSubtitlePresetMutation.isPending ? "Menyimpan..." : "Simpan Perubahan Gaya Subtitle"}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL: TAMBAH PRESET NASKAH BARU                                          */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-2xl bg-[#0E1017] border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                    <option value="tegang">Tegang (Tense & Gripping)</option>
                    <option value="formal">Formal (Professional & Clear)</option>
                    <option value="dramatis">Dramatis (Tense & Emotional)</option>
                    <option value="kocak">Kocak (Funny & Lempeng)</option>
                    <option value="berwibawa">Berwibawa (Authoritative)</option>
                    <option value="mencekam">Mencekam (Creepy & Dark)</option>
                    <option value="hangat">Hangat (Warm & Touching)</option>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Preset / Kategori
                  </label>
                  <select
                    value={newTemplateForm.category}
                    onChange={(e) => setNewTemplateForm({ ...newTemplateForm, category: e.target.value })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="custom">Kustom</option>
                    <option value="film">Alur Cerita Film</option>
                    <option value="viral">Konten Viral</option>
                    <option value="fakta">Fakta & Trivia</option>
                    <option value="edukasi">Edukasi & Tips</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Sub-kategori (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Mis. Aksi, POV Imersif, Bongkar Mitos..."
                    value={newTemplateForm.sub_category}
                    onChange={(e) => setNewTemplateForm({ ...newTemplateForm, sub_category: e.target.value })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
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

      {/* ========================================================================= */}
      {/* MODAL: TAMBAH PRESET SUBTITLE BARU                                        */}
      {/* ========================================================================= */}
      {isCreateSubtitleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-2xl bg-[#0E1017] border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent-yellow/10 text-accent-yellow">
                  <Palette className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Buat Preset Gaya Subtitle Baru</h3>
                  <p className="text-[11px] text-slate-400">Rancang kombinasi font, warna, animasi, dan layout subtitle kustom</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateSubtitleModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubtitleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nama Preset Subtitle <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Cyber Neon Punch"
                    value={newSubtitlePresetForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "_")
                        .replace(/^_+|_+$/g, "");
                      setNewSubtitlePresetForm({
                        ...newSubtitlePresetForm,
                        name,
                        id: slug ? `sub_${slug}` : newSubtitlePresetForm.id,
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
                    placeholder="sub_cyber_neon"
                    value={newSubtitlePresetForm.id}
                    onChange={(e) =>
                      setNewSubtitlePresetForm({
                        ...newSubtitlePresetForm,
                        id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                      })
                    }
                    className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deskripsi Ringkas
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Gaya teks tebal warna kuning neon dengan outline pekat..."
                  value={newSubtitlePresetForm.description}
                  onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Font Family
                  </label>
                  <select
                    value={newSubtitlePresetForm.font_family}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, font_family: e.target.value })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ukuran Font ({newSubtitlePresetForm.font_size}px)
                  </label>
                  <input
                    type="range"
                    min={32}
                    max={84}
                    step={2}
                    value={newSubtitlePresetForm.font_size}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, font_size: parseInt(e.target.value) })}
                    className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ketebalan (Weight)
                  </label>
                  <select
                    value={newSubtitlePresetForm.font_weight}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, font_weight: e.target.value })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Bold">Bold</option>
                    <option value="ExtraBold">Extra Bold</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Warna Utama
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newSubtitlePresetForm.primary_color}
                      onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, primary_color: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={newSubtitlePresetForm.primary_color}
                      onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, primary_color: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-surface rounded-lg border border-surface-border text-white font-mono text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Warna Highlight
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newSubtitlePresetForm.highlight_color}
                      onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, highlight_color: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={newSubtitlePresetForm.highlight_color}
                      onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, highlight_color: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-surface rounded-lg border border-surface-border text-white font-mono text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mode Penampilan
                  </label>
                  <select
                    value={newSubtitlePresetForm.display_mode}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, display_mode: e.target.value as any })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="per_word">Per Kata (Karaoke)</option>
                    <option value="burst">Burst (2-3 Kata)</option>
                    <option value="full_sentence">Kalimat Penuh</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Animasi Highlight
                  </label>
                  <select
                    value={newSubtitlePresetForm.highlight_animation}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, highlight_animation: e.target.value as any })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="scale">Scale Up (Efek Punch Pop)</option>
                    <option value="color">Perubahan Warna Saja</option>
                    <option value="box">Kotak Highlight Latar</option>
                    <option value="none">Tanpa Animasi</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Posisi Layar
                  </label>
                  <select
                    value={newSubtitlePresetForm.position}
                    onChange={(e) => setNewSubtitlePresetForm({ ...newSubtitlePresetForm, position: e.target.value as any })}
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="bottom">Bawah Layar (Bottom)</option>
                    <option value="center">Tengah Layar (Center)</option>
                    <option value="top">Atas Layar (Top)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-surface-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateSubtitleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-surface text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createSubtitlePresetMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs shadow-lg shadow-brand-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {createSubtitlePresetMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>{createSubtitlePresetMutation.isPending ? "Menyimpan..." : "Buat Preset Subtitle"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

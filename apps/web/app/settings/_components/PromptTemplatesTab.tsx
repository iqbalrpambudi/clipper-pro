"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Film,
  Lightbulb,
  BookOpen,
  Sparkles,
  MessageSquareQuote,
  CheckCircle2,
  Code,
  RotateCcw,
  Loader2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { NarrationTemplate } from "@/types";

export function PromptTemplatesTab() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

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

  const updateTemplateMutation = useMutation({
    mutationFn: (data: Partial<NarrationTemplate>) => api.updateTemplate(selectedTemplateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      showToast("Preset template naskah berhasil diperbarui!", "success");
    },
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
      showToast(err.message || "Gagal me-reset template", "error");
    },
  });

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
    const cleanId = newTemplateForm.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_");
    createTemplateMutation.mutate({ ...newTemplateForm, id: cleanId });
  };

  const currentSelectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
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
            className="px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-black text-xs font-semibold flex items-center gap-1.5 shadow-xs transition"
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
                className={`rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                    : "border-[#2E2E2E] hover:border-[#3E3E3E] bg-[#181818]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {tpl.category === "recap" && (
                        <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      )}
                      {tpl.category === "fakta" && (
                        <Lightbulb className="w-3.5 h-3.5 text-accent-yellow shrink-0" />
                      )}
                      {tpl.category === "edukasi" && (
                        <BookOpen className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                      )}
                      {tpl.category === "showcase" && (
                        <Sparkles className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      )}
                      {tpl.category === "opini" && (
                        <MessageSquareQuote className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      {!["recap", "fakta", "edukasi", "showcase", "opini"].includes(
                        tpl.category
                      ) && <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      <span
                        className="text-xs font-bold text-white truncate min-w-0"
                        title={tpl.name}
                      >
                        {tpl.name}
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-2">
                    {tpl.description || "Tidak ada deskripsi"}
                  </p>
                </div>

                <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between items-center gap-1.5">
                  <span className="font-mono text-slate-400 truncate max-w-[100px]">
                    {tpl.id}
                  </span>
                  {tpl.sub_category && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-slate-300 truncate max-w-[90px]"
                      title={tpl.sub_category}
                    >
                      {tpl.sub_category}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${
                      tpl.is_builtin
                        ? "bg-brand-500/20 text-brand-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateTemplateMutation.mutate(templateForm);
          }}
          className="rounded-xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-6 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-surface-border pb-4 flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2 truncate">
                <Code className="w-4 h-4 text-accent-yellow shrink-0" />
                <span className="truncate">
                  Editor Preset: {currentSelectedTemplate.name}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>ID Preset:</span>
                <code className="text-brand-300 font-mono text-[11px] bg-brand-500/10 px-1.5 py-0.5 rounded">
                  {currentSelectedTemplate.id}
                </code>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase ${
                    currentSelectedTemplate.is_builtin
                      ? "bg-brand-500/20 text-brand-300"
                      : "bg-emerald-500/20 text-emerald-300"
                  }`}
                >
                  {currentSelectedTemplate.is_builtin ? "Preset Bawaan" : "Preset Kustom"}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {currentSelectedTemplate.is_builtin ? (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm("Reset prompt preset ini ke setelan standar bawaan pabrik?")
                    ) {
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
                    if (
                      confirm(
                        `Hapus preset naskah "${currentSelectedTemplate.name}"? Tindakan ini tidak dapat dibatalkan.`
                      )
                    ) {
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
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, default_tone: e.target.value })
                }
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
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, category: e.target.value })
                }
                className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="recap">Alur Cerita & Story</option>
                <option value="fakta">Fakta & Trivia</option>
                <option value="edukasi">Edukasi & Tips</option>
                <option value="showcase">Showcase & Review</option>
                <option value="opini">Opini & POV</option>
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
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, sub_category: e.target.value })
                }
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
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, description: e.target.value })
                }
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
              System prompt mendikte peran AI, pembatasan bahasa, hook awal (maksimal 10
              kata), struktur poin cerita/klimaks, larangan tanda kurung arahan panggung, dan
              pertanyaan penutup (CTA).
            </p>
            <textarea
              rows={9}
              value={templateForm.system_prompt}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, system_prompt: e.target.value })
              }
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
              Klik tag variabel di bawah untuk menyisipkan placeholder otomatis ke dalam
              prompt:
            </p>
            <div className="flex flex-wrap gap-1.5 py-1">
              {[
                "{topic}",
                "{tone}",
                "{target_duration}",
                "{word_count}",
                "{scene_context}",
              ].map((token) => (
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
              onChange={(e) =>
                setTemplateForm({ ...templateForm, user_prompt_template: e.target.value })
              }
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
                {updateTemplateMutation.isPending
                  ? "Menyimpan..."
                  : "Simpan Perubahan Preset"}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* MODAL: TAMBAH PRESET NASKAH BARU */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-[#181818] border border-[#2E2E2E] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Buat Preset Naskah Baru</h3>
                  <p className="text-[11px] text-slate-400">
                    Tambahkan struktur dan formula prompt khusus untuk video Anda
                  </p>
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

            <form
              onSubmit={handleCreateTemplateSubmit}
              className="p-6 overflow-y-auto space-y-4 flex-1"
            >
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
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, default_tone: e.target.value })
                    }
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
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, description: e.target.value })
                    }
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
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, category: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  >
                    <option value="custom">Kustom</option>
                    <option value="recap">Alur Cerita & Story</option>
                    <option value="fakta">Fakta & Trivia</option>
                    <option value="edukasi">Edukasi & Tips</option>
                    <option value="showcase">Showcase & Review</option>
                    <option value="opini">Opini & POV</option>
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
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, sub_category: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  1. System Prompt (Instruksi Persona & Struktur Naskah){" "}
                  <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={5}
                  required
                  value={newTemplateForm.system_prompt}
                  onChange={(e) =>
                    setNewTemplateForm({ ...newTemplateForm, system_prompt: e.target.value })
                  }
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
                    {[
                      "{topic}",
                      "{tone}",
                      "{target_duration}",
                      "{word_count}",
                      "{scene_context}",
                    ].map((token) => (
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
                  onChange={(e) =>
                    setNewTemplateForm({ ...newTemplateForm, user_prompt_template: e.target.value })
                  }
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
                  <span>
                    {createTemplateMutation.isPending ? "Menyimpan..." : "Buat Preset Naskah"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

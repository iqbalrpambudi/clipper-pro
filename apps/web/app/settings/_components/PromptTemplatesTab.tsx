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
import { Badge, Button, Input, NativeSelect, Textarea, WorkspaceChip } from "@/components/ui";

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
            <h3 className="text-sm font-bold text-foreground">Preset Template Naskah</h3>
            <span className="text-[11px] text-muted-foreground">({templates.length} preset tersedia)</span>
          </div>
          <Button
            type="button"
            onClick={handleOpenCreateModal}
            variant="workspace-primary"
            size="workspace-sm"
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Preset Baru</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {templates.map((tpl) => {
            const isSelected = selectedTemplateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedTemplateId(tpl.id)}
                className={`w-full rounded-xl p-4 border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-[#C45B3A] bg-[#F8EEEA] shadow-xs ring-1 ring-[#C45B3A]/30"
                    : "border-[#E5E1D7] hover:border-[#D8CFC2] bg-[#FBFAF7]"
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
                        <MessageSquareQuote className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      )}
                      {!["recap", "fakta", "edukasi", "showcase", "opini"].includes(
                        tpl.category
                      ) && <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      <span
                        className="text-xs font-bold text-foreground truncate min-w-0"
                        title={tpl.name}
                      >
                        {tpl.name}
                      </span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
                    {tpl.description || "Tidak ada deskripsi"}
                  </p>
                </div>

                <div className="pt-2 border-t border-surface-border/50 text-[10px] text-muted-foreground flex justify-between items-center gap-1.5">
                  <span className="font-mono text-muted-foreground truncate max-w-[100px]">{tpl.id}</span>
                  {tpl.sub_category && (
                    <Badge
                      variant="workspace"
                      className="max-w-[90px] truncate rounded px-1.5 py-0.5"
                      title={tpl.sub_category}
                    >
                      {tpl.sub_category}
                    </Badge>
                  )}
                  <Badge
                    variant={tpl.is_builtin ? "workspace" : "workspace-success"}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase"
                  >
                    {tpl.is_builtin ? "Bawaan" : "Kustom"}
                  </Badge>
                </div>
              </button>
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
          className="rounded-xl border border-border bg-card p-6 space-y-6 shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-surface-border pb-4 flex-wrap gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2 truncate">
                <Code className="w-4 h-4 text-accent-yellow shrink-0" />
                <span className="truncate">Editor Preset: {currentSelectedTemplate.name}</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
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
                <Button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset prompt preset ini ke setelan standar bawaan pabrik?")) {
                      resetTemplateMutation.mutate();
                    }
                  }}
                  disabled={resetTemplateMutation.isPending}
                  variant="workspace-secondary"
                  size="workspace-sm"
                  className="gap-1.5"
                  title="Kembalikan prompt ke teks standar pabrik"
                >
                  {resetTemplateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>Reset ke Default</span>
                </Button>
              ) : (
                <Button
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
                  variant="workspace-destructive"
                  size="workspace-sm"
                  className="gap-1.5"
                  title="Hapus preset kustom ini"
                >
                  {deleteTemplateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>Hapus Preset</span>
                </Button>
              )}
            </div>
          </div>

          {/* Template Meta Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Nama Preset Naskah
              </label>
              <Input
                type="text"
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                className="text-xs font-semibold"
                placeholder="Contoh: Fakta Sains Populer"
                required
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Tone Bawaan (Gaya Bahasa)
              </label>
              <NativeSelect
                value={templateForm.default_tone}
                onChange={(e) => setTemplateForm({ ...templateForm, default_tone: e.target.value })}
              >
                <option value="santai">Santai (Casual & Friendly)</option>
                <option value="tegang">Tegang (Tense & Gripping)</option>
                <option value="formal">Formal (Professional & Clear)</option>
                <option value="dramatis">Dramatis (Tense & Emotional)</option>
                <option value="kocak">Kocak (Funny & Lempeng)</option>
                <option value="berwibawa">Berwibawa (Authoritative)</option>
                <option value="mencekam">Mencekam (Creepy & Dark)</option>
                <option value="hangat">Hangat (Warm & Touching)</option>
              </NativeSelect>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Preset / Kategori
              </label>
              <NativeSelect
                value={templateForm.category}
                onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
              >
                <option value="recap">Alur Cerita & Story</option>
                <option value="fakta">Fakta & Trivia</option>
                <option value="edukasi">Edukasi & Tips</option>
                <option value="showcase">Showcase & Review</option>
                <option value="opini">Opini & POV</option>
                <option value="custom">Kustom</option>
              </NativeSelect>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Sub-kategori (Opsional)
              </label>
              <Input
                type="text"
                value={templateForm.sub_category}
                onChange={(e) => setTemplateForm({ ...templateForm, sub_category: e.target.value })}
                className="text-xs"
                placeholder="Mis. Aksi, Komedi, POV Imersif, Bongkar Mitos..."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Deskripsi Ringkas
              </label>
              <Input
                type="text"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                className="text-xs"
                placeholder="Contoh: Format naskah ringkas edukatif..."
              />
            </div>
          </div>

          {/* 1. System Prompt Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>1. System Prompt (Aturan Persona, Gaya Bahasa & Struktur AI)</span>
              </label>
              <span className="text-[10px] text-muted-foreground font-mono">Instruksi Primer LLM</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              System prompt mendikte peran AI, pembatasan bahasa, hook awal (maksimal 10 kata),
              struktur poin cerita/klimaks, larangan tanda kurung arahan panggung, dan pertanyaan
              penutup (CTA).
            </p>
            <Textarea
              rows={9}
              value={templateForm.system_prompt}
              onChange={(e) => setTemplateForm({ ...templateForm, system_prompt: e.target.value })}
              className="text-xs font-mono leading-relaxed"
              placeholder="Instruksi system prompt untuk AI..."
              required
            />
          </div>

          {/* 2. User Prompt Template Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-foreground">
                2. User Prompt Template (Format Input & Variabel)
              </label>
              <span className="text-[10px] text-muted-foreground font-mono">Template Format Dinamis</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Klik tag variabel di bawah untuk menyisipkan placeholder otomatis ke dalam prompt:
            </p>
            <div className="flex flex-wrap gap-1.5 py-1">
              {["{topic}", "{tone}", "{target_duration}", "{word_count}", "{scene_context}"].map(
                (token) => (
                  <WorkspaceChip
                    type="button"
                    key={token}
                    onClick={() => {
                      setTemplateForm((prev) => ({
                        ...prev,
                        user_prompt_template: prev.user_prompt_template + " " + token,
                      }));
                    }}
                    className="font-mono"
                    title="Klik untuk menambahkan variabel"
                  >
                    + {token}
                  </WorkspaceChip>
                )
              )}
            </div>
            <Textarea
              rows={6}
              value={templateForm.user_prompt_template}
              onChange={(e) =>
                setTemplateForm({ ...templateForm, user_prompt_template: e.target.value })
              }
              className="text-xs font-mono leading-relaxed"
              placeholder="Template prompt user..."
              required
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
            <Button
              type="submit"
              disabled={updateTemplateMutation.isPending}
              variant="workspace-primary"
              className="gap-2"
            >
              {updateTemplateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>
                {updateTemplateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan Preset"}
              </span>
            </Button>
          </div>
        </form>
      )}

      {/* MODAL: TAMBAH PRESET NASKAH BARU */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Buat Preset Naskah Baru</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Tambahkan struktur dan formula prompt khusus untuk video Anda
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                variant="workspace-quiet"
                size="workspace-icon"
                aria-label="Tutup dialog preset naskah"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form
              onSubmit={handleCreateTemplateSubmit}
              className="p-6 overflow-y-auto space-y-4 flex-1"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Nama Preset <span className="text-rose-600">*</span>
                  </label>
                  <Input
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
                    className="text-xs font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    ID Identifier (Slug Unik) <span className="text-rose-600">*</span>
                  </label>
                  <Input
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
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Tone Bawaan
                  </label>
                  <NativeSelect
                    value={newTemplateForm.default_tone}
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, default_tone: e.target.value })
                    }
                  >
                    <option value="santai">Santai (Casual & Friendly)</option>
                    <option value="tegang">Tegang (Tense & Gripping)</option>
                    <option value="formal">Formal (Professional & Clear)</option>
                    <option value="dramatis">Dramatis (Tense & Emotional)</option>
                    <option value="kocak">Kocak (Funny & Lempeng)</option>
                    <option value="berwibawa">Berwibawa (Authoritative)</option>
                    <option value="mencekam">Mencekam (Creepy & Dark)</option>
                    <option value="hangat">Hangat (Warm & Touching)</option>
                  </NativeSelect>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Deskripsi Ringkas
                  </label>
                  <Input
                    type="text"
                    placeholder="Contoh: Format naskah khusus affiliate dan unboxing"
                    value={newTemplateForm.description}
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, description: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Preset / Kategori
                  </label>
                  <NativeSelect
                    value={newTemplateForm.category}
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, category: e.target.value })
                    }
                  >
                    <option value="custom">Kustom</option>
                    <option value="recap">Alur Cerita & Story</option>
                    <option value="fakta">Fakta & Trivia</option>
                    <option value="edukasi">Edukasi & Tips</option>
                    <option value="showcase">Showcase & Review</option>
                    <option value="opini">Opini & POV</option>
                  </NativeSelect>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Sub-kategori (Opsional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Mis. Aksi, POV Imersif, Bongkar Mitos..."
                    value={newTemplateForm.sub_category}
                    onChange={(e) =>
                      setNewTemplateForm({ ...newTemplateForm, sub_category: e.target.value })
                    }
                    className="text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  1. System Prompt (Instruksi Persona & Struktur Naskah){" "}
                  <span className="text-rose-600">*</span>
                </label>
                <Textarea
                  rows={5}
                  required
                  value={newTemplateForm.system_prompt}
                  onChange={(e) =>
                    setNewTemplateForm({ ...newTemplateForm, system_prompt: e.target.value })
                  }
                  placeholder="Instruksi sistem persona dan format naskah..."
                  className="text-xs font-mono leading-relaxed"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    2. User Prompt Template (Format Input) <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {[
                      "{topic}",
                      "{tone}",
                      "{target_duration}",
                      "{word_count}",
                      "{scene_context}",
                    ].map((token) => (
                      <WorkspaceChip
                        type="button"
                        key={token}
                        onClick={() => {
                          setNewTemplateForm((prev) => ({
                            ...prev,
                            user_prompt_template: prev.user_prompt_template + " " + token,
                          }));
                        }}
                        size="sm"
                        className="min-h-7 px-2 font-mono text-[10px]"
                      >
                        + {token}
                      </WorkspaceChip>
                    ))}
                  </div>
                </div>
                <Textarea
                  rows={4}
                  required
                  value={newTemplateForm.user_prompt_template}
                  onChange={(e) =>
                    setNewTemplateForm({ ...newTemplateForm, user_prompt_template: e.target.value })
                  }
                  placeholder="Template format variabel..."
                  className="text-xs font-mono leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-surface-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  variant="workspace-secondary"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={createTemplateMutation.isPending}
                  variant="workspace-primary"
                  className="gap-1.5"
                >
                  {createTemplateMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {createTemplateMutation.isPending ? "Menyimpan..." : "Buat Preset Naskah"}
                  </span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

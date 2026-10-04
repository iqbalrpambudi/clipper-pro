"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  BookOpen,
  Edit3,
  CheckCircle2,
  Sliders,
  FileText,
  Layers,
  ArrowRight,
  Flame,
  Lightbulb,
  Film,
  Smile,
  ShieldAlert,
  Heart,
  Code,
  ExternalLink,
  Copy,
  Check,
  MessageSquareQuote,
  Clapperboard,
  Zap,
  Search,
  Ghost,
  Mountain,
  Repeat,
  Swords,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, Narration, NarrationTemplate, Scene } from "@/types";

interface NarrationTabProps {
  project: Project & {
    narration?: Narration | null;
    scenes: Scene[];
  };
}

export function NarrationTab({ project }: NarrationTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  const [selectedCategory, setSelectedCategory] = useState<"all" | "film" | "viral" | "fakta" | "edukasi" | "custom">("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState("alur_film");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("dramatis");
  const [targetDuration, setTargetDuration] = useState(60);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showPromptDetails, setShowPromptDetails] = useState(false);
  const [rawText, setRawText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);

  // Live Progress State for Narration Generation & Auto-Refresh
  const [isGeneratingNarration, setIsGeneratingNarration] = useState(false);
  const [narrationElapsed, setNarrationElapsed] = useState(0);

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  useEffect(() => {
    if (project.narration) {
      setRawText(project.narration.raw_text);
      if (project.narration.template_id) setSelectedTemplateId(project.narration.template_id);
      if (project.narration.topic) setTopic(project.narration.topic);
      if (project.narration.tone) setTone(project.narration.tone);
      if (project.narration.target_duration) setTargetDuration(project.narration.target_duration);
    }
  }, [project.narration]);

  // Helper categorization
  const getTemplateCategory = (tpl: NarrationTemplate): "all" | "film" | "viral" | "fakta" | "edukasi" | "custom" => {
    if (!tpl.is_builtin || tpl.category === "custom") return "custom";
    if (tpl.category === "film" || tpl.category === "viral" || tpl.category === "fakta" || tpl.category === "edukasi") {
      return tpl.category;
    }
    return "custom";
  };

  const getTemplateBadge = (tpl: NarrationTemplate) => {
    if (tpl.sub_category) {
      return { label: tpl.sub_category, color: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
    }
    return { label: "Kustom", color: "text-slate-300 bg-slate-500/10 border-slate-500/20" };
  };

  const getTemplateIcon = (tpl: NarrationTemplate) => {
    const sub = tpl.sub_category || "";
    const cat = getTemplateCategory(tpl);
    if (cat === "film") {
      switch (sub) {
        case "Aksi":
          return <Film className="w-4 h-4 text-purple-400 shrink-0" />;
        case "Komedi":
          return <Smile className="w-4 h-4 text-amber-400 shrink-0" />;
        case "Heist & Trik":
          return <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0" />;
        case "Drama":
          return <Heart className="w-4 h-4 text-pink-400 shrink-0" />;
        case "Misteri":
          return <Search className="w-4 h-4 text-indigo-400 shrink-0" />;
        case "Horor":
          return <Ghost className="w-4 h-4 text-red-400 shrink-0" />;
        case "Perjalanan":
          return <Mountain className="w-4 h-4 text-emerald-400 shrink-0" />;
        case "Plot Twist":
          return <Repeat className="w-4 h-4 text-violet-400 shrink-0" />;
        case "Epik & Perang":
          return <Swords className="w-4 h-4 text-orange-400 shrink-0" />;
      }
      return <Clapperboard className="w-4 h-4 text-purple-400 shrink-0" />;
    }
    if (cat === "viral") {
      if (sub === "POV Imersif") return <Search className="w-4 h-4 text-fuchsia-400 shrink-0" />;
      if (sub === "Proses & Transformasi") return <Code className="w-4 h-4 text-teal-400 shrink-0" />;
      return <Flame className="w-4 h-4 text-rose-400 shrink-0" />;
    }
    if (cat === "fakta") {
      if (sub === "Bongkar Mitos") return <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />;
      if (sub === "Ranking & Top List") return <Repeat className="w-4 h-4 text-orange-400 shrink-0" />;
      return <Lightbulb className="w-4 h-4 text-accent-yellow shrink-0" />;
    }
    if (cat === "edukasi") {
      if (sub === "Explainer & Analogi") return <MessageSquareQuote className="w-4 h-4 text-cyan-400 shrink-0" />;
      if (sub === "Otopsi Kesalahan") return <Search className="w-4 h-4 text-red-400 shrink-0" />;
      return <BookOpen className="w-4 h-4 text-accent-blue shrink-0" />;
    }
    return <BookOpen className="w-4 h-4 text-brand-400 shrink-0" />;
  };

  const categoryCounts = useMemo(() => {
    const counts = { all: templates.length, film: 0, viral: 0, fakta: 0, edukasi: 0, custom: 0 };
    templates.forEach((t) => {
      const cat = getTemplateCategory(t);
      counts[cat]++;
    });
    return counts;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === "all") return templates;
    return templates.filter((t) => getTemplateCategory(t) === selectedCategory);
  }, [templates, selectedCategory]);

  // Narration generation is one blocking request, so only elapsed time is real.
  useEffect(() => {
    if (!isGeneratingNarration) return;
    const timer = setInterval(() => setNarrationElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [isGeneratingNarration]);

  const generateMutation = useMutation({
    mutationFn: () => {
      setIsGeneratingNarration(true);
      setNarrationElapsed(0);
      return api.generateNarration(project.id, {
        template_id: selectedTemplateId,
        topic,
        tone,
        target_duration: targetDuration,
        custom_prompt: customPrompt.trim() || undefined,
      });
    },
    onSuccess: async (data) => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      setRawText(data.raw_text);
      setIsEditing(false);
      showToast("Naskah narasi berhasil dibuat dengan AI!", "success");
      setIsGeneratingNarration(false);
    },
    onError: (err: any) => {
      setIsGeneratingNarration(false);
      showToast(err.message || "Gagal generate naskah", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateNarration(project.id, {
        raw_text: rawText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setIsEditing(false);
      showToast("Naskah berhasil disimpan & disegmentasi ulang", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan naskah", "error");
    },
  });

  const handleCopyText = () => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setHasCopied(true);
    showToast("Teks naskah disalin ke clipboard", "info");
    setTimeout(() => setHasCopied(false), 2000);
  };

  const hasDialogTranscript = project.scenes.some((s) => s.transcript && s.transcript.trim());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* ========================================================================= */}
      {/* KOLOM KIRI (5/12): PRESET BERKATEGORI, INPUT & GENERATOR AI               */}
      {/* ========================================================================= */}
      <div className="lg:col-span-5 space-y-4">
        {/* Preset Selection Panel */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-3.5">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Pilih Preset Narasi
              </h3>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface border border-surface-border text-slate-400 font-medium">
              {templates.length} Preset
            </span>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-surface rounded-xl border border-surface-border/80 text-xs overflow-x-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === "all"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-surface-border/50"
              }`}
            >
              <span>Semua</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "all" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                {categoryCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory("film")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === "film"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-surface-border/50"
              }`}
            >
              <Clapperboard className="w-3.5 h-3.5" />
              <span>Alur Cerita Film</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "film" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                {categoryCounts.film}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory("viral")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === "viral"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-surface-border/50"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Konten Viral</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "viral" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                {categoryCounts.viral}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory("fakta")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === "fakta"
                  ? "bg-yellow-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-surface-border/50"
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Fakta & Trivia</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "fakta" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                {categoryCounts.fakta}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedCategory("edukasi")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                selectedCategory === "edukasi"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-surface-border/50"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Edukasi & Tips</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "edukasi" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                {categoryCounts.edukasi}
              </span>
            </button>

            {categoryCounts.custom > 0 && (
              <button
                type="button"
                onClick={() => setSelectedCategory("custom")}
                className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === "custom"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-surface-border/50"
                }`}
              >
                <span>Kustom</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedCategory === "custom" ? "bg-white/20 text-white" : "bg-surface-card text-slate-400"}`}>
                  {categoryCounts.custom}
                </span>
              </button>
            )}
          </div>

          {/* Preset Cards List with internal scrolling */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredTemplates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              const badge = getTemplateBadge(tpl);
              return (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplateId(tpl.id);
                    if (!project.narration?.tone) setTone(tpl.default_tone);
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 text-left group ${
                    isSelected
                      ? "border-brand-500 bg-brand-500/15 shadow-md shadow-brand-500/10 ring-1 ring-brand-500/40"
                      : "border-surface-border bg-surface/40 hover:bg-surface hover:border-slate-500"
                  }`}
                >
                  <div className="mt-0.5 p-2 rounded-xl bg-surface/80 border border-surface-border shrink-0 group-hover:scale-105 transition">
                    {getTemplateIcon(tpl)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                      <h4 className="text-xs font-bold text-white truncate min-w-0 flex-1" title={tpl.name}>
                        {tpl.name}
                      </h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${badge.color}`}>
                          {badge.label}
                        </span>
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-brand-400" />
                        ) : (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {tpl.default_tone}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                      {tpl.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Input Controls & Customization Panel */}
        <div className="glass-panel rounded-2xl p-5 border border-surface-border space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent-yellow" />
              <h4 className="text-sm font-bold text-white">Parameter Naskah</h4>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface border border-surface-border text-[10px] text-slate-300">
              <Layers className="w-3 h-3 text-accent-yellow" />
              <span>{project.scenes.length} scene visual</span>
              {hasDialogTranscript && (
                <span className="text-indigo-300 font-semibold">• 🎙️ Dialog</span>
              )}
            </div>
          </div>

          {/* Topic / Prompt Context */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Fokus Topik / Judul Film (Opsional)
            </label>
            <input
              type="text"
              placeholder="Mis. Judul film, premis cerita, atau fakta utama yang ditekankan..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500 transition placeholder:text-slate-500"
            />
          </div>

          {/* Tone & Target Duration Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tone Pembawaan
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-2.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs focus:outline-none focus:border-brand-500"
              >
                <option value="santai">Santai & Akrab</option>
                <option value="tegang">Tegang & Mepet</option>
                <option value="dramatis">Dramatis & Tegang</option>
                <option value="formal">Edukatif / Formal</option>
                <option value="kocak">Kocak / Lempeng</option>
                <option value="berwibawa">Berwibawa</option>
                <option value="mencekam">Mencekam</option>
                <option value="hangat">Hangat & Menyentuh</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">Durasi Narasi</label>
                <span className="text-[11px] font-mono text-brand-400 font-bold">
                  {targetDuration >= 60
                    ? `${Math.floor(targetDuration / 60)}m${targetDuration % 60 ? ` ${targetDuration % 60}s` : ""}`
                    : `${targetDuration}s`}
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={300}
                step={5}
                value={targetDuration}
                onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                className="w-full h-2 bg-surface rounded-lg cursor-pointer mt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>20s</span>
                <span>± {Math.round(targetDuration * 2.3)} kata</span>
                <span>5m</span>
              </div>
            </div>
          </div>

          {/* Live Progress Card during generation */}
          {isGeneratingNarration && (
            <div className="p-3.5 rounded-xl bg-surface border border-brand-500/40 space-y-2 animate-fadeIn shadow-lg shadow-brand-500/5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-brand-300 font-semibold truncate max-w-[240px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400 shrink-0" />
                  <span className="truncate">Menyusun naskah AI...</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400 shrink-0">
                  <span>
                    {Math.floor(narrationElapsed / 60)}:
                    {String(narrationElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
              </div>
              <div className="w-full bg-surface-card rounded-full h-1.5 overflow-hidden border border-surface-border">
                <div className="w-1/3 bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full rounded-full animate-progress-indeterminate" />
              </div>
            </div>
          )}

          {/* AI Prompt Customization Accordion */}
          <div className="pt-2 border-t border-surface-border/60">
            <button
              type="button"
              onClick={() => setShowPromptDetails(!showPromptDetails)}
              className="flex items-center justify-between w-full text-left py-1 text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent-yellow" />
                <span>Kustomisasi / Lihat System Prompt AI</span>
              </div>
              <span className="text-[10px] text-brand-400 font-normal">
                {showPromptDetails ? "Tutup ▲" : "Buka ▼"}
              </span>
            </button>

            {showPromptDetails && (
              <div className="mt-2.5 p-3 rounded-xl bg-black/40 border border-surface-border space-y-2.5 animate-fadeIn">
                <div>
                  <label className="block text-[11px] font-bold text-slate-200 mb-1">
                    Instruksi Tambahan (Custom Prompt)
                  </label>
                  <textarea
                    rows={2}
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Misal: Gunakan bahasa santai anak muda, tekankan bagian ending yang mengejutkan..."
                    className="w-full px-3 py-2 bg-surface rounded-xl border border-surface-border text-white text-xs leading-relaxed focus:outline-none focus:border-brand-500 transition"
                  />
                </div>

                {selectedTemplate && (
                  <div className="pt-1.5 border-t border-surface-border/40">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
                        <Code className="w-3 h-3 text-brand-400" />
                        <span>Prompt Aktif ({selectedTemplate.name})</span>
                      </span>
                      <Link
                        href="/settings"
                        className="text-[10px] text-brand-400 hover:text-brand-300 underline flex items-center gap-0.5 transition"
                        target="_blank"
                      >
                        <span>Edit Template</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </div>
                    <div className="p-2.5 bg-surface/80 rounded-lg border border-surface-border text-[10px] font-mono text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed selection:bg-brand-500/30">
                      {selectedTemplate.system_prompt}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main Action Button */}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isGeneratingNarration}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-brand-500/20 flex items-center justify-center gap-2 transition transform active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isGeneratingNarration ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyusun Naskah AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-accent-yellow" />
                <span>Generate Naskah ({selectedTemplate?.name || "AI"})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KOLOM KANAN (7/12): EDITOR NASKAH HASIL GENERATE & SEGMENTASI SCENE      */}
      {/* ========================================================================= */}
      <div className="lg:col-span-7 space-y-4">
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          {/* Header Panel Kanan */}
          <div className="flex items-center justify-between pb-3 border-b border-surface-border">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white tracking-tight">
                Naskah & Segmentasi Storytelling
              </h3>
            </div>

            {rawText && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyText}
                  className="px-2.5 py-1.5 rounded-lg border border-surface-border bg-surface hover:bg-surface-border text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition"
                  title="Salin teks naskah"
                >
                  {hasCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{hasCopied ? "Tersalin" : "Salin"}</span>
                </button>

                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface hover:bg-surface-border text-xs text-slate-300 hover:text-white font-medium flex items-center gap-1.5 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? "Batal" : "Edit Naskah"}</span>
                </button>

                {isEditing && (
                  <button
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition flex items-center gap-1"
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Simpan</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Area Konten Naskah */}
          {rawText ? (
            <div className="space-y-4">
              {isEditing ? (
                <div>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="w-full p-4 bg-surface rounded-xl border border-brand-500/50 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 leading-relaxed font-sans"
                    placeholder="Tulis atau edit naskah narasi di sini..."
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    * Klik Simpan untuk memperbarui pembagian segmen kalimat secara otomatis.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-surface/60 border border-surface-border text-sm text-slate-200 leading-relaxed font-sans selection:bg-brand-500/30 whitespace-pre-line shadow-inner">
                  {rawText}
                </div>
              )}

              {/* Segment Breakdown */}
              {project.narration?.segments && project.narration.segments.length > 0 && (
                <div className="pt-3 border-t border-surface-border/80">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquareQuote className="w-3.5 h-3.5 text-brand-400" />
                      <span>
                        Segmentasi Kalimat ({project.narration.segments.length} Segmen Scene)
                      </span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Sinkron otomatis dengan audio & klip visual
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                    {project.narration.segments.map((seg, idx) => (
                      <div
                        key={seg.id || idx}
                        className="p-3 rounded-xl bg-surface border border-surface-border/70 hover:border-brand-500/30 transition flex items-start justify-between gap-3 text-xs"
                      >
                        <span className="w-6 h-6 rounded-lg bg-brand-500/15 border border-brand-500/30 text-brand-300 font-mono font-bold flex items-center justify-center shrink-0 text-[11px]">
                          {idx + 1}
                        </span>
                        <p className="flex-1 text-slate-300 leading-relaxed">{seg.text}</p>
                        {seg.end_ms > 0 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-card border border-surface-border text-slate-400 shrink-0">
                            {Math.round(seg.start_ms / 1000)}s - {Math.round(seg.end_ms / 1000)}s
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Next Step Bar */}
              <div className="pt-4 border-t border-surface-border flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Naskah siap! Lanjutkan ke pemilihan suara & pembacaan TTS.
                </span>
                <button
                  onClick={() => setActiveTab("tts")}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition transform active:scale-95 cursor-pointer"
                >
                  <span>Lanjut ke Suara & TTS</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Empty State saat belum ada naskah */
            <div className="py-16 px-6 text-center rounded-xl bg-surface/30 border border-dashed border-surface-border flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="max-w-sm space-y-1">
                <h4 className="text-sm font-bold text-white">Naskah Cerita Belum Dibuat</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Pilih salah satu preset di panel kiri (mis. kategori <strong>Alur Cerita Film</strong> atau <strong>Viral & Trivia</strong>), sesuaikan durasi, lalu klik tombol <strong>Generate Naskah</strong>.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

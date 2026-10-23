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
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { StudioTabHeader } from "@/components/layout";
import { Project, ProjectDetail, Narration, NarrationTemplate, Scene } from "@/types";
import { Button, Input, Textarea, Badge } from "@/components/ui";
import { SectionPanel, EmptyState } from "@/components/fragments";
import { cn } from "@/lib/utils";

interface NarrationTabProps {
  project: Project & {
    narration?: Narration | null;
    scenes: Scene[];
  };
}

export function NarrationTab({ project }: NarrationTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "recap" | "fakta" | "edukasi" | "showcase" | "opini" | "custom"
  >("all");
  const [selectedTemplateId, setSelectedTemplateId] = useState("recap_cinematic");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("dramatis");
  const [targetDuration, setTargetDuration] = useState(60);
  const [language, setLanguage] = useState<string>(
    project.narration?.language || project.language || "id"
  );
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
      if (project.narration.language) setLanguage(project.narration.language);
      if (project.narration.template_id) setSelectedTemplateId(project.narration.template_id);
      if (project.narration.topic) setTopic(project.narration.topic);
      if (project.narration.tone) setTone(project.narration.tone);
      if (project.narration.target_duration) setTargetDuration(project.narration.target_duration);
    }
  }, [project.narration]);

  // Helper categorization across the 5 pillars
  const getTemplateCategory = (
    tpl: NarrationTemplate
  ): "all" | "recap" | "fakta" | "edukasi" | "showcase" | "opini" | "custom" => {
    if (!tpl.is_builtin || tpl.category === "custom") return "custom";
    if (
      tpl.category === "recap" ||
      tpl.category === "fakta" ||
      tpl.category === "edukasi" ||
      tpl.category === "showcase" ||
      tpl.category === "opini"
    ) {
      return tpl.category;
    }
    // Backward compatibility mapping if old cache exists
    if (tpl.category === "film" || tpl.category === "viral") return "recap";
    return "custom";
  };

  const getTemplateBadge = (tpl: NarrationTemplate) => {
    if (tpl.sub_category) {
      return tpl.sub_category;
    }
    return tpl.is_builtin ? "Standar" : "Kustom";
  };

  const getTemplateIcon = (tpl: NarrationTemplate) => {
    const cat = getTemplateCategory(tpl);
    if (cat === "recap") {
      if (tpl.id === "story_parodi") {
        return <Smile className="w-4 h-4 text-[#8A6A2F] shrink-0" />;
      }
      return <Film className="w-4 h-4 text-[#C45B3A] shrink-0" />;
    }
    if (cat === "fakta") {
      if (tpl.id === "fakta_ranking") {
        return <Flame className="w-4 h-4 text-[#8A6A2F] shrink-0" />;
      }
      return <Lightbulb className="w-4 h-4 text-[#8A6A2F] shrink-0" />;
    }
    if (cat === "edukasi") {
      if (tpl.id === "edukasi_explainer") {
        return <MessageSquareQuote className="w-4 h-4 text-[#41627F] shrink-0" />;
      }
      return <BookOpen className="w-4 h-4 text-[#41627F] shrink-0" />;
    }
    if (cat === "showcase") {
      if (tpl.id === "showcase_review") {
        return <Search className="w-4 h-4 text-[#A9472C] shrink-0" />;
      }
      return <Sparkles className="w-4 h-4 text-[#A9472C] shrink-0" />;
    }
    if (cat === "opini") {
      if (tpl.id === "opini_komentar") {
        return <ShieldAlert className="w-4 h-4 text-[#A9472C] shrink-0" />;
      }
      return <Heart className="w-4 h-4 text-[#A9472C] shrink-0" />;
    }
    return <Code className="h-4 w-4 shrink-0 text-primary" />;
  };

  const categoryCounts = useMemo(() => {
    const counts = {
      all: templates.length,
      recap: 0,
      fakta: 0,
      edukasi: 0,
      showcase: 0,
      opini: 0,
      custom: 0,
    };
    templates.forEach((t) => {
      const cat = getTemplateCategory(t);
      if (cat in counts) {
        counts[cat as keyof typeof counts]++;
      }
    });
    return counts;
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === "all") return templates;
    return templates.filter((t) => getTemplateCategory(t) === selectedCategory);
  }, [templates, selectedCategory]);

  // Narration generation timer
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
        language,
      });
    },
    onSuccess: async (data) => {
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      setRawText(data.raw_text);
      setIsEditing(false);
      showToast("Naskah narasi berhasil dibuat dengan AI!", "success");
      setIsGeneratingNarration(false);
    },
    onError: (err: Error) => {
      setIsGeneratingNarration(false);
      showToast(err.message || "Gagal generate naskah", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      api.updateNarration(project.id, {
        raw_text: rawText,
        language,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setIsEditing(false);
      showToast("Naskah berhasil disimpan & disegmentasi ulang", "success");
    },
    onError: (err: Error) => {
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

  const handleLanguageSelect = (newLang: string) => {
    setLanguage(newLang);
    api.updateProject(project.id, { language: newLang }).then(() => {
      queryClient.setQueryData<ProjectDetail>(["project", project.id], (old) => {
        if (!old) return old;
        return { ...old, language: newLang };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    });
  };

  return (
    <div>
      <StudioTabHeader
        icon={FileText}
        title="Narasi video"
        description="Bentuk naskah, sesuaikan karakter penceritaan, lalu simpan sebelum membuat audio."
      />
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* ========================================================================= */}
          {/* KOLOM KIRI (5/12): PRESET TEMPLATE & PARAMETER GENERATOR                  */}
          {/* ========================================================================= */}
          <div className="lg:col-span-5 space-y-4">
            {/* Preset Selection Panel */}
            <SectionPanel
              title="Pilih Preset Narasi"
              icon={<BookOpen className="w-4 h-4 text-primary" />}
              description="Pilih gaya penceritaan yang sesuai, lalu isi detail cerita."
              badge={
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {templates.length} Preset
                </Badge>
              }
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-muted"
            >
              <div className="space-y-3">
                {/* Category Filter Pills */}
                <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-background p-1 text-xs no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("all")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "all"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span>Semua</span>
                    <span className="text-[10px] opacity-75 font-mono">{categoryCounts.all}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory("recap")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "recap"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Clapperboard className="w-3 h-3 text-[#C45B3A]" />
                    <span>Alur Cerita</span>
                    <span className="text-[10px] opacity-75 font-mono">{categoryCounts.recap}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory("fakta")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "fakta"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Lightbulb className="w-3 h-3 text-[#8A6A2F]" />
                    <span>Fakta</span>
                    <span className="text-[10px] opacity-75 font-mono">{categoryCounts.fakta}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory("edukasi")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "edukasi"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <BookOpen className="w-3 h-3 text-[#41627F]" />
                    <span>Edukasi</span>
                    <span className="text-[10px] opacity-75 font-mono">
                      {categoryCounts.edukasi}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory("showcase")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "showcase"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Sparkles className="w-3 h-3 text-[#A9472C]" />
                    <span>Showcase</span>
                    <span className="text-[10px] opacity-75 font-mono">
                      {categoryCounts.showcase}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedCategory("opini")}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                      selectedCategory === "opini"
                        ? "border-b-2 border-primary bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <MessageSquareQuote className="w-3 h-3 text-[#A9472C]" />
                    <span>Opini & POV</span>
                    <span className="text-[10px] opacity-75 font-mono">{categoryCounts.opini}</span>
                  </button>

                  {categoryCounts.custom > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory("custom")}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-xs font-medium transition whitespace-nowrap flex items-center gap-1.5",
                        selectedCategory === "custom"
                          ? "border-b-2 border-primary bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Code className="h-3 w-3 text-primary" />
                      <span>Kustom</span>
                      <span className="text-[10px] opacity-75 font-mono">
                        {categoryCounts.custom}
                      </span>
                    </button>
                  )}
                </div>

                {/* Template Card Items */}
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {filteredTemplates.map((tpl) => {
                    const isSelected = selectedTemplateId === tpl.id;
                    const badgeLabel = getTemplateBadge(tpl);
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => {
                          setSelectedTemplateId(tpl.id);
                          if (!project.narration?.tone) setTone(tpl.default_tone);
                        }}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 text-left",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-primary/40 hover:bg-muted"
                        )}
                      >
                        <div className="mt-0.5 shrink-0 rounded-md border border-border bg-muted p-1.5">
                          {getTemplateIcon(tpl)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                            <h4
                              className="text-xs font-bold text-foreground truncate min-w-0 flex-1"
                              title={tpl.name}
                            >
                              {tpl.name}
                            </h4>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge
                                variant={isSelected ? "workspace-accent" : "secondary"}
                                className="text-[9px] py-0"
                              >
                                {badgeLabel}
                              </Badge>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                            {tpl.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SectionPanel>

            {/* Input Parameters Panel */}
            <SectionPanel
              title="Parameter Naskah"
              description="Atur topik, nada, durasi, dan bahasa naskah."
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-muted"
              icon={<Sliders className="w-4 h-4 text-[#8A6A2F]" />}
              badge={
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Layers className="w-3 h-3 text-[#8A6A2F]" />
                  <span>{project.scenes.length} scene</span>
                  {hasDialogTranscript && (
                    <span className="text-[#41627F] font-semibold">• 🎙️ Dialog</span>
                  )}
                </div>
              }
            >
              <div className="space-y-3.5">
                {/* Topic Input */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Fokus Topik / Judul Film (Opsional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Mis. Premis cerita, fakta unik, atau tema utama..."
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>

                {/* Language Selector (Central Project Language Control) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-foreground">
                      Bahasa Utama Video (Kunci Seluruh Pipeline)
                    </label>
                    <span className="text-[10px] text-muted-foreground/80 font-mono">
                      Mengunci Naskah, Voice TTS & Subtitle
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => handleLanguageSelect("id")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition",
                        language === "id"
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="text-base">🇮🇩</span>
                      <span>Bahasa Indonesia</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageSelect("en")}
                      className={cn(
                        "flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-medium transition",
                        language === "en"
                          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span className="text-base">🇬🇧</span>
                      <span>English Narration</span>
                    </button>
                  </div>
                </div>

                {/* Tone & Target Duration Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Tone Pembawaan
                    </label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-control-background px-2.5 py-1 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-foreground">Target Durasi</label>
                      <span className="text-[11px] font-mono font-bold text-primary">
                        {targetDuration >= 60
                          ? `${Math.floor(targetDuration / 60)}m${
                              targetDuration % 60 ? ` ${targetDuration % 60}s` : ""
                            }`
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
                      className="w-full mt-2"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>20s</span>
                      <span>± {Math.round(targetDuration * 2.3)} kata</span>
                      <span>5m</span>
                    </div>
                  </div>
                </div>

                {/* Live Progress Card */}
                {isGeneratingNarration && (
                  <div className="space-y-2 rounded-lg border border-primary/30 bg-accent p-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-medium text-primary">
                        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        <span>Menyusun naskah narasi AI...</span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        <span>
                          {Math.floor(narrationElapsed / 60)}:
                          {String(narrationElapsed % 60).padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-primary" />
                    </div>
                  </div>
                )}

                {/* Custom Prompt Accordion */}
                <div className="border-t border-border pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPromptDetails(!showPromptDetails)}
                    className="flex items-center justify-between w-full text-left py-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span>Kustomisasi Prompt AI</span>
                    </div>
                    <span className="text-[10px] text-primary">
                      {showPromptDetails ? "Tutup ▲" : "Buka ▼"}
                    </span>
                  </button>

                  {showPromptDetails && (
                    <div className="mt-2 space-y-2 rounded-lg border border-border bg-background p-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-foreground mb-1">
                          Instruksi Tambahan (Custom Prompt)
                        </label>
                        <Textarea
                          rows={2}
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          placeholder="Misal: Gunakan gaya bahasa kasual, tekankan bagian ending..."
                        />
                      </div>

                      {selectedTemplate && (
                        <div className="border-t border-border pt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Code className="h-3 w-3 text-primary" />
                              <span>Prompt Aktif ({selectedTemplate.name})</span>
                            </span>
                            <Link
                              href="/settings"
                              className="flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                              target="_blank"
                            >
                              <span>Edit Template</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </Link>
                          </div>
                          <div className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {selectedTemplate.system_prompt}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Generate Action Button */}
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending || isGeneratingNarration}
                  variant="workspace-primary"
                  size="lg"
                  className="w-full gap-2"
                >
                  {isGeneratingNarration ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyusun Naskah AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Generate Naskah ({selectedTemplate?.name || "AI"})</span>
                    </>
                  )}
                </Button>
              </div>
            </SectionPanel>
          </div>

          {/* ========================================================================= */}
          {/* KOLOM KANAN (7/12): EDITOR NASKAH & SEGMENTASI STORYTELLING               */}
          {/* ========================================================================= */}
          <div className="lg:col-span-7 space-y-4">
            <SectionPanel
              title="Naskah & Segmentasi Storytelling"
              description="Tinjau hasil, edit naskah, lalu lanjutkan ke pembuatan suara."
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-muted"
              icon={<FileText className="w-4 h-4 text-primary" />}
              badge={
                rawText ? (
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-primary/10 font-mono text-[10px] text-primary"
                  >
                    {(project.narration?.language || language) === "en"
                      ? "🇬🇧 English"
                      : "🇮🇩 Indonesian"}
                  </Badge>
                ) : undefined
              }
              actions={
                rawText ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyText}
                      className="h-7 gap-1 border-border text-xs"
                      title="Salin teks naskah"
                    >
                      {hasCopied ? (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{hasCopied ? "Tersalin" : "Salin"}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                      className="h-7 gap-1 border-border text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{isEditing ? "Batal" : "Edit Naskah"}</span>
                    </Button>

                    {isEditing && (
                      <Button
                        variant="workspace-primary"
                        size="sm"
                        onClick={() => updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                        className="h-7 text-xs gap-1"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Simpan</span>
                      </Button>
                    )}
                  </div>
                ) : null
              }
            >
              {rawText ? (
                <div className="space-y-4">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Textarea
                        rows={8}
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        className="text-sm leading-relaxed"
                        placeholder="Tulis atau edit naskah narasi di sini..."
                      />
                      <p className="text-[11px] text-muted-foreground">
                        * Klik Simpan untuk memperbarui pembagian segmen kalimat otomatis.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-background p-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-line shadow-inner">
                      {rawText}
                    </div>
                  )}

                  {/* Segment Breakdown */}
                  {project.narration?.segments && project.narration.segments.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <div className="flex items-center justify-between mb-2.5">
                        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <MessageSquareQuote className="w-3.5 h-3.5 text-primary" />
                          <span>
                            Segmentasi Kalimat ({project.narration.segments.length} Segmen)
                          </span>
                        </h4>
                        <span className="text-[11px] text-muted-foreground">
                          Sinkron otomatis dengan audio & visual
                        </span>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {project.narration.segments.map((seg, idx) => (
                          <div
                            key={seg.id || idx}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-2.5 text-xs transition hover:border-primary/40"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10 font-mono text-[10px] font-bold text-primary">
                              {idx + 1}
                            </span>
                            <p className="flex-1 text-foreground/90 leading-relaxed">{seg.text}</p>
                            {seg.end_ms > 0 && (
                              <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {Math.round(seg.start_ms / 1000)}s - {Math.round(seg.end_ms / 1000)}
                                s
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Next Step Bar */}
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      Naskah siap! Lanjutkan ke sintesis suara TTS.
                    </span>
                    <Button
                      onClick={() => setActiveTab("tts")}
                      variant="workspace-primary"
                      size="sm"
                      className="gap-2"
                    >
                      <span>Lanjut ke Suara & TTS</span>
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Naskah Cerita Belum Dibuat"
                  description="Pilih salah satu preset di panel kiri, sesuaikan durasi, lalu klik tombol Generate Naskah."
                />
              )}
            </SectionPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

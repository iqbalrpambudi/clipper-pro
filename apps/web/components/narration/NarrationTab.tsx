"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  BookOpen,
  Edit3,
  CheckCircle2,
  Sliders,
  Volume2,
  FileText,
  Clock,
  Layers,
  ArrowRight,
  Flame,
  Lightbulb,
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

  const [selectedTemplateId, setSelectedTemplateId] = useState("fakta_unik");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("santai");
  const [targetDuration, setTargetDuration] = useState(60);
  const [rawText, setRawText] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Live Progress State for Narration Generation & Auto-Refresh
  const [isGeneratingNarration, setIsGeneratingNarration] = useState(false);
  const [narrationProgress, setNarrationProgress] = useState(0);
  const [narrationStepText, setNarrationStepText] = useState("");
  const [narrationElapsed, setNarrationElapsed] = useState(0);

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: api.getTemplates,
  });

  useEffect(() => {
    if (project.narration) {
      setRawText(project.narration.raw_text);
      if (project.narration.template_id) setSelectedTemplateId(project.narration.template_id);
      if (project.narration.topic) setTopic(project.narration.topic);
      if (project.narration.tone) setTone(project.narration.tone);
      if (project.narration.target_duration) setTargetDuration(project.narration.target_duration);
    }
  }, [project.narration]);

  // Progress Timer for Narration Generation
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isGeneratingNarration) {
      timer = setInterval(() => {
        setNarrationElapsed((prev) => {
          const next = prev + 1;
          if (next <= 2) {
            setNarrationProgress(20);
            setNarrationStepText("Menganalisis ringkasan scene video & durasi...");
          } else if (next <= 4) {
            setNarrationProgress(50);
            setNarrationStepText("Menyusun hook awal & alur narasi storytelling...");
          } else if (next <= 7) {
            setNarrationProgress(75);
            setNarrationStepText("Memformat segmentasi kalimat & kata kunci...");
          } else {
            setNarrationProgress((p) => Math.min(92, p + 1));
            setNarrationStepText("Menyelesaikan validasi naskah dengan AI...");
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGeneratingNarration]);

  const generateMutation = useMutation({
    mutationFn: () => {
      setIsGeneratingNarration(true);
      setNarrationProgress(12);
      setNarrationElapsed(0);
      setNarrationStepText("Menghubungi AI Model naskah...");
      return api.generateNarration(project.id, {
        template_id: selectedTemplateId,
        topic,
        tone,
        target_duration: targetDuration,
      });
    },
    onSuccess: async (data) => {
      setNarrationProgress(100);
      setNarrationStepText("Naskah narasi berhasil dibuat!");
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      setRawText(data.raw_text);
      setIsEditing(false);
      showToast("Naskah narasi berhasil dibuat dengan AI!", "success");
      setTimeout(() => {
        setIsGeneratingNarration(false);
        setNarrationProgress(0);
        setNarrationElapsed(0);
      }, 800);
    },
    onError: (err: any) => {
      setIsGeneratingNarration(false);
      setNarrationProgress(0);
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

  return (
    <div className="space-y-8">
      {/* Step 1: Template Selection */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-brand-400" />
          <h3 className="text-base font-bold text-white tracking-tight">
            1. Pilih Template Narasi Short Video
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {templates.map((tpl) => {
            const isSelected = selectedTemplateId === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => {
                  setSelectedTemplateId(tpl.id);
                  setTone(tpl.default_tone);
                }}
                className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/10"
                    : "border-surface-border hover:border-slate-500"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      {tpl.id === "fakta_unik" && <Lightbulb className="w-3.5 h-3.5 text-accent-yellow" />}
                      {tpl.id === "konten_viral" && <Flame className="w-3.5 h-3.5 text-rose-400" />}
                      {tpl.id === "edukasi_singkat" && <BookOpen className="w-3.5 h-3.5 text-accent-blue" />}
                      {tpl.name}
                    </span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    {tpl.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-surface-border/50 text-[10px] text-slate-500 flex justify-between">
                  <span>Tone: {tpl.default_tone}</span>
                  <span>Voice: {tpl.default_voice}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2: Generation Inputs */}
      <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-yellow" />
            <h4 className="text-sm font-bold text-white">2. Konfigurasi Input & Konteks</h4>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-surface-border text-[11px] text-slate-300">
            <Layers className="w-3 h-3 text-accent-yellow" />
            <span>Konteks: {project.scenes.length} scene visual Media Pool</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Topik / Konteks Spesifik (Opsional)
            </label>
            <input
              type="text"
              placeholder="Mis. Rahasia di balik pembuatan kopi espresso sempurna"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tone Pembawaan
            </label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2.5 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
            >
              <option value="santai">Santai & Akrab (Conversational)</option>
              <option value="dramatis">Dramatis & Penuh Ketegangan</option>
              <option value="formal">Edukatif & Profesional</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
            <span>Target Durasi Narasi: {targetDuration} Detik</span>
            <span className="text-slate-500 font-normal">± {Math.round(targetDuration * 2.3)} kata</span>
          </div>
          <input
            type="range"
            min={20}
            max={90}
            step={5}
            value={targetDuration}
            onChange={(e) => setTargetDuration(parseInt(e.target.value))}
            className="w-full h-1.5 bg-surface rounded-lg cursor-pointer"
          />
        </div>

        {/* Live Progress Card for Narration */}
        {isGeneratingNarration && (
          <div className="p-4 rounded-xl bg-surface border border-brand-500/40 space-y-2.5 animate-fadeIn shadow-lg shadow-brand-500/5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-brand-300 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400 shrink-0" />
                <span className="truncate max-w-sm sm:max-w-md">{narrationStepText || "Sedang menyusun naskah..."}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <span>{Math.floor(narrationElapsed / 60)}:{String(narrationElapsed % 60).padStart(2, "0")}</span>
                <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30">
                  {Math.round(narrationProgress)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
              <div
                className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: Math.max(5, narrationProgress) + "%" }}
              />
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-surface-border flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {isGeneratingNarration
              ? "AI sedang menyusun naskah storytelling dan segmentasi..."
              : "Naskah akan disesuaikan otomatis dengan durasi dan template terpilih."}
          </span>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isGeneratingNarration}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold text-sm shadow-xl shadow-brand-500/25 flex items-center gap-2 transition transform active:scale-95 disabled:opacity-50"
          >
            {isGeneratingNarration ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menghasilkan Naskah ({Math.round(narrationProgress)}%)...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Naskah Sekarang</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step 3: Script Review & Segment Editor */}
      {rawText && (
        <div className="glass-panel rounded-2xl p-6 border border-surface-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-white">3. Naskah Hasil Generate (Bahasa Indonesia)</h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-3 py-1.5 rounded-lg border border-surface-border bg-surface text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? "Batal Edit" : "Edit Teks Naskah"}</span>
              </button>

              {isEditing && (
                <button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition"
                >
                  {updateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              )}
            </div>
          </div>

          {isEditing ? (
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full p-4 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500 leading-relaxed font-sans"
            />
          ) : (
            <div className="p-4 rounded-xl bg-surface/50 border border-surface-border text-sm text-slate-200 leading-relaxed">
              {rawText}
            </div>
          )}

          {/* Segment breakdown */}
          {project.narration?.segments && project.narration.segments.length > 0 && (
            <div className="pt-4 border-t border-surface-border">
              <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Segmentasi Kalimat ({project.narration.segments.length} Segmen untuk Scene Matching)
              </h5>
              <div className="space-y-2">
                {project.narration.segments.map((seg, idx) => (
                  <div
                    key={seg.id || idx}
                    className="p-3 rounded-lg bg-surface border border-surface-border/80 flex items-start justify-between gap-3 text-xs"
                  >
                    <span className="font-mono text-brand-400 font-bold shrink-0">
                      #{idx + 1}
                    </span>
                    <p className="flex-1 text-slate-300">{seg.text}</p>
                    {seg.end_ms > 0 && (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {Math.round(seg.start_ms / 1000)}s - {Math.round(seg.end_ms / 1000)}s
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next Button */}
          <div className="pt-4 flex justify-end">
            <button
              onClick={() => setActiveTab("tts")}
              className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs flex items-center gap-1.5 transition"
            >
              <span>Lanjut ke Suara & TTS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

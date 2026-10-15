"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Clock,
  ArrowRight,
  BookOpen,
  Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem } from "@/types";
import { Button, Input, Textarea, Badge } from "@/components/ui";

interface StoryboardScriptTabProps {
  project: Project & {
    narration?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardScriptTab({ project }: StoryboardScriptTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const [topic, setTopic] = useState(project.narration?.topic || project.name || "");
  const [durationMins, setDurationMins] = useState<number>(
    project.narration?.target_duration ? Math.round(project.narration.target_duration / 60) : 5
  );
  const [tone, setTone] = useState(project.narration?.tone || "santai");
  const [imagesPerSegment, setImagesPerSegment] = useState<number>(2);
  const [customInstructions, setCustomInstructions] = useState("");

  const narration = project.narration;
  const segments: any[] = narration?.segments || [];
  const items: StoryboardItem[] = project.storyboard_items || [];

  const generateScriptMutation = useMutation({
    mutationFn: (data: {
      topic: string;
      target_duration_mins: number;
      tone: string;
      images_per_segment: number;
      custom_instructions?: string;
    }) => api.generateStoryboardScript(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Naskah storyboard & adegan gambar berhasil di-generate!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal generate naskah storyboard", "error");
    },
  });

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) {
      showToast("Harap masukkan topik ide konten video.", "error");
      return;
    }

    generateScriptMutation.mutate({
      topic: topic.trim(),
      target_duration_mins: durationMins,
      tone,
      images_per_segment: imagesPerSegment,
      custom_instructions: customInstructions.trim() || undefined,
    });
  };

  const wordCount = narration?.raw_text ? narration.raw_text.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 1 dari 5
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Dokumenter / Explainer 16:9
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Ide Konten & Naskah Narasi Panjang (4–8 Menit)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tentukan ide cerita. LLM akan merancang alur terstruktur (Hook, Inti Cerita, Penutup) dan prompt gambar sketsa untuk setiap adegan.
          </p>
        </div>

        {segments.length > 0 && (
          <Button
            onClick={() => setActiveTab("storyboard_voice")}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
          >
            <span>Lanjut ke Suara & Sync</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Main Grid: Form Left, Generated Script Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Form: Parameters (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Parameter Naskah AI</h3>
              <p className="text-[11px] text-muted-foreground">Sesuaikan target durasi dan gaya pembawaan</p>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Ide / Topik Konten
              </label>
              <Textarea
                rows={3}
                required
                placeholder="Mis. Misteri Segitiga Bermuda dan penjelasan ilmiah di balik hilangnya kapal dan pesawat terbang..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="bg-[#141414] border-[#2E2E2E] text-xs leading-relaxed"
              />
            </div>

            {/* Target Duration Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-violet-400" />
                  Target Durasi Narasi
                </label>
                <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                  {durationMins} Menit (~{durationMins * 135} kata)
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                step={1}
                value={durationMins}
                onChange={(e) => setDurationMins(Number(e.target.value))}
                className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>3 Menit (Singkat)</span>
                <span>5 Menit (Standar)</span>
                <span>8 Menit (Mendalam)</span>
              </div>
            </div>

            {/* Tone Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Gaya Bahasa & Tone
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "santai", label: "Santai & Mengalir" },
                  { id: "edukasi", label: "Edukasi & Cerita" },
                  { id: "misterius", label: "Misterius & Tegang" },
                  { id: "dramatis", label: "Dramatis & Sinematik" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTone(t.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition ${
                      tone === t.id
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                        : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Images Per Segment */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Jumlah Ilustrasi Gambar per Segmen
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { count: 1, label: "1 Gambar", sub: "Pacing Tenang" },
                  { count: 2, label: "2 Gambar", sub: "Pacing Ideal" },
                  { count: 3, label: "3 Gambar", sub: "Pacing Dinamis" },
                ].map((opt) => (
                  <button
                    key={opt.count}
                    type="button"
                    onClick={() => setImagesPerSegment(opt.count)}
                    className={`p-2.5 rounded-xl border text-center transition ${
                      imagesPerSegment === opt.count
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                        : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Instructions */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Instruksi Khusus (Opsional)
              </label>
              <Input
                type="text"
                placeholder="Mis. Sertakan fakta tentang kompas anomali dan teori gas metana..."
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                className="bg-[#141414] border-[#2E2E2E] text-xs"
              />
            </div>

            <Button
              type="submit"
              disabled={generateScriptMutation.isPending}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-lg shadow-violet-500/20 gap-2"
            >
              {generateScriptMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Merancang Naskah & Visual AI (5-15s)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{segments.length > 0 ? "Generate Ulang Naskah" : "Generate Naskah Storyboard"}</span>
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right Output: Script & Segment Preview (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {segments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#2E2E2E] bg-[#181818]/60 p-12 text-center">
              <BookOpen className="w-12 h-12 text-violet-400/50 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1.5">Belum Ada Naskah Storyboard</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4 leading-relaxed">
                Ketikkan topik ide cerita di panel sebelah kiri lalu klik tombol <strong>Generate Naskah Storyboard</strong>. Sistem akan menghasilkan naskah narasi lengkap beserta prompt gambar sketsa hand-drawn.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary Stats Pill */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-[#181818] border border-[#2E2E2E]">
                <div className="text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Durasi Narasi</span>
                  <div className="text-sm font-bold text-violet-400 mt-0.5">~{durationMins} Menit</div>
                </div>
                <div className="text-center border-x border-[#2E2E2E]">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Panjang Kata</span>
                  <div className="text-sm font-bold text-white mt-0.5">{wordCount} Kata</div>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">Ilustrasi Siap</span>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">{items.length} Slot Gambar</div>
                </div>
              </div>

              {/* Segments Accordion List */}
              <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-violet-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Daftar Babak & Segmen Naskah ({segments.length} Segmen)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {items.length} Prompt Gambar Siap
                  </span>
                </div>

                <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                  {segments.map((seg: any, idx: number) => {
                    const segItems = items.filter((it) => it.segment_id === seg.id);
                    return (
                      <div
                        key={seg.id || idx}
                        className="p-4 rounded-xl border border-[#2E2E2E] bg-[#141414] hover:border-violet-500/40 transition space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 font-bold border border-violet-500/20">
                            Segmen {idx + 1}: {seg.chapter || `Babak ${idx + 1}`}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {segItems.length} Ilustrasi Gambar
                          </span>
                        </div>

                        {/* Narration voiceover text */}
                        <p className="text-xs text-white leading-relaxed font-sans bg-black/30 p-2.5 rounded-lg border border-[#222]">
                          &ldquo;{seg.text}&rdquo;
                        </p>

                        {/* Visual Prompts list */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                            Visual Prompts Hand-drawn:
                          </span>
                          {segItems.map((item, iIdx) => (
                            <div
                              key={item.id}
                              className="flex items-start gap-2 text-[11px] text-slate-300 bg-surface/50 p-2 rounded border border-surface-border font-mono leading-normal"
                            >
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold">
                                #{iIdx + 1}
                              </span>
                              <span className="flex-1">{item.image_prompt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bottom Action */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setActiveTab("storyboard_voice")}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2 font-semibold text-xs shadow-lg shadow-violet-500/20"
                >
                  <span>Langkah Berikutnya: Generate Suara & Sync ➔</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

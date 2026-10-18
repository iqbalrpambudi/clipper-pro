"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  Clock,
  ArrowRight,
  BookOpen,
  Layers,
  Palette,
  ExternalLink,
  Users,
  Edit2,
  Check,
  Plus,
  Trash2,
  Bookmark,
  BookmarkPlus,
  Save,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem } from "@/types";
import { Button, Input, Textarea, Badge } from "@/components/ui";
import { presetStorage, ScriptPreset } from "@/lib/presetStorage";

interface StoryboardScriptTabProps {
  project: Project & {
    narration?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardScriptTab({ project }: StoryboardScriptTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const { data: presets = [] } = useQuery({
    queryKey: ["image-presets"],
    queryFn: api.getImagePresets,
  });

  const activePreset = presets.find((p) => p.is_active) || presets[0];
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  useEffect(() => {
    if (activePreset && !selectedPresetId) {
      setSelectedPresetId(activePreset.id);
    }
  }, [activePreset, selectedPresetId]);

  const [topic, setTopic] = useState(project.narration?.topic || project.name || "");
  const [durationMins, setDurationMins] = useState<number>(
    project.narration?.target_duration ? Math.round(project.narration.target_duration / 60) : 5
  );
  const [tone, setTone] = useState(project.narration?.tone || "santai");
  const [language, setLanguage] = useState<string>(project.narration?.language || project.language || "id");
  const [imagesPerSegment, setImagesPerSegment] = useState<number>(2);
  const [customInstructions, setCustomInstructions] = useState("");

  const handleLanguageSelect = (newLang: string) => {
    setLanguage(newLang);
    api.updateProject(project.id, { language: newLang }).then(() => {
      queryClient.setQueryData(["project", project.id], (old: any) => {
        if (!old) return old;
        return { ...old, language: newLang };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    });
  };

  useEffect(() => {
    if (project.narration?.language) {
      setLanguage(project.narration.language);
    }
  }, [project.narration?.language]);

  // Script & Narration Presets
  const [scriptPresets, setScriptPresets] = useState<ScriptPreset[]>([]);
  const [selectedScriptPresetId, setSelectedScriptPresetId] = useState<string>("");
  const [showSaveScriptModal, setShowSaveScriptModal] = useState<boolean>(false);
  const [newScriptPresetName, setNewScriptPresetName] = useState<string>("");

  useEffect(() => {
    setScriptPresets(presetStorage.getScriptPresets());
  }, []);

  const handleLoadScriptPreset = (presetId: string) => {
    setSelectedScriptPresetId(presetId);
    const found = scriptPresets.find((p) => p.id === presetId);
    if (!found) return;
    setDurationMins(found.durationMins);
    setTone(found.tone);
    if (found.presetId) setSelectedPresetId(found.presetId);
    setImagesPerSegment(found.imagesPerSegment);
    setCustomInstructions(found.customInstructions || "");
    showToast(`Preset naskah "${found.name}" berhasil dimuat!`, "success");
  };

  const handleSaveScriptPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScriptPresetName.trim()) {
      showToast("Nama preset tidak boleh kosong", "error");
      return;
    }
    const saved = presetStorage.saveScriptPreset({
      name: newScriptPresetName.trim(),
      durationMins,
      tone,
      presetId: selectedPresetId || undefined,
      imagesPerSegment,
      customInstructions,
    });
    setScriptPresets(presetStorage.getScriptPresets());
    setSelectedScriptPresetId(saved.id);
    setNewScriptPresetName("");
    setShowSaveScriptModal(false);
    showToast(`Preset "${saved.name}" berhasil disimpan!`, "success");
  };

  const handleDeleteScriptPreset = (id: string, name: string) => {
    presetStorage.deleteScriptPreset(id);
    const remaining = presetStorage.getScriptPresets();
    setScriptPresets(remaining);
    if (selectedScriptPresetId === id) setSelectedScriptPresetId("");
    showToast(`Preset "${name}" dihapus`, "info");
  };

  // Character Consistency Bible state
  const [editingCharacters, setEditingCharacters] = useState<boolean>(false);
  const [charactersList, setCharactersList] = useState<any[]>(project.characters || []);

  useEffect(() => {
    if (project.characters) {
      setCharactersList(project.characters);
    }
  }, [project.characters]);

  const handleAddCharacter = () => {
    setCharactersList((prev) => [
      ...prev,
      {
        name: `Tokoh ${prev.length + 1}`,
        role: "Tokoh Pendukung",
        visual_anchor: "",
      },
    ]);
    setEditingCharacters(true);
  };

  const handleDeleteCharacter = (idx: number) => {
    setCharactersList((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCharactersMutation = useMutation({
    mutationFn: (newChars: any[]) => api.updateStoryboardCharacters(project.id, newChars),
    onSuccess: (res) => {
      queryClient.setQueryData(["project", project.id], (old: any) => {
        if (!old) return old;
        return { ...old, characters: res.characters || [] };
      });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setEditingCharacters(false);
      showToast("Profil karakter terkunci berhasil disimpan!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui profil karakter", "error");
    },
  });

  const narration = project.narration;
  const segments: any[] = narration?.segments || [];
  const items: StoryboardItem[] = project.storyboard_items || [];

  // Segment Inline Editing State
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editChapter, setEditChapter] = useState<string>("");
  const [editText, setEditText] = useState<string>("");
  const [editItemPrompts, setEditItemPrompts] = useState<Record<string, string>>({});

  const handleStartEditSegment = (seg: any, idx: number, segItems: StoryboardItem[]) => {
    const segId = seg.id || seg.segment_id || `seg-${idx + 1}`;
    setEditingSegmentId(segId);
    setEditingSegmentIndex(idx);
    setEditChapter(seg.chapter || `Babak ${idx + 1}`);
    setEditText(seg.text || "");
    const promptsMap: Record<string, string> = {};
    segItems.forEach((it) => {
      promptsMap[it.id] = it.image_prompt || "";
    });
    setEditItemPrompts(promptsMap);
  };

  const handleCancelEditSegment = () => {
    setEditingSegmentId(null);
    setEditingSegmentIndex(null);
    setEditChapter("");
    setEditText("");
    setEditItemPrompts({});
  };

  const updateSegmentMutation = useMutation({
    mutationFn: ({
      segmentId,
      segmentIndex,
      chapter,
      text,
      items: itemUpdates,
    }: {
      segmentId: string;
      segmentIndex?: number;
      chapter: string;
      text: string;
      items: { id: string; image_prompt: string }[];
    }) =>
      api.updateStoryboardSegment(project.id, segmentId, {
        chapter,
        text,
        segment_index: segmentIndex,
        items: itemUpdates,
      }),
    onSuccess: (data: any) => {
      if (data?.narration) {
        queryClient.setQueryData(["project", project.id], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            narration: data.narration,
            storyboard_items: data.storyboard_items || old.storyboard_items || [],
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["storyboard-items", project.id] });
      handleCancelEditSegment();
      showToast("Segmen berhasil diperbarui!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui segmen", "error");
    },
  });

  const handleSaveEditSegment = (segmentId: string, segItems: StoryboardItem[], segIdx?: number) => {
    const itemsPayload = segItems.map((it) => ({
      id: it.id,
      image_prompt:
        editItemPrompts[it.id] !== undefined ? editItemPrompts[it.id] : it.image_prompt || "",
    }));

    updateSegmentMutation.mutate({
      segmentId,
      segmentIndex: segIdx !== undefined ? segIdx : (editingSegmentIndex !== null ? editingSegmentIndex : undefined),
      chapter: editChapter.trim(),
      text: editText.trim(),
      items: itemsPayload,
    });
  };

  const generateScriptMutation = useMutation({
    mutationFn: (data: {
      topic: string;
      target_duration_mins: number;
      tone: string;
      images_per_segment: number;
      preset_id?: string;
      custom_instructions?: string;
      language?: string;
    }) => api.generateStoryboardScript(project.id, data),
    onSuccess: (data: any) => {
      if (data?.narration) {
        queryClient.setQueryData(["project", project.id], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            characters: data.characters || old.characters || [],
            narration: data.narration,
            storyboard_items: data.storyboard_items || [],
          };
        });
      }
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
      preset_id: selectedPresetId || undefined,
      custom_instructions: customInstructions.trim() || undefined,
      language,
    });
  };

  // Calculate speech duration directly from generated narration text (standard speech rate: 135 wpm)
  const wordCount = narration?.raw_text ? narration.raw_text.trim().split(/\s+/).length : 0;
  const charCount = narration?.raw_text ? narration.raw_text.length : 0;
  const estimatedSeconds = wordCount > 0 ? Math.round((wordCount / 135) * 60) : 0;
  const resultMinutes = Math.floor(estimatedSeconds / 60);
  const resultSeconds = estimatedSeconds % 60;
  const resultDurationFormatted =
    wordCount === 0
      ? "0 Menit"
      : resultSeconds === 0
        ? `~${resultMinutes} Menit`
        : `~${resultMinutes}m ${resultSeconds}s`;

  return (
    <div className="space-y-6 max-w-8xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 1 dari 6
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

      {/* Top Grid: Form on Left (6 Cols), Stats & Karakter Terkunci on Right (6 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Form: Parameters (6 Cols) */}
        <div className="lg:col-span-6 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Parameter Naskah AI</h3>
              <p className="text-[11px] text-muted-foreground">Sesuaikan target durasi dan gaya pembawaan</p>
            </div>
          </div>

          {/* Preset Selector & Save Bar */}
          <div className="p-3 rounded-xl bg-[#141414] border border-[#2A2A2A] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bookmark className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs font-semibold text-slate-300 shrink-0">Preset:</span>
                <select
                  value={selectedScriptPresetId}
                  onChange={(e) => handleLoadScriptPreset(e.target.value)}
                  className="bg-[#1C1C1C] border border-[#333] hover:border-violet-500/50 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-violet-500 font-medium truncate max-w-[210px]"
                >
                  <option value="" disabled>-- Muat Preset Tersimpan --</option>
                  {scriptPresets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isBuiltin ? "(Bawaan)" : ""}
                    </option>
                  ))}
                </select>
                {selectedScriptPresetId && !scriptPresets.find((p) => p.id === selectedScriptPresetId)?.isBuiltin && (
                  <button
                    type="button"
                    onClick={() => {
                      const cur = scriptPresets.find((p) => p.id === selectedScriptPresetId);
                      if (cur) handleDeleteScriptPreset(cur.id, cur.name);
                    }}
                    title="Hapus Preset Kustom Ini"
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSaveScriptModal(!showSaveScriptModal)}
                className="px-2.5 py-1 text-xs rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1 font-medium shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Simpan Preset</span>
              </button>
            </div>

            {/* Save Preset Inline Form */}
            {showSaveScriptModal && (
              <form onSubmit={handleSaveScriptPreset} className="flex items-center gap-2 pt-2 border-t border-[#222]">
                <Input
                  type="text"
                  placeholder="Nama preset baru (mis. Dokumenter Favorit 8m)..."
                  value={newScriptPresetName}
                  onChange={(e) => setNewScriptPresetName(e.target.value)}
                  autoFocus
                  className="h-8 text-xs bg-[#1A1A1A] border-[#333] flex-1 text-white"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 gap-1 shrink-0"
                >
                  <Save className="w-3 h-3" />
                  <span>Simpan</span>
                </Button>
                <button
                  type="button"
                  onClick={() => setShowSaveScriptModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
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

            {/* Language Selector (Central Project Language Control) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Bahasa Utama Video (Kunci Seluruh Pipeline)
                </label>
                <span className="text-[10px] text-violet-300/80 font-mono">
                  Mengunci Naskah, Voice TTS & YouTube
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#121212] rounded-xl border border-[#2E2E2E]">
                <button
                  type="button"
                  onClick={() => handleLanguageSelect("id")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    language === "id"
                      ? "bg-violet-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="text-base">🇮🇩</span>
                  <span>Bahasa Indonesia</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLanguageSelect("en")}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                    language === "en"
                      ? "bg-violet-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span className="text-base">🇬🇧</span>
                  <span>English Explainer</span>
                </button>
              </div>
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
                    className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition ${tone === t.id
                        ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                        : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Visual Preset Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-violet-400" />
                  Preset Gaya Visual Ilustrasi AI
                </label>
                <Link
                  href="/image-studio"
                  className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline flex items-center gap-1"
                >
                  <span>Buka Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <select
                value={selectedPresetId || activePreset?.id || ""}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-[#2E2E2E] text-white text-xs font-medium focus:border-violet-500 focus:outline-none"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.is_active ? "(Aktif)" : ""}
                  </option>
                ))}
              </select>
              {presets.find((p) => p.id === (selectedPresetId || activePreset?.id)) && (
                <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                  <span className="truncate max-w-[260px]">
                    {presets.find((p) => p.id === (selectedPresetId || activePreset?.id))?.category} • 16:9 Landscape
                  </span>
                  <span className="text-violet-400 font-mono text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
                    Prompt Visual Selaras
                  </span>
                </div>
              )}
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
                    className={`p-2.5 rounded-xl border text-center transition ${imagesPerSegment === opt.count
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
                  <span>Merancang Naskah ({durationMins} Mnt) & Visual AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{segments.length > 0 ? `Generate Ulang Naskah (${durationMins} Menit)` : `Generate Naskah Storyboard (${durationMins} Menit)`}</span>
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right Column: Stats (Top) & Karakter Terkunci (Bottom) (6 Cols) */}
        <div className="lg:col-span-6 flex flex-col gap-6 justify-between">
          {/* Top Right Card: Metrik Video (durasi, panjang karakter, estimasi ilustrasi) */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Ringkasan Metrik Video
                </h4>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {segments.length > 0 ? "Hasil Riil Naskah" : "Target Estimasi"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#131313] border border-[#262626]">
              {/* Metric 1: Durasi */}
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
                  Durasi Narasi
                </span>
                <div className="text-sm font-bold text-violet-400 mt-1 font-mono">
                  {resultDurationFormatted}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                  {wordCount > 0 ? `~${(wordCount / 135).toFixed(1)} mnt (135 kpm)` : `Target ${durationMins} mnt`}
                </span>
              </div>

              {/* Metric 2: Panjang Karakter & Kata */}
              <div className="text-center border-x border-[#262626]">
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
                  Panjang Teks
                </span>
                <div className="text-sm font-bold text-white mt-1 font-mono">
                  {charCount > 0 ? `${charCount.toLocaleString()} Karakter` : "0 Karakter"}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                  {wordCount > 0 ? `${wordCount.toLocaleString()} Kata` : "0 Kata"}
                </span>
              </div>

              {/* Metric 3: Estimasi Ilustrasi */}
              <div className="text-center">
                <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider block">
                  Estimasi Ilustrasi
                </span>
                <div className="text-sm font-bold text-emerald-400 mt-1 font-mono">
                  {items.length > 0 ? `${items.length} Slot Gambar` : `${durationMins * 2 * imagesPerSegment} Estimasi Slot`}
                </div>
                <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                  {imagesPerSegment} gambar / segmen
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Right Card: Karakter Terkunci (Character Consistency Bible) */}
          <div className="rounded-2xl border border-violet-500/30 bg-[#161616] p-5 shadow-xl flex-1 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#2A2A2A]">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-400" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    Karakter Terkunci
                    <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono normal-case">
                      Konsisten 100%
                    </span>
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Ciri fisik & visual dikunci otomatis di semua prompt gambar
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddCharacter}
                  className="px-2.5 py-1 text-xs rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tambah</span>
                </button>
                {charactersList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditingCharacters(!editingCharacters)}
                    className="px-2.5 py-1 text-xs rounded-lg border border-[#333] hover:border-violet-500/50 text-slate-300 hover:text-white transition flex items-center gap-1 font-medium"
                  >
                    <Edit2 className="w-3 h-3 text-violet-400" />
                    <span>{editingCharacters ? "Selesai" : "Edit"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Character Cards or Empty State */}
            {charactersList && charactersList.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {charactersList.map((char, cIdx) => (
                    <div
                      key={cIdx}
                      className="p-3 rounded-xl bg-[#121212] border border-[#262626] hover:border-violet-500/40 transition space-y-2"
                    >
                      {editingCharacters ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={char.name}
                              placeholder="Nama Tokoh"
                              onChange={(e) => {
                                const updated = [...charactersList];
                                updated[cIdx] = { ...char, name: e.target.value };
                                setCharactersList(updated);
                              }}
                              className="flex-1 px-2 py-1 bg-[#181818] rounded border border-[#333] text-white text-xs font-semibold focus:outline-none focus:border-violet-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteCharacter(cIdx)}
                              className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={char.role || ""}
                            placeholder="Peran (mis. Tokoh Utama)"
                            onChange={(e) => {
                              const updated = [...charactersList];
                              updated[cIdx] = { ...char, role: e.target.value };
                              setCharactersList(updated);
                            }}
                            className="w-full px-2 py-1 bg-[#181818] rounded border border-[#333] text-slate-300 text-[11px] focus:outline-none focus:border-violet-500"
                          />
                          <textarea
                            value={char.visual_anchor}
                            placeholder="Deskripsi fisik: pakaian, warna, rambut, aksesoris..."
                            onChange={(e) => {
                              const updated = [...charactersList];
                              updated[cIdx] = { ...char, visual_anchor: e.target.value };
                              setCharactersList(updated);
                            }}
                            rows={2}
                            className="w-full px-2 py-1 bg-[#181818] rounded border border-[#333] text-foreground text-[11px] font-mono focus:outline-none focus:border-violet-500"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-violet-300 flex items-center gap-1">
                              👤 {char.name}
                            </span>
                            {char.role && (
                              <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono">
                                {char.role}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-black/30 p-2 rounded-lg border border-[#222]">
                            {char.visual_anchor || "Belum ada ciri visual khusus."}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {editingCharacters && (
                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      disabled={updateCharactersMutation.isPending}
                      onClick={() => updateCharactersMutation.mutate(charactersList)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5"
                    >
                      {updateCharactersMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Simpan Perubahan Karakter</span>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#2E2E2E] bg-black/20 p-5 text-center space-y-2">
                <p className="text-xs text-slate-400">
                  Belum ada profil karakter terkunci.
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Karakter utama akan dideteksi otomatis saat generate naskah, atau Anda dapat menambahkan profil karakter manual sekarang.
                </p>
                <button
                  type="button"
                  onClick={handleAddCharacter}
                  className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium inline-flex items-center gap-1.5 transition shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Karakter Manual</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Full-Width Daftar Babak & Segmen Naskah */}
      <div className="w-full">
        {segments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2E2E2E] bg-[#181818]/60 p-12 text-center shadow-xl">
            <BookOpen className="w-12 h-12 text-violet-400/50 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1.5">
              Daftar Babak & Segmen Naskah (0 Segmen)
            </h3>
            <p className="text-xs text-muted-foreground max-w-lg mx-auto mb-4 leading-relaxed">
              Ketikkan topik ide cerita di panel kiri atas lalu klik tombol <strong>Generate Naskah Storyboard</strong>. Sistem akan menghasilkan alur babak naskah narasi lengkap beserta prompt gambar sketsa hand-drawn di sini.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#2E2E2E]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Daftar Babak & Segmen Naskah ({segments.length} Segmen)</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-violet-500/30 text-violet-300 bg-violet-500/10 normal-case">
                      {(project.narration?.language || language) === "en" ? "🇬🇧 English Explainer" : "🇮🇩 Indonesian"}
                    </Badge>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Alur cerita terstruktur dengan narasi voiceover & slot prompt visual AI
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  {items.length} Prompt Gambar Siap
                </span>
                <Button
                  onClick={() => setActiveTab("storyboard_voice")}
                  className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
                >
                  <span>Lanjut ke Suara & Sync</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Segments List with full width 2-column layout */}
            <div className="space-y-4">
              {segments.map((seg: any, idx: number) => {
                const segId = seg.id || seg.segment_id || `seg-${idx + 1}`;
                const isEditing = editingSegmentIndex !== null ? editingSegmentIndex === idx : editingSegmentId === segId;
                const segItems = items.filter((it) => {
                  if (seg.id) return it.segment_id === seg.id;
                  if (seg.segment_id) return it.segment_id === seg.segment_id;
                  return it.segment_id === `seg-${idx + 1}`;
                });

                return (
                  <div
                    key={seg.id || idx}
                    className={`p-5 rounded-xl border transition space-y-3.5 ${
                      isEditing
                        ? "border-violet-500/80 bg-[#161616] ring-1 ring-violet-500/30 shadow-lg shadow-violet-500/5"
                        : "border-[#262626] bg-[#141414] hover:border-violet-500/40"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#222] pb-2.5">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold border border-violet-500/25 shrink-0">
                          Segmen {idx + 1}
                        </span>
                        {isEditing ? (
                          <div className="flex-1 max-w-sm">
                            <Input
                              value={editChapter}
                              onChange={(e) => setEditChapter(e.target.value)}
                              placeholder="Judul Babak..."
                              className="h-7 text-xs font-semibold bg-[#111] border-violet-500/40 text-white"
                            />
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-white">
                            {seg.chapter || `Babak ${idx + 1}`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                          {segItems.length} Ilustrasi Gambar
                        </span>
                        {!isEditing ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEditSegment(seg, idx, segItems)}
                            className="h-7 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-violet-400" />
                            <span>Edit Segmen</span>
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleCancelEditSegment}
                              disabled={updateSegmentMutation.isPending}
                              className="h-7 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Batal</span>
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveEditSegment(segId, segItems, idx)}
                              disabled={updateSegmentMutation.isPending}
                              className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow"
                            >
                              {updateSegmentMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>Simpan</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Responsive 2-column layout: Left = Narasi (5 cols), Right = Visual Prompts (7 cols) */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                      {/* Left: Narration voiceover text */}
                      <div className="lg:col-span-5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                            Naskah Narasi (Voiceover):
                          </span>
                          {isEditing && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {editText.length} karakter
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <Textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={6}
                            placeholder="Tuliskan naskah narasi voiceover untuk segmen ini..."
                            className="w-full text-xs text-white leading-relaxed font-sans bg-[#111] border-violet-500/40 focus:border-violet-400 p-3 rounded-xl resize-y"
                          />
                        ) : (
                          <div className="text-xs text-white leading-relaxed font-sans bg-black/40 p-3.5 rounded-xl border border-[#222]">
                            &ldquo;{seg.text}&rdquo;
                          </div>
                        )}
                      </div>

                      {/* Right: Visual Prompts list */}
                      <div className="lg:col-span-7 space-y-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Visual Prompts AI Hand-drawn ({segItems.length} Ilustrasi):
                        </span>
                        <div className="space-y-2">
                          {segItems.map((item, iIdx) => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-2.5 text-[11px] text-slate-300 p-2.5 rounded-lg border leading-relaxed font-mono ${
                                isEditing
                                  ? "bg-[#111] border-[#333]"
                                  : "bg-surface/60 border-surface-border"
                              }`}
                            >
                              <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold shrink-0 mt-1">
                                #{iIdx + 1}
                              </span>
                              {isEditing ? (
                                <Textarea
                                  value={
                                    editItemPrompts[item.id] !== undefined
                                      ? editItemPrompts[item.id]
                                      : item.image_prompt || ""
                                  }
                                  onChange={(e) =>
                                    setEditItemPrompts((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder="Prompt visual adegan..."
                                  className="flex-1 text-[11px] text-foreground font-mono bg-black/40 border-[#333] focus:border-violet-500 py-1.5 px-2.5 rounded-lg resize-y"
                                />
                              ) : (
                                <span className="flex-1 select-all">{item.image_prompt}</span>
                              )}
                            </div>
                          ))}
                          {segItems.length === 0 && (
                            <div className="text-[11px] text-slate-500 italic p-3 text-center bg-black/20 rounded-lg border border-dashed border-[#262626]">
                              Tidak ada item ilustrasi untuk segmen ini.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom action bar when editing */}
                    {isEditing && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222]">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEditSegment}
                          disabled={updateSegmentMutation.isPending}
                          className="h-8 px-3 text-xs text-slate-400 hover:text-white"
                        >
                          Batal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEditSegment(segId, segItems, idx)}
                          disabled={updateSegmentMutation.isPending}
                          className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow"
                        >
                          {updateSegmentMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Simpan Perubahan Segmen</span>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Action */}
            <div className="flex justify-end pt-3 border-t border-[#2E2E2E]">
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
  );
}

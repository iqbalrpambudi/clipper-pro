"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Youtube,
  Sparkles,
  Copy,
  Check,
  Download,
  RefreshCw,
  Tag,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  History,
  Palette,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem, YouTubeMetadata, YouTubeThumbnailHistory } from "@/types";
import { Button, Input, Textarea, Badge } from "@/components/ui";

interface StoryboardYoutubeTabProps {
  project: Project & {
    narration?: any;
    audio?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardYoutubeTab({ project }: StoryboardYoutubeTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();

  // Local editable states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailHistory, setThumbnailHistory] = useState<YouTubeThumbnailHistory[]>([]);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [thumbnailConcept, setThumbnailConcept] = useState("");

  // Metadata generation options
  const [focusAngle, setFocusAngle] = useState<string>("curiosity_gap");
  const [customPrompt, setCustomPrompt] = useState<string>("");

  // Copy feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Fetch active image preset for prompt injection
  const { data: presets = [] } = useQuery({
    queryKey: ["image-presets"],
    queryFn: () => api.getImagePresets(),
  });
  const activePreset = presets.find((p) => p.is_active);

  // Sync initial metadata from project
  useEffect(() => {
    const meta: YouTubeMetadata = (project as any).youtube_metadata || {};
    if (meta.title && !title) setTitle(meta.title);
    if (meta.description && !description) setDescription(meta.description);
    if (meta.tags && !tagsInput) setTagsInput(meta.tags.join(", "));
    if (meta.thumbnail_prompt && !thumbnailPrompt) setThumbnailPrompt(meta.thumbnail_prompt);
    if (meta.thumbnail_url) setThumbnailUrl(meta.thumbnail_url);
    if (meta.thumbnail_history) setThumbnailHistory(meta.thumbnail_history);
    if (meta.title_options) setTitleOptions(meta.title_options);
    if (meta.thumbnail_concept) setThumbnailConcept(meta.thumbnail_concept);
  }, [project]);

  // Generate Metadata Mutation
  const generateMetadataMutation = useMutation({
    mutationFn: () =>
      api.generateYouTubeMetadata(project.id, {
        focus_angle: focusAngle,
        custom_prompt: customPrompt.trim() || undefined,
      }),
    onSuccess: (data: YouTubeMetadata) => {
      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (data.tags) setTagsInput(data.tags.join(", "));
      if (data.thumbnail_prompt) setThumbnailPrompt(data.thumbnail_prompt);
      if (data.title_options) setTitleOptions(data.title_options);
      if (data.thumbnail_concept) setThumbnailConcept(data.thumbnail_concept);
      if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
      if (data.thumbnail_history) setThumbnailHistory(data.thumbnail_history);

      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Paket metadata YouTube & prompt thumbnail berhasil di-generate!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal generate metadata YouTube", "error");
    },
  });

  // Generate Thumbnail Mutation (customizable prompt)
  const generateThumbnailMutation = useMutation({
    mutationFn: () => {
      const p = thumbnailPrompt.trim();
      if (!p) throw new Error("Silakan masukkan atau atur prompt thumbnail terlebih dahulu");
      return api.generateYouTubeThumbnail(project.id, {
        prompt: p,
        preset_id: activePreset?.id,
      });
    },
    onSuccess: (data) => {
      setThumbnailUrl(data.thumbnail_url);
      setThumbnailHistory(data.history || []);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Thumbnail 16:9 berhasil di-generate!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal membuat thumbnail AI", "error");
    },
  });

  // Save / Update Metadata Mutation
  const saveMetadataMutation = useMutation({
    mutationFn: () => {
      const tagsArray = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      return api.updateYouTubeMetadata(project.id, {
        title: title.trim(),
        title_options: titleOptions,
        description: description.trim(),
        tags: tagsArray,
        thumbnail_prompt: thumbnailPrompt.trim(),
        thumbnail_concept: thumbnailConcept.trim(),
        thumbnail_url: thumbnailUrl || undefined,
        thumbnail_history: thumbnailHistory,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Perubahan metadata YouTube berhasil disimpan!", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan metadata", "error");
    },
  });

  // 1-Click Copy Helper
  const handleCopy = (text: string, key: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(`${label} berhasil disalin ke clipboard!`, "info");
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Inject active preset style into prompt
  const handleInjectPresetStyle = () => {
    if (!activePreset?.master_prompt) {
      showToast("Belum ada preset aktif dengan master prompt.", "info");
      return;
    }
    const addition = `, rendered in ${activePreset.name} style (${activePreset.master_prompt.trim()})`;
    if (!thumbnailPrompt.includes(activePreset.name)) {
      setThumbnailPrompt((prev) => (prev ? `${prev.trim()}${addition}` : addition.replace(/^,\s*/, "")));
      showToast(`Gaya preset '${activePreset.name}' disisipkan ke prompt thumbnail.`, "info");
    } else {
      showToast("Gaya preset sudah ada di dalam prompt.", "info");
    }
  };

  // Video duration string for YouTube badge
  const audio = (project as any).audio || (project as any).audio_track;
  const durationSec = Math.round(audio?.duration || 0);
  const formatBadgeDuration = (sec: number) => {
    if (!sec) return "04:30";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isMetadataGenerating = generateMetadataMutation.isPending;
  const isThumbnailGenerating = generateThumbnailMutation.isPending;
  const isSaving = saveMetadataMutation.isPending;

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold flex items-center gap-1.5">
              <Youtube className="w-3.5 h-3.5 text-red-500 fill-current" />
              Langkah 6 dari 6
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              YouTube Publishing & Thumbnail Suite
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            YouTube Video & Thumbnail Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate judul ber-CTR tinggi, deskripsi lengkap beserta timestamps chapter otomatis, SEO tags, dan 16:9 AI thumbnail yang dapat dikustomisasi prompt-nya.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("storyboard_render")}
            className="border-[#2E2E2E] text-xs"
          >
            Kembali ke Render
          </Button>

          <Button
            onClick={() => saveMetadataMutation.mutate()}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-600/20"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
            <span>Simpan Perubahan</span>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Thumbnail Studio & Live YouTube Card Mockup (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Thumbnail Prompt Studio (User Can Configure Prompt) */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Thumbnail Studio 16:9</h3>
                  <p className="text-[11px] text-muted-foreground">Kustomisasi prompt sebelum generate</p>
                </div>
              </div>
              <Badge className="bg-red-500/10 border-red-500/20 text-red-400 font-mono text-[11px]">
                16:9 HD
              </Badge>
            </div>

            {/* Prompt Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Prompt Thumbnail Visual AI</span>
                  <span className="text-[10px] text-muted-foreground font-normal">(Bahasa Inggris)</span>
                </label>
                {activePreset && (
                  <button
                    type="button"
                    onClick={handleInjectPresetStyle}
                    className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline flex items-center gap-1 font-medium transition-colors"
                    title="Sisipkan deskripsi gaya dari preset aktif"
                  >
                    <Palette className="w-3 h-3" />
                    <span>Pakai Gaya Preset: {activePreset.name}</span>
                  </button>
                )}
              </div>

              <Textarea
                value={thumbnailPrompt}
                onChange={(e) => setThumbnailPrompt(e.target.value)}
                placeholder="Contoh: A cinematic widescreen 16:9 dramatic illustration depicting an ancient mystery, high contrast lighting, compelling visual hook..."
                rows={4}
                className="bg-black/40 border-[#2E2E2E] text-xs resize-none leading-relaxed focus:border-red-500/50"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                <span>{thumbnailPrompt.length} karakter</span>
                <span>Resolusi target: 1792 x 1024 px</span>
              </div>
            </div>

            {thumbnailConcept && (
              <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-xs space-y-1">
                <div className="text-[11px] font-semibold text-red-300 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Konsep Visual AI:</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">{thumbnailConcept}</p>
              </div>
            )}

            {/* Action Button */}
            <Button
              onClick={() => generateThumbnailMutation.mutate()}
              disabled={isThumbnailGenerating || !thumbnailPrompt.trim()}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold py-2.5 shadow-lg shadow-red-600/20 transition-all"
            >
              {isThumbnailGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  <span>Sedang Mengenerate Thumbnail AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  <span>Generate Thumbnail AI (16:9)</span>
                </>
              )}
            </Button>
          </div>

          {/* Card 2: Live Realistic YouTube Mockup */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <Youtube className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Pratinjau Feed YouTube</h3>
                  <p className="text-[11px] text-muted-foreground">Tampilan simulasi di beranda YouTube</p>
                </div>
              </div>

              {thumbnailUrl && (
                <a
                  href={thumbnailUrl}
                  download={`thumbnail_${project.id}.png`}
                  className="px-2.5 py-1 rounded-md bg-[#262626] hover:bg-[#333] text-slate-300 text-[11px] font-medium flex items-center gap-1 border border-[#333] transition-colors"
                  title="Unduh file gambar thumbnail"
                >
                  <Download className="w-3 h-3 text-red-400" />
                  <span>Unduh PNG</span>
                </a>
              )}
            </div>

            {/* YouTube Card Simulation */}
            <div className="rounded-xl overflow-hidden bg-black border border-[#262626] shadow-2xl transition-all group">
              {/* Thumbnail Container (16:9) */}
              <div className="relative aspect-video w-full bg-[#121212] overflow-hidden flex items-center justify-center">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="YouTube Thumbnail Preview"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <ImageIcon className="w-10 h-10 mb-2 opacity-40 text-red-400" />
                    <p className="text-xs font-semibold text-slate-400">Belum Ada Thumbnail</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Klik 'Generate Thumbnail AI' di atas untuk membuat thumbnail 16:9
                    </p>
                  </div>
                )}

                {/* Duration Badge */}
                <div className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded bg-black/85 text-white font-mono text-[11px] font-bold tracking-wider backdrop-blur-sm shadow-md">
                  {formatBadgeDuration(durationSec)}
                </div>
              </div>

              {/* YouTube Video Info Block */}
              <div className="p-3.5 flex items-start gap-3 bg-[#0F0F0F]">
                {/* Channel Avatar Mockup */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-md">
                  C
                </div>

                {/* Details */}
                <div className="min-w-0 flex-1 space-y-1">
                  <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                    {title || project.name || "Judul Video YouTube Menarik"}
                  </h4>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                    <span>Cliper Studio</span>
                    <span className="w-3 h-3 rounded-full bg-slate-600 text-[8px] flex items-center justify-center text-white">✓</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    128K x ditonton • 2 jam yang lalu
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Thumbnail History Gallery */}
          {thumbnailHistory.length > 0 && (
            <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Riwayat Thumbnail ({thumbnailHistory.length})</span>
                </div>
                <span className="text-[11px] text-muted-foreground">Klik gambar untuk memilih</span>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {thumbnailHistory.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={() => {
                      setThumbnailUrl(item.url);
                      setThumbnailPrompt(item.prompt);
                      showToast("Thumbnail aktif diperbarui dari riwayat.", "info");
                    }}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      thumbnailUrl === item.url
                        ? "border-red-500 ring-2 ring-red-500/20 scale-[1.02]"
                        : "border-[#2E2E2E] hover:border-slate-400 opacity-70 hover:opacity-100"
                    }`}
                    title={item.prompt}
                  >
                    <img src={item.url} alt={`History thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                    {thumbnailUrl === item.url && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-600 flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: AI Generation Controls & Video Metadata Suite (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: AI Metadata Generator Controls */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">AI YouTube Packaging Engine</h3>
                  <p className="text-[11px] text-muted-foreground">Generate judul, babak timestamps & tags otomatis</p>
                </div>
              </div>

              <Badge className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 text-[11px]">
                High-CTR SEO
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Sudut Pandang (Focus Angle)
                </label>
                <select
                  value={focusAngle}
                  onChange={(e) => setFocusAngle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-[#2E2E2E] text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="curiosity_gap">Curiosity Gap Maksimal (Sangat Penasaran)</option>
                  <option value="question">Pertanyaan Provokatif & Diskusi</option>
                  <option value="storytelling">Storytelling & Kisah Nyata Dramatis</option>
                  <option value="educational">Edukatif, Ilmiah & Wawasan Tajam</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Instruksi Khusus (Opsional)
                </label>
                <Input
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Misal: Sorot plot twist di menit terakhir..."
                  className="bg-black/40 border-[#2E2E2E] text-xs"
                />
              </div>
            </div>

            <Button
              onClick={() => generateMetadataMutation.mutate()}
              disabled={isMetadataGenerating}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold py-2.5 shadow-lg shadow-emerald-600/20 transition-all"
            >
              {isMetadataGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                  <span>Sedang Menganalisis Naskah & Merancang Metadata...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  <span>Generate Paket Metadata YouTube AI</span>
                </>
              )}
            </Button>
          </div>

          {/* Section 1: Video Title & Alternative Hooks */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-red-400" />
                <span>Judul Utama Video (Video Title)</span>
              </label>

              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                    title.length > 70
                      ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      : "bg-black/40 text-slate-400 border border-[#2E2E2E]"
                  }`}
                >
                  {title.length}/70 karakter
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(title, "title", "Judul")}
                  className="border-[#2E2E2E] text-xs h-7 gap-1 px-2.5"
                >
                  {copiedKey === "title" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  <span>Salin</span>
                </Button>
              </div>
            </div>

            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Rahasia Terbesar di Lautan yang Tak Pernah Terungkap"
              className="bg-black/40 border-[#2E2E2E] text-xs font-semibold text-white focus:border-red-500/50"
            />

            {title.length > 70 && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>Disarankan di bawah 70 karakter agar judul tidak terpotong di YouTube mobile.</span>
              </p>
            )}

            {/* Alternative Title Hooks */}
            {titleOptions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#262626]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>Variasi Sudut Judul Lainnya (Klik untuk Terapkan):</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{titleOptions.length} opsi</span>
                </div>

                <div className="space-y-1.5">
                  {titleOptions.map((opt, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setTitle(opt);
                        showToast(`Judul diterapkan: "${opt}"`, "info");
                      }}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between group ${
                        title === opt
                          ? "bg-red-500/10 border-red-500/30 text-white"
                          : "bg-black/30 border-[#262626] text-slate-300 hover:bg-[#222] hover:border-slate-500"
                      }`}
                    >
                      <span className="line-clamp-1 font-medium">{opt}</span>
                      <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 text-[11px]">
                        <span className="font-mono text-[10px] text-muted-foreground">{opt.length} kar</span>
                        <ArrowRight className="w-3 h-3 text-red-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Video Description with Timestamps & Chapters */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Deskripsi Video & Timestamps Bab</span>
              </label>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(description, "desc", "Deskripsi")}
                className="border-[#2E2E2E] text-xs h-7 gap-1 px-2.5"
              >
                {copiedKey === "desc" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                <span>Salin Deskripsi Lengkap</span>
              </Button>
            </div>

            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi video otomatis dengan hook pembuka, sinopsis, timestamps bab (00:00 - ...), call to action, dan hashtags..."
              rows={8}
              className="bg-black/40 border-[#2E2E2E] text-xs leading-relaxed font-mono resize-none focus:border-emerald-500/50"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span>{description.split("\n").length} baris • {description.length} karakter</span>
              <span>Format SEO Siap YouTube</span>
            </div>
          </div>

          {/* Section 3: YouTube Search Tags */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-violet-400" />
                <span>Tag Pencarian YouTube (SEO Tags)</span>
              </label>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(tagsInput, "tags", "Tag YouTube")}
                className="border-[#2E2E2E] text-xs h-7 gap-1 px-2.5"
              >
                {copiedKey === "tags" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                <span>Salin Semua Tag (Format Koma)</span>
              </Button>
            </div>

            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2, tag3, cara membuat video, sains populer..."
              className="bg-black/40 border-[#2E2E2E] text-xs"
            />

            {/* Tag Badges Preview */}
            {tagsInput.trim() && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)
                  .map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[11px] font-medium"
                    >
                      #{t}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

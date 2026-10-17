"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Palette,
  Wand2,
  Image as ImageIcon,
  UploadCloud,
  Check,
  Copy,
  RotateCcw,
  Save,
  CheckCircle2,
  Trash2,
  ZoomIn,
  X,
  SlidersHorizontal,
  FolderOpen,
  ArrowLeft,
  Loader2,
} from "lucide-react";

import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { ImagePreset, StudioAnalysisResult } from "@/types";
import {
  Button,
  Badge,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";

const QUICK_INSPIRATION_TAGS = [
  { label: "Doodle Stickman Kuno", text: "Doodle stickman hitam putih vintage parchment watercolor" },
  { label: "Parchment Sepia", text: "Vintage aged tea-stained parchment paper with sepia hand-drawn watercolor washes" },
  { label: "Anime Watercolor", text: "Soft pastel anime watercolor storyboard illustration with delicate ink outlines" },
  { label: "Cyberpunk Graphic Novel", text: "Stylized cyberpunk graphic novel comic illustration, gritty high contrast ink" },
  { label: "Claymation 3D", text: "Warm handcrafted claymation stop-motion miniature scene with tactile clay texture" },
  { label: "Pencil Sketch Blueprint", text: "Architectural blueprint pencil sketch with diagrammatic technical annotations" },
];

const SAMPLE_SCENES = [
  "Seorang kakek bijak menceritakan kisah kuno di samping lentera minyak di bawah pohon rindang",
  "Dua orang berdiskusi intens di meja kerja penuh lembaran peta dan dokumen penting",
  "Karakter stickman menemukan ide cemerlang dengan bohlam lampu menyala di atas kepalanya",
  "Pemandangan benteng kuno megah di atas bukit saat matahari terbenam dengan warna hangat",
  "Perjalanan menyeberangi lautan badai dengan perahu kayu kecil menghadapi ombak tinggi",
];

export default function ImageStudioPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [userText, setUserText] = useState("Doodle stickman hitam putih vintage parchment watercolor");
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("/storage/presets/doodle_ref.png");
  const [referenceImagePath, setReferenceImagePath] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);

  // Analysis / Synthesized Preset State
  const [presetName, setPresetName] = useState("Doodle Ilustrasi");
  const [category, setCategory] = useState("doodle");
  const [description, setDescription] = useState(
    "Gaya sketsa stickman berkepala bulat botak di atas kertas parchment kuno, tinta hitam ekspresif, dan sapuan cat air hangat sepia."
  );
  const [masterPrompt, setMasterPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState(
    "No 3D CGI, no photorealism, no modern digital glossy gradients, no clutter, no digital text artifacts, no blurry details, no photorealistic humans."
  );
  const [styleAttributes, setStyleAttributes] = useState<StudioAnalysisResult["style_attributes"] | null>(null);

  // Test Generator State
  const [scenePrompt, setScenePrompt] = useState(
    "Seorang kakek bijak menceritakan kisah kuno di samping lentera minyak di bawah pohon rindang"
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string>("/storage/presets/doodle_preview.png");
  const [testImageHistory, setTestImageHistory] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  // Modals & Viewers
  const [isPresetListOpen, setIsPresetListOpen] = useState(false);
  const [selectedPresetForEdit, setSelectedPresetForEdit] = useState<ImagePreset | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);
  const [saveTarget, setSaveTarget] = useState<"doodle-ilustrasi" | "new" | "active_id">("doodle-ilustrasi");

  // Query: Get all presets
  const { data: presets = [], isLoading: isLoadingPresets } = useQuery({
    queryKey: ["image-presets"],
    queryFn: api.getImagePresets,
  });

  const activePreset = presets.find((p) => p.is_active) || presets[0];

  // Set initial master prompt from active preset once loaded
  useEffect(() => {
    if (activePreset && !masterPrompt) {
      setPresetName(activePreset.name);
      setCategory(activePreset.category);
      setDescription(activePreset.description || "");
      setMasterPrompt(activePreset.master_prompt);
      if (activePreset.negative_prompt) setNegativePrompt(activePreset.negative_prompt);
      if (activePreset.reference_image_url) setReferenceImageUrl(activePreset.reference_image_url);
      if (activePreset.preview_image_url) setPreviewImageUrl(activePreset.preview_image_url);
      if (activePreset.user_text_input) setUserText(activePreset.user_text_input);
      if (activePreset.style_attributes) setStyleAttributes(activePreset.style_attributes as any);
    }
  }, [activePreset]);

  // Mutation: Upload reference image
  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadReferenceImage(file),
    onSuccess: (res) => {
      setReferenceImageUrl(res.url);
      setReferenceImagePath(res.file_path);
      showToast("Gambar referensi berhasil diunggah!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mengunggah gambar", "error");
    },
    onSettled: () => setIsUploading(false),
  });

  // Mutation: Analyze & Synthesize Style
  const analyzeMutation = useMutation({
    mutationFn: () =>
      api.analyzeStylePreset({
        user_text: userText.trim(),
        reference_image_url: referenceImageUrl,
        reference_image_path: referenceImagePath || undefined,
      }),
    onSuccess: (res) => {
      setPresetName(res.name);
      setCategory(res.category);
      setDescription(res.description);
      setMasterPrompt(res.master_prompt);
      setNegativePrompt(res.negative_prompt);
      setStyleAttributes(res.style_attributes);
      showToast("Master Prompt & gaya visual berhasil disintesis oleh AI!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menganalisis gaya visual", "error");
    },
  });

  // Mutation: Generate Test Image
  const testGenerateMutation = useMutation({
    mutationFn: () =>
      api.testGeneratePresetImage({
        master_prompt: masterPrompt.trim(),
        scene_prompt: scenePrompt.trim(),
        aspect_ratio: "16:9",
      }),
    onSuccess: (res) => {
      setPreviewImageUrl(res.image_url);
      setTestImageHistory((prev) => [res.image_url, ...prev.filter((u) => u !== res.image_url)]);
      showToast("Gambar uji coba 16:9 berhasil di-generate!", "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal generate gambar uji coba", "error");
    },
  });

  // Mutation: Save Preset
  const savePresetMutation = useMutation({
    mutationFn: (asActive: boolean) => {
      const presetId =
        saveTarget === "doodle-ilustrasi"
          ? "doodle-ilustrasi"
          : selectedPresetForEdit && saveTarget === "active_id"
          ? selectedPresetForEdit.id
          : `preset-${Date.now()}`;

      return api.createImagePreset({
        id: presetId,
        name: presetName.trim(),
        category: category || "custom",
        description: description.trim(),
        master_prompt: masterPrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        reference_image_url: referenceImageUrl,
        preview_image_url: previewImageUrl,
        user_text_input: userText.trim(),
        style_attributes: styleAttributes || undefined,
        is_active: asActive,
      });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      showToast(
        `Preset '${saved.name}' berhasil disimpan ${saved.is_active ? "dan diterapkan ke Ilustrasi AI!" : "!"}`,
        "success"
      );
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan preset", "error");
    },
  });

  // Mutation: Activate preset
  const activateMutation = useMutation({
    mutationFn: (id: string) => api.activateImagePreset(id),
    onSuccess: (preset) => {
      queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      showToast(`Preset '${preset.name}' kini aktif untuk semua Ilustrasi AI!`, "success");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal mengaktifkan preset", "error");
    },
  });

  // Mutation: Delete preset
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteImagePreset(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      showToast("Preset berhasil dihapus", "info");
    },
    onError: (err: any) => {
      showToast(err.message || "Gagal menghapus preset", "error");
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    uploadMutation.mutate(file);
  };

  const handleCopyPrompt = () => {
    if (!masterPrompt) return;
    navigator.clipboard.writeText(masterPrompt);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    showToast("Master Prompt disalin ke clipboard!", "info");
  };

  const loadPresetIntoStudio = (p: ImagePreset) => {
    setSelectedPresetForEdit(p);
    setSaveTarget(p.id === "doodle-ilustrasi" ? "doodle-ilustrasi" : "active_id");
    setPresetName(p.name);
    setCategory(p.category);
    setDescription(p.description || "");
    setMasterPrompt(p.master_prompt);
    if (p.negative_prompt) setNegativePrompt(p.negative_prompt);
    if (p.reference_image_url) setReferenceImageUrl(p.reference_image_url);
    if (p.preview_image_url) setPreviewImageUrl(p.preview_image_url);
    if (p.user_text_input) setUserText(p.user_text_input);
    if (p.style_attributes) setStyleAttributes(p.style_attributes as any);
    setIsPresetListOpen(false);
    showToast(`Preset '${p.name}' dimuat ke Studio!`, "info");
  };

  const handleResetToDoodle = () => {
    const doodle = presets.find((p) => p.id === "doodle-ilustrasi");
    if (doodle) {
      loadPresetIntoStudio(doodle);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#121212] text-foreground">
      {/* Top Navbar */}
      <header className="border-b border-[#2E2E2E] bg-[#171717]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-9 h-9 rounded-xl bg-surface border border-surface-border flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/10 transition"
              title="Kembali ke Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-violet-500/20 text-white">
              <Palette className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-white font-sans">
                  AI Visual Image Studio
                </span>
                <Badge variant="supabase" className="text-[10px] uppercase font-mono tracking-wider">
                  Preset Studio
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Sintesis Master Prompt & Preset Gaya Ilustrasi Storyboard AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPresetListOpen(true)}
              className="gap-2 text-xs border-[#2E2E2E] text-slate-300 hover:text-white"
            >
              <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
              <span>Daftar Preset</span>
              <span className="px-1.5 py-0.2 rounded-full bg-violet-500/20 text-violet-300 font-mono text-[10px]">
                {presets.length}
              </span>
            </Button>

            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-2 text-xs border-[#2E2E2E] text-slate-300">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Model Settings</span>
              </Button>
            </Link>

            <Button
              variant="supabase"
              size="sm"
              onClick={() => savePresetMutation.mutate(true)}
              disabled={savePresetMutation.isPending || !masterPrompt}
              className="gap-2 text-xs font-semibold shadow-md shadow-[#3ECF8E]/15"
            >
              {savePresetMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>Simpan & Terapkan Preset</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Active Preset Banner */}
      <div className="bg-gradient-to-r from-violet-950/40 via-[#181818] to-emerald-950/30 border-b border-[#2E2E2E] py-2.5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-muted-foreground">Preset Aktif Saat Ini di Ilustrasi AI:</span>
            <span className="font-semibold text-white bg-surface-border/40 px-2.5 py-0.5 rounded-full border border-surface-border">
              ✨ {activePreset?.name || "Doodle Ilustrasi"}
            </span>
            <span className="text-slate-400 font-mono text-[11px] hidden md:inline">
              ({activePreset?.category || "doodle"})
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <button
              onClick={handleResetToDoodle}
              className="text-violet-400 hover:text-violet-300 font-mono flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Muat Preset Doodle Ilustrasi</span>
            </button>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400">Master Prompt otomatis terpasang saat batch generate storyboard.</span>
          </div>
        </div>
      </div>

      {/* Main Studio Content: Two-Column Split */}
      <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* ======================================================== */}
          {/* LEFT COLUMN: Input & AI Synthesizer (5 cols) */}
          {/* ======================================================== */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Step 1: Input Deskripsi Teks */}
            <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] shadow-lg space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold font-mono">
                    1
                  </span>
                  <label className="text-sm font-semibold text-white">
                    Konsep & Deskripsi Gaya Visual
                  </label>
                </div>
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-[#2E2E2E]">
                  Teks Input
                </Badge>
              </div>

              <Textarea
                rows={3}
                value={userText}
                onChange={(e) => setUserText(e.target.value)}
                placeholder="Deskripsikan gaya ilustrasi yang Anda inginkan (misal: Doodle stickman hitam putih, kertas perkamen vintage, cat air lembut, dsb)..."
                className="text-xs bg-[#121212] border-[#2E2E2E] text-slate-100 placeholder:text-slate-500 focus:border-violet-500 rounded-xl leading-relaxed font-sans"
              />

              {/* Quick Inspiration Pills */}
              <div>
                <p className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <span>Inspirasi Cepat:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_INSPIRATION_TAGS.map((tag, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setUserText(tag.text)}
                      className="px-2 py-1 rounded-lg bg-[#202020] hover:bg-[#282828] text-slate-300 hover:text-white border border-[#2E2E2E] text-[10px] transition"
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 2: Referensi Gambar Visual */}
            <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] shadow-lg space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold font-mono">
                    2
                  </span>
                  <label className="text-sm font-semibold text-white">
                    Referensi Gambar Visual
                  </label>
                </div>
                <span className="text-[10px] text-muted-foreground">Upload file / URL</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Reference Preview Card or Upload Zone */}
              {referenceImageUrl ? (
                <div className="relative rounded-xl border border-[#2E2E2E] bg-[#121212] p-3 flex items-center gap-4 group">
                  <div
                    onClick={() => setZoomImage({ url: referenceImageUrl, title: "Gambar Referensi Visual" })}
                    className="relative w-28 h-18 rounded-lg overflow-hidden border border-[#2E2E2E] bg-black/40 cursor-pointer shrink-0"
                  >
                    <img
                      src={referenceImageUrl}
                      alt="Referensi Gaya"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                      <ZoomIn className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-semibold text-white truncate">
                        Referensi Gambar Siap
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate font-mono">
                      {referenceImageUrl}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-[11px] text-violet-400 hover:text-violet-300 font-medium underline"
                      >
                        Ganti Gambar
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceImageUrl("");
                          setReferenceImagePath("");
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-dashed border-[#3A3A3A] hover:border-violet-500 bg-[#141414] hover:bg-violet-950/10 p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
                >
                  <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <UploadCloud className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white block">
                      {isUploading ? "Mengunggah gambar..." : "Klik atau seret gambar referensi ke sini"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Mendukung PNG, JPG, JPEG, WebP (Rasio 16:9 disarankan)
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Preset Samples to pick from */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">Pilih dari referensi bawaan:</span>
                <button
                  type="button"
                  onClick={() => setReferenceImageUrl("/storage/presets/doodle_ref.png")}
                  className="text-[10px] text-violet-400 hover:text-violet-300 font-mono transition"
                >
                  Gunakan Referensi Doodle Asli
                </button>
              </div>
            </div>

            {/* Action Button: Sintesis Master Prompt */}
            <Button
              type="button"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || (!userText.trim() && !referenceImageUrl)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-emerald-600 hover:opacity-90 text-white font-semibold text-xs shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition"
            >
              {analyzeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>AI Sedang Menganalisis Gambar & Merancang Prompt...</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Sintesis Master Prompt & Gaya Visual</span>
                </>
              )}
            </Button>

            {/* Step 3: Hasil Master Prompt & Parameter Gaya */}
            <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-[#2E2E2E] pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold font-mono">
                    3
                  </span>
                  <h3 className="text-sm font-semibold text-white">
                    Master Style Prompt Ilustrasi AI
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-mono transition"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? "Tersalin!" : "Salin Prompt"}</span>
                </button>
              </div>

              {/* Preset Meta Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
                    Nama Preset
                  </label>
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Contoh: Doodle Ilustrasi"
                    className="text-xs bg-[#121212] border-[#2E2E2E] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
                    Kategori Gaya
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-[#121212] border border-[#2E2E2E] text-xs text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="doodle">Doodle / Stickman</option>
                    <option value="watercolor">Watercolor / Cat Air</option>
                    <option value="vintage">Vintage / Parchment</option>
                    <option value="comic">Comic / Manga</option>
                    <option value="anime">Anime / Japanese</option>
                    <option value="cinematic">Cinematic Storyboard</option>
                    <option value="3d">3D / Claymation</option>
                    <option value="custom">Custom Style</option>
                  </select>
                </div>
              </div>

              {/* Master Prompt Editor */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
                  Master Style Prompt (Disematkan ke Setiap Adegan 16:9)
                </label>
                <Textarea
                  rows={6}
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  placeholder="Instruksi gaya visual yang dihasilkan AI..."
                  className="text-xs font-mono bg-[#121212] border-[#2E2E2E] text-slate-100 placeholder:text-slate-500 focus:border-violet-500 rounded-xl leading-relaxed"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Prompt ini menjadi acuan seragam saat generate setiap adegan naskah di tab <strong>Langkah 3. Ilustrasi AI</strong>.
                </p>
              </div>

              {/* Negative Prompt */}
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
                  Negative Prompt / Pantangan Visual
                </label>
                <Input
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Elemen yang dihindari (misal: No 3D CGI, no photorealism...)"
                  className="text-xs font-mono bg-[#121212] border-[#2E2E2E] rounded-lg"
                />
              </div>

              {/* Visual Style Attributes Badges (Palette, Medium, Linework) */}
              {styleAttributes && (
                <div className="pt-2 border-t border-[#2E2E2E] space-y-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                    Atribut Karakteristik Visual AI
                  </span>

                  {styleAttributes.palette && styleAttributes.palette.length > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Palet Warna:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {styleAttributes.palette.map((color, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-[#222222] border border-[#2E2E2E] text-[10px] text-slate-300 font-mono"
                          >
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {styleAttributes.medium && (
                    <div className="text-[10px] text-slate-400">
                      <strong className="text-slate-300">Medium:</strong> {styleAttributes.medium}
                    </div>
                  )}
                  {styleAttributes.character_style && (
                    <div className="text-[10px] text-slate-400">
                      <strong className="text-slate-300">Karakter:</strong> {styleAttributes.character_style}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* ======================================================== */}
          {/* RIGHT COLUMN: Live Test Studio & Comparison (7 cols) */}
          {/* ======================================================== */}
          <div className="lg:col-span-7 space-y-6">

            {/* Visual Comparison: Reference vs AI Generated Preview */}
            <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-400" />
                    <span>Perbandingan Visual Side-by-Side</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Evaluasi kemiripan gaya antara gambar referensi dengan hasil uji coba model AI.
                  </p>
                </div>

                <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[10px] font-mono">
                  16:9 Landscape
                </Badge>
              </div>

              {/* Side by Side Image Container */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Reference Image Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300 px-1">
                    <span>1. Referensi Input</span>
                    <span className="text-[10px] text-muted-foreground font-mono">Original</span>
                  </div>

                  <div className="relative aspect-video rounded-xl overflow-hidden border border-[#2E2E2E] bg-black/60 group">
                    {referenceImageUrl ? (
                      <>
                        <img
                          src={referenceImageUrl}
                          alt="Referensi Asli"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <button
                          type="button"
                          onClick={() => setZoomImage({ url: referenceImageUrl, title: "Gambar Referensi Asli" })}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                        >
                          <span className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium flex items-center gap-1.5">
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>Perbesar Referensi</span>
                          </span>
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-xs">Belum ada gambar referensi</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Generated Preview Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300 px-1">
                    <span className="text-violet-400">2. Hasil Generate AI (Preview)</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Model Output</span>
                  </div>

                  <div className="relative aspect-video rounded-xl overflow-hidden border border-violet-500/30 bg-black/60 group shadow-lg shadow-violet-950/20">
                    {testGenerateMutation.isPending ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-violet-950/20 text-violet-300 gap-2 p-4 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                        <span className="text-xs font-semibold">Menghasilkan Gambar Uji Coba 16:9...</span>
                        <span className="text-[10px] text-slate-400 max-w-xs">
                          Menggunakan model gambar AI aktif dan format landscape widescreen
                        </span>
                      </div>
                    ) : previewImageUrl ? (
                      <>
                        <img
                          src={previewImageUrl}
                          alt="Preview Hasil AI"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <button
                          type="button"
                          onClick={() => setZoomImage({ url: previewImageUrl, title: "Preview Gambar AI (Preset Test)" })}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                        >
                          <span className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium flex items-center gap-1.5">
                            <ZoomIn className="w-3.5 h-3.5" />
                            <span>Perbesar Gambar AI</span>
                          </span>
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                        <Wand2 className="w-8 h-8 text-violet-400/50" />
                        <span className="text-xs">Klik 'Generate Gambar Uji Coba' untuk melihat hasil</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* History Thumbnails */}
              {testImageHistory.length > 1 && (
                <div className="pt-2 border-t border-[#2E2E2E]">
                  <span className="text-[10px] text-slate-500 block mb-1.5">
                    Riwayat Gambar Uji Coba Sesi Ini:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {testImageHistory.map((imgUrl, i) => (
                      <div
                        key={i}
                        onClick={() => setPreviewImageUrl(imgUrl)}
                        className={`w-16 h-10 rounded-lg overflow-hidden border cursor-pointer shrink-0 transition ${
                          previewImageUrl === imgUrl ? "border-violet-500 ring-2 ring-violet-500/40" : "border-[#2E2E2E] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img src={imgUrl} alt={`Test ${i}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Prompt Tester */}
            <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-emerald-400" />
                    <span>Uji Coba Adegan Cerita (Test Generation)</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Coba generate adegan naskah berbeda dengan Master Prompt di atas untuk menguji konsistensi gaya.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
                  Deskripsi Adegan Uji Coba (Visual Scene)
                </label>
                <div className="flex gap-2">
                  <Input
                    value={scenePrompt}
                    onChange={(e) => setScenePrompt(e.target.value)}
                    placeholder="Tuliskan adegan yang ingin di-generate..."
                    className="text-xs bg-[#121212] border-[#2E2E2E] rounded-xl flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => testGenerateMutation.mutate()}
                    disabled={testGenerateMutation.isPending || !masterPrompt}
                    className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-md shadow-violet-500/20 gap-2 shrink-0 px-4"
                  >
                    {testGenerateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Generate Test</span>
                  </Button>
                </div>
              </div>

              {/* Sample Scene Buttons */}
              <div>
                <span className="text-[10px] text-slate-500 block mb-1.5">
                  Contoh Adegan Storyboard:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_SCENES.map((sc, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setScenePrompt(sc)}
                      className="px-2.5 py-1 rounded-lg bg-[#202020] hover:bg-[#282828] text-slate-300 hover:text-white border border-[#2E2E2E] text-[10px] transition text-left"
                    >
                      {sc.slice(0, 42)}...
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Save Preset Card */}
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-[#181C19] to-[#181818] shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Simpan Preset ke Ilustrasi AI</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hasil sintesis ini akan tersimpan ke database dan dapat langsung diterapkan pada pembuatan video storyboard Anda.
                  </p>
                </div>

                <Badge variant="supabase" className="text-[10px]">
                  Preset Siap
                </Badge>
              </div>

              {/* Save Mode Selector */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setSaveTarget("doodle-ilustrasi")}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    saveTarget === "doodle-ilustrasi"
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-[#2E2E2E] bg-[#141414] text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">Preset Doodle Ilustrasi</span>
                    {saveTarget === "doodle-ilustrasi" && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Simpan / Perbarui preset bawaan Doodle Ilustrasi (Direkomendasikan)
                  </p>
                </div>

                <div
                  onClick={() => setSaveTarget("new")}
                  className={`p-3 rounded-xl border cursor-pointer transition ${
                    saveTarget === "new"
                      ? "border-emerald-500 bg-emerald-500/10 text-white"
                      : "border-[#2E2E2E] bg-[#141414] text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold">Simpan Preset Baru</span>
                    {saveTarget === "new" && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Simpan sebagai variasi preset baru terpisah
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                <Button
                  onClick={() => savePresetMutation.mutate(true)}
                  disabled={savePresetMutation.isPending || !masterPrompt}
                  variant="supabase"
                  className="w-full sm:flex-1 py-3 text-xs font-bold gap-2 shadow-lg shadow-[#3ECF8E]/20"
                >
                  {savePresetMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>
                    {saveTarget === "doodle-ilustrasi"
                      ? "Simpan sebagai Preset Doodle Ilustrasi & Aktifkan"
                      : "Simpan Preset & Aktifkan Sekarang"}
                  </span>
                </Button>

                <Button
                  onClick={() => savePresetMutation.mutate(false)}
                  disabled={savePresetMutation.isPending || !masterPrompt}
                  variant="outline"
                  className="w-full sm:w-auto text-xs border-[#2E2E2E] text-slate-300 hover:text-white"
                >
                  <span>Simpan Tanpa Mengaktifkan</span>
                </Button>
              </div>
            </div>

          </div>

        </div>
      </main>

      {/* ======================================================== */}
      {/* DIALOG: Saved Presets Manager */}
      {/* ======================================================== */}
      <Dialog open={isPresetListOpen} onOpenChange={setIsPresetListOpen}>
        <DialogContent className="max-w-3xl bg-[#171717] border-[#2E2E2E] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="w-5 h-5 text-violet-400" />
              <span>Daftar Preset Gaya Ilustrasi AI</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Kelola semua preset visual yang tersimpan. Anda dapat mengaktifkan, mengedit di studio, atau menghapus preset kustom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 py-2">
            {isLoadingPresets ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memuat daftar preset...</span>
              </div>
            ) : presets.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Belum ada preset tersimpan.
              </div>
            ) : (
              presets.map((preset) => (
                <div
                  key={preset.id}
                  className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    preset.is_active
                      ? "bg-emerald-950/20 border-emerald-500/40"
                      : "bg-[#141414] border-[#2E2E2E] hover:border-surface-border"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-16 h-12 rounded-lg overflow-hidden border border-[#2E2E2E] bg-black shrink-0">
                      <img
                        src={preset.preview_image_url || preset.reference_image_url || "/storage/presets/doodle_preview.png"}
                        alt={preset.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">
                          {preset.name}
                        </span>
                        {preset.is_active && (
                          <Badge variant="supabase" className="text-[9px] px-1.5 py-0 font-mono">
                            Aktif
                          </Badge>
                        )}
                        {preset.is_builtin && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/30 text-violet-300 font-mono">
                            Bawaan
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                        {preset.description || preset.master_prompt.slice(0, 80)}...
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!preset.is_active && (
                      <Button
                        size="sm"
                        variant="supabase"
                        onClick={() => activateMutation.mutate(preset.id)}
                        disabled={activateMutation.isPending}
                        className="text-[11px] h-8 px-2.5"
                      >
                        Aktifkan
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => loadPresetIntoStudio(preset)}
                      className="text-[11px] h-8 px-2.5 border-[#2E2E2E]"
                    >
                      Buka di Studio
                    </Button>
                    {!preset.is_builtin && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(preset.id)}
                        className="text-[11px] h-8 px-2 border-[#2E2E2E] text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPresetListOpen(false)}
              className="border-[#2E2E2E] text-xs"
            >
              Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* MODAL: Fullscreen Image Zoom */}
      {/* ======================================================== */}
      {zoomImage && (
        <div
          onClick={() => setZoomImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
        >
          <div className="relative max-w-5xl w-full flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-white mb-2">
              <span className="text-sm font-semibold">{zoomImage.title}</span>
              <button
                type="button"
                onClick={() => setZoomImage(null)}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video w-full rounded-2xl overflow-hidden border border-[#2E2E2E] shadow-2xl bg-black">
              <img
                src={zoomImage.url}
                alt={zoomImage.title}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

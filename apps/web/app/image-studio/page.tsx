"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Palette,
  Save,
  RotateCcw,
  SlidersHorizontal,
  FolderOpen,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { ImagePreset, StudioAnalysisResult } from "@/types";
import { Button, Badge } from "@/components/ui";
import { ImageStudioSynthesizer } from "./_components/ImageStudioSynthesizer";
import { ImageStudioTester } from "./_components/ImageStudioTester";
import { ImagePresetsDialog, ImageZoomModal } from "./_components/ImageStudioDialogs";

export default function ImageStudioPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [userText, setUserText] = useState(
    "Doodle stickman hitam putih vintage parchment watercolor"
  );
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>(
    "/storage/presets/doodle_ref.png"
  );
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
  const [styleAttributes, setStyleAttributes] = useState<
    StudioAnalysisResult["style_attributes"] | null
  >(null);

  // Test Generator State
  const [scenePrompt, setScenePrompt] = useState(
    "Seorang kakek bijak menceritakan kisah kuno di samping lentera minyak di bawah pohon rindang"
  );
  const [previewImageUrl, setPreviewImageUrl] = useState<string>(
    "/storage/presets/doodle_preview.png"
  );
  const [testImageHistory, setTestImageHistory] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  // Modals & Viewers
  const [isPresetListOpen, setIsPresetListOpen] = useState(false);
  const [selectedPresetForEdit, setSelectedPresetForEdit] = useState<ImagePreset | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);
  const [saveTarget, setSaveTarget] = useState<"doodle-ilustrasi" | "new" | "active_id">(
    "doodle-ilustrasi"
  );

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
      if (activePreset.style_attributes) setStyleAttributes(activePreset.style_attributes);
    }
  }, [activePreset, masterPrompt]);

  // Mutation: Upload reference image
  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadReferenceImage(file),
    onSuccess: (res) => {
      setReferenceImageUrl(res.url);
      setReferenceImagePath(res.file_path);
      showToast("Gambar referensi berhasil diunggah!", "success");
    },
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    onError: (err: Error) => {
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
    if (p.style_attributes) setStyleAttributes(p.style_attributes);
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
              className="gap-2 text-xs border-border text-slate-300 hover:text-white"
            >
              <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
              <span>Daftar Preset</span>
              <span className="px-1.5 py-0.2 rounded-full bg-violet-500/20 text-violet-300 font-mono text-[10px]">
                {presets.length}
              </span>
            </Button>

            <Link href="/settings">
              <Button variant="outline" size="sm" className="gap-2 text-xs border-border text-slate-300">
                <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Model Settings</span>
              </Button>
            </Link>

            <Button
              variant="supabase"
              size="sm"
              onClick={() => savePresetMutation.mutate(true)}
              disabled={savePresetMutation.isPending || !masterPrompt}
              className="gap-2 text-xs font-semibold shadow-md shadow-primary/15"
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
      <div className="bg-gradient-to-r from-violet-950/40 via-surface to-emerald-950/30 border-b border-border py-2.5 px-6">
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
            <span className="text-slate-400">
              Master Prompt otomatis terpasang saat batch generate storyboard.
            </span>
          </div>
        </div>
      </div>

      {/* Main Studio Content: Two-Column Split */}
      <main className="max-w-[1920px] mx-auto px-6 py-8 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN: Input & AI Synthesizer */}
          <div className="lg:col-span-5">
            <ImageStudioSynthesizer
              userText={userText}
              setUserText={setUserText}
              referenceImageUrl={referenceImageUrl}
              setReferenceImageUrl={setReferenceImageUrl}
              setReferenceImagePath={setReferenceImagePath}
              fileInputRef={fileInputRef}
              isUploading={isUploading}
              onFileUpload={handleFileUpload}
              onAnalyze={() => analyzeMutation.mutate()}
              isAnalyzing={analyzeMutation.isPending}
              presetName={presetName}
              setPresetName={setPresetName}
              category={category}
              setCategory={setCategory}
              masterPrompt={masterPrompt}
              setMasterPrompt={setMasterPrompt}
              negativePrompt={negativePrompt}
              setNegativePrompt={setNegativePrompt}
              styleAttributes={styleAttributes}
              onCopyPrompt={handleCopyPrompt}
              isCopied={isCopied}
              onZoomImage={setZoomImage}
            />
          </div>

          {/* RIGHT COLUMN: Live Test Studio & Comparison */}
          <div className="lg:col-span-7">
            <ImageStudioTester
              referenceImageUrl={referenceImageUrl}
              previewImageUrl={previewImageUrl}
              setPreviewImageUrl={setPreviewImageUrl}
              testImageHistory={testImageHistory}
              scenePrompt={scenePrompt}
              setScenePrompt={setScenePrompt}
              onGenerateTest={() => testGenerateMutation.mutate()}
              isGeneratingTest={testGenerateMutation.isPending}
              masterPrompt={masterPrompt}
              saveTarget={saveTarget}
              setSaveTarget={setSaveTarget}
              onSavePreset={(asActive) => savePresetMutation.mutate(asActive)}
              isSavingPreset={savePresetMutation.isPending}
              onZoomImage={setZoomImage}
            />
          </div>
        </div>
      </main>

      {/* DIALOG: Saved Presets Manager */}
      <ImagePresetsDialog
        isOpen={isPresetListOpen}
        onOpenChange={setIsPresetListOpen}
        presets={presets}
        isLoading={isLoadingPresets}
        onActivatePreset={(id) => activateMutation.mutate(id)}
        isActivating={activateMutation.isPending}
        onLoadPreset={loadPresetIntoStudio}
        onDeletePreset={(id) => deleteMutation.mutate(id)}
      />

      {/* MODAL: Fullscreen Image Zoom */}
      <ImageZoomModal zoomImage={zoomImage} onClose={() => setZoomImage(null)} />
    </div>
  );
}

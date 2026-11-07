"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { WorkspaceShell } from "@/components/layout";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NativeSelect,
  Textarea,
  WorkspaceChip,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import type { ImagePreset, StudioAnalysisResult } from "@/types";
import { ImageZoomModal } from "./_components/ImageZoomModal";
import { SAMPLE_SCENES } from "./_components/constants";

type StudioStep = "design" | "sample" | "test";
type TestImage = { url: string; prompt: string };

interface ReferenceImageItem {
  url: string;
  file_path: string;
  filename?: string;
}

const stepOptions: { id: StudioStep; label: string }[] = [
  { id: "design", label: "Rancang" },
  { id: "sample", label: "Buat contoh" },
  { id: "test", label: "Uji prompt" },
];

const DEFAULT_SAMPLE_PROMPT =
  "Sebuah adegan sederhana yang memperlihatkan tekstur, garis, dan palet warna gaya ini";

function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
    >
      {message}
    </p>
  );
}

function PresetCard({
  preset,
  onEdit,
  onActivate,
  onDelete,
  isActivating,
}: {
  preset: ImagePreset;
  onEdit: (preset: ImagePreset) => void;
  onActivate: (id: string) => void;
  onDelete: (preset: ImagePreset) => void;
  isActivating: boolean;
}) {
  const palette = preset.style_attributes?.palette?.slice(0, 5) ?? [];

  return (
    <article className="overflow-hidden rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] shadow-[0_10px_30px_rgba(50,43,30,0.04)]">
      <div className="relative aspect-[16/9] overflow-hidden bg-[#171717]">
        {preset.preview_image_url ? (
          <img
            src={preset.preview_image_url}
            alt={`Pratinjau ${preset.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_50%_115%,#c45b3a_0%,#aeb39c_22%,#e9e4d7_23%,#e9e4d7_24%,#171717_25%)]">
            <div className="rounded-full border border-white/20 bg-black/35 p-4 text-white/70">
              <ImageIcon className="h-7 w-7" aria-hidden="true" />
            </div>
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {preset.category && preset.category !== "custom" && (
            <Badge variant="workspace" className="capitalize">
              {preset.category}
            </Badge>
          )}
          {preset.is_active && <Badge variant="workspace-success">Aktif di storyboard</Badge>}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#26251F]">{preset.name}</h2>
            <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-5 text-[#77766D]">
              {preset.description || preset.master_prompt}
            </p>
          </div>
          {preset.is_builtin && <Badge variant="workspace-accent">Bawaan</Badge>}
        </div>

        {palette.length > 0 && (
          <div
            className="mt-3 flex items-center gap-1.5"
            role="img"
            aria-label={`Palet warna: ${palette.join(", ")}`}
          >
            {palette.map((color, index) => {
              const hex = color.match(/#[\da-f]{6}/i)?.[0] ?? "#D8D2C4";
              return (
                <span
                  key={`${color}-${index}`}
                  className="h-2 flex-1 rounded-full"
                  style={{ backgroundColor: hex }}
                  title={color}
                />
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E1D7] pt-3">
          <Button size="sm" variant="workspace-secondary" onClick={() => onEdit(preset)}>
            Buka di Studio
          </Button>
          {!preset.is_active && (
            <Button
              size="sm"
              variant="workspace-primary"
              onClick={() => onActivate(preset.id)}
              disabled={isActivating}
            >
              Aktifkan
            </Button>
          )}
          {!preset.is_builtin && (
            <Button
              size="icon"
              variant="workspace-quiet"
              className="ml-auto text-rose-700 hover:bg-rose-50"
              aria-label={`Hapus preset ${preset.name}`}
              onClick={() => onDelete(preset)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ImageStudioPage() {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"collection" | "studio">("collection");
  const [step, setStep] = useState<StudioStep>("design");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [analyzedInputKey, setAnalyzedInputKey] = useState<string | null>(null);
  const [userText, setUserText] = useState("");
  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([]);
  const [presetName, setPresetName] = useState("");
  const [category, setCategory] = useState("custom");
  const [description, setDescription] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [styleAttributes, setStyleAttributes] = useState<
    StudioAnalysisResult["style_attributes"] | null
  >(null);
  const [representativePrompt, setRepresentativePrompt] = useState(DEFAULT_SAMPLE_PROMPT);
  const [representativeImageUrl, setRepresentativeImageUrl] = useState("");
  const [scenePrompt, setScenePrompt] = useState("");
  const [testImages, setTestImages] = useState<TestImage[]>([]);
  const [selectedTestImage, setSelectedTestImage] = useState<TestImage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ImagePreset | null>(null);
  const [zoomImage, setZoomImage] = useState<{ url: string; title: string } | null>(null);

  const presetsQuery = useQuery({
    queryKey: ["image-presets"],
    queryFn: api.getImagePresets,
  });
  const presets = presetsQuery.data ?? [];
  const activePreset = presets.find((preset) => preset.is_active);
  const currentStepIndex = stepOptions.findIndex((option) => option.id === step);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      return api.uploadReferenceImages(files);
    },
    onSuccess: (uploaded) => {
      setReferenceImages((prev) => [...prev, ...uploaded]);
      setRepresentativeImageUrl("");
      showToast(`${uploaded.length} gambar referensi berhasil diunggah.`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengunggah gambar referensi.", "error");
    },
  });

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setRepresentativeImageUrl("");
  };

  const currentAnalysisKey = JSON.stringify([
    userText.trim(),
    referenceImages.map((img) => img.url).sort(),
  ]);
  const canAnalyze = Boolean(userText.trim().length > 0 || referenceImages.length > 0);
  const hasCurrentAnalysis = Boolean(masterPrompt && analyzedInputKey === currentAnalysisKey);
  const canSave = Boolean(presetName.trim() && masterPrompt.trim() && hasCurrentAnalysis);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      api.analyzeStylePreset({
        user_text: userText.trim(),
        preset_type: "style",
        reference_image_urls: referenceImages.map((img) => img.url),
        reference_image_paths: referenceImages.map((img) => img.file_path).filter(Boolean),
        reference_image_url: referenceImages[0]?.url,
        reference_image_path: referenceImages[0]?.file_path,
      }),
    onSuccess: (result) => {
      setPresetName(result.name);
      setCategory(result.category);
      setDescription(result.description);
      setMasterPrompt(result.master_prompt);
      setNegativePrompt(result.negative_prompt);
      setStyleAttributes(result.style_attributes);
      setAnalyzedInputKey(currentAnalysisKey);
      setStep("sample");
      showToast("Rancangan preset berhasil disusun dari sumber art utama.", "success");
    },
  });

  const representativeMutation = useMutation({
    mutationFn: () =>
      api.testGeneratePresetImage({
        master_prompt: masterPrompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        scene_prompt: representativePrompt.trim(),
        aspect_ratio: "16:9",
      }),
    onSuccess: (result) => {
      setRepresentativeImageUrl(result.image_url);
      setSelectedTestImage(null);
      showToast("Gambar contoh berhasil dibuat.", "success");
    },
  });

  const testMutation = useMutation({
    mutationFn: () =>
      api.testGeneratePresetImage({
        master_prompt: masterPrompt.trim(),
        negative_prompt: negativePrompt.trim() || undefined,
        scene_prompt: scenePrompt.trim(),
        aspect_ratio: "16:9",
      }),
    onSuccess: (result) => {
      const image = { url: result.image_url, prompt: result.prompt_used };
      setTestImages((previous) => [image, ...previous]);
      setSelectedTestImage(image);
      showToast("Hasil uji prompt siap.", "success");
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.createImagePreset({
        id: editingPresetId ?? undefined,
        name: presetName.trim(),
        category,
        preset_type: "style",
        description: description.trim(),
        master_prompt: masterPrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        reference_image_url: referenceImages[0]?.url || null,
        preview_image_url: representativeImageUrl || null,
        user_text_input: userText.trim(),
        style_attributes: {
          ...(styleAttributes ?? {}),
          reference_image_urls: referenceImages.map((img) => img.url),
        },
        is_active: false,
      }),
    onSuccess: (saved) => {
      setEditingPresetId(saved.id);
      void queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      setView("collection");
      showToast(
        saved.is_active
          ? `“${saved.name}” tersimpan. Preset ini sudah aktif di storyboard.`
          : `“${saved.name}” tersimpan. Aktifkan dari koleksi jika ingin memakainya di storyboard.`,
        "success"
      );
    },
  });

  const activateMutation = useMutation({
    mutationFn: api.activateImagePreset,
    onSuccess: (preset) => {
      void queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      showToast(`“${preset.name}” aktif untuk storyboard.`, "success");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteImagePreset,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      setDeleteTarget(null);
      showToast("Preset dihapus.", "success");
    },
  });

  const resetDraft = () => {
    setEditingPresetId(null);
    setAnalyzedInputKey(null);
    setUserText("");
    setReferenceImages([]);
    setPresetName("");
    setCategory("custom");
    setDescription("");
    setMasterPrompt("");
    setNegativePrompt("");
    setStyleAttributes(null);
    setRepresentativePrompt(DEFAULT_SAMPLE_PROMPT);
    setRepresentativeImageUrl("");
    setScenePrompt("");
    setTestImages([]);
    setSelectedTestImage(null);
    setStep("design");
    analyzeMutation.reset();
    uploadMutation.reset();
    representativeMutation.reset();
    testMutation.reset();
    saveMutation.reset();
  };

  const createPreset = () => {
    resetDraft();
    setView("studio");
  };

  const editPreset = (preset: ImagePreset) => {
    setEditingPresetId(preset.id);
    setUserText(preset.user_text_input ?? "");
    const rawUrls = preset.style_attributes?.reference_image_urls;
    const refUrls: string[] = Array.isArray(rawUrls)
      ? (rawUrls as string[])
      : preset.reference_image_url
        ? [preset.reference_image_url]
        : [];
    setReferenceImages(refUrls.map((url) => ({ url, file_path: "" })));
    setPresetName(preset.name);
    setCategory(preset.category);
    setDescription(preset.description ?? "");
    setMasterPrompt(preset.master_prompt);
    setNegativePrompt(preset.negative_prompt ?? "");
    setStyleAttributes(preset.style_attributes ?? null);
    setRepresentativePrompt(DEFAULT_SAMPLE_PROMPT);
    setRepresentativeImageUrl(preset.preview_image_url ?? "");
    setAnalyzedInputKey(JSON.stringify([(preset.user_text_input ?? "").trim(), refUrls.sort()]));
    setScenePrompt("");
    setTestImages([]);
    setSelectedTestImage(null);
    setStep("design");
    analyzeMutation.reset();
    representativeMutation.reset();
    testMutation.reset();
    saveMutation.reset();
    setView("studio");
  };

  const errorMessage = (error: Error | null) => error?.message;

  return (
    <WorkspaceShell activePage="image-studio">
      <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-[#DCD6C8] pb-6 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#8A7768]">
              Visual development · Preset workshop
            </p>
            <h1 className="font-serif text-4xl tracking-tight text-[#26251F] sm:text-5xl">
              Art Studio
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#77766D]">
              Definisikan gaya visual dari teks atau referensi gambar, terjemahkan menjadi Master Prompt, lalu uji dengan adegan cerita.
            </p>
          </div>
          {view === "collection" ? (
            <Button variant="workspace-primary" onClick={createPreset} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Buat preset
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="workspace-secondary" onClick={() => setView("collection")}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Koleksi
              </Button>
              <Button
                variant="workspace-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!canSave || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                Simpan preset
              </Button>
            </div>
          )}
        </header>

        {view === "collection" ? (
          <section aria-labelledby="collection-title">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="collection-title" className="text-xl font-semibold text-[#26251F]">
                  Koleksi preset
                </h2>
                <p className="mt-1 text-sm text-[#77766D]">
                  Gaya yang aktif dipakai saat membuat ilustrasi storyboard.
                </p>
              </div>
              {activePreset && (
                <Badge variant="workspace-success">Aktif · {activePreset.name}</Badge>
              )}
            </div>
            {presetsQuery.isLoading ? (
              <div className="rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] py-16 text-center text-sm text-[#77766D]">
                <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" aria-hidden="true" />
                Memuat koleksi preset…
              </div>
            ) : presetsQuery.isError ? (
              <div className="rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6">
                <InlineError
                  message={`Koleksi preset tidak dapat dimuat: ${errorMessage(presetsQuery.error)}`}
                />
                <Button
                  className="mt-3"
                  variant="workspace-secondary"
                  onClick={() => void presetsQuery.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            ) : presets.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#CEC6B6] bg-[#FBFAF7] px-5 py-16 text-center">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#F2E8DC] text-[#A9472C]">
                  <Palette className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-[#26251F]">Mulai dari satu ide visual</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#77766D]">
                  Jelaskan gaya visual dengan kata-kata, tambahkan referensi gambar bila ada,
                  lalu lihat bagaimana AI menerjemahkannya.
                </p>
                <Button variant="workspace-primary" onClick={createPreset} className="mt-5">
                  Buat preset pertama
                </Button>
              </div>
            ) : (
              <>
                {(activateMutation.error || deleteMutation.error) && (
                  <div className="mb-4">
                    <InlineError
                      message={
                        errorMessage(activateMutation.error) ?? errorMessage(deleteMutation.error)
                      }
                    />
                  </div>
                )}
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {presets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      onEdit={editPreset}
                      onActivate={(id) => activateMutation.mutate(id)}
                      onDelete={setDeleteTarget}
                      isActivating={activateMutation.isPending}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="mx-auto max-w-5xl">
            <nav aria-label="Langkah membuat preset" className="mb-7 grid grid-cols-3">
              {stepOptions.map((option, index) => {
                const isCurrent = option.id === step;
                const isComplete = index < currentStepIndex;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => index <= currentStepIndex && setStep(option.id)}
                    disabled={index > currentStepIndex}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`border-b-2 px-2 pb-3 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] ${
                      isCurrent
                        ? "border-[#C45B3A] text-[#A9472C]"
                        : isComplete
                          ? "border-[#A7B09A] text-[#5D6C54]"
                          : "border-[#E5E1D7] text-[#99958A]"
                    }`}
                  >
                    <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full border border-current text-xs">
                      {isComplete ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
                    </span>
                    {option.label}
                  </button>
                );
              })}
            </nav>

            {step === "design" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 sm:p-7">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A7768]">
                    Rancang preset
                  </p>
                  <h2 className="mt-2 font-serif text-2xl text-[#26251F]">
                    Visual Art Direction
                  </h2>
                  <p className="mt-1 text-sm text-[#77766D]">
                    Definisikan gaya visual dari ide tertulis, gambar referensi, atau kombinasi keduanya.
                    AI akan menerjemahkan sumber art utama ini menjadi Master Prompt yang kohesif.
                  </p>

                  <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
                    {/* Left Column: Visual Description */}
                    <div>
                      <label
                        htmlFor="art-concept"
                        className="mb-2 block text-sm font-medium text-[#4B4941]"
                      >
                        Ceritakan ide visual{" "}
                        <span className="font-normal text-[#858176]">· opsional jika ada gambar</span>
                      </label>
                      <Textarea
                        id="art-concept"
                        rows={7}
                        value={userText}
                        onChange={(event) => {
                          setUserText(event.target.value);
                          setRepresentativeImageUrl("");
                        }}
                        placeholder="Contoh: ilustrasi doodle stickman berkepala bulat botak di atas kertas parchment kuno, tinta hitam ekspresif, dan sapuan cat air hangat sepia..."
                        className="resize-y bg-[#FFFEFA] text-sm"
                      />
                      <p className="mt-2 text-xs leading-5 text-[#858176]">
                        {referenceImages.length > 0
                          ? `${referenceImages.length} gambar referensi dan deskripsi akan dianalisis bersama.`
                          : "Tulis deskripsi gaya, unggah gambar referensi di sebelah kanan, atau gunakan keduanya."}
                      </p>
                    </div>

                    {/* Right Column: Multiple Reference Images */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#4B4941]">
                          Gambar referensi{" "}
                          <span className="font-normal text-[#858176]">· opsional jika ada teks</span>
                        </span>
                        {referenceImages.length > 0 && (
                          <Button
                            type="button"
                            variant="workspace-quiet"
                            size="workspace-sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadMutation.isPending}
                            className="gap-1 text-xs"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Tambah gambar
                          </Button>
                        )}
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-label="Pilih gambar referensi"
                        onChange={(event) => {
                          const files = event.target.files ? Array.from(event.target.files) : [];
                          if (files.length > 0) {
                            uploadMutation.mutate(files);
                          }
                          event.currentTarget.value = "";
                        }}
                      />

                      {referenceImages.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadMutation.isPending}
                          className="flex aspect-[16/10] w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#CFC5B3] bg-[#FFFEFA] px-4 text-center transition hover:border-[#C45B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A]"
                        >
                          {uploadMutation.isPending ? (
                            <Loader2
                              className="mb-3 h-6 w-6 animate-spin text-[#A9472C]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Upload className="mb-3 h-6 w-6 text-[#A9472C]" aria-hidden="true" />
                          )}
                          <span className="text-xs font-semibold text-[#4B4941]">
                            {uploadMutation.isPending
                              ? "Mengunggah gambar…"
                              : "Unggah satu atau beberapa gambar referensi"}
                          </span>
                          <span className="mt-1 text-xs text-[#858176]">
                            Pilih multiple file PNG, JPG, atau WebP
                          </span>
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-60 overflow-y-auto rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] p-2">
                            {referenceImages.map((img, idx) => (
                              <div
                                key={`${img.url}-${idx}`}
                                className="group relative aspect-square overflow-hidden rounded-lg border border-[#E5E1D7] bg-[#171717]"
                              >
                                <img
                                  src={img.url}
                                  alt={`Referensi ${idx + 1}`}
                                  className="h-full w-full object-cover transition duration-150 group-hover:scale-105"
                                />
                                <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/45 opacity-0 transition group-hover:opacity-100">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setZoomImage({
                                        url: img.url,
                                        title: `Gambar Referensi ${idx + 1}`,
                                      })
                                    }
                                    className="rounded-full bg-white/85 p-1.5 text-zinc-900 shadow hover:bg-white"
                                    title="Perbesar"
                                    aria-label={`Perbesar referensi ${idx + 1}`}
                                  >
                                    <ImageIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeReferenceImage(idx)}
                                    className="rounded-full bg-rose-600/90 p-1.5 text-white shadow hover:bg-rose-700"
                                    title="Hapus gambar ini"
                                    aria-label={`Hapus referensi ${idx + 1}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadMutation.isPending}
                              className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-[#CFC5B3] bg-zinc-50 text-center transition hover:border-[#C45B3A] hover:bg-zinc-100"
                            >
                              {uploadMutation.isPending ? (
                                <Loader2 className="h-5 w-5 animate-spin text-[#A9472C]" />
                              ) : (
                                <Plus className="h-5 w-5 text-muted-foreground" />
                              )}
                              <span className="mt-1 text-[11px] font-medium text-muted-foreground">
                                Tambah
                              </span>
                            </button>
                          </div>
                          <div className="flex items-center justify-between px-1 text-xs text-[#77766D]">
                            <span>{referenceImages.length} gambar referensi siap</span>
                            <button
                              type="button"
                              onClick={() => {
                                setReferenceImages([]);
                                setRepresentativeImageUrl("");
                              }}
                              className="text-rose-600 hover:underline"
                            >
                              Hapus semua
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <InlineError message={errorMessage(uploadMutation.error)} />

                  <div className="mt-6 flex flex-col justify-between gap-3 border-t border-[#E5E1D7] pt-5 sm:flex-row sm:items-center">
                    <p className="max-w-lg text-xs leading-5 text-[#858176]">
                      AI akan menyusun arahan visual Master Prompt yang dapat Anda sunting sebelum membuat gambar contoh.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      {hasCurrentAnalysis && (
                        <Button variant="workspace-secondary" onClick={() => setStep("sample")}>
                          Lanjutkan rancangan
                          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="workspace-primary"
                        disabled={
                          !canAnalyze || analyzeMutation.isPending || uploadMutation.isPending
                        }
                        onClick={() => analyzeMutation.mutate()}
                      >
                        {analyzeMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {masterPrompt ? "Analisis ulang" : "Susun preset"}
                      </Button>
                    </div>
                  </div>
                  <InlineError message={errorMessage(analyzeMutation.error)} />
                </section>
              </div>
            )}

            {step === "sample" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A7768]">
                        Hasil rancangan AI
                      </p>
                      <h2 className="mt-2 font-serif text-2xl text-[#26251F]">
                        Rapikan arahan visual
                      </h2>
                      <p className="mt-1 text-sm text-[#77766D]">
                        Master prompt ini menjadi arahan gaya visual untuk setiap gambar storyboard yang dibuat.
                      </p>
                    </div>
                    <Button variant="workspace-quiet" onClick={() => setStep("design")}>
                      <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                      Ubah sumber art
                    </Button>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="preset-name"
                        className="mb-1.5 block text-xs font-medium text-[#5E5C54]"
                      >
                        Nama preset
                      </label>
                      <Input
                        id="preset-name"
                        value={presetName}
                        onChange={(event) => setPresetName(event.target.value)}
                        placeholder="Nama yang mudah dikenali"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="preset-category"
                        className="mb-1.5 block text-xs font-medium text-[#5E5C54]"
                      >
                        Kategori
                      </label>
                      <NativeSelect
                        id="preset-category"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                      >
                        <option value="custom">Custom</option>
                        <option value="doodle">Doodle</option>
                        <option value="watercolor">Watercolor</option>
                        <option value="vintage">Vintage</option>
                        <option value="comic">Comic</option>
                        <option value="anime">Anime</option>
                        <option value="cinematic">Cinematic</option>
                        <option value="3d">3D / Claymation</option>
                      </NativeSelect>
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="preset-description"
                        className="mb-1.5 block text-xs font-medium text-[#5E5C54]"
                      >
                        Ringkasan
                      </label>
                      <Input
                        id="preset-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Jelaskan ciri khas preset ini"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="master-prompt"
                        className="mb-1.5 block text-xs font-medium text-[#5E5C54]"
                      >
                        Master Prompt (Arahan Visual Utama)
                      </label>
                      <Textarea
                        id="master-prompt"
                        rows={6}
                        value={masterPrompt}
                        onChange={(event) => {
                          setMasterPrompt(event.target.value);
                          setRepresentativeImageUrl("");
                        }}
                        className="font-mono text-xs leading-5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="negative-prompt"
                        className="mb-1.5 block text-xs font-medium text-[#5E5C54]"
                      >
                        Hal yang dihindari{" "}
                        <span className="font-normal text-[#858176]">· opsional</span>
                      </label>
                      <Textarea
                        id="negative-prompt"
                        rows={2}
                        value={negativePrompt}
                        onChange={(event) => {
                          setNegativePrompt(event.target.value);
                          setRepresentativeImageUrl("");
                        }}
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  {styleAttributes && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[#E5E1D7] pt-4">
                      {styleAttributes.medium && (
                        <Badge variant="workspace-accent">{styleAttributes.medium}</Badge>
                      )}
                      {styleAttributes.character_style && (
                        <Badge variant="workspace">{styleAttributes.character_style}</Badge>
                      )}
                      {styleAttributes.palette?.map((color, index) => (
                        <Badge key={`${color}-${index}`} variant="workspace">
                          {color}
                        </Badge>
                      ))}
                    </div>
                  )}
                </section>

                <section className="grid gap-5 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 sm:p-7 lg:grid-cols-[0.8fr_1.2fr]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A7768]">
                      Gambar contoh preset · 16:9
                    </p>
                    <h2 className="mt-2 font-serif text-2xl text-[#26251F]">
                      Lihat seperti apa hasilnya
                    </h2>
                    <label
                      htmlFor="representative-prompt"
                      className="mb-1.5 mt-5 block text-xs font-medium text-[#5E5C54]"
                    >
                      Arahan adegan contoh
                    </label>
                    <Textarea
                      id="representative-prompt"
                      rows={4}
                      value={representativePrompt}
                      onChange={(event) => {
                        setRepresentativePrompt(event.target.value);
                        setRepresentativeImageUrl("");
                      }}
                      className="text-sm"
                    />
                    <p className="mt-2 text-xs leading-5 text-[#858176]">
                      Pilih adegan sederhana yang memperlihatkan bahasa visual preset.
                    </p>
                    <Button
                      className="mt-4 w-full"
                      variant="workspace-primary"
                      disabled={
                        !masterPrompt.trim() ||
                        !representativePrompt.trim() ||
                        representativeMutation.isPending
                      }
                      onClick={() => representativeMutation.mutate()}
                    >
                      {representativeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      {representativeImageUrl ? "Buat ulang contoh" : "Buat gambar contoh"}
                    </Button>
                    <InlineError message={errorMessage(representativeMutation.error)} />
                    <p className="mt-3 text-xs text-[#858176]">
                      Gambar ini menjadi sampul preset setelah disimpan. Anda tetap bisa menyimpan tanpa gambar.
                    </p>
                  </div>
                  <div className="workspace-image-canvas relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-[#333]">
                    {representativeMutation.isPending ? (
                      <div className="text-center text-sm text-white/70">
                        <Loader2
                          className="mx-auto mb-3 h-7 w-7 animate-spin text-[#D78162]"
                          aria-hidden="true"
                        />
                        Sedang membuat gambar contoh…
                      </div>
                    ) : representativeImageUrl ? (
                      <button
                        type="button"
                        aria-label="Perbesar gambar contoh preset"
                        className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                        onClick={() =>
                          setZoomImage({
                            url: representativeImageUrl,
                            title: "Gambar contoh preset",
                          })
                        }
                      >
                        <img
                          src={representativeImageUrl}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ) : (
                      <div className="max-w-xs px-5 text-center text-sm leading-6 text-white/55">
                        <ImageIcon
                          className="mx-auto mb-3 h-8 w-8 text-[#D78162]"
                          aria-hidden="true"
                        />
                        Buat gambar contoh untuk melihat bagaimana arahan visual diterjemahkan.
                      </div>
                    )}
                  </div>
                </section>

                <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
                  <Button variant="workspace-secondary" onClick={() => setStep("design")}>
                    Kembali ke rancangan
                  </Button>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="workspace-secondary"
                      disabled={!canSave || saveMutation.isPending}
                      onClick={() => saveMutation.mutate()}
                    >
                      Simpan tanpa mengaktifkan
                    </Button>
                    <Button
                      variant="workspace-primary"
                      disabled={!canSave}
                      onClick={() => setStep("test")}
                    >
                      Lanjut uji prompt
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <InlineError message={errorMessage(saveMutation.error)} />
              </div>
            )}

            {step === "test" && (
              <div className="space-y-5">
                <section className="rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8A7768]">
                        Uji konsistensi · {presetName || "Preset Baru"}
                      </p>
                      <h2 className="mt-2 font-serif text-2xl text-[#26251F]">
                        Coba pada adegan cerita berbeda
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[#77766D]">
                        Hasil uji hanya tersimpan selama sesi ini dan tidak mengganti gambar sampul preset.
                      </p>
                    </div>
                    <Badge variant="workspace">16:9 · storyboard</Badge>
                  </div>
                  <label
                    htmlFor="scene-test-prompt"
                    className="mb-1.5 mt-5 block text-xs font-medium text-[#5E5C54]"
                  >
                    Apa yang ingin digambarkan?
                  </label>
                  <Textarea
                    id="scene-test-prompt"
                    rows={3}
                    value={scenePrompt}
                    onChange={(event) => setScenePrompt(event.target.value)}
                    placeholder="Tuliskan adegan yang ingin Anda coba…"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SAMPLE_SCENES.slice(0, 4).map((scene) => (
                      <WorkspaceChip key={scene} onClick={() => setScenePrompt(scene)}>
                        {scene.length > 46 ? `${scene.slice(0, 46)}…` : scene}
                      </WorkspaceChip>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E1D7] pt-4">
                    <p className="text-xs text-[#858176]">
                      Gunakan adegan yang berbeda untuk menilai penerapan gaya secara menyeluruh.
                    </p>
                    <Button
                      variant="workspace-primary"
                      disabled={
                        !masterPrompt.trim() || !scenePrompt.trim() || testMutation.isPending
                      }
                      onClick={() => testMutation.mutate()}
                    >
                      {testMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                      )}
                      Hasilkan gambar uji
                    </Button>
                  </div>
                  <InlineError message={errorMessage(testMutation.error)} />
                </section>

                <section className="grid gap-5 lg:grid-cols-[1fr_240px]">
                  <div className="workspace-image-canvas relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-[#333]">
                    {testMutation.isPending ? (
                      <div className="text-center text-sm text-white/70">
                        <Loader2
                          className="mx-auto mb-3 h-7 w-7 animate-spin text-[#D78162]"
                          aria-hidden="true"
                        />
                        Membuat variasi adegan…
                      </div>
                    ) : selectedTestImage ? (
                      <button
                        type="button"
                        aria-label="Perbesar hasil uji prompt"
                        className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
                        onClick={() =>
                          setZoomImage({ url: selectedTestImage.url, title: "Hasil uji prompt" })
                        }
                      >
                        <img
                          src={selectedTestImage.url}
                          alt=""
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ) : representativeImageUrl ? (
                      <div className="text-center text-sm text-white/70">
                        <img
                          src={representativeImageUrl}
                          alt="Sampul preset"
                          className="mx-auto mb-3 max-h-40 max-w-full object-contain opacity-70"
                        />
                        Gambar contoh preset · jalankan prompt untuk menguji adegan
                      </div>
                    ) : (
                      <p className="px-5 text-center text-sm text-white/55">
                        Hasil uji akan muncul di sini. Anda bisa membuatnya nanti dan menyimpan preset sekarang.
                      </p>
                    )}
                  </div>
                  <aside className="rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#77766D]">
                      Riwayat sesi
                    </h3>
                    {testImages.length === 0 ? (
                      <p className="mt-3 text-xs leading-5 text-[#858176]">
                        Belum ada gambar uji di sesi ini.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {testImages.map((image, index) => (
                          <button
                            key={`${image.url}-${index}`}
                            type="button"
                            onClick={() => setSelectedTestImage(image)}
                            aria-pressed={selectedTestImage?.url === image.url}
                            className={`w-full overflow-hidden rounded-lg border text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C45B3A] ${
                              selectedTestImage?.url === image.url
                                ? "border-[#C45B3A] ring-1 ring-[#C45B3A]"
                                : "border-[#E5E1D7]"
                            }`}
                          >
                            <img
                              src={image.url}
                              alt={`Uji ${index + 1}: ${image.prompt}`}
                              className="aspect-video w-full object-cover"
                            />
                            <span className="block truncate px-2 py-1.5 text-xs text-[#5E5C54]">
                              {image.prompt}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </aside>
                </section>

                <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
                  <Button variant="workspace-secondary" onClick={() => setStep("sample")}>
                    <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                    Kembali ke contoh
                  </Button>
                  <Button
                    variant="workspace-primary"
                    disabled={!canSave || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Simpan preset
                  </Button>
                </div>
                <InlineError message={errorMessage(saveMutation.error)} />
              </div>
            )}
          </section>
        )}
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="workspace-dialog">
          <DialogHeader>
            <DialogTitle>Hapus preset ini?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” akan dihapus dari koleksi. Tindakan ini tidak dapat dibatalkan.
              {deleteTarget?.is_active &&
                " Preset Doodle Ilustrasi akan digunakan kembali jika preset aktif dihapus."}
            </DialogDescription>
          </DialogHeader>
          <InlineError message={errorMessage(deleteMutation.error)} />
          <DialogFooter>
            <Button variant="workspace-secondary" onClick={() => setDeleteTarget(null)}>
              Batal
            </Button>
            <Button
              variant="workspace-destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Hapus preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageZoomModal zoomImage={zoomImage} onClose={() => setZoomImage(null)} />
    </WorkspaceShell>
  );
}

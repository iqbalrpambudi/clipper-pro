"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image as ImageIcon,
  Sparkles,
  Loader2,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Maximize2,
  X,
  Edit3,
  Palette,
  Users,
  MapPin,
  Compass,
  Eye,
  Code,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Project,
  StoryboardItem,
  SentenceSegment,
  StoryboardCharacter,
  StoryboardCharacterVariant,
  StoryboardLocation,
} from "@/types";
import { Button, Textarea } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";

function renderTokenizedPrompt(promptText: string) {
  if (!promptText) return null;
  const parts = promptText.split(/(\[[^\]]+\])/g);
  return (
    <span>
      {parts.map((part, pIdx) => {
        if (!part.startsWith("[") || !part.endsWith("]")) {
          return <span key={pIdx}>{part}</span>;
        }
        const inner = part.slice(1, -1).trim();
        const lower = inner.toLowerCase();

        if (lower.startsWith("preset:") || lower === "preset style" || lower === "style") {
          return (
            <span
              key={pIdx}
              className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-[#F7EFE0] text-[#8A6A2F] border border-[#E8D9BC] font-mono text-[10px] font-semibold align-baseline"
              title="Gaya Gambar Preset AI"
            >
              <Sparkles className="w-2.5 h-2.5 text-[#A9803C] shrink-0" />
              {part}
            </span>
          );
        }

        if (lower.startsWith("char:") || lower.startsWith("karakter:")) {
          return (
            <span
              key={pIdx}
              className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD] font-mono text-[10px] font-semibold align-baseline"
              title="Karakter & Varian Wujud"
            >
              <Users className="w-2.5 h-2.5 text-[#C45B3A] shrink-0" />
              {part}
            </span>
          );
        }

        if (lower.startsWith("loc:") || lower.startsWith("lokasi:")) {
          return (
            <span
              key={pIdx}
              className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-[#EAF0F5] text-[#41627F] border border-[#CFDDE9] font-mono text-[10px] font-semibold align-baseline"
              title="Latar Tempat Kejadian"
            >
              <MapPin className="w-2.5 h-2.5 text-[#5A7E9C] shrink-0" />
              {part}
            </span>
          );
        }

        if (lower === "era" || lower.startsWith("era:") || lower.startsWith("world:")) {
          return (
            <span
              key={pIdx}
              className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.2 rounded bg-[#F1EEE6] text-[#5E5C54] border border-[#E5E1D7] font-mono text-[10px] font-semibold align-baseline"
              title="Setting Era Waktu & Atmosfer"
            >
              <Compass className="w-2.5 h-2.5 text-[#858176] shrink-0" />
              {part}
            </span>
          );
        }

        return (
          <span
            key={pIdx}
            className="inline-flex items-center mx-0.5 rounded border border-[#E5E1D7] bg-[#F3F0E8] px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[#4D4A42] align-baseline"
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}

interface StoryboardImagesTabProps {
  project: Project;
}

export function StoryboardImagesTab({ project }: StoryboardImagesTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const narration = project.narration;
  const segments: SentenceSegment[] = narration?.segments || [];
  const items: StoryboardItem[] = project.storyboard_items || [];

  // Active modal image preview
  const [previewImage, setPreviewImage] = useState<StoryboardItem | null>(null);

  // Per-item editable prompt state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState<string>("");

  // Generating single item tracker
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null);

  // Toggle viewing raw variable prompt vs compiled AI visual prompt
  const [showCompiledPrompt, setShowCompiledPrompt] = useState<boolean>(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const handleCopyPrompt = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
    showToast("Prompt visual berhasil disalin ke clipboard!", "info");
  };

  // Image Presets query
  const { data: presets = [] } = useQuery({
    queryKey: ["image-presets"],
    queryFn: api.getImagePresets,
  });

  const activePreset = presets.find((p) => p.is_active) || presets[0];

  const activatePresetMutation = useMutation({
    mutationFn: (id: string) => api.activateImagePreset(id),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["image-presets"] });
      showToast(`Preset visual diubah ke: ${p.name}`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengubah preset", "error");
    },
  });

  const batchGenerateMutation = useMutation({
    mutationFn: () => api.generateAllStoryboardImages(project.id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast(
        `Batch generation selesai! ${res.success_count} berhasil, ${res.fail_count} gagal.`,
        res.fail_count === 0 ? "success" : "info"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menjalankan batch generate gambar", "error");
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<StoryboardItem> }) =>
      api.updateStoryboardItem(project.id, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      setEditingItemId(null);
      showToast("Prompt ilustrasi berhasil diperbarui!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memperbarui item", "error");
    },
  });

  const handleGenerateSingle = async (item: StoryboardItem) => {
    setGeneratingItemId(item.id);
    try {
      // If currently editing this item, use and save the edited prompt immediately
      const promptToUse =
        editingItemId === item.id && editPromptText.trim() ? editPromptText.trim() : undefined;

      await api.generateSingleStoryboardImage(project.id, item.id, {
        prompt: promptToUse,
        preset_id: activePreset?.id,
      });

      if (editingItemId === item.id) {
        setEditingItemId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gambar ilustrasi berhasil diperbarui!", "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Gagal membuat gambar", "error");
    } finally {
      setGeneratingItemId(null);
    }
  };

  const handleSavePrompt = (itemId: string) => {
    if (!editPromptText.trim()) return;
    updateItemMutation.mutate({
      id: itemId,
      data: { image_prompt: editPromptText.trim() },
    });
  };

  const handleUpdateMotion = (
    itemId: string,
    motion: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static"
  ) => {
    updateItemMutation.mutate({
      id: itemId,
      data: { motion_effect: motion },
    });
  };

  // Stats calculation
  const readyCount = items.filter((it) => it.status === "ready" && it.image_url).length;
  const pendingCount = items.filter((it) => it.status === "pending" || !it.image_url).length;
  const failedCount = items.filter((it) => it.status === "failed").length;

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Step Header - Menempel pada Header Stepper */}
      <StoryboardTabHeader
        icon={ImageIcon}
        title="Galeri Ilustrasi AI Storyboard"
        badge="Langkah 3 • Ilustrasi"
        secondaryBadge="16:9 Landscape"
        description="Generate gambar AI untuk setiap adegan naskah secara batch atau satu per satu dengan konsistensi visual."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_voice")}
              variant="workspace-secondary"
              className="h-9 text-xs"
            >
              Kembali ke Suara
            </Button>

            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_timeline")}
              variant="workspace-primary"
              className="h-9 gap-1.5 text-xs"
            >
              <span>Lanjut ke Timeline & Motion</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </>
        }
      />

      {/* Main Tab Content */}
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-5 sm:px-6">
        {/* Preset Indicator Ribbon */}
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5 text-xs sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[#C45B3A]" />
            <span className="text-[#5E5C54]">Preset Gaya Visual:</span>
            <select
              value={activePreset?.id || ""}
              onChange={(e) => activatePresetMutation.mutate(e.target.value)}
              disabled={activatePresetMutation.isPending}
              className="rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-xs font-semibold text-[#26251F] focus:border-[#C45B3A]"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.is_active ? "(Aktif)" : ""}
                </option>
              ))}
            </select>
            <span className="hidden font-mono text-[10px] text-[#77766D] md:inline">
              • 16:9 Landscape Storyboard
            </span>
          </div>

          <Link
            href="/image-studio"
            className="text-[#C45B3A] hover:text-[#A9472C] flex items-center gap-1 font-medium text-xs hover:underline"
          >
            <span>Sesuaikan Gaya di AI Visual Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Continuity Bible Locked Bar (Characters & Variants, Locations, Era) */}
        {((project.characters && project.characters.length > 0) ||
          (project.locations && project.locations.length > 0) ||
          project.world_setting?.era) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex shrink-0 items-center gap-1.5 font-semibold text-[#A9472C]">
                <Users className="w-4 h-4 text-[#C45B3A]" />
                <span>Continuity Bible:</span>
              </div>

              {/* Characters */}
              {project.characters?.map((char: StoryboardCharacter, i: number) => {
                const charId = char.id || char.name?.toLowerCase().replace(/\s+/g, "");
                const hasVariants = Array.isArray(char.variants) && char.variants.length > 0;
                return (
                  <span
                    key={`char-${i}`}
                    className="flex items-center gap-1.5 rounded-lg border border-[#E9C9BD] bg-[#FBFAF7] px-2.5 py-1 font-mono text-[11px] text-[#4D4A42]"
                    title={char.visual_anchor}
                  >
                    <span className="font-bold text-[#A9472C]">👤 {char.name}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-[#F8EEEA] text-[#A9472C]">
                      [char:{charId}]
                    </span>
                    {hasVariants && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#F7EFE0] text-[#8A6A2F]">
                        +{char.variants?.length} varian
                      </span>
                    )}
                  </span>
                );
              })}

              {/* Locations */}
              {project.locations?.map((loc: StoryboardLocation, i: number) => {
                const locId = loc.id || loc.name?.toLowerCase().replace(/\s+/g, "");
                return (
                  <span
                    key={`loc-${i}`}
                    className="flex items-center gap-1.5 rounded-lg border border-[#CFDDE9] bg-[#FBFAF7] px-2.5 py-1 font-mono text-[11px] text-[#4D4A42]"
                    title={loc.environment_anchor}
                  >
                    <span className="font-bold text-[#41627F]">🗺️ {loc.name}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-[#EAF0F5] text-[#41627F]">
                      [loc:{locId}]
                    </span>
                  </span>
                );
              })}

              {/* World Setting Era */}
              {project.world_setting?.era && (
                <span
                  className="flex items-center gap-1.5 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] px-2.5 py-1 font-mono text-[11px] text-[#4D4A42]"
                  title={project.world_setting.atmosphere}
                >
                  <span className="font-bold text-[#5E5C54]">⏳ {project.world_setting.era}</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-[#F1EEE6] text-[#5E5C54]">
                    [era]
                  </span>
                </span>
              )}
            </div>

            <span className="text-[11px] italic text-[#77766D]">
              Deskripsi visual disinkronkan otomatis saat generate
            </span>
          </div>
        )}

        {/* Top Banner Action Bar */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 shadow-sm md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#26251F]">
                  {items.length} Total Ilustrasi Sketsa
                </div>
                <p className="text-xs text-[#77766D]">
                  Format 16:9 Landscape • Gaya Hand-drawn Ink & Paper
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-[#E5E1D7] pl-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-[#F1EEE6] text-[#5E5C54] border border-[#E5E1D7] font-mono">
                ✓ {readyCount} Siap
              </span>
              {pendingCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#F7EFE0] text-[#8A6A2F] border border-[#E8D9BC] font-mono">
                  ⏳ {pendingCount} Belum
                </span>
              )}
              {failedCount > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#FBEAE6] text-[#A9472C] border border-[#E9C9BD] font-mono">
                  ⚠ {failedCount} Gagal
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Prompt Mode Toggle (Clean Variables vs Full Compiled Prompt) */}
            <div className="flex items-center gap-1 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-1">
              <button
                type="button"
                onClick={() => setShowCompiledPrompt(false)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  !showCompiledPrompt
                    ? "bg-[#C45B3A] text-white shadow-sm"
                    : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>Prompt Variabel</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCompiledPrompt(true)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  showCompiledPrompt
                    ? "bg-[#C45B3A] text-white shadow-sm"
                    : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Lengkap (Compiled)</span>
              </button>
            </div>

            <Button
              onClick={() => batchGenerateMutation.mutate()}
              disabled={batchGenerateMutation.isPending || items.length === 0}
              variant="workspace-primary"
              className="shrink-0 gap-2 py-2.5 text-xs"
            >
              {batchGenerateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    Menghasilkan Semua Gambar ({readyCount}/{items.length})...
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {pendingCount > 0
                      ? `Generate Semua Gambar (${pendingCount} Slot)`
                      : "Regenerate Semua Gambar"}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Main Items Gallery Grouped by Segment */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D2CDBF] bg-[#FBFAF7] p-12 text-center">
            <ImageIcon className="w-12 h-12 text-[#858176] mx-auto mb-3" />
            <h3 className="mb-1.5 text-base font-semibold text-[#26251F]">Belum Ada Slot Gambar</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              Buat naskah storyboard terlebih dahulu pada langkah pertama agar adegan dan prompt
              visual terbentuk.
            </p>
            <Button
              onClick={() => setActiveTab("storyboard_script")}
              variant="workspace-primary"
              size="sm"
            >
              Buka Tab Naskah
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 grid-flow-row-dense gap-5">
            {segments.map((seg: SentenceSegment, segIdx: number) => {
              const segItems = items.filter((it) => it.segment_id === seg.id);
              if (segItems.length === 0) return null;

              // Segments with multiple images span more columns so each image keeps a usable width
              const spanClass =
                segItems.length >= 3
                  ? "md:col-span-2 xl:col-span-3"
                  : segItems.length === 2
                    ? "md:col-span-2"
                    : "";
              const innerGridClass =
                segItems.length >= 3
                  ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                  : segItems.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1";

              return (
                <div
                  key={seg.id || segIdx}
                  className={`flex min-w-0 flex-col gap-3 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-4 shadow-sm ${spanClass}`}
                >
                  {/* Segment Header */}
                  <div className="flex min-w-0 items-center justify-between gap-2 border-b border-[#E5E1D7] pb-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="shrink-0 text-[10px] font-mono font-bold text-[#C45B3A] bg-[#F8EEEA] px-1.5 py-0.5 rounded border border-[#E9C9BD]">
                        #{segIdx + 1}
                      </span>
                      <h3
                        className="truncate text-xs font-semibold text-[#26251F]"
                        title={seg.chapter || `Babak ${segIdx + 1}`}
                      >
                        {seg.chapter || `Babak ${segIdx + 1}`}
                      </h3>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[#77766D]">
                      {segItems.length} Gambar
                    </span>
                  </div>

                  {/* Narration script line context */}
                  <div
                    className="line-clamp-3 rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2.5 font-sans text-[11px] leading-relaxed text-[#4D4A42]"
                    title={seg.text}
                  >
                    &ldquo;{seg.text}&rdquo;
                  </div>

                  {/* Grid of Images in this segment */}
                  <div className={`grid ${innerGridClass} gap-3 flex-1`}>
                    {segItems.map((item, imgIdx) => {
                      const isGeneratingThis = generatingItemId === item.id;
                      const isEditingThis = editingItemId === item.id;

                      return (
                        <div
                          key={item.id}
                          className="group flex flex-col justify-between overflow-hidden rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] transition hover:border-[#C45B3A]"
                        >
                          {/* Image Preview / Skeleton Area (16:9 Aspect) */}
                          <div className="relative flex aspect-video items-center justify-center overflow-hidden border-b border-[#E5E1D7] bg-[#F3F0E8]">
                            {isGeneratingThis ? (
                              <div className="flex flex-col items-center gap-2 p-4 text-center">
                                <Loader2 className="w-6 h-6 animate-spin text-[#C45B3A]" />
                                <span className="text-[11px] text-[#A9472C] font-mono">
                                  Menggambar sketsa AI...
                                </span>
                              </div>
                            ) : item.status === "ready" && item.image_url ? (
                              <>
                                <img
                                  key={item.image_url}
                                  src={item.image_url}
                                  alt={item.image_prompt}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                                {/* Overlay zoom button */}
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(item)}
                                  className="absolute right-2 top-2 rounded-lg bg-[#26251F]/75 p-1.5 text-white opacity-0 shadow-lg transition hover:bg-[#26251F] group-hover:opacity-100"
                                  title="Lihat Layar Penuh"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : item.status === "failed" ? (
                              <div className="flex flex-col items-center gap-1.5 p-4 text-center">
                                <AlertCircle className="w-6 h-6 text-[#C45B3A]" />
                                <span className="text-[11px] text-[#A9472C] font-mono">
                                  Gagal generate gambar
                                </span>
                                <span className="line-clamp-2 text-[10px] text-[#77766D]">
                                  {item.error_message || "Kesalahan API"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 p-4 text-center">
                                <ImageIcon className="w-8 h-8 text-[#77766D]" />
                                <span className="font-mono text-[11px] text-[#77766D]">
                                  Belum Digenerate
                                </span>
                              </div>
                            )}

                            {/* Order & Motion Badge */}
                            <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                              <span className="rounded bg-[#26251F]/80 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white backdrop-blur-xs">
                                Gambar #{imgIdx + 1}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#C45B3A]/80 text-white border border-[#C45B3A]/30 backdrop-blur-xs">
                                {item.motion_effect}
                              </span>
                            </div>
                          </div>

                          {/* Card Body: Prompt & Controls */}
                          <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                            {isEditingThis ? (
                              <div className="space-y-2">
                                <Textarea
                                  rows={3}
                                  value={editPromptText}
                                  onChange={(e) => setEditPromptText(e.target.value)}
                                  className="border-[#E5E1D7] bg-[#FFFEFA] font-mono text-[11px] leading-normal text-[#26251F] focus:border-[#C45B3A]"
                                  placeholder="Tulis visual prompt..."
                                />

                                {/* Quick Token Insertion Chips */}
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <span className="font-mono text-[9px] text-[#77766D]">
                                    Sisipkan:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditPromptText((prev) => `${prev} [preset:style]`)
                                    }
                                    className="px-1.5 py-0.5 rounded bg-[#F7EFE0] hover:bg-[#F0E4CE] text-[#8A6A2F] border border-[#E8D9BC] text-[9px] font-mono transition"
                                  >
                                    + [preset:style]
                                  </button>
                                  {project.characters?.map((c: StoryboardCharacter, ci: number) => {
                                    const cId = c.id || c.name?.toLowerCase().replace(/\s+/g, "");
                                    return (
                                      <React.Fragment key={`tok-c-${ci}`}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setEditPromptText((prev) => `${prev} [char:${cId}]`)
                                          }
                                          className="px-1.5 py-0.5 rounded bg-[#F8EEEA] hover:bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD] text-[9px] font-mono transition"
                                        >
                                          + [char:{cId}]
                                        </button>
                                        {c.variants?.map(
                                          (v: StoryboardCharacterVariant, vi: number) => (
                                            <button
                                              key={`tok-v-${ci}-${vi}`}
                                              type="button"
                                              onClick={() =>
                                                setEditPromptText(
                                                  (prev) => `${prev} [char:${cId}:${v.variant_id}]`
                                                )
                                              }
                                              className="px-1.5 py-0.5 rounded bg-[#F8EEEA] hover:bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD] text-[9px] font-mono transition"
                                            >
                                              + [char:{cId}:{v.variant_id}]
                                            </button>
                                          )
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                  {project.locations?.map((l: StoryboardLocation, li: number) => {
                                    const lId = l.id || l.name?.toLowerCase().replace(/\s+/g, "");
                                    return (
                                      <button
                                        key={`tok-l-${li}`}
                                        type="button"
                                        onClick={() =>
                                          setEditPromptText((prev) => `${prev} [loc:${lId}]`)
                                        }
                                        className="px-1.5 py-0.5 rounded bg-[#EAF0F5] hover:bg-[#DCE7F0] text-[#41627F] border border-[#CFDDE9] text-[9px] font-mono transition"
                                      >
                                        + [loc:{lId}]
                                      </button>
                                    );
                                  })}
                                  {project.world_setting?.era && (
                                    <button
                                      type="button"
                                      onClick={() => setEditPromptText((prev) => `${prev} [era]`)}
                                      className="px-1.5 py-0.5 rounded bg-[#F1EEE6] hover:bg-[#EAE6DD] text-[#5E5C54] border border-[#E5E1D7] text-[9px] font-mono transition"
                                    >
                                      + [era]
                                    </button>
                                  )}
                                </div>

                                <div className="flex justify-end gap-1.5 pt-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingItemId(null)}
                                    className="h-6 px-2 text-[10px] text-[#77766D]"
                                  >
                                    Batal
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => handleSavePrompt(item.id)}
                                    className="h-6 bg-[#C45B3A] px-2 text-[10px] text-white hover:bg-[#A9472C]"
                                  >
                                    Simpan
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[10px] font-semibold uppercase text-[#77766D]">
                                      Visual Prompt
                                    </span>
                                    {showCompiledPrompt && (
                                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD] font-mono font-medium">
                                        Compiled
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyPrompt(
                                          item.id,
                                          showCompiledPrompt
                                            ? item.resolved_prompt || item.image_prompt
                                            : item.image_prompt
                                        )
                                      }
                                      className="flex items-center gap-1 p-0.5 font-mono text-[10px] text-[#77766D] transition hover:text-[#26251F]"
                                      title="Salin Prompt"
                                    >
                                      {copiedPromptId === item.id ? (
                                        <Check className="w-2.5 h-2.5 text-[#456A4E]" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingItemId(item.id);
                                        setEditPromptText(item.image_prompt);
                                      }}
                                      className="text-[10px] text-[#C45B3A] hover:text-[#A9472C] flex items-center gap-1 font-mono"
                                    >
                                      <Edit3 className="w-2.5 h-2.5" />
                                      <span>Edit</span>
                                    </button>
                                  </div>
                                </div>

                                {showCompiledPrompt ? (
                                  <p className="line-clamp-4 rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2 font-mono text-[11px] leading-relaxed text-[#4D4A42]">
                                    {item.resolved_prompt || item.image_prompt}
                                  </p>
                                ) : (
                                  <div className="line-clamp-3 font-mono text-[11px] leading-relaxed text-[#4D4A42]">
                                    {renderTokenizedPrompt(item.image_prompt)}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Voiceover Narration sentence */}
                            {item.script_text && (
                              <div className="rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] px-2.5 py-1.5">
                                <span className="text-[9px] uppercase font-semibold text-[#C45B3A] font-mono block mb-0.5">
                                  Narasi Suara:
                                </span>
                                <p className="line-clamp-2 font-sans text-[11px] italic leading-relaxed text-[#4D4A42]">
                                  &ldquo;{item.script_text}&rdquo;
                                </p>
                              </div>
                            )}

                            {/* Motion Effect Selector & Action Button */}
                            <div className="space-y-2 border-t border-[#E5E1D7] pt-2">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-medium text-[#77766D]">
                                  Ken Burns Motion:
                                </span>
                                <select
                                  value={item.motion_effect || "zoom_in"}
                                  onChange={(e) =>
                                    handleUpdateMotion(
                                      item.id,
                                      e.target.value as StoryboardItem["motion_effect"]
                                    )
                                  }
                                  className="rounded border border-[#E5E1D7] bg-[#FFFEFA] px-1.5 py-0.5 text-[10px] text-[#26251F] focus:outline-none"
                                >
                                  <option value="zoom_in">Slow Zoom In</option>
                                  <option value="zoom_out">Slow Zoom Out</option>
                                  <option value="pan_left">Pan Left</option>
                                  <option value="pan_right">Pan Right</option>
                                  <option value="static">Statis (Diam)</option>
                                </select>
                              </div>

                              <Button
                                type="button"
                                onClick={() => handleGenerateSingle(item)}
                                disabled={isGeneratingThis || batchGenerateMutation.isPending}
                                variant={item.status === "ready" ? "outline" : "workspace-primary"}
                                className={`w-full text-xs h-8 gap-1.5 ${
                                  item.status === "ready"
                                    ? "border-[#E5E1D7] hover:border-[#C45B3A] hover:text-[#A9472C]"
                                    : "bg-[#C45B3A] hover:bg-[#A9472C] text-[#FFFAF6]"
                                }`}
                              >
                                {isGeneratingThis ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Menggambar...</span>
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="w-3 h-3" />
                                    <span>
                                      {item.status === "ready"
                                        ? "Regenerate Gambar Ini"
                                        : "Generate Gambar Ini"}
                                    </span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Fullscreen Preview Modal */}
        {previewImage && (
          <div
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-[#26251F]/70 p-6 backdrop-blur-sm"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-4xl cursor-default overflow-hidden rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[#E5E1D7] p-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-[#C45B3A]" />
                  <span className="font-mono text-xs font-semibold text-[#26251F]">
                    Preview Ilustrasi 16:9 • Efek {previewImage.motion_effect}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="rounded-lg bg-[#F3F0E8] p-1.5 text-[#5E5C54] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative flex aspect-video items-center justify-center bg-[#F1EEE6]">
                <img
                  key={previewImage.image_url}
                  src={previewImage.image_url!}
                  alt={previewImage.image_prompt}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="space-y-1 border-t border-[#E5E1D7] bg-[#F3F0E8] p-4">
                <span className="block font-mono text-[10px] uppercase text-[#77766D]">
                  Prompt Ilustrasi:
                </span>
                <p className="font-mono text-xs leading-relaxed text-[#4D4A42]">
                  {previewImage.image_prompt}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

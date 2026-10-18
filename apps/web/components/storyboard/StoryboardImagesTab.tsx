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
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, StoryboardItem } from "@/types";
import { Button, Textarea, Badge } from "@/components/ui";

interface StoryboardImagesTabProps {
  project: Project & {
    narration?: any;
    storyboard_items?: StoryboardItem[];
  };
}

export function StoryboardImagesTab({ project }: StoryboardImagesTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast } = useStudioStore();

  const narration = project.narration;
  const segments: any[] = narration?.segments || [];
  const items: StoryboardItem[] = project.storyboard_items || [];

  // Active modal image preview
  const [previewImage, setPreviewImage] = useState<StoryboardItem | null>(null);

  // Per-item editable prompt state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState<string>("");

  // Generating single item tracker
  const [generatingItemId, setGeneratingItemId] = useState<string | null>(null);

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
    onError: (err: any) => {
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
    onError: (err: any) => {
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
    onError: (err: any) => {
      showToast(err.message || "Gagal memperbarui item", "error");
    },
  });

  const handleGenerateSingle = async (item: StoryboardItem) => {
    setGeneratingItemId(item.id);
    try {
      // If currently editing this item, use and save the edited prompt immediately
      const promptToUse =
        editingItemId === item.id && editPromptText.trim()
          ? editPromptText.trim()
          : undefined;

      await api.generateSingleStoryboardImage(project.id, item.id, {
        prompt: promptToUse,
        preset_id: activePreset?.id,
      });

      if (editingItemId === item.id) {
        setEditingItemId(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Gambar ilustrasi berhasil diperbarui!", "success");
    } catch (err: any) {
      showToast(err.message || "Gagal membuat gambar", "error");
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

  const handleUpdateMotion = (itemId: string, motion: "zoom_in" | "zoom_out" | "pan_left" | "pan_right" | "static") => {
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
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 3 dari 6
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Studio Ilustrasi AI Hand-drawn
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Galeri Gambar Ilustrasi Sketsa Storyboard
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Generate gambar AI untuk setiap adegan naskah secara batch atau satu per satu. Edit prompt visual bila ingin menyesuaikan komposisi gambar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("storyboard_voice")}
            className="border-[#2E2E2E] text-xs"
          >
            Kembali ke Suara
          </Button>

          <Button
            onClick={() => setActiveTab("storyboard_timeline")}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
          >
            <span>Lanjut ke Timeline & Motion</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Preset Indicator Ribbon */}
      <div className="p-3.5 rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/20 via-[#181818] to-[#181818] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-violet-400" />
          <span className="text-slate-400">Preset Gaya Visual:</span>
          <select
            value={activePreset?.id || ""}
            onChange={(e) => activatePresetMutation.mutate(e.target.value)}
            disabled={activatePresetMutation.isPending}
            className="px-2.5 py-1 rounded-lg bg-[#141414] border border-[#2E2E2E] text-white font-semibold text-xs focus:border-violet-500"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.is_active ? "(Aktif)" : ""}
              </option>
            ))}
          </select>
          <span className="text-slate-500 font-mono text-[10px] hidden md:inline">
            • 16:9 Landscape Storyboard
          </span>
        </div>

        <Link
          href="/image-studio"
          className="text-violet-400 hover:text-violet-300 flex items-center gap-1 font-medium text-xs hover:underline"
        >
          <span>Sesuaikan Gaya di AI Visual Studio</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Character Bible Locked Bar */}
      {project.characters && project.characters.length > 0 && (
        <div className="p-3 rounded-xl border border-violet-500/20 bg-violet-950/15 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-violet-300 font-semibold shrink-0">
              <Users className="w-4 h-4 text-violet-400" />
              <span>Karakter Terkunci:</span>
            </div>
            {project.characters.map((char: any, i: number) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg bg-black/40 border border-violet-500/30 text-[11px] text-slate-200 flex items-center gap-1.5 font-mono"
                title={char.visual_anchor}
              >
                <span className="font-bold text-violet-300">👤 {char.name}</span>
                {char.role && <span className="text-[10px] text-slate-400">({char.role})</span>}
                <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 rounded">✓ Terkunci</span>
              </span>
            ))}
          </div>
          <span className="text-[11px] text-slate-400 italic">
            Deskripsi pakaian & ciri visual disinkronkan ke seluruh adegan
          </span>
        </div>
      )}

      {/* Top Banner Action Bar */}
      <div className="p-5 rounded-2xl border border-[#2E2E2E] bg-gradient-to-r from-[#181818] via-[#1C1824] to-[#181818] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">
                {items.length} Total Ilustrasi Sketsa
              </div>
              <p className="text-[11px] text-muted-foreground">
                Format 16:9 Landscape • Gaya Hand-drawn Ink & Paper
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-[#2E2E2E]">
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              ✓ {readyCount} Siap
            </span>
            {pendingCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                ⏳ {pendingCount} Belum
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                ⚠ {failedCount} Gagal
              </span>
            )}
          </div>
        </div>

        <Button
          onClick={() => batchGenerateMutation.mutate()}
          disabled={batchGenerateMutation.isPending || items.length === 0}
          className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-lg shadow-violet-500/20 gap-2 shrink-0 py-2.5"
        >
          {batchGenerateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Menghasilkan Semua Gambar ({readyCount}/{items.length})...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>{pendingCount > 0 ? `Generate Semua Gambar (${pendingCount} Slot)` : "Regenerate Semua Gambar"}</span>
            </>
          )}
        </Button>
      </div>

      {/* Main Items Gallery Grouped by Segment */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2E2E2E] bg-[#181818]/60 p-12 text-center">
          <ImageIcon className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1.5">Belum Ada Slot Gambar</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
            Buat naskah storyboard terlebih dahulu pada langkah pertama agar adegan dan prompt visual terbentuk.
          </p>
          <Button
            onClick={() => setActiveTab("storyboard_script")}
            variant="supabase"
            size="sm"
          >
            Buka Tab Naskah
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {segments.map((seg: any, segIdx: number) => {
            const segItems = items.filter((it) => it.segment_id === seg.id);
            if (segItems.length === 0) return null;

            return (
              <div
                key={seg.id || segIdx}
                className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-lg"
              >
                {/* Segment Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#2E2E2E] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
                      Segmen #{segIdx + 1}
                    </span>
                    <h3 className="text-sm font-bold text-white">
                      {seg.chapter || `Babak ${segIdx + 1}`}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {segItems.length} Ilustrasi Gambar
                  </span>
                </div>

                {/* Narration script line context */}
                <div className="p-3 rounded-xl bg-black/40 border border-[#262626] text-xs text-slate-200 leading-relaxed font-sans">
                  &ldquo;{seg.text}&rdquo;
                </div>

                {/* Grid of Images in this segment */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {segItems.map((item, imgIdx) => {
                    const isGeneratingThis = generatingItemId === item.id;
                    const isEditingThis = editingItemId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-[#2E2E2E] bg-[#141414] overflow-hidden flex flex-col justify-between hover:border-violet-500/30 transition group"
                      >
                        {/* Image Preview / Skeleton Area (16:9 Aspect) */}
                        <div className="relative aspect-video bg-[#0D0D0D] border-b border-[#2E2E2E] overflow-hidden flex items-center justify-center">
                          {isGeneratingThis ? (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                              <span className="text-[11px] text-violet-300 font-mono">
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
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black text-white opacity-0 group-hover:opacity-100 transition shadow-lg"
                                title="Lihat Layar Penuh"
                              >
                                <Maximize2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : item.status === "failed" ? (
                            <div className="flex flex-col items-center gap-1.5 p-4 text-center">
                              <AlertCircle className="w-6 h-6 text-rose-400" />
                              <span className="text-[11px] text-rose-300 font-mono">
                                Gagal generate gambar
                              </span>
                              <span className="text-[10px] text-slate-500 line-clamp-2">
                                {item.error_message || "Kesalahan API"}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 p-4 text-center">
                              <ImageIcon className="w-8 h-8 text-slate-600" />
                              <span className="text-[11px] text-slate-400 font-mono">
                                Belum Digenerate
                              </span>
                            </div>
                          )}

                          {/* Order & Motion Badge */}
                          <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/80 text-white font-bold backdrop-blur-xs">
                              Gambar #{imgIdx + 1}
                            </span>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-900/80 text-violet-200 border border-violet-500/30 backdrop-blur-xs">
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
                                className="text-[11px] bg-[#181818] border-violet-500/50 text-white leading-normal font-mono"
                              />
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingItemId(null)}
                                  className="text-[10px] h-6 px-2 text-slate-400"
                                >
                                  Batal
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSavePrompt(item.id)}
                                  className="text-[10px] h-6 px-2 bg-violet-600 hover:bg-violet-500 text-white"
                                >
                                  Simpan
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-semibold text-slate-500 font-mono">
                                  Visual Prompt
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditPromptText(item.image_prompt);
                                  }}
                                  className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-mono"
                                >
                                  <Edit3 className="w-2.5 h-2.5" />
                                  <span>Edit</span>
                                </button>
                              </div>
                              <p className="text-[11px] text-slate-300 font-mono leading-relaxed line-clamp-3">
                                {item.image_prompt}
                              </p>
                            </div>
                          )}

                          {/* Voiceover Narration sentence */}
                          {item.script_text && (
                            <div className="bg-black/40 px-2.5 py-1.5 rounded-lg border border-[#222]">
                              <span className="text-[9px] uppercase font-semibold text-violet-400 font-mono block mb-0.5">
                                Narasi Suara:
                              </span>
                              <p className="text-[11px] text-slate-200 font-sans italic line-clamp-2 leading-relaxed">
                                &ldquo;{item.script_text}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* Motion Effect Selector & Action Button */}
                          <div className="space-y-2 pt-2 border-t border-[#262626]">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400 font-medium">Ken Burns Motion:</span>
                              <select
                                value={item.motion_effect || "zoom_in"}
                                onChange={(e) => handleUpdateMotion(item.id, e.target.value as any)}
                                className="bg-[#181818] border border-[#2E2E2E] text-slate-200 text-[10px] rounded px-1.5 py-0.5 focus:outline-none"
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
                              variant={item.status === "ready" ? "outline" : "supabase"}
                              className={`w-full text-xs h-8 gap-1.5 ${
                                item.status === "ready"
                                  ? "border-[#2E2E2E] hover:border-violet-500 hover:text-violet-300"
                                  : "bg-violet-600 hover:bg-violet-500 text-white"
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
                                  <span>{item.status === "ready" ? "Regenerate Gambar Ini" : "Generate Gambar Ini"}</span>
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
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl w-full bg-[#181818] rounded-2xl border border-[#2E2E2E] overflow-hidden shadow-2xl cursor-default"
          >
            <div className="flex items-center justify-between p-4 border-b border-[#2E2E2E]">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-violet-400" />
                <span className="text-xs font-bold text-white font-mono">
                  Preview Ilustrasi 16:9 • Efek {previewImage.motion_effect}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-lg bg-surface hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-video bg-black flex items-center justify-center">
              <img
                key={previewImage.image_url}
                src={previewImage.image_url!}
                alt={previewImage.image_prompt}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="p-4 bg-[#141414] border-t border-[#2E2E2E] space-y-1">
              <span className="text-[10px] font-mono uppercase text-slate-500 block">
                Prompt Ilustrasi:
              </span>
              <p className="text-xs text-slate-200 font-mono leading-relaxed">
                {previewImage.image_prompt}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

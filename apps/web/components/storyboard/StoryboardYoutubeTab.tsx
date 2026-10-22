"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Youtube,
  Sparkles,
  Download,
  RefreshCw,
  FileText,
  CheckCircle2,
  Palette,
  Type,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Project,
  YouTubeMetadata,
  YouTubeThumbnailHistory,
  ThumbnailTextLayer,
  ThumbnailPreset,
} from "@/types";
import { Button } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";

import { convertLegacyOverlayToLayers, createDefaultTextLayer } from "./thumbnail/thumbnailPresets";
import { TextLayerInspector } from "./thumbnail/TextLayerInspector";
import { PresetManager } from "./thumbnail/PresetManager";
import { AiThumbnailGenerator } from "./thumbnail/AiThumbnailGenerator";
import { YoutubeMetadataForm } from "./thumbnail/YoutubeMetadataForm";
import type { ThumbnailCanvasRef } from "./thumbnail/ThumbnailKonvaCanvas";

// Load react-konva canvas with SSR disabled in Next.js
const ThumbnailKonvaCanvas = dynamic(() => import("./thumbnail/ThumbnailKonvaCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-[#E5E1D7] bg-[#F3F0E8] text-xs text-[#77766D]">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-[#E9C9BD] border-t-transparent rounded-full animate-spin" />
        <span>Memuat Canvas Thumbnail...</span>
      </div>
    </div>
  ),
});

interface StoryboardYoutubeTabProps {
  project: Project;
}

export function StoryboardYoutubeTab({ project }: StoryboardYoutubeTabProps) {
  const queryClient = useQueryClient();
  const { showToast, setActiveTab } = useStudioStore();
  const canvasRef = useRef<ThumbnailCanvasRef>(null);

  // Core metadata states
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [thumbnailPrompt, setThumbnailPrompt] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailHistory, setThumbnailHistory] = useState<YouTubeThumbnailHistory[]>([]);
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [thumbnailConcept, setThumbnailConcept] = useState("");

  // Multi-layer text states (react-konva)
  const [layers, setLayers] = useState<ThumbnailTextLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [customPresets, setCustomPresets] = useState<ThumbnailPreset[]>([]);

  // Navigation tabs in right settings panel
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "generator" | "layers" | "presets" | "metadata"
  >("generator");
  const [activeFormula, setActiveFormula] = useState<string>("comic_reaction");

  // Metadata generation options
  const ytLanguage = (project.narration?.language || project.language || "id").toLowerCase();
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

  // Story identity tracking for auto-clearing stale data
  const currentProjectId = project.id;
  const lastProjectIdRef = useRef<string>("");
  const layersInitializedRef = useRef<boolean>(false);

  // Sync initial metadata from project
  useEffect(() => {
    const meta: YouTubeMetadata = project.youtube_metadata || {};
    const projectChanged =
      lastProjectIdRef.current !== "" && lastProjectIdRef.current !== currentProjectId;
    const isMetaEmpty = !meta.title && !meta.description && (!meta.tags || meta.tags.length === 0);

    if (projectChanged || isMetaEmpty) {
      setTitle(meta.title || "");
      setDescription(meta.description || "");
      setTagsInput(meta.tags ? meta.tags.join(", ") : "");
      setThumbnailPrompt(meta.thumbnail_prompt || "");
      setThumbnailUrl(meta.thumbnail_url || null);
      setThumbnailHistory(meta.thumbnail_history || []);
      setTitleOptions(meta.title_options || []);
      setThumbnailConcept(meta.thumbnail_concept || "");
    } else {
      if (meta.title && !title) setTitle(meta.title);
      if (meta.description && !description) setDescription(meta.description);
      if (meta.tags && !tagsInput) setTagsInput(meta.tags.join(", "));
      if (meta.thumbnail_prompt && !thumbnailPrompt) setThumbnailPrompt(meta.thumbnail_prompt);
      if (meta.thumbnail_url && !thumbnailUrl) setThumbnailUrl(meta.thumbnail_url);
      if (meta.thumbnail_history && thumbnailHistory.length === 0)
        setThumbnailHistory(meta.thumbnail_history);
      if (meta.title_options && titleOptions.length === 0) setTitleOptions(meta.title_options);
      if (meta.thumbnail_concept && !thumbnailConcept) setThumbnailConcept(meta.thumbnail_concept);
    }

    // Text Editor Layers sync: ONLY on first load or when switching to a different project
    // NEVER overwrite layers if already initialized or edited by user
    if (!layersInitializedRef.current || projectChanged) {
      const initialLayers = convertLegacyOverlayToLayers(
        meta.thumbnail_overlay,
        project.name || "MISTERI BESAR"
      );
      setLayers(initialLayers);
      if (initialLayers.length > 0) {
        setSelectedLayerId(initialLayers[0].id);
      }
      layersInitializedRef.current = true;
    }
    lastProjectIdRef.current = currentProjectId;

    // Load custom presets from project or localStorage
    const savedProjectPresets = meta.thumbnail_overlay?.custom_presets || [];
    try {
      const localPresetsStr = localStorage.getItem("cliper_thumbnail_presets");
      const localPresets: ThumbnailPreset[] = localPresetsStr ? JSON.parse(localPresetsStr) : [];
      const mergedPresets = [...savedProjectPresets];
      localPresets.forEach((lp) => {
        if (!mergedPresets.some((p) => p.id === lp.id)) {
          mergedPresets.push(lp);
        }
      });
      setCustomPresets(mergedPresets);
    } catch {
      setCustomPresets(savedProjectPresets);
    }
  }, [project.id]);

  // Continuity Context for Character, Location & Era Consistency
  const characters = project.characters || [];
  const mainChar = characters[0];
  const mainCharToken = mainChar ? `[char:${mainChar.id}]` : "the main character";
  const mainCharName = mainChar?.name || project.name || "Protagonist";

  const locations = project.locations || [];
  const mainLoc = locations[0];
  const mainLocToken = mainLoc ? `[loc:${mainLoc.id}]` : "the iconic story location";

  const worldSetting = project.world_setting || {};
  const era = worldSetting.era || "";
  const eraStr = era ? `in the era of ${era}` : "";

  // Viral Formulas
  const VIRAL_FORMULAS = [
    {
      id: "comic_reaction",
      name: "🌟 Reaksi Emosional Tokoh Utama",
      shortDesc: `Close-up ekspresif tokoh ${mainCharName} di foreground + latar ${mainLoc?.name || "cerita"}`,
      hook1: mainCharName.toUpperCase().slice(0, 14),
      hook2: "KENAPA BUKAN DIA?!",
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground (one-third of frame), an intense, dramatic shot of ${mainCharToken} facing towards the viewer with an astonished, wide-eyed reaction. In the background, breathtaking panoramic setting of ${mainLocToken} ${eraStr}, golden sunrise, high visual contrast, leaving clear open negative space on the left side for bold text overlay. Rich vibrant colors, sharp cinematic lighting, [preset:style], no text in image.`,
    },
    {
      id: "peeking_pov",
      name: "🕵️ Mengintip Tegang & Misteri",
      shortDesc: `Tokoh ${mainCharName} cemas mengintip di tepi + atmosfer tegang masa ${era || "cerita"}`,
      hook1: "TERNYATA",
      hook2: "BUKAN DIA?!",
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right edge foreground, an intense dramatic close-up of ${mainCharToken} looking with shocked, suspenseful eyes towards the viewer. In the background, a moody cinematic setting of ${mainLocToken} ${eraStr} under dramatic stormy atmosphere. High contrast, atmospheric cinematic lighting, deep tension, leaving clear open space on left side for typography, [preset:style], no text in image.`,
    },
    {
      id: "mystery_relic",
      name: "⚡ Benda Pusaka & Plot Twist",
      shortDesc: `Tokoh ${mainCharName} syok memegang benda kunci cerita + pancaran cahaya megah`,
      hook1: "MISTERI NYATA",
      hook2: "HILANG TOTAL?!",
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground, an intense dramatic shot of ${mainCharToken} reacting in utter disbelief, holding a glowing mysterious relic or key artifact. In the background, majestic colossal scenery of ${mainLocToken} ${eraStr} illuminated by dramatic golden rays of light breaking through thick clouds, leaving left third open for big bold text overlay, rich saturated colors, high contrast, [preset:style], no text in image.`,
    },
    {
      id: "contrast_vs",
      name: "💥 Fakta Mengejutkan & Skala Epik",
      shortDesc: `Tokoh ${mainCharName} menunjuk fenomena luar biasa + tipografi modern bersih`,
      hook1: "FAKTA GILA",
      hook2: "1000 TAHUN LALU?!",
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the foreground, an expressive dramatic shot of ${mainCharToken} gesturing with shock at an astonishing gigantic visual phenomenon in ${mainLocToken} ${eraStr}. Cinematic scale, striking color contrast, bright vibrant lighting with dark atmospheric edges, wide open clean negative space on the upper portion for typography, modern cinematic documentary look, [preset:style], no text in image.`,
    },
  ];

  // Select formula handler
  const handleSelectFormula = (formulaId: string) => {
    const f = VIRAL_FORMULAS.find((item) => item.id === formulaId);
    if (!f) return;

    setActiveFormula(formulaId);
    const topic = project.name || "Cerita";
    const styleRef = activePreset?.master_prompt
      ? `in ${activePreset.name} visual style (${activePreset.master_prompt.slice(0, 100)})`
      : "vibrant cinematic illustration style";

    setThumbnailPrompt(f.getPrompt(topic, styleRef));
    showToast(`Formula '${f.name}' diterapkan ke prompt visual thumbnail!`, "info");
  };

  // Re-sync prompt with latest story continuity (characters, locations, title)
  const handleResyncWithCurrentStory = () => {
    const f = VIRAL_FORMULAS.find((item) => item.id === activeFormula) || VIRAL_FORMULAS[0];
    const topic = project.name || "Cerita";
    const styleRef = activePreset?.master_prompt
      ? `in ${activePreset.name} visual style (${activePreset.master_prompt.slice(0, 100)})`
      : "vibrant cinematic illustration style";

    setThumbnailPrompt(f.getPrompt(topic, styleRef));
    showToast(
      `Prompt thumbnail disinkronkan ke tokoh (${mainCharName}) dan latar (${mainLoc?.name || "cerita"}) terbaru!`,
      "info"
    );
  };

  // Generate Metadata Mutation
  const generateMetadataMutation = useMutation({
    mutationFn: () =>
      api.generateYouTubeMetadata(project.id, {
        focus_angle: focusAngle,
        custom_prompt: customPrompt.trim() || undefined,
        language: ytLanguage,
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

      // Do NOT mutate layers or text editor state here. User edits and presets are preserved!
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Metadata YouTube (Judul, Deskripsi & Tag) berhasil digenerate!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengenerate metadata YouTube", "error");
    },
  });

  // Generate Thumbnail Mutation
  const generateThumbnailMutation = useMutation({
    mutationFn: () =>
      api.generateYouTubeThumbnail(project.id, {
        prompt: thumbnailPrompt.trim() || project.name,
      }),
    onSuccess: (data) => {
      if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
      if (data.history) setThumbnailHistory(data.history);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Thumbnail 16:9 viral berhasil dibuat!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mengenerate gambar thumbnail", "error");
    },
  });

  // Save All Changes Mutation
  const saveMetadataMutation = useMutation({
    mutationFn: () => {
      const tagsArray = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const legacyFirstLayer = layers[0];
      const legacySecondLayer = layers[1];

      return api.updateYouTubeMetadata(project.id, {
        title: title.trim(),
        title_options: titleOptions,
        description: description.trim(),
        tags: tagsArray,
        thumbnail_prompt: thumbnailPrompt.trim(),
        thumbnail_concept: thumbnailConcept.trim(),
        thumbnail_url: thumbnailUrl || undefined,
        thumbnail_history: thumbnailHistory,
        thumbnail_hook_line1: legacyFirstLayer?.text || "",
        thumbnail_hook_line2: legacySecondLayer?.text || "",
        thumbnail_overlay: {
          enabled: true,
          line1: legacyFirstLayer?.text || "",
          line2: legacySecondLayer?.text || "",
          color1: legacyFirstLayer?.fill || "#FFFFFF",
          color2: legacySecondLayer?.fill || "#FFE600",
          position: "custom",
          font_family: legacyFirstLayer?.fontFamily || "Anton",
          font_size: legacyFirstLayer?.fontSize || 56,
          rotation: legacyFirstLayer?.rotation || 0,
          layers: layers,
          custom_presets: customPresets,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Perubahan thumbnail & metadata YouTube berhasil disimpan!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan metadata", "error");
    },
  });

  // Layer Operations
  const handleUpdateLayer = (layerId: string, updates: Partial<ThumbnailTextLayer>) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, ...updates } : l)));
  };

  const handleAddLayer = (newLayer: ThumbnailTextLayer) => {
    setLayers((prev) => [...prev, newLayer]);
    setSelectedLayerId(newLayer.id);
  };

  const handleDeleteLayer = (layerId: string) => {
    setLayers((prev) => {
      const filtered = prev.filter((l) => l.id !== layerId);
      if (selectedLayerId === layerId) {
        setSelectedLayerId(filtered[0]?.id || null);
      }
      return filtered;
    });
    showToast("Layer teks dihapus.", "info");
  };

  const handleDuplicateLayer = (layerId: string) => {
    const target = layers.find((l) => l.id === layerId);
    if (!target) return;
    const duplicated: ThumbnailTextLayer = {
      ...target,
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: target.x + 20,
      y: target.y + 30,
      text: `${target.text} (COPY)`,
    };
    setLayers((prev) => [...prev, duplicated]);
    setSelectedLayerId(duplicated.id);
    showToast("Layer berhasil diduplikat.", "info");
  };

  const handleReorderLayer = (layerId: string, direction: "up" | "down") => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === layerId);
      if (index === -1) return prev;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
  };

  // Preset Handlers
  const handleApplyPreset = (preset: ThumbnailPreset) => {
    setLayers((prev) => {
      const updated = [...prev];
      preset.layers.forEach((pLayer, idx) => {
        if (updated[idx]) {
          updated[idx] = {
            ...updated[idx],
            ...pLayer,
            // Keep existing wording and current placement
            text: updated[idx].text,
            x: updated[idx].x,
            y: updated[idx].y,
          };
        } else {
          updated.push(
            createDefaultTextLayer({
              ...pLayer,
              text: pLayer.text || `HOOK BARIS ${idx + 1}`,
              x: 80,
              y: 120 + idx * 80,
            })
          );
        }
      });
      return updated;
    });
    showToast(`Preset '${preset.name}' diterapkan!`, "info");
  };

  const handleSaveCustomPreset = (preset: ThumbnailPreset) => {
    const updated = [preset, ...customPresets.filter((p) => p.id !== preset.id)];
    setCustomPresets(updated);
    try {
      localStorage.setItem("cliper_thumbnail_presets", JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const handleDeleteCustomPreset = (presetId: string) => {
    const updated = customPresets.filter((p) => p.id !== presetId);
    setCustomPresets(updated);
    try {
      localStorage.setItem("cliper_thumbnail_presets", JSON.stringify(updated));
    } catch {
      // Ignore
    }
    showToast("Preset kustom dihapus.", "info");
  };

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

  // High-Res Download (Export Full HD PNG directly from react-konva)
  const handleDownloadHd = async () => {
    if (!canvasRef.current) return;
    try {
      showToast("Menyiapkan thumbnail Full HD (1920x1080)...", "info");
      const uri = await canvasRef.current.exportHd();
      if (!uri) throw new Error("Gagal mengekspor canvas");

      const link = document.createElement("a");
      link.download = `youtube_thumbnail_${project.id || Date.now()}.png`;
      link.href = uri;
      link.click();
      showToast("Thumbnail Full HD siap di-upload ke YouTube!", "info");
    } catch {
      // Fallback
      if (thumbnailUrl) {
        const link = document.createElement("a");
        link.download = `thumbnail_${project.id}.png`;
        link.href = thumbnailUrl;
        link.click();
      }
    }
  };

  // Video duration string for YouTube badge
  const audio = project.audio || project.audio_track;
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
    <div className="flex-1 flex flex-col w-full animate-in fade-in duration-300">
      {/* Top Header */}
      <StoryboardTabHeader
        icon={Youtube}
        iconColor="text-[#A9472C]"
        iconBg="bg-[#F8EEEA] border-[#E9C9BD]"
        title="YouTube Packaging & Thumbnail Studio"
        badge="Langkah 6 • Packaging"
        badgeColor="bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
        secondaryBadge="Kanvas Bebas"
        description="Editor teks thumbnail kanvas grafis bebas ala Photoshop dan generator paket metadata YouTube."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => setActiveTab("storyboard_render")}
              variant="workspace-secondary"
              className="h-9 text-xs"
            >
              Kembali ke Render
            </Button>

            <Button
              size="sm"
              onClick={() => saveMetadataMutation.mutate()}
              disabled={isSaving}
              variant="workspace-primary"
              className="h-9 text-xs"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              <span>Simpan Perubahan</span>
            </Button>
          </>
        }
      />

      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-5 pb-16 sm:px-6">
        {/* Main 2-Column Split: STICKY CANVAS (Left 6 Cols) + CLEAN CONTROLS (Right 6 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Sticky React-Konva Canvas & Real-time Mockup (6 Cols) */}
          <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-4 self-start">
            <div className="space-y-3.5 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-4 shadow-sm">
              {/* Canvas Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
                    <Youtube className="w-4 h-4 fill-current" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-[#26251F]">
                      Interactive Thumbnail Canvas
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Drag teks langsung di gambar • Putar & ubah ukuran via handle seleksi
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleDownloadHd}
                    className="flex h-8 items-center gap-1 rounded-lg bg-[#C45B3A] px-2.5 text-[11px] font-semibold text-white shadow-sm hover:bg-[#A9472C]"
                    title="Unduh Full HD 1920x1080 langsung dari canvas"
                  >
                    <Download className="w-3 h-3" />
                    <span>Unduh PNG HD</span>
                  </Button>
                </div>
              </div>

              {/* YouTube Card & Interactive Konva Canvas Container */}
              <div className="overflow-hidden rounded-xl border border-[#E5E1D7] bg-[#F1EEE6] shadow-lg transition-all">
                <div className="relative w-full aspect-video">
                  <ThumbnailKonvaCanvas
                    ref={canvasRef}
                    imageUrl={thumbnailUrl}
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={(id) => {
                      setSelectedLayerId(id);
                      if (id && activeSettingsTab !== "layers") {
                        setActiveSettingsTab("layers");
                      }
                    }}
                    onUpdateLayer={handleUpdateLayer}
                  />

                  {/* Duration Badge */}
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 text-white font-mono text-[10px] font-bold tracking-wider backdrop-blur-sm shadow-md z-10 pointer-events-none">
                    {formatBadgeDuration(durationSec)}
                  </div>
                </div>

                {/* YouTube Video Info Block Simulation */}
                <div className="flex items-start gap-2.5 border-t border-[#E5E1D7] bg-[#FBFAF7] p-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F8EEEA] to-[#F7EFE0] flex items-center justify-center font-bold text-[#A9472C] text-[11px] shrink-0 shadow-md">
                    C
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="line-clamp-2 text-xs font-semibold leading-snug text-[#26251F]">
                      {title || project.name || "Judul Video YouTube Belum Dibuat"}
                    </h4>
                    <p className="mt-0.5 text-[11px] text-[#77766D]">Cliper Pro Studio</p>
                    <p className="text-[10px] text-muted-foreground">
                      148K x ditonton • 2 jam yang lalu
                    </p>
                  </div>
                </div>
              </div>

              {/* Canvas Quick Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E1D7] pt-1 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => {
                      const newLayer = createDefaultTextLayer({
                        y: 120 + layers.length * 60,
                        text: `HOOK BARIS ${layers.length + 1}`,
                      });
                      handleAddLayer(newLayer);
                      setActiveSettingsTab("layers");
                    }}
                    variant="workspace-secondary"
                    className="h-8 text-[11px] font-semibold"
                  >
                    <Plus className="w-3 h-3 mr-1 text-[#8A6A2F]" />
                    <span>Tambah Teks</span>
                  </Button>

                  {selectedLayerId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteLayer(selectedLayerId)}
                      className="h-7 text-[11px] text-[#A9472C] hover:text-[#A9472C] hover:bg-[#F3E1D9]"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      <span>Hapus Layer</span>
                    </Button>
                  )}
                </div>

                <div className="text-[10px] text-muted-foreground font-mono">
                  {selectedLayerId
                    ? "🎯 Layer Terpilih Aktif"
                    : "💡 Klik teks di kanvas untuk mengedit"}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Clean Tabbed Settings (6 Cols) */}
          <div className="lg:col-span-6 space-y-4">
            <div className="space-y-4 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-4 shadow-sm">
              {/* Top Tab Switcher */}
              <div className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-1">
                <button
                  type="button"
                  onClick={() => setActiveSettingsTab("generator")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSettingsTab === "generator"
                      ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
                      : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Thumbnail Prompt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSettingsTab("layers")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSettingsTab === "layers"
                      ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
                      : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>Editor Teks & Layer</span>
                  <span className="w-4 h-4 rounded-full bg-[#E9C9BD] text-[10px] font-mono flex items-center justify-center text-[#A9472C] ml-0.5">
                    {layers.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSettingsTab("presets")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSettingsTab === "presets"
                      ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
                      : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                  }`}
                >
                  <Palette className="w-3.5 h-3.5" />
                  <span>Preset Style</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSettingsTab("metadata")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    activeSettingsTab === "metadata"
                      ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
                      : "text-[#77766D] hover:bg-[#EAE6DD] hover:text-[#26251F]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Metadata YouTube</span>
                </button>
              </div>

              {/* Tab Contents with Inner-scroll */}
              <div className="lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto pr-1">
                {activeSettingsTab === "generator" && (
                  <AiThumbnailGenerator
                    thumbnailPrompt={thumbnailPrompt}
                    setThumbnailPrompt={setThumbnailPrompt}
                    thumbnailUrl={thumbnailUrl}
                    setThumbnailUrl={setThumbnailUrl}
                    thumbnailHistory={thumbnailHistory}
                    isGenerating={isThumbnailGenerating}
                    onGenerateThumbnail={() => generateThumbnailMutation.mutate()}
                    formulas={VIRAL_FORMULAS}
                    activeFormula={activeFormula}
                    onSelectFormula={handleSelectFormula}
                    activePresetName={activePreset?.name}
                    mainCharName={mainCharName}
                    mainLocName={mainLoc?.name}
                    onResyncWithCurrentStory={handleResyncWithCurrentStory}
                    onInjectPresetStyle={() => {
                      if (!activePreset?.master_prompt) {
                        showToast("Belum ada preset aktif dengan master prompt.", "info");
                        return;
                      }
                      const addition = `, rendered in ${activePreset.name} style (${activePreset.master_prompt.trim()})`;
                      if (!thumbnailPrompt.includes(activePreset.name)) {
                        setThumbnailPrompt((prev) =>
                          prev ? `${prev.trim()}${addition}` : addition.replace(/^,\s*/, "")
                        );
                        showToast(`Gaya preset '${activePreset.name}' disisipkan.`, "info");
                      }
                    }}
                  />
                )}

                {activeSettingsTab === "layers" && (
                  <TextLayerInspector
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onUpdateLayer={handleUpdateLayer}
                    onAddLayer={handleAddLayer}
                    onDeleteLayer={handleDeleteLayer}
                    onDuplicateLayer={handleDuplicateLayer}
                    onReorderLayer={handleReorderLayer}
                  />
                )}

                {activeSettingsTab === "presets" && (
                  <PresetManager
                    currentLayers={layers}
                    customPresets={customPresets}
                    onApplyPreset={handleApplyPreset}
                    onSaveCustomPreset={handleSaveCustomPreset}
                    onDeleteCustomPreset={handleDeleteCustomPreset}
                    showToast={showToast}
                  />
                )}

                {activeSettingsTab === "metadata" && (
                  <YoutubeMetadataForm
                    title={title}
                    setTitle={setTitle}
                    titleOptions={titleOptions}
                    description={description}
                    setDescription={setDescription}
                    tagsInput={tagsInput}
                    setTagsInput={setTagsInput}
                    isGenerating={isMetadataGenerating}
                    onGenerateMetadata={() => generateMetadataMutation.mutate()}
                    focusAngle={focusAngle}
                    setFocusAngle={setFocusAngle}
                    customPrompt={customPrompt}
                    setCustomPrompt={setCustomPrompt}
                    onCopy={handleCopy}
                    copiedKey={copiedKey}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default StoryboardYoutubeTab;

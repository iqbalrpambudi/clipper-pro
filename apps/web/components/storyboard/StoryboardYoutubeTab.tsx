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
  StoryboardItem,
  YouTubeMetadata,
  YouTubeThumbnailHistory,
  ThumbnailTextLayer,
  ThumbnailPreset,
} from "@/types";
import { Button, Badge } from "@/components/ui";

import {
  convertLegacyOverlayToLayers,
  createDefaultTextLayer,
} from "./thumbnail/thumbnailPresets";
import { TextLayerInspector } from "./thumbnail/TextLayerInspector";
import { PresetManager } from "./thumbnail/PresetManager";
import { AiThumbnailGenerator } from "./thumbnail/AiThumbnailGenerator";
import { YoutubeMetadataForm } from "./thumbnail/YoutubeMetadataForm";
import type { ThumbnailCanvasRef } from "./thumbnail/ThumbnailKonvaCanvas";

// Load react-konva canvas with SSR disabled in Next.js
const ThumbnailKonvaCanvas = dynamic(
  () => import("./thumbnail/ThumbnailKonvaCanvas"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-video rounded-2xl bg-[#121212] border border-[#2A2A2A] flex items-center justify-center text-slate-500 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span>Memuat Canvas Thumbnail...</span>
        </div>
      </div>
    ),
  }
);

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
    const meta: YouTubeMetadata = (project as any).youtube_metadata || {};
    const projectChanged = lastProjectIdRef.current !== "" && lastProjectIdRef.current !== currentProjectId;
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
      if (meta.thumbnail_history && thumbnailHistory.length === 0) setThumbnailHistory(meta.thumbnail_history);
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
  const characters = (project as any).characters || [];
  const mainChar = characters[0];
  const mainCharToken = mainChar ? `[char:${mainChar.id}]` : "the main character";
  const mainCharName = mainChar?.name || (project.name || "Protagonist");

  const locations = (project as any).locations || [];
  const mainLoc = locations[0];
  const mainLocToken = mainLoc ? `[loc:${mainLoc.id}]` : "the iconic story location";

  const worldSetting = (project as any).world_setting || {};
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
    onError: (err: any) => {
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
    onError: (err: any) => {
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
    onError: (err: any) => {
      showToast(err.message || "Gagal menyimpan metadata", "error");
    },
  });

  // Layer Operations
  const handleUpdateLayer = (layerId: string, updates: Partial<ThumbnailTextLayer>) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, ...updates } : l))
    );
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
    <div className="space-y-5 animate-in fade-in duration-300 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-semibold flex items-center gap-1.5">
              <Youtube className="w-3.5 h-3.5 text-red-500 fill-current" />
              Langkah 6 dari 6
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Studio Thumbnail & Packaging YouTube
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            YouTube Video & Thumbnail Canvas Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Editor teks kanvas bebas ala Photoshop: atur teks layer, jenis font, outline, box highlight, rotasi, dan preset viral.
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
            {isSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            <span>Simpan Perubahan</span>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Split: STICKY CANVAS (Left 6 Cols) + CLEAN CONTROLS (Right 6 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Sticky React-Konva Canvas & Real-time Mockup (6 Cols) */}
        <div className="lg:col-span-6 space-y-4 lg:sticky lg:top-4 self-start">
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-4 space-y-3.5 shadow-xl">
            {/* Canvas Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <Youtube className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Interactive Thumbnail Canvas</h3>
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
                  className="bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold h-7 px-2.5 shadow-md shadow-red-600/20 flex items-center gap-1"
                  title="Unduh Full HD 1920x1080 langsung dari canvas"
                >
                  <Download className="w-3 h-3" />
                  <span>Unduh PNG HD</span>
                </Button>
              </div>
            </div>

            {/* YouTube Card & Interactive Konva Canvas Container */}
            <div className="rounded-xl overflow-hidden bg-black border border-[#262626] shadow-2xl transition-all">
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
              <div className="p-3 flex items-start gap-2.5 bg-[#0F0F0F] border-t border-[#202020]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center font-bold text-white text-[11px] shrink-0 shadow-md">
                  C
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                    {title || project.name || "Judul Video YouTube Belum Dibuat"}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cliper Pro Studio</p>
                  <p className="text-[10px] text-muted-foreground">
                    148K x ditonton • 2 jam yang lalu
                  </p>
                </div>
              </div>
            </div>

            {/* Canvas Quick Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-[#262626]">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const newLayer = createDefaultTextLayer({
                      y: 120 + layers.length * 60,
                      text: `HOOK BARIS ${layers.length + 1}`,
                    });
                    handleAddLayer(newLayer);
                    setActiveSettingsTab("layers");
                  }}
                  className="h-7 text-[11px] border-[#333] hover:border-amber-400 text-slate-300 font-semibold"
                >
                  <Plus className="w-3 h-3 mr-1 text-amber-400" />
                  <span>Tambah Teks</span>
                </Button>

                {selectedLayerId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteLayer(selectedLayerId)}
                    className="h-7 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    <span>Hapus Layer</span>
                  </Button>
                )}
              </div>

              <div className="text-[10px] text-muted-foreground font-mono">
                {selectedLayerId ? "🎯 Layer Terpilih Aktif" : "💡 Klik teks di kanvas untuk mengedit"}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Clean Tabbed Settings (6 Cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-4 space-y-4 shadow-xl">
            {/* Top Tab Switcher */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 border border-[#2E2E2E] overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveSettingsTab("generator")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeSettingsTab === "generator"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
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
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Editor Teks & Layer</span>
                <span className="w-4 h-4 rounded-full bg-amber-500/30 text-[10px] font-mono flex items-center justify-center text-amber-300 ml-0.5">
                  {layers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsTab("presets")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeSettingsTab === "presets"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
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
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
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
  );
}
export default StoryboardYoutubeTab;

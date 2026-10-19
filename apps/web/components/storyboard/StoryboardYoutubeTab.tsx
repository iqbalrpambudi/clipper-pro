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
  History,
  Palette,
  ArrowRight,
  Type,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
  MousePointerClick,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import {
  Project,
  StoryboardItem,
  YouTubeMetadata,
  YouTubeThumbnailHistory,
  ThumbnailOverlayConfig,
} from "@/types";
import { Button, Input, Textarea, Badge, Switch, Slider } from "@/components/ui";

interface StoryboardYoutubeTabProps {
  project: Project & {
    narration?: any;
    audio?: any;
    storyboard_items?: StoryboardItem[];
  };
}

const AVAILABLE_FONTS = [
  { id: "Anton", name: "Anton (Sangat Direkomendasikan)", desc: "Tebal, lebar, punchy, standar thumbnail YouTube modern" },
  { id: "Montserrat", name: "Montserrat Black", desc: "Elegan, modern, seimbang ala Vox & dokumenter" },
  { id: "Poppins", name: "Poppins Bold", desc: "Geometris bersih, kekinian & eye-catching" },
  { id: "Bebas Neue", name: "Bebas Neue", desc: "Jangkung & tegas dengan tracking rapi" },
  { id: "Inter", name: "Inter ExtraBold", desc: "Ultra-bersih gaya infografis & tech" },
  { id: "Oswald", name: "Oswald Bold", desc: "Kondensasi rapi gaya editorial" },
  { id: "Impact", name: "Impact", desc: "Klasik viral & komik punchy" },
  { id: "Roboto", name: "Roboto Bold", desc: "Netral, bersih & sangat mudah dibaca" },
];

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

  // Catchy Thumbnail Text Overlay State
  const [overlay, setOverlay] = useState<ThumbnailOverlayConfig>({
    enabled: true,
    line1: "",
    line2: "",
    color1: "#FFFFFF",
    color2: "#FFE600",
    position: "top-left",
    pos_x: 6,
    pos_y: 8,
    text_align: "left",
    font_family: "Anton",
    font_size: 56,
    rotation: -2,
    outline_spread: 2.0,
    outline_blur: 4,
    outline_color: "#000000",
    outline_enabled: true,
    blur_enabled: true,
    shadow_style: "subtle",
    style_preset: "viral",
  });

  // Settings Panel Tab Navigation & Active Formula
  const [activeSettingsTab, setActiveSettingsTab] = useState<
    "typography" | "position" | "effects" | "generator" | "metadata"
  >("typography");
  const [activeFormula, setActiveFormula] = useState<string>("comic_reaction");

  // Metadata generation options (automatically locked to project & narration language)
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

    if (meta.thumbnail_overlay) {
      const savedOverlay = meta.thumbnail_overlay;
      setOverlay((prev) => ({
        ...prev,
        ...savedOverlay,
        pos_x: savedOverlay.pos_x ?? prev.pos_x ?? 6,
        pos_y: savedOverlay.pos_y ?? prev.pos_y ?? 8,
        text_align: savedOverlay.text_align ?? prev.text_align ?? "left",
        font_family: savedOverlay.font_family ?? prev.font_family ?? "Bebas Neue",
        font_size: savedOverlay.font_size ?? prev.font_size ?? 48,
        rotation: savedOverlay.rotation ?? prev.rotation ?? -3,
        outline_spread: savedOverlay.outline_spread ?? prev.outline_spread ?? 1.5,
        outline_blur: savedOverlay.outline_blur ?? prev.outline_blur ?? 6,
        outline_enabled: savedOverlay.outline_enabled ?? prev.outline_enabled ?? true,
        blur_enabled: savedOverlay.blur_enabled ?? prev.blur_enabled ?? true,
        outline_color: savedOverlay.outline_color ?? prev.outline_color ?? "#000000",
        style_preset: savedOverlay.style_preset ?? prev.style_preset ?? "modern",
      }));
    } else {
      const words = (project.name || "MISTERI DUNIA").toUpperCase().split(" ");
      const l1 =
        meta.thumbnail_hook_line1 ||
        (words.length > 2 ? words.slice(0, 2).join(" ") : words[0] || "MISTERI BESAR");
      const l2 =
        meta.thumbnail_hook_line2 ||
        (words.length > 2 ? words.slice(2).join(" ") + "?!" : "TERNYATA BEGINI?!");
      setOverlay((prev) => ({
        ...prev,
        line1: l1,
        line2: l2,
        outline_spread: prev.outline_spread ?? 1.5,
        outline_blur: prev.outline_blur ?? 6,
      }));
    }
  }, [project]);

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

      if (data.thumbnail_overlay) {
        const savedOverlay = data.thumbnail_overlay;
        setOverlay((prev) => ({
          ...prev,
          ...savedOverlay,
          pos_x: savedOverlay.pos_x ?? prev.pos_x ?? 6,
          pos_y: savedOverlay.pos_y ?? prev.pos_y ?? 8,
          text_align: savedOverlay.text_align ?? prev.text_align ?? "left",
          font_family: savedOverlay.font_family ?? prev.font_family ?? "Bebas Neue",
          font_size: savedOverlay.font_size ?? prev.font_size ?? 48,
          rotation: savedOverlay.rotation ?? prev.rotation ?? -3,
          outline_spread: savedOverlay.outline_spread ?? prev.outline_spread ?? 1.5,
          outline_blur: savedOverlay.outline_blur ?? prev.outline_blur ?? 6,
          outline_enabled: savedOverlay.outline_enabled ?? prev.outline_enabled ?? true,
          blur_enabled: savedOverlay.blur_enabled ?? prev.blur_enabled ?? true,
          outline_color: savedOverlay.outline_color ?? prev.outline_color ?? "#000000",
          style_preset: savedOverlay.style_preset ?? prev.style_preset ?? "modern",
        }));
      } else if (data.thumbnail_hook_line1 || data.thumbnail_hook_line2) {
        setOverlay((prev) => ({
          ...prev,
          enabled: true,
          line1: data.thumbnail_hook_line1 || prev.line1,
          line2: data.thumbnail_hook_line2 || prev.line2,
        }));
      }

      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Metadata YouTube & formula thumbnail berhasil digenerate!", "info");
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

      return api.updateYouTubeMetadata(project.id, {
        title: title.trim(),
        title_options: titleOptions,
        description: description.trim(),
        tags: tagsArray,
        thumbnail_prompt: thumbnailPrompt.trim(),
        thumbnail_concept: thumbnailConcept.trim(),
        thumbnail_url: thumbnailUrl || undefined,
        thumbnail_history: thumbnailHistory,
        thumbnail_hook_line1: overlay.line1,
        thumbnail_hook_line2: overlay.line2,
        thumbnail_overlay: overlay,
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
      setThumbnailPrompt((prev) =>
        prev ? `${prev.trim()}${addition}` : addition.replace(/^,\s*/, "")
      );
      showToast(`Gaya preset '${activePreset.name}' disisipkan ke prompt thumbnail.`, "info");
    } else {
      showToast("Gaya preset sudah ada di dalam prompt.", "info");
    }
  };

  // Continuity Bible Context for Character, Location & Era Consistency
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

  // Preset Formulas for Viral Thumbnails with Strict Character & Story Continuity
  const VIRAL_FORMULAS = [
    {
      id: "comic_reaction",
      name: "🌟 Reaksi Emosional Tokoh Utama",
      shortDesc: `Close-up ekspresif tokoh ${mainCharName} di foreground + latar ${mainLoc?.name || 'cerita'}`,
      hook1: mainCharName.toUpperCase().slice(0, 14),
      hook2: "KENAPA BUKAN DIA?!",
      color1: "#FFFFFF",
      color2: "#FFE600",
      font: "Anton",
      spread: 2.0,
      blur: 4,
      rotation: -2,
      shadowStyle: "subtle" as const,
      presetStyle: "viral" as const,
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground (one-third of frame), an intense, dramatic shot of ${mainCharToken} facing towards the viewer with an astonished, wide-eyed reaction. In the background, breathtaking panoramic setting of ${mainLocToken} ${eraStr}, golden sunrise, high visual contrast, leaving clear open negative space on the left side for bold text overlay. Rich vibrant colors, sharp cinematic lighting, [preset:style], no text in image.`,
    },
    {
      id: "peeking_pov",
      name: "🕵️ Mengintip Tegang & Misteri",
      shortDesc: `Tokoh ${mainCharName} cemas mengintip di tepi + atmosfer tegang masa ${era || 'cerita'}`,
      hook1: "TERNYATA",
      hook2: "BUKAN DIA?!",
      color1: "#FFFFFF",
      color2: "#FFE600",
      font: "Anton",
      spread: 2.0,
      blur: 4,
      rotation: -2,
      shadowStyle: "subtle" as const,
      presetStyle: "viral" as const,
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right edge foreground, an intense dramatic close-up of ${mainCharToken} looking with shocked, suspenseful eyes towards the viewer. In the background, a moody cinematic setting of ${mainLocToken} ${eraStr} under dramatic stormy atmosphere. High contrast, atmospheric cinematic lighting, deep tension, leaving clear open space on left side for typography, [preset:style], no text in image.`,
    },
    {
      id: "mystery_relic",
      name: "⚡ Benda Pusaka & Plot Twist",
      shortDesc: `Tokoh ${mainCharName} syok memegang benda kunci cerita + pancaran cahaya megah`,
      hook1: "MISTERI NYATA",
      hook2: "HILANG TOTAL?!",
      color1: "#FFFFFF",
      color2: "#FF3838",
      font: "Anton",
      spread: 2.5,
      blur: 0,
      rotation: -3,
      shadowStyle: "3d_pop" as const,
      presetStyle: "viral" as const,
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the right foreground, an intense dramatic shot of ${mainCharToken} reacting in utter disbelief, holding a glowing mysterious relic or key artifact. In the background, majestic colossal scenery of ${mainLocToken} ${eraStr} illuminated by dramatic golden rays of light breaking through thick clouds, leaving left third open for big bold text overlay, rich saturated colors, high contrast, [preset:style], no text in image.`,
    },
    {
      id: "contrast_vs",
      name: "💥 Fakta Mengejutkan & Skala Epik",
      shortDesc: `Tokoh ${mainCharName} menunjuk fenomena luar biasa + tipografi modern bersih`,
      hook1: "FAKTA GILA",
      hook2: "1000 TAHUN LALU?!",
      color1: "#00F0FF",
      color2: "#FFE600",
      font: "Montserrat",
      spread: 1.5,
      blur: 3,
      rotation: 0,
      shadowStyle: "subtle" as const,
      presetStyle: "modern" as const,
      getPrompt: (_topic: string, _styleRef: string) =>
        `A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape). In the foreground, an expressive dramatic shot of ${mainCharToken} gesturing with shock at an astonishing gigantic visual phenomenon in ${mainLocToken} ${eraStr}. Cinematic scale, striking color contrast, bright vibrant lighting with dark atmospheric edges, wide open clean negative space on the upper portion for typography, modern cinematic documentary look, [preset:style], no text in image.`,
    },
  ];

  // Apply Formula handler
  const applyFormulaPrompt = (formulaId: string) => {
    const f = VIRAL_FORMULAS.find((item) => item.id === formulaId);
    if (!f) return;

    setActiveFormula(formulaId);
    const topic = project.name || "Nusantara Kuno";
    const styleRef = activePreset?.master_prompt
      ? `in ${activePreset.name} visual style (${activePreset.master_prompt.slice(0, 100)})`
      : "vibrant cinematic illustration style";

    const promptText = f.getPrompt(topic, styleRef);
    setThumbnailPrompt(promptText);

    setOverlay((prev) => ({
      ...prev,
      enabled: true,
      line1: f.hook1,
      line2: f.hook2,
      color1: f.color1,
      color2: f.color2,
      font_family: f.font,
      font_size: f.font === "Anton" ? 56 : 52,
      outline_spread: f.spread,
      outline_blur: f.blur,
      rotation: f.rotation,
      outline_enabled: f.spread > 0,
      blur_enabled: f.blur > 0,
      shadow_style: f.shadowStyle,
      style_preset: f.presetStyle,
    }));

    showToast(`Komposisi '${f.name}' aktif untuk ${mainCharName}!`, "info");
  };

  // Modern Styles Presets - Clean, Punchy, No Muddy Black Smudge
  const STYLE_PRESETS = [
    {
      id: "viral",
      label: "🔥 YouTube Viral Bold (Rekomendasi)",
      desc: "Font Anton tebal & punchy, outline hitam tajam, bayangan bersih tanpa smudge",
      apply: () => {
        setOverlay((prev) => ({
          ...prev,
          style_preset: "viral",
          font_family: "Anton",
          font_size: 56,
          outline_enabled: true,
          outline_spread: 2.0,
          blur_enabled: true,
          outline_blur: 4,
          shadow_style: "subtle",
          rotation: -2,
          color1: "#FFFFFF",
          color2: "#FFE600",
        }));
        showToast("Gaya 'YouTube Viral Bold' diterapkan.", "info");
      },
    },
    {
      id: "modern",
      label: "🎬 Dokumenter Premium (Vox / Netflix)",
      desc: "Font Montserrat modern seimbang, outline 1.5px halus, bayangan natural",
      apply: () => {
        setOverlay((prev) => ({
          ...prev,
          style_preset: "modern",
          font_family: "Montserrat",
          font_size: 52,
          outline_enabled: true,
          outline_spread: 1.5,
          blur_enabled: true,
          outline_blur: 3,
          shadow_style: "subtle",
          rotation: 0,
          color1: "#FFFFFF",
          color2: "#00F0FF",
        }));
        showToast("Gaya 'Dokumenter Premium' diterapkan.", "info");
      },
    },
    {
      id: "comic",
      label: "💥 Punchy 3D Pop (MrBeast Style)",
      desc: "Stroke tegas 2.5px dengan bayangan solid 3D tanpa blur kabur",
      apply: () => {
        setOverlay((prev) => ({
          ...prev,
          style_preset: "comic",
          font_family: "Anton",
          font_size: 60,
          outline_enabled: true,
          outline_spread: 2.5,
          blur_enabled: true,
          outline_blur: 0,
          shadow_style: "3d_pop",
          rotation: -3,
          color1: "#FFE600",
          color2: "#FFFFFF",
        }));
        showToast("Gaya 'Punchy 3D Pop' diterapkan.", "info");
      },
    },
    {
      id: "minimal",
      label: "✨ Clean Minimalist",
      desc: "Teks putih bersih, outline tipis 1px, tanpa efek bayangan",
      apply: () => {
        setOverlay((prev) => ({
          ...prev,
          style_preset: "minimal",
          font_family: "Poppins",
          font_size: 48,
          outline_enabled: true,
          outline_spread: 1.0,
          blur_enabled: false,
          outline_blur: 0,
          shadow_style: "none",
          rotation: 0,
          color1: "#FFFFFF",
          color2: "#FFFFFF",
        }));
        showToast("Gaya 'Clean Minimalist' diterapkan.", "info");
      },
    },
  ];

  // Calculated styling values
  const outlineEnabled = overlay.outline_enabled ?? true;
  const blurEnabled = overlay.blur_enabled ?? true;
  const spread = outlineEnabled ? overlay.outline_spread ?? 2.0 : 0;
  const blur = blurEnabled ? overlay.outline_blur ?? 4 : 0;
  const strokeColor = overlay.outline_color || "#000000";
  const fontFamily = overlay.font_family || "Anton";
  const posX = overlay.pos_x ?? 6;
  const posY = overlay.pos_y ?? 8;
  const textAlign = overlay.text_align || "left";

  // Build clean, modern YouTube drop shadow (Strictly avoids muddy, dirty black smog)
  const buildModernShadow = (b: number, shadowStyle?: string) => {
    if (!blurEnabled) return "none";
    if (shadowStyle === "3d_pop") {
      return "2.5px 2.5px 0px rgba(0,0,0,0.95)";
    }
    if (shadowStyle === "none" || b <= 0) {
      return "none";
    }
    if (shadowStyle === "glow") {
      return "0 0 6px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.7)";
    }
    // Clean, tight YouTube shadow - strictly capped to 5px max to prevent dark messy smudge
    const cleanBlur = Math.min(5, b);
    return `0 2px 4px rgba(0,0,0,0.65), 0 3px ${cleanBlur}px rgba(0,0,0,0.35)`;
  };

  // Click on thumbnail to position text interactively
  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    setOverlay((prev) => ({
      ...prev,
      pos_x: x,
      pos_y: y,
      position: "custom",
    }));
    showToast(`Posisi teks dipindahkan ke (X: ${x}%, Y: ${y}%)`, "info");
  };

  // Canvas High-Res Download (Burns Text Overlay into PNG directly with clean crisp outlines)
  const handleDownloadThumbnail = async () => {
    if (!thumbnailUrl) return;

    if (!overlay.enabled || (!overlay.line1 && !overlay.line2)) {
      const a = document.createElement("a");
      a.href = thumbnailUrl;
      a.download = `thumbnail_${project.id}.png`;
      a.click();
      return;
    }

    try {
      showToast("Menyiapkan thumbnail HD dengan font & efek modern...", "info");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = thumbnailUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 1792;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context tidak tersedia");

      // Draw base image
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      ctx.save();

      // Configure font scaling
      const baseFontSize = Math.round((overlay.font_size / 48) * 110);
      try {
        await document.fonts.load(`900 ${baseFontSize}px '${fontFamily}'`);
      } catch {
        // Fallback gracefully
      }
      ctx.font = `900 ${baseFontSize}px '${fontFamily}', 'Montserrat', 'Arial Black', sans-serif`;
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;

      // Calculate start coordinates from posX, posY (0-100%)
      const startX = Math.round((posX / 100) * canvas.width);
      const startY = Math.round((posY / 100) * canvas.height);
      ctx.textAlign = textAlign;

      // Apply rotation around startX, startY
      ctx.translate(startX, startY);
      ctx.rotate((overlay.rotation * Math.PI) / 180);

      // Scaled spread & blur for 1792x1024 canvas
      const scaleFactor = baseFontSize / 110;
      const canvasSpread = Math.round(scaleFactor * spread * 2.0);
      const is3d = overlay.shadow_style === "3d_pop";
      const canvasBlur = is3d ? 0 : Math.min(8, Math.round(scaleFactor * blur * 0.8));
      const shadowOffsetX = is3d ? 4 : 1;
      const shadowOffsetY = is3d ? 4 : 3;

      // Line 1
      if (overlay.line1) {
        if (blurEnabled && (canvasBlur > 0 || is3d)) {
          ctx.shadowColor = is3d ? "rgba(0,0,0,0.95)" : "rgba(0,0,0,0.55)";
          ctx.shadowBlur = canvasBlur;
          ctx.shadowOffsetX = shadowOffsetX;
          ctx.shadowOffsetY = shadowOffsetY;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        if (canvasSpread > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = canvasSpread * 2;
          ctx.strokeText(overlay.line1, 0, 0);
        }

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = overlay.color1 || "#FFFFFF";
        ctx.fillText(overlay.line1, 0, 0);
      }

      // Line 2
      if (overlay.line2) {
        const line2Y = Math.round(baseFontSize * 0.98);

        if (blurEnabled && (canvasBlur > 0 || is3d)) {
          ctx.shadowColor = is3d ? "rgba(0,0,0,0.95)" : "rgba(0,0,0,0.55)";
          ctx.shadowBlur = canvasBlur;
          ctx.shadowOffsetX = shadowOffsetX;
          ctx.shadowOffsetY = shadowOffsetY;
        } else {
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        if (canvasSpread > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = canvasSpread * 2;
          ctx.strokeText(overlay.line2, 0, line2Y);
        }

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = overlay.color2 || "#FFE600";
        ctx.fillText(overlay.line2, 0, line2Y);
      }

      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) throw new Error("Gagal mengonversi canvas ke gambar");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `thumbnail_youtube_${project.id}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Thumbnail HD siap di-upload ke YouTube!", "info");
      }, "image/png");
    } catch {
      // Fallback
      const a = document.createElement("a");
      a.href = thumbnailUrl;
      a.download = `thumbnail_${project.id}.png`;
      a.click();
      showToast("Mengunduh gambar asli tanpa overlay.", "info");
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
            YouTube Video & Catchy Thumbnail Studio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pratinjau feed realistis dengan teks hook catchy, tipografi modern, dan innerscroll
            agar preview selalu terlihat.
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

      {/* Main 2-Column Split: STICKY PREVIEW (Left) + INNERSCROLL SETTINGS (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Sticky Realistic YouTube Mockup & Thumbnail Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4 self-start">
          {/* Card 1: Live Realistic YouTube Mockup with Catchy Text Overlay */}
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-4 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <Youtube className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Pratinjau Thumbnail YouTube</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Klik gambar untuk memindahkan teks seketika
                  </p>
                </div>
              </div>

              {thumbnailUrl && (
                <button
                  type="button"
                  onClick={handleDownloadThumbnail}
                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md shadow-red-600/20 transition-colors"
                  title="Unduh file gambar thumbnail beserta teks hook resolusi 1792x1024"
                >
                  <Download className="w-3 h-3" />
                  <span>Unduh PNG HD</span>
                </button>
              )}
            </div>

            {/* YouTube Card Simulation */}
            <div className="rounded-xl overflow-hidden bg-black border border-[#262626] shadow-2xl transition-all group">
              {/* Thumbnail Container (16:9) with interactive click-to-position */}
              <div
                onClick={handlePreviewClick}
                className="relative aspect-video w-full bg-[#121212] overflow-hidden flex items-center justify-center cursor-crosshair select-none"
                title="Klik di mana saja pada gambar untuk memindahkan teks hook"
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="YouTube Thumbnail Preview"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02] pointer-events-none"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500">
                    <ImageIcon className="w-10 h-10 mb-2 opacity-40 text-red-400" />
                    <p className="text-xs font-semibold text-slate-400">Belum Ada Thumbnail</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pilih formula viral di tab 'Formula & AI Prompt' lalu generate
                    </p>
                  </div>
                )}

                {/* Catchy Hook Text Overlay (Custom position, custom rotation, exact font, modern outline & blur) */}
                {overlay.enabled && (overlay.line1 || overlay.line2) && (
                  <div
                    className="absolute pointer-events-none select-none z-10 transition-all duration-75"
                    style={{
                      left: `${posX}%`,
                      top: `${posY}%`,
                      transform: `translate(${
                        textAlign === "center" ? "-50%" : textAlign === "right" ? "-100%" : "0%"
                      }, ${posY > 65 ? "-100%" : posY > 35 ? "-50%" : "0%"}) rotate(${
                        overlay.rotation
                      }deg)`,
                      transformOrigin:
                        textAlign === "right"
                          ? "top right"
                          : textAlign === "center"
                          ? "center"
                          : "top left",
                      textAlign: textAlign,
                    }}
                  >
                    {overlay.line1 && (
                      <div
                        className="font-black uppercase tracking-normal leading-[0.88]"
                        style={{
                          fontSize: `${Math.round(overlay.font_size * 0.68)}px`,
                          color: overlay.color1,
                          WebkitTextStroke:
                            spread > 0 ? `${spread * 0.75}px ${strokeColor}` : "0px transparent",
                          paintOrder: "stroke fill",
                          textShadow: buildModernShadow(blur, overlay.shadow_style),
                          fontFamily: `'${fontFamily}', 'Montserrat', 'Arial Black', sans-serif`,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {overlay.line1}
                      </div>
                    )}
                    {overlay.line2 && (
                      <div
                        className="font-black uppercase tracking-normal leading-[0.88] mt-0.5"
                        style={{
                          fontSize: `${Math.round(overlay.font_size * 0.68)}px`,
                          color: overlay.color2,
                          WebkitTextStroke:
                            spread > 0 ? `${spread * 0.75}px ${strokeColor}` : "0px transparent",
                          paintOrder: "stroke fill",
                          textShadow: buildModernShadow(blur, overlay.shadow_style),
                          fontFamily: `'${fontFamily}', 'Montserrat', 'Arial Black', sans-serif`,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {overlay.line2}
                      </div>
                    )}
                  </div>
                )}

                {/* Duration Badge */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 text-white font-mono text-[10px] font-bold tracking-wider backdrop-blur-sm shadow-md z-20 pointer-events-none">
                  {formatBadgeDuration(durationSec)}
                </div>

                {/* Click Hint Floating Overlay */}
                <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-slate-300 text-[9px] flex items-center gap-1 backdrop-blur-sm opacity-60 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <MousePointerClick className="w-2.5 h-2.5 text-amber-400" />
                  <span>Klik gambar utk geser</span>
                </div>
              </div>

              {/* YouTube Video Info Block */}
              <div className="p-3 flex items-start gap-2.5 bg-[#0F0F0F]">
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

            {/* Quick Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground pt-1 border-t border-[#262626]">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      overlay.enabled ? "bg-emerald-400" : "bg-slate-500"
                    }`}
                  ></span>
                  <span>Teks: {overlay.enabled ? "Aktif" : "Mati"}</span>
                </span>
                <span>•</span>
                <span>Font: <strong className="text-slate-300">{fontFamily}</strong></span>
                <span>•</span>
                <span>Rotasi: <strong className="text-amber-400">{overlay.rotation}°</strong></span>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                X:{posX}% Y:{posY}%
              </div>
            </div>
          </div>

          {/* History Gallery (Collapsible Under Preview) */}
          {thumbnailHistory.length > 0 && (
            <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-3.5 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-white">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Riwayat Thumbnail ({thumbnailHistory.length})</span>
                </div>
                <span className="text-[10px] text-muted-foreground">Klik untuk memilih</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {thumbnailHistory.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={() => {
                      setThumbnailUrl(item.url);
                      setThumbnailPrompt(item.prompt);
                      showToast("Thumbnail aktif diperbarui dari riwayat.", "info");
                    }}
                    className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                      thumbnailUrl === item.url
                        ? "border-red-500 ring-2 ring-red-500/20 scale-[1.02]"
                        : "border-[#2E2E2E] hover:border-slate-400 opacity-70 hover:opacity-100"
                    }`}
                    title={item.prompt}
                  >
                    <img
                      src={item.url}
                      alt={`History thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {thumbnailUrl === item.url && (
                      <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-red-600 flex items-center justify-center">
                        <Check className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Settings Studio with INNER SCROLL (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0">
          <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl">
            {/* Top Navigation Tabs Header for Settings Panel */}
            <div className="flex items-center gap-1 p-1 bg-black/40 rounded-xl border border-[#262626] overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveSettingsTab("typography")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeSettingsTab === "typography"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Tipografi & Teks</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsTab("position")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeSettingsTab === "position"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Posisi & Rotasi</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSettingsTab("effects")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeSettingsTab === "effects"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Palette className="w-3.5 h-3.5" />
                <span>Outline & Blur</span>
              </button>

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
                <span>Formula & AI Prompt</span>
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

            {/* Inner Scroll Container for Settings (Keeps preview always visible!) */}
            <div className="lg:max-h-[calc(100vh-230px)] lg:overflow-y-auto pr-1 space-y-4">
              {/* TAB 1: TIPOGRAFI & TEKS */}
              {activeSettingsTab === "typography" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Type className="w-4 h-4 text-amber-400" />
                        <span>Kustomisasi Teks Hook & Tipografi</span>
                      </h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Sesuaikan kata hook pembuka, jenis font, ukuran, dan kombinasi warna
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Tampilkan Overlay</span>
                      <Switch
                        checked={overlay.enabled}
                        onCheckedChange={(checked) =>
                          setOverlay((prev) => ({ ...prev, enabled: checked }))
                        }
                      />
                    </div>
                  </div>

                  {/* Text Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Baris 1 (Teks Utama)
                      </label>
                      <Input
                        value={overlay.line1}
                        onChange={(e) =>
                          setOverlay((prev) => ({ ...prev, line1: e.target.value.toUpperCase() }))
                        }
                        placeholder="JAWA 610 M"
                        className="bg-black/40 border-[#2E2E2E] text-xs font-bold uppercase tracking-wide focus:border-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Baris 2 (Hook Penasaran)
                      </label>
                      <Input
                        value={overlay.line2}
                        onChange={(e) =>
                          setOverlay((prev) => ({ ...prev, line2: e.target.value.toUpperCase() }))
                        }
                        placeholder="TANPA SAMBAL?!"
                        className="bg-black/40 border-[#2E2E2E] text-xs font-bold uppercase tracking-wide focus:border-amber-500/50"
                      />
                    </div>
                  </div>

                  {/* Font Family Selector */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Pilihan Font YouTube</span>
                      <span className="text-[11px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {fontFamily}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {AVAILABLE_FONTS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setOverlay((prev) => ({ ...prev, font_family: f.id }))}
                          className={`p-2 rounded-lg border text-left transition-all ${
                            fontFamily === f.id
                              ? "bg-amber-500/20 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                              : "bg-[#1E1E1E] border-[#2A2A2A] text-slate-300 hover:bg-[#252525] hover:border-slate-500"
                          }`}
                        >
                          <div
                            className="text-xs font-black truncate"
                            style={{ fontFamily: `'${f.id}', sans-serif` }}
                          >
                            {f.name}
                          </div>
                          <div className="text-[9px] text-muted-foreground truncate mt-0.5">
                            {f.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size Slider */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200">Ukuran Huruf (Font Size)</span>
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {overlay.font_size}px
                      </span>
                    </div>

                    <Slider
                      value={[overlay.font_size]}
                      min={28}
                      max={72}
                      step={2}
                      onValueChange={([val]) => setOverlay((prev) => ({ ...prev, font_size: val }))}
                      className="py-1 cursor-pointer"
                    />

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {[
                        { label: "36px (Kecil)", val: 36 },
                        { label: "44px (Sedang)", val: 44 },
                        { label: "48px (Default)", val: 48 },
                        { label: "56px (Besar)", val: 56 },
                        { label: "64px (Ekstra)", val: 64 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setOverlay((prev) => ({ ...prev, font_size: preset.val }))}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            overlay.font_size === preset.val
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-[#202020] hover:bg-[#282828] text-slate-400 border-[#333]"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Palette Presets */}
                  <div className="space-y-3 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 block">
                        Kombinasi Warna Viral YouTube:
                      </span>
                      <span className="text-[10px] text-muted-foreground">Kontras tinggi & nyaman dipandang</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {[
                        { label: "Putih + Kuning", c1: "#FFFFFF", c2: "#FFE600", desc: "Standar Viral YouTube" },
                        { label: "Kuning + Putih", c1: "#FFE600", c2: "#FFFFFF", desc: "Inverted High Pop" },
                        { label: "Putih + Cyan Neon", c1: "#FFFFFF", c2: "#00F0FF", desc: "Dokumenter & Misteri" },
                        { label: "Putih + Merah Api", c1: "#FFFFFF", c2: "#FF3838", desc: "Dramatis & Bahaya" },
                        { label: "Putih + Hijau Neon", c1: "#FFFFFF", c2: "#00FFA3", desc: "Finansial & Fresh" },
                        { label: "Putih Solid", c1: "#FFFFFF", c2: "#FFFFFF", desc: "Clean Minimalis" },
                      ].map((cp) => {
                        const isMatch = overlay.color1 === cp.c1 && overlay.color2 === cp.c2;
                        return (
                          <button
                            key={cp.label}
                            type="button"
                            onClick={() =>
                              setOverlay((prev) => ({ ...prev, color1: cp.c1, color2: cp.c2 }))
                            }
                            className={`p-2 rounded-lg text-left border transition-all flex flex-col gap-1 ${
                              isMatch
                                ? "bg-amber-500/15 border-amber-500/50 ring-1 ring-amber-500/30 text-white"
                                : "bg-[#1E1E1E] border-[#2A2A2A] hover:bg-[#252525] text-slate-300"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-3.5 h-3.5 rounded-full inline-block border border-black/40 shrink-0"
                                style={{ backgroundColor: cp.c1 }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full inline-block border border-black/40 shrink-0"
                                style={{ backgroundColor: cp.c2 }}
                              />
                              <span className="text-xs font-bold truncate">{cp.label}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground truncate">{cp.desc}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Hex Color Pickers */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#262626]">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={overlay.color1 || "#FFFFFF"}
                          onChange={(e) => setOverlay((prev) => ({ ...prev, color1: e.target.value }))}
                          className="w-7 h-7 rounded border border-[#333] cursor-pointer bg-transparent"
                          title="Pilih Warna Baris 1"
                        />
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] text-slate-400 block">Warna Baris 1</label>
                          <input
                            type="text"
                            value={overlay.color1 || "#FFFFFF"}
                            onChange={(e) => setOverlay((prev) => ({ ...prev, color1: e.target.value }))}
                            className="w-full bg-[#1A1A1A] text-xs font-mono px-2 py-0.5 rounded border border-[#333] text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={overlay.color2 || "#FFE600"}
                          onChange={(e) => setOverlay((prev) => ({ ...prev, color2: e.target.value }))}
                          className="w-7 h-7 rounded border border-[#333] cursor-pointer bg-transparent"
                          title="Pilih Warna Baris 2"
                        />
                        <div className="flex-1 min-w-0">
                          <label className="text-[10px] text-slate-400 block">Warna Baris 2</label>
                          <input
                            type="text"
                            value={overlay.color2 || "#FFE600"}
                            onChange={(e) => setOverlay((prev) => ({ ...prev, color2: e.target.value }))}
                            className="w-full bg-[#1A1A1A] text-xs font-mono px-2 py-0.5 rounded border border-[#333] text-white focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: POSISI & ROTASI BEBAS */}
              {activeSettingsTab === "position" && (
                <div className="space-y-4">
                  <div className="pb-2 border-b border-[#262626]">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Move className="w-4 h-4 text-amber-400" />
                      <span>Kustomisasi Posisi & Kemiringan Bebas</span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Atur posisi koordinat X & Y teks secara presisi atau klik langsung pada gambar
                      pratinjau
                    </p>
                  </div>

                  {/* Quick 9-Grid Anchor Buttons */}
                  <div className="p-3 rounded-xl bg-black/40 border border-[#2E2E2E] space-y-2">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Jangkar Posisi Cepat (9 Titik):
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Kiri Atas", x: 6, y: 8, align: "left" as const },
                        { label: "Tengah Atas", x: 50, y: 8, align: "center" as const },
                        { label: "Kanan Atas", x: 94, y: 8, align: "right" as const },
                        { label: "Kiri Tengah", x: 6, y: 45, align: "left" as const },
                        { label: "Tengah Layar", x: 50, y: 45, align: "center" as const },
                        { label: "Kanan Tengah", x: 94, y: 45, align: "right" as const },
                        { label: "Kiri Bawah", x: 6, y: 75, align: "left" as const },
                        { label: "Tengah Bawah", x: 50, y: 75, align: "center" as const },
                        { label: "Kanan Bawah", x: 94, y: 75, align: "right" as const },
                      ].map((anchor) => (
                        <button
                          key={anchor.label}
                          type="button"
                          onClick={() =>
                            setOverlay((prev) => ({
                              ...prev,
                              pos_x: anchor.x,
                              pos_y: anchor.y,
                              text_align: anchor.align,
                              position: "custom",
                            }))
                          }
                          className={`py-1.5 px-2 rounded-lg text-[11px] border text-center transition-all ${
                            posX === anchor.x && posY === anchor.y
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/50 font-bold"
                              : "bg-[#1E1E1E] text-slate-300 border-[#2A2A2A] hover:bg-[#252525]"
                          }`}
                        >
                          {anchor.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fine Tuning Sliders X and Y */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-black/40 border border-[#2E2E2E] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">Posisi Horizontal (X)</span>
                        <span className="font-mono text-xs font-bold text-amber-400">{posX}%</span>
                      </div>
                      <Slider
                        value={[posX]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([val]) =>
                          setOverlay((prev) => ({ ...prev, pos_x: val, position: "custom" }))
                        }
                        className="py-1 cursor-pointer"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-[#2E2E2E] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">Posisi Vertikal (Y)</span>
                        <span className="font-mono text-xs font-bold text-amber-400">{posY}%</span>
                      </div>
                      <Slider
                        value={[posY]}
                        min={0}
                        max={100}
                        step={1}
                        onValueChange={([val]) =>
                          setOverlay((prev) => ({ ...prev, pos_y: val, position: "custom" }))
                        }
                        className="py-1 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Text Alignment */}
                  <div className="p-3 rounded-xl bg-black/40 border border-[#2E2E2E] space-y-2">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Rata Teks (Text Align):
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOverlay((prev) => ({ ...prev, text_align: "left" }))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                          textAlign === "left"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-[#1E1E1E] text-slate-400 border-[#2A2A2A] hover:bg-[#252525]"
                        }`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                        <span>Rata Kiri</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOverlay((prev) => ({ ...prev, text_align: "center" }))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                          textAlign === "center"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-[#1E1E1E] text-slate-400 border-[#2A2A2A] hover:bg-[#252525]"
                        }`}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                        <span>Rata Tengah</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOverlay((prev) => ({ ...prev, text_align: "right" }))}
                        className={`flex-1 py-1.5 text-xs rounded-lg border flex items-center justify-center gap-1.5 transition-colors ${
                          textAlign === "right"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-[#1E1E1E] text-slate-400 border-[#2A2A2A] hover:bg-[#252525]"
                        }`}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                        <span>Rata Kanan</span>
                      </button>
                    </div>
                  </div>

                  {/* Custom Rotation Slider */}
                  <div className="p-3 rounded-xl bg-black/40 border border-[#2E2E2E] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">
                          Kemiringan Kustom (Rotation)
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Sudut putar teks (-30° s/d +30°)
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {overlay.rotation}°
                        </span>
                        {overlay.rotation !== 0 && (
                          <button
                            type="button"
                            onClick={() => setOverlay((prev) => ({ ...prev, rotation: 0 }))}
                            className="text-[10px] text-muted-foreground hover:text-white underline"
                          >
                            Reset 0°
                          </button>
                        )}
                      </div>
                    </div>

                    <Slider
                      value={[overlay.rotation]}
                      min={-30}
                      max={30}
                      step={1}
                      onValueChange={([val]) => setOverlay((prev) => ({ ...prev, rotation: val }))}
                      className="py-1 cursor-pointer"
                    />

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {[
                        { label: "-6° (Miring)", val: -6 },
                        { label: "-3° (Halus)", val: -3 },
                        { label: "0° (Rata)", val: 0 },
                        { label: "+3° (Kanan)", val: 3 },
                        { label: "+6° (Dinamis)", val: 6 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setOverlay((prev) => ({ ...prev, rotation: preset.val }))}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                            overlay.rotation === preset.val
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                              : "bg-[#202020] hover:bg-[#282828] text-slate-400 border-[#333]"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: OUTLINE & BLUR (MODERN & MINIMALIS) */}
              {activeSettingsTab === "effects" && (
                <div className="space-y-4">
                  <div className="pb-2 border-b border-[#262626]">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Palette className="w-4 h-4 text-amber-400" />
                      <span>Gaya Modern: Outline & Bayangan (Clean Drop Shadow)</span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pilih preset YouTube bersih atau atur ketebalan garis tepi dan gaya bayangan tanpa efek buram berlebihan
                    </p>
                  </div>

                  {/* Preset Gaya Cepat */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Preset Tampilan YouTube:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={preset.apply}
                          className={`p-2.5 rounded-xl border text-left transition-all ${
                            overlay.style_preset === preset.id
                              ? "bg-amber-500/20 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                              : "bg-[#1E1E1E] border-[#2A2A2A] text-slate-300 hover:bg-[#252525] hover:border-slate-500"
                          }`}
                        >
                          <div className="text-xs font-bold text-amber-300">{preset.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                            {preset.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shadow Style Selector */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Tipe Bayangan (Shadow Style):
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: "subtle" as const, label: "Soft Shadow", desc: "Halus & Rapi (Standar)" },
                        { id: "3d_pop" as const, label: "3D Pop Solid", desc: "Tegas Tanpa Blur (MrBeast)" },
                        { id: "glow" as const, label: "Glow Halus", desc: "Cahaya Lembut" },
                        { id: "none" as const, label: "Tanpa Bayangan", desc: "Super Clean Flat" },
                      ].map((item) => {
                        const isSelected = (overlay.shadow_style || "subtle") === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() =>
                              setOverlay((prev) => ({
                                ...prev,
                                shadow_style: item.id,
                                style_preset: "custom",
                              }))
                            }
                            className={`p-2 rounded-lg text-left border transition-all ${
                              isSelected
                                ? "bg-amber-500/20 border-amber-500/50 text-white font-semibold ring-1 ring-amber-500/30"
                                : "bg-[#1E1E1E] border-[#2A2A2A] hover:bg-[#252525] text-slate-300"
                            }`}
                          >
                            <div className="text-xs font-bold text-slate-200">{item.label}</div>
                            <div className="text-[9px] text-muted-foreground mt-0.5 truncate">
                              {item.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Outline / Stroke Control */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">
                          Garis Tepi (Outline Stroke)
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Outline tipis-sedang yang rapi (paint-order: stroke fill)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {spread}px
                        </span>
                        <Switch
                          checked={outlineEnabled}
                          onCheckedChange={(checked) =>
                            setOverlay((prev) => ({
                              ...prev,
                              outline_enabled: checked,
                              style_preset: "custom",
                            }))
                          }
                        />
                      </div>
                    </div>

                    {outlineEnabled && (
                      <>
                        <Slider
                          value={[spread]}
                          min={0}
                          max={5}
                          step={0.25}
                          onValueChange={([val]) =>
                            setOverlay((prev) => ({
                              ...prev,
                              outline_spread: val,
                              style_preset: "custom",
                            }))
                          }
                          className="py-1 cursor-pointer"
                        />

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {[
                            { label: "0px (Tanpa Outline)", val: 0 },
                            { label: "1px (Halus Tipis)", val: 1 },
                            { label: "1.5px (Sedang Rapi)", val: 1.5 },
                            { label: "2px (Standar YouTube)", val: 2 },
                            { label: "3px (Tegas Bold)", val: 3 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() =>
                                setOverlay((prev) => ({
                                  ...prev,
                                  outline_spread: p.val,
                                  style_preset: "custom",
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                spread === p.val
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-[#202020] hover:bg-[#282828] text-slate-400 border-[#333]"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Soft Drop Shadow (Blur) Control */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-200">
                          Kelembutan Bayangan (Blur Depth)
                        </span>
                        <p className="text-[10px] text-muted-foreground">
                          Efek bayangan arah jatuh bersih (dibatasi agar tidak menimbulkan bercak hitam kotor)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {blur}px
                        </span>
                        <Switch
                          checked={blurEnabled}
                          onCheckedChange={(checked) =>
                            setOverlay((prev) => ({
                              ...prev,
                              blur_enabled: checked,
                              style_preset: "custom",
                            }))
                          }
                        />
                      </div>
                    </div>

                    {blurEnabled && (
                      <>
                        <Slider
                          value={[blur]}
                          min={0}
                          max={12}
                          step={1}
                          onValueChange={([val]) =>
                            setOverlay((prev) => ({
                              ...prev,
                              outline_blur: val,
                              style_preset: "custom",
                            }))
                          }
                          className="py-1 cursor-pointer"
                        />

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {[
                            { label: "0px (Solid Cut)", val: 0 },
                            { label: "2px (Sangat Tipis)", val: 2 },
                            { label: "4px (Standar YouTube)", val: 4 },
                            { label: "6px (Tegas Bersih)", val: 6 },
                            { label: "8px (Maksimal)", val: 8 },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() =>
                                setOverlay((prev) => ({
                                  ...prev,
                                  outline_blur: p.val,
                                  style_preset: "custom",
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                blur === p.val
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : "bg-[#202020] hover:bg-[#282828] text-slate-400 border-[#333]"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: FORMULA & AI PROMPT */}
              {activeSettingsTab === "generator" && (
                <div className="space-y-4">
                  <div className="pb-2 border-b border-[#262626]">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-red-400" />
                      <span>Formula Komposisi Viral & Prompt AI</span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Pilih format visual terbukti ber-CTR tinggi; klik untuk menerapkan prompt dan
                      teks hook seketika
                    </p>
                  </div>

                  {/* Continuity Bible Anchor Card */}
                  <div className="p-3 rounded-xl bg-gradient-to-r from-red-500/10 via-amber-500/5 to-transparent border border-red-500/25 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Story Continuity Bible: Karakter & Latar Terkunci</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        100% Selaras Storyboard
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="bg-black/50 p-2 rounded-lg border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Tokoh Utama:</span>
                        <span className="font-bold text-amber-300 truncate block">
                          {mainCharName}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">{mainCharToken}</span>
                      </div>

                      <div className="bg-black/50 p-2 rounded-lg border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Latar Tempat:</span>
                        <span className="font-bold text-cyan-300 truncate block">
                          {mainLoc?.name || "Latar Ikonik Cerita"}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">{mainLocToken}</span>
                      </div>

                      <div className="bg-black/50 p-2 rounded-lg border border-white/5">
                        <span className="text-[10px] text-slate-400 block">Era / Lini Masa:</span>
                        <span className="font-bold text-violet-300 truncate block">
                          {era || "Sesuai Naskah Cerita"}
                        </span>
                        <span className="text-[9px] font-mono text-slate-400">16:9 Landscape Full</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      AI otomatis menyubstitusi token karakter dan lokasi dengan deskripsi visual dari sheet karakter proyek. Tidak ada lagi karakter stickman/doodle; thumbnail akan menampilkan wajah, kostum, dan latar yang sama dengan storyboard.
                    </p>
                  </div>

                  {/* 4 Viral Formula Cards */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Pilih Komposisi Viral:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {VIRAL_FORMULAS.map((f) => {
                        const isSelected = activeFormula === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => applyFormulaPrompt(f.id)}
                            className={`p-3 rounded-xl border text-left transition-all relative ${
                              isSelected
                                ? "bg-red-500/15 border-red-500 ring-2 ring-red-500/30 text-white shadow-lg"
                                : "bg-black/40 border-[#2E2E2E] text-slate-300 hover:bg-[#202020] hover:border-slate-500"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-red-300">{f.name}</span>
                              {isSelected && (
                                <span className="px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-bold text-white flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Aktif</span>
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {f.shortDesc}
                            </p>
                            <div className="mt-2 text-[10px] font-mono text-amber-400/90 bg-black/40 px-2 py-0.5 rounded border border-white/5 truncate">
                              Hook: "{f.hook1} / {f.hook2}"
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prompt Editor */}
                  <div className="space-y-1.5 pt-2 border-t border-[#262626]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <span>Prompt Thumbnail AI (16:9 Landscape)</span>
                      </label>
                      {activePreset && (
                        <button
                          type="button"
                          onClick={handleInjectPresetStyle}
                          className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline flex items-center gap-1 font-medium transition-colors"
                          title="Sisipkan deskripsi gaya dari preset aktif"
                        >
                          <Palette className="w-3 h-3" />
                          <span>Sisipkan Preset: {activePreset.name}</span>
                        </button>
                      )}
                    </div>

                    <Textarea
                      value={thumbnailPrompt}
                      onChange={(e) => setThumbnailPrompt(e.target.value)}
                      placeholder="A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape)..."
                      rows={4}
                      className="bg-black/40 border-[#2E2E2E] text-xs resize-none leading-relaxed focus:border-red-500/50"
                    />
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                      <span>{thumbnailPrompt.length} karakter</span>
                      <span>Resolusi: 1792 x 1024 px</span>
                    </div>
                  </div>

                  {thumbnailConcept && (
                    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-xs space-y-1">
                      <div className="text-[11px] font-semibold text-red-300 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Konsep Visual AI:</span>
                      </div>
                      <p className="text-slate-300 text-[11px] leading-relaxed">
                        {thumbnailConcept}
                      </p>
                    </div>
                  )}

                  {/* Generate Button */}
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
              )}

              {/* TAB 5: METADATA YOUTUBE (JUDUL, DESKRIPSI & TAGS) */}
              {activeSettingsTab === "metadata" && (
                <div className="space-y-4">
                  <div className="pb-2 border-b border-[#262626]">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Packaging Judul, Deskripsi & Tags SEO</span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Optimalkan metadata video untuk rekomendasi feed dan pencarian YouTube
                    </p>
                  </div>

                  {/* AI Metadata Trigger */}
                  <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                          Sudut Pandang (Focus Angle)
                        </label>
                        <select
                          value={focusAngle}
                          onChange={(e) => setFocusAngle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-[#2E2E2E] text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="curiosity_gap">Curiosity Gap Maksimal (Penasaran)</option>
                          <option value="question">Pertanyaan Provokatif & Diskusi</option>
                          <option value="storytelling">Storytelling & Kisah Nyata</option>
                          <option value="educational">Edukatif, Ilmiah & Fakta</option>
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

                    {/* Locked Language Status Banner */}
                    <div className="flex items-center justify-between p-2.5 bg-black/40 rounded-xl border border-[#2E2E2E]">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Bahasa Output:</span>
                        {ytLanguage === "en" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/25">
                            <span>🇬🇧</span> English (EN)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/25">
                            <span>🇮🇩</span> Indonesia (ID)
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground/75 font-mono">
                        🔒 Mengikuti Naskah Tab 1
                      </span>
                    </div>

                    <Button
                      onClick={() => generateMetadataMutation.mutate()}
                      disabled={isMetadataGenerating}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold py-2 shadow-lg shadow-emerald-600/20"
                    >
                      {isMetadataGenerating ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
                          <span>Menganalisis Naskah & Merancang Metadata...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 mr-2" />
                          <span>Generate Paket Metadata YouTube AI</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Title & Options */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-red-400" />
                        <span>Judul Video Utama</span>
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(title, "title", "Judul")}
                        className="border-[#2E2E2E] text-xs h-6 gap-1 px-2"
                      >
                        {copiedKey === "title" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                        <span>Salin</span>
                      </Button>
                    </div>

                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Contoh: Rahasia Terbesar di Lautan yang Tak Pernah Terungkap"
                      className="bg-black/40 border-[#2E2E2E] text-xs font-semibold text-white focus:border-red-500/50"
                    />

                    {titleOptions.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[#262626]">
                        <span className="text-[10px] text-muted-foreground block font-semibold">
                          Opsi Alternatif Judul (Klik untuk pakai):
                        </span>
                        {titleOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setTitle(opt);
                              showToast(`Judul diterapkan: "${opt}"`, "info");
                            }}
                            className={`p-2 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between group ${
                              title === opt
                                ? "bg-red-500/10 border-red-500/30 text-white"
                                : "bg-black/30 border-[#262626] text-slate-300 hover:bg-[#222] hover:border-slate-500"
                            }`}
                          >
                            <span className="line-clamp-1 font-medium">{opt}</span>
                            <ArrowRight className="w-3 h-3 text-red-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Deskripsi & Timestamps</span>
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(description, "desc", "Deskripsi")}
                        className="border-[#2E2E2E] text-xs h-6 gap-1 px-2"
                      >
                        {copiedKey === "desc" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                        <span>Salin Deskripsi</span>
                      </Button>
                    </div>

                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      className="bg-black/40 border-[#2E2E2E] text-xs leading-relaxed font-mono resize-none focus:border-emerald-500/50"
                    />
                  </div>

                  {/* Tags */}
                  <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-[#2E2E2E]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-violet-400" />
                        <span>Tag Pencarian YouTube</span>
                      </label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(tagsInput, "tags", "Tag YouTube")}
                        className="border-[#2E2E2E] text-xs h-6 gap-1 px-2"
                      >
                        {copiedKey === "tags" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                        <span>Salin Tag</span>
                      </Button>
                    </div>

                    <Input
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="tag1, tag2, tag3, cara membuat video..."
                      className="bg-black/40 border-[#2E2E2E] text-xs"
                    />

                    {tagsInput.trim() && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {tagsInput
                          .split(",")
                          .map((t) => t.trim())
                          .filter((t) => t.length > 0)
                          .map((t, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20 text-[10px] font-medium"
                            >
                              #{t}
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

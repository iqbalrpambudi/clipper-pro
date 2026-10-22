"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Stamp,
  Music2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Eye,
  Play,
  Pause,
  UploadCloud,
  CheckCircle2,
  Sliders,
  Info,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Project, WatermarkConfig } from "@/types";
import { Button, Badge } from "@/components/ui";
import { useStudioStore } from "@/lib/store";
import { WatermarkOverlay } from "@/components/watermark/WatermarkOverlay";
import { WatermarkCustomizePanel } from "@/components/watermark/WatermarkCustomizePanel";

interface StoryboardWatermarkTabProps {
  project: Project;
}

const BGM_MOODS = [
  {
    id: "cinematic",
    name: "Cinematic Ambient",
    genre: "Orchestral / Film",
    desc: "Suasana megah & emosional, sangat cocok untuk alur cerita dramatis",
    duration: "2:45",
    color: "from-[#EAF0F5] to-[#E3EBF2]",
    border: "border-[#CFDDE9]",
  },
  {
    id: "lofi",
    name: "Lo-Fi Chill Beats",
    genre: "Chillhop / Relax",
    desc: "Ritme santai tidak mengganggu konsentrasi, pas untuk narasi edukatif & fakta",
    duration: "3:10",
    color: "from-[#F7EFE0] to-[#F0E4CE]",
    border: "border-[#E8D9BC]",
  },
  {
    id: "dramatic",
    name: "Epic Trailer & Mystery",
    genre: "Suspense / Tension",
    desc: "Ketegangan tinggi dengan dentuman drum sinematik untuk adegan klimaks",
    duration: "2:15",
    color: "from-[#C45B3A]/15 to-[#D4765E]/15",
    border: "border-[#E9C9BD]",
  },
  {
    id: "inspiring",
    name: "Inspiring Corporate",
    genre: "Modern Acoustic",
    desc: "Nuansa positif, optimis, dan memotivasi untuk konten profil atau biografi",
    duration: "2:50",
    color: "from-[#ECF3EB] to-[#DFEBDD]",
    border: "border-[#C9DDCF]",
  },
];

export function StoryboardWatermarkTab({ project }: StoryboardWatermarkTabProps) {
  const { setActiveTab, showToast } = useStudioStore();
  const [activeSubTab, setActiveSubTab] = useState<"watermark" | "bgm">("watermark");

  // Storyboard AI scenes navigation
  const scenes = project.storyboard_items || [];
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);

  // Live watermark state (mirrors project.watermark, synced live to monitor)
  const [liveWatermark, setLiveWatermark] = useState<WatermarkConfig | null>(
    project.watermark || null
  );

  // Sync when project.watermark updates externally
  useEffect(() => {
    if (project.watermark) {
      setLiveWatermark(project.watermark);
    }
  }, [project.watermark]);

  // Preview container measurement for responsive 1:1 scaling
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(640);
  const [showSafeZones, setShowSafeZones] = useState(false);

  useEffect(() => {
    if (!previewRef.current) return;
    const updateSize = () => {
      if (previewRef.current) {
        setContainerWidth(previewRef.current.clientWidth || 640);
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(previewRef.current);
    return () => ro.disconnect();
  }, []);

  const currentScene = scenes[selectedSceneIndex] || scenes[0];

  const handlePrevScene = () => {
    if (selectedSceneIndex > 0) {
      setSelectedSceneIndex(selectedSceneIndex - 1);
    }
  };

  const handleNextScene = () => {
    if (selectedSceneIndex < scenes.length - 1) {
      setSelectedSceneIndex(selectedSceneIndex + 1);
    }
  };

  const queryClient = useQueryClient();

  // Drag position handler for direct interactive positioning on the preview canvas
  const handleCustomPositionChange = (pos: { custom_x: number; custom_y: number }) => {
    if (!liveWatermark) return;
    const next: WatermarkConfig = {
      ...liveWatermark,
      position: "custom",
      custom_x: pos.custom_x,
      custom_y: pos.custom_y,
      enabled: true,
    };
    setLiveWatermark(next);
  };

  const handleDragEnd = async () => {
    if (!liveWatermark) return;
    try {
      await api.updateProject(project.id, { watermark: liveWatermark });
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      // ignore
    }
  };

  // Mock BGM preview state
  const [selectedBgm, setSelectedBgm] = useState<string>("cinematic");
  const [bgmVolume, setBgmVolume] = useState<number>(15);
  const [autoDucking, setAutoDucking] = useState<boolean>(true);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F3F0E8] text-[#26251F]">
      {/* Top Header Bar */}
      <div className="h-14 w-full shrink-0 border-b border-[#E5E1D7] bg-[#FBFAF7]/95 backdrop-blur-md">
        <div className="max-w-[1920px] w-full mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl border border-[#E9C9BD] bg-[#F8EEEA] flex items-center justify-center text-[#C45B3A]">
              <Stamp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-base font-semibold tracking-tight text-[#26251F]">
                  Watermark & Audio Enhancer
                </h1>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                >
                  16:9 Storyboard
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Atur watermark branding dan musik latar sebelum melanjutkan ke tahap Render Final
              </p>
            </div>
          </div>

          {/* Sub-tab navigation */}
          <div className="flex items-center gap-3">
            <div className="flex rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-1">
              <button
                onClick={() => setActiveSubTab("watermark")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeSubTab === "watermark"
                    ? "bg-[#C45B3A] text-white shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
              >
                <Stamp className="w-3.5 h-3.5" />
                <span>Watermark & Branding</span>
                {liveWatermark?.enabled && <span className="w-2 h-2 rounded-full bg-[#456A4E]" />}
              </button>
              <button
                onClick={() => setActiveSubTab("bgm")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                  activeSubTab === "bgm"
                    ? "bg-[#C45B3A] text-white shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>Musik Latar (BGM)</span>
                <span className="px-1.5 py-0.2 text-[9px] rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD] font-semibold">
                  Baru
                </span>
              </button>
            </div>

            <Button
              onClick={() => setActiveTab("storyboard_render")}
              variant="workspace-primary"
              className="h-9 gap-2 text-xs"
            >
              <span>Lanjut ke Render 16:9</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeSubTab === "watermark" ? (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Side: Non-playable 16:9 AI Scene Canvas Preview */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-r border-[#E5E1D7] bg-[#F3F0E8] p-4">
            {/* Preview Toolbar */}
            <div className="mb-3 flex shrink-0 items-center justify-between rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] px-3.5 py-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevScene}
                  disabled={selectedSceneIndex <= 0}
                  className="h-7 w-7 p-0 border-[#E5E1D7]"
                  title="Adegan Sebelumnya"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedSceneIndex}
                    onChange={(e) => setSelectedSceneIndex(Number(e.target.value))}
                    className="rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-xs text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                  >
                    {scenes.length > 0 ? (
                      scenes.map((sc, idx) => (
                        <option key={sc.id || idx} value={idx}>
                          Slot #{idx + 1}: {sc.chapter_title || `Scene ${idx + 1}`} (
                          {sc.duration ? `${sc.duration.toFixed(1)}s` : "0s"})
                        </option>
                      ))
                    ) : (
                      <option value={0}>Simulasi Canvas 16:9 (Tanpa Gambar)</option>
                    )}
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextScene}
                  disabled={selectedSceneIndex >= scenes.length - 1}
                  className="h-7 w-7 p-0 border-[#E5E1D7]"
                  title="Adegan Berikutnya"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* View options: Safe Zones and Badge */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSafeZones(!showSafeZones)}
                  className={`h-7 text-xs gap-1.5 border-[#E5E1D7] ${
                    showSafeZones
                      ? "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                      : "text-muted-foreground"
                  }`}
                  title="Batas aman YouTube player & border (Title & Action Safe)"
                >
                  <Eye className="w-3 h-3" />
                  <span>Batas Aman</span>
                </Button>

                <Badge
                  variant="outline"
                  className="text-[10px] text-muted-foreground border-[#E5E1D7] hidden sm:inline-flex"
                >
                  Drag Watermark Bebas
                </Badge>
              </div>
            </div>

            {/* 16:9 Video Canvas Frame - Automatically fits visible screen space */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-1 relative overflow-hidden">
              <div
                ref={previewRef}
                className="group relative flex aspect-video h-full w-auto max-h-full max-w-full shrink-0 select-none items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5E1D7] bg-[#FFFEFA] shadow-lg"
              >
                {/* AI Scene Image or Artistic Empty State */}
                {currentScene?.image_url ? (
                  <img
                    src={currentScene.image_url}
                    alt={currentScene.chapter_title || "Adegan AI"}
                    className="w-full h-full object-cover transition duration-300"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#121218] via-[#101014] to-[#0a0a0c] p-6 text-center">
                    <div className="w-12 h-12 rounded-2xl border border-[#E9C9BD] bg-[#F8EEEA] flex items-center justify-center text-[#C45B3A] mb-2">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="font-semibold text-xs text-foreground">
                      {currentScene?.chapter_title || "Ilustrasi Adegan AI"}
                    </div>
                    <p className="text-[11px] text-muted-foreground max-w-md mt-1 line-clamp-2">
                      {currentScene?.script_text ||
                        "Slot adegan ini belum memiliki render ilustrasi. Watermark tetap dapat disimulasikan di atas canvas 16:9 ini."}
                    </p>
                  </div>
                )}

                {/* Subtle vignette shadow overlay */}
                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/20" />

                {/* Live Draggable Watermark Overlay (Text or Custom Image) */}
                <WatermarkOverlay
                  watermark={liveWatermark}
                  containerWidth={containerWidth}
                  isDraggable={true}
                  onCustomPositionChange={handleCustomPositionChange}
                  onDragEnd={handleDragEnd}
                />

                {/* Optional Safe Area Guides Overlay (YouTube Safe Zones) */}
                {showSafeZones && (
                  <div className="absolute inset-0 pointer-events-none z-30">
                    {/* Action safe 5% */}
                    <div className="absolute inset-[5%] border border-dashed border-[#C45B3A]/50 rounded-lg flex items-start justify-end p-2">
                      <span className="text-[9px] font-mono text-white/90 bg-black/60 px-1 rounded">
                        Action Safe 90%
                      </span>
                    </div>
                    {/* Title safe 10% */}
                    <div className="absolute inset-[10%] border border-dotted border-[#456A4E]/50 rounded-lg flex items-end justify-start p-2">
                      <span className="text-[9px] font-mono text-white/90 bg-black/60 px-1 rounded">
                        Title Safe 80% (Disarankan untuk Logo)
                      </span>
                    </div>
                  </div>
                )}

                {/* Canvas watermark disabled banner */}
                {(!liveWatermark || !liveWatermark.enabled) && (
                  <div className="absolute bottom-3 left-3 z-20 pointer-events-none">
                    <Badge
                      variant="outline"
                      className="bg-black/80 text-muted-foreground border-[#E5E1D7] text-[10px] backdrop-blur-sm"
                    >
                      Watermark Dinonaktifkan
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom: Scene Thumbnails Carousel Strip */}
            {scenes.length > 0 && (
              <div className="mt-2.5 shrink-0 border-t border-[#E5E1D7] pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      Uji Kontras pada Adegan AI
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      (Klik adegan untuk memeriksa keterbacaan watermark)
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {scenes.length} Slot Adegan
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {scenes.map((sc, idx) => {
                    const isSelected = idx === selectedSceneIndex;
                    return (
                      <button
                        key={sc.id || idx}
                        type="button"
                        onClick={() => setSelectedSceneIndex(idx)}
                        className={`group relative shrink-0 w-24 aspect-[16/9] rounded-lg overflow-hidden border transition text-left ${
                          isSelected
                            ? "border-[#C45B3A] ring-2 ring-[#C45B3A]/30 scale-[1.03]"
                            : "border-[#E5E1D7] hover:border-[#444] opacity-70 hover:opacity-100"
                        }`}
                      >
                        {sc.image_url ? (
                          <img
                            src={sc.image_url}
                            alt={sc.chapter_title || `Scene ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-[#F1EEE6] flex items-center justify-center text-[10px] text-muted-foreground">
                            Slot #{idx + 1}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-[8.5px] text-white truncate font-medium">
                          #{idx + 1} {sc.chapter_title || "Scene"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Watermark Customizer Inspector Panel with Inner Scroll */}
          <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-[#E5E1D7] bg-[#FBFAF7] lg:w-[420px] lg:border-t-0 xl:w-[460px]">
            <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-5 space-y-4 scrollbar-thin scrollbar-thumb-[#333] hover:scrollbar-thumb-[#444]">
              <WatermarkCustomizePanel
                project={{ ...project, watermark: liveWatermark }}
                onWatermarkChange={(wm) => setLiveWatermark(wm)}
              />

              {/* Quick Helper Tip */}
              <div className="mt-4 p-3.5 rounded-xl bg-[#F8EEEA] border border-[#E9C9BD] text-xs text-muted-foreground flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#C45B3A] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-foreground text-[11px] block">
                    Tips Branding Watermark
                  </span>
                  <p className="text-[11px] leading-relaxed">
                    Gunakan format PNG transparan dengan resolusi minimal 300px untuk logo. Posisi
                    kanan bawah atau kiri atas adalah standar industri yang tidak mengganggu teks
                    subtitle narasi.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Future Feature Showcase: Background Music (BGM) Studio */
        <div className="flex-1 min-h-0 p-6 lg:p-10 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          <div className="bg-gradient-to-r from-[#F8EEEA] via-[#FBFAF7] to-transparent p-6 rounded-2xl border border-[#E9C9BD]">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div className="w-8 h-8 rounded-lg bg-[#F8EEEA] border border-[#E9C9BD] flex items-center justify-center text-[#C45B3A]">
                    <Music2 className="w-4 h-4" />
                  </div>
                  <h2 className="font-serif text-lg font-semibold text-[#26251F]">
                    Musik Latar / Background Music (BGM)
                  </h2>
                  <Badge className="bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD] text-[10px]">
                    Preview Integrasi
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  Integrasikan musik latar sinematik bebas royalti atau unggah audio kustom Anda
                  sendiri. Dilengkapi dengan auto-ducking cerdas agar narasi suara AI tetap
                  terdengar jernih dan dominan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    showToast("Fitur audio mixing BGM sedang dalam finalisasi", "info")
                  }
                  className="border-[#E5E1D7] text-xs"
                >
                  Daftar Notifikasi Rilis
                </Button>
              </div>
            </div>
          </div>

          {/* Curated BGM Library */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#26251F]">
                  <Sparkles className="w-4 h-4 text-[#C45B3A]" />
                  Pustaka Mood Sinematik Bebas Royalti
                </h3>
                <p className="text-xs text-muted-foreground">
                  Pilih nuansa musik yang selaras dengan topik dan ritme cerita Anda
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {BGM_MOODS.map((bgm) => {
                const isSelected = selectedBgm === bgm.id;
                return (
                  <div
                    key={bgm.id}
                    onClick={() => setSelectedBgm(bgm.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between group ${
                      isSelected
                        ? "bg-[#F8EEEA] border-[#C45B3A] shadow-sm"
                        : "bg-[#FFFEFA] border-[#E5E1D7] hover:border-[#BEB6A5]"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPlayingPreview(!isPlayingPreview);
                          }}
                          className="w-10 h-10 rounded-xl bg-[#F8EEEA] group-hover:bg-[#C45B3A] border border-[#E9C9BD] group-hover:border-[#C45B3A] flex items-center justify-center text-[#C45B3A] group-hover:text-white transition"
                        >
                          {isSelected && isPlayingPreview ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 ml-0.5" />
                          )}
                        </button>
                        <div>
                          <div className="font-bold text-sm text-foreground flex items-center gap-2">
                            {bgm.name}
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#C45B3A]" />}
                          </div>
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                            {bgm.genre} • Durasi {bgm.duration}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                      {bgm.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audio Mixing & Auto-Ducking Controls (Preview) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7] space-y-4">
              <h4 className="text-xs font-bold text-[#26251F] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#C45B3A]" />
                Kontrol Mixer Audio & Auto-Ducking
              </h4>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Volume Musik Latar (BGM)</span>
                  <span className="font-mono font-semibold text-[#26251F]">{bgmVolume}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="1"
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                  className="w-full accent-[#C45B3A] h-1.5 bg-[#E5E1D7] rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Disarankan 12% - 18% agar narasi tetap dominan dan jelas
                </span>
              </div>

              <label className="flex items-center justify-between p-3 rounded-lg bg-[#FBFAF7] border border-[#E5E1D7] cursor-pointer">
                <div>
                  <div className="font-semibold text-xs text-foreground">
                    Auto-Ducking Narasi Cerdas
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Otomatis turunkan volume musik saat narator berbicara
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoDucking}
                  onChange={(e) => setAutoDucking(e.target.checked)}
                  className="rounded border-[#E5E1D7] text-[#C45B3A] focus:ring-[#C45B3A]/30 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            {/* Custom Audio Upload */}
            <div className="p-4 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7] flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-[#26251F] flex items-center gap-2 mb-2">
                  <UploadCloud className="w-4 h-4 text-[#C45B3A]" />
                  Upload Lagu / Backsound Kustom
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Punya file audio BGM sendiri? Unggah lagu MP3 atau WAV bebas hak cipta untuk
                  digabungkan ke dalam render akhir.
                </p>
              </div>

              <div className="mt-4 border-2 border-dashed border-[#E5E1D7] hover:border-[#C45B3A] rounded-xl p-5 text-center cursor-pointer transition bg-[#FBFAF7]">
                <UploadCloud className="w-6 h-6 text-[#C45B3A] mx-auto mb-1.5" />
                <div className="text-xs font-semibold text-[#26251F]">
                  Pilih File Audio (MP3 / WAV)
                </div>
                <span className="text-[10px] text-muted-foreground">Maksimal durasi 10 menit</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

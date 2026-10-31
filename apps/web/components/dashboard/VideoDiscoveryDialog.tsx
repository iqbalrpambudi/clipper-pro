"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  Clock3,
  Eye,
  Check,
  Loader2,
  HardHat,
  Sprout,
  Factory,
  Hammer,
  Mountain,
  Youtube,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Button,
  Input,
  Switch,
} from "@/components/ui";
import { api } from "@/lib/api";
import { VideoCandidate } from "@/types";

interface VideoDiscoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VideoDiscoveryDialog({
  open,
  onOpenChange,
}: VideoDiscoveryDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [selectedPresetId, setSelectedPresetId] = useState<string>("farming");
  const [customQuery, setCustomQuery] = useState<string>("");
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [excludeAi, setExcludeAi] = useState<boolean>(true);
  const [defaultResolution, setDefaultResolution] = useState<string>("720p");
  const [cardResolutions, setCardResolutions] = useState<Record<string, string>>({});
  const [importingVideoId, setImportingVideoId] = useState<string | null>(null);

  // Fetch preset categories
  const { data: presets = [], isLoading: isLoadingPresets } = useQuery({
    queryKey: ["discovery-presets"],
    queryFn: api.getDiscoveryPresets,
    staleTime: 10 * 60 * 1000,
    enabled: open,
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: (params: {
      presetId?: string;
      customQuery?: string;
      excludeAi: boolean;
    }) =>
      api.searchVideoCandidates({
        preset_id: params.presetId,
        custom_query: params.customQuery,
        exclude_ai: params.excludeAi,
        min_duration: 300,
        max_duration: 1800,
        min_views: 20000,
        limit: 9,
      }),
  });

  // Trigger search on dialog open or preset change
  useEffect(() => {
    if (open && presets.length > 0 && !isCustomMode) {
      searchMutation.mutate({
        presetId: selectedPresetId,
        excludeAi,
      });
    }
  }, [open, selectedPresetId, excludeAi, isCustomMode, presets.length]);

  const handleSelectPreset = (presetId: string) => {
    setIsCustomMode(false);
    setSelectedPresetId(presetId);
    searchMutation.mutate({
      presetId,
      excludeAi,
    });
  };

  const handleCustomSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customQuery.trim()) return;
    setIsCustomMode(true);
    searchMutation.mutate({
      customQuery: customQuery.trim(),
      excludeAi,
    });
  };

  // Import mutation with download resolution
  const importMutation = useMutation({
    mutationFn: (params: { candidate: VideoCandidate; downloadResolution: string }) =>
      api.importDiscoveredVideo({
        url: params.candidate.url,
        title: params.candidate.title,
        project_name: params.candidate.title,
        aspect_ratio: "9:16",
        resolution: "1080p",
        download_resolution: params.downloadResolution,
        language: "id",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      // Redirect langsung ke halaman workspace project short video yang sedang memproses media
      router.push(`/project/short/${data.project_id}`);
    },
    onError: (err: Error) => {
      setImportingVideoId(null);
      alert(err.message || "Gagal mengimport video ke project");
    },
  });

  const handleImport = (candidate: VideoCandidate) => {
    setImportingVideoId(candidate.id);
    const chosenRes = cardResolutions[candidate.id] || defaultResolution || "720p";
    importMutation.mutate({
      candidate,
      downloadResolution: chosenRes,
    });
  };

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case "Sprout":
        return <Sprout className="h-4 w-4" />;
      case "HardHat":
        return <HardHat className="h-4 w-4" />;
      case "Factory":
        return <Factory className="h-4 w-4" />;
      case "Hammer":
        return <Hammer className="h-4 w-4" />;
      case "Mountain":
        return <Mountain className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  const candidates = searchMutation.data?.candidates || [];
  const isSearching = searchMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/60 bg-background/95 backdrop-blur shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                  <Youtube className="h-5 w-5" />
                </span>
                Cari Sumber Video Otomatis
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Eksplor kandidat video berkualitas tinggi (5–25 menit) dengan aksi visual padat yang siap diolah menjadi video pendek AI.
              </DialogDescription>
            </div>

            {/* Header Controls: Resolution & AI Exclusion Toggle */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {/* Default Resolution Selector */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border/60 text-xs">
                <span className="text-muted-foreground text-xs font-medium">Resolusi:</span>
                <select
                  value={defaultResolution}
                  onChange={(e) => setDefaultResolution(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                  title="Default Resolusi Download untuk Semua Video"
                >
                  <option value="720p">720p (Cepat & Direkomendasikan)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="480p">480p (Super Cepat)</option>
                  <option value="best">Auto (Maksimal)</option>
                </select>
              </div>

              {/* AI Exclusion Toggle Badge */}
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Pengecualian Video AI</span>
                <Switch
                  checked={excludeAi}
                  onCheckedChange={(checked) => setExcludeAi(checked)}
                  className="scale-75 data-[state=checked]:bg-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Preset Category Pills */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isLoadingPresets ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Memuat preset kategori...
              </div>
            ) : (
              presets.map((preset) => {
                const isActive = !isCustomMode && selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.02]"
                        : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                    }`}
                  >
                    {getPresetIcon(preset.icon_name)}
                    {preset.title.split("&")[0].trim()}
                  </button>
                );
              })
            )}

            {/* Custom Search Toggle Button */}
            <button
              type="button"
              onClick={() => setIsCustomMode(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isCustomMode
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.02]"
                  : "bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
              }`}
            >
              <Search className="h-3.5 w-3.5" />
              Cari Topik Bebas
            </button>
          </div>

          {/* Custom Search Bar (if in custom mode) */}
          {isCustomMode && (
            <form onSubmit={handleCustomSearch} className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Contoh: hydraulic press industrial, bridge construction time lapse..."
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                  autoFocus
                />
              </div>
              <Button type="submit" size="sm" className="h-9 px-4 text-xs font-semibold gap-1.5" disabled={isSearching}>
                {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Cari
              </Button>
            </form>
          )}

          {/* Current Search Status Bar */}
          <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Kata kunci:{" "}
                <strong className="text-foreground font-medium">
                  {searchMutation.data?.query_used || "Memuat..."}
                </strong>
              </span>
              {excludeAi && (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium hidden sm:inline">
                  • Filter Aktif: Bebas Sora/Runway/Kling & Non-Vlog
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (isCustomMode) handleCustomSearch();
                else if (selectedPresetId) handleSelectPreset(selectedPresetId);
              }}
              disabled={isSearching}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isSearching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Video Candidate Results Grid */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isSearching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-xl border border-border/60 bg-card p-3 space-y-3 animate-pulse">
                  <div className="w-full aspect-video rounded-lg bg-muted/80" />
                  <div className="h-4 bg-muted/80 rounded w-5/6" />
                  <div className="h-3 bg-muted/60 rounded w-1/2" />
                  <div className="h-8 bg-muted/50 rounded-lg w-full mt-2" />
                </div>
              ))}
            </div>
          ) : searchMutation.isError ? (
            <div className="py-12 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              <p className="text-sm font-semibold text-foreground">Gagal mencari video YouTube</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchMutation.error instanceof Error
                  ? searchMutation.error.message
                  : "Terjadi kesalahan saat memproses pencarian."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectPreset(selectedPresetId)}
                className="text-xs"
              >
                Coba Lagi
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Youtube className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-semibold text-foreground">Tidak ada video yang memenuhi kriteria</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Coba pilih kategori preset lain atau gunakan pencarian topik bebas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {candidates.map((candidate) => {
                const isImporting = importingVideoId === candidate.id;
                const currentRes = cardResolutions[candidate.id] || defaultResolution;

                return (
                  <div
                    key={candidate.id}
                    className="group flex flex-col rounded-xl border border-border/70 bg-card hover:border-primary/50 transition-all hover:shadow-md overflow-hidden"
                  >
                    {/* Thumbnail Container */}
                    <div className="relative aspect-video w-full bg-black/90 overflow-hidden">
                      {candidate.thumbnail ? (
                        <img
                          src={candidate.thumbnail}
                          alt={candidate.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Youtube className="h-8 w-8" />
                        </div>
                      )}

                      {/* Views Badge */}
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-xs font-medium text-white backdrop-blur-sm">
                        <Eye className="h-3 w-3" />
                        {candidate.views_str}
                      </span>

                      {/* Duration Badge */}
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-xs font-medium text-white backdrop-blur-sm">
                        <Clock3 className="h-3 w-3" />
                        {candidate.duration_str}
                      </span>

                      {/* Already Imported Overlay */}
                      {candidate.is_already_imported && (
                        <div className="absolute inset-x-0 top-0 bg-amber-500/90 text-amber-950 font-semibold text-xs px-2 py-1 flex items-center justify-center gap-1 backdrop-blur-sm">
                          <Check className="h-3 w-3" />
                          Sudah diimport di project: &quot;{candidate.existing_project_name || "Project"}&quot;
                        </div>
                      )}
                    </div>

                    {/* Metadata Content */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h4
                          className="text-xs font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors"
                          title={candidate.title}
                        >
                          {candidate.title}
                        </h4>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate max-w-[180px]">{candidate.channel}</span>
                          <a
                            href={candidate.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline"
                            title="Buka di YouTube"
                          >
                            <span>YouTube</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </div>

                      {/* Action Controls: Resolution Selector & Use Button */}
                      <div>
                        {candidate.is_already_imported && candidate.existing_project_id ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs font-medium h-8 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 truncate"
                              onClick={() => {
                                onOpenChange(false);
                                router.push(`/project/short/${candidate.existing_project_id}`);
                              }}
                            >
                              Buka Project Terkait
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-8 px-2 text-xs shrink-0"
                              title="Buat project baru tetap dari video ini"
                              disabled={isImporting}
                              onClick={() => handleImport(candidate)}
                            >
                              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {/* Download Resolution Selector Beside Button */}
                            <select
                              value={currentRes}
                              onChange={(e) =>
                                setCardResolutions((prev) => ({
                                  ...prev,
                                  [candidate.id]: e.target.value,
                                }))
                              }
                              className="h-8 px-2 text-xs font-semibold rounded-md border border-border/80 bg-background text-foreground hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shrink-0"
                              title="Pilih Resolusi Download (720p dianjurkan agar cepat)"
                            >
                              <option value="720p">720p (Cepat)</option>
                              <option value="1080p">1080p (Full HD)</option>
                              <option value="480p">480p (Ringan)</option>
                              <option value="best">Auto (Maks)</option>
                            </select>

                            {/* Main Action Button */}
                            <Button
                              size="sm"
                              className="flex-1 text-xs font-semibold h-8 gap-1.5 shadow-sm min-w-0"
                              disabled={isImporting}
                              onClick={() => handleImport(candidate)}
                            >
                              {isImporting ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                                  <span className="truncate">Menyiapkan...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">Gunakan Video Ini</span>
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

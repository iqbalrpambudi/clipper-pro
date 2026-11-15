import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  Wrench,
  Globe,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  EyeOff,
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

const ALL_SOURCES = ["youtube", "dailymotion", "archive_org", "bilibili"] as const;

const SOURCE_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "Semua Sumber" },
  { id: "youtube", label: "YouTube" },
  { id: "dailymotion", label: "Dailymotion" },
  { id: "archive_org", label: "Archive.org" },
  { id: "bilibili", label: "Bilibili" },
];

const SOURCE_BADGE_STYLES: Record<string, string> = {
  youtube: "bg-red-600/90 text-white",
  dailymotion: "bg-sky-600/90 text-white",
  archive_org: "bg-amber-700/90 text-white",
  bilibili: "bg-pink-600/90 text-white",
};

export function VideoDiscoveryDialog({
  open,
  onOpenChange,
}: VideoDiscoveryDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [selectedPresetId, setSelectedPresetId] = useState<string>("factory");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [customQuery, setCustomQuery] = useState<string>("");
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [excludeAi, setExcludeAi] = useState<boolean>(true);
  const [hideImported, setHideImported] = useState<boolean>(true);
  const [defaultResolution, setDefaultResolution] = useState<string>("720p");
  const [cardResolutions, setCardResolutions] = useState<Record<string, string>>({});
  const [importingVideoId, setImportingVideoId] = useState<string | null>(null);
  const [seenUrls, setSeenUrls] = useState<string[]>([]);
  const seenUrlsRef = useRef<string[]>([]);

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
      source: string;
      page: number;
      excludeAi: boolean;
      hideImported: boolean;
      excludeUrls?: string[];
    }) =>
      api.searchVideoCandidates({
        preset_id: params.presetId,
        custom_query: params.customQuery,
        sources: params.source === "all" ? [...ALL_SOURCES] : [params.source],
        page: params.page,
        exclude_ai: params.excludeAi,
        hide_imported: params.hideImported,
        exclude_urls: params.excludeUrls || [],
        min_duration: 120,
        max_duration: 1500,
        min_views: 0,
        limit: 18,
      }),
    onSuccess: (data, variables) => {
      if (variables.page <= 1) {
        const initial = data.candidates.map((c) => c.url);
        seenUrlsRef.current = initial;
        setSeenUrls(initial);
      } else {
        const merged = Array.from(
          new Set([...seenUrlsRef.current, ...data.candidates.map((c) => c.url)])
        );
        seenUrlsRef.current = merged;
        setSeenUrls(merged);
      }
    },
  });

  const triggerSearch = (overrides?: {
    presetId?: string;
    custom?: boolean;
    query?: string;
    source?: string;
    targetPage?: number;
    nextExcludeAi?: boolean;
    nextHideImported?: boolean;
    excludeUrls?: string[];
  }) => {
    const useCustom = overrides?.custom ?? isCustomMode;
    const targetPreset = overrides?.presetId ?? selectedPresetId;
    const targetQuery = overrides?.query ?? customQuery.trim();
    const targetSource = overrides?.source ?? selectedSource;
    const targetPage = overrides?.targetPage ?? page;
    const nextExcludeAi = overrides?.nextExcludeAi ?? excludeAi;
    const nextHideImported = overrides?.nextHideImported ?? hideImported;
    const nextExcludeUrls =
      overrides?.excludeUrls ?? (targetPage > 1 ? seenUrlsRef.current : []);

    if (useCustom && !targetQuery) return;

    searchMutation.mutate({
      presetId: useCustom ? undefined : targetPreset,
      customQuery: useCustom ? targetQuery : undefined,
      source: targetSource,
      page: targetPage,
      excludeAi: nextExcludeAi,
      hideImported: nextHideImported,
      excludeUrls: nextExcludeUrls,
    });
  };

  // Trigger initial search when dialog opens & presets are ready
  useEffect(() => {
    if (!open || presets.length === 0) return;
    const validPreset = presets.some((p) => p.id === selectedPresetId)
      ? selectedPresetId
      : presets[0].id;
    if (validPreset !== selectedPresetId) {
      setSelectedPresetId(validPreset);
    }
    if (!isCustomMode) {
      triggerSearch({ presetId: validPreset, targetPage: page, excludeUrls: [] });
    }
  }, [open, presets.length]);

  const handleSelectPreset = (presetId: string) => {
    setIsCustomMode(false);
    setSelectedPresetId(presetId);
    setPage(1);
    seenUrlsRef.current = [];
    setSeenUrls([]);
    triggerSearch({ presetId, custom: false, targetPage: 1, excludeUrls: [] });
  };

  const handleSelectSource = (sourceId: string) => {
    setSelectedSource(sourceId);
    setPage(1);
    seenUrlsRef.current = [];
    setSeenUrls([]);
    triggerSearch({ source: sourceId, targetPage: 1, excludeUrls: [] });
  };

  const handleCustomSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customQuery.trim()) return;
    setIsCustomMode(true);
    setPage(1);
    seenUrlsRef.current = [];
    setSeenUrls([]);
    triggerSearch({ custom: true, query: customQuery.trim(), targetPage: 1, excludeUrls: [] });
  };

  const handlePageChange = (nextPage: number) => {
    const safePage = Math.max(1, nextPage);
    setPage(safePage);
    if (safePage === 1) {
      seenUrlsRef.current = [];
      setSeenUrls([]);
      triggerSearch({ targetPage: 1, excludeUrls: [] });
    } else {
      triggerSearch({ targetPage: safePage, excludeUrls: seenUrlsRef.current });
    }
  };

  const handleToggleExcludeAi = (checked: boolean) => {
    setExcludeAi(checked);
    setPage(1);
    seenUrlsRef.current = [];
    setSeenUrls([]);
    triggerSearch({ nextExcludeAi: checked, targetPage: 1, excludeUrls: [] });
  };

  const handleToggleHideImported = (checked: boolean) => {
    setHideImported(checked);
    setPage(1);
    seenUrlsRef.current = [];
    setSeenUrls([]);
    triggerSearch({ nextHideImported: checked, targetPage: 1, excludeUrls: [] });
  };

  // Import mutation with download resolution
  const importMutation = useMutation({
    mutationFn: (params: { candidate: VideoCandidate; downloadResolution: string }) =>
      api.importDiscoveredVideo({
        url: params.candidate.url,
        title: params.candidate.title,
        source: params.candidate.source,
        project_name: params.candidate.title,
        aspect_ratio: "9:16",
        resolution: "1080p",
        download_resolution: params.downloadResolution,
        language: "id",
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      navigate(`/project/short/${data.project_id}`);
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
        return <Sprout className="h-3.5 w-3.5" />;
      case "HardHat":
        return <HardHat className="h-3.5 w-3.5" />;
      case "Factory":
        return <Factory className="h-3.5 w-3.5" />;
      case "Hammer":
        return <Hammer className="h-3.5 w-3.5" />;
      case "Mountain":
        return <Mountain className="h-3.5 w-3.5" />;
      case "Wrench":
        return <Wrench className="h-3.5 w-3.5" />;
      default:
        return <Sparkles className="h-3.5 w-3.5" />;
    }
  };

  const candidates = searchMutation.data?.candidates || [];
  const skippedImportedCount = searchMutation.data?.skipped_imported_count || 0;
  const isSearching = searchMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-border/60 bg-background/95 backdrop-blur shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Globe className="h-5 w-5" />
                </span>
                Cari Sumber Video Multi-Platform
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Eksplor video dokumenter &amp; proses (2–25 menit) dari YouTube, Dailymotion, Archive.org, dan Bilibili.
              </DialogDescription>
            </div>

            {/* Header Controls: Resolution, Hide Imported & AI Exclusion Toggle */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Default Resolution Selector */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border border-border/60 text-xs">
                <span className="text-muted-foreground text-xs font-medium">Resolusi:</span>
                <select
                  value={defaultResolution}
                  onChange={(e) => setDefaultResolution(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                  title="Default Resolusi Download untuk Semua Video"
                >
                  <option value="720p">720p (Cepat)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="480p">480p (Ringan)</option>
                  <option value="best">Auto (Maks)</option>
                </select>
              </div>

              {/* Hide Already Imported Toggle (Default ON) */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
                <EyeOff className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Sembunyikan Terpakai</span>
                <Switch
                  checked={hideImported}
                  onCheckedChange={handleToggleHideImported}
                  className="scale-75 data-[state=checked]:bg-amber-600"
                />
              </div>

              {/* AI Exclusion Toggle Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Bebas AI</span>
                <Switch
                  checked={excludeAi}
                  onCheckedChange={handleToggleExcludeAi}
                  className="scale-75 data-[state=checked]:bg-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Source Filter Pills */}
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Sumber:</span>
            {SOURCE_OPTIONS.map((src) => {
              const active = selectedSource === src.id;
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => handleSelectSource(src.id)}
                  disabled={isSearching}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    active
                      ? "bg-foreground text-background shadow-sm"
                      : "bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/50"
                  }`}
                >
                  {src.label}
                </button>
              );
            })}
          </div>

          {/* Preset Category Pills */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
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

          {/* Custom Search Bar */}
          {isCustomMode && (
            <form onSubmit={handleCustomSearch} className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Contoh: hydraulic press industrial, glassblowing artisan process..."
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
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Variasi #{page}:{" "}
                <strong className="text-foreground font-medium">
                  {searchMutation.data?.query_used || "Memuat..."}
                </strong>
              </span>
              {skippedImportedCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium">
                  {skippedImportedCount} video terpakai dilewati
                </span>
              )}
              {excludeAi && (
                <span className="text-emerald-700 dark:text-emerald-400 font-medium hidden md:inline">
                  • Bebas AI &amp; Non-Vlog
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerSearch()}
                disabled={isSearching}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <RefreshCw className={`h-3 w-3 ${isSearching ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <span className="text-border">|</span>
              <button
                type="button"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1 || isSearching}
                className="inline-flex items-center gap-0.5 hover:text-foreground disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="font-mono text-foreground font-semibold">Page {page}</span>
              <button
                type="button"
                onClick={() => handlePageChange(page + 1)}
                disabled={isSearching}
                className="inline-flex items-center gap-0.5 text-primary font-semibold hover:underline disabled:opacity-40 transition-colors"
              >
                Next Page
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
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
              <p className="text-sm font-semibold text-foreground">Gagal mencari sumber video</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchMutation.error instanceof Error
                  ? searchMutation.error.message
                  : "Terjadi kesalahan saat memproses pencarian."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => triggerSearch()}
                className="text-xs"
              >
                Coba Lagi
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Globe className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-sm font-semibold text-foreground">Tidak ada video baru pada variasi ini</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Coba muat variasi berikutnya, ganti sumber platform, atau matikan filter &ldquo;Sembunyikan Terpakai&rdquo;.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => handlePageChange(page + 1)} className="text-xs gap-1">
                  Muat Variasi Berikutnya
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {candidates.map((candidate) => {
                const isImporting = importingVideoId === candidate.id;
                const currentRes = cardResolutions[candidate.id] || defaultResolution;
                const badgeClass =
                  SOURCE_BADGE_STYLES[candidate.source] || "bg-slate-700/90 text-white";

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
                          <Globe className="h-8 w-8" />
                        </div>
                      )}

                      {/* Views Badge */}
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-xs font-medium text-white backdrop-blur-sm">
                        <Eye className="h-3 w-3" />
                        {candidate.views_str}
                      </span>

                      {/* Source Platform Badge */}
                      <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-semibold backdrop-blur-sm ${badgeClass}`}>
                        {candidate.source_label}
                      </span>

                      {/* Duration Badge */}
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-xs font-medium text-white backdrop-blur-sm">
                        <Clock3 className="h-3 w-3" />
                        {candidate.duration_str}
                      </span>

                      {/* Already Imported Overlay */}
                      {candidate.is_already_imported && (
                        <div className="absolute inset-x-0 bottom-0 bg-amber-500/95 text-amber-950 font-semibold text-[11px] px-2 py-1 flex items-center justify-center gap-1 backdrop-blur-sm">
                          <Check className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            Terpakai di: &quot;{candidate.existing_project_name || "Project"}&quot;
                          </span>
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
                          <span className="truncate max-w-[170px]">{candidate.channel}</span>
                          <a
                            href={candidate.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-primary hover:underline shrink-0"
                            title={`Buka di ${candidate.source_label}`}
                          >
                            <span>{candidate.source_label}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div>
                        {candidate.is_already_imported && candidate.existing_project_id ? (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs font-medium h-8 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 truncate"
                              onClick={() => {
                                onOpenChange(false);
                                navigate(`/project/short/${candidate.existing_project_id}`);
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
                              <option value="720p">720p</option>
                              <option value="1080p">1080p</option>
                              <option value="480p">480p</option>
                              <option value="best">Auto</option>
                            </select>

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

        {/* Footer Pagination / Next Page Bar */}
        <div className="px-6 py-3 border-t border-border/60 bg-background/95 flex items-center justify-between text-xs shrink-0">
          <span className="text-muted-foreground">
            Menampilkan <strong>{candidates.length}</strong> kandidat • Page <strong>{page}</strong>
            {seenUrls.length > candidates.length ? ` (${seenUrls.length} total dijelajahi)` : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              disabled={page <= 1 || isSearching}
              onClick={() => handlePageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev Page
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1"
              disabled={isSearching}
              onClick={() => handlePageChange(page + 1)}
            >
              Next Page
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

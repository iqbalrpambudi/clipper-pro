"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Youtube,
  Film,
  Trash2,
  Clock,
  Sparkles,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Play,
  RefreshCw,
  Mic,
  MessageSquare,
  Wrench,
  MoreVertical,
  StopCircle,
} from "lucide-react";
import { ScenePreviewModal } from "./ScenePreviewModal";
import { SourceVideoPlayer } from "./SourceVideoPlayer";
import { StudioTabHeader } from "@/components/layout";
import { useStudioStore } from "@/lib/store";
import { Project, SourceVideo, Scene, YTInfoResponse, YTFormatOption } from "@/types";
import { api } from "@/lib/api";
import {
  useDeleteMedia,
  useCancelMedia,
  useDownloadYT,
  useUploadMedia,
  useModelConfig,
  useYTInfo,
  useRetagScenes,
  useTranscribeScenes,
  useRepairThumbnails,
} from "@/hooks/useMediaPool";
import {
  Button,
  Input,
  Badge,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui";
import { Toolbar, Dropzone, EmptyState } from "@/components/fragments";

interface MediaPoolTabProps {
  project: Project & {
    source_videos: SourceVideo[];
    scenes: Scene[];
  };
}

export function MediaPoolTab({ project }: MediaPoolTabProps) {
  const { activeTask } = useStudioStore();
  const [isYTOpen, setIsYTOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytInfo, setYtInfo] = useState<YTInfoResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [retaggingMode, setRetaggingMode] = useState<"quick" | "force" | null>(null);
  const [downloadingFormatId, setDownloadingFormatId] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<SourceVideo | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});
  const [playerVideo, setPlayerVideo] = useState<SourceVideo | null>(null);

  // Urutkan scene sesuai urutan asli video: source video sequence, lalu scene_index dan start_time
  const sortedScenes = useMemo(() => {
    if (!project.scenes) return [];
    const videoOrderMap = new Map<string, number>();
    (project.source_videos || []).forEach((vid, idx) => {
      videoOrderMap.set(vid.id, idx);
    });

    return [...project.scenes].sort((a, b) => {
      const vOrderA = videoOrderMap.get(a.source_video_id) ?? 0;
      const vOrderB = videoOrderMap.get(b.source_video_id) ?? 0;
      if (vOrderA !== vOrderB) {
        return vOrderA - vOrderB;
      }
      if (a.scene_index !== b.scene_index) {
        return a.scene_index - b.scene_index;
      }
      return a.start_time - b.start_time;
    });
  }, [project.scenes, project.source_videos]);

  // Live Progress State for Scene Retagging (driven by SSE activeTask)
  const [retagProgress, setRetagProgress] = useState(0);
  const [retagStepText, setRetagStepText] = useState("");
  const [retagElapsed, setRetagElapsed] = useState(0);

  // Live Progress State for Scene Audio Transcription
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeStepText, setTranscribeStepText] = useState("");
  const [transcribeElapsed, setTranscribeElapsed] = useState(0);

  const { data: modelConfig } = useModelConfig();
  const inspectYTMutation = useYTInfo(project.id);
  const retagMutation = useRetagScenes(project.id);
  const transcribeMutation = useTranscribeScenes(project.id);
  const repairThumbnailsMutation = useRepairThumbnails(project.id);
  const deleteMutation = useDeleteMedia(project.id);
  const cancelMediaMutation = useCancelMedia(project.id);
  const downloadYTMutation = useDownloadYT(project.id);
  const uploadMediaMutation = useUploadMedia(project.id);

  const brokenCount = Object.keys(brokenThumbnails).length;

  const untaggedCount = project.scenes.filter(
    (s) => !s.description || s.description === "Cuplikan video aksi/aktivitas"
  ).length;

  const untranscribedCount = project.scenes.filter((s) => !s.transcript).length;

  // Sync real-time progress events from SSE for scene_retag
  useEffect(() => {
    if (activeTask && activeTask.task_type === "scene_retag") {
      if (activeTask.status === "progress") {
        setRetagProgress(activeTask.progress);
        setRetagStepText(activeTask.message);
      } else if (activeTask.status === "success") {
        setRetagProgress(100);
        setRetagStepText(activeTask.message || "Tagging selesai!");
      }
    }
  }, [activeTask]);

  // Sync real-time progress events from SSE for scene_transcribe
  useEffect(() => {
    if (activeTask && activeTask.task_type === "scene_transcribe") {
      if (activeTask.status === "progress") {
        setTranscribeProgress(activeTask.progress);
        setTranscribeStepText(activeTask.message);
      } else if (activeTask.status === "success") {
        setTranscribeProgress(100);
        setTranscribeStepText(activeTask.message || "Transkripsi dialog selesai!");
      }
    }
  }, [activeTask]);

  // Elapsed second counter during active retagging
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (retagMutation.isPending) {
      timer = setInterval(() => {
        setRetagElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setRetagElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [retagMutation.isPending]);

  // Elapsed second counter during active transcribing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (transcribeMutation.isPending) {
      timer = setInterval(() => {
        setTranscribeElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setTranscribeElapsed(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [transcribeMutation.isPending]);

  // Upload Mutation
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    uploadMediaMutation.mutate(formData, {
      onSettled: () => {
        setIsUploading(false);
      },
    });
  };

  // Inspect YouTube URL
  const handleInspectYT = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setYtInfo(null);
    inspectYTMutation.mutate(ytUrl.trim(), {
      onSuccess: (info) => setYtInfo(info),
    });
  };

  const handleRetag = (mode: "quick" | "force") => {
    setRetaggingMode(mode);
    setRetagProgress(10);
    setRetagElapsed(0);
    setRetagStepText(`Memulai ${mode === "quick" ? "Quick Tagging" : "Force Tagging"}...`);
    retagMutation.mutate(mode, {
      onSuccess: () => {
        setRetagProgress(100);
        setRetagStepText("Tagging selesai!");
        setTimeout(() => {
          setRetagProgress(0);
          setRetagElapsed(0);
        }, 800);
      },
      onError: () => {
        setRetagProgress(0);
      },
      onSettled: () => {
        setRetaggingMode(null);
      },
    });
  };

  // Download YouTube video
  const handleDownloadYT = async (formatId: string) => {
    setDownloadingFormatId(formatId);
    downloadYTMutation.mutate(
      { url: ytUrl.trim(), formatId, title: ytInfo?.title },
      {
        onSettled: () => setDownloadingFormatId(null),
        onSuccess: () => {
          setIsYTOpen(false);
          setYtUrl("");
          setYtInfo(null);
        },
      }
    );
  };

  const formatDuration = (sec: number) => {
    if (!sec || sec <= 0) return null;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div>
      {/* ========================================================================= */}
      {/* 1. FRAGMENT: PAGE HEADER & ACTION TOOLBAR                                  */}
      {/* ========================================================================= */}
      <StudioTabHeader
        icon={Film}
        title="Media Pool"
        badge={`${project.source_videos.length} Video`}
        secondaryBadge={`${project.scenes.length} Scenes`}
        description="Kelola materi video mentah dan hasil ekstraksi visual AI untuk naskah video."
        actions={
          <Button
            type="button"
            variant="workspace-secondary"
            size="workspace-sm"
            onClick={() => setIsYTOpen(true)}
            className="gap-1.5"
          >
            <Youtube className="h-4 w-4 text-[#A9472C]" />
            <span>Impor YouTube</span>
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-4 py-5 sm:px-6">
        {/* ========================================================================= */}
        {/* 2. FRAGMENT: DROPZONE COMPONENT                                           */}
        {/* ========================================================================= */}
        <Dropzone
          onFilesSelected={handleFileUpload}
          isUploading={isUploading}
          label="Tarik & lepas file video di sini, atau"
          hint="Mendukung MP4, MOV, MKV, WebM (bisa pilih banyak file sekaligus)"
        />

        {/* ========================================================================= */}
        {/* 3. SOURCE VIDEOS LIST                                                     */}
        {/* ========================================================================= */}
        {project.source_videos.length === 0 ? (
          <EmptyState
            icon={Film}
            title="Belum Ada Video di Media Pool"
            description="Upload materi video mentah atau impor dari YouTube di atas untuk memulai deteksi visual AI."
            action={
              <Button
                variant="workspace-primary"
                size="sm"
                onClick={() => setIsYTOpen(true)}
                className="gap-1.5"
              >
                <Youtube className="w-4 h-4 text-[#A9472C]" />
                <span>Impor dari YouTube</span>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            <Toolbar
              left={
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-primary" />
                  <span>Video Sumber Terdaftar</span>
                </span>
              }
              right={
                <span className="text-xs text-muted-foreground font-mono">
                  {project.source_videos.length} file
                </span>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {project.source_videos.map((vid) => {
                const isDownloadActive =
                  activeTask?.task_type === "youtube_download" &&
                  activeTask.data?.video_id === vid.id;
                const dlProgress = isDownloadActive ? activeTask.progress : vid.progress || 15;
                const dlMessage =
                  isDownloadActive && activeTask.message
                    ? activeTask.message
                    : `Mengunduh (${dlProgress}%)...`;

                const isDetectActive =
                  activeTask?.task_type === "scene_detect" &&
                  (!activeTask.data?.video_id || activeTask.data?.video_id === vid.id);
                const detectProgress = isDetectActive ? activeTask.progress : vid.progress || 25;
                const detectMessage =
                  isDetectActive && activeTask.message
                    ? activeTask.message
                    : `Menganalisis visual AI (${detectProgress}%)...`;

                const videoScenes =
                  project.scenes?.filter((s) => s.source_video_id === vid.id) || [];
                const sceneCount = videoScenes.length;

                return (
                  <Card
                    key={vid.id}
                    className="flex flex-col justify-between border-border bg-card p-3.5 transition-all hover:border-primary/40"
                  >
                    <div>
                      {/* Header Row: Origin, Status, Delete */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={vid.origin === "ytdlp" ? "destructive" : "secondary"}
                            className="text-[9px] uppercase font-mono px-1.5 py-0"
                          >
                            {vid.origin === "ytdlp" ? "YouTube" : "Upload"}
                          </Badge>

                          {vid.status === "downloading" && (
                            <Badge
                              variant="workspace-warning"
                              className="text-[10px] py-0 gap-1 animate-pulse"
                            >
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Mengunduh</span>
                            </Badge>
                          )}
                          {vid.status === "processing" && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] py-0 gap-1 animate-pulse"
                            >
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              <span>Analisis AI</span>
                            </Badge>
                          )}
                          {vid.status === "ready" && (
                            <Badge variant="secondary" className="text-[10px] py-0 gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Siap</span>
                            </Badge>
                          )}
                          {vid.status === "failed" && (
                            <Badge variant="destructive" className="text-[10px] py-0 gap-1">
                              <AlertCircle className="w-2.5 h-2.5" />
                              <span>Gagal</span>
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {(vid.status === "downloading" || vid.status === "processing") && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => cancelMediaMutation.mutate(vid.id)}
                              disabled={
                                cancelMediaMutation.isPending &&
                                cancelMediaMutation.variables === vid.id
                              }
                              className="h-7 gap-1 px-2 text-[10px] font-semibold"
                              title="Batalkan proses video ini"
                            >
                              {cancelMediaMutation.isPending &&
                              cancelMediaMutation.variables === vid.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <StopCircle className="w-2.5 h-2.5" />
                              )}
                              <span>Batal</span>
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setVideoToDelete(vid)}
                            className="text-muted-foreground hover:text-[#A9472C] hover:bg-[#F3E1D9] h-6 w-6"
                            title="Hapus video"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Title */}
                      <h4
                        className="text-xs font-semibold text-foreground truncate mb-1"
                        title={vid.filename}
                      >
                        {vid.filename}
                      </h4>

                      {/* Meta Info */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
                        {vid.duration && vid.duration > 0 && (
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            {formatDuration(vid.duration)}
                          </span>
                        )}
                        {vid.width && vid.height && (
                          <span className="rounded bg-muted px-1 font-mono text-[10px]">
                            {vid.height}p
                          </span>
                        )}
                        {vid.status === "ready" && (
                          <span className="text-primary font-medium text-[10px]">
                            {sceneCount} scene
                          </span>
                        )}
                      </div>

                      {/* Play button for ready videos */}
                      {vid.status === "ready" && vid.file_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPlayerVideo(vid)}
                          className="mb-2 h-7 gap-1.5 text-[11px] w-full"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Putar Video
                          {vid.heatmap_data && vid.heatmap_data.length > 0 && (
                            <span className="text-[9px] text-muted-foreground ml-auto">🔥 Heatmap</span>
                          )}
                        </Button>
                      )}

                      {/* Inline Progress for Downloading */}
                      {vid.status === "downloading" && (
                        <div className="mb-2 space-y-1 bg-[#F7EFE0] p-2 rounded-lg border border-[#E8D9BC]">
                          <div className="flex items-center justify-between text-[10px] text-[#8A6A2F]">
                            <span className="truncate">{dlMessage}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold">{dlProgress}%</span>
                              <button
                                type="button"
                                onClick={() => cancelMediaMutation.mutate(vid.id)}
                                disabled={
                                  cancelMediaMutation.isPending &&
                                  cancelMediaMutation.variables === vid.id
                                }
                                className="text-[#A9472C] hover:text-[#A9472C] font-semibold underline cursor-pointer disabled:opacity-50"
                                title="Batalkan proses download"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="bg-[#F7EFE0] h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(5, dlProgress)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Inline Progress for AI Processing */}
                      {vid.status === "processing" && (
                        <div className="mb-2 space-y-1 bg-[#F1EEE6] p-2 rounded-lg border border-[#E5E1D7]">
                          <div className="flex items-center justify-between text-[10px] text-primary">
                            <span className="truncate">{detectMessage}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold">{detectProgress}%</span>
                              <button
                                type="button"
                                onClick={() => cancelMediaMutation.mutate(vid.id)}
                                disabled={
                                  cancelMediaMutation.isPending &&
                                  cancelMediaMutation.variables === vid.id
                                }
                                className="text-[#A9472C] hover:text-[#A9472C] font-semibold underline cursor-pointer disabled:opacity-50"
                                title="Batalkan proses deteksi"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${Math.max(5, detectProgress)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Error Message */}
                      {vid.status === "failed" && (
                        <div className="mb-2 text-[11px] text-[#A9472C] flex items-center gap-1.5 bg-[#F8EEEA] p-1.5 rounded border border-[#E9C9BD]">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{vid.error_message || "Gagal memproses"}</span>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. SCENE GALLERY & UNIFIED AI ACTIONS                                     */}
        {/* ========================================================================= */}
        <div className="space-y-3 pt-2">
          <Toolbar
            left={
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-foreground">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>Scene AI ({project.scenes.length})</span>
                </h3>

                {modelConfig?.vision_model && (
                  <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                    Vision:{" "}
                    <strong className="text-foreground ml-1">{modelConfig.vision_model}</strong>
                  </Badge>
                )}

                {untaggedCount > 0 && (
                  <Badge variant="workspace-warning" className="text-[10px]">
                    {untaggedCount} belum di-tag
                  </Badge>
                )}
              </div>
            }
            right={
              <div className="flex items-center gap-2 flex-wrap">
                {/* Quick Tagging CTA */}
                <Button
                  type="button"
                  variant="workspace-primary"
                  size="sm"
                  onClick={() => handleRetag("quick")}
                  disabled={retagMutation.isPending || untaggedCount === 0}
                  className="h-8 gap-1.5 text-xs"
                  title="Tagging otomatis hanya scene yang belum memiliki deskripsi AI"
                >
                  {retagMutation.isPending && retaggingMode === "quick" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menganalisis...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Tagging {untaggedCount > 0 ? `(${untaggedCount})` : ""}</span>
                    </>
                  )}
                </Button>

                {/* Transcribe Dialog CTA */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTranscribeProgress(10);
                    setTranscribeElapsed(0);
                    setTranscribeStepText("Memulai transkripsi dialog Whisper...");
                    transcribeMutation.mutate("id");
                  }}
                  disabled={transcribeMutation.isPending || project.scenes.length === 0}
                  className="h-8 gap-1.5 border-border text-xs"
                  title="Ekstrak dialog audio percakapan menggunakan Whisper"
                >
                  {transcribeMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#41627F]" />
                      <span>Mentranskrip...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-3.5 h-3.5 text-[#41627F]" />
                      <span>
                        Transkrip Dialog {untranscribedCount > 0 ? `(${untranscribedCount})` : ""}
                      </span>
                    </>
                  )}
                </Button>

                {/* More Options Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 border-border px-2">
                      <MoreVertical className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent appearance="workspace" align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => {
                        if (
                          confirm(
                            `Tagging ulang seluruh ${project.scenes.length} scene dari awal menggunakan vision model ${
                              modelConfig?.vision_model || "aktif"
                            }?`
                          )
                        ) {
                          handleRetag("force");
                        }
                      }}
                      disabled={retagMutation.isPending || project.scenes.length === 0}
                      className="gap-2 text-xs cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Force Tagging (Semua)</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                      onClick={() => {
                        setBrokenThumbnails({});
                        repairThumbnailsMutation.mutate();
                      }}
                      disabled={repairThumbnailsMutation.isPending}
                      className="gap-2 text-xs cursor-pointer text-[#8A6A2F] focus:text-[#8A6A2F]"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Perbaiki Thumbnail {brokenCount > 0 ? `(${brokenCount})` : ""}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            }
          />

          {/* Live Progress Bar for Retagging */}
          {retagMutation.isPending && (
            <div className="animate-fadeIn space-y-2 rounded-lg border border-primary/30 bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-medium text-primary">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate max-w-sm sm:max-w-md">
                    {retagStepText || "Sedang menganalisis scene visual..."}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>
                    {Math.floor(retagElapsed / 60)}:{String(retagElapsed % 60).padStart(2, "0")}
                  </span>
                  <span className="font-bold text-primary">{Math.round(retagProgress)}%</span>
                  <button
                    type="button"
                    onClick={() => api.cancelProjectTasks(project.id)}
                    className="cursor-pointer rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground transition hover:bg-destructive/90"
                    title="Batalkan proses tagging"
                  >
                    Batal
                  </button>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(5, retagProgress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Live Progress Bar for Transcribing */}
          {transcribeMutation.isPending && (
            <div className="animate-fadeIn space-y-2 rounded-lg border border-[#CFDDE9] bg-card p-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#41627F] font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate max-w-sm sm:max-w-md">
                    {transcribeStepText || "Sedang mentranskripsikan dialog audio..."}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>
                    {Math.floor(transcribeElapsed / 60)}:
                    {String(transcribeElapsed % 60).padStart(2, "0")}
                  </span>
                  <span className="text-[#41627F] font-bold">
                    {Math.round(transcribeProgress)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => api.cancelProjectTasks(project.id)}
                    className="cursor-pointer rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground transition hover:bg-destructive/90"
                    title="Batalkan proses transkripsi"
                  >
                    Batal
                  </button>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-[#EAF0F5] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, transcribeProgress)}%` }}
                />
              </div>
            </div>
          )}

          {/* Scene Cards Grid */}
          {project.scenes.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Belum Ada Scene Terdeteksi"
              description="Scene visual akan terbentuk secara otomatis setelah video sumber diunggah dan dianalisis."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {sortedScenes.map((scene) => (
                <div
                  key={scene.id}
                  onClick={() => setPreviewScene(scene)}
                  className="group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/50 hover:shadow-lg"
                >
                  {/* Thumbnail Container */}
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {scene.thumbnail_url && !brokenThumbnails[scene.id] ? (
                      <img
                        src={scene.thumbnail_url}
                        alt={scene.description || "Scene thumbnail"}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={() =>
                          setBrokenThumbnails((prev) => ({ ...prev, [scene.id]: true }))
                        }
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <Film className="w-5 h-5 opacity-40 mb-1" />
                        <span className="text-[9px] font-mono">#{scene.scene_index + 1}</span>
                      </div>
                    )}

                    {/* Play hover overlay */}
                    <div className="absolute inset-0 bg-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </span>
                    </div>

                    {/* Top Badges: Scene Index & Dialog */}
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-background/90 text-[9px] font-mono font-bold text-foreground shadow-sm">
                      #{scene.scene_index + 1}
                    </span>

                    {scene.transcript && (
                      <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-[#41627F] text-[8px] font-bold text-white flex items-center gap-0.5 shadow-sm">
                        <Mic className="w-2.5 h-2.5" /> Dialog
                      </span>
                    )}

                    {/* Duration Badge */}
                    <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-background/90 text-[9px] font-mono text-foreground shadow-sm">
                      {scene.duration}s
                    </span>
                  </div>

                  {/* Card Info */}
                  <div className="p-2 flex-1 flex flex-col justify-between gap-1.5">
                    <div>
                      <p className="text-[11px] text-foreground/90 line-clamp-2 leading-snug">
                        {scene.description || "Scene visual"}
                      </p>

                      {scene.transcript && (
                        <div
                          className="flex items-start gap-1 mt-1 p-1 rounded bg-[#EAF0F5] border border-[#CFDDE9] text-[10px] text-[#41627F]"
                          title={scene.transcript}
                        >
                          <MessageSquare className="w-2.5 h-2.5 text-[#41627F] shrink-0 mt-0.5" />
                          <span className="line-clamp-1 italic">"{scene.transcript}"</span>
                        </div>
                      )}
                    </div>

                    {scene.tags && scene.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {scene.tags.slice(0, 2).map((t, i) => (
                          <span
                            key={i}
                            className="rounded border border-border bg-surface px-1 py-0.5 text-[9px] text-muted-foreground"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 5. MODAL: YOUTUBE IMPORTER                                                */}
        {/* ========================================================================= */}
        <Dialog open={isYTOpen} onOpenChange={setIsYTOpen}>
          <DialogContent appearance="workspace" className="max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-[#A9472C]" />
                <DialogTitle>Impor Video dari YouTube</DialogTitle>
              </div>
              <DialogDescription>
                Masukkan URL video YouTube untuk memeriksa dan memilih resolusi download.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleInspectYT} className="flex gap-2 pt-2">
              <Input
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                className="flex-1"
                autoFocus
              />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={inspectYTMutation.isPending}
                className="shrink-0 gap-1.5"
              >
                {inspectYTMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Memeriksa...</span>
                  </>
                ) : (
                  <span>Periksa</span>
                )}
              </Button>
            </form>

            {/* Inspect Result */}
            {ytInfo && (
              <div className="mt-2 space-y-3 rounded-xl border border-border bg-card p-3">
                <div className="flex gap-3">
                  {ytInfo.thumbnail && (
                    <img
                      src={ytInfo.thumbnail}
                      alt={ytInfo.title}
                      className="h-16 w-24 shrink-0 rounded-lg border border-border object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-foreground line-clamp-2">
                      {ytInfo.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Durasi: <strong className="text-foreground">{ytInfo.duration_str}</strong>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-border pt-2">
                  {/* Heatmap preview (before download) */}
                  {ytInfo.heatmap && ytInfo.heatmap.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                        🔥 Most Replayed Heatmap
                      </p>
                      <div className="flex items-end h-6 gap-px rounded overflow-hidden bg-muted/30">
                        {ytInfo.heatmap.map((b, i) => {
                          const height = Math.max(4, b.value * 100);
                          const hue = 30 - b.value * 30;
                          const sat = 40 + b.value * 55;
                          const light = 70 - b.value * 30;
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-t-sm"
                              style={{
                                height: `${height}%`,
                                backgroundColor: `hsl(${hue}, ${sat}%, ${light}%)`,
                                opacity: 0.8,
                              }}
                              title={`${Math.round(b.value * 100)}%`}
                            />
                          );
                        })}
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        Bar tinggi = bagian paling sering ditonton ulang
                      </p>
                    </div>
                  )}

                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                    Pilih Resolusi Download:
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {ytInfo.formats?.map((fmt: YTFormatOption) => {
                      const isSelected = downloadingFormatId === fmt.format_id;
                      return (
                        <Button
                          key={fmt.format_id}
                          type="button"
                          variant={isSelected ? "workspace-primary" : "outline"}
                          size="sm"
                          disabled={Boolean(downloadingFormatId)}
                          onClick={() => handleDownloadYT(fmt.format_id)}
                          className="h-auto justify-between border-border py-2 text-xs"
                        >
                          <span className="font-semibold flex items-center gap-1.5">
                            {isSelected && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>{fmt.resolution}</span>
                          </span>
                          <span className="text-[10px] opacity-75 font-mono">
                            {isSelected
                              ? "Memulai..."
                              : fmt.filesize_approx_mb
                                ? `${fmt.filesize_approx_mb} MB`
                                : "Auto"}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsYTOpen(false);
                  setYtInfo(null);
                }}
              >
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========================================================================= */}
        {/* 6. MODAL: CONFIRM DELETE VIDEO                                            */}
        {/* ========================================================================= */}
        <Dialog
          open={Boolean(videoToDelete)}
          onOpenChange={(open) => !open && setVideoToDelete(null)}
        >
          <DialogContent appearance="workspace" className="max-w-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center text-destructive shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  Hapus Video dari Media Pool?
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Tindakan ini tidak dapat dibatalkan
                </DialogDescription>
              </div>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed py-2">
              Apakah Anda yakin ingin menghapus{" "}
              <span className="font-semibold text-foreground">"{videoToDelete?.filename}"</span>?
              Seluruh scene visual AI hasil analisis video ini juga akan dihapus dari project.
            </p>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVideoToDelete(null)}
              >
                Batal
              </Button>
              <Button
                type="button"
                id="confirm-delete-video-btn"
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!videoToDelete) return;
                  const vidId = videoToDelete.id;
                  setVideoToDelete(null);
                  deleteMutation.mutate(vidId);
                }}
                className="gap-1.5"
              >
                {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Hapus Video</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========================================================================= */}
        {/* 7. MODAL: SCENE PREVIEW                                                   */}
        {/* ========================================================================= */}
        {previewScene && (
          <ScenePreviewModal
            isOpen={Boolean(previewScene)}
            onClose={() => setPreviewScene(null)}
            videoUrl={previewScene.video_url}
            thumbnailUrl={previewScene.thumbnail_url}
            startTime={previewScene.start_time}
            endTime={previewScene.end_time}
            title={`Scene #${previewScene.scene_index + 1}`}
            description={previewScene.description}
            tags={previewScene.tags}
            transcript={previewScene.transcript}
            sceneIndex={previewScene.scene_index}
          />
        )}

        {/* ========================================================================= */}
        {/* 8. MODAL: SOURCE VIDEO PLAYER + HEATMAP                                   */}
        {/* ========================================================================= */}
        {playerVideo && (
          <SourceVideoPlayer
            isOpen={Boolean(playerVideo)}
            onClose={() => setPlayerVideo(null)}
            video={playerVideo}
          />
        )}
      </div>
    </div>
  );
}

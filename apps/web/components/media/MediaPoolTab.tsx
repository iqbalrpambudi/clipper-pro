"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  UploadCloud,
  Youtube,
  Film,
  Trash2,
  Clock,
  Sparkles,
  Download,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Tag,
  Play,
  RefreshCw,
  Mic,
  MessageSquare,
} from "lucide-react";
import { ScenePreviewModal } from "./ScenePreviewModal";
import { useStudioStore } from "@/lib/store";
import { Project, SourceVideo, Scene } from "@/types";
import {
  useDeleteMedia,
  useDownloadYT,
  useUploadMedia,
  useModelConfig,
  useYTInfo,
  useRetagScenes,
  useTranscribeScenes,
} from "@/hooks/useMediaPool";

interface MediaPoolTabProps {
  project: Project & {
    source_videos: SourceVideo[];
    scenes: Scene[];
  };
}

export function MediaPoolTab({ project }: MediaPoolTabProps) {
  const { showToast, activeTask, setActiveTask } = useStudioStore();
  const [isYTOpen, setIsYTOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytInfo, setYtInfo] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [retaggingMode, setRetaggingMode] = useState<"quick" | "force" | null>(null);

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


  const deleteMutation = useDeleteMedia(project.id);
  const downloadYTMutation = useDownloadYT(project.id);
  const uploadMediaMutation = useUploadMedia(project.id);

  // Upload Mutation
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(40);

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    uploadMediaMutation.mutate(formData, {
      onSettled: () => {
        setIsUploading(false);
        setUploadProgress(0);
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
    setRetagStepText(`Memulai ${mode === "quick" ? "Quick Tagging (Incremental)" : "Force Tagging (Semua)"}...`);
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

  const [downloadingFormatId, setDownloadingFormatId] = useState<string | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<SourceVideo | null>(null);

  // Download YouTube video with optimistic card display
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

  return (
    <div className="space-y-8">
      {/* Upload & Import Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upload Box */}
        <label className="relative glass-panel rounded-2xl p-6 border-dashed border-2 border-surface-border hover:border-brand-500/50 cursor-pointer transition flex flex-col items-center justify-center text-center group">
          <input
            type="file"
            multiple
            accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition">
            <UploadCloud className="w-6 h-6 text-brand-400" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">Upload File Video</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            Drag & drop atau klik untuk memilih file (MP4, MOV, MKV, WebM). Mendukung banyak file sekaligus.
          </p>
          {isUploading && (
            <div className="w-full mt-4 bg-surface rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-brand-500 h-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </label>

        {/* YouTube Box */}
        <div
          onClick={() => setIsYTOpen(true)}
          className="glass-panel rounded-2xl p-6 border-dashed border-2 border-surface-border hover:border-rose-500/50 cursor-pointer transition flex flex-col items-center justify-center text-center group"
        >
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition">
            <Youtube className="w-6 h-6 text-rose-400" />
          </div>
          <h4 className="text-sm font-bold text-white mb-1">Import via Link YouTube</h4>
          <p className="text-xs text-slate-400 max-w-xs">
            Paste link YouTube via yt-dlp, pilih resolusi (1080p, 720p), dan download langsung ke Media Pool.
          </p>
        </div>
      </div>

      {/* Media Pool List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-brand-400" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Media Pool ({project.source_videos.length} Video Sumber)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Total {project.scenes.length} scene terdeteksi
          </span>
        </div>

        {project.source_videos.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center border border-surface-border">
            <p className="text-xs text-slate-400">
              Belum ada video dalam Media Pool project ini. Silakan upload atau import dari YouTube di atas.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {project.source_videos.map((vid) => {
              const isDownloadActive = activeTask?.task_type === "youtube_download" && activeTask.data?.video_id === vid.id;
              const dlProgress = isDownloadActive ? activeTask.progress : (vid.progress || 15);
              const dlMessage = isDownloadActive && activeTask.message ? activeTask.message : `Mendownload video (${dlProgress}%)...`;

              const isDetectActive = activeTask?.task_type === "scene_detect" && (!activeTask.data?.video_id || activeTask.data?.video_id === vid.id);
              const detectProgress = isDetectActive ? activeTask.progress : (vid.progress || 25);
              const detectMessage = isDetectActive && activeTask.message ? activeTask.message : `Menganalisis visual AI scene (${detectProgress}%)...`;

              const videoScenes = project.scenes?.filter((s) => s.source_video_id === vid.id) || [];
              const sceneCount = videoScenes.length;

              const formatDuration = (sec: number) => {
                if (!sec || sec <= 0) return null;
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return `${m}:${s.toString().padStart(2, "0")}`;
              };

              return (
                <div
                  key={vid.id}
                  className="glass-panel rounded-xl p-4 border border-surface-border flex flex-col justify-between hover:border-surface-border/80 transition shadow-lg"
                >
                  <div>
                    {/* Header Row: Badges & Actions */}
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Origin Badge */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            vid.origin === "ytdlp"
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              : "bg-brand-500/15 text-brand-300 border border-brand-500/30"
                          }`}
                        >
                          {vid.origin === "ytdlp" ? "YouTube" : "Upload"}
                        </span>

                        {/* Live Status Badge */}
                        {vid.status === "downloading" && (
                          <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-400" />
                            <span>Mengunduh</span>
                          </span>
                        )}
                        {vid.status === "processing" && (
                          <span className="bg-brand-500/15 text-brand-300 border border-brand-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin text-brand-400" />
                            <span>Analisis Scene AI</span>
                          </span>
                        )}
                        {vid.status === "ready" && (
                          <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Siap</span>
                          </span>
                        )}
                        {vid.status === "failed" && (
                          <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                            <span>Gagal</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setVideoToDelete(vid)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-white/5 transition shrink-0"
                        title="Hapus video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-semibold text-white truncate mb-1" title={vid.filename}>
                      {vid.filename}
                    </h4>

                    {/* Sub-meta (Resolution & Scene Count) */}
                    <div className="flex items-center gap-2 mb-3 text-[11px] text-slate-400">
                      {vid.width && vid.height ? (
                        <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-slate-300 text-[10px]">
                          {vid.height}p {vid.fps ? `• ${Math.round(vid.fps)}fps` : ""}
                        </span>
                      ) : null}
                      {vid.status === "ready" && (
                        <span className="text-emerald-400/90 font-medium flex items-center gap-1 text-[11px]">
                          <Film className="w-3 h-3" />
                          {sceneCount > 0 ? `${sceneCount} scene terdeteksi` : "Siap dipotong"}
                        </span>
                      )}
                    </div>

                    {/* Dedicated Card Progress Bar: Downloading */}
                    {vid.status === "downloading" && (
                      <div className="mb-3 space-y-2 bg-amber-500/10 p-3 rounded-xl border border-amber-500/25">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400 mt-0.5" />
                            <p className="text-xs font-semibold text-amber-200 leading-snug">
                              {dlMessage}
                            </p>
                          </div>
                          <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            {dlProgress}%
                          </span>
                        </div>
                        <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden border border-amber-500/20">
                          <div
                            className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400 h-full transition-all duration-300 rounded-full animate-pulse"
                            style={{ width: `${Math.max(5, dlProgress)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Dedicated Card Progress Bar: Scene Detection & Vision AI */}
                    {vid.status === "processing" && (
                      <div className="mb-3 space-y-2 bg-brand-500/10 p-3 rounded-xl border border-brand-500/25">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-brand-400 mt-0.5" />
                            <p className="text-xs font-semibold text-brand-200 leading-snug">
                              {detectMessage}
                            </p>
                          </div>
                          <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30 shrink-0">
                            {detectProgress}%
                          </span>
                        </div>
                        <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden border border-brand-500/20">
                          <div
                            className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full animate-pulse"
                            style={{ width: `${Math.max(5, detectProgress)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Failure Message */}
                    {vid.status === "failed" && (
                      <div className="mb-3 text-xs text-rose-400 flex items-center gap-1.5 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                        <span className="truncate">{vid.error_message || "Gagal memproses video"}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Formatted Duration & Dimensions */}
                  <div className="pt-3 border-t border-surface-border/60 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                      {vid.duration && vid.duration > 0 ? (
                        <span className="font-medium text-slate-300">
                          {formatDuration(vid.duration)} ({Math.round(vid.duration)}s)
                        </span>
                      ) : vid.status === "downloading" || vid.status === "processing" ? (
                        <span className="text-amber-400/80 italic text-[11px]">Memproses durasi...</span>
                      ) : (
                        <span>-</span>
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {vid.width && vid.height ? `${vid.width}x${vid.height}` : ""}
                    </span>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

      {/* Scene Gallery Drawer */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-base font-bold text-white tracking-tight">
              Galeri Scene & AI Tagging ({project.scenes.length} Scenes)
            </h3>
            {modelConfig?.vision_model && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-surface border border-surface-border text-slate-300 font-mono">
                Vision: <strong className="text-brand-300">{modelConfig.vision_model}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Tagging (Incremental) */}
            <button
              type="button"
              onClick={() => handleRetag("quick")}
              disabled={retagMutation.isPending || untaggedCount === 0}
              className="px-3.5 py-1.5 rounded-xl bg-accent-yellow/15 hover:bg-accent-yellow/25 border border-accent-yellow/40 text-accent-yellow text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Hanya tagging scene yang belum memiliki tag AI (cepat & hemat kuota)"
            >
              {retagMutation.isPending && retaggingMode === "quick" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menganalisis ({untaggedCount} sisa)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Quick Tagging ({untaggedCount} sisa)</span>
                </>
              )}
            </button>

            {/* Force Tagging (All) */}
            <button
              type="button"
              onClick={() => {
                if (confirm(`Tagging ulang seluruh ${project.scenes.length} scene dari awal menggunakan model vision ${modelConfig?.vision_model || "aktif"}?`)) {
                  handleRetag("force");
                }
              }}
              disabled={retagMutation.isPending || project.scenes.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-surface hover:bg-surface-border border border-surface-border hover:border-slate-500 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Analisis ulang seluruh scene dari awal dengan model Vision aktif di Settings"
            >
              {retagMutation.isPending && retaggingMode === "force" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
                  <span>Force Tagging ({project.scenes.length} scene)...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Force Tagging (Semua)</span>
                </>
              )}
            </button>

            {/* Transcribe Dialog (Whisper) */}
            <button
              type="button"
              onClick={() => {
                setTranscribeProgress(10);
                setTranscribeElapsed(0);
                setTranscribeStepText("Memulai ekstraksi audio dan transkripsi dialog...");
                transcribeMutation.mutate("id");
              }}
              disabled={transcribeMutation.isPending || project.scenes.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 text-indigo-300 hover:text-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="Ekstrak percakapan audio menggunakan Whisper dan beri label dialog pada setiap scene"
            >
              {transcribeMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Mentranskrip ({untranscribedCount} sisa)...</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Transkrip Dialog (Whisper)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Progress Card for Retagging */}
        {retagMutation.isPending && (
          <div className="p-4 rounded-xl bg-surface border border-brand-500/40 space-y-2.5 animate-fadeIn shadow-lg shadow-brand-500/5 mb-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-brand-300 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-brand-400 shrink-0" />
                <span className="truncate max-w-sm sm:max-w-md">{retagStepText || "Sedang menganalisis scene..."}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <span>{Math.floor(retagElapsed / 60)}:{String(retagElapsed % 60).padStart(2, "0")}</span>
                <span className="px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-bold border border-brand-500/30">
                  {Math.round(retagProgress)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
              <div
                className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, retagProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Live Progress Card for Transcribing */}
        {transcribeMutation.isPending && (
          <div className="p-4 rounded-xl bg-surface border border-indigo-500/40 space-y-2.5 animate-fadeIn shadow-lg shadow-indigo-500/5 mb-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
                <span className="truncate max-w-sm sm:max-w-md">{transcribeStepText || "Sedang mentranskripsikan dialog audio..."}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                <span>{Math.floor(transcribeElapsed / 60)}:{String(transcribeElapsed % 60).padStart(2, "0")}</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  {Math.round(transcribeProgress)}%
                </span>
              </div>
            </div>
            <div className="w-full bg-surface-card rounded-full h-2 overflow-hidden border border-surface-border">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, transcribeProgress)}%` }}
              />
            </div>
          </div>
        )}

        {project.scenes.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center border border-surface-border">
            <p className="text-xs text-slate-400">
              Belum ada scene terdeteksi. Scene akan muncul otomatis setelah video selesai diproses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sortedScenes.map((scene) => (
              <div
                key={scene.id}
                className="glass-panel rounded-xl overflow-hidden border border-surface-border hover:border-accent-yellow/40 transition group flex flex-col"
              >
                <div
                  className="relative aspect-video bg-black/50 overflow-hidden cursor-pointer"
                  onClick={() => setPreviewScene(scene)}
                >
                  {scene.thumbnail_url ? (
                    <img
                      src={scene.thumbnail_url}
                      alt={scene.description || "Scene thumbnail"}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600">
                      <Film className="w-6 h-6" />
                    </div>
                  )}

                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <span className="w-9 h-9 rounded-full bg-brand-600/90 text-white flex items-center justify-center shadow-lg shadow-black/60 transform group-hover:scale-110 transition">
                      <Play className="w-4 h-4 ml-0.5" />
                    </span>
                  </div>

                  {scene.transcript && (
                    <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-indigo-600/90 text-[9px] font-bold text-white flex items-center gap-0.5 shadow">
                      <Mic className="w-2.5 h-2.5" /> Dialog
                    </span>
                  )}

                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                    {scene.duration}s
                  </span>
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-slate-200">
                    #{scene.scene_index + 1}
                  </span>
                </div>

                <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-slate-200 line-clamp-2 leading-tight mb-1.5">
                      {scene.description || "Scene visual"}
                    </p>

                    {scene.transcript && (
                      <div className="flex items-start gap-1 p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-200 mb-2" title={scene.transcript}>
                        <MessageSquare className="w-3 h-3 text-indigo-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 italic">"{scene.transcript}"</span>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {scene.tags?.slice(0, 2).map((t, i) => (
                        <span
                          key={i}
                          className="text-[9px] px-1.5 py-0.2 rounded bg-surface border border-surface-border text-slate-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewScene(scene);
                    }}
                    className="w-full py-1 rounded-lg bg-surface hover:bg-brand-500/20 text-slate-300 hover:text-brand-300 border border-surface-border hover:border-brand-500/30 text-[10px] font-medium flex items-center justify-center gap-1 transition"
                  >
                    <Play className="w-3 h-3" />
                    <span>Preview Klip</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: YouTube Importer */}
      {isYTOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl animate-scale-pop">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Youtube className="w-5 h-5 text-rose-500" />
              Download Video dari YouTube
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              Masukkan URL video YouTube untuk memeriksa format resolusi yang tersedia melalui yt-dlp.
            </p>

            <form onSubmit={handleInspectYT} className="flex gap-2 mb-4">
              <input
                type="url"
                required
                placeholder="https://www.youtube.com/watch?v=..."
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-surface rounded-xl border border-surface-border text-white text-sm focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={inspectYTMutation.isPending}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 transition"
              >
                {inspectYTMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Periksa"}
              </button>
            </form>

            {/* Inspect Result */}
            {ytInfo && (
              <div className="border border-surface-border rounded-xl p-4 bg-surface/50 mb-4 space-y-3">
                <div className="flex gap-3">
                  {ytInfo.thumbnail && (
                    <img
                      src={ytInfo.thumbnail}
                      alt={ytInfo.title}
                      className="w-24 h-16 object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-white line-clamp-2">{ytInfo.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">Durasi: {ytInfo.duration_str}</p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-surface-border">
                  <p className="text-xs font-semibold text-slate-300 mb-2">Pilih Resolusi Download:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ytInfo.formats?.map((fmt: any) => {
                      const isSelected = downloadingFormatId === fmt.format_id;
                      return (
                        <button
                          key={fmt.format_id}
                          type="button"
                          disabled={Boolean(downloadingFormatId)}
                          onClick={() => handleDownloadYT(fmt.format_id)}
                          className={`px-3 py-2 rounded-lg border text-left text-xs flex items-center justify-between transition ${
                            isSelected
                              ? "border-rose-500 bg-rose-500/20 text-white"
                              : "border-surface-border bg-surface hover:bg-rose-500/10 hover:border-rose-500/40 text-white"
                          } ${downloadingFormatId && !isSelected ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                          <span className="font-semibold flex items-center gap-1.5">
                            {isSelected && <Loader2 className="w-3 h-3 animate-spin text-rose-400" />}
                            <span>{fmt.resolution}</span>
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {isSelected ? "Memulai..." : (fmt.filesize_approx_mb ? `${fmt.filesize_approx_mb} MB` : "Auto")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsYTOpen(false);
                  setYtInfo(null);
                }}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Scene Video Preview */}
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

      {/* Modal: Confirm Delete Video */}
      {videoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-pop">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Hapus Video dari Media Pool?</h3>
                <p className="text-xs text-slate-400">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus{" "}
              <span className="font-semibold text-white">"{videoToDelete.filename}"</span>? Seluruh scene visual AI hasil analisis video ini juga akan dihapus dari project.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-surface-border/60">
              <button
                type="button"
                onClick={() => setVideoToDelete(null)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white transition"
              >
                Batal
              </button>
              <button
                type="button"
                id="confirm-delete-video-btn"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const vidId = videoToDelete.id;
                  setVideoToDelete(null);
                  deleteMutation.mutate(vidId);
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/20 transition flex items-center gap-2"
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Hapus Video</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
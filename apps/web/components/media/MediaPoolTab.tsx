"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { ScenePreviewModal } from "./ScenePreviewModal";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { Project, SourceVideo, Scene } from "@/types";

interface MediaPoolTabProps {
  project: Project & {
    source_videos: SourceVideo[];
    scenes: Scene[];
  };
}

export function MediaPoolTab({ project }: MediaPoolTabProps) {
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  const [isYTOpen, setIsYTOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytInfo, setYtInfo] = useState<any>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [retaggingMode, setRetaggingMode] = useState<"quick" | "force" | null>(null);

  // Live Progress State for Scene Retagging & Auto-Refresh
  const [retagProgress, setRetagProgress] = useState(0);
  const [retagStepText, setRetagStepText] = useState("");
  const [retagElapsed, setRetagElapsed] = useState(0);





  const { data: modelConfig } = useQuery({
    queryKey: ["model-config"],
    queryFn: api.getModelConfig,
  });

  const untaggedCount = project.scenes.filter(
    (s) => !s.description || s.description === "Cuplikan video aksi/aktivitas"
  ).length;

  const retagMutation = useMutation({
    mutationFn: (mode: "quick" | "force") => {
      setRetaggingMode(mode);
      setRetagProgress(10);
      setRetagElapsed(0);
      setRetagStepText(`Memulai ${mode === "quick" ? "Quick Tagging (Incremental)" : "Force Tagging (Semua)"}...`);
      return api.retagScenes(project.id, mode);
    },
    onSuccess: async (res) => {
      setRetagProgress(100);
      setRetagStepText("Tagging selesai!");
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      await queryClient.refetchQueries({ queryKey: ["scenes", project.id] });
      showToast(res.message || `Berhasil tagging ${res.count} scene!`, "success");
      setTimeout(() => {
        setRetagProgress(0);
        setRetagElapsed(0);
      }, 800);
    },
    onError: (err: any) => {
      setRetagProgress(0);
      showToast(err.message || "Gagal tagging ulang scene", "error");
    },
    onSettled: () => {
      setRetaggingMode(null);
    },
  });

  // Progress Timer for Retagging
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (retagMutation.isPending) {
      timer = setInterval(() => {
        setRetagElapsed((prev) => {
          const next = prev + 1;
          if (next <= 3) {
            setRetagProgress(15);
            setRetagStepText("Menyiapkan thumbnail batch & adapter vision AI...");
          } else if (next <= 8) {
            setRetagProgress(45);
            setRetagStepText("Menganalisis batch scene multimodal dengan AI Vision...");
          } else if (next <= 16) {
            setRetagProgress(75);
            setRetagStepText("Mengekstrak deskripsi visual & hashtag kata kunci...");
          } else {
            setRetagProgress((p) => Math.min(92, p + 1));
            setRetagStepText("Menyinkronkan hasil tagging ke timeline & galeri...");
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [retagMutation.isPending]);

  // Upload Mutation
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(20);

    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));

    try {
      setUploadProgress(60);
      await api.uploadMedia(project.id, formData);
      setUploadProgress(100);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Video berhasil diunggah! Scene detection sedang berjalan di background.", "success");
    } catch (err: any) {
      showToast(err.message || "Gagal mengunggah video", "error");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Inspect YouTube URL
  const handleInspectYT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setIsInspecting(true);
    setYtInfo(null);
    try {
      const info = await api.getYTInfo(project.id, ytUrl.trim());
      setYtInfo(info);
    } catch (err: any) {
      showToast(err.message || "Gagal mengambil info YouTube", "error");
    } finally {
      setIsInspecting(false);
    }
  };

  // Download YouTube video
  const handleDownloadYT = async (formatId: string) => {
    try {
      await api.downloadYT(project.id, ytUrl.trim(), formatId);
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Download YouTube dimulai di background!", "info");
      setIsYTOpen(false);
      setYtUrl("");
      setYtInfo(null);
    } catch (err: any) {
      showToast(err.message || "Gagal mendownload YouTube", "error");
    }
  };

  // Delete Video
  const deleteMutation = useMutation({
    mutationFn: (vidId: string) => api.deleteMedia(project.id, vidId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast("Video dihapus dari Media Pool", "info");
    },
  });

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
            {project.source_videos.map((vid) => (
              <div
                key={vid.id}
                className="glass-panel rounded-xl p-4 border border-surface-border flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        vid.origin === "ytdlp"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          : "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                      }`}
                    >
                      {vid.origin}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Hapus "${vid.filename}" dari Media Pool?`)) {
                          deleteMutation.mutate(vid.id);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-white/5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h4 className="text-sm font-semibold text-white truncate mb-2" title={vid.filename}>
                    {vid.filename}
                  </h4>

                  {/* Status & Progress */}
                  {vid.status === "downloading" && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-[10px] text-amber-400 mb-1">
                        <span className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Mendownload video...
                        </span>
                        <span>{vid.progress}%</span>
                      </div>
                      <div className="w-full bg-surface rounded-full h-1 overflow-hidden">
                        <div className="bg-amber-400 h-full transition-all" style={{ width: `${vid.progress}%` }} />
                      </div>
                    </div>
                  )}

                  {vid.status === "processing" && (
                    <div className="mb-3 text-[10px] text-brand-400 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Menganalisis scene & vision AI...
                    </div>
                  )}

                  {vid.status === "failed" && (
                    <div className="mb-3 text-[10px] text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {vid.error_message || "Gagal memproses"}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-surface-border/60 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {Math.round(vid.duration)} detik
                  </span>
                  <span>{vid.width && vid.height ? `${vid.width}x${vid.height}` : ""}</span>
                </div>
              </div>
            ))}
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
              onClick={() => retagMutation.mutate("quick")}
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
                  retagMutation.mutate("force");
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

        {project.scenes.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center border border-surface-border">
            <p className="text-xs text-slate-400">
              Belum ada scene terdeteksi. Scene akan muncul otomatis setelah video selesai diproses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {project.scenes.map((scene) => (
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

                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                    {scene.duration}s
                  </span>
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-slate-200">
                    #{scene.scene_index + 1}
                  </span>
                </div>

                <div className="p-2.5 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <p className="text-[11px] text-slate-200 line-clamp-2 leading-tight mb-2">
                      {scene.description || "Scene visual"}
                    </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-scale-pop">
          <div className="w-full max-w-lg bg-surface-card border border-surface-border rounded-2xl p-6 shadow-2xl">
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
                disabled={isInspecting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 transition"
              >
                {isInspecting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Periksa"}
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
                    {ytInfo.formats?.map((fmt: any) => (
                      <button
                        key={fmt.format_id}
                        type="button"
                        onClick={() => handleDownloadYT(fmt.format_id)}
                        className="px-3 py-2 rounded-lg border border-surface-border bg-surface hover:bg-rose-500/10 hover:border-rose-500/40 text-left text-xs text-white flex items-center justify-between transition"
                      >
                        <span className="font-semibold">{fmt.resolution}</span>
                        <span className="text-[10px] text-slate-400">
                          {fmt.filesize_approx_mb ? `${fmt.filesize_approx_mb} MB` : "Auto"}
                        </span>
                      </button>
                    ))}
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
          sceneIndex={previewScene.scene_index}
        />
      )}
    </div>
  );
}
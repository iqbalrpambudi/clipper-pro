import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkCheck,
  Download,
  FileJson,
  Loader2,
  Sliders,
  Sparkles,
  Stamp,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { StudioTabHeader } from "@/components/layout";
import { Badge, Button, Switch } from "@/components/ui";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import {
  AudioTrack,
  Narration,
  Project,
  RenderJob,
  SubtitleStyle,
  TTSConfig,
  TimelineClip,
  WatermarkConfig,
} from "@/types";
import { PreviewPlayer } from "./PreviewPlayer";
import { WatermarkCustomizePanel } from "../watermark/WatermarkCustomizePanel";
import { toSubtitleStyle } from "../subtitles/constants";
import { normalizeWatermarkConfig } from "../watermark/constants";
import { DEFAULT_TTS_CONFIG } from "../tts/constants";
import { normalizeQCConfig } from "../qc/constants";
import { RenderHistoryList } from "./RenderHistoryList";
import { PreviewModalVideoState, VideoPreviewModal } from "./VideoPreviewModal";
import { formatBytes, getSafeProjectFilename, parseNumericDelta } from "./utils";

interface RenderTabProps {
  project: Project & {
    timeline?: { clips: TimelineClip[]; total_duration: number } | null;
    narration?: Narration | null;
    audio?: AudioTrack | null;
    subtitle_style?: SubtitleStyle | null;
    render_jobs?: RenderJob[];
  };
}

export function RenderTab({ project }: RenderTabProps) {
  const queryClient = useQueryClient();
  const { showToast, activeTask, setActiveTask } = useStudioStore();

  const [dynamicZoom, setDynamicZoom] = useState(project.background_fill?.dynamic_zoom ?? true);
  const [colorGrading, setColorGrading] = useState(project.background_fill?.color_grading ?? true);
  const [liveWatermark, setLiveWatermark] = useState<WatermarkConfig | null>(
    project.watermark || null
  );
  const liveWatermarkRef = React.useRef(liveWatermark);
  liveWatermarkRef.current = liveWatermark;

  const [showWatermarkEditor, setShowWatermarkEditor] = useState(false);
  const [previewModalVideo, setPreviewModalVideo] = useState<PreviewModalVideoState | null>(null);

  useEffect(() => {
    if (
      project.watermark &&
      JSON.stringify(project.watermark) !== JSON.stringify(liveWatermarkRef.current)
    ) {
      setLiveWatermark(project.watermark);
    }
  }, [project.watermark]);

  const { data: renderJobs = [], refetch: refetchJobs } = useQuery({
    queryKey: ["render-jobs", project.id],
    queryFn: () => api.getRenderJobs(project.id),
    staleTime: 10000,
    refetchOnWindowFocus: true,
  });

  const safeProjectFilename = React.useMemo(
    () => getSafeProjectFilename(project),
    [project?.name, project?.id]
  );

  const updateProjectMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.updateProject>[1]) =>
      api.updateProject(project.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const renderFinalMutation = useMutation({
    mutationFn: () => api.renderFinal(project.id, { resolution: project.resolution }),
    onSuccess: async () => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast("Render final dimulai!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai render", "error");
    },
  });

  const renderPreviewMutation = useMutation({
    mutationFn: () => api.renderPreview(project.id),
    onSuccess: async () => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      showToast("Preview cepat dimulai!", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai preview render", "error");
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (jobId: string) => api.deleteRenderJob(project.id, jobId),
    onSuccess: async (data) => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      const freed = data.freed_bytes ? ` (${formatBytes(data.freed_bytes)} dihemat)` : "";
      showToast(`Riwayat render dihapus${freed}`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menghapus riwayat render", "error");
    },
  });

  const clearAllJobsMutation = useMutation({
    mutationFn: () => api.clearRenderJobs(project.id),
    onSuccess: async (data) => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      const freed = data.freed_bytes ? ` (${formatBytes(data.freed_bytes)} dihemat)` : "";
      showToast(`Semua riwayat render dibersihkan${freed}`, "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membersihkan riwayat render", "error");
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => api.cancelRenderJob(project.id, jobId),
    onSuccess: async (data) => {
      await refetchJobs();
      await queryClient.refetchQueries({ queryKey: ["project", project.id] });
      if (activeTask?.task_type === "render") {
        setActiveTask(null);
      }
      showToast(data.message || "Render dibatalkan", "info");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal membatalkan render", "error");
    },
  });

  const saveAsDefaultsMutation = useMutation({
    mutationFn: () => {
      const ttsSource = project.tts_config;
      const audioSource = project.audio;
      const ttsConfig: TTSConfig = {
        provider:
          ttsSource?.provider === "elevenlabs" || audioSource?.provider === "elevenlabs"
            ? "elevenlabs"
            : DEFAULT_TTS_CONFIG.provider,
        voice: ttsSource?.voice || audioSource?.voice || DEFAULT_TTS_CONFIG.voice,
        rate: parseNumericDelta(ttsSource?.rate ?? audioSource?.rate, DEFAULT_TTS_CONFIG.rate),
        pitch: parseNumericDelta(ttsSource?.pitch ?? audioSource?.pitch, DEFAULT_TTS_CONFIG.pitch),
        model: ttsSource?.model ?? DEFAULT_TTS_CONFIG.model,
      };
      return api.saveProjectDefaults({
        subtitle: toSubtitleStyle(project.subtitle_style),
        watermark: normalizeWatermarkConfig(liveWatermark || project.watermark),
        tts: ttsConfig,
        qc: normalizeQCConfig(project.qc_config),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-defaults"] });
      showToast("Disimpan jadi default config.json", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan config.json", "error");
    },
  });

  const updateAntiCopyrightSettings = (
    updates: Partial<{ dynamic_zoom: boolean; color_grading: boolean }>
  ) => {
    const nextZoom = updates.dynamic_zoom ?? dynamicZoom;
    const nextColor = updates.color_grading ?? colorGrading;
    setDynamicZoom(nextZoom);
    setColorGrading(nextColor);

    updateProjectMutation.mutate({
      background_fill: {
        ...(project.background_fill || { mode: "blur", zoom: 1.0, color: "#000000" }),
        anti_copyright: true,
        dynamic_zoom: nextZoom,
        color_grading: nextColor,
      },
    });
  };

  const toggleWatermarkEnabled = (enabled: boolean) => {
    const updated = normalizeWatermarkConfig({
      ...(liveWatermark || project.watermark),
      enabled,
    });
    setLiveWatermark(updated);
    queryClient.setQueryData<Project>(["project", project.id], (old) =>
      old ? { ...old, watermark: updated } : old
    );
    updateProjectMutation.mutate({ watermark: updated });
  };

  const projectWithLiveSettings = React.useMemo(
    () => ({
      ...project,
      background_fill: {
        ...(project.background_fill || { mode: "blur", zoom: 1.0, color: "#000000" }),
        anti_copyright: true,
        dynamic_zoom: dynamicZoom,
        color_grading: colorGrading,
      },
      watermark: liveWatermark,
    }),
    [project, dynamicZoom, colorGrading, liveWatermark]
  );

  return (
    <div>
      <StudioTabHeader
        icon={Download}
        title="Render & ekspor"
        description="Cek pratinjau, klik render, lalu download video final."
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left: Clean Live Preview */}
          <div className="flex flex-col items-center lg:sticky lg:top-4 lg:col-span-5">
            <PreviewPlayer
              project={projectWithLiveSettings}
              isWatermarkDraggable={Boolean(
                liveWatermark?.enabled &&
                  (liveWatermark.position === "custom" || showWatermarkEditor)
              )}
              onUpdateWatermarkPosition={(pos) => {
                const base = normalizeWatermarkConfig(liveWatermark || project.watermark);
                const updated: WatermarkConfig = {
                  ...base,
                  enabled: true,
                  position: "custom",
                  custom_x: pos.custom_x,
                  custom_y: pos.custom_y,
                };
                setLiveWatermark(updated);
                queryClient.setQueryData<Project>(["project", project.id], (old) =>
                  old ? { ...old, watermark: updated } : old
                );
              }}
              onWatermarkDragEnd={() => {
                if (liveWatermarkRef.current) {
                  updateProjectMutation.mutate({ watermark: liveWatermarkRef.current });
                }
              }}
            />
          </div>

          {/* Right: 1) Render Now, 2) Quick Toggles, 3) Outputs */}
          <div className="space-y-5 lg:col-span-7">
            {/* Primary Action Bar */}
            <div className="rounded-2xl border border-surface-border bg-card p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Ekspor Video</h2>
                    <Badge
                      variant="outline"
                      className="border-border font-mono text-[11px] tabular-nums text-muted-foreground"
                    >
                      {project.aspect_ratio || "9:16"} · {project.resolution || "1080p"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Langsung render hasil akhir MP4 atau uji cepat dengan preview.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => renderPreviewMutation.mutate()}
                    disabled={renderPreviewMutation.isPending}
                    className="h-10 gap-2 border-border px-4 text-xs font-medium"
                  >
                    {renderPreviewMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 text-primary" />
                    )}
                    Preview Cepat
                  </Button>

                  <Button
                    variant="workspace-primary"
                    onClick={() => renderFinalMutation.mutate()}
                    disabled={renderFinalMutation.isPending}
                    className="h-10 gap-2 px-5 text-xs font-bold shadow-sm"
                  >
                    {renderFinalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Render Final MP4
                  </Button>
                </div>
              </div>
            </div>

            {/* Flat Compact Settings (No Nested Cards) */}
            <SectionPanel
              title="Opsi Render"
              icon={<Sliders className="h-4 w-4 text-primary" />}
              className="!border-surface-border !bg-card"
              headerClassName="!border-surface-border !bg-card"
              actions={
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="xs" asChild className="h-7 gap-1 text-xs">
                    <a href={api.getProjectConfigExportUrl(project.id)} download="config.json">
                      <FileJson className="h-3.5 w-3.5 text-primary" />
                      Export config.json
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => saveAsDefaultsMutation.mutate()}
                    disabled={saveAsDefaultsMutation.isPending}
                    className="h-7 gap-1 text-xs text-primary hover:bg-primary/10"
                  >
                    {saveAsDefaultsMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BookmarkCheck className="h-3.5 w-3.5" />
                    )}
                    Simpan Default
                  </Button>
                </div>
              }
            >
              <div className="divide-y divide-border">
                <label className="flex cursor-pointer items-center justify-between gap-4 py-3 first:pt-0">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Dynamic Zoom</div>
                    <div className="text-[11px] text-muted-foreground">
                      Zoom halus 1.05x agar aman dari deteksi duplikat.
                    </div>
                  </div>
                  <Switch
                    checked={dynamicZoom}
                    onCheckedChange={(checked) =>
                      updateAntiCopyrightSettings({ dynamic_zoom: checked })
                    }
                  />
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Micro Color Grading</div>
                    <div className="text-[11px] text-muted-foreground">
                      Kontras &amp; saturasi mikro (+3%) saat ekspor FFmpeg.
                    </div>
                  </div>
                  <Switch
                    checked={colorGrading}
                    onCheckedChange={(checked) =>
                      updateAntiCopyrightSettings({ color_grading: checked })
                    }
                  />
                </label>

                <div className="space-y-3 py-3 last:pb-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">Watermark</span>
                        {liveWatermark?.enabled && (
                          <span className="truncate rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                            {liveWatermark.text || "@cliperpro"}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Sematkan teks overlay pada video hasil render.
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => setShowWatermarkEditor((prev) => !prev)}
                        className="h-7 gap-1 border-border text-xs"
                      >
                        <Stamp className="h-3 w-3 text-primary" />
                        {showWatermarkEditor ? "Selesai" : "Atur"}
                      </Button>
                      <Switch
                        checked={liveWatermark?.enabled ?? false}
                        onCheckedChange={toggleWatermarkEnabled}
                      />
                    </div>
                  </div>

                  {showWatermarkEditor && (
                    <div className="border-t border-border pt-3">
                      <WatermarkCustomizePanel
                        project={{ ...project, watermark: liveWatermark || project.watermark }}
                        onWatermarkChange={(wm) => {
                          setLiveWatermark(wm);
                          queryClient.setQueryData<Project>(["project", project.id], (old) =>
                            old ? { ...old, watermark: wm } : old
                          );
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </SectionPanel>

            {/* Render Outputs & History */}
            <RenderHistoryList
              projectId={project.id}
              safeFilename={safeProjectFilename}
              jobs={renderJobs}
              activeTask={activeTask}
              onRefresh={() => refetchJobs()}
              onDeleteJob={(jobId) => deleteJobMutation.mutate(jobId)}
              isDeletingJob={deleteJobMutation.isPending}
              deletingJobId={deleteJobMutation.variables}
              onClearAll={() => clearAllJobsMutation.mutate()}
              isClearingAll={clearAllJobsMutation.isPending}
              onCancelJob={(jobId) => cancelJobMutation.mutate(jobId)}
              isCancelingJob={cancelJobMutation.isPending}
              cancelingJobId={cancelJobMutation.variables}
              onPreviewVideo={setPreviewModalVideo}
            />
          </div>
        </div>
      </div>

      <VideoPreviewModal
        video={previewModalVideo}
        filename={safeProjectFilename}
        onClose={() => setPreviewModalVideo(null)}
      />
    </div>
  );
}

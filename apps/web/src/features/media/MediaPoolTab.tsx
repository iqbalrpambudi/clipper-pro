import { useState, useMemo, useRef } from "react";
import {
  Upload,
  Youtube,
  Film,
  Trash2,
  Sparkles,
  AlertCircle,
  Loader2,
  Play,
  Mic,
  StopCircle,
  Scissors,
  Zap,
} from "lucide-react";
import { ScenePreviewModal } from "./ScenePreviewModal";
import { SourceVideoPlayer } from "./SourceVideoPlayer";
import { ImportUrlDialog } from "./ImportUrlDialog";
import { StudioTabHeader } from "@/components/layout";
import { useStudioStore } from "@/lib/store";
import { Project, SourceVideo, Scene } from "@/types";
import {
  useDeleteMedia,
  useCancelMedia,
  useUploadMedia,
  useRetagScenes,
  useTranscribeScenes,
} from "@/hooks/useMediaPool";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";
import { Toolbar, EmptyState } from "@/components/fragments";

interface MediaPoolTabProps {
  project: Project & {
    source_videos: SourceVideo[];
    scenes: Scene[];
  };
}

const formatDuration = (sec: number) =>
  `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;

export function MediaPoolTab({ project }: MediaPoolTabProps) {
  const { activeTask } = useStudioStore();

  const [isYTOpen, setIsYTOpen] = useState(false);
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [videoToDelete, setVideoToDelete] = useState<SourceVideo | null>(null);
  const [playerVideo, setPlayerVideo] = useState<SourceVideo | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const retagMutation = useRetagScenes(project.id);
  const transcribeMutation = useTranscribeScenes(project.id);
  const deleteMutation = useDeleteMedia(project.id);
  const cancelMediaMutation = useCancelMedia(project.id);
  const uploadMediaMutation = useUploadMedia(project.id);

  // Urutkan scene sesuai urutan asli video: source video sequence, lalu scene_index dan start_time
  const sortedScenes = useMemo(() => {
    const videoOrder = new Map(project.source_videos.map((v, i) => [v.id, i]));
    return [...project.scenes].sort(
      (a, b) =>
        (videoOrder.get(a.source_video_id) ?? 0) - (videoOrder.get(b.source_video_id) ?? 0) ||
        a.scene_index - b.scene_index ||
        a.start_time - b.start_time
    );
  }, [project.scenes, project.source_videos]);

  const untaggedCount = project.scenes.filter(
    (s) => !s.description || s.description === "Cuplikan video aksi/aktivitas"
  ).length;
  const untranscribedCount = project.scenes.filter((s) => !s.transcript).length;

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("files", f));
    uploadMediaMutation.mutate(formData);
  };

  const uploadButton = (
    <Button
      type="button"
      variant="workspace-primary"
      size="workspace-sm"
      onClick={() => fileInputRef.current?.click()}
      disabled={uploadMediaMutation.isPending}
      className="gap-1.5"
    >
      {uploadMediaMutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      <span>{uploadMediaMutation.isPending ? "Mengunggah..." : "Upload Video"}</span>
    </Button>
  );

  const importButton = (
    <Button
      type="button"
      variant="workspace-secondary"
      size="workspace-sm"
      onClick={() => setIsYTOpen(true)}
      className="gap-1.5"
    >
      <Youtube className="h-4 w-4 text-[#A9472C]" />
      <span>Impor dari URL</span>
    </Button>
  );

  return (
    <div>
      <StudioTabHeader
        icon={Film}
        title="Media Pool"
        badge={`${project.source_videos.length} Video`}
        secondaryBadge={`${project.scenes.length} Scenes`}
        description="Video mentah dan scene hasil analisis AI."
        actions={
          <div className="flex items-center gap-2">
            {importButton}
            {uploadButton}
          </div>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFileUpload(e.target.files);
          e.target.value = ""; // biar file yang sama bisa dipilih lagi
        }}
      />

      <div
        className={`mx-auto grid w-full max-w-[1920px] gap-6 px-4 py-5 sm:px-6 ${project.source_videos.length > 0 ? "lg:grid-cols-[320px_minmax(0,1fr)]" : ""}`}
      >
        {/* Kiri: daftar video sumber */}
        {project.source_videos.length > 0 && (
          <aside>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {project.source_videos.map((vid) => {
                const busy = vid.status === "downloading" || vid.status === "processing";
                const taskType = vid.status === "downloading" ? "youtube_download" : "scene_detect";
                const live =
                  busy &&
                  activeTask?.task_type === taskType &&
                  (!activeTask.data?.video_id || activeTask.data.video_id === vid.id);
                const progress = live ? activeTask.progress : vid.progress || 0;
                const isCancelling =
                  cancelMediaMutation.isPending && cancelMediaMutation.variables === vid.id;
                const sceneCount = project.scenes.filter(
                  (s) => s.source_video_id === vid.id
                ).length;

                let meta: string;
                if (busy) {
                  meta =
                    (live && activeTask.message) ||
                    (vid.status === "downloading" ? "Mengunduh..." : "Menganalisis visual...");
                } else if (vid.status === "failed") {
                  meta = vid.error_message || "Gagal memproses";
                } else {
                  meta = [
                    vid.duration > 0 && formatDuration(vid.duration),
                    vid.height > 0 && `${vid.height}p`,
                    vid.status === "ready" ? `${sceneCount} scene` : "Menunggu",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                }

                return (
                  <li key={vid.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {vid.status === "failed" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : vid.origin === "ytdlp" ? (
                        <Youtube className="h-4 w-4" />
                      ) : (
                        <Film className="h-4 w-4" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground" title={vid.filename}>
                        {vid.filename}
                      </p>
                      {vid.hardsub?.enabled && (
                        <Badge
                          variant="workspace-warning"
                          className="mt-0.5 text-[10px]"
                          title="Video ini punya subtitle bawaan; disembunyikan saat render. Atur lewat tombol putar."
                        >
                          Hardsub
                        </Badge>
                      )}
                      <p
                        className={`line-clamp-2 break-words text-xs ${vid.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                        title={meta}
                      >
                        {meta}
                      </p>
                      {busy && (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${Math.max(5, progress)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center">
                      {vid.status === "ready" && vid.file_url && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setPlayerVideo(vid)}
                          aria-label="Putar video"
                          title="Putar video"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {busy ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => cancelMediaMutation.mutate(vid.id)}
                          disabled={isCancelling}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Batalkan proses"
                          title="Batalkan proses"
                        >
                          {isCancelling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <StopCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setVideoToDelete(vid)}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Hapus video"
                          title="Hapus video"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        {/* Kanan: galeri scene + aksi AI (progress tampil di GlobalTaskIndicator) */}
        <section className="min-w-0 space-y-3">
          <Toolbar
            left={
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Scene</h3>
                {untaggedCount > 0 && (
                  <Badge variant="workspace-warning" className="text-xs">
                    {untaggedCount} belum di-tag
                  </Badge>
                )}
              </div>
            }
            right={
              project.scenes.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => transcribeMutation.mutate("id")}
                    disabled={transcribeMutation.isPending}
                    className="h-8 gap-1.5 text-xs"
                    title="Ekstrak dialog audio dengan Whisper"
                  >
                    {transcribeMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                    Transkrip{untranscribedCount > 0 && ` (${untranscribedCount})`}
                  </Button>
                  <Button
                    type="button"
                    variant="workspace-primary"
                    size="sm"
                    onClick={() => retagMutation.mutate("quick")}
                    disabled={retagMutation.isPending || untaggedCount === 0}
                    className="h-8 gap-1.5 text-xs"
                    title="Tag otomatis scene yang belum punya deskripsi AI"
                  >
                    {retagMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    AI Tagging{untaggedCount > 0 && ` (${untaggedCount})`}
                  </Button>
                </div>
              )
            }
          />

          {sortedScenes.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Belum ada scene"
              description="Upload video atau impor dari URL. Scene terbentuk otomatis setelah video dianalisis."
              action={uploadButton}
              secondaryAction={importButton}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {sortedScenes.map((scene) => {
                const cuts = scene.shot_info?.internal_cuts?.length ?? 0;
                return (
                  <button
                    type="button"
                    key={scene.id}
                    onClick={() => setPreviewScene(scene)}
                    className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <div className="relative aspect-video bg-muted">
                      {scene.thumbnail_url && !brokenThumbnails[scene.id] ? (
                        <img
                          src={scene.thumbnail_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={() =>
                            setBrokenThumbnails((prev) => ({ ...prev, [scene.id]: true }))
                          }
                        />
                      ) : (
                        <Film className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground/40" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-6 w-6 fill-white text-white" />
                      </div>

                      <div className="absolute inset-x-1 bottom-1 flex items-center gap-1 font-mono text-xs">
                        <span className="rounded bg-black/70 px-1 text-white">
                          #{scene.scene_index + 1}
                        </span>
                        {scene.transcript && (
                          <span className="rounded bg-black/70 p-0.5 text-white" title="Ada dialog">
                            <Mic className="h-3 w-3" />
                          </span>
                        )}
                        {scene.shot_info?.montage ? (
                          <span className="rounded bg-black/70 p-0.5 text-amber-300" title="Montage / fast cuts">
                            <Zap className="h-3 w-3" />
                          </span>
                        ) : cuts > 0 ? (
                          <span
                            className="flex items-center gap-0.5 rounded bg-black/70 px-1 text-amber-300"
                            title={`${cuts} cut internal terdeteksi`}
                          >
                            <Scissors className="h-3 w-3" />
                            {cuts}
                          </span>
                        ) : null}
                        <span className="ml-auto rounded bg-black/70 px-1 text-white">
                          {scene.duration}s
                        </span>
                      </div>
                    </div>
                    <p className="line-clamp-2 p-2 text-xs leading-snug text-foreground/90">
                      {scene.description || "Scene visual"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ImportUrlDialog project={project} open={isYTOpen} onOpenChange={setIsYTOpen} />

      <Dialog open={Boolean(videoToDelete)} onOpenChange={(open) => !open && setVideoToDelete(null)}>
        <DialogContent appearance="workspace" className="max-w-md">
          <DialogTitle className="text-base">Hapus video?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">"{videoToDelete?.filename}"</span> beserta
            semua scene-nya akan dihapus permanen.
          </DialogDescription>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setVideoToDelete(null)}>
              Batal
            </Button>
            <Button
              type="button"
              id="confirm-delete-video-btn"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!videoToDelete) return;
                deleteMutation.mutate(videoToDelete.id);
                setVideoToDelete(null);
              }}
            >
              Hapus Video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewScene && (
        <ScenePreviewModal
          isOpen
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
          shotInfo={previewScene.shot_info}
        />
      )}

      {playerVideo && (
        <SourceVideoPlayer isOpen onClose={() => setPlayerVideo(null)} video={playerVideo} />
      )}
    </div>
  );
}

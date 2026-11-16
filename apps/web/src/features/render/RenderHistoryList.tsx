import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Film,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  StopCircle,
  Trash2,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { resolveApiUrl } from "@/env";
import { RenderJob } from "@/types";
import { PreviewModalVideoState } from "./VideoPreviewModal";
import { formatBytes } from "./utils";

interface ActiveTaskLike {
  task_type?: string;
  status?: string;
  progress?: number;
  message?: string;
  data?: { job_id?: string };
}

interface RenderHistoryListProps {
  projectId: string;
  safeFilename: string;
  jobs: RenderJob[];
  activeTask: ActiveTaskLike | null;
  onRefresh: () => void;
  onDeleteJob: (jobId: string) => void;
  isDeletingJob: boolean;
  deletingJobId?: string;
  onClearAll: () => void;
  isClearingAll: boolean;
  onCancelJob: (jobId: string) => void;
  isCancelingJob: boolean;
  cancelingJobId?: string;
  onPreviewVideo: (video: PreviewModalVideoState) => void;
}

export function RenderHistoryList({
  projectId,
  safeFilename,
  jobs,
  activeTask,
  onRefresh,
  onDeleteJob,
  isDeletingJob,
  deletingJobId,
  onClearAll,
  isClearingAll,
  onCancelJob,
  isCancelingJob,
  cancelingJobId,
  onPreviewVideo,
}: RenderHistoryListProps) {
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const totalStorageBytes = jobs.reduce((acc, j) => acc + (j.file_size_bytes || 0), 0);

  return (
    <SectionPanel
      title={`Hasil Render (${jobs.length})`}
      icon={<Film className="h-4 w-4 text-primary" />}
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-card"
      badge={
        totalStorageBytes > 0 ? (
          <Badge
            variant="outline"
            className="gap-1 border-border font-mono text-[11px] tabular-nums text-muted-foreground"
          >
            <HardDrive className="h-2.5 w-2.5 text-primary" />
            {formatBytes(totalStorageBytes)}
          </Badge>
        ) : undefined
      }
      actions={
        <div className="flex items-center gap-1.5">
          {jobs.length > 0 &&
            (confirmClearAll ? (
              <div className="flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-0.5">
                <span className="text-xs font-medium text-destructive">Hapus semua?</span>
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() => {
                    onClearAll();
                    setConfirmClearAll(false);
                  }}
                  disabled={isClearingAll}
                  className="h-5 px-1.5 text-xs"
                >
                  {isClearingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ya"}
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmClearAll(false)}
                  className="h-5 px-1.5 text-xs"
                >
                  Batal
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setConfirmClearAll(true)}
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Bersihkan
              </Button>
            ))}

          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
    >
      {jobs.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Belum ada hasil render. Klik <strong>Render Final</strong> di atas untuk mulai.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {jobs.map((job) => {
            const isCurrentActive =
              activeTask?.task_type === "render" &&
              (!activeTask.data?.job_id || activeTask.data?.job_id === job.id);
            const currentProgress =
              isCurrentActive && activeTask?.status === "progress"
                ? (activeTask.progress ?? job.progress)
                : job.progress;
            const currentLog =
              isCurrentActive && activeTask?.status === "progress"
                ? activeTask.message
                : job.log_output;
            const downloadUrl = resolveApiUrl(`/api/v1/projects/${projectId}/render/download/${job.id}`);

            return (
              <div key={job.id} className="flex flex-col gap-2.5 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {job.status === "completed" && job.output_url && (
                      <button
                        type="button"
                        onClick={() =>
                          onPreviewVideo({
                            url: job.output_url!,
                            title: `Render ${job.render_type.toUpperCase()} (${job.id.slice(0, 8)})`,
                            poster: job.thumbnail_url,
                          })
                        }
                        className="group relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-black focus:outline-none focus:ring-2 focus:ring-primary/40"
                        title="Putar video"
                      >
                        {job.thumbnail_url ? (
                          <img
                            src={job.thumbnail_url}
                            alt={`Thumbnail ${job.id}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <Film className="h-4 w-4" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/35 transition group-hover:bg-black/20">
                          <Play className="h-3.5 w-3.5 fill-white text-white" />
                        </div>
                      </button>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-semibold uppercase tracking-wider"
                        >
                          {job.render_type}
                        </Badge>
                        {job.status === "completed" && (
                          <Badge
                            variant="workspace-success"
                            className="gap-1 text-[11px] font-medium"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Selesai
                          </Badge>
                        )}
                        {job.status === "rendering" && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-500/30 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400"
                          >
                            <Loader2 className="h-3 w-3 animate-spin" /> {currentProgress}%
                          </Badge>
                        )}
                        {job.status === "queued" && (
                          <Badge variant="secondary" className="text-[11px]">
                            Antrean
                          </Badge>
                        )}
                        {job.status === "failed" && (
                          <Badge variant="destructive" className="gap-1 text-[11px]">
                            <AlertCircle className="h-3 w-3" /> Gagal
                          </Badge>
                        )}
                        {job.file_size_bytes ? (
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {formatBytes(job.file_size_bytes)}
                          </span>
                        ) : null}
                      </div>

                      {job.output_url && job.status === "completed" && (
                        <p className="truncate font-mono text-[11px] text-muted-foreground">
                          {job.output_url.split("/").pop()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.status === "completed" && job.output_url && (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            onPreviewVideo({
                              url: job.output_url!,
                              title: `Render ${job.render_type.toUpperCase()} (${job.id.slice(0, 8)})`,
                              poster: job.thumbnail_url,
                            })
                          }
                          className="h-7 gap-1 border-border text-xs"
                        >
                          <Play className="h-3 w-3 fill-primary text-primary" />
                          Putar
                        </Button>
                        <Button
                          variant="workspace-primary"
                          size="xs"
                          asChild
                          className="h-7 gap-1 text-xs font-semibold"
                        >
                          <a href={downloadUrl} download={safeFilename}>
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                        </Button>
                      </>
                    )}

                    {(job.status === "rendering" || job.status === "queued") && (
                      <Button
                        variant="destructive"
                        size="xs"
                        onClick={() => onCancelJob(job.id)}
                        disabled={isCancelingJob && cancelingJobId === job.id}
                        className="h-7 gap-1 px-2 text-xs font-semibold"
                      >
                        {isCancelingJob && cancelingJobId === job.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <StopCircle className="h-3 w-3" />
                        )}
                        Batalkan
                      </Button>
                    )}

                    {confirmDeleteJobId === job.id ? (
                      <div className="flex items-center gap-1 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteJob(job.id);
                            setConfirmDeleteJobId(null);
                          }}
                          disabled={isDeletingJob && deletingJobId === job.id}
                          className="rounded bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-destructive-foreground disabled:opacity-50"
                        >
                          Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteJobId(null)}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setConfirmDeleteJobId(job.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Hapus riwayat"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {job.status === "rendering" && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${currentProgress}%` }}
                    />
                  </div>
                )}

                {currentLog && (job.status === "rendering" || job.status === "failed") && (
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{currentLog}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionPanel>
  );
}

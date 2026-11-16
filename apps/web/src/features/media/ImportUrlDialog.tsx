import React, { useState, useEffect } from "react";
import { Youtube, Loader2 } from "lucide-react";
import { useEditorConfigStore } from "@/lib/store";
import { Project, YTInfoResponse } from "@/types";
import { useDownloadYT, useYTInfo } from "@/hooks/useMediaPool";
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui";

interface ImportUrlDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportUrlDialog({ project, open, onOpenChange }: ImportUrlDialogProps) {
  const { getShortsConfig, setShortsStepConfig } = useEditorConfigStore();
  const [ytUrl, setYtUrl] = useState(getShortsConfig(project.id, project).mediaPool.ytUrl || "");
  const [ytInfo, setYtInfo] = useState<YTInfoResponse | null>(null);
  const [ytStart, setYtStart] = useState("");
  const [ytEnd, setYtEnd] = useState("");
  const [downloadingFormatId, setDownloadingFormatId] = useState<string | null>(null);

  const inspectMutation = useYTInfo(project.id);
  const downloadMutation = useDownloadYT(project.id);

  const trim = {
    start_sec: ytStart.trim() ? Number(ytStart) : undefined,
    end_sec: ytEnd.trim() ? Number(ytEnd) : undefined,
  };

  useEffect(() => {
    setShortsStepConfig(project.id, "mediaPool", { ytUrl });
  }, [project.id, ytUrl, setShortsStepConfig]);

  const close = (next: boolean) => {
    if (!next) setYtInfo(null);
    onOpenChange(next);
  };

  const handleInspect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setYtInfo(null);
    inspectMutation.mutate({ url: ytUrl.trim(), trim }, { onSuccess: setYtInfo });
  };

  const handleDownload = (formatId: string) => {
    setDownloadingFormatId(formatId);
    downloadMutation.mutate(
      { url: ytUrl.trim(), formatId, title: ytInfo?.title, trim },
      {
        onSettled: () => setDownloadingFormatId(null),
        onSuccess: () => {
          setYtUrl("");
          close(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent appearance="workspace" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-accent-foreground" />
            Impor Video dari URL
          </DialogTitle>
          <DialogDescription>
            YouTube, Bilibili, Douyin, TikTok, VK, atau Rutube.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleInspect} className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="url"
              required
              placeholder="https://..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="flex-1"
              autoFocus
            />
            <Button
              type="submit"
              variant="workspace-primary"
              size="sm"
              disabled={inspectMutation.isPending}
              className="shrink-0 gap-1.5"
            >
              {inspectMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Periksa
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Potong (detik, opsional)</span>
            <Input
              type="number"
              min={0}
              placeholder="mulai"
              aria-label="Detik mulai"
              value={ytStart}
              onChange={(e) => setYtStart(e.target.value)}
              className="h-8 w-20 text-xs"
            />
            <span>–</span>
            <Input
              type="number"
              min={0}
              placeholder="selesai"
              aria-label="Detik selesai"
              value={ytEnd}
              onChange={(e) => setYtEnd(e.target.value)}
              className="h-8 w-20 text-xs"
            />
          </div>
        </form>

        {ytInfo && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex gap-3">
              {ytInfo.thumbnail && (
                <img
                  src={ytInfo.thumbnail}
                  alt=""
                  className="h-14 w-24 shrink-0 rounded-md object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-foreground">{ytInfo.title}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {ytInfo.duration_str}
                </p>
              </div>
            </div>

            {ytInfo.heatmap && ytInfo.heatmap.length > 0 && (
              <div title="Bar tinggi = bagian paling sering ditonton ulang">
                <p className="mb-1 text-xs text-muted-foreground">Most replayed</p>
                <div className="flex h-6 items-end gap-px overflow-hidden rounded bg-muted/40">
                  {ytInfo.heatmap.map((b, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t-sm bg-primary"
                      style={{ height: `${Math.max(4, b.value * 100)}%`, opacity: 0.25 + b.value * 0.75 }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {ytInfo.formats?.map((fmt) => {
                const isSelected = downloadingFormatId === fmt.format_id;
                return (
                  <Button
                    key={fmt.format_id}
                    type="button"
                    variant={isSelected ? "workspace-primary" : "outline"}
                    size="sm"
                    disabled={Boolean(downloadingFormatId)}
                    onClick={() => handleDownload(fmt.format_id)}
                    className="justify-between text-xs"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {isSelected && <Loader2 className="h-3 w-3 animate-spin" />}
                      {fmt.resolution}
                    </span>
                    <span className="font-mono opacity-70">
                      {fmt.filesize_approx_mb ? `${fmt.filesize_approx_mb} MB` : "Auto"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

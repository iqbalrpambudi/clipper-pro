import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button, Dialog, DialogContent, DialogTitle, Slider, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import { hardsubTreatment } from "@/lib/timeline/hardsub";
import type { SourceVideo } from "@/types";

interface SourceVideoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  video: SourceVideo;
}

const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${Math.floor(sec % 60)
    .toString()
    .padStart(2, "0")}`;

export function SourceVideoPlayer({ isOpen, onClose, video }: SourceVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const heatmap = video.heatmap_data ?? [];
  const maxHeat = Math.max(...heatmap.map((b) => b.value), 0.01);

  // Burned-in subtitle band (auto-detected or set here); the renderer crops or blurs it
  const queryClient = useQueryClient();
  const { showToast } = useStudioStore();
  // The dialog holds the video object from when it opened, so track the last saved band here
  const [saved, setSaved] = useState(video.hardsub);
  const [hsEnabled, setHsEnabled] = useState(saved?.enabled ?? false);
  const [hsTop, setHsTop] = useState(saved?.top ?? 0.78);
  const [hsBottom, setHsBottom] = useState(saved?.bottom ?? 0.95);
  const draft = { enabled: hsEnabled, top: hsTop, bottom: hsBottom };
  const treatment = hardsubTreatment({ ...draft, source: "manual" });
  const isDirty =
    hsEnabled !== (saved?.enabled ?? false) ||
    (hsEnabled && (hsTop !== saved?.top || hsBottom !== saved?.bottom));
  const saveHardsub = useMutation({
    mutationFn: () => api.updateSourceVideo(video.project_id, video.id, { hardsub: draft }),
    onSuccess: (updated) => {
      setSaved(updated.hardsub);
      queryClient.invalidateQueries({ queryKey: ["project", video.project_id] });
      showToast("Pengaturan hardsub disimpan", "success");
    },
    onError: (err: Error) => showToast(err.message || "Gagal menyimpan hardsub", "error"),
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent appearance="workspace" className="max-w-3xl gap-3">
        <DialogTitle className="truncate pr-8 text-sm">{video.filename}</DialogTitle>

        <div
          className="relative w-full overflow-hidden rounded-lg bg-black"
          style={{
            aspectRatio:
              video.width && video.height ? `${video.width} / ${video.height}` : "16 / 9",
          }}
        >
          <video
            ref={videoRef}
            src={video.file_url || ""}
            controls
            autoPlay
            preload="metadata"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            className="h-full w-full"
          />
          {hsEnabled && (
            <div
              className="pointer-events-none absolute inset-x-0 border-y-2 border-dashed border-amber-400 bg-amber-400/15"
              style={{ top: `${hsTop * 100}%`, height: `${Math.max(0, hsBottom - hsTop) * 100}%` }}
            />
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">Subtitle bawaan (hardsub)</p>
              <p className="text-[11px] text-muted-foreground">
                {!hsEnabled
                  ? "Tidak ada. Nyalakan jika video sudah punya subtitle tertanam."
                  : treatment?.kind === "crop"
                    ? "Bagian kotak kuning ke bawah akan dipotong saat render."
                    : treatment?.kind === "blur"
                      ? "Posisi terlalu tinggi untuk dipotong — kotak kuning akan diblur saat render."
                      : "Batas bawah harus di bawah batas atas."}
                {saved &&
                  ` · ${saved.source === "manual" ? "Diatur manual" : "Terdeteksi otomatis"}`}
              </p>
            </div>
            <Switch
              checked={hsEnabled}
              onCheckedChange={setHsEnabled}
              aria-label="Video ini punya hardsub"
            />
          </div>
          {hsEnabled && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-[11px] text-muted-foreground">
                <span className="flex justify-between">
                  Batas atas{" "}
                  <span className="font-mono tabular-nums">{Math.round(hsTop * 100)}%</span>
                </span>
                <Slider
                  min={0}
                  max={0.99}
                  step={0.01}
                  value={[hsTop]}
                  onValueChange={([v]) => setHsTop(Math.min(v, hsBottom - 0.01))}
                  aria-label="Batas atas hardsub"
                />
              </label>
              <label className="space-y-1.5 text-[11px] text-muted-foreground">
                <span className="flex justify-between">
                  Batas bawah{" "}
                  <span className="font-mono tabular-nums">{Math.round(hsBottom * 100)}%</span>
                </span>
                <Slider
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={[hsBottom]}
                  onValueChange={([v]) => setHsBottom(Math.max(v, hsTop + 0.01))}
                  aria-label="Batas bawah hardsub"
                />
              </label>
            </div>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveHardsub.mutate()}
              disabled={!isDirty || saveHardsub.isPending || (hsEnabled && !treatment)}
              className="h-7 gap-1.5 text-xs"
            >
              {saveHardsub.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Simpan
            </Button>
          </div>
        </div>

        {heatmap.length > 0 && (
          <div>
            <div className="flex h-8 items-end gap-px">
              {heatmap.map((b, i) => {
                const value = b.value / maxHeat;
                const isCurrent = currentTime >= b.start_time && currentTime < b.end_time;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() =>
                      videoRef.current && (videoRef.current.currentTime = b.start_time)
                    }
                    className={`flex-1 rounded-t-sm ${isCurrent ? "bg-primary" : "bg-primary/40 hover:bg-primary/70"}`}
                    style={{ height: `${Math.max(4, value * 100)}%` }}
                    title={`${formatTime(b.start_time)} – ${formatTime(b.end_time)}`}
                    aria-label={`Lompat ke ${formatTime(b.start_time)}`}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Most replayed dari YouTube. Klik bar untuk lompat ke bagian itu.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

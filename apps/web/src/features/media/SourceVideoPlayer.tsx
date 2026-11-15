import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui";
import type { SourceVideo } from "@/types";

interface SourceVideoPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  video: SourceVideo;
}

const formatTime = (sec: number) =>
  `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;

export function SourceVideoPlayer({ isOpen, onClose, video }: SourceVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const heatmap = video.heatmap_data ?? [];
  const maxHeat = Math.max(...heatmap.map((b) => b.value), 0.01);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent appearance="workspace" className="max-w-3xl gap-3">
        <DialogTitle className="truncate pr-8 text-sm">{video.filename}</DialogTitle>

        <video
          ref={videoRef}
          src={video.file_url || ""}
          controls
          autoPlay
          preload="metadata"
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="aspect-video w-full rounded-lg bg-black"
        />

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
                    onClick={() => videoRef.current && (videoRef.current.currentTime = b.start_time)}
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

import { Download, Film } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";

export interface PreviewModalVideoState {
  url: string;
  title: string;
  poster?: string | null;
}

interface VideoPreviewModalProps {
  video: PreviewModalVideoState | null;
  filename: string;
  onClose: () => void;
}

export function VideoPreviewModal({ video, filename, onClose }: VideoPreviewModalProps) {
  return (
    <Dialog open={Boolean(video)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="workspace-dialog max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-muted/50 px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-xs font-semibold">
            <Film className="h-4 w-4 text-primary" />
            <span className="truncate">{video?.title}</span>
          </DialogTitle>
        </DialogHeader>

        {video && (
          <div className="flex items-center justify-center bg-black p-4">
            <video
              src={video.url}
              poster={video.poster || undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[65vh] w-auto rounded-lg"
            />
          </div>
        )}

        <DialogFooter className="border-t border-border bg-muted/40 px-4 py-3 sm:justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Tutup
          </Button>
          {video && (
            <Button variant="workspace-primary" size="sm" asChild className="h-8 gap-1.5 text-xs">
              <a href={video.url} download={filename}>
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui";

interface ImageZoomModalProps {
  zoomImage: { url: string; title: string } | null;
  onClose: () => void;
}

export function ImageZoomModal({ zoomImage, onClose }: ImageZoomModalProps) {
  if (!zoomImage) return null;

  return (
    <Dialog open={Boolean(zoomImage)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl border-white/15 bg-[#171717] p-4 text-white sm:p-6">
        <DialogTitle className="text-sm font-semibold text-white">{zoomImage.title}</DialogTitle>
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/15 bg-black">
          <img src={zoomImage.url} alt={zoomImage.title} className="h-full w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

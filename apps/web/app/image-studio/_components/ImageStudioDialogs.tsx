"use client";

import React from "react";
import { FolderOpen, Trash2, X, Loader2 } from "lucide-react";
import { ImagePreset } from "@/types";
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui";

interface ImagePresetsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  presets: ImagePreset[];
  isLoading: boolean;
  onActivatePreset: (id: string) => void;
  isActivating: boolean;
  onLoadPreset: (preset: ImagePreset) => void;
  onDeletePreset: (id: string) => void;
}

export function ImagePresetsDialog({
  isOpen,
  onOpenChange,
  presets,
  isLoading,
  onActivatePreset,
  isActivating,
  onLoadPreset,
  onDeletePreset,
}: ImagePresetsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-surface border-border text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="w-5 h-5 text-violet-400" />
            <span>Daftar Preset Gaya Ilustrasi AI</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Kelola semua preset visual yang tersimpan. Anda dapat mengaktifkan, mengedit di
            studio, atau menghapus preset kustom.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1 py-2">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memuat daftar preset...</span>
            </div>
          ) : presets.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Belum ada preset tersimpan.
            </div>
          ) : (
            presets.map((preset) => (
              <div
                key={preset.id}
                className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  preset.is_active
                    ? "bg-emerald-950/20 border-emerald-500/40"
                    : "bg-background border-border hover:border-surface-border"
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-16 h-12 rounded-lg overflow-hidden border border-border bg-black shrink-0">
                    <img
                      src={
                        preset.preview_image_url ||
                        preset.reference_image_url ||
                        "/storage/presets/doodle_preview.png"
                      }
                      alt={preset.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white truncate">{preset.name}</span>
                      {preset.is_active && (
                        <Badge variant="supabase" className="text-[9px] px-1.5 py-0 font-mono">
                          Aktif
                        </Badge>
                      )}
                      {preset.is_builtin && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 border-violet-500/30 text-violet-300 font-mono"
                        >
                          Bawaan
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                      {preset.description || preset.master_prompt.slice(0, 80)}...
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!preset.is_active && (
                    <Button
                      size="sm"
                      variant="supabase"
                      onClick={() => onActivatePreset(preset.id)}
                      disabled={isActivating}
                      className="text-[11px] h-8 px-2.5"
                    >
                      Aktifkan
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onLoadPreset(preset)}
                    className="text-[11px] h-8 px-2.5 border-border"
                  >
                    Buka di Studio
                  </Button>
                  {!preset.is_builtin && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDeletePreset(preset.id)}
                      className="text-[11px] h-8 px-2 border-border text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="border-border text-xs"
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ImageZoomModalProps {
  zoomImage: { url: string; title: string } | null;
  onClose: () => void;
}

export function ImageZoomModal({ zoomImage, onClose }: ImageZoomModalProps) {
  if (!zoomImage) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in"
    >
      <div className="relative max-w-5xl w-full flex flex-col items-center">
        <div className="w-full flex items-center justify-between text-white mb-2">
          <span className="text-sm font-semibold">{zoomImage.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="aspect-video w-full rounded-2xl overflow-hidden border border-border shadow-2xl bg-black">
          <img
            src={zoomImage.url}
            alt={zoomImage.title}
            className="w-full h-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

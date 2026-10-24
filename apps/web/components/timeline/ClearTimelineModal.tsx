"use client";

import React from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClearTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  clearScope: "all" | "video_only";
  onScopeChange: (scope: "all" | "video_only") => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function ClearTimelineModal({
  isOpen,
  onClose,
  clearScope,
  onScopeChange,
  onConfirm,
  isPending,
}: ClearTimelineModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Kosongkan Timeline?</h3>
            <p className="text-xs text-muted-foreground">
              Pilih cakupan track yang ingin dikosongkan
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onScopeChange("all")}
            className={`w-full p-3 rounded-lg border text-left flex items-start gap-3 transition cursor-pointer ${
              clearScope === "all"
                ? "bg-destructive/10 border-destructive/50 text-foreground ring-1 ring-destructive/30"
                : "bg-background border-border text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                clearScope === "all" ? "border-destructive bg-destructive" : "border-border"
              }`}
            >
              {clearScope === "all" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-foreground">
                Kosongkan Semua Track (V1, S1, A1)
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Hapus semua klip video serta lepaskan audio narasi dan subtitle dari timeline.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onScopeChange("video_only")}
            className={`w-full p-3 rounded-lg border text-left flex items-start gap-3 transition cursor-pointer ${
              clearScope === "video_only"
                ? "bg-primary/10 border-primary/50 text-foreground ring-1 ring-primary/30"
                : "bg-background border-border text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center ${
                clearScope === "video_only" ? "border-primary bg-primary" : "border-border"
              }`}
            >
              {clearScope === "video_only" && (
                <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-foreground">
                Hanya Klip Video Saja (V1)
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Hapus klip video tetapi biarkan audio narasi dan subtitle tetap berada di timeline.
              </div>
            </div>
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed bg-background p-2.5 rounded-lg border border-border">
          💡 <strong>Tips:</strong> Jika semua track dikosongkan, Anda dapat menggunakan tombol{" "}
          <span className="text-primary font-semibold">+ Re-add Audio & Subtitle</span> atau{" "}
          <span className="text-primary font-semibold">Auto-Match AI</span> kembali kapan saja.
        </p>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={onConfirm}
            className="gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>
              {clearScope === "all" ? "Kosongkan Semua Track" : "Hapus Klip Video Saja"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

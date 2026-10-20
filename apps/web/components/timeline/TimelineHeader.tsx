"use client";

import React from "react";
import {
  Film,
  Sparkles,
  Loader2,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Subtitles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TimelineHeaderProps {
  clipsCount: number;
  isSaving: boolean;
  isDirty: boolean;
  totalDuration: number;
  isAudioAttached: boolean;
  isSubtitlesAttached: boolean;
  isReadding: boolean;
  isAutoMatching: boolean;
  matchElapsed: number;
  onReaddAll: () => void;
  onOpenClearModal: () => void;
  onAutoMatch: () => void;
  onRender: () => void;
}

export function TimelineHeader({
  clipsCount,
  isSaving,
  isDirty,
  totalDuration,
  isAudioAttached,
  isSubtitlesAttached,
  isReadding,
  isAutoMatching,
  matchElapsed,
  onReaddAll,
  onOpenClearModal,
  onAutoMatch,
  onRender,
}: TimelineHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-xs text-foreground tracking-tight flex items-center gap-1.5">
            <Film className="w-4 h-4 text-primary" />
            Timeline Studio
          </span>
          <Badge
            variant="outline"
            className="font-mono text-[10px] text-muted-foreground border-border"
          >
            {clipsCount} klip
          </Badge>
          {isSaving ? (
            <Badge
              variant="outline"
              className="border-primary/40 text-primary text-[10px] flex items-center gap-1"
            >
              <Loader2 className="w-3 h-3 animate-spin" /> Menyimpan...
            </Badge>
          ) : isDirty ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-400 text-[10px] flex items-center gap-1"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Autosave...
            </Badge>
          ) : clipsCount > 0 ? (
            <Badge
              variant="outline"
              className="border-primary/40 text-primary text-[10px] flex items-center gap-1"
            >
              <CheckCircle2 className="w-3 h-3" /> Tersimpan
            </Badge>
          ) : null}
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Durasi:{" "}
            <strong className="text-foreground font-mono">{Math.round(totalDuration)}s</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(!isAudioAttached || !isSubtitlesAttached) && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onReaddAll}
              disabled={isReadding}
              className="border-primary/40 text-primary hover:bg-primary/10 font-semibold text-xs flex items-center gap-1.5 h-7"
              title="Tambahkan kembali audio narasi dan subtitle ke timeline"
            >
              {isReadding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Subtitles className="w-3.5 h-3.5" />
              )}
              <span>Re-add Audio & Subtitle</span>
            </Button>
          )}

          {(clipsCount > 0 || isAudioAttached || isSubtitlesAttached) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onOpenClearModal}
              className="text-destructive hover:bg-destructive/10 text-xs font-medium flex items-center gap-1 h-7"
              title="Kosongkan timeline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Kosongkan</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onAutoMatch}
            disabled={isAutoMatching}
            className="border-primary/30 text-primary hover:bg-primary/10 font-semibold text-xs flex items-center gap-1.5 h-7"
            title="Cocokkan otomatis klip video dengan naskah menggunakan AI"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAutoMatching ? "Mencocokkan..." : "Auto-Match AI"}</span>
          </Button>

          <Button
            type="button"
            variant="supabase"
            size="xs"
            onClick={onRender}
            className="text-xs font-semibold flex items-center gap-1 h-7"
          >
            <span>Render</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {isAutoMatching && (
        <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 flex items-center justify-between text-xs text-primary shrink-0">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI sedang mencocokkan potongan video dengan naskah...</span>
          </div>
          <span className="font-mono text-muted-foreground">
            {Math.floor(matchElapsed / 60)}:{String(matchElapsed % 60).padStart(2, "0")}
          </span>
        </div>
      )}
    </>
  );
}

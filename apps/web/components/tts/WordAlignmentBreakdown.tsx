"use client";

import React from "react";
import {
  AlignLeft,
  Wand2,
  Sliders,
  CheckCircle2,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { SentenceSegment, WordTimestamp } from "@/types";
import { Button } from "@/components/ui/button";
import { formatAudioTime } from "./constants";

interface WordAlignmentBreakdownProps {
  segments: SentenceSegment[];
  editableSegments: SentenceSegment[];
  isEditTimingMode: boolean;
  onToggleEditTiming: () => void;
  currentTime: number;
  offsetMs: number;
  isRealignPending: boolean;
  isGeneratingTTS: boolean;
  hasAudioUrl: boolean;
  onRealign: () => void;
  onGlobalOffsetShift: (deltaMs: number) => void;
  onWordTimingNudge: (segIdx: number, wordIdx: number, deltaMs: number) => void;
  onSaveSegments: () => void;
  isSaveSegmentsPending: boolean;
  onSeek: (timeSec: number) => void;
  onNavigateTimeline: () => void;
}

export function WordAlignmentBreakdown({
  segments,
  editableSegments,
  isEditTimingMode,
  onToggleEditTiming,
  currentTime,
  offsetMs,
  isRealignPending,
  isGeneratingTTS,
  hasAudioUrl,
  onRealign,
  onGlobalOffsetShift,
  onWordTimingNudge,
  onSaveSegments,
  isSaveSegmentsPending,
  onSeek,
  onNavigateTimeline,
}: WordAlignmentBreakdownProps) {
  const displaySegments = isEditTimingMode ? editableSegments : segments;

  return (
    <div className="pt-2 border-t border-[#2E2E2E] space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <AlignLeft className="w-3.5 h-3.5 text-primary" />
            <span>Hasil Word-Level Alignment ({segments.length} Segmen)</span>
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isEditTimingMode
              ? "Mode koreksi aktif: sesuaikan timing per kata lalu klik Simpan"
              : "Klik kata untuk melompat audio • Gunakan Re-align Kata jika timestamp belum presisi"}
          </p>
        </div>

        {/* Action Toolbar: Realignment AI & Offset Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Realignment Trigger Button */}
          <Button
            type="button"
            variant="supabase"
            size="xs"
            onClick={onRealign}
            disabled={isRealignPending || isGeneratingTTS || !hasAudioUrl}
            className="gap-1.5 font-semibold shadow-xs"
            title="Jalankan ulang forced word alignment dengan Whisper AI"
          >
            {isRealignPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Wand2 className="w-3 h-3" />
            )}
            <span>{isRealignPending ? "Re-aligning..." : "Re-align Kata (AI)"}</span>
          </Button>

          {/* Global Offset Calibration Box */}
          <div className="flex items-center bg-[#181818] border border-[#2E2E2E] rounded-md px-1 py-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onGlobalOffsetShift(-50)}
              disabled={isRealignPending}
              className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-[#242424] rounded text-[10px] font-mono transition"
              title="Geser semua kata 50ms lebih awal (-50ms)"
            >
              -50ms
            </button>
            <span className="px-1.5 text-[10px] font-mono text-primary font-bold border-x border-[#2E2E2E]">
              {offsetMs >= 0 ? `+${offsetMs}` : offsetMs}ms
            </span>
            <button
              type="button"
              onClick={() => onGlobalOffsetShift(50)}
              disabled={isRealignPending}
              className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-[#242424] rounded text-[10px] font-mono transition"
              title="Geser semua kata 50ms lebih lambat (+50ms)"
            >
              +50ms
            </button>
          </div>

          {/* Toggle Edit Timing Mode */}
          <Button
            type="button"
            variant={isEditTimingMode ? "supabase" : "outline"}
            size="xs"
            onClick={onToggleEditTiming}
            className="h-7 text-[11px] gap-1"
            title="Koreksi manual per-kata"
          >
            <Sliders className="w-3 h-3" />
            <span>{isEditTimingMode ? "Batal Edit" : "Edit Timing"}</span>
          </Button>

          {isEditTimingMode && (
            <Button
              type="button"
              variant="supabase"
              size="xs"
              onClick={onSaveSegments}
              disabled={isSaveSegmentsPending}
              className="h-7 text-[11px] gap-1 font-semibold"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{isSaveSegmentsPending ? "Menyimpan..." : "Simpan"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Segments & Word Badges Breakdown */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {displaySegments.map((seg, i) => {
          const isSegActive =
            currentTime * 1000 >= seg.start_ms && currentTime * 1000 <= seg.end_ms;
          return (
            <div
              key={seg.id || i}
              className={`p-3 rounded-xl border transition-all ${
                isSegActive
                  ? "bg-primary/10 border-primary/40 shadow-xs ring-1 ring-primary/20"
                  : "bg-[#141414] border-[#2E2E2E] hover:border-[#3E3E3E]"
              }`}
            >
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground mb-1.5">
                <span className="text-primary font-semibold">Segmen #{i + 1}</span>
                <span>
                  {formatAudioTime(seg.start_ms / 1000)} — {formatAudioTime(seg.end_ms / 1000)} (
                  {((seg.end_ms - seg.start_ms) / 1000).toFixed(2)}s)
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {seg.words && seg.words.length > 0 ? (
                  seg.words.map((w: WordTimestamp, wi: number) => {
                    const isWordActive =
                      currentTime * 1000 >= w.start_ms && currentTime * 1000 <= w.end_ms;

                    if (isEditTimingMode) {
                      return (
                        <div
                          key={wi}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-[#181818] border border-[#2E2E2E]"
                        >
                          <span className="font-semibold text-foreground">{w.word}</span>
                          <span className="font-mono text-[9px] text-muted-foreground bg-[#121212] px-1 rounded border border-[#2E2E2E]">
                            {w.start_ms}ms
                          </span>
                          <div className="flex items-center gap-0.5 ml-0.5">
                            <button
                              type="button"
                              onClick={() => onWordTimingNudge(i, wi, -50)}
                              className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-[#242424]"
                              title="Mundurkan 50ms"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => onWordTimingNudge(i, wi, 50)}
                              className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-[#242424]"
                              title="Majukan 50ms"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={wi}
                        type="button"
                        onClick={() => onSeek(w.start_ms / 1000)}
                        className={`px-2 py-0.5 rounded-md text-xs transition cursor-pointer ${
                          isWordActive
                            ? "bg-primary text-black font-semibold shadow-xs"
                            : "bg-[#181818] border border-[#2E2E2E] text-muted-foreground hover:text-foreground hover:border-primary/40"
                        }`}
                        title={`${w.word} • ${w.start_ms}ms - ${w.end_ms}ms`}
                      >
                        {w.word}
                      </button>
                    );
                  })
                ) : (
                  <span className="text-xs text-foreground">{seg.text}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Next Tab Button */}
      <div className="pt-4 border-t border-[#2E2E2E] flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Audio siap! Lanjutkan ke perakitan Timeline & Subtitle.
        </span>
        <Button
          variant="supabase"
          size="sm"
          onClick={onNavigateTimeline}
          className="gap-2 font-semibold"
        >
          <span>Lanjut ke Timeline</span>
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

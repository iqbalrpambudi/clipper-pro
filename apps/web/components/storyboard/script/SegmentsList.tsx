"use client";

import React from "react";
import {
  BookOpen,
  Layers,
  Check,
  Copy,
  ArrowRight,
  Edit2,
  X,
  Loader2,
} from "lucide-react";
import { SentenceSegment, StoryboardItem } from "@/types";
import { Button, Input, Textarea, Badge } from "@/components/ui";

interface SegmentsListProps {
  segments: (SentenceSegment & { chapter?: string; segment_id?: string })[];
  items: StoryboardItem[];
  language: string;
  hasCopiedNarration: boolean;
  copiedSegmentId: string | null;
  onCopyAllNarration: () => void;
  onCopySegment: (segText: string, segKey: string) => void;
  onNextStep: () => void;
  // Inline editing
  editingSegmentId: string | null;
  editingSegmentIndex: number | null;
  editChapter: string;
  setEditChapter: (val: string) => void;
  editText: string;
  setEditText: (val: string) => void;
  editItemPrompts: Record<string, string>;
  setEditItemPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onStartEditSegment: (
    seg: SentenceSegment & { chapter?: string; segment_id?: string },
    idx: number,
    segItems: StoryboardItem[]
  ) => void;
  onCancelEditSegment: () => void;
  onSaveEditSegment: (
    segmentId: string,
    segItems: StoryboardItem[],
    segIdx?: number
  ) => void;
  isUpdatingSegment: boolean;
}

export function SegmentsList({
  segments,
  items,
  language,
  hasCopiedNarration,
  copiedSegmentId,
  onCopyAllNarration,
  onCopySegment,
  onNextStep,
  editingSegmentId,
  editingSegmentIndex,
  editChapter,
  setEditChapter,
  editText,
  setEditText,
  editItemPrompts,
  setEditItemPrompts,
  onStartEditSegment,
  onCancelEditSegment,
  onSaveEditSegment,
  isUpdatingSegment,
}: SegmentsListProps) {
  if (segments.length === 0) {
    return (
      <div className="w-full">
        <div className="rounded-2xl border border-dashed border-[#2E2E2E] bg-[#181818]/60 p-12 text-center shadow-xl">
          <BookOpen className="w-12 h-12 text-violet-400/50 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1.5">
            Daftar Babak & Segmen Naskah (0 Segmen)
          </h3>
          <p className="text-xs text-muted-foreground max-w-lg mx-auto mb-4 leading-relaxed">
            Ketikkan topik ide cerita di panel kiri atas lalu klik tombol{" "}
            <strong>Generate Naskah Storyboard</strong>. Sistem akan menghasilkan alur babak
            naskah narasi lengkap beserta prompt gambar sketsa hand-drawn di sini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#2E2E2E]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Daftar Babak & Segmen Naskah ({segments.length} Segmen)</span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-violet-500/30 text-violet-300 bg-violet-500/10 normal-case"
                >
                  {language === "en" ? "🇬🇧 English Explainer" : "🇮🇩 Indonesian"}
                </Badge>
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Alur cerita terstruktur dengan narasi voiceover & slot prompt visual AI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={onCopyAllNarration}
              className="h-8 text-xs font-semibold gap-1.5 border-[#333] bg-[#222] hover:bg-[#2A2A2A] text-slate-200 hover:text-white transition shadow-sm"
              title="Salin seluruh teks naskah narasi ke clipboard"
            >
              {hasCopiedNarration ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-violet-400" />
              )}
              <span>{hasCopiedNarration ? "Tersalin!" : "Salin Semua Narasi"}</span>
            </Button>

            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
              {items.length} Prompt Gambar Siap
            </span>
            <Button
              onClick={onNextStep}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
            >
              <span>Lanjut ke Suara & Sync</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Segments List with full width 2-column layout */}
        <div className="space-y-4">
          {segments.map((seg, idx: number) => {
            const segId = seg.id || seg.segment_id || `seg-${idx + 1}`;
            const isEditing =
              editingSegmentIndex !== null
                ? editingSegmentIndex === idx
                : editingSegmentId === segId;
            const segItems = items.filter((it) => {
              if (seg.id) return it.segment_id === seg.id;
              if (seg.segment_id) return it.segment_id === seg.segment_id;
              return it.segment_id === `seg-${idx + 1}`;
            });

            return (
              <div
                key={seg.id || idx}
                className={`p-5 rounded-xl border transition space-y-3.5 ${
                  isEditing
                    ? "border-violet-500/80 bg-[#161616] ring-1 ring-violet-500/30 shadow-lg shadow-violet-500/5"
                    : "border-[#262626] bg-[#141414] hover:border-violet-500/40"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#222] pb-2.5">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/15 text-violet-300 font-bold border border-violet-500/25 shrink-0">
                      Segmen {idx + 1}
                    </span>
                    {isEditing ? (
                      <div className="flex-1 max-w-sm">
                        <Input
                          value={editChapter}
                          onChange={(e) => setEditChapter(e.target.value)}
                          placeholder="Judul Babak..."
                          className="h-7 text-xs font-semibold bg-[#111] border-violet-500/40 text-white"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-white">
                        {seg.chapter || `Babak ${idx + 1}`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      {segItems.length} Ilustrasi Gambar
                    </span>
                    {!isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopySegment(seg.text || "", segId)}
                          className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
                          title="Salin teks segmen ini"
                        >
                          {copiedSegmentId === segId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400" />
                          )}
                          <span className="text-[11px]">
                            {copiedSegmentId === segId ? "Tersalin" : "Salin"}
                          </span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onStartEditSegment(seg, idx, segItems)}
                          className="h-7 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-violet-400" />
                          <span>Edit Segmen</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onCancelEditSegment}
                          disabled={isUpdatingSegment}
                          className="h-7 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/10 gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Batal</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onSaveEditSegment(segId, segItems, idx)}
                          disabled={isUpdatingSegment}
                          className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow"
                        >
                          {isUpdatingSegment ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          <span>Simpan</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Responsive 2-column layout: Left = Narasi (5 cols), Right = Visual Prompts (7 cols) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  {/* Left: Narration voiceover text */}
                  <div className="lg:col-span-5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Naskah Narasi (Voiceover):
                      </span>
                      {isEditing && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {editText.length} karakter
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <>
                        <Textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={6}
                          placeholder="Tuliskan naskah narasi voiceover untuk segmen ini..."
                          className="w-full text-xs text-white leading-relaxed font-sans bg-[#111] border-violet-500/40 focus:border-violet-400 p-3 rounded-xl resize-y"
                        />
                        <p className="text-[10px] text-slate-500 leading-normal">
                          💡 Teks narasi dibacakan oleh TTS: gunakan koma (,) atau titik (.),
                          hindari tanda titik dua (:) dan titik koma (;), serta tanpa token
                          variabel.
                        </p>
                      </>
                    ) : (
                      <div className="text-xs text-white leading-relaxed font-sans bg-black/40 p-3.5 rounded-xl border border-[#222]">
                        &ldquo;{seg.text}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Right: Visual Prompts list */}
                  <div className="lg:col-span-7 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Visual Prompts AI Hand-drawn ({segItems.length} Ilustrasi):
                    </span>
                    <div className="space-y-2">
                      {segItems.map((item, iIdx) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2.5 text-[11px] text-slate-300 p-2.5 rounded-lg border leading-relaxed font-mono ${
                            isEditing
                              ? "bg-[#111] border-[#333]"
                              : "bg-surface/60 border-surface-border"
                          }`}
                        >
                          <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 font-bold shrink-0 mt-1">
                            #{iIdx + 1}
                          </span>
                          {isEditing ? (
                            <Textarea
                              value={
                                editItemPrompts[item.id] !== undefined
                                  ? editItemPrompts[item.id]
                                  : item.image_prompt || ""
                              }
                              onChange={(e) =>
                                setEditItemPrompts((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              rows={2}
                              placeholder="Prompt visual adegan..."
                              className="flex-1 text-[11px] text-foreground font-mono bg-black/40 border-[#333] focus:border-violet-500 py-1.5 px-2.5 rounded-lg resize-y"
                            />
                          ) : (
                            <span className="flex-1 select-all">{item.image_prompt}</span>
                          )}
                        </div>
                      ))}
                      {segItems.length === 0 && (
                        <div className="text-[11px] text-slate-500 italic p-3 text-center bg-black/20 rounded-lg border border-dashed border-[#262626]">
                          Tidak ada item ilustrasi untuk segmen ini.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom action bar when editing */}
                {isEditing && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelEditSegment}
                      disabled={isUpdatingSegment}
                      className="h-8 px-3 text-xs text-slate-400 hover:text-white"
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onSaveEditSegment(segId, segItems, idx)}
                      disabled={isUpdatingSegment}
                      className="h-8 px-4 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 shadow"
                    >
                      {isUpdatingSegment ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Simpan Perubahan Segmen</span>
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Action */}
        <div className="flex justify-end pt-3 border-t border-[#2E2E2E]">
          <Button
            onClick={onNextStep}
            className="bg-violet-600 hover:bg-violet-500 text-white gap-2 font-semibold text-xs shadow-lg shadow-violet-500/20"
          >
            <span>Langkah Berikutnya: Generate Suara & Sync ➔</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

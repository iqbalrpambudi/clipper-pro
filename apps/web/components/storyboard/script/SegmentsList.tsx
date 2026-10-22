"use client";

import React from "react";
import { BookOpen, Layers, Check, Copy, ArrowRight, Edit2, X, Loader2 } from "lucide-react";
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
  onSaveEditSegment: (segmentId: string, segItems: StoryboardItem[], segIdx?: number) => void;
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
        <div className="rounded-2xl border border-dashed border-[#D2CDBF] bg-[#FBFAF7] p-12 text-center shadow-sm">
          <BookOpen className="w-12 h-12 text-[#C45B3A]/40 mx-auto mb-3" />
          <h3 className="mb-1.5 text-base font-semibold text-[#26251F]">
            Daftar Babak & Segmen Naskah (0 Segmen)
          </h3>
          <p className="text-xs text-muted-foreground max-w-lg mx-auto mb-4 leading-relaxed">
            Ketikkan topik ide cerita di panel kiri atas lalu klik tombol{" "}
            <strong>Generate Naskah Storyboard</strong>. Sistem akan menghasilkan alur babak naskah
            narasi lengkap beserta prompt gambar sketsa hand-drawn di sini.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="space-y-5 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-[#E5E1D7] pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-[#26251F]">
                <span>Daftar Babak & Segmen Naskah ({segments.length} Segmen)</span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-[#E9C9BD] text-[#A9472C] bg-[#F8EEEA] normal-case"
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
              size="sm"
              onClick={onCopyAllNarration}
              variant="workspace-secondary"
              className="h-9 gap-1.5 text-xs"
              title="Salin seluruh teks naskah narasi ke clipboard"
            >
              {hasCopiedNarration ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-[#C45B3A]" />
              )}
              <span>{hasCopiedNarration ? "Tersalin!" : "Salin Semua Narasi"}</span>
            </Button>

            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]">
              {items.length} Prompt Gambar Siap
            </span>
            <Button onClick={onNextStep} variant="workspace-primary" className="gap-2 text-xs">
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
                    ? "border-[#C45B3A] bg-[#F8EEEA] ring-1 ring-[#E9C9BD] shadow-sm"
                    : "border-[#E5E1D7] bg-[#FFFEFA] hover:border-[#C45B3A]"
                }`}
              >
                <div className="flex flex-col justify-between gap-2.5 border-b border-[#E5E1D7] pb-2.5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F8EEEA] text-[#A9472C] font-bold border border-[#E9C9BD] shrink-0">
                      Segmen {idx + 1}
                    </span>
                    {isEditing ? (
                      <div className="flex-1 max-w-sm">
                        <Input
                          value={editChapter}
                          onChange={(e) => setEditChapter(e.target.value)}
                          placeholder="Judul Babak..."
                          className="h-8 border-[#E5E1D7] bg-[#FFFEFA] text-xs font-semibold text-[#26251F]"
                        />
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-[#26251F]">
                        {seg.chapter || `Babak ${idx + 1}`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden font-mono text-[11px] text-[#77766D] sm:inline">
                      {segItems.length} Ilustrasi Gambar
                    </span>
                    {!isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCopySegment(seg.text || "", segId)}
                          className="h-8 gap-1 px-2 text-xs text-[#77766D] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                          title="Salin teks segmen ini"
                        >
                          {copiedSegmentId === segId ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 text-[#77766D]" />
                          )}
                          <span className="text-[11px]">
                            {copiedSegmentId === segId ? "Tersalin" : "Salin"}
                          </span>
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onStartEditSegment(seg, idx, segItems)}
                          className="h-8 gap-1.5 px-2.5 text-xs text-[#4D4A42] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#C45B3A]" />
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
                          className="h-8 gap-1 px-2.5 text-xs text-[#77766D] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Batal</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onSaveEditSegment(segId, segItems, idx)}
                          disabled={isUpdatingSegment}
                          variant="workspace-primary"
                          className="h-8 gap-1.5 px-3 text-xs"
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
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#77766D]">
                        Naskah Narasi (Voiceover):
                      </span>
                      {isEditing && (
                        <span className="font-mono text-[10px] text-[#77766D]">
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
                          className="w-full resize-y rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] p-3 font-sans text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A]"
                        />
                        <p className="text-[10px] leading-normal text-[#77766D]">
                          💡 Teks narasi dibacakan oleh TTS: gunakan koma (,) atau titik (.),
                          hindari tanda titik dua (:) dan titik koma (;), serta tanpa token
                          variabel.
                        </p>
                      </>
                    ) : (
                      <div className="rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5 font-sans text-xs leading-relaxed text-[#26251F]">
                        &ldquo;{seg.text}&rdquo;
                      </div>
                    )}
                  </div>

                  {/* Right: Visual Prompts list */}
                  <div className="lg:col-span-7 space-y-1.5">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#77766D]">
                      Visual Prompts AI Hand-drawn ({segItems.length} Ilustrasi):
                    </span>
                    <div className="space-y-2">
                      {segItems.map((item, iIdx) => (
                        <div
                          key={item.id}
                          className={`flex items-start gap-2.5 rounded-lg border p-2.5 font-mono text-[11px] leading-relaxed text-[#4D4A42] ${
                            isEditing
                              ? "border-[#E5E1D7] bg-[#FFFEFA]"
                              : "border-[#E5E1D7] bg-[#F3F0E8]"
                          }`}
                        >
                          <span className="mt-1 shrink-0 rounded bg-[#F8EEEA] px-2 py-0.5 text-[10px] font-bold text-[#A9472C]">
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
                              className="flex-1 resize-y rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-[11px] text-[#26251F] focus:border-[#C45B3A]"
                            />
                          ) : (
                            <span className="flex-1 select-all">{item.image_prompt}</span>
                          )}
                        </div>
                      ))}
                      {segItems.length === 0 && (
                        <div className="rounded-lg border border-dashed border-[#D2CDBF] bg-[#F3F0E8] p-3 text-center text-[11px] italic text-[#77766D]">
                          Tidak ada item ilustrasi untuk segmen ini.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom action bar when editing */}
                {isEditing && (
                  <div className="flex items-center justify-end gap-2 border-t border-[#E5E1D7] pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onCancelEditSegment}
                      disabled={isUpdatingSegment}
                      className="h-9 px-3 text-xs text-[#77766D] hover:bg-[#F1EEE6] hover:text-[#26251F]"
                    >
                      Batal
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => onSaveEditSegment(segId, segItems, idx)}
                      disabled={isUpdatingSegment}
                      variant="workspace-primary"
                      className="h-9 gap-1.5 px-4 text-xs"
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
        <div className="flex justify-end border-t border-[#E5E1D7] pt-3">
          <Button onClick={onNextStep} variant="workspace-primary" className="gap-2 text-xs">
            <span>Langkah Berikutnya: Generate Suara & Sync ➔</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

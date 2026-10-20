"use client";

import React from "react";
import { FileCode, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SubtitleModalsProps {
  isAssModalOpen: boolean;
  onCloseAssModal: () => void;
  assContent: string;
  isSavePresetOpen: boolean;
  onCloseSavePreset: () => void;
  newPresetName: string;
  onPresetNameChange: (val: string) => void;
  onSavePreset: () => void;
  isSavingPreset: boolean;
}

export function SubtitleModals({
  isAssModalOpen,
  onCloseAssModal,
  assContent,
  isSavePresetOpen,
  onCloseSavePreset,
  newPresetName,
  onPresetNameChange,
  onSavePreset,
  isSavingPreset,
}: SubtitleModalsProps) {
  return (
    <>
      {/* Modal: ASS Script Viewer */}
      {isAssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-surface border border-border rounded-xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-primary" />
              Preview File Subtitle ASS (libass)
            </h3>
            <div className="flex-1 overflow-y-auto bg-background rounded-lg p-4 border border-border font-mono text-xs text-primary whitespace-pre">
              {assContent || "Belum ada subtitle yang digenerate."}
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" size="sm" onClick={onCloseAssModal}>
                Tutup
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Save Preset */}
      {isSavePresetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Bookmark className="w-4 h-4 text-primary" />
              Simpan sebagai Preset Baru
            </h3>
            <p className="text-xs text-muted-foreground">
              Semua pengaturan gaya subtitle aktif (font, warna, outline, posisi, animasi) akan
              disimpan sebagai preset yang dapat digunakan kembali.
            </p>
            <Input
              type="text"
              required
              placeholder="Contoh: TikTok Pop Kuning"
              value={newPresetName}
              onChange={(e) => onPresetNameChange(e.target.value)}
              className="text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onCloseSavePreset}>
                Batal
              </Button>
              <Button
                type="button"
                variant="supabase"
                size="sm"
                disabled={!newPresetName.trim() || isSavingPreset}
                onClick={onSavePreset}
              >
                {isSavingPreset ? "Menyimpan..." : "Simpan Preset"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

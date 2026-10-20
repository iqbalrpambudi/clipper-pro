"use client";

import React from "react";
import {
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Save,
  CheckCircle2,
  ZoomIn,
  Loader2,
} from "lucide-react";
import { Button, Badge, Input } from "@/components/ui";
import { SAMPLE_SCENES } from "./constants";

interface ImageStudioTesterProps {
  referenceImageUrl: string;
  previewImageUrl: string;
  setPreviewImageUrl: (val: string) => void;
  testImageHistory: string[];
  scenePrompt: string;
  setScenePrompt: (val: string) => void;
  onGenerateTest: () => void;
  isGeneratingTest: boolean;
  masterPrompt: string;
  saveTarget: "doodle-ilustrasi" | "new" | "active_id";
  setSaveTarget: (target: "doodle-ilustrasi" | "new" | "active_id") => void;
  onSavePreset: (asActive: boolean) => void;
  isSavingPreset: boolean;
  onZoomImage: (data: { url: string; title: string }) => void;
}

export function ImageStudioTester({
  referenceImageUrl,
  previewImageUrl,
  setPreviewImageUrl,
  testImageHistory,
  scenePrompt,
  setScenePrompt,
  onGenerateTest,
  isGeneratingTest,
  masterPrompt,
  saveTarget,
  setSaveTarget,
  onSavePreset,
  isSavingPreset,
  onZoomImage,
}: ImageStudioTesterProps) {
  return (
    <div className="space-y-6">
      {/* Visual Comparison: Reference vs AI Generated Preview */}
      <div className="p-5 rounded-2xl border border-border bg-surface shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span>Perbandingan Visual Side-by-Side</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Evaluasi kemiripan gaya antara gambar referensi dengan hasil uji coba model AI.
            </p>
          </div>

          <Badge variant="outline" className="border-border text-slate-400 text-[10px] font-mono">
            16:9 Landscape
          </Badge>
        </div>

        {/* Side by Side Image Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Reference Image Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 px-1">
              <span>1. Referensi Input</span>
              <span className="text-[10px] text-muted-foreground font-mono">Original</span>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden border border-border bg-black/60 group">
              {referenceImageUrl ? (
                <>
                  <img
                    src={referenceImageUrl}
                    alt="Referensi Asli"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onZoomImage({ url: referenceImageUrl, title: "Gambar Referensi Asli" })
                    }
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                  >
                    <span className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium flex items-center gap-1.5">
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Perbesar Referensi</span>
                    </span>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-xs">Belum ada gambar referensi</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Generated Preview Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300 px-1">
              <span className="text-violet-400">2. Hasil Generate AI (Preview)</span>
              <span className="text-[10px] text-emerald-400 font-mono">Model Output</span>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden border border-violet-500/30 bg-black/60 group shadow-lg shadow-violet-950/20">
              {isGeneratingTest ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-violet-950/20 text-violet-300 gap-2 p-4 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
                  <span className="text-xs font-semibold">Menghasilkan Gambar Uji Coba 16:9...</span>
                  <span className="text-[10px] text-slate-400 max-w-xs">
                    Menggunakan model gambar AI aktif dan format landscape widescreen
                  </span>
                </div>
              ) : previewImageUrl ? (
                <>
                  <img
                    src={previewImageUrl}
                    alt="Preview Hasil AI"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onZoomImage({
                        url: previewImageUrl,
                        title: "Preview Gambar AI (Preset Test)",
                      })
                    }
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                  >
                    <span className="px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-medium flex items-center gap-1.5">
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Perbesar Gambar AI</span>
                    </span>
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5 p-4 text-center">
                  <Wand2 className="w-8 h-8 text-violet-400/50" />
                  <span className="text-xs">
                    Klik &apos;Generate Gambar Uji Coba&apos; untuk melihat hasil
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History Thumbnails */}
        {testImageHistory.length > 1 && (
          <div className="pt-2 border-t border-border">
            <span className="text-[10px] text-slate-500 block mb-1.5">
              Riwayat Gambar Uji Coba Sesi Ini:
            </span>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {testImageHistory.map((imgUrl, i) => (
                <div
                  key={i}
                  onClick={() => setPreviewImageUrl(imgUrl)}
                  className={`w-16 h-10 rounded-lg overflow-hidden border cursor-pointer shrink-0 transition ${
                    previewImageUrl === imgUrl
                      ? "border-violet-500 ring-2 ring-violet-500/40"
                      : "border-border opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={imgUrl} alt={`Test ${i}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Interactive Prompt Tester */}
      <div className="p-5 rounded-2xl border border-border bg-surface shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-emerald-400" />
              <span>Uji Coba Adegan Cerita (Test Generation)</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Coba generate adegan naskah berbeda dengan Master Prompt di atas untuk menguji
              konsistensi gaya.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
            Deskripsi Adegan Uji Coba (Visual Scene)
          </label>
          <div className="flex gap-2">
            <Input
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="Tuliskan adegan yang ingin di-generate..."
              className="text-xs bg-background border-border rounded-xl flex-1"
            />
            <Button
              type="button"
              onClick={onGenerateTest}
              disabled={isGeneratingTest || !masterPrompt}
              className="bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-md shadow-violet-500/20 gap-2 shrink-0 px-4"
            >
              {isGeneratingTest ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>Generate Test</span>
            </Button>
          </div>
        </div>

        {/* Sample Scene Buttons */}
        <div>
          <span className="text-[10px] text-slate-500 block mb-1.5">Contoh Adegan Storyboard:</span>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_SCENES.map((sc, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setScenePrompt(sc)}
                className="px-2.5 py-1 rounded-lg bg-card hover:bg-surface-hover text-slate-300 hover:text-white border border-border text-[10px] transition text-left"
              >
                {sc.slice(0, 42)}...
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save Preset Card */}
      <div className="p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-[#181C19] to-surface shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Simpan Preset ke Ilustrasi AI</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hasil sintesis ini akan tersimpan ke database dan dapat langsung diterapkan pada
              pembuatan video storyboard Anda.
            </p>
          </div>

          <Badge variant="supabase" className="text-[10px]">
            Preset Siap
          </Badge>
        </div>

        {/* Save Mode Selector */}
        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => setSaveTarget("doodle-ilustrasi")}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              saveTarget === "doodle-ilustrasi"
                ? "border-emerald-500 bg-emerald-500/10 text-white"
                : "border-border bg-background text-slate-400 hover:text-white"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold">Preset Doodle Ilustrasi</span>
              {saveTarget === "doodle-ilustrasi" && (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              Simpan / Perbarui preset bawaan Doodle Ilustrasi (Direkomendasikan)
            </p>
          </div>

          <div
            onClick={() => setSaveTarget("new")}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              saveTarget === "new"
                ? "border-emerald-500 bg-emerald-500/10 text-white"
                : "border-border bg-background text-slate-400 hover:text-white"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold">Simpan Preset Baru</span>
              {saveTarget === "new" && (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </div>
            <p className="text-[10px] text-slate-400">Simpan sebagai variasi preset baru terpisah</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <Button
            onClick={() => onSavePreset(true)}
            disabled={isSavingPreset || !masterPrompt}
            variant="supabase"
            className="w-full sm:flex-1 py-3 text-xs font-bold gap-2 shadow-lg shadow-primary/20"
          >
            {isSavingPreset ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {saveTarget === "doodle-ilustrasi"
                ? "Simpan sebagai Preset Doodle Ilustrasi & Aktifkan"
                : "Simpan Preset & Aktifkan Sekarang"}
            </span>
          </Button>

          <Button
            onClick={() => onSavePreset(false)}
            disabled={isSavingPreset || !masterPrompt}
            variant="outline"
            className="w-full sm:w-auto text-xs border-border text-slate-300 hover:text-white"
          >
            <span>Simpan Tanpa Mengaktifkan</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

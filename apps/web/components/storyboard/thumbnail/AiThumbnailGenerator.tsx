"use client";

import React from "react";
import {
  Sparkles,
  RefreshCw,
  Wand2,
  History,
  Palette,
  RotateCcw,
  User,
  MapPin,
} from "lucide-react";
import { YouTubeThumbnailHistory } from "@/types";
import { Button, Textarea } from "@/components/ui";

interface FormulaItem {
  id: string;
  name: string;
  shortDesc: string;
  hook1: string;
  hook2: string;
  getPrompt: (topic: string, styleRef: string) => string;
}

interface AiThumbnailGeneratorProps {
  thumbnailPrompt: string;
  setThumbnailPrompt: (prompt: string) => void;
  thumbnailUrl: string | null;
  setThumbnailUrl: (url: string) => void;
  thumbnailHistory: YouTubeThumbnailHistory[];
  isGenerating: boolean;
  onGenerateThumbnail: () => void;
  formulas: FormulaItem[];
  activeFormula: string;
  onSelectFormula: (formulaId: string) => void;
  activePresetName?: string;
  onInjectPresetStyle: () => void;
  mainCharName?: string;
  mainLocName?: string;
  onResyncWithCurrentStory?: () => void;
}

export function AiThumbnailGenerator({
  thumbnailPrompt,
  setThumbnailPrompt,
  thumbnailUrl,
  setThumbnailUrl,
  thumbnailHistory,
  isGenerating,
  onGenerateThumbnail,
  formulas,
  activeFormula,
  onSelectFormula,
  activePresetName,
  onInjectPresetStyle,
  mainCharName,
  mainLocName,
  onResyncWithCurrentStory,
}: AiThumbnailGeneratorProps) {
  return (
    <div className="space-y-4">
      {/* SECTION 1: Formula Prompt Viral */}
      <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-500" />
            <h4 className="text-xs font-bold text-white">Formula Hook Visual AI</h4>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            {mainCharName && (
              <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10 text-amber-300">
                <User className="w-3 h-3 text-amber-400" />
                <span>{mainCharName}</span>
              </span>
            )}
            {mainLocName && (
              <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/10 text-cyan-300">
                <MapPin className="w-3 h-3 text-cyan-400" />
                <span>{mainLocName}</span>
              </span>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Pilih sudut visual viral. Prompt akan otomatis menyisipkan token karakter tokoh utama (
          {mainCharName || "tokoh"}), lokasi cerita ({mainLocName || "lokasi"}), dan ruang negatif
          untuk teks.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {formulas.map((f) => {
            const isSelected = activeFormula === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFormula(f.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-red-500/10 border-red-500/40 text-white shadow-sm ring-1 ring-red-500/30"
                    : "bg-[#1E1E1E] border-[#2A2A2A] text-slate-300 hover:bg-[#252525]"
                }`}
              >
                <div className="text-xs font-bold truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                  {f.shortDesc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Prompt Input & Action */}
      <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white">Prompt Ilustrasi Thumbnail AI</h4>
          </div>

          <div className="flex items-center gap-2">
            {onResyncWithCurrentStory && (
              <button
                type="button"
                onClick={onResyncWithCurrentStory}
                className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"
                title="Perbarui prompt dan teks hook mengikuti tokoh dan latar cerita terbaru saat ini"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Sinkronkan Cerita Terbaru</span>
              </button>
            )}

            {activePresetName && (
              <button
                type="button"
                onClick={onInjectPresetStyle}
                className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                title="Sisipkan konsistensi master visual preset ke prompt"
              >
                <Palette className="w-3 h-3" />
                <span>Gaya {activePresetName}</span>
              </button>
            )}
          </div>
        </div>

        <Textarea
          value={thumbnailPrompt}
          onChange={(e) => setThumbnailPrompt(e.target.value)}
          placeholder="A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape)..."
          className="bg-black/50 border-[#333] text-xs font-mono min-h-[90px] resize-y"
        />

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            💡 Gambar dihasilkan bersih 16:9 tanpa teks AI, siap ditambahkan teks di tab{" "}
            <span className="text-amber-400 font-semibold">Editor Teks</span>.
          </p>

          <Button
            onClick={onGenerateThumbnail}
            disabled={isGenerating}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md shadow-red-600/20 shrink-0 h-8 px-3"
          >
            {isGenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            )}
            <span>{isGenerating ? "Mengenerate..." : "Generate AI Thumbnail"}</span>
          </Button>
        </div>
      </div>

      {/* SECTION 3: History Variations */}
      {thumbnailHistory.length > 0 && (
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-2.5">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <h5 className="text-xs font-bold text-slate-200">Riwayat Variasi Thumbnail</h5>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {thumbnailHistory.length} Gambar
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {thumbnailHistory.map((item, idx) => {
              const isActive = thumbnailUrl === item.url;
              return (
                <div
                  key={item.id || idx}
                  onClick={() => setThumbnailUrl(item.url)}
                  className={`group relative aspect-video rounded-lg overflow-hidden border cursor-pointer transition-all ${
                    isActive
                      ? "ring-2 ring-red-500 border-red-500"
                      : "border-[#333] hover:border-slate-400 opacity-80 hover:opacity-100"
                  }`}
                  title="Klik untuk memakai latar ini"
                >
                  <img
                    src={item.url}
                    alt={`Variasi ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {isActive && (
                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-red-600 text-[8px] font-bold text-white">
                      Aktif
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export default AiThumbnailGenerator;

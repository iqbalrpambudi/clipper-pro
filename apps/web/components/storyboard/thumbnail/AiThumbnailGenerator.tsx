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
import Link from "next/link";

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
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#C45B3A]" />
            <h4 className="text-xs font-bold text-[#26251F]">Formula Hook Visual AI</h4>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#77766D]">
            {mainCharName && (
              <span className="flex items-center gap-1 bg-[#F8EEEA] px-2 py-0.5 rounded border border-[#E9C9BD] text-[#A9472C]">
                <User className="w-3 h-3 text-[#C45B3A]" />
                <span>{mainCharName}</span>
              </span>
            )}
            {mainLocName && (
              <span className="flex items-center gap-1 bg-[#EAF0F5] px-2 py-0.5 rounded border border-[#CFDDE9] text-[#41627F]">
                <MapPin className="w-3 h-3 text-[#5A7E9C]" />
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
                    ? "bg-[#F8EEEA] border-[#E9C9BD] text-[#26251F] shadow-sm ring-1 ring-[#E9C9BD]"
                    : "bg-[#FBFAF7] border-[#E5E1D7] text-[#4D4A42] hover:bg-[#F1EEE6]"
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
      <div className="p-3.5 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7] space-y-3">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[#C45B3A]" />
            <h4 className="text-xs font-semibold text-[#26251F]">Prompt Ilustrasi Thumbnail AI</h4>
          </div>

          <div className="flex items-center gap-2">
            {onResyncWithCurrentStory && (
              <button
                type="button"
                onClick={onResyncWithCurrentStory}
                className="text-[10px] font-semibold text-[#A9472C] hover:text-[#8A3722] flex items-center gap-1 bg-[#F8EEEA] px-2 py-0.5 rounded border border-[#E9C9BD]"
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
                className="text-[10px] font-semibold text-[#A9472C] hover:text-[#8C3A24] flex items-center gap-1"
                title="Sisipkan konsistensi master visual preset ke prompt"
              >
                <Palette className="w-3 h-3" />
                <span>Gaya {activePresetName}</span>
              </button>
            )}

            <Link
              href="/image-studio"
              className="text-[10px] font-medium text-muted-foreground hover:text-primary flex items-center gap-1"
              title={activePresetName ? "Edit preset di Art Studio" : "Buat visual preset di Art Studio"}
            >
              <Palette className="w-3 h-3" />
              <span>{activePresetName ? "Edit Preset" : "Buat Preset"} →</span>
            </Link>
          </div>
        </div>

        <Textarea
          value={thumbnailPrompt}
          onChange={(e) => setThumbnailPrompt(e.target.value)}
          placeholder="A high-CTR YouTube thumbnail illustration (16:9 widescreen landscape)..."
          className="min-h-[90px] resize-y border-[#E5E1D7] bg-[#F3F0E8] font-mono text-xs text-[#26251F] placeholder:text-[#858176] focus-visible:border-[#C45B3A] focus-visible:ring-[#E9C9BD]"
        />

        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            💡 Gambar dihasilkan bersih 16:9 tanpa teks AI, siap ditambahkan teks di tab{" "}
            <span className="text-[#A9472C] font-semibold">Editor Teks</span>.
          </p>

          <Button
            onClick={onGenerateThumbnail}
            disabled={isGenerating}
            variant="workspace-primary"
            className="h-9 shrink-0 px-3 text-xs"
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
        <div className="space-y-2.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-[#858176]" />
              <h5 className="text-xs font-bold text-[#26251F]">Riwayat Variasi Thumbnail</h5>
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
                      ? "ring-2 ring-[#C45B3A] border-[#C45B3A]"
                      : "border-[#E5E1D7] hover:border-[#D2CDBF] opacity-80 hover:opacity-100"
                  }`}
                  title="Klik untuk memakai latar ini"
                >
                  <img
                    src={item.url}
                    alt={`Variasi ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {isActive && (
                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-[#C45B3A] text-[8px] font-bold text-[#FFFAF6]">
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

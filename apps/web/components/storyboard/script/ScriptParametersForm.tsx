"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Save,
  X,
  Clock,
  Palette,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { ImagePreset } from "@/types";
import { cn } from "@/lib/utils";
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { ScriptPreset } from "@/lib/presetStorage";

interface ScriptParametersFormProps {
  topic: string;
  setTopic: (val: string) => void;
  language: string;
  onLanguageSelect: (lang: string) => void;
  durationMins: number;
  setDurationMins: (val: number) => void;
  tone: string;
  setTone: (val: string) => void;
  selectedPresetId: string;
  setSelectedPresetId: (val: string) => void;
  presets: ImagePreset[];
  activePreset?: ImagePreset;
  imagesPerSegment: number;
  setImagesPerSegment: (val: number) => void;
  customInstructions: string;
  setCustomInstructions: (val: string) => void;
  hasSegments: boolean;
  isGenerating: boolean;
  onGenerate: (e: React.FormEvent) => void;
  // Presets management
  scriptPresets: ScriptPreset[];
  selectedScriptPresetId: string;
  onLoadScriptPreset: (id: string) => void;
  onDeleteScriptPreset: (id: string, name: string) => void;
  showSaveScriptModal: boolean;
  setShowSaveScriptModal: (show: boolean) => void;
  newScriptPresetName: string;
  setNewScriptPresetName: (name: string) => void;
  onSaveScriptPreset: (e: React.FormEvent) => void;
}

export function ScriptParametersForm({
  topic,
  setTopic,
  language,
  onLanguageSelect,
  durationMins,
  setDurationMins,
  tone,
  setTone,
  selectedPresetId,
  setSelectedPresetId,
  presets,
  activePreset,
  imagesPerSegment,
  setImagesPerSegment,
  customInstructions,
  setCustomInstructions,
  hasSegments,
  isGenerating,
  onGenerate,
  scriptPresets,
  selectedScriptPresetId,
  onLoadScriptPreset,
  onDeleteScriptPreset,
  showSaveScriptModal,
  setShowSaveScriptModal,
  newScriptPresetName,
  setNewScriptPresetName,
  onSaveScriptPreset,
}: ScriptParametersFormProps) {
  return (
    <div className="flex flex-col space-y-5 rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 shadow-sm lg:col-span-6">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[#26251F]">Parameter Naskah AI</h3>
          <p className="text-xs text-[#77766D]">Sesuaikan target durasi dan gaya pembawaan</p>
        </div>
      </div>

      {/* Preset Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#4D4A42]">
            <Bookmark className="w-3.5 h-3.5 text-[#C45B3A]" />
            <span>Preset Naskah AI</span>
          </label>
          {selectedScriptPresetId &&
            !scriptPresets.find((p) => p.id === selectedScriptPresetId)?.isBuiltin && (
              <button
                type="button"
                onClick={() => {
                  const cur = scriptPresets.find((p) => p.id === selectedScriptPresetId);
                  if (cur) onDeleteScriptPreset(cur.id, cur.name);
                }}
                title="Hapus Preset Kustom Ini"
                className="flex items-center gap-1 text-[11px] text-[#A9472C] hover:underline"
              >
                <Trash2 className="w-3 h-3" />
                <span>Hapus Preset</span>
              </button>
            )}
        </div>
        <Select
          value={selectedScriptPresetId || undefined}
          onValueChange={(val) => onLoadScriptPreset(val)}
        >
          <SelectTrigger className="h-9 w-full text-xs font-medium">
            <SelectValue placeholder="-- Muat Preset Tersimpan --" />
          </SelectTrigger>
          <SelectContent appearance="workspace">
            {scriptPresets.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name} {p.isBuiltin ? "(Bawaan)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={onGenerate} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
            Ide / Topik Konten
          </label>
          <Textarea
            rows={3}
            required
            placeholder="Mis. Misteri Segitiga Bermuda dan penjelasan ilmiah di balik hilangnya kapal dan pesawat terbang..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="border-[#E5E1D7] bg-[#FFFEFA] text-xs leading-relaxed"
          />
        </div>

        {/* Language Selector (Central Project Language Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-[#4D4A42]">
              Bahasa Utama Video (Kunci Seluruh Pipeline)
            </label>
            <span className="text-[10px] text-[#A9472C]/80 font-mono">
              Mengunci Naskah, Voice TTS & YouTube
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { code: "id", flag: "🇮🇩", label: "Bahasa Indonesia", sub: "Naskah & Voice ID" },
              { code: "en", flag: "🇬🇧", label: "English Explainer", sub: "Script & Voice EN" },
            ].map((opt) => {
              const isSelected = language === opt.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => onLanguageSelect(opt.code)}
                  className={cn(
                    "p-2.5 rounded-xl border text-left transition",
                    isSelected
                      ? "bg-[#F8EEEA] border-[#C45B3A] text-[#26251F] shadow-xs"
                      : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:border-[#C45B3A]/40 hover:text-[#26251F]"
                  )}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#26251F]">
                    <span>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </div>
                  <div className="text-[10px] text-[#77766D] mt-0.5 pl-5">
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Duration Slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[#4D4A42]">
              <Clock className="w-3.5 h-3.5 text-[#C45B3A]" />
              Target Durasi Narasi
            </label>
            <span className="text-xs font-mono font-bold text-[#C45B3A] bg-[#F8EEEA] px-2 py-0.5 rounded border border-[#E9C9BD]">
              {durationMins} Menit (~{durationMins * 135} kata)
            </span>
          </div>
          <input
            type="range"
            min={3}
            max={8}
            step={1}
            value={durationMins}
            onChange={(e) => setDurationMins(Number(e.target.value))}
            className="w-full accent-[#C45B3A] cursor-pointer h-1.5 bg-[#E5E1D7] rounded-lg"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[#77766D]">
            <span>3 Menit (Singkat)</span>
            <span>5 Menit (Standar)</span>
            <span>8 Menit (Mendalam)</span>
          </div>
        </div>

        {/* Tone Selector */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
            Gaya Bahasa & Tone
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "santai", label: "Santai & Mengalir" },
              { id: "edukasi", label: "Edukasi & Cerita" },
              { id: "misterius", label: "Misterius & Tegang" },
              { id: "dramatis", label: "Dramatis & Sinematik" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTone(t.id)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition ${
                  tone === t.id
                    ? "bg-[#F8EEEA] border-[#C45B3A] text-[#A9472C] font-semibold"
                    : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Visual Preset Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-[#4D4A42] flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#C45B3A]" />
              Preset Gaya Visual Ilustrasi AI
            </label>
            <Link
              href="/image-studio"
              className="text-[11px] text-[#C45B3A] hover:text-[#A9472C] hover:underline flex items-center gap-1"
            >
              <span>Buka Studio</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <Select
            value={selectedPresetId || activePreset?.id || ""}
            onValueChange={(val) => setSelectedPresetId(val)}
          >
            <SelectTrigger className="h-9 w-full text-xs font-medium">
              <SelectValue placeholder="Pilih preset..." />
            </SelectTrigger>
            <SelectContent appearance="workspace">
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name} {p.is_active ? "(Aktif)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {presets.find((p) => p.id === (selectedPresetId || activePreset?.id)) && (
            <div className="text-[10px] text-[#858176] mt-1 flex items-center justify-between">
              <span className="truncate max-w-[260px]">
                {presets.find((p) => p.id === (selectedPresetId || activePreset?.id))?.category} •
                16:9 Landscape
              </span>
            </div>
          )}
        </div>

        {/* Images Per Segment */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
            Jumlah Ilustrasi Gambar per Segmen
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { count: 1, label: "1 Gambar", sub: "Pacing Tenang" },
              { count: 2, label: "2 Gambar", sub: "Pacing Ideal" },
              { count: 3, label: "3 Gambar", sub: "Pacing Dinamis" },
            ].map((opt) => (
              <button
                key={opt.count}
                type="button"
                onClick={() => setImagesPerSegment(opt.count)}
                className={`p-2.5 rounded-xl border text-center transition ${
                  imagesPerSegment === opt.count
                    ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42]"
                    : "bg-[#FFFEFA] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                }`}
              >
                <div className="text-xs font-bold">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">{opt.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Instructions */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#4D4A42]">
            Instruksi Khusus (Opsional)
          </label>
          <Input
            type="text"
            placeholder="Mis. Sertakan fakta tentang kompas anomali dan teori gas metana..."
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            className="border-[#E5E1D7] bg-[#FFFEFA] text-xs"
          />
        </div>

        {/* Bottom Action & Save Preset Bar */}
        <div className="space-y-2 pt-2 border-t border-[#E5E1D7]">
          {showSaveScriptModal && (
            <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#26251F]">
                <span className="flex items-center gap-1.5">
                  <BookmarkPlus className="w-3.5 h-3.5 text-[#C45B3A]" />
                  <span>Simpan Preset Naskah Baru</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSaveScriptModal(false)}
                  className="text-[#77766D] hover:text-[#26251F]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Nama preset baru (mis. Dokumenter Favorit 8m)..."
                  value={newScriptPresetName}
                  onChange={(e) => setNewScriptPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSaveScriptPreset(e as unknown as React.FormEvent);
                    }
                  }}
                  autoFocus
                  className="h-9 flex-1 text-xs"
                />
                <Button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onSaveScriptPreset(e as unknown as React.FormEvent);
                  }}
                  size="sm"
                  variant="workspace-primary"
                  className="h-9 shrink-0 gap-1 px-3 text-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan</span>
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSaveScriptModal(!showSaveScriptModal)}
              className="h-10 shrink-0 gap-1.5 px-3 text-xs border-[#E5E1D7] bg-[#FFFEFA] text-[#4D4A42] hover:bg-[#F8EEEA] hover:text-[#A9472C]"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-[#C45B3A]" />
              <span>Simpan Preset</span>
            </Button>

            <Button
              type="submit"
              disabled={isGenerating}
              variant="workspace-primary"
              className="h-10 flex-1 gap-2 text-xs"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Merancang Naskah ({durationMins} Mnt) & Visual AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {hasSegments
                      ? `Generate Ulang Naskah (${durationMins} Menit)`
                      : `Generate Naskah Storyboard (${durationMins} Menit)`}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

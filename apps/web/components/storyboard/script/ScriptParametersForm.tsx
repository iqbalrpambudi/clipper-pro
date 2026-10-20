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
import { Button, Input, Textarea } from "@/components/ui";
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
  resetBibleOnGenerate: boolean;
  setResetBibleOnGenerate: (val: boolean) => void;
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
  resetBibleOnGenerate,
  setResetBibleOnGenerate,
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
    <div className="lg:col-span-6 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-4 shadow-xl flex flex-col">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Parameter Naskah AI</h3>
          <p className="text-[11px] text-muted-foreground">
            Sesuaikan target durasi dan gaya pembawaan
          </p>
        </div>
      </div>

      {/* Preset Selector & Save Bar */}
      <div className="p-3 rounded-xl bg-[#141414] border border-[#2A2A2A] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bookmark className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-300 shrink-0">Preset:</span>
            <select
              value={selectedScriptPresetId}
              onChange={(e) => onLoadScriptPreset(e.target.value)}
              className="bg-[#1C1C1C] border border-[#333] hover:border-violet-500/50 text-xs text-white rounded-lg px-2.5 py-1 focus:outline-none focus:border-violet-500 font-medium truncate max-w-[210px]"
            >
              <option value="" disabled>
                -- Muat Preset Tersimpan --
              </option>
              {scriptPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.isBuiltin ? "(Bawaan)" : ""}
                </option>
              ))}
            </select>
            {selectedScriptPresetId &&
              !scriptPresets.find((p) => p.id === selectedScriptPresetId)?.isBuiltin && (
                <button
                  type="button"
                  onClick={() => {
                    const cur = scriptPresets.find((p) => p.id === selectedScriptPresetId);
                    if (cur) onDeleteScriptPreset(cur.id, cur.name);
                  }}
                  title="Hapus Preset Kustom Ini"
                  className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
          </div>

          <button
            type="button"
            onClick={() => setShowSaveScriptModal(!showSaveScriptModal)}
            className="px-2.5 py-1 text-xs rounded-lg bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 hover:text-white transition flex items-center gap-1 font-medium shrink-0"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            <span>Simpan Preset</span>
          </button>
        </div>

        {/* Save Preset Inline Form */}
        {showSaveScriptModal && (
          <form
            onSubmit={onSaveScriptPreset}
            className="flex items-center gap-2 pt-2 border-t border-[#222]"
          >
            <Input
              type="text"
              placeholder="Nama preset baru (mis. Dokumenter Favorit 8m)..."
              value={newScriptPresetName}
              onChange={(e) => setNewScriptPresetName(e.target.value)}
              autoFocus
              className="h-8 text-xs bg-[#1A1A1A] border-[#333] flex-1 text-white"
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 bg-violet-600 hover:bg-violet-500 text-white text-xs px-3 gap-1 shrink-0"
            >
              <Save className="w-3 h-3" />
              <span>Simpan</span>
            </Button>
            <button
              type="button"
              onClick={() => setShowSaveScriptModal(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

      <form onSubmit={onGenerate} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Ide / Topik Konten
          </label>
          <Textarea
            rows={3}
            required
            placeholder="Mis. Misteri Segitiga Bermuda dan penjelasan ilmiah di balik hilangnya kapal dan pesawat terbang..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="bg-[#141414] border-[#2E2E2E] text-xs leading-relaxed"
          />
        </div>

        {/* Language Selector (Central Project Language Control) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Bahasa Utama Video (Kunci Seluruh Pipeline)
            </label>
            <span className="text-[10px] text-violet-300/80 font-mono">
              Mengunci Naskah, Voice TTS & YouTube
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#121212] rounded-xl border border-[#2E2E2E]">
            <button
              type="button"
              onClick={() => onLanguageSelect("id")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                language === "id"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-base">🇮🇩</span>
              <span>Bahasa Indonesia</span>
            </button>
            <button
              type="button"
              onClick={() => onLanguageSelect("en")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition ${
                language === "en"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span className="text-base">🇬🇧</span>
              <span>English Explainer</span>
            </button>
          </div>
        </div>

        {/* Target Duration Slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-400" />
              Target Durasi Narasi
            </label>
            <span className="text-xs font-mono font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded border border-violet-500/20">
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
            className="w-full accent-violet-500 cursor-pointer h-1.5 bg-[#2A2A2A] rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
            <span>3 Menit (Singkat)</span>
            <span>5 Menit (Standar)</span>
            <span>8 Menit (Mendalam)</span>
          </div>
        </div>

        {/* Tone Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                    ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                    : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
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
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-violet-400" />
              Preset Gaya Visual Ilustrasi AI
            </label>
            <Link
              href="/image-studio"
              className="text-[11px] text-violet-400 hover:text-violet-300 hover:underline flex items-center gap-1"
            >
              <span>Buka Studio</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <select
            value={selectedPresetId || activePreset?.id || ""}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-[#2E2E2E] text-white text-xs font-medium focus:border-violet-500 focus:outline-none"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.is_active ? "(Aktif)" : ""}
              </option>
            ))}
          </select>
          {presets.find((p) => p.id === (selectedPresetId || activePreset?.id)) && (
            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
              <span className="truncate max-w-[260px]">
                {presets.find((p) => p.id === (selectedPresetId || activePreset?.id))?.category}{" "}
                • 16:9 Landscape
              </span>
              <span className="text-violet-400 font-mono text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20">
                Prompt Visual Selaras
              </span>
            </div>
          )}
        </div>

        {/* Images Per Segment */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                    ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                    : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
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
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Instruksi Khusus (Opsional)
          </label>
          <Input
            type="text"
            placeholder="Mis. Sertakan fakta tentang kompas anomali dan teori gas metana..."
            value={customInstructions}
            onChange={(e) => setCustomInstructions(e.target.value)}
            className="bg-[#141414] border-[#2E2E2E] text-xs"
          />
        </div>

        {/* Reset Bible Checkbox when regenerating */}
        {hasSegments && (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-black/40 border border-[#2E2E2E]">
            <input
              type="checkbox"
              id="resetBibleCheck"
              checked={resetBibleOnGenerate}
              onChange={(e) => setResetBibleOnGenerate(e.target.checked)}
              className="rounded border-[#333] text-violet-600 focus:ring-violet-500 w-4 h-4 cursor-pointer"
            />
            <label
              htmlFor="resetBibleCheck"
              className="text-[11px] text-slate-300 cursor-pointer select-none"
            >
              <span className="font-semibold text-white block">
                Perbarui Character Sheet untuk Cerita Baru
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Centang agar karakter & latar lama diganti dengan karakter cerita baru ini
              </span>
            </label>
          </div>
        )}

        <Button
          type="submit"
          disabled={isGenerating}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs shadow-lg shadow-violet-500/20 gap-2"
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
      </form>
    </div>
  );
}

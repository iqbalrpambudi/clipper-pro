"use client";

import React, { RefObject } from "react";
import {
  Sparkles,
  Wand2,
  UploadCloud,
  Check,
  Copy,
  CheckCircle2,
  ZoomIn,
  Loader2,
} from "lucide-react";
import { StudioAnalysisResult } from "@/types";
import { Button, Badge, Input, Textarea } from "@/components/ui";
import { QUICK_INSPIRATION_TAGS } from "./constants";

interface ImageStudioSynthesizerProps {
  userText: string;
  setUserText: (val: string) => void;
  referenceImageUrl: string;
  setReferenceImageUrl: (val: string) => void;
  setReferenceImagePath: (val: string) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  presetName: string;
  setPresetName: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  masterPrompt: string;
  setMasterPrompt: (val: string) => void;
  negativePrompt: string;
  setNegativePrompt: (val: string) => void;
  styleAttributes: StudioAnalysisResult["style_attributes"] | null;
  onCopyPrompt: () => void;
  isCopied: boolean;
  onZoomImage: (data: { url: string; title: string }) => void;
}

export function ImageStudioSynthesizer({
  userText,
  setUserText,
  referenceImageUrl,
  setReferenceImageUrl,
  setReferenceImagePath,
  fileInputRef,
  isUploading,
  onFileUpload,
  onAnalyze,
  isAnalyzing,
  presetName,
  setPresetName,
  category,
  setCategory,
  masterPrompt,
  setMasterPrompt,
  negativePrompt,
  setNegativePrompt,
  styleAttributes,
  onCopyPrompt,
  isCopied,
  onZoomImage,
}: ImageStudioSynthesizerProps) {
  return (
    <div className="space-y-6">
      {/* Step 1: Input Deskripsi Teks */}
      <div className="p-5 rounded-2xl border border-border bg-surface shadow-lg space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold font-mono">
              1
            </span>
            <label className="text-sm font-semibold text-white">
              Konsep & Deskripsi Gaya Visual
            </label>
          </div>
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
            Teks Input
          </Badge>
        </div>

        <Textarea
          rows={3}
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          placeholder="Deskripsikan gaya ilustrasi yang Anda inginkan (misal: Doodle stickman hitam putih, kertas perkamen vintage, cat air lembut, dsb)..."
          className="text-xs bg-background border-border text-slate-100 placeholder:text-slate-500 focus:border-violet-500 rounded-xl leading-relaxed font-sans"
        />

        {/* Quick Inspiration Pills */}
        <div>
          <p className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            <span>Inspirasi Cepat:</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_INSPIRATION_TAGS.map((tag, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setUserText(tag.text)}
                className="px-2 py-1 rounded-lg bg-card hover:bg-surface-hover text-slate-300 hover:text-white border border-border text-[10px] transition"
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Step 2: Referensi Gambar Visual */}
      <div className="p-5 rounded-2xl border border-border bg-surface shadow-lg space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold font-mono">
              2
            </span>
            <label className="text-sm font-semibold text-white">Referensi Gambar Visual</label>
          </div>
          <span className="text-[10px] text-muted-foreground">Upload file / URL</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFileUpload}
          className="hidden"
        />

        {/* Reference Preview Card or Upload Zone */}
        {referenceImageUrl ? (
          <div className="relative rounded-xl border border-border bg-background p-3 flex items-center gap-4 group">
            <div
              onClick={() =>
                onZoomImage({ url: referenceImageUrl, title: "Gambar Referensi Visual" })
              }
              className="relative w-28 h-18 rounded-lg overflow-hidden border border-[#2E2E2E] bg-black/40 cursor-pointer shrink-0"
            >
              <img
                src={referenceImageUrl}
                alt="Referensi Gaya"
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                <ZoomIn className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-white truncate">
                  Referensi Gambar Siap
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate font-mono">
                {referenceImageUrl}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="text-[11px] text-violet-400 hover:text-violet-300 font-medium underline"
                >
                  Ganti Gambar
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceImageUrl("");
                    setReferenceImagePath("");
                  }}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border border-dashed border-[#3A3A3A] hover:border-violet-500 bg-[#141414] hover:bg-violet-950/10 p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
          >
            <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <UploadCloud className="w-5 h-5" />
              )}
            </div>
            <div>
              <span className="text-xs font-semibold text-white block">
                {isUploading ? "Mengunggah gambar..." : "Klik atau seret gambar referensi ke sini"}
              </span>
              <span className="text-[10px] text-slate-500">
                Mendukung PNG, JPG, JPEG, WebP (Rasio 16:9 disarankan)
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500">Pilih dari referensi bawaan:</span>
          <button
            type="button"
            onClick={() => setReferenceImageUrl("/storage/presets/doodle_ref.png")}
            className="text-[10px] text-violet-400 hover:text-violet-300 font-mono transition"
          >
            Gunakan Referensi Doodle Asli
          </button>
        </div>
      </div>

      {/* Action Button: Sintesis Master Prompt */}
      <Button
        type="button"
        onClick={onAnalyze}
        disabled={isAnalyzing || (!userText.trim() && !referenceImageUrl)}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-emerald-600 hover:opacity-90 text-white font-semibold text-xs shadow-lg shadow-violet-600/25 flex items-center justify-center gap-2 transition"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>AI Sedang Menganalisis Gambar & Merancang Prompt...</span>
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            <span>Sintesis Master Prompt & Gaya Visual</span>
          </>
        )}
      </Button>

      {/* Step 3: Hasil Master Prompt & Parameter Gaya */}
      <div className="p-5 rounded-2xl border border-border bg-surface shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold font-mono">
              3
            </span>
            <h3 className="text-sm font-semibold text-white">Master Style Prompt Ilustrasi AI</h3>
          </div>
          <button
            type="button"
            onClick={onCopyPrompt}
            className="text-[10px] text-violet-400 hover:text-violet-300 flex items-center gap-1 font-mono transition"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
            <span>{isCopied ? "Tersalin!" : "Salin Prompt"}</span>
          </button>
        </div>

        {/* Preset Meta Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
              Nama Preset
            </label>
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Contoh: Doodle Ilustrasi"
              className="text-xs bg-background border-border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
              Kategori Gaya
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-background border border-border text-xs text-white focus:outline-none focus:border-violet-500"
            >
              <option value="doodle">Doodle / Stickman</option>
              <option value="watercolor">Watercolor / Cat Air</option>
              <option value="vintage">Vintage / Parchment</option>
              <option value="comic">Comic / Manga</option>
              <option value="anime">Anime / Japanese</option>
              <option value="cinematic">Cinematic Storyboard</option>
              <option value="3d">3D / Claymation</option>
              <option value="custom">Custom Style</option>
            </select>
          </div>
        </div>

        {/* Master Prompt Editor */}
        <div>
          <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
            Master Style Prompt (Disematkan ke Setiap Adegan 16:9)
          </label>
          <Textarea
            rows={6}
            value={masterPrompt}
            onChange={(e) => setMasterPrompt(e.target.value)}
            placeholder="Instruksi gaya visual yang dihasilkan AI..."
            className="text-xs font-mono bg-background border-border text-slate-100 placeholder:text-slate-500 focus:border-violet-500 rounded-xl leading-relaxed"
          />
          <p className="text-[10px] text-slate-500 mt-1">
            Prompt ini menjadi acuan seragam saat generate setiap adegan naskah di tab{" "}
            <strong>Langkah 3. Ilustrasi AI</strong>.
          </p>
        </div>

        {/* Negative Prompt */}
        <div>
          <label className="block text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">
            Negative Prompt / Pantangan Visual
          </label>
          <Input
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Elemen yang dihindari (misal: No 3D CGI, no photorealism...)"
            className="text-xs font-mono bg-background border-border rounded-lg"
          />
        </div>

        {/* Visual Style Attributes Badges */}
        {styleAttributes && (
          <div className="pt-2 border-t border-border space-y-2.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
              Atribut Karakteristik Visual AI
            </span>

            {styleAttributes.palette && styleAttributes.palette.length > 0 && (
              <div>
                <span className="text-[10px] text-slate-500 block mb-1">Palet Warna:</span>
                <div className="flex flex-wrap gap-1.5">
                  {styleAttributes.palette.map((color, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-muted border border-border text-[10px] text-slate-300 font-mono"
                    >
                      {color}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {styleAttributes.medium && (
              <div className="text-[10px] text-slate-400">
                <strong className="text-slate-300">Medium:</strong> {styleAttributes.medium}
              </div>
            )}
            {styleAttributes.character_style && (
              <div className="text-[10px] text-slate-400">
                <strong className="text-slate-300">Karakter:</strong>{" "}
                {styleAttributes.character_style}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

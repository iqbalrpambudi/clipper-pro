"use client";

import React from "react";
import { FileText, Sparkles, Copy, Check, RefreshCw, Tag, Wand2 } from "lucide-react";
import { Button, Input, Textarea, Badge } from "@/components/ui";

interface YoutubeMetadataFormProps {
  title: string;
  setTitle: (t: string) => void;
  titleOptions: string[];
  description: string;
  setDescription: (d: string) => void;
  tagsInput: string;
  setTagsInput: (t: string) => void;
  isGenerating: boolean;
  onGenerateMetadata: () => void;
  focusAngle: string;
  setFocusAngle: (a: string) => void;
  customPrompt: string;
  setCustomPrompt: (p: string) => void;
  onCopy: (text: string, key: string, label: string) => void;
  copiedKey: string | null;
}

export function YoutubeMetadataForm({
  title,
  setTitle,
  titleOptions,
  description,
  setDescription,
  tagsInput,
  setTagsInput,
  isGenerating,
  onGenerateMetadata,
  focusAngle,
  setFocusAngle,
  customPrompt,
  setCustomPrompt,
  onCopy,
  copiedKey,
}: YoutubeMetadataFormProps) {
  return (
    <div className="space-y-4">
      {/* Generate Metadata AI Box */}
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-[#26251F]">
              Generate Metadata YouTube dengan AI
            </h4>
          </div>
          <Badge variant="outline" className="border-[#E5E1D7] text-[10px] text-[#77766D]">
            SEO & Algoritma YouTube
          </Badge>
        </div>

        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#4D4A42]">
              Fokus Sudut Pandang (Angle)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: "curiosity_gap", label: "Penasaran (Curiosity)" },
                { id: "emotional_twist", label: "Plot Twist Emosional" },
                { id: "educational_epic", label: "Dokumenter Epik" },
                { id: "action_punchy", label: "Aksi & Urgensi" },
              ].map((angle) => (
                <button
                  key={angle.id}
                  type="button"
                  onClick={() => setFocusAngle(angle.id)}
                  className={`p-2 rounded-lg border text-left text-[11px] transition-all font-semibold ${
                    focusAngle === angle.id
                      ? "bg-[#ECF3EB] border-[#C9DDCF] text-[#456A4E]"
                      : "bg-[#F3F0E8] border-[#E5E1D7] text-[#4D4A42] hover:bg-[#EAE6DD]"
                  }`}
                >
                  {angle.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[#4D4A42]">
              Instruksi Tambahan (Opsional)
            </label>
            <Input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Contoh: Tekankan fakta sejarah abad ke-14, gunakan gaya Vox..."
              className="border-[#E5E1D7] bg-[#FFFEFA] text-xs"
            />
          </div>

          <div className="pt-1 flex justify-end">
            <Button
              onClick={onGenerateMetadata}
              disabled={isGenerating}
              variant="workspace-primary"
              className="h-9 px-3 text-xs"
            >
              {isGenerating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              <span>
                {isGenerating ? "Menganalisis Naskah..." : "Generate Judul, Deskripsi & Tag"}
              </span>
            </Button>
          </div>
        </div>
      </div>

      {/* Title & Title Options */}
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-[#26251F]">Judul Video YouTube</h4>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(title, "title", "Judul")}
            className="h-6 text-[10px] text-slate-400 hover:text-white"
          >
            {copiedKey === "title" ? (
              <Check className="w-3 h-3 text-emerald-400 mr-1" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            <span>Salin</span>
          </Button>
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul video YouTube yang memikat penonton..."
          className="border-[#E5E1D7] bg-[#FFFEFA] text-xs font-bold"
        />

        {titleOptions.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] text-muted-foreground block">
              Variasi Alternatif (Klik untuk memakai):
            </span>
            <div className="space-y-1">
              {titleOptions.map((opt, i) => (
                <div
                  key={i}
                  onClick={() => setTitle(opt)}
                  className="cursor-pointer rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] p-2 text-xs text-[#4D4A42] transition-colors hover:bg-[#F1EEE6] hover:text-[#26251F]"
                >
                  {opt}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <h4 className="text-xs font-semibold text-[#26251F]">Deskripsi Video & Bab Timestamp</h4>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(description, "desc", "Deskripsi")}
            className="h-6 text-[10px] text-slate-400 hover:text-white"
          >
            {copiedKey === "desc" ? (
              <Check className="w-3 h-3 text-emerald-400 mr-1" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            <span>Salin</span>
          </Button>
        </div>

        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Deskripsi video lengkap, link, dan sinopsis..."
          className="min-h-[140px] resize-y border-[#E5E1D7] bg-[#FFFEFA] font-sans text-xs"
        />
      </div>

      {/* Tags */}
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-[#26251F]">Tags Video (Pisahkan Koma)</h4>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(tagsInput, "tags", "Tags")}
            className="h-6 text-[10px] text-slate-400 hover:text-white"
          >
            {copiedKey === "tags" ? (
              <Check className="w-3 h-3 text-emerald-400 mr-1" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            <span>Salin</span>
          </Button>
        </div>

        <Textarea
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="sejarah, fakta menarik, misteri, dokumenter..."
          className="min-h-[70px] resize-y border-[#E5E1D7] bg-[#FFFEFA] font-mono text-xs"
        />
      </div>
    </div>
  );
}
export default YoutubeMetadataForm;

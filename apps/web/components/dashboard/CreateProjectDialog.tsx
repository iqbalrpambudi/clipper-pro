"use client";

import React from "react";
import { Film, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createMode: "short_video" | "long_storyboard";
  setCreateMode: (mode: "short_video" | "long_storyboard") => void;
  name: string;
  setName: (name: string) => void;
  aspectRatio: string;
  setAspectRatio: (aspectRatio: string) => void;
  resolution: string;
  setResolution: (resolution: string) => void;
  language: "id" | "en";
  setLanguage: (language: "id" | "en") => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  createMode,
  setCreateMode,
  name,
  setName,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  language,
  setLanguage,
  onSubmit,
  isPending,
}: CreateProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog max-w-lg">
        <DialogHeader>
          <DialogTitle>Buat Project Baru</DialogTitle>
          <DialogDescription>
            Pilih mode pembuatan video yang ingin Anda produksi.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          {/* Mode Selection Cards */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2">
              Pilih Mode Project
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card 1: Short Video */}
              <div
                onClick={() => {
                  setCreateMode("short_video");
                  setAspectRatio("9:16");
                }}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left flex flex-col justify-between ${
                  createMode === "short_video"
                    ? "border-[#C45B3A] bg-[#C45B3A]/5 ring-1 ring-[#C45B3A]/30"
                    : "border-border bg-card hover:border-[#C45B3A]/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[#C45B3A]/10 flex items-center justify-center text-[#A9472C]">
                      <Film className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#C45B3A]/10 text-[#A9472C] font-semibold">
                      9:16 Vertikal
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground mb-1">Short Video Clipper</h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Potong video panjang jadi klip TikTok/Reels viral dengan Scene AI & subtitle
                    karaoke.
                  </p>
                </div>
              </div>

              {/* Card 2: Long Storyboard */}
              <div
                onClick={() => {
                  setCreateMode("long_storyboard");
                  setAspectRatio("16:9");
                }}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all text-left flex flex-col justify-between ${
                  createMode === "long_storyboard"
                    ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/30"
                    : "border-border bg-card hover:border-violet-500/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 font-semibold">
                      16:9 Landscape
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-foreground mb-1">
                    Long Storyboard Explainer
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Generate naskah 4–8 menit, suara TTS, dan ilustrasi sketsa hand-drawn AI per
                    segmen.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Nama Project
            </label>
            <Input
              type="text"
              required
              placeholder={
                createMode === "long_storyboard"
                  ? "Mis. Misteri Segitiga Bermuda dan Dimensi Waktu"
                  : "Mis. Fakta Menakjubkan Lautan Dalam"
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Aspect Ratio
              </label>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent appearance="workspace">
                  <SelectItem value="9:16" className="text-xs">9:16 (TikTok/Reels/Shorts)</SelectItem>
                  <SelectItem value="16:9" className="text-xs">16:9 (Landscape YouTube)</SelectItem>
                  <SelectItem value="1:1" className="text-xs">1:1 (Square Feed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Resolusi</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent appearance="workspace">
                  <SelectItem value="1080p" className="text-xs">1080p (Full HD)</SelectItem>
                  <SelectItem value="720p" className="text-xs">720p (Fast Render)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Bahasa Naskah & Narasi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLanguage("id")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  language === "id"
                    ? "border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C] shadow-sm font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-[#C9BCAF]"
                }`}
              >
                <span className="text-base">🇮🇩</span>
                <span>Indonesia (ID)</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                  language === "en"
                    ? "border-[#CFDDE9] bg-[#EAF0F5] text-[#41627F] shadow-sm font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-[#C9BCAF]"
                }`}
              >
                <span className="text-base">🇬🇧</span>
                <span>English (EN)</span>
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="workspace-primary" size="sm" disabled={isPending}>
              {isPending ? "Membuat..." : "Buat Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import React from "react";
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
      <DialogContent className="workspace-dialog max-w-2xl">
        <DialogHeader>
          <DialogTitle>Buat Project Baru</DialogTitle>
          <DialogDescription>
            Potong video panjang jadi klip 9:16 dengan narasi AI dan subtitle.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Nama Project
            </label>
            <Input
              type="text"
              required
              placeholder="Mis. Kenapa Batang Pohon Kurma Sengaja Dikuliti"
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
                <SelectTrigger className="h-9 w-full text-xs rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent appearance="workspace">
                  <SelectItem value="9:16" className="text-xs">9:16 (TikTok/Reels/Shorts)</SelectItem>
                  <SelectItem value="1:1" className="text-xs">1:1 (Square Feed)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Resolusi</label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="h-9 w-full text-xs rounded-xl">
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
                className={`flex h-9 items-center justify-center gap-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                  language === "id"
                    ? "border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C] shadow-xs font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-[#C9BCAF]"
                }`}
              >
                <span className="text-base">🇮🇩</span>
                <span>Indonesia (ID)</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`flex h-9 items-center justify-center gap-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                  language === "en"
                    ? "border-[#CFDDE9] bg-[#EAF0F5] text-[#41627F] shadow-xs font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-[#C9BCAF]"
                }`}
              >
                <span className="text-base">🇬🇧</span>
                <span>English (EN)</span>
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" className="h-9 px-4 text-xs rounded-xl font-medium" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="workspace-primary" className="h-9 px-4 text-xs rounded-xl font-medium" disabled={isPending}>
              {isPending ? "Membuat..." : "Buat Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import React from "react";
import { Edit3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
} from "@/components/ui";

interface EditProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (desc: string) => void;
  language: "id" | "en";
  setLanguage: (lang: "id" | "en") => void;
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
}

export function EditProjectDialog({
  open,
  onOpenChange,
  name,
  setName,
  description,
  setDescription,
  language,
  setLanguage,
  onSubmit,
  isPending,
}: EditProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="workspace-dialog max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#C45B3A]" />
            <DialogTitle>Edit Nama Project</DialogTitle>
          </div>
          <DialogDescription>
            Ubah nama, deskripsi, atau bahasa utama project video Anda.
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masukkan nama project..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Deskripsi (Opsional)
            </label>
            <Textarea
              rows={3}
              placeholder="Catatan tambahan untuk project ini..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Bahasa Utama Project
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
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="workspace-primary-button"
            >
              {isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

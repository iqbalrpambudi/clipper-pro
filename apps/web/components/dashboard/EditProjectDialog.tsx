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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#3ECF8E]" />
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
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/10 font-semibold"
                    : "border-[#2E2E2E] bg-[#181818] text-muted-foreground hover:border-[#3E3E3E]"
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
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-300 shadow-sm shadow-blue-500/10 font-semibold"
                    : "border-[#2E2E2E] bg-[#181818] text-muted-foreground hover:border-[#3E3E3E]"
                }`}
              >
                <span className="text-base">🇬🇧</span>
                <span>English (EN)</span>
              </button>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="supabase"
              size="sm"
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

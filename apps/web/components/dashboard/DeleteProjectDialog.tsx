"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { Project } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@/components/ui";

interface DeleteProjectDialogProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: DeleteProjectDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <DialogTitle>Hapus Project</DialogTitle>
          </div>
          <DialogDescription>
            Apakah Anda yakin ingin menghapus project{" "}
            <strong className="text-white font-medium">{project?.name}</strong>?
            Semua data media, naskah, timeline, dan hasil render akan dihapus secara permanen.
          </DialogDescription>
        </DialogHeader>

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
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Menghapus..." : "Hapus Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

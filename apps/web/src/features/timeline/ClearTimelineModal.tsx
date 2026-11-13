import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClearTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function ClearTimelineModal({ isOpen, onClose, onConfirm, isPending }: ClearTimelineModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Hapus semua klip video?</h3>
            <p className="text-xs text-muted-foreground">
              Audio narasi dan subtitle tetap di timeline. Bisa dibatalkan dengan Undo.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={onConfirm}
            className="gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>Hapus klip</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

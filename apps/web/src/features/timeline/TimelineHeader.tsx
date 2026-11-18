import {
  ArrowRight,
  Check,
  Film,
  Loader2,
  Maximize2,
  SlidersHorizontal,
  Sparkles,
  Subtitles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SideTab } from "./TimelineSideDrawer";

const STUDIO_PANEL_TABS: { id: SideTab; label: string; icon: typeof Film }[] = [
  { id: "pool", label: "Media", icon: Film },
  { id: "inspector", label: "Klip", icon: SlidersHorizontal },
  { id: "subtitles", label: "Subtitle", icon: Subtitles },
  { id: "layout", label: "Layout", icon: Maximize2 },
];

interface TimelineHeaderProps {
  activeSideTab: SideTab;
  onSelectSideTab: (tab: SideTab) => void;
  selectedClipIndex: number | null;
  clipsCount: number;
  isSaving: boolean;
  isDirty: boolean;
  totalDuration: number;
  isAudioAttached: boolean;
  isSubtitlesAttached: boolean;
  isReadding: boolean;
  isAutoMatching: boolean;
  matchElapsed: number;
  onReaddAll: () => void;
  onOpenClearModal: () => void;
  onAutoMatch: () => void;
  onRender: () => void;
}

export function TimelineHeader({
  activeSideTab,
  onSelectSideTab,
  selectedClipIndex,
  clipsCount,
  isSaving,
  isDirty,
  totalDuration,
  isAudioAttached,
  isSubtitlesAttached,
  isReadding,
  isAutoMatching,
  matchElapsed,
  onReaddAll,
  onOpenClearModal,
  onAutoMatch,
  onRender,
}: TimelineHeaderProps) {
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
        {/* Left: Workspace Panel Navigation Tabs + Compact Status */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="tablist"
            aria-label="Panel editor timeline"
            className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5"
          >
            {STUDIO_PANEL_TABS.map(({ id, label, icon: Icon }) => {
              const isActive = activeSideTab === id;
              const hasClipBadge = id === "inspector" && selectedClipIndex !== null;
              return (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  onClick={() => onSelectSideTab(id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition",
                    isActive
                      ? "bg-card text-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive && "text-primary")} />
                  <span>{label}</span>
                  {hasClipBadge && (
                    <span className="rounded bg-primary/15 px-1 font-mono text-[10px] tabular-nums text-primary">
                      #{selectedClipIndex + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium tabular-nums text-foreground/85">
              {clipsCount} klip · {Math.round(totalDuration)}s
            </span>
            {isSaving ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                Simpan
              </span>
            ) : isDirty ? (
              <span
                className="inline-flex items-center gap-1 text-amber-500"
                title="Perubahan belum disimpan"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                Autosave
              </span>
            ) : clipsCount > 0 ? (
              <span className="inline-flex items-center gap-1" title="Timeline tersimpan">
                <Check className="h-3 w-3 text-primary" />
              </span>
            ) : null}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(!isAudioAttached || !isSubtitlesAttached) && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onReaddAll}
              disabled={isReadding}
              className="h-7 gap-1.5 border-primary/40 text-xs font-medium text-primary hover:bg-primary/10"
              title="Tambahkan audio narasi & subtitle ke timeline"
            >
              {isReadding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Subtitles className="h-3.5 w-3.5" />
              )}
              Pasang Audio & Subtitle
            </Button>
          )}

          {(clipsCount > 0 || isAudioAttached || isSubtitlesAttached) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onOpenClearModal}
              className="h-7 gap-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Kosongkan timeline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Kosongkan</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onAutoMatch}
            disabled={isAutoMatching}
            className="h-7 gap-1.5 border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isAutoMatching ? "Mencocokkan..." : "Auto-Match AI"}
          </Button>

          <Button
            type="button"
            variant="workspace-primary"
            size="xs"
            onClick={onRender}
            className="h-7 gap-1 px-3 text-xs font-semibold"
          >
            Lanjut Render
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {isAutoMatching && (
        <div className="flex shrink-0 items-center justify-between border-b border-primary/20 bg-primary/10 px-4 py-1.5 text-xs text-primary">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>AI sedang mencocokkan scene dengan naskah...</span>
          </div>
          <span className="font-mono tabular-nums text-muted-foreground">
            {Math.floor(matchElapsed / 60)}:{String(matchElapsed % 60).padStart(2, "0")}
          </span>
        </div>
      )}
    </>
  );
}

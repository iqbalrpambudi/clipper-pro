"use client";

import React, { memo, useMemo, useState } from "react";
import {
  Search,
  Film,
  Check,
  Play,
  Replace,
  PlusSquare,
  ListPlus,
  GripVertical,
  X,
} from "lucide-react";
import { Scene } from "@/types";
import { SCENE_DRAG_MIME } from "./timelineFormat";
import { Badge } from "@/components/ui/badge";

interface TimelineMediaPoolProps {
  scenes: Scene[];
  usedSceneMap: Map<string, number[]>;
  selectedClipNumber: number | null;
  selectedSceneId: string | null;
  canInsertAtPlayhead: boolean;
  onReplace: (scene: Scene) => void;
  onInsert: (scene: Scene) => void;
  onAppend: (scene: Scene) => void;
  onPreview: (scene: Scene) => void;
}

/** Scene browser: search, filter, group by source; scenes are draggable onto the timeline. */
export const TimelineMediaPool = memo(function TimelineMediaPool({
  scenes,
  usedSceneMap,
  selectedClipNumber,
  selectedSceneId,
  canInsertAtPlayhead,
  onReplace,
  onInsert,
  onAppend,
  onPreview,
}: TimelineMediaPoolProps) {
  const [query, setQuery] = useState("");
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const list = useMemo(() => {
    let out = scenes.slice();

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((s) => {
        const idxMatch = `#${s.scene_index + 1}`.includes(q) || `${s.scene_index + 1}` === q;
        const descMatch = (s.description || "").toLowerCase().includes(q);
        const tagMatch = (s.tags || []).some((t) => t.toLowerCase().includes(q));
        return idxMatch || descMatch || tagMatch;
      });
    }

    out.sort((a, b) => a.scene_index - b.scene_index);

    return out;
  }, [scenes, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-surface-border bg-card">
      <div className="flex items-center justify-between border-b border-surface-border bg-muted px-3.5 py-2.5">
        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
          <Film className="w-3.5 h-3.5 text-primary" /> Media Pool
        </span>
        <Badge
          variant="outline"
          className="border-border font-mono text-xs text-muted-foreground"
        >
          {list.length} scene
        </Badge>
      </div>

      <div className="relative border-b border-surface-border bg-background p-2.5">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="timeline-pool-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari deskripsi, tag, #"
              className="h-7 w-full rounded-lg border border-input bg-control-background pl-8 pr-6 text-xs text-foreground placeholder:text-muted-foreground transition focus:border-primary focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {list.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-10">
            Tidak ada scene yang cocok.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {list.map((sc) => {
              const used = usedSceneMap.get(sc.id);
              const isCurrent = selectedSceneId === sc.id;
              return (
                <div
                  key={sc.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SCENE_DRAG_MIME, sc.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDoubleClick={() => (selectedClipNumber !== null ? onReplace(sc) : onAppend(sc))}
                  className={`group cursor-grab overflow-hidden rounded-xl border bg-background transition active:cursor-grabbing ${
                    isCurrent
                      ? "border-primary ring-1 ring-primary/50"
                      : used
                        ? "border-primary/40 hover:border-primary"
                        : "border-border hover:border-primary/40"
                  }`}
                  title={`${sc.description || "Scene"}\nSeret ke timeline • Double-click: ${selectedClipNumber !== null ? `ganti klip #${selectedClipNumber}` : "tambah di akhir"}`}
                >
                  <div className="relative aspect-video bg-muted">
                    {sc.thumbnail_url && !broken[sc.id] ? (
                      <img
                        src={sc.thumbnail_url}
                        alt={sc.description || "scene"}
                        draggable={false}
                        className="w-full h-full object-cover"
                        onError={() => setBroken((p) => ({ ...p, [sc.id]: true }))}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-5 h-5 text-muted-foreground opacity-50" />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 px-1 rounded bg-background/90 text-xs font-bold text-foreground shadow-sm">
                      #{sc.scene_index + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-background/90 text-xs font-mono text-foreground shadow-sm">
                      {sc.duration.toFixed(1)}s
                    </span>
                    {used && (
                      <span className="absolute top-1 right-1 px-1 rounded bg-primary/20 border border-primary/40 text-xs font-bold text-primary flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {used.length > 1 ? `${used.length}×` : `#${used[0]}`}
                      </span>
                    )}
                    <GripVertical className="absolute bottom-1 left-1 w-3 h-3 text-white/60 opacity-0 group-hover:opacity-100" />
                    <button
                      type="button"
                      onClick={() => onPreview(sc)}
                      className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-background/90 hover:bg-primary hover:text-primary-foreground border border-border text-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm"
                      title="Preview scene"
                    >
                      <Play className="w-3 h-3 ml-0.5 fill-current" />
                    </button>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <p className="text-xs text-foreground/90 line-clamp-2 leading-tight min-h-[2.2em]">
                      {sc.description || "Scene"}
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      <PoolAction
                        title={
                          selectedClipNumber !== null
                            ? `Ganti klip #${selectedClipNumber}`
                            : "Pilih klip di timeline dulu"
                        }
                        disabled={selectedClipNumber === null || isCurrent}
                        onClick={() => onReplace(sc)}
                        tone="brand"
                      >
                        <Replace className="w-3 h-3" />
                      </PoolAction>
                      <PoolAction
                        title="Sisipkan di posisi playhead"
                        disabled={!canInsertAtPlayhead}
                        onClick={() => onInsert(sc)}
                      >
                        <PlusSquare className="w-3 h-3" />
                      </PoolAction>
                      <PoolAction title="Tambahkan di akhir timeline" onClick={() => onAppend(sc)}>
                        <ListPlus className="w-3 h-3" />
                      </PoolAction>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-surface-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
        <span>
          <Replace className="inline w-2.5 h-2.5" /> Ganti •{" "}
          <PlusSquare className="inline w-2.5 h-2.5" /> Sisip •{" "}
          <ListPlus className="inline w-2.5 h-2.5" /> Akhir
        </span>
        <span>atau seret ke timeline</span>
      </div>
    </div>
  );
});

function PoolAction({
  children,
  title,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "brand";
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`h-6 rounded-md flex items-center justify-center border transition disabled:opacity-25 disabled:cursor-not-allowed ${
        tone === "brand"
          ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground"
          : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

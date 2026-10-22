"use client";

import React, { memo, useMemo, useState, useRef, useEffect } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import { Scene, SourceVideo } from "@/types";
import { SCENE_DRAG_MIME } from "./timelineFormat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Filter = "all" | "used" | "available";
type Sort = "order" | "longest" | "shortest";

interface TimelineMediaPoolProps {
  scenes: Scene[];
  sourceVideos: SourceVideo[];
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
  sourceVideos,
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
  const [filter, setFilter] = useState<Filter>("all");
  const [videoId, setVideoId] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("order");
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  const videoName = useMemo(() => {
    const map = new Map<string, string>();
    sourceVideos.forEach((v) => map.set(v.id, v.filename || `Video #${v.id.slice(0, 4)}`));
    return map;
  }, [sourceVideos]);

  const list = useMemo(() => {
    let out = scenes.slice();

    if (videoId !== "all") {
      out = out.filter((s) => s.source_video_id === videoId);
    }

    if (filter === "used") {
      out = out.filter((s) => (usedSceneMap.get(s.id) || []).length > 0);
    } else if (filter === "available") {
      out = out.filter((s) => (usedSceneMap.get(s.id) || []).length === 0);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((s) => {
        const idxMatch = `#${s.scene_index + 1}`.includes(q) || `${s.scene_index + 1}` === q;
        const descMatch = (s.description || "").toLowerCase().includes(q);
        const tagMatch = (s.tags || []).some((t) => t.toLowerCase().includes(q));
        return idxMatch || descMatch || tagMatch;
      });
    }

    if (sort === "longest") {
      out.sort((a, b) => b.duration - a.duration);
    } else if (sort === "shortest") {
      out.sort((a, b) => a.duration - b.duration);
    } else {
      out.sort((a, b) => a.scene_index - b.scene_index);
    }

    return out;
  }, [scenes, videoId, filter, query, sort, usedSceneMap]);

  const usedCount = useMemo(() => {
    let n = 0;
    scenes.forEach((s) => {
      if ((usedSceneMap.get(s.id) || []).length > 0) n++;
    });
    return n;
  }, [scenes, usedSceneMap]);

  const pills: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Semua", count: scenes.length },
    { id: "used", label: "Terpakai", count: usedCount },
    { id: "available", label: "Tersedia", count: scenes.length - usedCount },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-surface-border bg-card">
      <div className="flex items-center justify-between border-b border-surface-border bg-muted px-3.5 py-2.5">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
          <Film className="w-3.5 h-3.5 text-primary" /> Media Pool
        </span>
        <Badge
          variant="outline"
          className="border-border font-mono text-[10px] text-muted-foreground"
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

          <div className="relative" ref={filterPopoverRef}>
            <Button
              type="button"
              variant={
                filter !== "all" || sort !== "order" || videoId !== "all" ? "supabase" : "outline"
              }
              size="icon"
              onClick={() => setIsFilterOpen((o) => !o)}
              className="h-7 w-7"
              title="Opsi filter dan sortir"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Button>

            {isFilterOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-64 space-y-3 rounded-xl border border-surface-border bg-card p-3 shadow-xl">
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Status Scene
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background p-0.5">
                    {pills.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFilter(p.id)}
                        className={`h-6 rounded-md text-[10px] font-semibold transition flex items-center justify-center gap-1 ${
                          filter === p.id
                            ? "bg-primary text-black"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p.label}
                        <span className="text-[9px] opacity-70">({p.count})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {sourceVideos.length > 1 && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      Video Sumber
                    </div>
                    <select
                      value={videoId}
                      onChange={(e) => setVideoId(e.target.value)}
                      className="h-7 w-full rounded-lg border border-input bg-control-background px-2 text-xs text-foreground transition focus:border-primary focus:outline-none"
                    >
                      <option value="all">Semua video</option>
                      {sourceVideos.map((v) => (
                        <option key={v.id} value={v.id}>
                          {videoName.get(v.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Urutan
                  </div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="h-7 w-full rounded-lg border border-input bg-control-background px-2 text-xs text-foreground transition focus:border-primary focus:outline-none"
                  >
                    <option value="order">Urutan asli (scene index)</option>
                    <option value="longest">Durasi terpanjang</option>
                    <option value="shortest">Durasi terpendek</option>
                  </select>
                </div>

                <div className="flex justify-end border-t border-border pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setSort("order");
                      setVideoId("all");
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {list.length === 0 ? (
          <p className="text-center text-[11px] text-muted-foreground py-10">
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
                  <div className="relative aspect-video bg-black">
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
                    <span className="absolute top-1 left-1 px-1 rounded bg-black/80 text-[9px] font-bold text-foreground">
                      #{sc.scene_index + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-black/80 text-[9px] font-mono text-foreground">
                      {sc.duration.toFixed(1)}s
                    </span>
                    {used && (
                      <span className="absolute top-1 right-1 px-1 rounded bg-primary/20 border border-primary/40 text-[8px] font-bold text-primary flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {used.length > 1 ? `${used.length}×` : `#${used[0]}`}
                      </span>
                    )}
                    <GripVertical className="absolute bottom-1 left-1 w-3 h-3 text-white/60 opacity-0 group-hover:opacity-100" />
                    <button
                      type="button"
                      onClick={() => onPreview(sc)}
                      className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-black/70 hover:bg-primary hover:text-black border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      title="Preview scene"
                    >
                      <Play className="w-3 h-3 ml-0.5 fill-current" />
                    </button>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <p className="text-[10px] text-foreground/90 line-clamp-2 leading-tight min-h-[2.2em]">
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

      <div className="flex items-center justify-between border-t border-surface-border bg-background px-3 py-1.5 text-[9px] text-muted-foreground">
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
          ? "bg-primary/20 border-primary/40 text-primary hover:bg-primary hover:text-black"
          : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

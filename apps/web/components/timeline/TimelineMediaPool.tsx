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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterOpen]);

  const videoName = useMemo(() => {
    const m = new Map<string, string>();
    sourceVideos.forEach((v, i) => m.set(v.id, v.filename || `Video ${i + 1}`));
    return m;
  }, [sourceVideos]);

  const usedCount = useMemo(() => scenes.filter((s) => usedSceneMap.has(s.id)).length, [scenes, usedSceneMap]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = scenes.filter((s) => {
      if (videoId !== "all" && s.source_video_id !== videoId) return false;
      if (filter === "used" && !usedSceneMap.has(s.id)) return false;
      if (filter === "available" && usedSceneMap.has(s.id)) return false;
      if (!q) return true;
      return (
        (s.description || "").toLowerCase().includes(q) ||
        (s.transcript || "").toLowerCase().includes(q) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        `#${s.scene_index + 1}` === q
      );
    });
    out = [...out].sort((a, b) => {
      if (sort === "longest") return b.duration - a.duration;
      if (sort === "shortest") return a.duration - b.duration;
      if (a.source_video_id !== b.source_video_id) return a.source_video_id.localeCompare(b.source_video_id);
      return a.scene_index - b.scene_index || a.start_time - b.start_time;
    });
    return out;
  }, [scenes, query, filter, videoId, sort, usedSceneMap]);

  const pills: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Semua", count: scenes.length },
    { id: "used", label: "Terpakai", count: usedCount },
    { id: "available", label: "Tersedia", count: scenes.length - usedCount },
  ];

  return (
    <div className="flex flex-col h-full border border-surface-border bg-surface-secondary overflow-hidden">
      <div className="px-3 py-2 border-b border-surface-border bg-surface/60 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
          <Film className="w-3.5 h-3.5 text-brand-400" /> Media Pool
        </span>
        <span className="text-[10px] text-slate-500 font-mono">{list.length} scene</span>
      </div>

      <div className="p-2 border-b border-surface-border/60 relative">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="timeline-pool-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari deskripsi, tag, #"
              className="w-full h-7 pl-8 pr-6 rounded-lg bg-surface border border-surface-border text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                aria-label="Hapus pencarian"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setIsFilterOpen((o) => !o)}
              className={`h-7 px-2 rounded-lg border text-xs flex items-center gap-1.5 transition ${
                filter !== "all" || sort !== "order" || videoId !== "all"
                  ? "bg-brand-500/20 border-brand-500/50 text-brand-300"
                  : "bg-surface border-surface-border text-slate-400 hover:text-slate-200"
              }`}
              title="Opsi filter dan sortir"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {(filter !== "all" || sort !== "order" || videoId !== "all") && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 p-3 rounded-xl bg-surface border border-surface-border shadow-2xl z-50 space-y-3">
                <div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Status Scene</div>
                  <div className="grid grid-cols-3 gap-1 bg-surface-secondary p-0.5 rounded-lg border border-surface-border">
                    {pills.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setFilter(p.id)}
                        className={`h-6 rounded-md text-[10px] font-semibold transition flex items-center justify-center gap-1 ${
                          filter === p.id
                            ? "bg-brand-500/20 text-brand-200 border border-brand-500/40"
                            : "text-slate-400 hover:text-slate-200"
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
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Video Sumber</div>
                    <select
                      value={videoId}
                      onChange={(e) => setVideoId(e.target.value)}
                      className="w-full h-7 rounded-lg bg-surface-secondary border border-surface-border text-xs text-slate-300 px-2 focus:outline-none"
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
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Urutan</div>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as Sort)}
                    className="w-full h-7 rounded-lg bg-surface-secondary border border-surface-border text-xs text-slate-300 px-2 focus:outline-none"
                  >
                    <option value="order">Urutan asli (scene index)</option>
                    <option value="longest">Durasi terpanjang</option>
                    <option value="shortest">Durasi terpendek</option>
                  </select>
                </div>

                <div className="flex justify-end pt-1 border-t border-surface-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("all");
                      setSort("order");
                      setVideoId("all");
                    }}
                    className="text-[10px] text-slate-400 hover:text-white"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {list.length === 0 ? (
          <p className="text-center text-[11px] text-slate-500 py-10">Tidak ada scene yang cocok.</p>
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
                  className={`group rounded-xl overflow-hidden border bg-surface transition cursor-grab active:cursor-grabbing ${
                    isCurrent
                      ? "border-accent-yellow ring-1 ring-accent-yellow/50"
                      : used
                      ? "border-emerald-500/40 hover:border-emerald-400"
                      : "border-surface-border hover:border-brand-500/70"
                  }`}
                  title={`${sc.description || "Scene"}\nSeret ke timeline • Double-click: ${selectedClipNumber !== null ? `ganti klip #${selectedClipNumber}` : "tambah di akhir"}`}
                >
                  <div className="relative aspect-video bg-slate-900">
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
                        <Film className="w-5 h-5 text-slate-600" />
                      </div>
                    )}
                    <span className="absolute top-1 left-1 px-1 rounded bg-black/75 text-[9px] font-bold text-slate-200">#{sc.scene_index + 1}</span>
                    <span className="absolute bottom-1 right-1 px-1 rounded bg-black/75 text-[9px] font-mono text-white">{sc.duration.toFixed(1)}s</span>
                    {used && (
                      <span className="absolute top-1 right-1 px-1 rounded bg-emerald-950/90 border border-emerald-400/60 text-[8px] font-bold text-emerald-300 flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {used.length > 1 ? `${used.length}×` : `#${used[0]}`}
                      </span>
                    )}
                    <GripVertical className="absolute bottom-1 left-1 w-3 h-3 text-white/60 opacity-0 group-hover:opacity-100" />
                    <button
                      type="button"
                      onClick={() => onPreview(sc)}
                      className="absolute inset-0 m-auto w-7 h-7 rounded-full bg-black/70 hover:bg-brand-600 border border-white/20 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      title="Preview scene"
                    >
                      <Play className="w-3 h-3 ml-0.5" />
                    </button>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <p className="text-[10px] text-slate-300 line-clamp-2 leading-tight min-h-[2.2em]">{sc.description || "Scene"}</p>
                    <div className="grid grid-cols-3 gap-1">
                      <PoolAction
                        title={selectedClipNumber !== null ? `Ganti klip #${selectedClipNumber}` : "Pilih klip di timeline dulu"}
                        disabled={selectedClipNumber === null || isCurrent}
                        onClick={() => onReplace(sc)}
                        tone="brand"
                      >
                        <Replace className="w-3 h-3" />
                      </PoolAction>
                      <PoolAction title="Sisipkan di posisi playhead" disabled={!canInsertAtPlayhead} onClick={() => onInsert(sc)}>
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

      <div className="px-3 py-1.5 border-t border-surface-border/60 text-[9px] text-slate-500 flex items-center justify-between">
        <span>
          <Replace className="inline w-2.5 h-2.5" /> Ganti • <PlusSquare className="inline w-2.5 h-2.5" /> Sisip • <ListPlus className="inline w-2.5 h-2.5" /> Akhir
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
      className={`h-6 rounded-md flex items-center justify-center border transition disabled:opacity-30 disabled:cursor-not-allowed ${
        tone === "brand"
          ? "bg-brand-500/15 border-brand-500/40 text-brand-200 hover:bg-brand-500 hover:text-white"
          : "bg-surface-card border-surface-border text-slate-300 hover:border-brand-500/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

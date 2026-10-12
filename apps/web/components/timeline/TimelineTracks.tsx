"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Film,
  Volume2,
  Subtitles,
  ZoomIn,
  ZoomOut,
  Maximize,
  AlertTriangle,
  Gauge,
  Magnet,
  ArrowRight,
} from "lucide-react";
import { SentenceSegment, TimelineClip } from "@/types";
import { Bounds, cutPoints, tlDur } from "@/lib/timeline/editOps";
import { SCENE_DRAG_MIME, formatRuler, formatSec } from "./timelineFormat";

export type SceneDropTarget =
  | { type: "replace"; index: number }
  | { type: "insert"; t: number }
  | { type: "append" };

interface TimelineTracksProps {
  clips: TimelineClip[];
  segments: SentenceSegment[];
  peaks: Float32Array | null;
  audioDuration: number;
  voice?: string | null;
  duration: number;
  time: number;
  isPlaying: boolean;
  selectedIndex: number | null;
  loopRange: { start: number; end: number } | null;
  hasAudio?: boolean;
  hasSubtitles?: boolean;
  onSelect: (i: number | null) => void;
  onSeek: (t: number) => void;
  getEdgeRange: (i: number) => Bounds | null;
  onEdgeDragStart: (i: number) => void;
  onEdgeDrag: (i: number, t: number) => void;
  onEdgeDragEnd: () => void;
  onDropScene: (sceneId: string, target: SceneDropTarget) => void;
  onEditSubtitles: () => void;
  onReaddAudio?: () => void;
  onReaddSubtitles?: () => void;
  onReaddAll?: () => void;
}

const HEADER_W = 84;
const RULER_H = 26;
const S_H = 36;
const V_H = 70;
const A_H = 48;
const MIN_PPS = 8;
const MAX_PPS = 320;
const SNAP_PX = 8;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];

export function TimelineTracks({
  clips,
  segments,
  peaks,
  audioDuration,
  voice,
  duration,
  time,
  isPlaying,
  selectedIndex,
  loopRange,
  hasAudio = true,
  hasSubtitles = true,
  onSelect,
  onSeek,
  getEdgeRange,
  onEdgeDragStart,
  onEdgeDrag,
  onEdgeDragEnd,
  onDropScene,
  onEditSubtitles,
  onReaddAudio,
  onReaddSubtitles,
  onReaddAll,
}: TimelineTracksProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pps, setPps] = useState<number | null>(null);
  const [viewportW, setViewportW] = useState(800);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dragEdge, setDragEdge] = useState<number | null>(null);
  const [dropHover, setDropHover] = useState<{ index: number | "end"; t: number; insert: boolean } | null>(null);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});
  const scrubbingRef = useRef(false);
  const dragRef = useRef<{ i: number; startX: number; orig: number; range: Bounds | null } | null>(null);

  const safeDuration = Math.max(1, duration);
  const fitPps = useCallback(
    () => Math.min(MAX_PPS, Math.max(MIN_PPS, (viewportW - 48) / safeDuration)),
    [viewportW, safeDuration]
  );
  const scale = pps ?? fitPps();
  const contentW = Math.max(viewportW, safeDuration * scale + 160);
  const x = (t: number) => t * scale;

  // Track viewport width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    setViewportW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zoomTo = useCallback(
    (next: number, anchorClientX?: number) => {
      const el = scrollRef.current;
      const clamped = Math.min(MAX_PPS, Math.max(MIN_PPS, next));
      if (!el) {
        setPps(clamped);
        return;
      }
      const rect = el.getBoundingClientRect();
      const anchorX = anchorClientX !== undefined ? anchorClientX - rect.left : el.clientWidth / 2;
      const anchorT = (el.scrollLeft + anchorX) / scale;
      setPps(clamped);
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, anchorT * clamped - anchorX);
      });
    },
    [scale]
  );

  // Ctrl/Cmd + wheel zoom anchored on the cursor
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scale, zoomTo]);

  // +/- keyboard zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      if (e.key === "=" || e.key === "+") zoomTo(scale * 1.25);
      else if (e.key === "-" || e.key === "_") zoomTo(scale / 1.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scale, zoomTo]);

  // Keep the playhead visible during playback (optimized to eliminate layout thrashing)
  const lastScrollCheckTime = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrubbingRef.current || dragRef.current) return;

    // During playback, throttle scroll inspection to avoid forced synchronous layout
    const now = performance.now();
    if (isPlaying && now - lastScrollCheckTime.current < 200) {
      return;
    }
    lastScrollCheckTime.current = now;

    const px = x(time);
    const sLeft = el.scrollLeft;
    const vW = viewportW || el.clientWidth;
    if (px < sLeft + 24 || px > sLeft + vW - 48) {
      el.scrollLeft = Math.max(0, px - (isPlaying ? 80 : vW / 3));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time, scale, isPlaying, viewportW]);

  // Waveform rendering
  const waveW = Math.max(1, Math.round(audioDuration * scale));
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const W = Math.min(waveW, 16000);
    const H = A_H - 12;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    // Warm amber / gold gradient matching the professional reference screenshot
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(251, 191, 36, 0.95)");
    grad.addColorStop(0.5, "rgba(245, 158, 11, 0.75)");
    grad.addColorStop(1, "rgba(251, 191, 36, 0.95)");
    ctx.fillStyle = grad;

    const per = peaks.length / W;
    for (let px = 0; px < W; px++) {
      const from = Math.floor(px * per);
      const to = Math.max(from + 1, Math.floor((px + 1) * per));
      let v = 0;
      for (let k = from; k < to && k < peaks.length; k++) if (peaks[k] > v) v = peaks[k];
      const h = Math.max(1, v * H * 0.92);
      ctx.fillRect(px, (H - h) / 2, 1, h);
    }
  }, [peaks, waveW]);

  // Ruler ticks
  const ticks = useMemo(() => {
    const step = TICK_STEPS.find((s) => s * scale >= 64) ?? 120;
    const minor = step / 5;
    const showMinor = minor * scale >= 8;
    const out: { t: number; major: boolean }[] = [];
    const end = contentW / scale;
    const inc = showMinor ? minor : step;
    for (let i = 0; i * inc <= end; i++) {
      const t = Math.round(i * inc * 1000) / 1000;
      out.push({ t, major: Math.abs(t / step - Math.round(t / step)) < 1e-6 });
    }
    return out;
  }, [scale, contentW]);

  const snapPoints = useMemo(() => {
    const pts = new Set<number>(cutPoints(clips));
    segments.forEach((s) => {
      pts.add(s.start_ms / 1000);
      pts.add(s.end_ms / 1000);
      (s.words || []).forEach((w) => pts.add(w.start_ms / 1000));
    });
    return Array.from(pts);
  }, [clips, segments]);

  const timeFromClientX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / scale);
  };

  // Ruler scrub
  const handleRulerDown = (e: React.PointerEvent) => {
    scrubbingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSeek(Math.min(safeDuration, timeFromClientX(e.clientX)));
  };
  const handleRulerMove = (e: React.PointerEvent) => {
    if (!scrubbingRef.current) return;
    onSeek(Math.min(safeDuration, timeFromClientX(e.clientX)));
  };
  const handleRulerUp = (e: React.PointerEvent) => {
    scrubbingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
  };

  // Edge (roll / extend) drag
  const handleEdgeDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { i, startX: e.clientX, orig: clips[i].timeline_end, range: getEdgeRange(i) };
    setDragEdge(i);
    onSelect(i);
    onEdgeDragStart(i);
  };
  const handleEdgeMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    let t = d.orig + (e.clientX - d.startX) / scale;
    let snapped: number | null = null;
    if (snapEnabled && !e.altKey) {
      const tol = SNAP_PX / scale;
      let best = tol;
      for (const p of [...snapPoints, time]) {
        if (Math.abs(p - d.orig) < 1e-6) continue;
        const dist = Math.abs(p - t);
        if (dist < best) {
          best = dist;
          snapped = p;
        }
      }
      if (snapped !== null) t = snapped;
    }
    if (d.range) t = Math.min(d.range.end, Math.max(d.range.start, t));
    setSnapLine(snapped !== null && d.range && snapped >= d.range.start && snapped <= d.range.end ? snapped : null);
    onEdgeDrag(d.i, t);
  };
  const handleEdgeUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch { }
    dragRef.current = null;
    setDragEdge(null);
    setSnapLine(null);
    onEdgeDragEnd();
  };

  // Scene drag & drop
  const isSceneDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(SCENE_DRAG_MIME);
  const handleClipDragOver = (e: React.DragEvent, index: number) => {
    if (!isSceneDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    const t = timeFromClientX(e.clientX);
    setDropHover({ index, t, insert: e.shiftKey });
  };
  const handleTrackDragOver = (e: React.DragEvent) => {
    if (!isSceneDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropHover({ index: "end", t: timeFromClientX(e.clientX), insert: false });
  };
  const handleDrop = (e: React.DragEvent, index: number | "end") => {
    const sceneId = e.dataTransfer.getData(SCENE_DRAG_MIME);
    setDropHover(null);
    if (!sceneId) return;
    e.preventDefault();
    e.stopPropagation();
    if (index === "end") onDropScene(sceneId, { type: "append" });
    else if (e.shiftKey) onDropScene(sceneId, { type: "insert", t: timeFromClientX(e.clientX) });
    else onDropScene(sceneId, { type: "replace", index });
  };

  const draggingClip = dragEdge !== null ? clips[dragEdge] : null;
  const draggingNext = dragEdge !== null ? clips[dragEdge + 1] : null;
  const trackTotalH = RULER_H + S_H + V_H + A_H;

  return (
    <div className="flex flex-col h-full border border-[#2E2E2E] bg-[#121212] overflow-hidden select-none shadow-sm">
      {/* Timeline Controls Toolbar */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 border-b border-[#2E2E2E] bg-[#181818] flex-wrap text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-primary" /> Tracks
          </span>
          <span className="text-[10px] text-muted-foreground hidden lg:inline">
            Seret handle kanan klip untuk <b className="text-foreground">extrude / roll</b> • Seret scene untuk ganti
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            className={`h-6 px-2 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition border ${snapEnabled
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-muted-foreground border-[#2E2E2E] hover:text-foreground"
              }`}
            title="Snap ke batas kata narasi & cut (Alt = bebas)"
            id="timeline-snap-toggle"
          >
            <Magnet className="w-3 h-3" /> Snap
          </button>

          <div className="w-px h-4 bg-[#2E2E2E] mx-1" />

          <button
            type="button"
            onClick={() => zoomTo(scale / 1.25)}
            className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-[#1E1E1E] flex items-center justify-center transition"
            title="Zoom out (-)"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <input
            type="range"
            min={Math.log(MIN_PPS)}
            max={Math.log(MAX_PPS)}
            step={0.01}
            value={Math.log(scale)}
            onChange={(e) => zoomTo(Math.exp(parseFloat(e.target.value)))}
            className="w-20 h-1 bg-[#1E1E1E] accent-primary cursor-pointer"
            aria-label="Zoom timeline"
          />
          <button
            type="button"
            onClick={() => zoomTo(scale * 1.25)}
            className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-[#1E1E1E] flex items-center justify-center transition"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPps(null);
              if (scrollRef.current) scrollRef.current.scrollLeft = 0;
            }}
            className="h-6 px-1.5 rounded-md text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-[#1E1E1E] flex items-center gap-1 transition"
            title="Fit seluruh timeline di layar"
          >
            <Maximize className="w-3 h-3" /> Fit
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Track Headers (Left sidebar) */}
        <div className="shrink-0 border-r border-[#2E2E2E] bg-[#161616]" style={{ width: HEADER_W }}>
          {/* Ruler header */}
          <div style={{ height: RULER_H }} className="border-b border-[#2E2E2E] px-2 flex items-center">
            <span className="text-[9px] font-mono text-muted-foreground font-semibold">TIME</span>
          </div>

          {/* S1: Subtitle track header */}
          <div style={{ height: S_H }} className="px-2 flex items-center justify-between border-b border-[#2E2E2E]">
            <div className="flex items-center gap-1.5">
              <Subtitles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground">S1</span>
            </div>
            {segments.length > 0 && hasSubtitles ? (
              <button
                type="button"
                onClick={onEditSubtitles}
                className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
                title="Edit di Subtitle Studio"
              >
                <span>Edit</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
            ) : onReaddSubtitles ? (
              <button
                type="button"
                onClick={onReaddSubtitles}
                className="text-[9px] text-primary hover:underline font-semibold"
                title="Tambahkan subtitle kembali ke timeline"
              >
                + Re-add
              </button>
            ) : (
              <span className="text-[9px] text-muted-foreground">Kosong</span>
            )}
          </div>

          {/* V1: Video track header */}
          <TrackHeader
            height={V_H}
            icon={<Film className="w-3.5 h-3.5 text-primary" />}
            label="V1"
            sub={`${clips.length} klip`}
          />

          {/* A1: Audio track header */}
          <div style={{ height: A_H }} className="px-2 flex flex-col justify-center gap-0.5 border-b border-[#2E2E2E]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                <Volume2 className="w-3.5 h-3.5 text-primary" /> A1
              </span>
              {(audioDuration <= 0 || !hasAudio) && onReaddAudio ? (
                <button
                  type="button"
                  onClick={onReaddAudio}
                  className="text-[9px] text-primary hover:underline font-semibold"
                  title="Tambahkan audio kembali ke timeline"
                >
                  + Re-add
                </button>
              ) : null}
            </div>
            <span className="text-[9px] text-muted-foreground truncate">
              {hasAudio && audioDuration > 0 ? (voice || "Narasi") : "Kosong"}
            </span>
          </div>
        </div>

        {/* Scrollable Tracks Area */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
          <div className="relative" style={{ width: contentW, height: trackTotalH }}>
            {/* Time Ruler */}
            <div
              className="absolute left-0 right-0 top-0 border-b border-[#2E2E2E] bg-[#181818] cursor-col-resize select-none"
              style={{ height: RULER_H }}
              onPointerDown={handleRulerDown}
              onPointerMove={handleRulerMove}
              onPointerUp={handleRulerUp}
            >
              {ticks.map(({ t, major }) => (
                <div key={t} className="absolute bottom-0 pointer-events-none" style={{ left: x(t) }}>
                  <div className={`w-px ${major ? "h-2.5 bg-slate-500" : "h-1.5 bg-slate-700"}`} />
                  {major && (
                    <span className="absolute bottom-2.5 -translate-x-1/2 text-[9px] font-mono text-muted-foreground font-semibold whitespace-nowrap">
                      {formatRuler(t)}
                    </span>
                  )}
                </div>
              ))}
              {/* End of content boundary marker */}
              <div className="absolute top-0 bottom-0 w-px bg-[#2E2E2E]" style={{ left: x(safeDuration) }} />
            </div>

            {/* S1: Subtitle karaoke track */}
            <div
              className="absolute left-0 right-0 border-b border-[#2E2E2E] bg-[#121212]"
              style={{ top: RULER_H, height: S_H }}
            >
              {hasSubtitles && segments.length > 0 ? (
                segments.map((seg, sIdx) => {
                  const st = seg.start_ms / 1000;
                  const en = seg.end_ms / 1000;
                  const active = time >= st && time < en;
                  return (
                    <div
                      key={seg.id || sIdx}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSeek(st);
                      }}
                      className={`absolute top-1 bottom-1 rounded-md px-2 flex items-center overflow-hidden cursor-pointer transition border shadow-xs ${active
                          ? "bg-primary text-black border-primary font-semibold shadow-xs ring-1 ring-primary/40"
                          : "bg-[#181818] text-foreground/80 border-[#2E2E2E] hover:border-primary/40"
                        }`}
                      style={{ left: x(st), width: Math.max(28, x(en - st) - 2) }}
                      title={seg.text}
                    >
                      <span className="text-[9px] font-bold text-primary mr-1.5 shrink-0 font-mono">T</span>
                      <span className="text-[10px] font-medium truncate">{seg.text}</span>
                    </div>
                  );
                })
              ) : (
                <div
                  className="absolute inset-y-1 left-2 right-2 rounded-lg border border-dashed border-[#2E2E2E] flex items-center justify-between px-3 text-[10px] text-muted-foreground"
                  style={{ maxWidth: Math.max(320, viewportW - 16) }}
                >
                  <span>Track Subtitle dinonaktifkan atau kosong</span>
                  {onReaddSubtitles && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReaddSubtitles();
                      }}
                      className="px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 font-semibold cursor-pointer"
                    >
                      + Tambah Subtitle
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* V1: Video clips track */}
            <div
              className="absolute left-0 right-0 border-b border-surface-border/70 bg-[repeating-linear-gradient(90deg,transparent,transparent_39px,rgba(255,255,255,0.015)_40px)]"
              style={{ top: RULER_H + S_H, height: V_H }}
              onDragOver={handleTrackDragOver}
              onDragLeave={() => setDropHover(null)}
              onDrop={(e) => handleDrop(e, "end")}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) onSelect(null);
              }}
            >
              {clips.length === 0 && (
                <div
                  className={`absolute inset-2 rounded-xl border-2 border-dashed flex flex-col sm:flex-row items-center justify-center gap-2 text-xs transition px-4 py-2 text-center ${dropHover ? "border-brand-400 bg-brand-500/10 text-brand-200" : "border-surface-border text-slate-500"
                    }`}
                  style={{ maxWidth: Math.max(320, viewportW - 24) }}
                >
                  <span>Seret scene dari Media Pool ke sini untuk mulai menyusun timeline</span>
                  {(!hasAudio || !hasSubtitles) && onReaddAll && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReaddAll();
                      }}
                      className="px-2.5 py-1 rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 font-semibold text-[11px] cursor-pointer"
                    >
                      + Re-add Audio & Subtitle
                    </button>
                  )}
                </div>
              )}

              {clips.map((clip, idx) => {
                const left = x(clip.timeline_start);
                const width = Math.max(2, x(tlDur(clip)));
                const isSel = selectedIndex === idx;
                const dur = tlDur(clip);
                const isShort = dur < 1.8;
                const sped = clip.speed && Math.abs(clip.speed - 1) > 0.02;
                const isDropTarget = dropHover?.index === idx;
                const thumbOk = clip.thumbnail_url && !brokenThumbs[clip.id];

                return (
                  <div
                    key={clip.id || idx}
                    className={`absolute top-1 bottom-1 rounded-lg overflow-hidden cursor-pointer group transition-shadow ${isSel
                        ? "ring-2 ring-accent-yellow shadow-lg shadow-accent-yellow/20 z-10"
                        : "ring-1 ring-brand-500/40 hover:ring-brand-400"
                      } ${isDropTarget ? "ring-2 ring-emerald-400" : ""}`}
                    style={{ left, width }}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return;
                      onSelect(idx);
                      onSeek(Math.min(clip.timeline_end - 1 / 30, timeFromClientX(e.clientX)));
                    }}
                    onDragOver={(e) => handleClipDragOver(e, idx)}
                    onDragLeave={() => setDropHover(null)}
                    onDrop={(e) => handleDrop(e, idx)}
                    title={`Klip #${idx + 1} • ${formatSec(dur, 2)}${clip.text ? `\n${clip.text}` : ""}`}
                  >
                    {/* Filmstrip background */}
                    <div
                      className="absolute inset-0 bg-slate-900"
                      style={
                        thumbOk
                          ? {
                            backgroundImage: `url(${clip.thumbnail_url})`,
                            backgroundSize: "auto 100%",
                            backgroundRepeat: "repeat-x",
                          }
                          : undefined
                      }
                    />
                    {thumbOk && (
                      <img
                        src={clip.thumbnail_url!}
                        alt=""
                        className="hidden"
                        onError={() => setBrokenThumbs((p) => ({ ...p, [clip.id]: true }))}
                      />
                    )}
                    <div
                      className={`absolute inset-0 ${isSel
                          ? "bg-gradient-to-t from-black/85 via-black/20 to-accent-yellow/15"
                          : "bg-gradient-to-t from-black/85 via-black/25 to-transparent"
                        }`}
                    />

                    {width > 24 && (
                      <div className="absolute top-1 left-1 right-1 flex items-center gap-1">
                        <span
                          className={`px-1 rounded text-[9px] font-bold ${isSel ? "bg-accent-yellow text-black" : "bg-black/75 text-white"
                            }`}
                        >
                          {idx + 1}
                        </span>
                        {isShort && width > 44 && (
                          <AlertTriangle className="w-3 h-3 text-amber-400 drop-shadow" aria-label="Durasi pendek" />
                        )}
                        {sped && width > 54 && (
                          <span className="px-1 rounded bg-indigo-500/85 text-[8px] font-mono text-white flex items-center gap-0.5">
                            <Gauge className="w-2.5 h-2.5" />
                            {clip.speed}x
                          </span>
                        )}
                      </div>
                    )}

                    {width > 44 && (
                      <div className="absolute bottom-1 left-1.5 right-2 flex items-end justify-between gap-1">
                        <span className="text-[9px] text-slate-200 truncate leading-tight">
                          {width > 100 ? clip.text || "" : ""}
                        </span>
                        <span className="text-[9px] font-mono text-white/90 shrink-0">{dur.toFixed(1)}s</span>
                      </div>
                    )}

                    {isDropTarget && (
                      <div className="absolute inset-0 bg-emerald-500/30 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-emerald-300 whitespace-nowrap">
                          {dropHover?.insert ? "Sisip di sini" : "Ganti scene"}
                        </span>
                      </div>
                    )}

                    {/* Right edge handle: roll with next clip, or extend when last */}
                    <div
                      className={`absolute top-0 bottom-0 -right-1 w-3 cursor-ew-resize z-20 flex items-center justify-center ${dragEdge === idx ? "" : "opacity-0 group-hover:opacity-100"
                        }`}
                      onPointerDown={(e) => handleEdgeDown(e, idx)}
                      onPointerMove={handleEdgeMove}
                      onPointerUp={handleEdgeUp}
                      onPointerCancel={handleEdgeUp}
                      title={
                        idx === clips.length - 1
                          ? "Seret untuk memperpanjang/memendekkan klip terakhir"
                          : "Seret untuk roll-edit titik potong"
                      }
                    >
                      <div className={`w-1 h-7 rounded-full ${dragEdge === idx ? "bg-accent-yellow shadow-md" : "bg-white/80"}`} />
                    </div>
                  </div>
                );
              })}

              {/* Insert guide line when shift-dragging */}
              {dropHover?.insert && typeof dropHover.index === "number" && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-30 pointer-events-none shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                  style={{ left: x(dropHover.t) }}
                />
              )}

              {/* Append drop zone */}
              {clips.length > 0 && dropHover?.index === "end" && (
                <div
                  className="absolute top-1 bottom-1 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-500/15 flex items-center justify-center text-[10px] font-bold text-emerald-300 pointer-events-none"
                  style={{ left: x(clips[clips.length - 1].timeline_end) + 4, width: 110 }}
                >
                  + Tambah di akhir
                </div>
              )}
            </div>

            {/* A1: Audio narration waveform track */}
            <div
              className="absolute left-0 right-0 border-b border-surface-border/70 bg-surface/10"
              style={{ top: RULER_H + S_H + V_H, height: A_H }}
              onPointerDown={(e) => onSeek(Math.min(safeDuration, timeFromClientX(e.clientX)))}
            >
              {hasAudio && audioDuration > 0 ? (
                <div
                  className="absolute top-1 bottom-1 left-0 rounded-lg bg-amber-950/20 ring-1 ring-amber-500/30 overflow-hidden"
                  style={{ width: waveW }}
                >
                  {peaks ? (
                    <canvas ref={canvasRef} className="absolute inset-y-1 left-0 h-[calc(100%-8px)]" style={{ width: waveW }} />
                  ) : (
                    <div className="absolute inset-0 flex items-center px-3 text-[10px] text-amber-400/70">
                      Memuat waveform audio…
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="absolute inset-y-1 left-2 right-2 rounded-lg border border-dashed border-[#2E2E2E] flex items-center justify-between px-3 text-[10px] text-muted-foreground"
                  style={{ maxWidth: Math.max(320, viewportW - 16) }}
                >
                  <span>Track Audio narasi dinonaktifkan atau belum ada</span>
                  {onReaddAudio && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onReaddAudio();
                      }}
                      className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 font-semibold cursor-pointer"
                    >
                      + Tambah Audio
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Loop range overlay */}
            {loopRange && (
              <div
                className="absolute bg-accent-yellow/[0.08] border-x border-accent-yellow/60 pointer-events-none z-20"
                style={{
                  left: x(loopRange.start),
                  width: Math.max(2, x(loopRange.end - loopRange.start)),
                  top: 0,
                  height: trackTotalH,
                }}
              />
            )}

            {/* Snap guideline */}
            {snapLine !== null && (
              <div
                className="absolute top-0 w-px bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)] pointer-events-none z-30"
                style={{ left: x(snapLine), height: trackTotalH }}
              />
            )}

            {/* Drag tooltip */}
            {draggingClip && (
              <div
                className="absolute z-40 -translate-x-1/2 px-2 py-1 rounded-md bg-black/95 border border-white/15 text-[10px] font-mono text-white whitespace-nowrap pointer-events-none shadow-xl"
                style={{ left: x(draggingClip.timeline_end), top: RULER_H + 2 }}
              >
                #{(dragEdge ?? 0) + 1} {tlDur(draggingClip).toFixed(2)}s
                {draggingNext ? ` | #${(dragEdge ?? 0) + 2} ${tlDur(draggingNext).toFixed(2)}s` : ""}
                {draggingClip.speed !== 1 ? ` • ${draggingClip.speed}x` : ""}
              </div>
            )}

            {/* Red Playhead (spans through all tracks from top to bottom, GPU-accelerated) */}
            <div
              className="absolute top-0 left-0 z-30 pointer-events-none will-change-transform"
              style={{
                transform: `translate3d(${x(time)}px, 0, 0)`,
                height: trackTotalH,
              }}
            >
              <div className="absolute -translate-x-1/2 top-0 w-3 h-3 bg-rose-500 rotate-45 -mt-1.5 rounded-sm shadow-md" />
              <div className="absolute top-0 bottom-0 w-px bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.9)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackHeader({
  height,
  icon,
  label,
  sub,
}: {
  height: number;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div style={{ height }} className="px-2 flex flex-col justify-center gap-0.5 border-b border-[#2E2E2E]">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
        {icon} {label}
      </span>
      <span className="text-[9px] text-muted-foreground truncate">{sub}</span>
    </div>
  );
}

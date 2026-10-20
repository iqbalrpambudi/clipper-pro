"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Scissors,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Play,
  Maximize2,
  Expand,
  Gauge,
  Timer,
  MoveHorizontal,
  Keyboard,
  AlertTriangle,
  SlidersHorizontal,
  Repeat,
} from "lucide-react";
import { Scene, TimelineClip } from "@/types";
import {
  SceneMap,
  canUseSpeed,
  clipBounds,
  clipWarnings,
  slipClip,
  tlDur,
} from "@/lib/timeline/editOps";
import { Button } from "@/components/ui/button";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface ClipInspectorProps {
  clip: TimelineClip | null;
  index: number | null;
  total: number;
  scene?: Scene;
  sceneMap: SceneMap;
  time: number;
  canSplit: boolean;
  isLooping: boolean;
  onCommit: (clip: TimelineClip) => void;
  onGestureStart: () => void;
  onGestureUpdate: (clip: TimelineClip) => void;
  onGestureEnd: () => void;
  onSetDuration: (dur: number) => void;
  onSetSpeed: (speed: number) => void;
  onSplit: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onCenter: () => void;
  onFillScene: () => void;
  onPreviewSource: () => void;
  onToggleLoop: () => void;
}

export function ClipInspector(props: ClipInspectorProps) {
  const { clip, index } = props;
  if (!clip || index === null) return <EmptyInspector />;
  return <SelectedInspector {...props} clip={clip} index={index} />;
}

function SelectedInspector({
  clip,
  index,
  total,
  scene,
  sceneMap,
  time,
  canSplit,
  isLooping,
  onGestureStart,
  onGestureUpdate,
  onGestureEnd,
  onSetDuration,
  onSetSpeed,
  onSplit,
  onDelete,
  onMove,
  onCenter,
  onFillScene,
  onPreviewSource,
  onToggleLoop,
}: ClipInspectorProps & { clip: TimelineClip; index: number }) {
  const dur = tlDur(clip);
  const bounds = clipBounds(clip, sceneMap);
  const span = Math.max(0.001, bounds.end - bounds.start);
  const warnings = clipWarnings(clip);
  const [durDraft, setDurDraft] = useState(dur.toFixed(2));
  useEffect(() => setDurDraft(dur.toFixed(2)), [dur]);

  // Slip bar drag
  const barRef = useRef<HTMLDivElement>(null);
  const slipRef = useRef<{ startX: number; base: TimelineClip } | null>(null);
  const onSlipDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    slipRef.current = { startX: e.clientX, base: clip };
    onGestureStart();
  };
  const onSlipMove = (e: React.PointerEvent) => {
    const s = slipRef.current;
    const bar = barRef.current;
    if (!s || !bar) return;
    const dSec = ((e.clientX - s.startX) / bar.clientWidth) * span;
    onGestureUpdate(slipClip(s.base, s.base.clip_start + dSec, sceneMap));
  };
  const onSlipUp = (e: React.PointerEvent) => {
    if (!slipRef.current) return;
    slipRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    onGestureEnd();
  };

  const winLeft = ((clip.clip_start - bounds.start) / span) * 100;
  const winWidth = ((clip.clip_end - clip.clip_start) / span) * 100;
  const inClip = time >= clip.timeline_start && time < clip.timeline_end;

  // Stationary playhead cut guide:
  // Captured when the playhead moves on timeline, clip selection changes, or speed changes,
  // but explicitly kept stationary during slip dragging so it acts as an exact cutting guide!
  const anchorSrcPlayheadRef = useRef<number | null>(null);
  const lastClipIdRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastSpeedRef = useRef<number | null>(null);

  if (
    lastClipIdRef.current !== clip.id ||
    lastTimeRef.current !== time ||
    lastSpeedRef.current !== (clip.speed || 1)
  ) {
    lastClipIdRef.current = clip.id;
    lastTimeRef.current = time;
    lastSpeedRef.current = clip.speed || 1;
    if (inClip) {
      anchorSrcPlayheadRef.current =
        clip.clip_start + (time - clip.timeline_start) * (clip.speed || 1);
    } else {
      anchorSrcPlayheadRef.current = null;
    }
  }

  const guidePlayhead = anchorSrcPlayheadRef.current;
  const guidePercent =
    guidePlayhead !== null
      ? Math.max(0, Math.min(100, ((guidePlayhead - bounds.start) / span) * 100))
      : null;

  const commitDuration = () => {
    const v = parseFloat(durDraft.replace(",", "."));
    if (Number.isFinite(v) && Math.abs(v - dur) > 0.005) onSetDuration(v);
    else setDurDraft(dur.toFixed(2));
  };

  return (
    <div className="flex flex-col h-full border-r border-[#2E2E2E] bg-[#141414] overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-[#2E2E2E] bg-[#181818] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" /> Klip #{index + 1}
          <span className="text-muted-foreground normal-case font-normal">/ {total}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-foreground"
            title="Tukar dengan klip sebelumnya"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-foreground"
            title="Tukar dengan klip berikutnya"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Source thumb + meta */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onPreviewSource}
            className="relative w-24 shrink-0 aspect-video rounded-lg overflow-hidden bg-black border border-[#2E2E2E] group"
            title="Preview potongan sumber"
          >
            {clip.thumbnail_url && (
              <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />
            )}
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <Play className="w-4 h-4 text-white" />
            </span>
          </button>
          <div className="min-w-0 text-[10px] space-y-0.5">
            <p className="text-foreground font-semibold truncate">
              Scene #{scene ? scene.scene_index + 1 : "?"}
            </p>
            <p className="text-muted-foreground line-clamp-2 leading-tight">
              {scene?.description || "Scene sumber"}
            </p>
            <p className="font-mono text-muted-foreground">
              {clip.timeline_start.toFixed(2)}s → {clip.timeline_end.toFixed(2)}s
            </p>
          </div>
        </div>

        {clip.text && (
          <p className="text-[10px] text-foreground bg-[#181818] rounded-lg border border-[#2E2E2E] px-2.5 py-2 leading-snug line-clamp-3">
            <span className="text-muted-foreground font-medium">Narasi: </span>“{clip.text}”
          </p>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-[10px] text-amber-300 space-y-0.5">
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-px shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* Duration (extend / shorten) */}
        <Section
          icon={<Timer className="w-3.5 h-3.5 text-primary" />}
          title="Durasi di timeline"
          hint={index < total - 1 ? "roll dgn klip berikut" : "klip terakhir"}
        >
          <div className="flex items-center gap-1">
            <StepBtn onClick={() => onSetDuration(dur - 0.5)}>-0.5</StepBtn>
            <StepBtn onClick={() => onSetDuration(dur - 1 / 30)}>-1f</StepBtn>
            <input
              value={durDraft}
              onChange={(e) => setDurDraft(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="flex-1 min-w-0 h-7 rounded-lg bg-[#121212] border border-[#2E2E2E] text-center text-xs font-mono text-foreground focus:outline-none focus:border-primary transition"
              aria-label="Durasi klip (detik)"
            />
            <StepBtn onClick={() => onSetDuration(dur + 1 / 30)}>+1f</StepBtn>
            <StepBtn onClick={() => onSetDuration(dur + 0.5)}>+0.5</StepBtn>
          </div>
        </Section>

        {/* Slip */}
        <Section
          icon={<MoveHorizontal className="w-3.5 h-3.5 text-primary" />}
          title="Pilih bagian scene (slip)"
          hint={`${(clip.clip_end - clip.clip_start).toFixed(2)}s dari ${span.toFixed(1)}s`}
        >
          <div
            ref={barRef}
            className="relative h-9 rounded-lg bg-[#121212] border border-[#2E2E2E] overflow-hidden"
          >
            {clip.thumbnail_url && (
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: `url(${clip.thumbnail_url})`,
                  backgroundSize: "auto 100%",
                  backgroundRepeat: "repeat-x",
                }}
              />
            )}
            <div
              className="absolute top-0 bottom-0 rounded-sm bg-primary/20 border-2 border-primary cursor-grab active:cursor-grabbing touch-none"
              style={{ left: `${winLeft}%`, width: `${Math.max(2, winWidth)}%` }}
              onPointerDown={onSlipDown}
              onPointerMove={onSlipMove}
              onPointerUp={onSlipUp}
              onPointerCancel={onSlipUp}
              title="Geser untuk memilih bagian scene yang dipakai"
            />
            {guidePercent !== null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-20"
                style={{ left: `${guidePercent}%` }}
                title="Posisi Playhead (Panduan Pemotongan)"
              >
                {/* Diamond playhead marker on top */}
                <div className="absolute -translate-x-1/2 top-0 w-2 h-2 bg-rose-500 rotate-45 -mt-1 rounded-xs shadow-md" />
                {/* Vertical guide line */}
                <div className="absolute top-0 bottom-0 w-px bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.9)]" />
              </div>
            )}
          </div>
          <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1">
            <span>{bounds.start.toFixed(2)}s</span>
            <span className="text-primary font-medium">
              In {clip.clip_start.toFixed(2)} • Out {clip.clip_end.toFixed(2)}
            </span>
            <span>{bounds.end.toFixed(2)}s</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <ActionBtn onClick={onCenter} icon={<Maximize2 className="w-3.5 h-3.5 text-primary" />}>
              Pusatkan
            </ActionBtn>
            <ActionBtn onClick={onFillScene} icon={<Expand className="w-3.5 h-3.5 text-primary" />}>
              Full scene
            </ActionBtn>
          </div>
        </Section>

        {/* Speed */}
        <Section
          icon={<Gauge className="w-3.5 h-3.5 text-primary" />}
          title="Kecepatan"
          hint={`${clip.speed || 1}x`}
        >
          <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-lg border border-[#2E2E2E]">
            {SPEEDS.map((s) => {
              const ok = canUseSpeed(clip, s, sceneMap);
              const active = Math.abs((clip.speed || 1) - s) < 0.01;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!ok}
                  onClick={() => onSetSpeed(s)}
                  title={ok ? `${s}x` : "Scene terlalu pendek untuk kecepatan ini"}
                  className={`flex-1 h-7 rounded-md text-[10px] font-mono font-semibold transition disabled:opacity-25 disabled:cursor-not-allowed ${
                    active
                      ? "bg-primary text-black shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-[#1E1E1E]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <ActionBtn
            onClick={onSplit}
            disabled={!canSplit}
            icon={<Scissors className="w-3.5 h-3.5 text-primary" />}
            title="Potong klip di posisi playhead (S)"
          >
            Potong (S)
          </ActionBtn>
          <ActionBtn
            onClick={onToggleLoop}
            active={isLooping}
            icon={<Repeat className="w-3.5 h-3.5" />}
            title="Putar ulang klip ini di monitor (L)"
          >
            Loop (L)
          </ActionBtn>
          <ActionBtn
            onClick={onPreviewSource}
            icon={<Play className="w-3.5 h-3.5 text-foreground" />}
          >
            Preview
          </ActionBtn>
          <ActionBtn
            onClick={onDelete}
            danger
            icon={<Trash2 className="w-3.5 h-3.5" />}
            title="Hapus klip; klip sebelumnya mengisi celah (Del)"
          >
            Hapus (Del)
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

function EmptyInspector() {
  const rows: [string, string][] = [
    ["Spasi", "Play / pause"],
    ["S", "Potong di playhead"],
    ["Del", "Hapus klip terpilih"],
    ["← / →", "Geser 1 frame (Shift: 1s)"],
    ["↑ / ↓", "Lompat ke cut sebelum/berikut"],
    ["L", "Loop klip terpilih"],
    ["+ / −", "Zoom timeline"],
    ["⌘/Ctrl Z", "Undo (Shift: redo)"],
    ["⌘/Ctrl S", "Simpan timeline"],
  ];
  return (
    <div className="flex flex-col h-full border-r border-[#2E2E2E] bg-[#141414] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#2E2E2E] bg-[#181818]">
        <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" /> Inspector
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Klik klip di timeline untuk mengatur durasi, bagian scene, kecepatan, atau memotongnya.
        </p>
        <div className="rounded-xl border border-[#2E2E2E] bg-[#181818] p-3 space-y-2">
          <p className="text-[10px] font-semibold text-foreground flex items-center gap-1.5">
            <Keyboard className="w-3 h-3 text-primary" /> Shortcut
          </p>
          <div className="space-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[10px]">
                <kbd className="px-1.5 py-0.5 rounded bg-[#121212] border border-[#2E2E2E] font-mono text-foreground">
                  {k}
                </kbd>
                <span className="text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {hint && <span className="font-mono text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="xs"
      onClick={onClick}
      className="h-7 px-2 font-mono text-[10px] bg-[#141414] border-[#2E2E2E] text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}

function ActionBtn({
  children,
  icon,
  onClick,
  disabled,
  danger,
  active,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      variant={danger ? "destructive" : active ? "supabase" : "outline"}
      size="xs"
      className="h-7 px-2.5 text-[11px] gap-1.5 font-medium"
    >
      {icon}
      <span>{children}</span>
    </Button>
  );
}

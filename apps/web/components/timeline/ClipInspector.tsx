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
  const srcPlayhead = inClip ? clip.clip_start + (time - clip.timeline_start) * (clip.speed || 1) : null;

  const commitDuration = () => {
    const v = parseFloat(durDraft.replace(",", "."));
    if (Number.isFinite(v) && Math.abs(v - dur) > 0.005) onSetDuration(v);
    else setDurDraft(dur.toFixed(2));
  };

  return (
    <div className="flex flex-col h-full border border-accent-yellow/30 bg-surface-secondary overflow-hidden">
      <div className="px-3 py-2 border-b border-surface-border bg-surface/60 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-accent-yellow" /> Klip #{index + 1}
          <span className="text-slate-500 normal-case font-normal">/ {total}</span>
        </span>
        <div className="flex items-center gap-0.5">
          <IconBtn title="Tukar dengan klip sebelumnya" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="Tukar dengan klip berikutnya" disabled={index >= total - 1} onClick={() => onMove(1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {/* Source thumb + meta */}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onPreviewSource}
            className="relative w-24 shrink-0 aspect-video rounded-lg overflow-hidden bg-slate-900 group"
            title="Preview potongan sumber"
          >
            {clip.thumbnail_url && <img src={clip.thumbnail_url} alt="" className="w-full h-full object-cover" />}
            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
              <Play className="w-4 h-4 text-white" />
            </span>
          </button>
          <div className="min-w-0 text-[10px] space-y-0.5">
            <p className="text-slate-200 font-semibold truncate">Scene #{scene ? scene.scene_index + 1 : "?"}</p>
            <p className="text-slate-400 line-clamp-2 leading-tight">{scene?.description || "Scene sumber"}</p>
            <p className="font-mono text-slate-500">
              {clip.timeline_start.toFixed(2)}s → {clip.timeline_end.toFixed(2)}s
            </p>
          </div>
        </div>

        {clip.text && (
          <p className="text-[10px] text-slate-300 bg-surface rounded-lg border border-surface-border px-2 py-1.5 leading-snug line-clamp-3">
            <span className="text-slate-500">Narasi: </span>“{clip.text}”
          </p>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-[10px] text-amber-200 space-y-0.5">
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 mt-px shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        {/* Duration (extend / shorten) */}
        <Section icon={<Timer className="w-3 h-3" />} title="Durasi di timeline" hint={index < total - 1 ? "roll dgn klip berikut" : "klip terakhir"}>
          <div className="flex items-center gap-1">
            <StepBtn onClick={() => onSetDuration(dur - 0.5)}>-0.5</StepBtn>
            <StepBtn onClick={() => onSetDuration(dur - 1 / 30)}>-1f</StepBtn>
            <input
              value={durDraft}
              onChange={(e) => setDurDraft(e.target.value)}
              onBlur={commitDuration}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="flex-1 min-w-0 h-7 rounded-md bg-surface border border-surface-border text-center text-xs font-mono text-white focus:outline-none focus:border-accent-yellow/60"
              aria-label="Durasi klip (detik)"
            />
            <StepBtn onClick={() => onSetDuration(dur + 1 / 30)}>+1f</StepBtn>
            <StepBtn onClick={() => onSetDuration(dur + 0.5)}>+0.5</StepBtn>
          </div>
        </Section>

        {/* Slip */}
        <Section icon={<MoveHorizontal className="w-3 h-3" />} title="Pilih bagian scene (slip)" hint={`${(clip.clip_end - clip.clip_start).toFixed(2)}s dari ${span.toFixed(1)}s`}>
          <div ref={barRef} className="relative h-9 rounded-md bg-surface border border-surface-border overflow-hidden">
            {clip.thumbnail_url && (
              <div
                className="absolute inset-0 opacity-25"
                style={{ backgroundImage: `url(${clip.thumbnail_url})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x" }}
              />
            )}
            <div
              className="absolute top-0 bottom-0 rounded-sm bg-accent-yellow/25 border-2 border-accent-yellow cursor-grab active:cursor-grabbing touch-none"
              style={{ left: `${winLeft}%`, width: `${Math.max(2, winWidth)}%` }}
              onPointerDown={onSlipDown}
              onPointerMove={onSlipMove}
              onPointerUp={onSlipUp}
              onPointerCancel={onSlipUp}
              title="Geser untuk memilih bagian scene yang dipakai"
            />
            {srcPlayhead !== null && (
              <div className="absolute top-0 bottom-0 w-px bg-rose-500 pointer-events-none" style={{ left: `${((srcPlayhead - bounds.start) / span) * 100}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[9px] font-mono text-slate-500 mt-1">
            <span>{bounds.start.toFixed(2)}s</span>
            <span className="text-accent-yellow/90">
              In {clip.clip_start.toFixed(2)} • Out {clip.clip_end.toFixed(2)}
            </span>
            <span>{bounds.end.toFixed(2)}s</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <ActionBtn onClick={onCenter} icon={<Maximize2 className="w-3.5 h-3.5 text-emerald-400" />}>
              Pusatkan
            </ActionBtn>
            <ActionBtn onClick={onFillScene} icon={<Expand className="w-3.5 h-3.5 text-sky-400" />}>
              Full scene
            </ActionBtn>
          </div>
        </Section>

        {/* Speed */}
        <Section icon={<Gauge className="w-3 h-3" />} title="Kecepatan" hint={`${clip.speed || 1}x`}>
          <div className="flex items-center gap-1 bg-surface p-1 rounded-lg border border-surface-border">
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
                  className={`flex-1 h-7 rounded-md text-[10px] font-mono font-bold transition disabled:opacity-25 disabled:cursor-not-allowed ${
                    active
                      ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400/60 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-surface-hover"
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
          <ActionBtn onClick={onSplit} disabled={!canSplit} icon={<Scissors className="w-3.5 h-3.5 text-accent-yellow" />} title="Potong klip di posisi playhead (S)">
            Potong (S)
          </ActionBtn>
          <ActionBtn onClick={onToggleLoop} active={isLooping} icon={<Repeat className="w-3.5 h-3.5" />} title="Putar ulang klip ini di monitor (L)">
            Loop (L)
          </ActionBtn>
          <ActionBtn onClick={onPreviewSource} icon={<Play className="w-3.5 h-3.5 text-brand-300" />}>
            Preview
          </ActionBtn>
          <ActionBtn onClick={onDelete} danger icon={<Trash2 className="w-3.5 h-3.5" />} title="Hapus klip; klip sebelumnya mengisi celah (Del)">
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
    <div className="flex flex-col h-full border border-surface-border bg-surface-secondary overflow-hidden">
      <div className="px-3 py-2 border-b border-surface-border bg-surface/60">
        <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> Inspector
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Klik klip di timeline untuk mengatur durasi, bagian scene, kecepatan, atau memotongnya.
        </p>
        <div className="rounded-xl border border-surface-border bg-surface/60 p-2.5">
          <p className="text-[10px] font-bold text-slate-300 flex items-center gap-1.5 mb-2">
            <Keyboard className="w-3 h-3" /> Shortcut
          </p>
          <div className="space-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[10px]">
                <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border font-mono text-slate-200">{k}</kbd>
                <span className="text-slate-400">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-semibold text-slate-300 flex items-center gap-1">
          {icon}
          {title}
        </span>
        {hint && <span className="font-mono text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-1.5 rounded-md bg-surface border border-surface-border text-[10px] font-mono text-slate-300 hover:text-white hover:border-accent-yellow/50 transition"
    >
      {children}
    </button>
  );
}

function IconBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-surface-hover disabled:opacity-25 flex items-center justify-center"
    >
      {children}
    </button>
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-7 px-2.5 rounded-lg border text-[11px] font-medium inline-flex items-center justify-center gap-1.5 transition disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? "bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
          : active
          ? "bg-accent-yellow/15 border-accent-yellow/50 text-accent-yellow font-semibold"
          : "bg-surface border-surface-border text-slate-300 hover:text-white hover:border-surface-border/80 hover:bg-surface-hover"
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

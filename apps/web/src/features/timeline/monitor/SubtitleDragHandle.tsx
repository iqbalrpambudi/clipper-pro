import { useRef } from "react";
import { SubtitleStyle } from "@/types";

// Same geometry as subtitle_y() in apps/api/app/services/subtitle_ass.py (1080x1920 ASS space).
const H = 1920;
const BOTTOM_BASE = 1700;
const CENTER_BASE = 960;
const Y_MIN = Math.floor(H * 0.16);
const Y_MAX = Math.floor(H * 0.78);

export function subtitleY(style: Pick<SubtitleStyle, "position" | "offset_y">): number {
  const y = style.position === "center" ? CENTER_BASE + style.offset_y : BOTTOM_BASE - style.offset_y;
  return Math.max(Y_MIN, Math.min(Y_MAX, y));
}

function offsetForY(position: SubtitleStyle["position"], y: number): number {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, y));
  return Math.round(position === "center" ? clamped - CENTER_BASE : BOTTOM_BASE - clamped);
}

interface Props {
  style: SubtitleStyle;
  frameHeight: number;
  onChange: (offsetY: number) => void;
  onDragEnd?: () => void;
}

/** Invisible strip over the subtitle; drag it up or down inside the safe band. */
export function SubtitleDragHandle({ style, frameHeight, onChange, onDragEnd }: Props) {
  const start = useRef<{ clientY: number; y: number } | null>(null);
  if (style.enabled === false) return null;

  const y = subtitleY(style);
  const scale = frameHeight / H;

  return (
    <div
      role="slider"
      aria-label="Posisi subtitle"
      aria-valuemin={Y_MIN}
      aria-valuemax={Y_MAX}
      aria-valuenow={y}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        onChange(offsetForY(style.position, y + (e.key === "ArrowUp" ? -20 : 20)));
        onDragEnd?.();
      }}
      onPointerDown={(e) => {
        start.current = { clientY: e.clientY, y };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onChange(offsetForY(style.position, start.current.y + (e.clientY - start.current.clientY) / scale));
      }}
      onPointerUp={() => {
        if (!start.current) return;
        start.current = null;
        onDragEnd?.();
      }}
      className="group absolute left-4 right-4 z-30 flex cursor-ns-resize justify-center"
      style={{
        top: y * scale,
        transform: style.position === "center" ? "translateY(-50%)" : "translateY(-100%)",
      }}
    >
      <div className="h-14 w-full max-w-[280px] rounded-xl border border-dashed border-transparent transition group-hover:border-primary/60 group-focus-visible:border-primary" />
    </div>
  );
}

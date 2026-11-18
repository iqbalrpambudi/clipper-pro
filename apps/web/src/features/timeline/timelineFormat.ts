/** mm:ss:ff timecode at 30 fps */
export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const totalFrames = Math.round(s * 30);
  const ff = totalFrames % 30;
  const totalSec = Math.floor(totalFrames / 30);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}:${String(ff).padStart(2, "0")}`;
}

/** Compact seconds label for rulers and badges */
export function formatSec(sec: number, digits = 1): string {
  return `${sec.toFixed(digits)}s`;
}

export function formatRuler(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export const SCENE_DRAG_MIME = "application/x-cliper-scene";

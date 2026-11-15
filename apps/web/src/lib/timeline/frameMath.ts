/**
 * Frame-accurate math utilities for video composition.
 * Standardizes timeline calculations around discrete 30 FPS integer frames
 * and half-open intervals [startFrame, endFrame) to match FFmpeg rendering.
 */

export const COMPOSITION_FPS = 30;

/** Convert floating-point seconds to nearest integer frame number */
export function secToFrame(sec: number, fps: number = COMPOSITION_FPS): number {
  if (!sec || isNaN(sec) || sec < 0) return 0;
  return Math.round(sec * fps);
}

/** Convert integer frame number to exact floating-point seconds */
export function frameToSec(frame: number, fps: number = COMPOSITION_FPS): number {
  if (!frame || isNaN(frame) || frame < 0) return 0;
  return frame / fps;
}

/** Snap a floating-point seconds value to exact frame-aligned seconds */
export function snapToFrame(sec: number, fps: number = COMPOSITION_FPS): number {
  return frameToSec(secToFrame(sec, fps), fps);
}

/** Half-open interval test: [startFrame, endFrame) */
export function isFrameInInterval(frame: number, startFrame: number, endFrame: number): boolean {
  return frame >= startFrame && frame < endFrame;
}

/**
 * Calculate Ken Burns Dynamic Zoom scale factor matching FFmpeg's zoompan filter:
 * Even index: zoom in from 1.0 to 1.05 (zoom + 0.0008 per frame)
 * Odd index: zoom out from 1.05 down towards 1.0 (zoom - 0.0008 per frame)
 */
export function calculateKenBurnsZoom(
  frameInClip: number,
  isEvenClip: boolean,
  maxZoom: number = 1.05,
  zoomRate: number = 0.0008
): number {
  if (frameInClip <= 0) return isEvenClip ? 1.0 : maxZoom;
  if (isEvenClip) {
    return Math.min(1.0 + frameInClip * zoomRate, maxZoom);
  } else {
    return Math.max(maxZoom - frameInClip * zoomRate, 1.001);
  }
}

/**
 * Filter string for Color Grading matching FFmpeg's:
 * eq=contrast=1.03:saturation=1.04:brightness=0.01
 */
export const COLOR_GRADING_CANVAS_FILTER = "contrast(1.03) saturate(1.04) brightness(1.01)";

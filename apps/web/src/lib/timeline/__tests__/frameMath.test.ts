import { describe, it, expect } from "vitest";
import {
  secToFrame,
  frameToSec,
  snapToFrame,
  isFrameInInterval,
  calculateKenBurnsZoom,
  COMPOSITION_FPS,
} from "../frameMath";

describe("frameMath", () => {
  it("uses 30 FPS composition standard", () => {
    expect(COMPOSITION_FPS).toBe(30);
  });

  it("converts seconds to frames at 30 FPS", () => {
    expect(secToFrame(0)).toBe(0);
    expect(secToFrame(1)).toBe(30);
    expect(secToFrame(1.5)).toBe(45);
    expect(secToFrame(2.0333)).toBe(61);
  });

  it("handles negative and NaN seconds safely", () => {
    expect(secToFrame(-5)).toBe(0);
    expect(secToFrame(NaN)).toBe(0);
  });

  it("converts frames to seconds accurately", () => {
    expect(frameToSec(0)).toBe(0);
    expect(frameToSec(30)).toBe(1);
    expect(frameToSec(45)).toBe(1.5);
    expect(frameToSec(-1)).toBe(0);
  });

  it("snaps floating seconds to exact frame boundaries", () => {
    const raw = 1.016; // slightly off
    const snapped = snapToFrame(raw);
    expect(snapped).toBeCloseTo(30 / 30, 2);
  });

  it("correctly evaluates half-open interval [start, end)", () => {
    expect(isFrameInInterval(0, 0, 30)).toBe(true);
    expect(isFrameInInterval(29, 0, 30)).toBe(true);
    expect(isFrameInInterval(30, 0, 30)).toBe(false); // end is exclusive
    expect(isFrameInInterval(-1, 0, 30)).toBe(false);
  });

  it("calculates Ken Burns dynamic zoom matching FFmpeg zoompan filter", () => {
    // Even clip: zooms in from 1.0 up to maxZoom (1.05)
    expect(calculateKenBurnsZoom(0, true)).toBe(1.0);
    expect(calculateKenBurnsZoom(30, true)).toBeCloseTo(1.0 + 30 * 0.0008, 4);
    expect(calculateKenBurnsZoom(1000, true)).toBe(1.05); // capped at maxZoom

    // Odd clip: zooms out from maxZoom down towards 1.001
    expect(calculateKenBurnsZoom(0, false)).toBe(1.05);
    expect(calculateKenBurnsZoom(30, false)).toBeCloseTo(1.05 - 30 * 0.0008, 4);
    expect(calculateKenBurnsZoom(1000, false)).toBe(1.001); // floor
  });
});

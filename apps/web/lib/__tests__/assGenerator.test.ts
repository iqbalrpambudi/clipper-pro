import { describe, it, expect } from "vitest";
import { hexToAssColor, msToAssTime, generateAssSubtitles } from "../assGenerator";
import type { SentenceSegment } from "../../types";

describe("assGenerator", () => {
  it("converts hex colors to ASS BGR format with full opacity", () => {
    // #FFFFFF -> &H00FFFFFF
    expect(hexToAssColor("#FFFFFF")).toBe("&H00FFFFFF");
    // #FFE600 -> R=FF, G=E6, B=00 -> &H0000E6FF
    expect(hexToAssColor("#FFE600")).toBe("&H0000E6FF");
    // 3-digit hex #FFF -> &H00FFFFFF
    expect(hexToAssColor("#FFF")).toBe("&H00FFFFFF");
  });

  it("converts hex colors with opacity (alpha byte inverted)", () => {
    // Opacity 1.0 -> alpha 00
    expect(hexToAssColor("#000000", 1.0)).toBe("&H00000000");
    // Opacity 0.0 -> alpha FF
    expect(hexToAssColor("#000000", 0.0)).toBe("&HFF000000");
    // Opacity 0.8 -> alpha ~51 (33 hex)
    expect(hexToAssColor("#111111", 0.8)).toBe("&H33111111");
  });

  it("converts milliseconds to ASS timestamp H:MM:SS.CS", () => {
    expect(msToAssTime(0)).toBe("0:00:00.00");
    expect(msToAssTime(1500)).toBe("0:00:01.50");
    expect(msToAssTime(65430)).toBe("0:01:05.43");
  });

  it("generates complete ASS script headers and dialogue events", () => {
    const segments: SentenceSegment[] = [
      {
        id: "seg-1",
        text: "Halo dunia yang indah!",
        start_ms: 500,
        end_ms: 2500,
        words: [
          { word: "Halo", start_ms: 500, end_ms: 1000 },
          { word: "dunia", start_ms: 1000, end_ms: 1800 },
          { word: "yang", start_ms: 1800, end_ms: 2000 },
          { word: "indah!", start_ms: 2000, end_ms: 2500 },
        ],
      },
    ];

    const ass = generateAssSubtitles(
      segments,
      {
        display_mode: "burst",
        burst_word_count: 2,
        font_family: "Bebas Neue",
        font_size: 64,
        primary_color: "#FFFFFF",
        highlight_color: "#00FF66",
        highlight_animation: "scale",
      },
      1080,
      1920
    );

    expect(ass).toContain("[Script Info]");
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(ass).toContain("Style: KaraokeDefault,Bebas Neue");
    expect(ass).toContain("Dialogue:");
  });
});

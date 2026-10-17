import type { SentenceSegment, SubtitleStyle } from "../types";



// Exact font metric compensation ratios between CSS unitsPerEm and libass/FreeType winAscent+winDescent
export const FONT_METRIC_COMPENSATION: Record<string, number> = {
  Anton: 1.72,
  "Bebas Neue": 1.3,
  Inter: 1.39,
  Montserrat: 1.56,
  Oswald: 1.7,
  Poppins: 1.77,
  Roboto: 1.2,
};

export function hexToAssColor(hexStr: string, opacity: number = 1.0): string {
  let clean = (hexStr || "").replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (clean.length !== 6) {
    clean = "FFFFFF";
  }

  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);

  const clampedOpacity = Math.max(0.0, Math.min(1.0, Number(opacity) || 0));
  const aVal = Math.round((1.0 - clampedOpacity) * 255);
  const aHex = aVal.toString(16).padStart(2, "0").toUpperCase();

  return `&H${aHex}${b}${g}${r}`;
}

export function msToAssTime(ms: number): string {
  const safeMs = Math.max(0, ms || 0);
  const totalSec = Math.floor(safeMs / 1000);
  const remMs = safeMs % 1000;
  const cs = Math.floor(remMs / 10);

  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  const pad = (n: number, z = 2) => n.toString().padStart(z, "0");
  return `${hours}:${pad(mins)}:${pad(sec)}.${pad(cs)}`;
}

export function generateAssSubtitles(
  segments: SentenceSegment[],
  styleConfig: Partial<SubtitleStyle>,
  playResX: number = 1080,
  playResY: number = 1920
): string {
  const fontName = styleConfig.font_family || "Montserrat";
  const baseFontSize = Number(styleConfig.font_size || 56);

  let fontComp: number | undefined = FONT_METRIC_COMPENSATION[fontName];
  if (fontComp === undefined) {
    const normName = fontName.trim().toLowerCase();
    for (const [k, v] of Object.entries(FONT_METRIC_COMPENSATION)) {
      if (k.toLowerCase() === normName || normName.includes(k.toLowerCase())) {
        fontComp = v;
        break;
      }
    }
  }
  if (fontComp === undefined) {
    fontComp = 1.5;
  }

  const displayMode = styleConfig.display_mode || "per_word";
  let assFontSize = Math.max(16, Math.round(baseFontSize * fontComp));
  if (displayMode === "full_sentence") {
    // Calibrate with React preview's scaledFontSize * 0.9
    assFontSize = Math.max(16, Math.round(assFontSize * 0.9));
  }
  const bold = (styleConfig.font_weight || "Bold").toLowerCase() === "bold" ? -1 : 0;

  const primaryCol = hexToAssColor(styleConfig.primary_color || "#FFFFFF", 1.0);
  const highlightCol = hexToAssColor(styleConfig.highlight_color || "#FFE600", 1.0);
  const outlineCol = hexToAssColor(styleConfig.outline_color || "#000000", 1.0);

  const boxOpacity = Number(styleConfig.box_opacity ?? 0.0);
  const boxCol = hexToAssColor(styleConfig.box_color || "#000000", boxOpacity);

  // In CSS, -webkit-text-stroke with paint-order: stroke fill conceals half the stroke inside glyph.
  // To match preview thickness, libass outer stroke width is set to half the CSS stroke width:
  const rawOutline = Number(styleConfig.outline_width ?? 4);
  const outlineW = rawOutline > 0 ? Math.max(0.5, Math.round(rawOutline * 0.5 * 10) / 10) : 0;

  const position = styleConfig.position || "bottom";
  const offsetY = Number(styleConfig.offset_y || 0);
  const offsetX = Number(styleConfig.offset_x || 0);

  // Reference PlayResX x PlayResY
  const posX = Math.floor(playResX / 2) + offsetX;
  let align: number;
  let posY: number;

  if (position === "top") {
    align = 8;
    const baseY = Math.round(playResY * 0.09375); // 180 for 1920
    posY = baseY + offsetY;
  } else if (position === "center") {
    align = 5;
    const baseY = Math.floor(playResY / 2); // 960 for 1920
    posY = baseY + offsetY;
  } else {
    // bottom
    align = 2;
    const baseY = Math.round(playResY * (1.0 - 0.1145)); // 1700 for 1920
    posY = baseY - offsetY;
  }

  const posTag = `{\\an${align}\\pos(${posX},${posY})}`;
  const borderStyle = boxOpacity > 0.05 ? 3 : 1;

  const header = `[Script Info]
Title: Cliper Pro Karaoke Subtitle
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraokeDefault,${fontName},${assFontSize},${primaryCol},${highlightCol},${outlineCol},${boxCol},${bold},0,0,0,100,100,0,0,${borderStyle},${outlineW},0,${align},40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];
  const burstCount = Math.max(Number(styleConfig.burst_word_count || 2), 2);
  const anim = styleConfig.highlight_animation || "color";
  const isScaleAnim = anim === "scale";

  const rawScale = Number(styleConfig.scale_factor ?? 1.5) || 1.5;
  const scaleFactor = Math.max(1.0, Math.min(rawScale, 2.5));
  const targetScale = isScaleAnim ? Math.round(scaleFactor * 100) : 100;
  const overshoot = Math.round(targetScale * 1.1);

  const popFx = isScaleAnim
    ? `{\\t(0,60,\\fscx${overshoot}\\fscy${overshoot})\\t(60,120,\\fscx${targetScale}\\fscy${targetScale})}`
    : "";
  const scaleReset = isScaleAnim ? "{\\fscx100\\fscy100}" : "";

  for (const seg of segments || []) {
    const words = seg.words || [];
    if (words.length === 0) continue;

    if (displayMode === "per_word") {
      for (const w of words) {
        const wText = (w.word || "").trim();
        if (!wText) continue;
        const startT = msToAssTime(w.start_ms);
        const endT = msToAssTime(Math.max(w.end_ms, w.start_ms + 150));

        const col = anim === "none" ? primaryCol : highlightCol;
        const coloredText = `${posTag}{\\c${col}}${popFx}${wText.toUpperCase()}${scaleReset}`;
        dialogueLines.push(`Dialogue: 0,${startT},${endT},KaraokeDefault,,0,0,0,,${coloredText}`);
      }
    } else if (displayMode === "burst") {
      for (let i = 0; i < words.length; i += burstCount) {
        const group = words.slice(i, i + burstCount);
        const gEnd = group[group.length - 1].end_ms;
        const kCount = group.length;

        for (let j = 0; j < kCount; j++) {
          const targetWord = group[j];
          const tStart = (i === 0 && j === 0) ? Math.min(seg.start_ms ?? targetWord.start_ms, targetWord.start_ms) : targetWord.start_ms;
          let tEnd: number;

          if (j < kCount - 1) {
            tEnd = Math.min(group[j + 1].start_ms, gEnd);
            if (tEnd <= tStart) {
              tEnd = targetWord.end_ms;
            }
          } else {
            tEnd = Math.max(targetWord.end_ms, gEnd);
          }

          if (tEnd <= tStart) {
            tEnd = tStart + 200;
          }

          const startT = msToAssTime(tStart);
          const endT = msToAssTime(tEnd);

          const lineParts: string[] = [];
          for (let m = 0; m < group.length; m++) {
            const w = group[m];
            const wText = (w.word || "").trim();

            if (m === j) {
              if (anim === "none") {
                lineParts.push(`{\\c${primaryCol}}${scaleReset}${wText.toUpperCase()}`);
              } else {
                lineParts.push(`{\\c${highlightCol}}${popFx}${wText.toUpperCase()}${scaleReset}`);
              }
            } else {
              lineParts.push(`{\\c${primaryCol}}${scaleReset}${wText.toUpperCase()}`);
            }
          }

          dialogueLines.push(
            `Dialogue: 0,${startT},${endT},KaraokeDefault,,0,0,0,,${posTag}${lineParts.join(" ")}`
          );
        }
      }
    } else {
      // full_sentence mode
      const segEnd = seg.end_ms ?? words[words.length - 1].end_ms;
      const nWords = words.length;

      // Compute wrapping breaks to match preview layout (max ~85% width)
      const maxChars = Math.max(24, Math.floor((playResX * 0.85) / (assFontSize * 0.40)));
      const wrapBreaks = new Set<number>();
      let curLen = 0;
      for (let iW = 0; iW < words.length; iW++) {
        const wStr = (words[iW].word || "").trim();
        if (iW === 0) {
          curLen = wStr.length;
        } else {
          if (curLen + 1 + wStr.length > maxChars) {
            wrapBreaks.add(iW);
            curLen = wStr.length;
          } else {
            curLen += 1 + wStr.length;
          }
        }
      }

      for (let j = 0; j < nWords; j++) {
        const targetWord = words[j];
        const tStart = j === 0 ? Math.min(seg.start_ms ?? targetWord.start_ms, targetWord.start_ms) : targetWord.start_ms;
        let tEnd: number;

        if (j < nWords - 1) {
          tEnd = Math.min(words[j + 1].start_ms, segEnd);
          if (tEnd <= tStart) {
            tEnd = targetWord.end_ms;
          }
        } else {
          tEnd = Math.max(targetWord.end_ms, segEnd);
        }

        if (tEnd <= tStart) {
          tEnd = tStart + 200;
        }

        const startT = msToAssTime(tStart);
        const endT = msToAssTime(tEnd);

        const lineParts: string[] = [];
        for (let m = 0; m < words.length; m++) {
          const w = words[m];
          const wText = (w.word || "").trim();
          const prefix = wrapBreaks.has(m) ? "\\N" : (m === 0 ? "" : " ");

          if (m === j) {
            if (anim === "none") {
              lineParts.push(`${prefix}{\\c${primaryCol}}${scaleReset}${wText.toUpperCase()}`);
            } else {
              lineParts.push(`${prefix}{\\c${highlightCol}}${popFx}${wText.toUpperCase()}${scaleReset}`);
            }
          } else {
            lineParts.push(`${prefix}{\\c${primaryCol}}${scaleReset}${wText.toUpperCase()}`);
          }
        }

        dialogueLines.push(
          `Dialogue: 0,${startT},${endT},KaraokeDefault,,0,0,0,,${posTag}${lineParts.join("")}`
        );
      }
    }
  }

  return header + dialogueLines.join("\n") + "\n";
}

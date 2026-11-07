"use client";

import React from "react";
import {
  AbsoluteFill,
  interpolate as remotionInterpolate,
  interpolateColors as remotionInterpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { InterpolateOptions } from "remotion";
import type { LucideIcon } from "lucide-react";
import type { MotionCue, MotionTransitionType } from "@/types";
import type { MotionTheme } from "./themes";

/**
 * Normalize an inputRange array so it is strictly monotonically increasing.
 * Prevents Remotion from throwing runtime exceptions when LLM-generated ranges
 * collide (e.g. [30, 30] or [45, 40]).
 */
function normalizeMonotonicRange(range: readonly number[]): number[] {
  if (!Array.isArray(range) || range.length < 2) {
    return [0, 1];
  }
  const clean: number[] = [];
  for (let i = 0; i < range.length; i++) {
    const raw = Number.isFinite(range[i]) ? range[i] : i;
    if (i === 0) {
      clean.push(raw);
    } else {
      const prev = clean[i - 1];
      clean.push(raw <= prev ? prev + 0.001 : raw);
    }
  }
  return clean;
}

export function safeInterpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: InterpolateOptions
): number;
export function safeInterpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly string[],
  options?: InterpolateOptions
): string;
export function safeInterpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly (number | string)[],
  options?: InterpolateOptions
): number | string {
  const safeInput = Number.isFinite(input) ? input : 0;
  const normIn = normalizeMonotonicRange(inputRange);
  let normOut: (number | string)[] =
    Array.isArray(outputRange) && outputRange.length >= 2
      ? Array.from(outputRange)
      : [0, 1];
  while (normOut.length < normIn.length) {
    normOut.push(normOut[normOut.length - 1] ?? 1);
  }
  if (normOut.length > normIn.length) {
    normOut = normOut.slice(0, normIn.length);
  }
  if (typeof normOut[0] === "string") {
    return remotionInterpolate(
      safeInput,
      normIn,
      normOut.map((v) => String(v)),
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        ...options,
      }
    );
  }
  return remotionInterpolate(
    safeInput,
    normIn,
    normOut.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0)),
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      ...options,
    }
  );
}

export function safeInterpolateColors(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly string[]
): string {
  const safeInput = Number.isFinite(input) ? input : 0;
  const normIn = normalizeMonotonicRange(inputRange);
  let normOut =
    Array.isArray(outputRange) && outputRange.length >= 2
      ? [...outputRange]
      : ["#FFFFFF", "#C45B3A"];
  while (normOut.length < normIn.length) {
    normOut.push(normOut[normOut.length - 1] ?? "#FFFFFF");
  }
  if (normOut.length > normIn.length) {
    normOut = normOut.slice(0, normIn.length);
  }
  return remotionInterpolateColors(safeInput, normIn, normOut);
}

/**
 * Look up the exact scene-relative frame when a spoken keyword occurs in Whisper cues.
 */
export function useCueFrame(
  cues: MotionCue[] | undefined,
  keywordOrIndex: string | number,
  durationInFrames: number = 120,
  fallbackRatio: number = 0.3
): number {
  const safeDur = Math.max(30, durationInFrames || 120);
  const defaultFrame = Math.round(safeDur * Math.min(0.85, Math.max(0.05, fallbackRatio)));

  if (!Array.isArray(cues) || cues.length === 0) {
    if (typeof keywordOrIndex === "number" && keywordOrIndex >= 0 && keywordOrIndex <= 1) {
      return Math.round(safeDur * keywordOrIndex);
    }
    return defaultFrame;
  }

  if (typeof keywordOrIndex === "number") {
    if (keywordOrIndex > 0 && keywordOrIndex < 1) {
      return Math.round(safeDur * keywordOrIndex);
    }
    const idx = Math.min(cues.length - 1, Math.max(0, Math.floor(keywordOrIndex)));
    return cues[idx]?.start_frame ?? defaultFrame;
  }

  const target = String(keywordOrIndex || "")
    .toLowerCase()
    .replace(/[^\w]/g, "");
  if (!target) return defaultFrame;

  const exact = cues.find(
    (c) =>
      String(c.word || "")
        .toLowerCase()
        .replace(/[^\w]/g, "") === target
  );
  if (exact) return exact.start_frame;

  const partial = cues.find((c) => {
    const clean = String(c.word || "")
      .toLowerCase()
      .replace(/[^\w]/g, "");
    return clean.length >= 3 && (clean.includes(target) || target.includes(clean));
  });
  if (partial) return partial.start_frame;

  return defaultFrame;
}

export interface AmbientCanvasProps {
  theme: MotionTheme;
  variant?: "architectural" | "orbs" | "grid" | "constellation" | "radar" | "clouds";
  intensity?: number;
}

export function AmbientCanvas({
  theme,
  variant = "architectural",
  intensity = 1,
}: AmbientCanvasProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const driftX = Math.sin(frame * 0.025) * 28 * intensity;
  const driftY = Math.cos(frame * 0.02) * 20 * intensity;
  const gridShift = (frame * 0.65) % 64;
  const lineAlpha = theme.isDark ? 0.075 : 0.065;
  const glowAlpha = theme.isDark ? "24" : "18";

  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      {/* Soft ambient color pools */}
      <div
        style={{
          position: "absolute",
          width: width * 0.65,
          height: width * 0.65,
          borderRadius: "50%",
          left: -width * 0.15 + driftX,
          top: -height * 0.2 + driftY,
          background: `radial-gradient(circle, ${theme.accent}${glowAlpha} 0%, transparent 68%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.58,
          height: width * 0.58,
          borderRadius: "50%",
          right: -width * 0.14 - driftX,
          bottom: -height * 0.22 - driftY,
          background: `radial-gradient(circle, ${theme.accent2}${glowAlpha} 0%, transparent 68%)`,
        }}
      />

      {/* Coordinate / Blueprint SVG Layer */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {(variant === "architectural" || variant === "grid") && (
          <g opacity={lineAlpha}>
            {Array.from({ length: 18 }).map((_, i) => {
              const x = ((i * width) / 16 + gridShift) % width;
              return (
                <line
                  key={`vx-${i}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={height}
                  stroke={theme.text}
                  strokeWidth={1}
                />
              );
            })}
            {Array.from({ length: 12 }).map((_, i) => {
              const y = ((i * height) / 10 + gridShift * 0.5) % height;
              return (
                <line
                  key={`hy-${i}`}
                  x1={0}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={theme.text}
                  strokeWidth={1}
                />
              );
            })}
          </g>
        )}

        {variant === "radar" && (
          <g
            transform={`translate(${width * 0.5}, ${height * 0.5})`}
            opacity={theme.isDark ? 0.14 : 0.1}
          >
            {[160, 310, 470, 640].map((r, i) => (
              <circle
                key={r}
                r={r}
                fill="none"
                stroke={i % 2 === 0 ? theme.accent : theme.text}
                strokeWidth={1.2}
                strokeDasharray={i % 2 === 0 ? "6 10" : undefined}
                transform={`rotate(${frame * (i % 2 === 0 ? 0.25 : -0.18)})`}
              />
            ))}
          </g>
        )}

        {variant === "constellation" && (
          <g opacity={theme.isDark ? 0.28 : 0.2}>
            {Array.from({ length: 14 }).map((_, i) => {
              const bx = ((i * 293 + 110) % (width - 160)) + 80;
              const by = ((i * 197 + 90) % (height - 160)) + 80;
              const px = bx + Math.sin(frame * 0.03 + i * 1.4) * 18;
              const py = by + Math.cos(frame * 0.025 + i * 1.1) * 14;
              return (
                <circle
                  key={`pt-${i}`}
                  cx={px}
                  cy={py}
                  r={(i % 3) + 2}
                  fill={i % 2 === 0 ? theme.accent : theme.accent2}
                />
              );
            })}
          </g>
        )}

        {/* Corner architectural registration marks */}
        <g stroke={theme.text} strokeOpacity={0.18} strokeWidth={1.5} fill="none">
          <path d="M 36 60 L 36 36 L 60 36" />
          <path d={`M ${width - 60} 36 L ${width - 36} 36 L ${width - 36} 60`} />
          <path d={`M 36 ${height - 60} L 36 ${height - 36} L 60 ${height - 36}`} />
          <path
            d={`M ${width - 60} ${height - 36} L ${width - 36} ${height - 36} L ${width - 36} ${height - 60}`}
          />
        </g>
      </svg>
    </AbsoluteFill>
  );
}

export interface CameraRigProps {
  children: React.ReactNode;
  durationInFrames?: number;
  transition?: MotionTransitionType | string;
  drift?: number;
  zoomFrom?: number;
  zoomTo?: number;
  tilt?: number;
}

export function CameraRig({
  children,
  durationInFrames = 120,
  transition = "camera_push",
  drift = 1,
  zoomFrom = 0.985,
  zoomTo = 1.035,
  tilt = 1,
}: CameraRigProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(30, durationInFrames);

  const enterSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.75 },
  });
  const enterOpacity = safeInterpolate(frame, [0, 9], [0, 1]);

  const exitStart = Math.max(12, dur - 12);
  const exitProgress = safeInterpolate(frame, [exitStart, dur], [0, 1]);

  const baseZoom = safeInterpolate(frame, [0, dur], [zoomFrom, zoomTo]);
  const floatX = Math.sin(frame * 0.035) * 5 * drift;
  const floatY = Math.cos(frame * 0.028) * 4 * drift;
  const rotX = Math.sin(frame * 0.022) * 0.8 * tilt;
  const rotY = Math.cos(frame * 0.019) * 0.9 * tilt;

  let exitScale = 1;
  let exitTranslateY = 0;
  let exitOpacity = 1;
  let clipPath: string | undefined;

  if (transition === "camera_push") {
    exitScale = safeInterpolate(exitProgress, [0, 1], [1, 1.09]);
    exitOpacity = safeInterpolate(exitProgress, [0, 1], [1, 0]);
  } else if (transition === "slide_morph") {
    exitTranslateY = safeInterpolate(exitProgress, [0, 1], [0, -56]);
    exitOpacity = safeInterpolate(exitProgress, [0, 1], [1, 0]);
  } else if (transition === "iris_wipe" && exitProgress > 0.01) {
    const radiusPct = safeInterpolate(exitProgress, [0, 1], [150, 0]);
    clipPath = `circle(${radiusPct}% at 50% 50%)`;
  } else if (transition === "cross_dissolve") {
    exitOpacity = safeInterpolate(exitProgress, [0, 1], [1, 0]);
  }

  const enterScale = safeInterpolate(enterSpring, [0, 1], [0.95, 1]);
  const totalScale = baseZoom * enterScale * exitScale;

  return (
    <AbsoluteFill
      style={{
        opacity: enterOpacity * exitOpacity,
        clipPath,
        transform: `perspective(1400px) translate3d(${floatX}px, ${floatY + exitTranslateY}px, 0) scale(${totalScale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
        transformOrigin: "50% 50%",
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export interface KineticWordsProps {
  text: string;
  startFrame?: number;
  stagger?: number;
  highlightWords?: string[];
  highlightColor?: string;
  color?: string;
  fontWeight?: string | number;
  textWrap?: "balance" | "pretty" | "nowrap" | "wrap";
  theme: MotionTheme;
  size?: number;
  align?: "left" | "center" | "right";
  maxWidth?: number | string;
  style?: React.CSSProperties;
}

export function KineticWords({
  text,
  startFrame = 0,
  stagger = 3,
  highlightWords = [],
  highlightColor,
  color,
  fontWeight,
  textWrap = "balance",
  theme,
  size,
  align = "left",
  maxWidth = "100%",
  style,
}: KineticWordsProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const highlightSet = new Set(
    (highlightWords || []).map((w) => w.toLowerCase().replace(/[^\w]/g, ""))
  );

  // Auto-fit font size if not explicitly provided or if title is long to prevent multi-line vertical blowout
  const effectiveSize =
    size !== undefined
      ? size
      : text.length > 38
      ? 48
      : text.length > 24
      ? 54
      : 62;

  const actualHighlight = highlightColor || theme.accent;
  const actualTextColor = color || theme.text;
  const actualWeight = fontWeight !== undefined ? fontWeight : 800;

  const justify =
    align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: justify,
        gap: `${Math.round(effectiveSize * 0.16)}px ${Math.round(effectiveSize * 0.24)}px`,
        maxWidth,
        width: "100%",
        margin: align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0",
        textAlign: align,
        fontFamily: theme.fontDisplay,
        fontSize: effectiveSize,
        fontWeight: actualWeight,
        lineHeight: 1.12,
        letterSpacing: "-0.025em",
        color: actualTextColor,
        textWrap: textWrap as any,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {words.map((word, idx) => {
        const trigger = startFrame + idx * stagger;
        const sp = spring({
          frame: frame - trigger,
          fps,
          config: { damping: 13, stiffness: 135, mass: 0.65 },
        });
        const opacity = safeInterpolate(frame - trigger, [0, 6], [0, 1]);
        const y = safeInterpolate(sp, [0, 1], [28, 0]);
        const scale = safeInterpolate(sp, [0, 1], [0.88, 1]);

        const clean = word.toLowerCase().replace(/[^\w]/g, "");
        const isHighlighted = highlightSet.has(clean);

        return (
          <span
            key={`${word}-${idx}`}
            style={{
              position: "relative",
              display: "inline-block",
              opacity,
              transform: `translateY(${y}px) scale(${scale})`,
              color: isHighlighted ? actualHighlight : actualTextColor,
            }}
          >
            {word}
            {isHighlighted && (
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  bottom: -4,
                  height: Math.max(4, Math.round(effectiveSize * 0.08)),
                  width: `${safeInterpolate(sp, [0, 1], [0, 100])}%`,
                  backgroundColor: actualHighlight,
                  borderRadius: 99,
                  opacity: 0.85,
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export interface DrawSvgPathProps {
  d: string;
  startFrame?: number;
  durationFrames?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  glow?: boolean;
  pulseDot?: boolean;
  dashed?: boolean;
}

export function DrawSvgPath({
  d,
  startFrame = 0,
  durationFrames = 26,
  stroke = "#C45B3A",
  strokeWidth = 3,
  fill = "none",
  glow = false,
  pulseDot = false,
  dashed = false,
}: DrawSvgPathProps) {
  const frame = useCurrentFrame();
  const progress = safeInterpolate(
    frame,
    [startFrame, startFrame + Math.max(6, durationFrames)],
    [0, 1]
  );

  // Continuous travelling energy pulse along path once drawn
  const pulsePos = ((frame - startFrame) * 0.018) % 1;
  const showPulse = pulseDot && frame >= startFrame + 4;

  return (
    <g>
      {glow && progress > 0 && (
        <path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth * 2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
          opacity={0.22}
        />
      )}
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={dashed ? "0.04 0.03" : 1}
        strokeDashoffset={dashed ? 0 : 1 - progress}
        opacity={dashed ? progress : 1}
      />
      {showPulse && (
        <path
          d={d}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={strokeWidth * 1.45}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.045 0.955"
          strokeDashoffset={1 - Math.max(0, pulsePos)}
          opacity={0.9}
        />
      )}
    </g>
  );
}

/* ── SvgIllustration ── orchestrated multi-layer progressive SVG drawing ── */

export interface SvgIllustrationPathDef {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface SvgIllustrationLayer {
  id: string;
  paths: SvgIllustrationPathDef[];
  drawOrder: number;
}

export interface SvgIllustrationProps {
  viewBox: string;
  layers: SvgIllustrationLayer[];
  startFrame?: number;
  staggerPerGroup?: number;
  drawDurationPerPath?: number;
  style?: React.CSSProperties;
  ambient?: boolean;
}

export function SvgIllustration({
  viewBox,
  layers,
  startFrame = 0,
  staggerPerGroup = 8,
  drawDurationPerPath = 18,
  style,
  ambient = false,
}: SvgIllustrationProps) {
  const frame = useCurrentFrame();

  const sorted = React.useMemo(
    () => [...layers].sort((a, b) => a.drawOrder - b.drawOrder),
    [layers]
  );

  // Assign each drawOrder rank a unique index for stagger timing
  const orderRanks = React.useMemo(() => {
    const ranks = new Map<number, number>();
    let idx = 0;
    for (const l of sorted) {
      if (!ranks.has(l.drawOrder)) ranks.set(l.drawOrder, idx++);
    }
    return ranks;
  }, [sorted]);

  // Ambient breathing after all paths drawn
  const totalDraw =
    startFrame +
    ((orderRanks.size - 1) * staggerPerGroup + drawDurationPerPath);
  const allDone = frame >= totalDraw;
  const breathe = ambient && allDone
    ? 1 + Math.sin((frame - totalDraw) * 0.06) * 0.008
    : 1;
  const floatY = ambient && allDone
    ? Math.sin((frame - totalDraw) * 0.04) * 3
    : 0;

  return (
    <svg
      viewBox={viewBox}
      style={{
        ...style,
        transform: `translateY(${floatY}px) scale(${breathe})`,
        overflow: "visible",
      }}
    >
      {sorted.map((layer) => {
        const rank = orderRanks.get(layer.drawOrder) ?? 0;
        const groupStart = startFrame + rank * staggerPerGroup;
        return (
          <g key={layer.id}>
            {layer.paths.map((p, pi) => {
              const progress = safeInterpolate(
                frame,
                [groupStart, groupStart + Math.max(6, drawDurationPerPath)],
                [0, 1]
              );
              const hasFill = p.fill && p.fill !== "none";
              return (
                <path
                  key={`${layer.id}-${pi}`}
                  d={p.d}
                  fill={hasFill ? p.fill : "none"}
                  fillOpacity={hasFill ? progress : 0}
                  stroke={p.stroke ?? "currentColor"}
                  strokeWidth={p.strokeWidth ?? 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - progress}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

export interface AnimatedConnectorProps {
  from: [number, number];
  to: [number, number];
  curve?: number;
  startFrame?: number;
  durationFrames?: number;
  color?: string;
  strokeWidth?: number;
  dashed?: boolean;
  pulse?: boolean;
  label?: string;
}

export function AnimatedConnector({
  from,
  to,
  curve = 0.2,
  startFrame = 10,
  durationFrames = 22,
  color = "#C45B3A",
  strokeWidth = 2.5,
  dashed = false,
  pulse = true,
  label,
}: AnimatedConnectorProps) {
  const frame = useCurrentFrame();
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * curve;
  const cy = my + dx * curve;

  const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
  const progress = safeInterpolate(
    frame,
    [startFrame, startFrame + Math.max(6, durationFrames)],
    [0, 1]
  );

  // Quadratic bezier point evaluation for travelling signal dot
  const t = progress < 1 ? progress : ((frame - startFrame) * 0.022) % 1;
  const dotX = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
  const dotY = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={dashed ? "0.035 0.025" : 1}
        strokeDashoffset={dashed ? 0 : 1 - progress}
        opacity={dashed ? progress * 0.85 : 0.9}
      />
      {pulse && progress > 0.05 && (
        <>
          <circle cx={dotX} cy={dotY} r={strokeWidth * 2.6} fill={color} opacity={0.28} />
          <circle cx={dotX} cy={dotY} r={strokeWidth * 1.35} fill={color} />
        </>
      )}
      {progress > 0.9 && (
        <circle cx={x2} cy={y2} r={strokeWidth * 1.7} fill={color} opacity={0.95} />
      )}
      {label && progress > 0.5 && (
        <text
          x={cx}
          y={cy - 12}
          textAnchor="middle"
          fill={color}
          fontSize={20}
          fontWeight={700}
          letterSpacing="0.04em"
          opacity={safeInterpolate(progress, [0.5, 1], [0, 1])}
        >
          {label}
        </text>
      )}
    </g>
  );
}

export interface SpringCardProps {
  children: React.ReactNode;
  startFrame?: number;
  delay?: number;
  fromY?: number;
  fromScale?: number;
  theme: MotionTheme;
  accent?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}

export function SpringCard({
  children,
  startFrame = 0,
  delay = 0,
  fromY = 26,
  fromScale = 0.94,
  theme,
  accent,
  glow = false,
  style,
}: SpringCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const trigger = startFrame + delay;

  const sp = spring({
    frame: frame - trigger,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.75 },
  });
  const opacity = safeInterpolate(frame - trigger, [0, 8], [0, 1]);
  const y = safeInterpolate(sp, [0, 1], [fromY, 0]);
  const scale = safeInterpolate(sp, [0, 1], [fromScale, 1]);
  const borderCol = accent ? `${accent}55` : theme.border;

  return (
    <div
      style={{
        backgroundColor: theme.surface,
        border: `1.5px solid ${borderCol}`,
        borderRadius: 20,
        boxShadow: glow
          ? `0 20px 50px rgba(0, 0, 0, ${theme.isDark ? 0.42 : 0.1}), 0 0 32px ${(accent || theme.accent)}24`
          : `0 14px 36px rgba(0, 0, 0, ${theme.isDark ? 0.34 : 0.07})`,
        padding: 28,
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface WindowFrameProps {
  title: string;
  badge?: string;
  startFrame?: number;
  theme: MotionTheme;
  accentColor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function WindowFrame({
  title,
  badge,
  startFrame = 6,
  theme,
  accentColor,
  children,
  style,
}: WindowFrameProps) {
  const accent = accentColor || theme.accent;
  return (
    <SpringCard
      startFrame={startFrame}
      theme={theme}
      accent={accent}
      glow
      style={{ padding: 0, overflow: "hidden", ...style }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          backgroundColor: theme.bgSecondary,
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#EF4444" }}
          />
          <span
            style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#F59E0B" }}
          />
          <span
            style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: "#10B981" }}
          />
          <span
            style={{
              marginLeft: 10,
              fontFamily: theme.fontMono,
              fontSize: 20,
              fontWeight: 600,
              color: theme.textMuted,
            }}
          >
            {title}
          </span>
        </div>
        {badge && (
          <span
            style={{
              padding: "5px 14px",
              borderRadius: 999,
              fontSize: 15,
              fontFamily: theme.fontMono,
              fontWeight: 700,
              backgroundColor: `${accent}22`,
              color: accent,
              border: `1.5px solid ${accent}55`,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <div style={{ padding: 32 }}>{children}</div>
    </SpringCard>
  );
}

export interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  startFrame?: number;
  durationFrames?: number;
  style?: React.CSSProperties;
}

export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  startFrame = 10,
  durationFrames = 34,
  style,
}: AnimatedCounterProps) {
  const frame = useCurrentFrame();
  const progress = safeInterpolate(
    frame,
    [startFrame, startFrame + Math.max(8, durationFrames)],
    [0, 1]
  );
  // Smooth cubic ease-out
  const eased = 1 - Math.pow(1 - progress, 3);
  const current = value * eased;
  const formatted =
    decimals > 0
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString("en-US");

  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        display: "inline-flex",
        alignItems: "baseline",
        ...style,
      }}
    >
      {prefix && <span>{prefix}</span>}
      <span>{formatted}</span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}

export interface RadialRingProps {
  progress: number; // 0..1 or 0..100
  size?: number;
  strokeWidth?: number;
  startFrame?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  theme: MotionTheme;
}

export function RadialRing({
  progress,
  size = 168,
  strokeWidth = 13,
  startFrame = 12,
  color,
  trackColor,
  label,
  sublabel,
  theme,
}: RadialRingProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const normalized = progress > 1 ? Math.min(1, progress / 100) : Math.max(0, progress);
  const sp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 16, stiffness: 85, mass: 0.9 },
  });
  const currentPct = safeInterpolate(sp, [0, 1], [0, normalized]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeCol = color || theme.accent;
  const trackCol = trackColor || theme.border;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackCol}
          strokeWidth={strokeWidth}
          opacity={0.45}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeCol}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - currentPct)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: Math.max(34, Math.round(size * 0.24)),
            fontWeight: 800,
            color: theme.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {label ?? `${Math.round(currentPct * 100)}%`}
        </span>
        {sublabel && (
          <span
            style={{
              fontSize: Math.max(16, Math.round(size * 0.11)),
              color: theme.textMuted,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export interface BadgePillProps {
  text: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  startFrame?: number;
  color?: string;
  theme: MotionTheme;
  pulse?: boolean;
}

export function BadgePill({
  text,
  icon: IconComp,
  startFrame = 0,
  color,
  theme,
  pulse = false,
}: BadgePillProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = color || theme.accent;

  const sp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.6 },
  });
  const pulseOpacity = pulse ? 0.55 + 0.45 * Math.sin(frame * 0.14) : 1;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 22px",
        borderRadius: 999,
        backgroundColor: `${accent}18`,
        border: `1.5px solid ${accent}4D`,
        color: accent,
        fontFamily: theme.fontMono,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        opacity: safeInterpolate(frame - startFrame, [0, 6], [0, 1]),
        transform: `scale(${safeInterpolate(sp, [0, 1], [0.86, 1])})`,
      }}
    >
      {IconComp ? (
        <IconComp size={20} color={accent} />
      ) : (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: accent,
            opacity: pulseOpacity,
          }}
        />
      )}
      <span>{text}</span>
    </div>
  );
}

export interface MotionStageProps {
  children: React.ReactNode;
  orientation?: "portrait" | "landscape" | "square";
  align?: "center" | "flex-start";
  style?: React.CSSProperties;
}

/**
 * Standardized safe-area layout stage for True Claude Motion scenes.
 * Eliminates layout clipping and off-center bugs on both 9:16 and 16:9 canvases.
 */
export function MotionStage({
  children,
  orientation = "portrait",
  align = "center",
  style,
}: MotionStageProps) {
  const isPortrait = orientation === "portrait";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: align,
        padding: isPortrait ? "110px 72px 160px" : "76px 100px",
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface StatCalloutProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label?: string;
  sublabel?: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  startFrame?: number;
  durationFrames?: number;
  theme: MotionTheme;
  accent?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}

/**
 * High-impact, perfectly centered kinetic stat card designed specifically for 1080p video.
 */
export function StatCallout({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  label,
  sublabel,
  icon: IconComp,
  startFrame = 12,
  durationFrames = 30,
  theme,
  accent,
  glow = true,
  style,
}: StatCalloutProps) {
  const accentCol = accent || theme.accent;
  return (
    <SpringCard
      startFrame={startFrame}
      theme={theme}
      accent={accentCol}
      glow={glow}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "32px 40px",
        gap: 12,
        ...style,
      }}
    >
      {IconComp && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 56,
            height: 56,
            borderRadius: 16,
            backgroundColor: `${accentCol}20`,
            marginBottom: 4,
          }}
        >
          <IconComp size={30} color={accentCol} />
        </div>
      )}
      <AnimatedCounter
        value={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        startFrame={startFrame + 4}
        durationFrames={durationFrames}
        style={{
          fontSize: 78,
          fontWeight: 900,
          color: accentCol,
          fontFamily: theme.fontDisplay,
          lineHeight: 1,
        }}
      />
      {label && (
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 26,
            fontWeight: 700,
            color: theme.text,
            letterSpacing: "-0.01em",
          }}
        >
          {label}
        </div>
      )}
      {sublabel && (
        <div
          style={{
            fontFamily: theme.fontBody,
            fontSize: 20,
            fontWeight: 500,
            color: theme.textMuted,
            maxWidth: 380,
          }}
        >
          {sublabel}
        </div>
      )}
    </SpringCard>
  );
}

// =====================================================================
// 2.5D ISOMETRIC DIORAMA WORLD & EDITORIAL HUD PRIMITIVES (AISHIFT / CLAUDE STYLE)
// =====================================================================

export interface CloudSkyBackdropProps {
  theme?: MotionTheme;
  mood?: "day" | "alert" | "night";
  cloudCount?: number;
}

/**
 * Warm tactile sky backdrop with drifting 2.5D volumetric clouds and optional alert vignette.
 */
export function CloudSkyBackdrop({
  theme,
  mood = "day",
  cloudCount = 6,
}: CloudSkyBackdropProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const isDarkSky = mood === "night" || Boolean(theme?.isDark && mood !== "day");
  const bgGradient = isDarkSky
    ? "linear-gradient(180deg, #0F131D 0%, #171D2B 55%, #1E2536 100%)"
    : "linear-gradient(180deg, #EFEAE2 0%, #E3DDD1 55%, #D6CEC0 100%)";

  const clouds = [
    { x: 0.14, y: 0.34, scale: 1.05, speed: 0.32, alpha: 0.92 },
    { x: 0.78, y: 0.28, scale: 0.88, speed: -0.26, alpha: 0.86 },
    { x: 0.52, y: 0.52, scale: 1.22, speed: 0.22, alpha: 0.88 },
    { x: 0.18, y: 0.68, scale: 0.95, speed: -0.2, alpha: 0.84 },
    { x: 0.82, y: 0.74, scale: 1.12, speed: 0.28, alpha: 0.9 },
    { x: 0.44, y: 0.86, scale: 1.0, speed: -0.18, alpha: 0.8 },
  ].slice(0, Math.max(2, Math.min(6, cloudCount)));

  const alertPulse = mood === "alert" ? 0.55 + 0.35 * Math.sin(frame * 0.12) : 0;

  return (
    <AbsoluteFill style={{ background: bgGradient, overflow: "hidden", pointerEvents: "none" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        {clouds.map((c, idx) => {
          const cx =
            ((c.x * width + frame * c.speed + width * 2) % (width + 460)) - 230;
          const cy = c.y * height + Math.sin(frame * 0.03 + idx * 1.7) * 8;
          const fillMain = isDarkSky ? "#263044" : "#F8F6F1";
          const fillShade = isDarkSky ? "#1B2333" : "#E5DFD3";
          return (
            <g
              key={idx}
              transform={`translate(${cx}, ${cy}) scale(${c.scale})`}
              opacity={c.alpha}
            >
              {/* Cloud soft drop shadow */}
              <ellipse cx={0} cy={34} rx={148} ry={26} fill="#000000" opacity={0.06} />
              {/* Underside 2.5D shading */}
              <rect x={-130} y={-8} width={260} height={34} rx={17} fill={fillShade} />
              {/* Main fluffy lobes */}
              <circle cx={-74} cy={-10} r={42} fill={fillMain} />
              <circle cx={-12} cy={-26} r={58} fill={fillMain} />
              <circle cx={58} cy={-14} r={48} fill={fillMain} />
              <circle cx={102} cy={0} r={32} fill={fillMain} />
              <rect x={-118} y={-16} width={236} height={34} rx={17} fill={fillMain} />
            </g>
          );
        })}
      </svg>

      {mood === "alert" && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(circle at 50% 55%, transparent 38%, rgba(185, 20, 20, 0.52) 100%)",
            opacity: alertPulse,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

export interface HighlightBlockLine {
  text: string;
  variant?: "white" | "red" | "dark" | "plain";
  size?: number;
}

export interface HighlightBlockTitleProps {
  lines: Array<string | HighlightBlockLine>;
  highlightIndex?: number;
  subtext?: string;
  startFrame?: number;
  stagger?: number;
  theme: MotionTheme;
  style?: React.CSSProperties;
}

/**
 * Stacked block-pill headline ("APA JADINYA KALAU" [white] / "4 AI DIKASIH KOTA" [red] / "TANPA MANUSIA?" [white]).
 */
export function HighlightBlockTitle({
  lines,
  highlightIndex = 1,
  subtext,
  startFrame = 2,
  stagger = 8,
  theme,
  style,
}: HighlightBlockTitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const normalized: HighlightBlockLine[] = (lines || []).map((item, idx) => {
    if (typeof item === "string") {
      return {
        text: item,
        variant: idx === highlightIndex ? "red" : "white",
      };
    }
    return {
      text: item.text,
      variant: item.variant || (idx === highlightIndex ? "red" : "white"),
      size: item.size,
    };
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        width: "100%",
        zIndex: 10,
        ...style,
      }}
    >
      {normalized.map((line, idx) => {
        const trigger = startFrame + idx * stagger;
        const sp = spring({
          frame: frame - trigger,
          fps,
          config: { damping: 13, stiffness: 150, mass: 0.65 },
        });
        const opacity = safeInterpolate(frame - trigger, [0, 6], [0, 1]);
        const scale = safeInterpolate(sp, [0, 1], [0.82, 1]);
        const y = safeInterpolate(sp, [0, 1], [24, 0]);

        const v = line.variant || "white";
        const bg =
          v === "red"
            ? "#D91B1B"
            : v === "dark"
              ? "#231F20"
              : v === "white"
                ? "#FFFFFF"
                : "transparent";
        const col =
          v === "red" || v === "dark"
            ? "#FFFFFF"
            : v === "white"
              ? "#18181B"
              : theme.text;
        const shadow =
          v === "red"
            ? "0 14px 32px rgba(217, 27, 27, 0.30)"
            : v === "white" || v === "dark"
              ? "0 12px 30px rgba(0, 0, 0, 0.10)"
              : "none";

        return (
          <div
            key={`${line.text}-${idx}`}
            style={{
              backgroundColor: bg,
              color: col,
              padding: v === "plain" ? "2px 12px" : "12px 30px",
              borderRadius: 16,
              boxShadow: shadow,
              fontFamily: theme.fontDisplay,
              fontSize: line.size || (v === "red" ? 56 : 48),
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              textAlign: "center",
              opacity,
              transform: `translateY(${y}px) scale(${scale})`,
            }}
          >
            {line.text}
          </div>
        );
      })}
      {subtext && (
        <div
          style={{
            marginTop: 6,
            fontFamily: theme.fontBody,
            fontSize: 28,
            fontWeight: 600,
            color: theme.textMuted,
            textAlign: "center",
            opacity: safeInterpolate(
              frame - (startFrame + normalized.length * stagger),
              [0, 10],
              [0, 1]
            ),
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
}

export interface NotificationItem {
  badge: string;
  badgeColor?: string;
  title: string;
  subtitle?: string;
  startFrame?: number;
}

export interface NotificationStackProps {
  items: NotificationItem[];
  startFrame?: number;
  stagger?: number;
  theme: MotionTheme;
  style?: React.CSSProperties;
}

/**
 * Progressive stacked editorial notification cards (e.g., [!] Hancur dalam 4 hari, [0] Nol pelanggaran, [?] Yang paling baik?).
 */
export function NotificationStack({
  items,
  startFrame = 6,
  stagger = 20,
  theme,
  style,
}: NotificationStackProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        width: "100%",
        maxWidth: 780,
        margin: "0 auto",
        zIndex: 10,
        ...style,
      }}
    >
      {(items || []).map((item, idx) => {
        const trigger = item.startFrame ?? startFrame + idx * stagger;
        const sp = spring({
          frame: frame - trigger,
          fps,
          config: { damping: 14, stiffness: 140, mass: 0.7 },
        });
        const opacity = safeInterpolate(frame - trigger, [0, 7], [0, 1]);
        const y = safeInterpolate(sp, [0, 1], [28, 0]);
        const scale = safeInterpolate(sp, [0, 1], [0.92, 1]);
        const badgeBg =
          item.badgeColor ||
          (idx === 0 ? "#18181B" : idx === 1 ? "#16A34A" : "#D91B1B");

        return (
          <div
            key={`${item.title}-${idx}`}
            style={{
              width: "100%",
              backgroundColor: "#FFFFFF",
              borderRadius: 24,
              padding: "20px 28px",
              display: "flex",
              alignItems: "center",
              gap: 22,
              boxShadow: "0 14px 36px rgba(0, 0, 0, 0.09)",
              border: "1.5px solid rgba(0,0,0,0.05)",
              opacity,
              transform: `translateY(${y}px) scale(${scale})`,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 16,
                backgroundColor: badgeBg,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme.fontDisplay,
                fontSize: 32,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {item.badge}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left" }}>
              <div
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 32,
                  fontWeight: 800,
                  color: "#18181B",
                  lineHeight: 1.15,
                }}
              >
                {item.title}
              </div>
              {item.subtitle && (
                <div
                  style={{
                    fontFamily: theme.fontBody,
                    fontSize: 23,
                    fontWeight: 500,
                    color: "#6B665E",
                  }}
                >
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface TelemetryMetricColumn {
  label: string;
  value?: string | number;
  fromValue?: number;
  toValue?: number;
  startFrame?: number;
  durationFrames?: number;
  color?: string;
  suffix?: string;
}

export interface TelemetryScoreboardProps {
  title: string;
  badgeColor?: string;
  metrics: TelemetryMetricColumn[];
  caption?: string;
  startFrame?: number;
  dimmed?: boolean;
  theme: MotionTheme;
  style?: React.CSSProperties;
}

/**
 * Dark charcoal floating telemetry scoreboard HUD ("KOTA GROK | HARI KE- 4 | KEJAHATAN 183 | STATUS KACAU").
 */
export function TelemetryScoreboard({
  title,
  badgeColor = "#38BDF8",
  metrics,
  caption,
  startFrame = 4,
  dimmed = false,
  theme,
  style,
}: TelemetryScoreboardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 135, mass: 0.7 },
  });
  const opacity = safeInterpolate(frame - startFrame, [0, 7], [0, 1]) * (dimmed ? 0.45 : 1);
  const y = safeInterpolate(sp, [0, 1], [-26, 0]);
  const scale = safeInterpolate(sp, [0, 1], [0.92, 1]);

  return (
    <div
      style={{
        backgroundColor: "#231F20",
        color: "#FFFFFF",
        borderRadius: 24,
        padding: "24px 32px",
        width: "100%",
        maxWidth: 680,
        boxShadow: "0 20px 44px rgba(0, 0, 0, 0.24)",
        border: "1.5px solid rgba(255, 255, 255, 0.1)",
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        boxSizing: "border-box",
        zIndex: 12,
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            backgroundColor: badgeColor,
            display: "inline-block",
            boxShadow: `0 0 12px ${badgeColor}`,
          }}
        />
        <span
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(1, (metrics || []).length)}, 1fr)`,
          gap: 20,
          alignItems: "end",
        }}
      >
        {(metrics || []).map((m, idx) => {
          let displayVal: React.ReactNode = m.value ?? "0";
          if (typeof m.toValue === "number") {
            const mStart = m.startFrame ?? startFrame + 8;
            const mDur = Math.max(8, m.durationFrames ?? 32);
            const prog = safeInterpolate(frame, [mStart, mStart + mDur], [0, 1]);
            const eased = 1 - Math.pow(1 - prog, 3);
            const cur = Math.round((m.fromValue ?? 0) + (m.toValue - (m.fromValue ?? 0)) * eased);
            displayVal = `${cur}${m.suffix || ""}`;
          }
          return (
            <div key={`${m.label}-${idx}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontFamily: theme.fontMono,
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#A1A1AA",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {m.label}
              </span>
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 48,
                  fontWeight: 900,
                  color: m.color || "#FFFFFF",
                  lineHeight: 1.05,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {displayVal}
              </span>
            </div>
          );
        })}
      </div>

      {caption && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid rgba(255, 255, 255, 0.1)",
            fontFamily: theme.fontBody,
            fontSize: 22,
            fontStyle: "italic",
            fontWeight: 600,
            color: "#D4D4D8",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}

export interface ChecklistRow {
  label: string;
  type?: "check" | "cross" | "bar";
  barFrom?: number;
  barTo?: number;
  barColor?: string;
  startFrame?: number;
}

export interface ChecklistCardProps {
  title: string;
  rows: ChecklistRow[];
  actionButtons?: string[];
  buttonsFrame?: number;
  startFrame?: number;
  stagger?: number;
  theme: MotionTheme;
  style?: React.CSSProperties;
}

/**
 * Clean white inspector/rulebook card with progressive checkmarks, red X rules, draining energy bars, and 3D red push buttons.
 */
export function ChecklistCard({
  title,
  rows,
  actionButtons,
  buttonsFrame = 42,
  startFrame = 6,
  stagger = 14,
  theme,
  style,
}: ChecklistCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardSp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 14, stiffness: 135, mass: 0.7 },
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        width: "100%",
        maxWidth: 740,
        zIndex: 12,
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          backgroundColor: "#FFFFFF",
          borderRadius: 26,
          padding: "26px 34px",
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.09)",
          border: "1.5px solid rgba(0,0,0,0.06)",
          opacity: safeInterpolate(frame - startFrame, [0, 7], [0, 1]),
          transform: `scale(${safeInterpolate(cardSp, [0, 1], [0.92, 1])})`,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 20,
            fontWeight: 800,
            color: "#71717A",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(rows || []).map((r, idx) => {
            const rStart = r.startFrame ?? startFrame + 8 + idx * stagger;
            const rOpacity = safeInterpolate(frame - rStart, [0, 7], [0, 1]);
            const rX = safeInterpolate(frame - rStart, [0, 10], [-16, 0]);
            const rType = r.type || "check";

            const barPct =
              rType === "bar"
                ? safeInterpolate(
                    frame,
                    [rStart, rStart + 45],
                    [r.barFrom ?? 88, r.barTo ?? 24]
                  )
                : 100;

            return (
              <div
                key={`${r.label}-${idx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 18,
                  opacity: rOpacity,
                  transform: `translateX(${rX}px)`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {rType === "cross" && (
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        backgroundColor: "#D91B1B",
                        color: "#FFFFFF",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 20,
                        fontWeight: 900,
                        flexShrink: 0,
                      }}
                    >
                      ✕
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: theme.fontDisplay,
                      fontSize: 30,
                      fontWeight: 800,
                      color: "#18181B",
                    }}
                  >
                    {r.label}
                  </span>
                </div>

                {rType === "check" && (
                  <span style={{ fontSize: 30, fontWeight: 900, color: "#16A34A" }}>✓</span>
                )}

                {rType === "bar" && (
                  <div
                    style={{
                      width: 190,
                      height: 20,
                      borderRadius: 999,
                      backgroundColor: "#E4E4E7",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${barPct}%`,
                        height: "100%",
                        borderRadius: 999,
                        backgroundColor: r.barColor || "#D91B1B",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {actionButtons && actionButtons.length > 0 && frame >= buttonsFrame && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 36 }}>
          {actionButtons.map((btn, idx) => {
            const bTrigger = buttonsFrame + idx * 6;
            const bSp = spring({
              frame: frame - bTrigger,
              fps,
              config: { damping: 10, stiffness: 170, mass: 0.6 },
            });
            const pressBob = Math.sin((frame - bTrigger) * 0.18) * 3;
            return (
              <div
                key={`${btn}-${idx}`}
                style={{
                  width: 190,
                  height: 190,
                  borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 30%, #FF4D4D 0%, #D91B1B 65%, #991B1B 100%)",
                  boxShadow: "0 14px 0 #7F1D1D, 0 24px 38px rgba(0,0,0,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: theme.fontDisplay,
                  fontSize: 36,
                  fontWeight: 900,
                  color: "#FFFFFF",
                  letterSpacing: "0.02em",
                  transform: `scale(${safeInterpolate(bSp, [0, 1], [0.2, 1])}) translateY(${pressBob}px)`,
                }}
              >
                {btn}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface IsometricIslandProps {
  x?: number;
  y?: number;
  scale?: number;
  label?: string;
  roofColor?: string;
  agentColor?: string;
  agentsCount?: number;
  agentState?: "normal" | "chaos" | "fallen" | "stealing";
  burning?: boolean;
  emblem?: "grok" | "gemini" | "chatgpt" | "claude" | "mixed";
  startFrame?: number;
}

/**
 * 2.5D Floating Isometric City Diorama with houses, trees, central billboard, and living capsule agents!
 */
export function IsometricIsland({
  x = 540,
  y = 1080,
  scale = 1,
  label = "Claude",
  roofColor = "#E07A5F",
  agentColor = "#C86D51",
  agentsCount = 6,
  agentState = "normal",
  burning = false,
  emblem = "claude",
  startFrame = 0,
}: IsometricIslandProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterSp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 15, stiffness: 110, mass: 0.85 },
  });
  const enterScale = safeInterpolate(enterSp, [0, 1], [0.75, 1]) * scale;
  const floatY = Math.sin(frame * 0.045 + x * 0.01) * 7;

  // 6 isometric houses arranged in an ellipse around the central billboard
  const houses = [
    { hx: -165, hy: -52 },
    { hx: 165, hy: -52 },
    { hx: -205, hy: 18 },
    { hx: 205, hy: 18 },
    { hx: -118, hy: 82 },
    { hx: 118, hy: 82 },
  ];

  const trees = [
    { tx: -75, ty: -88, s: 0.9 },
    { tx: 78, ty: -88, s: 0.9 },
    { tx: -238, ty: -18, s: 0.85 },
    { tx: 238, ty: -18, s: 0.85 },
    { tx: 0, ty: 108, s: 0.95 },
  ];

  const count = Math.max(1, Math.min(10, agentsCount));

  return (
    <g transform={`translate(${x}, ${y + floatY}) scale(${enterScale})`}>
      {/* Floating island shadow on sky */}
      <ellipse cx={0} cy={195} rx={210} ry={48} fill="#000000" opacity={0.12} />

      {/* 3D Inverted Faceted Rock Cone Underneath */}
      <polygon points="-255,20 0,185 -65,20" fill="#6E5547" />
      <polygon points="-65,20 0,185 75,20" fill="#5D463A" />
      <polygon points="75,20 0,185 255,20" fill="#4B372D" />

      {/* Green Grass Cylinder Rim & Top Surface */}
      <ellipse cx={0} cy={22} rx={268} ry={116} fill="#76AD46" />
      <rect x={-268} y={0} width={536} height={22} fill="#76AD46" />
      <ellipse cx={0} cy={0} rx={268} ry={116} fill="#9BD368" />

      {/* Inner Central Plaza Circle */}
      <ellipse cx={0} cy={6} rx={118} ry={52} fill="#E6DEC8" />

      {/* Conical 3D Pine Trees */}
      {trees.map((t, idx) => (
        <g key={`tree-${idx}`} transform={`translate(${t.tx}, ${t.ty}) scale(${t.s})`}>
          <ellipse cx={0} cy={14} rx={14} ry={6} fill="#000000" opacity={0.15} />
          <rect x={-3.5} y={2} width={7} height={12} fill="#5C4033" />
          <polygon points="0,-34 -18,4 18,4" fill="#2E7D32" />
          <polygon points="0,-34 0,4 18,4" fill="#1B5E20" />
        </g>
      ))}

      {/* Isometric 3D Houses */}
      {houses.map((h, idx) => {
        const flicker = Math.sin(frame * 0.45 + idx * 2.1) * 4;
        return (
          <g key={`house-${idx}`} transform={`translate(${h.hx}, ${h.hy})`}>
            {/* House Shadow */}
            <ellipse cx={0} cy={18} rx={36} ry={14} fill="#000000" opacity={0.16} />
            {/* Front Left Wall */}
            <polygon points="-26,-4 0,10 0,32 -26,18" fill="#F5F2EB" />
            {/* Side Right Wall */}
            <polygon points="0,10 26,-4 26,18 0,32" fill="#DED8CC" />
            {/* Door */}
            <polygon points="8,28 16,24 16,12 8,16" fill="#4A3F35" />
            {/* 3D Pitched Roof */}
            <polygon points="-30,-4 0,-28 0,10 -30,-4" fill={roofColor} />
            <polygon points="0,-28 30,-4 0,10 0,-28" fill={roofColor} opacity={0.86} />

            {/* Burning Fire Effect on Roof when burning=true */}
            {burning && (
              <g transform={`translate(0, ${-22 + flicker * 0.4})`}>
                <circle cx={0} cy={-8} r={22} fill="#F97316" opacity={0.28} />
                <polygon
                  points={`-14,6 0,${-26 + flicker} 14,6`}
                  fill="#EF4444"
                />
                <polygon
                  points={`-8,6 0,${-16 - flicker * 0.5} 8,6`}
                  fill="#FACC15"
                />
              </g>
            )}
          </g>
        );
      })}

      {/* Central 2-Post Billboard Sign */}
      <g transform="translate(0, -18)">
        <rect x={-34} y={-8} width={6} height={36} rx={2} fill="#5C4D42" />
        <rect x={28} y={-8} width={6} height={36} rx={2} fill="#5C4D42" />
        <rect
          x={-54}
          y={-64}
          width={108}
          height={62}
          rx={8}
          fill="#FFFFFF"
          stroke="#27272A"
          strokeWidth={3.5}
        />
        {/* Faction Emblem inside Billboard */}
        {emblem === "claude" && (
          <g transform="translate(0, -33)">
            {Array.from({ length: 6 }).map((_, i) => (
              <line
                key={i}
                x1={-16}
                y1={0}
                x2={16}
                y2={0}
                stroke="#D96B43"
                strokeWidth={3.2}
                strokeLinecap="round"
                transform={`rotate(${i * 30})`}
              />
            ))}
          </g>
        )}
        {emblem === "gemini" && (
          <path
            d="M 0 -52 Q 3 -33 22 -33 Q 3 -33 0 -14 Q -3 -33 -22 -33 Q -3 -33 0 -52 Z"
            fill="#3B82F6"
          />
        )}
        {emblem === "grok" && (
          <g transform="translate(0, -33)">
            <circle cx={0} cy={0} r={14} fill="none" stroke="#18181B" strokeWidth={3.5} />
            <line x1={-14} y1={14} x2={14} y2={-14} stroke="#18181B" strokeWidth={3.5} />
          </g>
        )}
        {emblem === "chatgpt" && (
          <g transform="translate(0, -33)">
            <circle cx={0} cy={0} r={15} fill="none" stroke="#10B981" strokeWidth={3.2} strokeDasharray="6 3" />
            <circle cx={0} cy={0} r={6} fill="none" stroke="#10B981" strokeWidth={2.5} />
          </g>
        )}
        {emblem === "mixed" && (
          <g transform="translate(0, -33)">
            <circle cx={-18} cy={-10} r={7} fill="#18181B" />
            <circle cx={18} cy={-10} r={7} fill="#3B82F6" />
            <circle cx={-18} cy={10} r={7} fill="#10B981" />
            <circle cx={18} cy={10} r={7} fill="#D96B43" />
          </g>
        )}
      </g>

      {/* Living Capsule / Bean Agents Moving on Plaza */}
      {Array.from({ length: count }).map((_, idx) => {
        const angle =
          (idx / count) * Math.PI * 2 +
          (agentState === "fallen" ? 0.2 : frame * (agentState === "chaos" ? 0.045 : 0.02));
        const radiusX = 76 + (idx % 2) * 28;
        const radiusY = 30 + (idx % 2) * 14;
        const ax = Math.cos(angle) * radiusX;
        const ay = 14 + Math.sin(angle) * radiusY;
        const hop =
          agentState === "fallen"
            ? 0
            : Math.abs(Math.sin(frame * 0.18 + idx * 1.3)) * -7;

        const isFallen = agentState === "fallen";
        const isChaos = agentState === "chaos" && idx % 2 === 0;
        const isStealing = agentState === "stealing" && idx === 0;
        const bodyCol = isFallen
          ? "#9CA3AF"
          : isStealing
            ? "#EF4444"
            : agentColor;

        return (
          <g key={`agent-${idx}`} transform={`translate(${ax}, ${ay + hop})`}>
            {/* Hostile / Spotlight Ground Ring */}
            {(isChaos || isStealing) && (
              <ellipse
                cx={0}
                cy={12}
                rx={24 + Math.sin(frame * 0.2) * 4}
                ry={11}
                fill="none"
                stroke="#EF4444"
                strokeWidth={2.5}
                opacity={0.85}
              />
            )}
            {/* Agent Shadow */}
            <ellipse cx={0} cy={12} rx={12} ry={5} fill="#000000" opacity={0.22} />

            {/* Capsule Body (tips 90deg when fallen) */}
            <g transform={isFallen ? "translate(0, 6) rotate(86)" : undefined}>
              <rect
                x={-11}
                y={-16}
                width={22}
                height={28}
                rx={11}
                fill={bodyCol}
              />
              {/* 3D Specular Highlight on Capsule */}
              <ellipse cx={-4} cy={-8} rx={3.5} ry={6} fill="#FFFFFF" opacity={0.28} />
              {/* Expressive Eyes */}
              <circle cx={-4} cy={-5} r={3.6} fill="#FFFFFF" />
              <circle cx={4} cy={-5} r={3.6} fill="#FFFFFF" />
              <circle cx={-3.2} cy={-5} r={1.8} fill="#18181B" />
              <circle cx={4.8} cy={-5} r={1.8} fill="#18181B" />
            </g>

            {/* Spinning Gold Coin when stealing */}
            {isStealing && (
              <g transform={`translate(0, ${-28 + Math.sin(frame * 0.25) * 6})`}>
                <ellipse
                  cx={0}
                  cy={0}
                  rx={Math.max(3, Math.abs(Math.cos(frame * 0.2)) * 12)}
                  ry={12}
                  fill="#FBBF24"
                  stroke="#D97706"
                  strokeWidth={2}
                />
              </g>
            )}
          </g>
        );
      })}

      {/* Floating Pill Label Above Island */}
      {label && (
        <g transform={`translate(0, ${-108 + Math.sin(frame * 0.08) * 4})`}>
          <rect
            x={-78}
            y={-22}
            width={156}
            height={42}
            rx={21}
            fill="#FFFFFF"
            stroke="#E4E4E7"
            strokeWidth={1.5}
          />
          <circle cx={-46} cy={-1} r={8} fill={roofColor} />
          <text
            x={8}
            y={6}
            textAnchor="middle"
            fill="#18181B"
            fontSize={22}
            fontWeight={800}
            fontFamily="'Inter', sans-serif"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

export interface ImpactStampProps {
  text: string;
  subtext?: string;
  startFrame?: number;
  color?: string;
  variant?: "stamp" | "stat";
  theme: MotionTheme;
}

/**
 * Dramatic center overlay: either a tilted rubber stamp ("[TAMAT]") or giant focal stat ("10/10 HIDUP SAMPAI AKHIR").
 */
export function ImpactStamp({
  text,
  subtext,
  startFrame = 45,
  color = "#D91B1B",
  variant = "stamp",
  theme,
}: ImpactStampProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (frame < startFrame) return null;

  const sp = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 11, stiffness: 180, mass: 0.6 },
  });
  const scale = safeInterpolate(sp, [0, 1], [2.1, 1]);
  const opacity = safeInterpolate(frame - startFrame, [0, 5], [0, 1]);

  if (variant === "stat") {
    return (
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          zIndex: 25,
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: 112,
            fontWeight: 900,
            color: "#FFFFFF",
            textShadow: "0 10px 34px rgba(0,0,0,0.35)",
            lineHeight: 1,
          }}
        >
          {text}
        </div>
        {subtext && (
          <div
            style={{
              marginTop: 12,
              backgroundColor: color,
              color: "#FFFFFF",
              padding: "10px 28px",
              borderRadius: 14,
              fontFamily: theme.fontDisplay,
              fontSize: 38,
              fontWeight: 900,
              boxShadow: "0 12px 28px rgba(0,0,0,0.22)",
            }}
          >
            {subtext}
          </div>
        )}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 25,
        opacity,
        transform: `rotate(-9deg) scale(${scale})`,
      }}
    >
      <div
        style={{
          border: `7px solid ${color}`,
          borderRadius: 18,
          padding: "16px 48px",
          backgroundColor: "rgba(255, 255, 255, 0.92)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)",
          fontFamily: theme.fontDisplay,
          fontSize: 82,
          fontWeight: 900,
          color,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

// =========================================================================
// HIGH-CRAFT SEMANTIC MOTION PRIMITIVES & DETERMINISTIC SLOT GRIDS
// (Package 1: Anti-Overlap, Safe-Zones, Optical Balance & Single Focus)
// =========================================================================

export const SPRING_PRESETS = {
  editorial: { damping: 18, stiffness: 120, mass: 0.85 },
  snappy: { damping: 15, stiffness: 220, mass: 0.6 },
  impact: { damping: 13, stiffness: 290, mass: 0.75 },
  gentle: { damping: 24, stiffness: 90, mass: 1.1 },
} as const;

export interface SceneGridLayoutProps {
  eyebrow?: React.ReactNode;
  headline?: React.ReactNode;
  subheadline?: React.ReactNode;
  stage: React.ReactNode;
  footer?: React.ReactNode;
  orientation?: "portrait" | "landscape" | "square";
  theme?: MotionTheme;
  subtitleSafeZone?: boolean;
  align?: "center" | "flex-start";
  style?: React.CSSProperties;
}

/**
 * Deterministic 3-zone slot grid.
 * Guaranteed zero vertical overlap between header, hero visual, and footer HUD.
 * Features an automatic 240px Subtitle Safe-Zone on 9:16 portrait.
 */
export function SceneGridLayout({
  eyebrow,
  headline,
  subheadline,
  stage,
  footer,
  orientation = "portrait",
  subtitleSafeZone = true,
  align = "center",
  style,
}: SceneGridLayoutProps) {
  const isPortrait = orientation === "portrait";

  return (
    <div
      data-motion-slot="root-grid"
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        gridTemplateRows: isPortrait
          ? "auto minmax(0, 1fr) auto"
          : "auto minmax(0, 1fr) auto",
        paddingTop: isPortrait ? 100 : 64,
        paddingLeft: isPortrait ? 64 : 88,
        paddingRight: isPortrait ? 64 : 88,
        paddingBottom: isPortrait
          ? subtitleSafeZone
            ? 250 // Dedicated Subtitle Safe Zone for 9:16 vertical video
            : 130
          : 64,
        boxSizing: "border-box",
        overflow: "hidden",
        position: "relative",
        gap: isPortrait ? 22 : 18,
        ...style,
      }}
    >
      {/* HEADER SLOT */}
      {(eyebrow || headline || subheadline) && (
        <div
          data-motion-slot="header"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: align === "center" ? "center" : "flex-start",
            textAlign: align === "center" ? "center" : "left",
            gap: 12,
            width: "100%",
            zIndex: 10,
          }}
        >
          {eyebrow}
          {headline}
          {subheadline}
        </div>
      )}

      {/* HERO VISUAL STAGE (Strictly contained, never collides with header or footer) */}
      <div
        data-motion-slot="hero-stage"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
          contain: "layout paint",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5,
        }}
      >
        {stage}
      </div>

      {/* FOOTER HUD SLOT */}
      {footer && (
        <div
          data-motion-slot="footer"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "100%",
            zIndex: 10,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export interface OrbitNodeItem {
  icon?: LucideIcon | React.ComponentType<any>;
  label: string;
  sublabel?: string;
  color?: string;
  cueFrame?: number;
}

export interface OrbitHubStageProps {
  centerHub: {
    icon?: LucideIcon | React.ComponentType<any>;
    label: string;
    sublabel?: string;
    color?: string;
  };
  nodes: OrbitNodeItem[];
  radius?: number;
  startFrame?: number;
  theme: MotionTheme;
  orientation?: "portrait" | "landscape" | "square";
  style?: React.CSSProperties;
}

/**
 * Calibrated Orbit Hub diagram.
 * Guarantees nodes stay within the safe bounding box and never collide with headers.
 */
export function OrbitHubStage({
  centerHub,
  nodes = [],
  radius,
  startFrame = 4,
  theme,
  orientation = "portrait",
  style,
}: OrbitHubStageProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  // Clamped safe radius so nodes never break out of stage
  const effectiveRadius = Math.min(radius || (isPortrait ? 290 : 250), isPortrait ? 310 : 270);
  const CenterIcon = centerHub.icon;
  const hubColor = centerHub.color || theme.accent;

  const orbitRotation = (frame - startFrame) * 0.35;

  const hubSpring = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_PRESETS.editorial,
  });

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {/* SVG Orbit Tracks & Radial Spokes */}
      <svg
        viewBox="-450 -450 900 900"
        style={{
          position: "absolute",
          width: "100%",
          maxWidth: 900,
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {/* Orbital rings */}
        <circle
          cx={0}
          cy={0}
          r={effectiveRadius}
          fill="none"
          stroke={theme.border}
          strokeWidth={2}
          strokeDasharray="8 8"
          opacity={0.65}
        />
        <circle
          cx={0}
          cy={0}
          r={effectiveRadius * 0.55}
          fill="none"
          stroke={hubColor}
          strokeWidth={1.5}
          strokeDasharray="4 6"
          opacity={0.35}
        />

        {/* Spokes to nodes */}
        {nodes.map((node, i) => {
          const count = nodes.length || 1;
          const baseAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const angle = baseAngle + (orbitRotation * Math.PI) / 180;
          const nx = Math.cos(angle) * effectiveRadius;
          const ny = Math.sin(angle) * effectiveRadius;
          const cue = node.cueFrame ?? startFrame + 6 + i * 8;
          const spokeProgress = safeInterpolate(frame, [cue, cue + 14], [0, 1]);
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={nx * spokeProgress}
              y2={ny * spokeProgress}
              stroke={node.color || theme.accent}
              strokeWidth={2}
              strokeDasharray="6 6"
              opacity={spokeProgress * 0.55}
            />
          );
        })}
      </svg>

      {/* CENTER HERO HUB */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: isPortrait ? 180 : 160,
          height: isPortrait ? 180 : 160,
          borderRadius: "50%",
          backgroundColor: theme.surface,
          border: `3.5px solid ${hubColor}`,
          boxShadow: `0 12px 30px ${hubColor}33`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: 16,
          textAlign: "center",
          boxSizing: "border-box",
          transform: `scale(${safeInterpolate(hubSpring, [0, 1], [0.8, 1])})`,
          opacity: safeInterpolate(frame - startFrame, [0, 6], [0, 1]),
        }}
      >
        {CenterIcon && <CenterIcon size={isPortrait ? 44 : 38} color={hubColor} />}
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: isPortrait ? 24 : 22,
            fontWeight: 800,
            color: theme.text,
            lineHeight: 1.1,
          }}
        >
          {centerHub.label}
        </div>
        {centerHub.sublabel && (
          <div
            style={{
              fontFamily: theme.fontMono,
              fontSize: 16,
              fontWeight: 700,
              color: hubColor,
              letterSpacing: "0.06em",
            }}
          >
            {centerHub.sublabel}
          </div>
        )}
      </div>

      {/* ORBITING NODES */}
      {nodes.map((node, i) => {
        const count = nodes.length || 1;
        const baseAngle = (i / count) * Math.PI * 2 - Math.PI / 2;
        const angle = baseAngle + (orbitRotation * Math.PI) / 180;
        const nx = Math.cos(angle) * effectiveRadius;
        const ny = Math.sin(angle) * effectiveRadius;

        const NodeIcon = node.icon;
        const nodeColor = node.color || theme.accent;
        const cue = node.cueFrame ?? startFrame + 6 + i * 8;
        const nodeSpring = spring({
          frame: frame - cue,
          fps,
          config: SPRING_PRESETS.snappy,
        });
        const show = frame >= cue;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px)) scale(${show ? nodeSpring : 0})`,
              opacity: show ? 1 : 0,
              zIndex: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 18px",
              borderRadius: 14,
              backgroundColor: theme.surface,
              border: `2.5px solid ${nodeColor}`,
              boxShadow: `0 8px 24px rgba(0,0,0,0.18)`,
              pointerEvents: "none",
            }}
          >
            {NodeIcon && <NodeIcon size={26} color={nodeColor} />}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 22,
                  fontWeight: 800,
                  color: theme.text,
                  whiteSpace: "nowrap",
                }}
              >
                {node.label}
              </span>
              {node.sublabel && (
                <span
                  style={{
                    fontFamily: theme.fontMono,
                    fontSize: 16,
                    fontWeight: 700,
                    color: nodeColor,
                    letterSpacing: "0.04em",
                  }}
                >
                  {node.sublabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface DuelPanelData {
  badge?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon | React.ComponentType<any>;
  color?: string;
  points?: string[];
}

export interface ComparisonDuelStageProps {
  left: DuelPanelData;
  right: DuelPanelData;
  vsBadge?: string;
  startFrame?: number;
  theme: MotionTheme;
  orientation?: "portrait" | "landscape" | "square";
  activeSide?: "left" | "right" | "both";
  style?: React.CSSProperties;
}

/**
 * Adaptive Comparison Duel.
 * In 9:16 portrait: Stacks vertically (Top vs Bottom) with a prominent center VS divider.
 * In 16:9 landscape: Splits horizontally (Left vs Right).
 * Eliminates narrow, squished 2-column cards on portrait phones.
 */
export function ComparisonDuelStage({
  left,
  right,
  vsBadge = "VS",
  startFrame = 4,
  theme,
  orientation = "portrait",
  activeSide = "both",
  style,
}: ComparisonDuelStageProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  const spLeft = spring({
    frame: frame - startFrame,
    fps,
    config: SPRING_PRESETS.editorial,
  });
  const spRight = spring({
    frame: frame - startFrame - 6,
    fps,
    config: SPRING_PRESETS.editorial,
  });

  const LeftIcon = left.icon;
  const RightIcon = right.icon;
  const leftColor = left.color || theme.accent;
  const rightColor = right.color || theme.accent2 || "#2563EB";

  const isLeftDimmed = activeSide === "right";
  const isRightDimmed = activeSide === "left";

  const renderCard = (
    data: DuelPanelData,
    IconComp: any,
    accent: string,
    sp: number,
    isDimmed: boolean
  ) => (
    <div
      style={{
        flex: 1,
        width: "100%",
        maxWidth: isPortrait ? 920 : 540,
        backgroundColor: theme.surface,
        border: `3px solid ${isDimmed ? theme.border : accent}`,
        borderRadius: 16,
        padding: isPortrait ? "26px 32px" : "32px 36px",
        boxShadow: isDimmed ? "none" : `8px 8px 0 ${accent}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 14,
        transform: `scale(${safeInterpolate(sp, [0, 1], [0.92, 1])})`,
        opacity: isDimmed ? 0.42 : safeInterpolate(sp, [0, 1], [0, 1]),
        boxSizing: "border-box",
        transition: "opacity 0.25s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {data.badge && (
          <span
            style={{
              fontFamily: theme.fontMono,
              fontSize: 18,
              fontWeight: 800,
              color: accent,
              letterSpacing: "0.08em",
              backgroundColor: `${accent}18`,
              padding: "4px 12px",
              borderRadius: 6,
            }}
          >
            {data.badge}
          </span>
        )}
        {IconComp && (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: `${accent}1F`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconComp size={28} color={accent} />
          </div>
        )}
      </div>

      <div>
        <div
          style={{
            fontFamily: theme.fontDisplay,
            fontSize: isPortrait ? 34 : 36,
            fontWeight: 800,
            color: theme.text,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
          }}
        >
          {data.title}
        </div>
        {data.subtitle && (
          <div
            style={{
              marginTop: 6,
              fontFamily: theme.fontBody,
              fontSize: 22,
              fontWeight: 500,
              color: theme.textMuted,
            }}
          >
            {data.subtitle}
          </div>
        )}
      </div>

      {data.points && data.points.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {data.points.map((pt, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: accent,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: theme.fontBody,
                  fontSize: 22,
                  fontWeight: 600,
                  color: theme.text,
                }}
              >
                {pt}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: isPortrait ? 20 : 36,
        position: "relative",
        ...style,
      }}
    >
      {renderCard(left, LeftIcon, leftColor, spLeft, isLeftDimmed)}

      {/* Center Divider Badge */}
      <div
        style={{
          zIndex: 15,
          padding: "8px 22px",
          borderRadius: 999,
          backgroundColor: theme.bg,
          border: `2.5px solid ${theme.border}`,
          boxShadow: `0 6px 18px rgba(0,0,0,0.18)`,
          fontFamily: theme.fontDisplay,
          fontSize: 22,
          fontWeight: 900,
          color: theme.text,
          letterSpacing: "0.12em",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {vsBadge}
      </div>

      {renderCard(right, RightIcon, rightColor, spRight, isRightDimmed)}
    </div>
  );
}

export interface StepperStep {
  stepNumber: string | number;
  label: string;
  detail?: string;
  icon?: LucideIcon | React.ComponentType<any>;
  accent?: string;
  cueFrame?: number;
}

export interface ProcessStepperStageProps {
  steps: StepperStep[];
  startFrame?: number;
  activeStep?: number;
  theme: MotionTheme;
  orientation?: "portrait" | "landscape" | "square";
  style?: React.CSSProperties;
}

/**
 * Sequential process flow stepper.
 * Adapts cleanly vertically for 9:16 portrait and horizontally for 16:9 landscape.
 */
export function ProcessStepperStage({
  steps = [],
  startFrame = 4,
  activeStep,
  theme,
  orientation = "portrait",
  style,
}: ProcessStepperStageProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: isPortrait ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: isPortrait ? 18 : 28,
        position: "relative",
        ...style,
      }}
    >
      {steps.map((step, idx) => {
        const cue = step.cueFrame ?? startFrame + idx * 10;
        const sp = spring({
          frame: frame - cue,
          fps,
          config: SPRING_PRESETS.editorial,
        });
        const show = frame >= cue;
        const StepIcon = step.icon;
        const accent = step.accent || (idx === 0 ? theme.accent : idx === 1 ? theme.accent2 : theme.accent3) || theme.accent;

        const isCurrent = activeStep === undefined ? true : activeStep === idx;
        const isPast = activeStep !== undefined && activeStep > idx;
        const isDimmed = activeStep !== undefined && !isCurrent && !isPast;

        return (
          <div
            key={idx}
            style={{
              flex: 1,
              width: "100%",
              maxWidth: isPortrait ? 920 : 360,
              backgroundColor: theme.surface,
              border: `2.5px solid ${isCurrent ? accent : theme.border}`,
              borderRadius: 14,
              padding: isPortrait ? "20px 24px" : "26px 24px",
              boxShadow: isCurrent ? `6px 6px 0 ${accent}` : "none",
              display: "flex",
              alignItems: "center",
              gap: 18,
              transform: `scale(${show ? safeInterpolate(sp, [0, 1], [0.92, 1]) : 0.92})`,
              opacity: show ? (isDimmed ? 0.38 : 1) : 0,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                backgroundColor: `${accent}22`,
                border: `1.5px solid ${accent}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: accent,
                fontFamily: theme.fontMono,
                fontSize: 22,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {StepIcon ? <StepIcon size={26} color={accent} /> : step.stepNumber}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <div
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 24,
                  fontWeight: 800,
                  color: theme.text,
                  lineHeight: 1.2,
                }}
              >
                {step.label}
              </div>
              {step.detail && (
                <div
                  style={{
                    fontFamily: theme.fontBody,
                    fontSize: 20,
                    fontWeight: 500,
                    color: theme.textMuted,
                  }}
                >
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface BrowserMockupCardProps {
  url?: string;
  startFrame?: number;
  theme: MotionTheme;
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  accent?: string;
  style?: React.CSSProperties;
}

/**
 * Modern Browser Mockup Stage with URL navigation bar and responsive content area.
 */
export function BrowserMockupCard({
  url = "https://web.org",
  startFrame = 4,
  theme,
  children,
  width = "100%",
  height = "100%",
  accent,
  style,
}: BrowserMockupCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sp = spring({ frame: frame - startFrame, fps, config: SPRING_PRESETS.editorial });
  const activeAccent = accent || theme.accent;

  return (
    <div
      style={{
        width,
        height,
        maxWidth: 960,
        backgroundColor: theme.surface,
        borderRadius: 16,
        border: `3px solid ${theme.border}`,
        boxShadow: `0 20px 50px rgba(0,0,0,0.18)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transform: `scale(${safeInterpolate(sp, [0, 1], [0.93, 1])})`,
        opacity: safeInterpolate(frame - startFrame, [0, 6], [0, 1]),
        boxSizing: "border-box",
        ...style,
      }}
    >
      {/* Top Browser Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "12px 20px",
          borderBottom: `2px solid ${theme.border}`,
          backgroundColor: `${theme.border}22`,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#FF5F56" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#FFBD2E" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#27C93F" }} />
        </div>
        <div
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            borderRadius: 8,
            padding: "6px 14px",
            fontFamily: theme.fontMono,
            fontSize: 18,
            fontWeight: 600,
            color: theme.textMuted,
            letterSpacing: "0.02em",
            border: `1px solid ${theme.border}66`,
            textAlign: "center",
          }}
        >
          {url}
        </div>
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: activeAccent }} />
      </div>

      {/* Content Slot */}
      <div
        style={{
          flex: 1,
          padding: 24,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface FocusSpotlightProps {
  children: React.ReactNode[];
  activeIndex?: number;
  inactiveOpacity?: number;
  inactiveScale?: number;
  style?: React.CSSProperties;
}

/**
 * Focus Spotlight: Dims non-active cards so the viewer's eye is guided to a single focal point.
 */
export function FocusSpotlight({
  children = [],
  activeIndex,
  inactiveOpacity = 0.4,
  inactiveScale = 0.97,
  style,
}: FocusSpotlightProps) {
  return (
    <div style={{ width: "100%", display: "flex", gap: 20, ...style }}>
      {children.map((child, idx) => {
        const isCurrent = activeIndex === undefined || activeIndex === idx;
        return (
          <div
            key={idx}
            style={{
              flex: 1,
              opacity: isCurrent ? 1 : inactiveOpacity,
              transform: `scale(${isCurrent ? 1 : inactiveScale})`,
              transition: "opacity 0.25s ease, transform 0.25s ease",
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}



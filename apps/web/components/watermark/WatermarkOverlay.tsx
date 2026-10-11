"use client";

import React from "react";
import { WatermarkConfig } from "@/types";

interface WatermarkOverlayProps {
  watermark?: WatermarkConfig | null;
  containerWidth: number;
  containerHeight?: number;
}

export function hexToRgba(hex: string, alpha: number = 1.0): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function WatermarkOverlay({
  watermark,
  containerWidth,
  containerHeight: _containerHeight,
}: WatermarkOverlayProps) {
  if (!watermark || !watermark.enabled || !watermark.text?.trim()) {
    return null;
  }

  // Scale factor based on standard 1080px width
  const scale = Math.max(0.2, (containerWidth || 360) / 1080);
  const scaledFontSize = Math.max(8, Math.round((watermark.font_size || 36) * scale));
  const scaledOffsetX = Math.max(2, Math.round((watermark.offset_x || 30) * scale));
  const scaledOffsetY = Math.max(2, Math.round((watermark.offset_y || 30) * scale));

  let positionStyles: React.CSSProperties = {};
  switch (watermark.position) {
    case "top-left":
      positionStyles = {
        top: `${scaledOffsetY}px`,
        left: `${scaledOffsetX}px`,
      };
      break;
    case "top-center":
      positionStyles = {
        top: `${scaledOffsetY}px`,
        left: "50%",
        transform: "translateX(-50%)",
      };
      break;
    case "top-right":
      positionStyles = {
        top: `${scaledOffsetY}px`,
        right: `${scaledOffsetX}px`,
      };
      break;
    case "center":
      positionStyles = {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
      break;
    case "bottom-left":
      positionStyles = {
        bottom: `${scaledOffsetY}px`,
        left: `${scaledOffsetX}px`,
      };
      break;
    case "bottom-center":
      positionStyles = {
        bottom: `${scaledOffsetY}px`,
        left: "50%",
        transform: "translateX(-50%)",
      };
      break;
    case "bottom-right":
    default:
      positionStyles = {
        bottom: `${scaledOffsetY}px`,
        right: `${scaledOffsetX}px`,
      };
      break;
  }

  const hasBackground = !!watermark.has_background;
  const hasShadow = watermark.has_shadow !== false;
  const strokeWidth = Math.max(0.5, Number((scale * 1.5).toFixed(2)));

  return (
    <div
      className="absolute pointer-events-none select-none z-20 flex items-center justify-center transition-all duration-150 ease-out"
      style={positionStyles}
    >
      <span
        style={{
          fontFamily: `"${watermark.font_family || "Poppins"}", sans-serif`,
          fontSize: `${scaledFontSize}px`,
          color: watermark.font_color || "#FFFFFF",
          opacity: watermark.opacity ?? 0.85,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          textShadow: hasShadow ? "0 2px 4px rgba(0,0,0,0.85)" : undefined,
          WebkitTextStroke: hasShadow
            ? `${strokeWidth}px ${watermark.shadow_color || "rgba(0,0,0,0.7)"}`
            : undefined,
          backgroundColor: hasBackground
            ? hexToRgba(watermark.background_color || "#000000", watermark.background_opacity ?? 0.5)
            : "transparent",
          padding: hasBackground
            ? `${Math.max(2, Math.round(4 * scale))}px ${Math.max(6, Math.round(10 * scale))}px`
            : "0px",
          borderRadius: hasBackground
            ? `${Math.max(3, Math.round(6 * scale))}px`
            : "0px",
        }}
      >
        {watermark.text}
      </span>
    </div>
  );
}

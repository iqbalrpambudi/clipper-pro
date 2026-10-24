"use client";

import React from "react";
import { WatermarkConfig } from "@/types";

interface WatermarkOverlayProps {
  watermark?: WatermarkConfig | null;
  containerWidth: number;
  containerHeight?: number;
  isDraggable?: boolean;
  onCustomPositionChange?: (pos: { custom_x: number; custom_y: number }) => void;
  onDragEnd?: () => void;
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
  isDraggable = false,
  onCustomPositionChange,
  onDragEnd,
}: WatermarkOverlayProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const elementRef = React.useRef<HTMLDivElement | null>(null);

  if (!watermark || !watermark.enabled) {
    return null;
  }

  if (!watermark.text?.trim()) {
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
    case "center-left":
      positionStyles = {
        top: "50%",
        left: `${scaledOffsetX}px`,
        transform: "translateY(-50%)",
      };
      break;
    case "center":
      positionStyles = {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
      break;
    case "center-right":
      positionStyles = {
        top: "50%",
        right: `${scaledOffsetX}px`,
        transform: "translateY(-50%)",
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
    case "custom": {
      const cx = watermark.custom_x ?? 50;
      const cy = watermark.custom_y ?? 50;
      positionStyles = {
        left: `${cx}%`,
        top: `${cy}%`,
        transform: `translate(-${cx}%, -${cy}%)`,
      };
      break;
    }
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

  // Drag interaction handler
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDraggable) return;
    e.preventDefault();
    e.stopPropagation();

    const parent = elementRef.current?.parentElement;
    if (!parent) return;

    setIsDragging(true);

    const onPointerMove = (ev: PointerEvent) => {
      const rect = parent.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const rawX = ((ev.clientX - rect.left) / rect.width) * 100;
      const rawY = ((ev.clientY - rect.top) / rect.height) * 100;

      const clampedX = Math.max(2, Math.min(98, Math.round(rawX * 10) / 10));
      const clampedY = Math.max(2, Math.min(98, Math.round(rawY * 10) / 10));

      onCustomPositionChange?.({ custom_x: clampedX, custom_y: clampedY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      onDragEnd?.();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  return (
    <div
      ref={elementRef}
      onPointerDown={handlePointerDown}
      className={`absolute z-30 select-none flex items-center justify-center transition-all ${
        isDragging ? "duration-0" : "duration-100 ease-out"
      } ${
        isDraggable
          ? "cursor-grab active:cursor-grabbing pointer-events-auto hover:ring-2 hover:ring-[#E9C9BD] rounded group"
          : "pointer-events-none"
      } ${isDragging ? "ring-2 ring-[#E9C9BD] shadow-xl" : ""}`}
      style={positionStyles}
      title={isDraggable ? "Tarik untuk memposisikan watermark bebas" : undefined}
    >
      {/* Visual coordinate badge during drag */}
      {isDragging && (
        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#F8EEEA] text-[#A9472C] text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-50">
          X: {Math.round(watermark.custom_x ?? 50)}% | Y: {Math.round(watermark.custom_y ?? 50)}%
        </div>
      )}

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
              ? hexToRgba(
                  watermark.background_color || "#000000",
                  watermark.background_opacity ?? 0.5
                )
              : "transparent",
            padding: hasBackground
              ? `${Math.max(2, Math.round(4 * scale))}px ${Math.max(6, Math.round(10 * scale))}px`
              : "0px",
            borderRadius: hasBackground ? `${Math.max(3, Math.round(6 * scale))}px` : "0px",
          }}
        >
          {watermark.text}
        </span>
    </div>
  );
}

"use client";

import React, { useRef, useState } from "react";
import { Move } from "lucide-react";
import { SentenceSegment, SubtitleStyle } from "@/types";

interface FallbackSubtitleOverlayProps {
  isJassubReady: boolean;
  subtitleStyle?: SubtitleStyle | null;
  segments: SentenceSegment[];
  time: number;
  frameDimensions: { width: number; height: number };
  aspectRatio: string;
  onUpdateSubtitlePosition?: (pos: { offset_x: number; offset_y: number }) => void;
}

export function FallbackSubtitleOverlay({
  isJassubReady,
  subtitleStyle,
  segments,
  time,
  frameDimensions,
  aspectRatio,
  onUpdateSubtitlePosition,
}: FallbackSubtitleOverlayProps) {
  const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);

  const dragStartPos = useRef<{
    x: number;
    y: number;
    initialOffsetX: number;
    initialOffsetY: number;
  }>({
    x: 0,
    y: 0,
    initialOffsetX: 0,
    initialOffsetY: 0,
  });

  const refAuthorW = aspectRatio === "16:9" ? 1920 : 1080;
  const refAuthorH = aspectRatio === "16:9" ? 1080 : aspectRatio === "1:1" ? 1080 : 1920;
  const scale = frameDimensions.width / refAuthorW;
  const scaleY = frameDimensions.height / refAuthorH;

  const fontBaseSize = subtitleStyle?.font_size || 56;
  const scaledFontSize = Math.max(6, Number((fontBaseSize * scale).toFixed(2)));
  const scaledOutlineWidth = Math.max(
    0.5,
    Number(((subtitleStyle?.outline_width ?? 4) * scale).toFixed(2))
  );
  const scaledOffsetY = Math.round((subtitleStyle?.offset_y || 0) * scaleY);
  const scaledOffsetX = Math.round((subtitleStyle?.offset_x || 0) * scale);
  const boxOpacity = subtitleStyle?.box_opacity ?? 0.0;
  const isScaleAnim = subtitleStyle?.highlight_animation === "scale";
  const isHighlightEnabled = subtitleStyle?.highlight_animation !== "none";
  const zoomScale = isScaleAnim ? (subtitleStyle?.scale_factor ?? 1.15) : 1.0;

  const curMs = time * 1000;
  const activeSegment = segments.find((s) => curMs >= s.start_ms && curMs <= s.end_ms + 250);
  const segWords = activeSegment?.words || [];
  let activeWordIndex = -1;
  if (segWords.length > 0) {
    activeWordIndex = segWords.findIndex((w) => curMs >= w.start_ms && curMs <= w.end_ms + 180);
    if (
      activeWordIndex === -1 &&
      curMs >= segWords[0].start_ms &&
      curMs <= segWords[segWords.length - 1].end_ms + 300
    ) {
      for (let i = segWords.length - 1; i >= 0; i--) {
        if (curMs >= segWords[i].start_ms) {
          const nextW = segWords[i + 1];
          const gap = nextW ? nextW.start_ms - segWords[i].end_ms : 999;
          if (curMs <= segWords[i].end_ms + (gap <= 350 ? gap : 200)) {
            activeWordIndex = i;
          }
          break;
        }
      }
    }
  }

  const burstCount = Math.max(2, subtitleStyle?.burst_word_count || 2);
  let activeBurstGroup: { word: string; start_ms: number; end_ms: number; isActive: boolean }[] =
    [];
  if (subtitleStyle?.display_mode === "burst" && segWords.length > 0) {
    for (let i = 0; i < segWords.length; i += burstCount) {
      const group = segWords.slice(i, i + burstCount);
      const gStart = group[0].start_ms;
      const gEnd = group[group.length - 1].end_ms;
      const nextSlice = segWords.slice(i + burstCount, i + burstCount + 1);
      const maxGEnd =
        nextSlice.length > 0
          ? Math.min(nextSlice[0].start_ms, gEnd + 350)
          : Math.min(activeSegment?.end_ms ?? gEnd + 350, gEnd + 350);

      if (curMs >= gStart && curMs <= maxGEnd) {
        activeBurstGroup = group.map((item, localIdx) => ({
          ...item,
          isActive: isHighlightEnabled && i + localIdx === activeWordIndex,
        }));
        break;
      }
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onUpdateSubtitlePosition) return;
    setIsDraggingSubtitle(true);
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: subtitleStyle?.offset_x || 0,
      initialOffsetY: subtitleStyle?.offset_y || 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle || !onUpdateSubtitlePosition) return;
    const deltaX = e.clientX - dragStartPos.current.x;
    const deltaY = e.clientY - dragStartPos.current.y;
    const newAssDeltaX = Math.round(deltaX / scale);
    const newAssDeltaY = Math.round(deltaY / scaleY);
    onUpdateSubtitlePosition({
      offset_x: dragStartPos.current.initialOffsetX + newAssDeltaX,
      offset_y: dragStartPos.current.initialOffsetY + newAssDeltaY,
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingSubtitle) return;
    setIsDraggingSubtitle(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <>
      {/* Fallback CSS Subtitle Overlay (if WASM not yet ready) */}
      {!isJassubReady && subtitleStyle?.enabled !== false && activeSegment && (
        <div
          className="absolute left-0 right-0 z-20 px-4 flex justify-center text-center select-none pointer-events-none"
          style={{
            top:
              subtitleStyle?.position === "top"
                ? "9.375%"
                : subtitleStyle?.position === "center"
                  ? "50%"
                  : undefined,
            bottom:
              subtitleStyle?.position === "bottom" || !subtitleStyle?.position
                ? "11.45%"
                : undefined,
            transform: `translate(${scaledOffsetX}px, ${
              subtitleStyle?.position === "center"
                ? `calc(-50% + ${scaledOffsetY}px)`
                : subtitleStyle?.position === "bottom"
                  ? `${-scaledOffsetY}px`
                  : `${scaledOffsetY}px`
            })`,
          }}
        >
          {subtitleStyle?.display_mode === "burst" ? (
            activeBurstGroup.length > 0 ? (
              <div
                style={{
                  fontSize: `${scaledFontSize}px`,
                  fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                  fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                  color: subtitleStyle?.primary_color || "#FFFFFF",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                  textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                  backgroundColor:
                    boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                  padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                  borderRadius: "4px",
                }}
                className="flex items-center justify-center gap-1.5 uppercase tracking-wide"
              >
                {activeBurstGroup.map((w, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: w.isActive
                        ? subtitleStyle?.highlight_color || "#FFE600"
                        : subtitleStyle?.primary_color || "#FFFFFF",
                      transform: w.isActive && isScaleAnim ? `scale(${zoomScale})` : "none",
                      transition: "all 0.08s ease-out",
                      display: "inline-block",
                    }}
                  >
                    {w.word}
                  </span>
                ))}
              </div>
            ) : null
          ) : subtitleStyle?.display_mode === "per_word" ? (
            activeWordIndex !== -1 && segWords[activeWordIndex] ? (
              <div
                style={{
                  fontSize: `${scaledFontSize}px`,
                  fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                  fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                  color: isHighlightEnabled
                    ? subtitleStyle?.highlight_color || "#FFE600"
                    : subtitleStyle?.primary_color || "#FFFFFF",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                  textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                  transform: isHighlightEnabled && isScaleAnim ? `scale(${zoomScale})` : "none",
                  backgroundColor:
                    boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                  padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                  borderRadius: "4px",
                  display: "inline-block",
                }}
                className="uppercase tracking-wide"
              >
                {segWords[activeWordIndex].word}
              </div>
            ) : null
          ) : (
            <div
              style={{
                fontSize: `${scaledFontSize}px`,
                fontFamily: `"${subtitleStyle?.font_family || "Poppins"}", sans-serif`,
                fontWeight: subtitleStyle?.font_weight?.toLowerCase() === "bold" ? 800 : 600,
                color: subtitleStyle?.primary_color || "#FFFFFF",
                WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle?.outline_color || "#000000"}`,
                textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                backgroundColor:
                  boxOpacity > 0.05 ? subtitleStyle?.box_color || "#000000" : "transparent",
                padding: boxOpacity > 0.05 ? "2px 8px" : "0",
                borderRadius: "4px",
              }}
              className="inline-block uppercase tracking-wide leading-snug"
            >
              {segWords.length
                ? segWords.map((w, i) => {
                    const isActive = isHighlightEnabled && i === activeWordIndex;
                    return (
                      <span
                        key={i}
                        style={{
                          color: isActive
                            ? subtitleStyle?.highlight_color || "#FFE600"
                            : subtitleStyle?.primary_color || "#FFFFFF",
                          transform: isActive && isScaleAnim ? `scale(${zoomScale})` : "none",
                          transition: "all 0.08s ease-out",
                          display: "inline-block",
                        }}
                        className="mr-1.5"
                      >
                        {w.word}
                      </span>
                    );
                  })
                : activeSegment.text}
            </div>
          )}
        </div>
      )}

      {/* Interactive Drag Handle for Subtitle Positioning */}
      {onUpdateSubtitlePosition && subtitleStyle?.enabled !== false && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute left-4 right-4 z-30 flex justify-center text-center select-none cursor-move group"
          style={{
            top:
              subtitleStyle?.position === "top"
                ? "9.375%"
                : subtitleStyle?.position === "center"
                  ? "50%"
                  : undefined,
            bottom:
              subtitleStyle?.position === "bottom" || !subtitleStyle?.position
                ? "11.45%"
                : undefined,
            transform: `translate(${scaledOffsetX}px, ${
              subtitleStyle?.position === "center"
                ? `calc(-50% + ${scaledOffsetY}px)`
                : subtitleStyle?.position === "bottom"
                  ? `${-scaledOffsetY}px`
                  : `${scaledOffsetY}px`
            })`,
          }}
        >
          <div className="pointer-events-auto flex h-12 w-full max-w-[260px] items-center justify-center rounded-xl border border-dashed border-transparent transition-all group-hover:border-primary/60">
            <div className="pointer-events-none flex items-center gap-1 rounded bg-black/80 px-2 py-0.5 font-mono text-[10px] text-white transition-opacity group-hover:opacity-100">
              <Move className="w-2.5 h-2.5" />
              <span>Geser Posisi Subtitle</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

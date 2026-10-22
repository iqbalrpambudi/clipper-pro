"use client";

import React from "react";
import { Image as ImageIcon, Move } from "lucide-react";
import {
  StoryboardItem,
  SentenceSegment,
  SubtitleStyle,
  WordTimestamp,
  WatermarkConfig,
} from "@/types";
import { WatermarkOverlay } from "@/components/watermark/WatermarkOverlay";
import { hexToRgba } from "./constants";
import { BurstGroupItem } from "./hooks/useStoryboardTimelineState";

interface VideoPreviewScreenProps {
  videoFrameRef: React.RefObject<HTMLDivElement | null>;
  activeItem: StoryboardItem | null;
  itemsLength: number;
  isPlaying: boolean;
  getMotionAnimationClass: (effect?: string) => string;
  subtitleStyle: SubtitleStyle;
  activeSegment: SentenceSegment | null;
  scaledOffsetX: number;
  scaledOffsetY: number;
  scaledFontSize: number;
  scaledOutlineWidth: number;
  fontWeightValue: number;
  zoomScale: number;
  isScaleAnim: boolean;
  isHighlightEnabled: boolean;
  segWords: WordTimestamp[];
  activeWordIndex: number;
  activeBurstGroup: BurstGroupItem[];
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  currentTime: number;
  duration: number;
  formatTime: (secs: number) => string;
  className?: string;
  style?: React.CSSProperties;
  showSafeZones?: boolean;
  watermark?: WatermarkConfig | null;
  isWatermarkDraggable?: boolean;
  onCustomWatermarkPositionChange?: (pos: { custom_x: number; custom_y: number }) => void;
  onWatermarkDragEnd?: () => void;
}

export function VideoPreviewScreen({
  videoFrameRef,
  activeItem,
  itemsLength,
  isPlaying,
  getMotionAnimationClass,
  subtitleStyle,
  activeSegment,
  scaledOffsetX,
  scaledOffsetY,
  scaledFontSize,
  scaledOutlineWidth,
  fontWeightValue,
  zoomScale,
  isScaleAnim,
  isHighlightEnabled,
  segWords,
  activeWordIndex,
  activeBurstGroup,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  currentTime,
  duration,
  formatTime,
  className,
  style,
  showSafeZones,
  watermark,
  isWatermarkDraggable,
  onCustomWatermarkPositionChange,
  onWatermarkDragEnd,
}: VideoPreviewScreenProps) {
  const [containerWidth, setContainerWidth] = React.useState(640);

  React.useEffect(() => {
    if (!videoFrameRef.current) return;
    const update = () => {
      if (videoFrameRef.current) {
        setContainerWidth(videoFrameRef.current.clientWidth || 640);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(videoFrameRef.current);
    return () => ro.disconnect();
  }, [videoFrameRef]);

  return (
    <div
      ref={videoFrameRef}
      className={
        className ||
        "group relative flex aspect-video h-full w-auto max-h-full max-w-full shrink-0 select-none items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5E1D7] bg-[#FFFEFA] shadow-lg"
      }
      style={style}
    >
      {activeItem && activeItem.image_url ? (
        <div className="relative w-full h-full overflow-hidden flex items-center justify-center">
          <img
            key={activeItem.id}
            src={activeItem.image_url}
            alt={activeItem.image_prompt}
            className={`w-full h-full object-cover origin-center ${
              isPlaying ? getMotionAnimationClass(activeItem.motion_effect) : "scale-100"
            }`}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-[#77766D]">
          <ImageIcon className="w-12 h-12 stroke-[1.5]" />
          <span className="text-xs font-mono">
            {itemsLength === 0 ? "Belum ada gambar" : "Gambar sedang diproses"}
          </span>
        </div>
      )}

      {/* WYSIWYG Live Subtitle Overlay */}
      {subtitleStyle.enabled !== false && activeSegment && (
        <div
          className="absolute left-0 right-0 z-20 px-6 flex justify-center text-center select-none pointer-events-none"
          style={{
            top:
              subtitleStyle.position === "top"
                ? "10%"
                : subtitleStyle.position === "center"
                  ? "50%"
                  : undefined,
            bottom:
              subtitleStyle.position === "bottom" || !subtitleStyle.position ? "12%" : undefined,
            transform: `translate(${scaledOffsetX}px, ${
              subtitleStyle.position === "center"
                ? `calc(-50% + ${scaledOffsetY}px)`
                : subtitleStyle.position === "bottom"
                  ? `${-scaledOffsetY}px`
                  : `${scaledOffsetY}px`
            })`,
          }}
        >
          {/* 1. Burst Mode (2-3 kata) */}
          {subtitleStyle.display_mode === "burst" ? (
            activeBurstGroup.length > 0 ? (
              <div
                style={{
                  fontSize: `${scaledFontSize}px`,
                  fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                  fontWeight: fontWeightValue,
                  color: subtitleStyle.primary_color || "#FFFFFF",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                  paintOrder: "stroke fill",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  backgroundColor:
                    (subtitleStyle.box_opacity ?? 0) > 0.05
                      ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                      : "transparent",
                  padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                  borderRadius: "8px",
                }}
                className="flex items-center justify-center gap-2 uppercase tracking-wide"
              >
                {activeBurstGroup.map((w, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: w.isActive
                        ? subtitleStyle.highlight_color || "#FFE600"
                        : subtitleStyle.primary_color || "#FFFFFF",
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
          ) : subtitleStyle.display_mode === "per_word" ? (
            /* 2. Per Word Mode */
            activeWordIndex !== -1 && segWords[activeWordIndex] ? (
              <div
                style={{
                  fontSize: `${scaledFontSize * 1.05}px`,
                  fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                  fontWeight: fontWeightValue,
                  color: isHighlightEnabled
                    ? subtitleStyle.highlight_color || "#FFE600"
                    : subtitleStyle.primary_color || "#FFFFFF",
                  WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                  paintOrder: "stroke fill",
                  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                  transform: isHighlightEnabled && isScaleAnim ? `scale(${zoomScale})` : "none",
                  backgroundColor:
                    (subtitleStyle.box_opacity ?? 0) > 0.05
                      ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                      : "transparent",
                  padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                  borderRadius: "8px",
                  display: "inline-block",
                }}
                className="uppercase tracking-wide"
              >
                {segWords[activeWordIndex].word}
              </div>
            ) : null
          ) : (
            /* 3. Full Sentence Mode with Karaoke Word Highlight */
            <div
              style={{
                fontSize: `${Math.round(scaledFontSize * 0.9)}px`,
                fontFamily: `"${subtitleStyle.font_family || "Poppins"}", sans-serif`,
                fontWeight: fontWeightValue,
                color: subtitleStyle.primary_color || "#FFFFFF",
                WebkitTextStroke: `${scaledOutlineWidth}px ${subtitleStyle.outline_color || "#000000"}`,
                paintOrder: "stroke fill",
                textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                backgroundColor:
                  (subtitleStyle.box_opacity ?? 0) > 0.05
                    ? hexToRgba(subtitleStyle.box_color || "#000000", subtitleStyle.box_opacity)
                    : "transparent",
                padding: (subtitleStyle.box_opacity ?? 0) > 0.05 ? "6px 14px" : "0",
                borderRadius: "8px",
              }}
              className="inline-block uppercase tracking-wide leading-snug max-w-[85%]"
            >
              {segWords.length > 0
                ? segWords.map((w: WordTimestamp, i: number) => {
                    const isActive = isHighlightEnabled && i === activeWordIndex;
                    return (
                      <span
                        key={i}
                        style={{
                          color: isActive
                            ? subtitleStyle.highlight_color || "#FFE600"
                            : subtitleStyle.primary_color || "#FFFFFF",
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

      {/* Interactive Drag Handle for Subtitle Position */}
      {subtitleStyle.enabled !== false && (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute left-6 right-6 z-30 flex justify-center text-center select-none cursor-move group"
          style={{
            top:
              subtitleStyle.position === "top"
                ? "10%"
                : subtitleStyle.position === "center"
                  ? "50%"
                  : undefined,
            bottom:
              subtitleStyle.position === "bottom" || !subtitleStyle.position ? "12%" : undefined,
            transform: `translate(${scaledOffsetX}px, ${
              subtitleStyle.position === "center"
                ? `calc(-50% + ${scaledOffsetY}px)`
                : subtitleStyle.position === "bottom"
                  ? `${-scaledOffsetY}px`
                  : `${scaledOffsetY}px`
            })`,
          }}
        >
          <div className="w-full max-w-[340px] h-12 rounded-xl border border-dashed border-transparent group-hover:border-violet-400/70 transition-all flex items-center justify-center pointer-events-auto">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 text-[10px] text-violet-300 px-2.5 py-1 rounded font-mono flex items-center gap-1.5 shadow-lg pointer-events-none">
              <Move className="w-3 h-3" />
              <span>Tarik untuk geser posisi subtitle</span>
            </div>
          </div>
        </div>
      )}

      {/* Top Left Badge: Timestamp & Scene */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white font-bold border border-white/10">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        {activeItem && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-600/80 backdrop-blur-md text-violet-100 font-semibold border border-violet-400/30">
            Motion: {activeItem.motion_effect}
          </span>
        )}
      </div>

      {/* Optional Safe Area Guides Overlay (YouTube Safe Zones) */}
      {showSafeZones && (
        <div className="absolute inset-0 pointer-events-none z-30">
          {/* Action safe 5% */}
          <div className="absolute inset-[5%] border border-dashed border-amber-400/40 rounded-lg flex items-start justify-end p-2">
            <span className="text-[9px] font-mono text-amber-300/80 bg-black/60 px-1 rounded">
              Action Safe 90%
            </span>
          </div>
          {/* Title safe 10% */}
          <div className="absolute inset-[10%] border border-dotted border-emerald-400/40 rounded-lg flex items-end justify-start p-2">
            <span className="text-[9px] font-mono text-emerald-300/80 bg-black/60 px-1 rounded">
              Title Safe 80% (Batas Subtitle)
            </span>
          </div>
        </div>
      )}

      {/* Live Draggable Watermark Overlay */}
      {watermark && watermark.enabled && (
        <WatermarkOverlay
          watermark={watermark}
          containerWidth={containerWidth}
          isDraggable={isWatermarkDraggable}
          onCustomPositionChange={onCustomWatermarkPositionChange}
          onDragEnd={onWatermarkDragEnd}
        />
      )}
    </div>
  );
}

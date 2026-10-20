"use client";

import React from "react";
import {
  Palette,
  Sliders,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
} from "lucide-react";
import { SubtitleStyle } from "@/types";
import { COLOR_THEMES } from "./constants";

interface SubtitleColorsPositionColumnProps {
  style: SubtitleStyle;
  onCommitStyle: (updated: SubtitleStyle, persist?: boolean) => void;
  onApplyColorTheme: (theme: (typeof COLOR_THEMES)[0]) => void;
}

export function SubtitleColorsPositionColumn({
  style,
  onCommitStyle,
  onApplyColorTheme,
}: SubtitleColorsPositionColumnProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      {/* Color Themes & Manual Pickers */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-primary" />
          Warna Teks & Latar
        </span>

        {/* Quick Color Theme Chips */}
        <div className="grid grid-cols-3 gap-1.5">
          {COLOR_THEMES.map((th) => {
            const isActive =
              style.highlight_color.toLowerCase() === th.highlight.toLowerCase() &&
              style.primary_color.toLowerCase() === th.primary.toLowerCase();
            return (
              <button
                key={th.name}
                type="button"
                onClick={() => onApplyColorTheme(th)}
                className={`p-1.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
                  isActive
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40 text-foreground font-semibold"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full border border-black/50"
                    style={{ backgroundColor: th.primary }}
                  />
                  <span
                    className="w-3 h-3 rounded-full border border-black/50"
                    style={{ backgroundColor: th.highlight }}
                  />
                </div>
                <span className="text-[10px] truncate max-w-full font-medium">{th.name}</span>
              </button>
            );
          })}
        </div>

        {/* Granular Color Pickers */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
          {/* Normal Text Color */}
          <div className="p-2 rounded-lg bg-card border border-border">
            <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
              Teks Normal
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={style.primary_color}
                onChange={(e) => onCommitStyle({ ...style, primary_color: e.target.value }, false)}
                onBlur={(e) =>
                  onCommitStyle(
                    { ...style, primary_color: (e.target as HTMLInputElement).value },
                    true
                  )
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                {style.primary_color}
              </span>
            </div>
          </div>

          {/* Highlight Active Word Color */}
          <div className="p-2 rounded-lg bg-card border border-border">
            <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
              Highlight Kata
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={style.highlight_color}
                onChange={(e) =>
                  onCommitStyle({ ...style, highlight_color: e.target.value }, false)
                }
                onBlur={(e) =>
                  onCommitStyle(
                    { ...style, highlight_color: (e.target as HTMLInputElement).value },
                    true
                  )
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-primary text-[11px] font-semibold truncate">
                {style.highlight_color}
              </span>
            </div>
          </div>

          {/* Outline Border Color */}
          <div className="p-2 rounded-lg bg-card border border-border">
            <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
              Garis Luar (Outline)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={style.outline_color}
                onChange={(e) => onCommitStyle({ ...style, outline_color: e.target.value }, false)}
                onBlur={(e) =>
                  onCommitStyle(
                    { ...style, outline_color: (e.target as HTMLInputElement).value },
                    true
                  )
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                {style.outline_color}
              </span>
            </div>
          </div>

          {/* Box Background Color */}
          <div className="p-2 rounded-lg bg-card border border-border">
            <label className="text-muted-foreground block mb-1 text-[10px] font-medium">
              Kotak Latar (Box)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={style.box_color || "#000000"}
                onChange={(e) => onCommitStyle({ ...style, box_color: e.target.value }, false)}
                onBlur={(e) =>
                  onCommitStyle({ ...style, box_color: (e.target as HTMLInputElement).value }, true)
                }
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              <span className="font-mono text-foreground text-[11px] font-semibold truncate">
                {style.box_color || "#000000"}
              </span>
            </div>
          </div>
        </div>

        {/* Sliders: Outline Width & Box Opacity */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <div className="flex justify-between items-center mb-1 text-[11px]">
              <span className="text-muted-foreground">Tebal Outline</span>
              <span className="font-mono text-primary font-bold">{style.outline_width}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={style.outline_width}
              onChange={(e) =>
                onCommitStyle({ ...style, outline_width: parseInt(e.target.value) }, false)
              }
              onPointerUp={(e) =>
                onCommitStyle(
                  { ...style, outline_width: parseInt((e.target as HTMLInputElement).value) },
                  true
                )
              }
              className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1 text-[11px]">
              <span className="text-muted-foreground">Opasitas Kotak</span>
              <span className="font-mono text-primary font-bold">
                {Math.round((style.box_opacity || 0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.box_opacity || 0}
              onChange={(e) =>
                onCommitStyle({ ...style, box_opacity: parseFloat(e.target.value) }, false)
              }
              onPointerUp={(e) =>
                onCommitStyle(
                  { ...style, box_opacity: parseFloat((e.target as HTMLInputElement).value) },
                  true
                )
              }
              className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Screen Position & Precision Offsets */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3 shadow-xs">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-primary" />
          Posisi Layar & Penataan Pixel
        </span>

        {/* Quick Anchor Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() =>
              onCommitStyle({ ...style, position: "bottom", offset_y: -120, offset_x: 0 })
            }
            className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
              style.position === "bottom"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlignVerticalJustifyEnd className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">Bawah</span>
            <span className="text-[9px] text-muted-foreground font-mono">-120px</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onCommitStyle({ ...style, position: "center", offset_y: 0, offset_x: 0 })
            }
            className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
              style.position === "center"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlignVerticalJustifyCenter className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">Tengah</span>
            <span className="text-[9px] text-muted-foreground font-mono">0px</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onCommitStyle({ ...style, position: "top", offset_y: 120, offset_x: 0 })
            }
            className={`py-2 px-2.5 rounded-lg border text-center transition flex flex-col items-center gap-1 cursor-pointer ${
              style.position === "top"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlignVerticalJustifyStart className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold">Atas</span>
            <span className="text-[9px] text-muted-foreground font-mono">+120px</span>
          </button>
        </div>

        {/* Fine-Tuning Vertical Offset Y */}
        <div className="space-y-1.5 p-2.5 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Offset Vertikal (Y)</span>
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="text-primary font-bold">{style.offset_y || 0}px</span>
              <button
                type="button"
                onClick={() => onCommitStyle({ ...style, offset_y: -120 })}
                className="text-[9px] bg-muted hover:bg-surface-hover text-muted-foreground hover:text-white px-1.5 py-0.5 rounded"
                title="Reset ke -120px"
              >
                Reset
              </button>
            </div>
          </div>
          <input
            type="range"
            min={-300}
            max={300}
            step={5}
            value={style.offset_y || 0}
            onChange={(e) => onCommitStyle({ ...style, offset_y: parseInt(e.target.value) }, false)}
            onPointerUp={(e) =>
              onCommitStyle(
                { ...style, offset_y: parseInt((e.target as HTMLInputElement).value) },
                true
              )
            }
            className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
          />
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <div className="flex gap-1">
              {[-20, -5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onCommitStyle({ ...style, offset_y: (style.offset_y || 0) + n })}
                  className="px-2 py-0.5 rounded bg-muted hover:bg-surface-hover text-[10px] text-muted-foreground hover:text-white font-mono"
                >
                  {n}px
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[5, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onCommitStyle({ ...style, offset_y: (style.offset_y || 0) + n })}
                  className="px-2 py-0.5 rounded bg-muted hover:bg-surface-hover text-[10px] text-muted-foreground hover:text-white font-mono"
                >
                  +{n}px
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fine-Tuning Horizontal Offset X */}
        <div className="space-y-1.5 p-2.5 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Offset Horizontal (X)</span>
            <div className="flex items-center gap-1 font-mono text-[11px]">
              <span className="text-primary font-bold">{style.offset_x || 0}px</span>
              <button
                type="button"
                onClick={() => onCommitStyle({ ...style, offset_x: 0 })}
                className="text-[9px] bg-muted hover:bg-surface-hover text-muted-foreground hover:text-white px-1.5 py-0.5 rounded"
                title="Center X: 0px"
              >
                Center
              </button>
            </div>
          </div>
          <input
            type="range"
            min={-200}
            max={200}
            step={5}
            value={style.offset_x || 0}
            onChange={(e) => onCommitStyle({ ...style, offset_x: parseInt(e.target.value) }, false)}
            onPointerUp={(e) =>
              onCommitStyle(
                { ...style, offset_x: parseInt((e.target as HTMLInputElement).value) },
                true
              )
            }
            className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

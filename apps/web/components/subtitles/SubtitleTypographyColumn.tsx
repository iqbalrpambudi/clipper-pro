"use client";

import React from "react";
import { Type, Zap } from "lucide-react";
import { SubtitleStyle } from "@/types";

interface SubtitleTypographyColumnProps {
  style: SubtitleStyle;
  onCommitStyle: (updated: SubtitleStyle, persist?: boolean) => void;
}

export function SubtitleTypographyColumn({ style, onCommitStyle }: SubtitleTypographyColumnProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      {/* Typography Controls */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3.5 shadow-xs">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-primary" />
          Tipografi & Tata Letak
        </span>

        {/* Font Family */}
        <div>
          <label className="text-muted-foreground block mb-1 text-[11px] font-medium">
            Jenis Font (Font Family)
          </label>
          <select
            value={style.font_family}
            onChange={(e) => onCommitStyle({ ...style, font_family: e.target.value })}
            className="w-full px-3 py-1.5 bg-card rounded-lg border border-border text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
          >
            <option value="Montserrat">Montserrat (Modern Viral)</option>
            <option value="Bebas Neue">Bebas Neue (Hormozi Impact)</option>
            <option value="Poppins">Poppins (Clean & Friendly)</option>
            <option value="Inter">Inter (Minimalist Tech)</option>
            <option value="Anton">Anton (Bold Poster)</option>
            <option value="Oswald">Oswald (Condensed)</option>
            <option value="Roboto">Roboto (Neutral Clean)</option>
          </select>
        </div>

        {/* Font Size Slider with Step Buttons */}
        <div>
          <div className="flex justify-between items-center mb-1 text-xs">
            <span className="text-muted-foreground font-medium">Ukuran Huruf (Font Size)</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onCommitStyle({ ...style, font_size: Math.max(28, style.font_size - 4) })
                }
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                title="-4px"
              >
                -4px
              </button>
              <span className="font-mono text-primary font-bold text-xs bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {style.font_size}px
              </span>
              <button
                type="button"
                onClick={() =>
                  onCommitStyle({ ...style, font_size: Math.min(96, style.font_size + 4) })
                }
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                title="+4px"
              >
                +4px
              </button>
            </div>
          </div>
          <input
            type="range"
            min={28}
            max={96}
            step={2}
            value={style.font_size}
            onChange={(e) =>
              onCommitStyle({ ...style, font_size: parseInt(e.target.value) }, false)
            }
            onPointerUp={(e) =>
              onCommitStyle(
                { ...style, font_size: parseInt((e.target as HTMLInputElement).value) },
                true
              )
            }
            className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
          />
        </div>

        {/* Font Weight */}
        <div>
          <label className="text-muted-foreground block mb-1 text-[11px] font-medium">
            Ketebalan Huruf (Weight)
          </label>
          <select
            value={style.font_weight}
            onChange={(e) => onCommitStyle({ ...style, font_weight: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-card rounded-lg border border-border text-foreground text-xs font-semibold focus:outline-none focus:border-primary transition"
          >
            <option value="Bold">Bold (Tebal)</option>
            <option value="ExtraBold">Extra Bold (Sangat Tebal)</option>
            <option value="Black">Black / Heavy</option>
          </select>
        </div>

        {/* Display Mode */}
        <div>
          <label className="text-muted-foreground block mb-1.5 text-[11px] font-medium">
            Mode Penayangan Kata
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onCommitStyle({ ...style, display_mode: "per_word" })}
              className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                style.display_mode === "per_word"
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-xs font-bold text-foreground">Per-Kata</span>
              <span className="text-[9px] text-muted-foreground leading-tight">
                1 kata bergantian
              </span>
            </button>

            <button
              type="button"
              onClick={() => onCommitStyle({ ...style, display_mode: "burst" })}
              className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                style.display_mode === "burst"
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-xs font-bold text-foreground">Burst</span>
              <span className="text-[9px] text-muted-foreground leading-tight">2-3 kata cepat</span>
            </button>

            <button
              type="button"
              onClick={() => onCommitStyle({ ...style, display_mode: "full_sentence" })}
              className={`py-2 px-2 rounded-lg border text-left transition flex flex-col items-start cursor-pointer ${
                style.display_mode === "full_sentence"
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="text-xs font-bold text-foreground">Kalimat</span>
              <span className="text-[9px] text-muted-foreground leading-tight">
                Satu baris penuh
              </span>
            </button>
          </div>
        </div>

        {/* Burst Word Count (if Burst) */}
        {style.display_mode === "burst" && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
            <span className="text-xs font-semibold text-foreground">Kata per Kelompok</span>
            <div className="flex gap-1">
              {[2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => onCommitStyle({ ...style, burst_word_count: count })}
                  className={`px-3 py-1 rounded text-xs font-bold transition ${
                    (style.burst_word_count || 2) === count
                      ? "bg-primary text-black"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {count} Kata
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Motion & Highlight Animation */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3 shadow-xs">
        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-primary" />
          Animasi & Efek Gerak Highlight
        </span>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onCommitStyle({ ...style, highlight_animation: "scale" })}
            className={`p-2 rounded-lg border text-left cursor-pointer transition ${
              style.highlight_animation === "scale"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold text-foreground block">Scale Pop</span>
            <span className="text-[9px] text-muted-foreground">Membesar & loncat</span>
          </button>

          <button
            type="button"
            onClick={() => onCommitStyle({ ...style, highlight_animation: "color" })}
            className={`p-2 rounded-lg border text-left cursor-pointer transition ${
              style.highlight_animation === "color" || !style.highlight_animation
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold text-foreground block">Warna Glow</span>
            <span className="text-[9px] text-muted-foreground">Transisi halus</span>
          </button>

          <button
            type="button"
            onClick={() => onCommitStyle({ ...style, highlight_animation: "none" })}
            className={`p-2 rounded-lg border text-left cursor-pointer transition ${
              style.highlight_animation === "none"
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 font-semibold"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold text-foreground block">Statis</span>
            <span className="text-[9px] text-muted-foreground">Tanpa animasi</span>
          </button>
        </div>

        {/* Zoom Scale Factor Slider */}
        {style.highlight_animation === "scale" && (
          <div className="p-2.5 rounded-lg bg-card border border-border space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium">Tingkat Pembesaran</span>
              <span className="font-mono text-primary font-bold bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {(style.scale_factor || 1.15).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={1.05}
              max={1.65}
              step={0.05}
              value={style.scale_factor || 1.15}
              onChange={(e) =>
                onCommitStyle({ ...style, scale_factor: parseFloat(e.target.value) }, false)
              }
              onPointerUp={(e) =>
                onCommitStyle(
                  {
                    ...style,
                    scale_factor: parseFloat((e.target as HTMLInputElement).value),
                  },
                  true
                )
              }
              className="w-full accent-primary cursor-pointer h-1.5 bg-muted rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Halus (1.05x)</span>
              <span>Standar (1.20x)</span>
              <span>Ekstrem (1.60x)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

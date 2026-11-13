"use client";

import React from "react";
import { Palette } from "lucide-react";
import { api } from "@/lib/api";
import { SubtitleStyle } from "@/types";
import { cn } from "@/lib/utils";
import { HIGHLIGHT_COLORS, POSITION_OFFSET, SUBTITLE_FONTS, SUBTITLE_PRESETS } from "./constants";

interface Props {
  projectId: string;
  style: SubtitleStyle;
  /** immediate=true saves now (clicks); sliders save debounced. */
  onChange: (style: SubtitleStyle, immediate?: boolean) => void;
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-semibold text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition",
              value === o.value
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SubtitleCustomizePanel({ projectId, style, onChange }: Props) {
  const set = (patch: Partial<SubtitleStyle>, immediate = true) => onChange({ ...style, ...patch }, immediate);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">Subtitle</span>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={style.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="accent-primary"
          />
          Tampilkan
        </label>
      </div>

      <div
        className={cn("flex-1 space-y-5 overflow-y-auto p-4", !style.enabled && "pointer-events-none opacity-50")}
      >
        <Choice
          label="Gaya"
          value={style.preset_name}
          options={SUBTITLE_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
          onPick={(id) => set({ preset_name: id, ...SUBTITLE_PRESETS.find((p) => p.id === id)?.style })}
        />

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-foreground">Warna kata aktif</legend>
          <div className="flex gap-2">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Warna ${c}`}
                aria-pressed={style.highlight_color.toUpperCase() === c}
                onClick={() => set({ highlight_color: c })}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition",
                  style.highlight_color.toUpperCase() === c ? "border-primary scale-110" : "border-border"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>

        <Choice
          label="Font"
          value={style.font_family}
          options={SUBTITLE_FONTS.map((f) => ({ value: f, label: f }))}
          onPick={(font_family) => set({ font_family })}
        />

        <div className="space-y-1.5">
          <label htmlFor="sub-size" className="flex justify-between text-xs font-semibold text-foreground">
            <span>Ukuran</span>
            <span className="font-mono text-muted-foreground">{style.font_size}</span>
          </label>
          <input
            id="sub-size"
            type="range"
            min={40}
            max={90}
            step={2}
            value={style.font_size}
            onChange={(e) => set({ font_size: Number(e.target.value) }, false)}
            className="w-full accent-primary"
          />
        </div>

        <Choice
          label="Posisi (geser di preview untuk naik-turun)"
          value={style.position}
          options={[
            { value: "bottom", label: "Bawah" },
            { value: "center", label: "Tengah" },
          ]}
          onPick={(position) => set({ position, offset_y: POSITION_OFFSET[position] })}
        />

        <Choice
          label="Kata per tampilan"
          value={style.burst_word_count}
          options={[
            { value: 1, label: "1 kata" },
            { value: 2, label: "2 kata" },
            { value: 3, label: "3 kata" },
          ]}
          onPick={(burst_word_count) => set({ burst_word_count })}
        />

        <Choice
          label="Animasi kata aktif"
          value={style.highlight_animation}
          options={[
            { value: "scale", label: "Pop" },
            { value: "none", label: "Tanpa" },
          ]}
          onPick={(highlight_animation) => set({ highlight_animation })}
        />

        <div className="flex gap-3 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">Unduh:</span>
          <a href={api.getSubtitleExportUrl(projectId, "ass")} download className="font-semibold text-primary">
            .ASS
          </a>
          <a href={api.getSubtitleExportUrl(projectId, "srt")} download className="font-semibold text-primary">
            .SRT
          </a>
        </div>
      </div>
    </div>
  );
}

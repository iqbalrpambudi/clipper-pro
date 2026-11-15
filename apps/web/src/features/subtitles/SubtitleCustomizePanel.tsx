import { Download } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { api } from "@/lib/api";
import { SubtitleStyle } from "@/types";
import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  POSITION_OFFSET,
  SUBTITLE_FONTS,
  SUBTITLE_PRESETS,
} from "./constants";

interface Props {
  projectId: string;
  style: SubtitleStyle;
  /** immediate=true saves now (clicks); sliders save debounced. */
  onChange: (style: SubtitleStyle, immediate?: boolean) => void;
}

function PillGroup<T extends string | number>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(o.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition",
              active
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SubtitleCustomizePanel({ projectId, style, onChange }: Props) {
  const set = (patch: Partial<SubtitleStyle>, immediate = true) =>
    onChange({ ...style, ...patch }, immediate);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header: Enable Toggle + Quick Export */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <Switch
            checked={style.enabled}
            onCheckedChange={(checked) => set({ enabled: checked })}
            aria-label="Aktifkan subtitle"
          />
          <span className="text-xs font-semibold text-foreground">
            {style.enabled ? "Subtitle Aktif" : "Subtitle Nonaktif"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" asChild className="h-6 gap-1 px-2 text-[11px] font-mono">
            <a href={api.getSubtitleExportUrl(projectId, "ass")} download>
              <Download className="h-3 w-3 text-primary" />
              .ASS
            </a>
          </Button>
          <Button variant="ghost" size="xs" asChild className="h-6 gap-1 px-2 text-[11px] font-mono">
            <a href={api.getSubtitleExportUrl(projectId, "srt")} download>
              <Download className="h-3 w-3 text-primary" />
              .SRT
            </a>
          </Button>
        </div>
      </div>

      {/* Compact Controls */}
      <div
        className={cn(
          "flex-1 divide-y divide-border overflow-y-auto px-4",
          !style.enabled && "pointer-events-none opacity-45"
        )}
      >
        {/* Preset & Highlight Color */}
        <div className="space-y-2.5 py-3">
          <div className="text-xs font-semibold text-foreground">Preset Gaya</div>
          <PillGroup
            value={style.preset_name}
            options={SUBTITLE_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
            onPick={(id) =>
              set({ preset_name: id, ...SUBTITLE_PRESETS.find((p) => p.id === id)?.style })
            }
          />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] font-medium text-muted-foreground">Warna highlight</span>
            <div className="flex items-center gap-1.5">
              {HIGHLIGHT_COLORS.map((c) => {
                const active = style.highlight_color.toUpperCase() === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Warna ${c}`}
                    aria-pressed={active}
                    onClick={() => set({ highlight_color: c })}
                    className={cn(
                      "h-5 w-5 rounded-full border-2 transition",
                      active ? "scale-110 border-primary" : "border-border"
                    )}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Font & Size */}
        <div className="space-y-2.5 py-3">
          <div className="text-xs font-semibold text-foreground">Font &amp; Ukuran</div>
          <PillGroup
            value={style.font_family}
            options={SUBTITLE_FONTS.map((f) => ({ value: f, label: f }))}
            onPick={(font_family) => set({ font_family })}
          />
          <div className="flex items-center gap-3 pt-0.5">
            <label htmlFor="sub-size" className="text-[11px] text-muted-foreground shrink-0">
              Ukuran
            </label>
            <input
              id="sub-size"
              type="range"
              min={40}
              max={90}
              step={2}
              value={style.font_size}
              onChange={(e) => set({ font_size: Number(e.target.value) }, false)}
              className="flex-1 accent-primary"
            />
            <span className="w-7 text-right font-mono text-xs tabular-nums text-foreground">
              {style.font_size}
            </span>
          </div>
        </div>

        {/* Position, Burst, Animation */}
        <div className="space-y-2.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Posisi</span>
            <PillGroup
              value={style.position}
              options={[
                { value: "bottom", label: "Bawah" },
                { value: "center", label: "Tengah" },
              ]}
              onPick={(position) => set({ position, offset_y: POSITION_OFFSET[position] })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Kata / tampil</span>
            <PillGroup
              value={style.burst_word_count}
              options={[
                { value: 1, label: "1" },
                { value: 2, label: "2" },
                { value: 3, label: "3" },
              ]}
              onPick={(burst_word_count) => set({ burst_word_count })}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-foreground">Animasi</span>
            <PillGroup
              value={style.highlight_animation}
              options={[
                { value: "scale", label: "Pop" },
                { value: "none", label: "Tanpa" },
              ]}
              onPick={(highlight_animation) => set({ highlight_animation })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

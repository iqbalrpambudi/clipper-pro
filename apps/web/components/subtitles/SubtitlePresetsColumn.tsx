"use client";

import React from "react";
import Link from "next/link";
import {
  Sparkles,
  CheckCircle2,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Bookmark,
} from "lucide-react";
import { SubtitleStyle, SubtitlePreset } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SubtitlePresetsColumnProps {
  style: SubtitleStyle;
  customPresets: SubtitlePreset[];
  builtinPresets: SubtitlePreset[];
  onToggleEnabled: (enabled: boolean) => void;
  onApplyPreset: (preset: SubtitlePreset) => void;
  onOpenSavePreset: () => void;
  onDeletePreset: (presetId: string, name: string) => void;
}

export function SubtitlePresetsColumn({
  style,
  customPresets,
  builtinPresets,
  onToggleEnabled,
  onApplyPreset,
  onOpenSavePreset,
  onDeletePreset,
}: SubtitlePresetsColumnProps) {
  return (
    <div className="lg:col-span-4 space-y-4">
      {/* Enable / Disable Subtitle Checklist Card */}
      <div className="p-3.5 rounded-xl bg-surface border border-border flex items-center justify-between gap-3 shadow-xs">
        <label
          htmlFor="clipper-subtitles-enable"
          className="flex items-center gap-3 cursor-pointer select-none flex-1"
        >
          <input
            id="clipper-subtitles-enable"
            type="checkbox"
            checked={style.enabled !== false}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <div>
            <span className="text-xs font-bold text-foreground block">
              Gunakan Subtitle pada Video
            </span>
            <span className="text-[10px] text-muted-foreground block">
              {style.enabled !== false
                ? "Subtitle aktif di player monitor dan render final"
                : "Subtitle dinonaktifkan (video bersih tanpa teks)"}
            </span>
          </div>
        </label>

        <Badge
          variant={style.enabled !== false ? "default" : "secondary"}
          className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
            style.enabled !== false
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {style.enabled !== false ? "AKTIF" : "NONAKTIF"}
        </Badge>
      </div>

      {/* Custom Presets Section */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-primary" />
            Preset Kustom Saya
            {customPresets.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary/20 text-primary text-[10px] font-mono flex items-center justify-center">
                {customPresets.length}
              </span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenSavePreset}
            className="h-6 gap-1 px-2 text-[11px] text-primary hover:text-foreground"
          >
            <Plus className="w-3 h-3" />
            <span>Buat Baru</span>
          </Button>
        </div>

        {customPresets.length === 0 ? (
          <div className="p-3 rounded-lg border border-dashed border-border bg-background text-center space-y-1.5">
            <p className="text-[11px] text-muted-foreground">
              Belum ada preset kustom yang dibuat.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSavePreset}
              className="h-6 border-primary/30 text-[10px] font-medium text-primary hover:text-foreground"
            >
              + Simpan Gaya Ini Sebagai Preset
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-0.5 custom-scrollbar">
            {customPresets.map((p) => {
              const isSelected = style.preset_name === (p.preset_name || p.name || p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => onApplyPreset(p)}
                  className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex items-center justify-between group ${
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-foreground truncate">{p.name}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span className="truncate">{p.font_family}</span>
                      <span>•</span>
                      <span>{p.font_size}px</span>
                      <span>•</span>
                      <span className="uppercase">{p.display_mode.replace("_", " ")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <span
                        className="w-3 h-3 rounded-full border border-black/50 shadow-xs"
                        style={{ backgroundColor: p.primary_color || "#FFF" }}
                        title="Warna Teks"
                      />
                      <span
                        className="w-3 h-3 rounded-full border border-black/50 shadow-xs"
                        style={{ backgroundColor: p.highlight_color || "#FFE600" }}
                        title="Warna Highlight"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePreset(p.id, p.name);
                      }}
                      className="w-6 h-6 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center transition opacity-60 group-hover:opacity-100"
                      title="Hapus preset ini"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Builtin Presets Section */}
      <div className="p-3.5 rounded-xl bg-surface border border-border space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Preset Bawaan Sistem
          </span>
          <Link
            href="/settings"
            className="text-[10px] text-primary hover:underline flex items-center gap-1 font-medium"
          >
            <SettingsIcon className="w-3 h-3" />
            <span>Pengaturan</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {builtinPresets.map((p) => {
            const isSelected = style.preset_name === (p.preset_name || p.id || p.name);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onApplyPreset(p)}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40 shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
              >
                <div className="flex items-center justify-between mb-1 w-full">
                  <span className="text-xs font-semibold text-foreground truncate">{p.name}</span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                </div>

                <div className="flex items-center justify-between w-full pt-1.5 border-t border-white/5">
                  <div className="flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/40"
                      style={{ backgroundColor: p.primary_color || "#FFF" }}
                      title="Warna Teks"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/40"
                      style={{ backgroundColor: p.highlight_color || "#FFE600" }}
                      title="Warna Highlight"
                    />
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground uppercase">
                    {p.display_mode === "per_word"
                      ? "Word"
                      : p.display_mode === "burst"
                        ? "Burst"
                        : "Line"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

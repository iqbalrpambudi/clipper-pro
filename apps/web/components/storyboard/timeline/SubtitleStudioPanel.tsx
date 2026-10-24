"use client";

import React from "react";
import {
  Type,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Save,
  X,
  CheckCircle2,
  Zap,
  Sliders,
  Palette,
  Move,
  LucideIcon,
} from "lucide-react";
import { UseMutationResult } from "@tanstack/react-query";
import { SubtitleStyle } from "@/types";
import {
  Button,
  Badge,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import { SubtitleCustomPreset } from "@/lib/presetStorage";
import { COLOR_PRESETS } from "./constants";

// ─── Shared sub-components ───

function SectionCard({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#26251F]">
          <Icon className="w-3.5 h-3.5 text-[#C45B3A]" />
          <span>{title}</span>
        </span>
        {badge}
      </div>
      {children}
    </div>
  );
}

const CARD_SELECTED = "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42] font-semibold";
const CARD_DEFAULT = "bg-[#F3F0E8] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]";

function OptionGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { id: T; label: string; desc?: string }[];
  value: T | undefined;
  onChange: (id: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-1.5 ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`p-2 rounded-xl text-center border transition flex flex-col items-center ${
            value === o.id ? CARD_SELECTED : CARD_DEFAULT
          }`}
        >
          <span className="text-xs font-bold">{o.label}</span>
          {o.desc && <span className="text-[9px] text-muted-foreground">{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="p-2.5 rounded-xl bg-[#FBFAF7] border border-[#E5E1D7]">
      <label className="text-[#77766D] block mb-1 text-[10px] font-medium uppercase font-mono">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
        />
        <span className="font-mono text-[#26251F] text-xs font-semibold">{value}</span>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  ticks,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  ticks?: [string, string, string];
}) {
  const display = format ? format(value) : `${value}`;
  return (
    <div>
      <div className="flex justify-between items-center mb-1 text-[11px] font-semibold text-[#4D4A42]">
        <span>{label}</span>
        <span className="font-mono text-[#C45B3A] font-bold bg-[#F8EEEA] px-2 py-0.5 rounded border border-[#E9C9BD]">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 h-2 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
      />
      {ticks && (
        <div className="flex justify-between text-[10px] text-[#858176]">
          <span>{ticks[0]}</span>
          <span>{ticks[1]}</span>
          <span>{ticks[2]}</span>
        </div>
      )}
    </div>
  );
}

interface SubtitleStudioPanelProps {
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: React.Dispatch<React.SetStateAction<SubtitleStyle>>;
  updateStyleMutation: UseMutationResult<unknown, Error, SubtitleStyle>;
  customSubtitlePresets: SubtitleCustomPreset[];
  selectedSubtitlePresetId: string;
  handleLoadSubtitlePreset: (presetId: string) => void;
  handleDeleteSubtitlePreset: (id: string, name: string) => void;
  showSaveSubtitleModal: boolean;
  setShowSaveSubtitleModal: (show: boolean) => void;
  newSubtitlePresetName: string;
  setNewSubtitlePresetName: (name: string) => void;
  handleSaveSubtitlePreset: (e: React.FormEvent) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function SubtitleStudioPanel({
  subtitleStyle,
  setSubtitleStyle,
  updateStyleMutation,
  customSubtitlePresets,
  selectedSubtitlePresetId,
  handleLoadSubtitlePreset,
  handleDeleteSubtitlePreset,
  showSaveSubtitleModal,
  setShowSaveSubtitleModal,
  newSubtitlePresetName,
  setNewSubtitlePresetName,
  handleSaveSubtitlePreset,
  showToast,
}: SubtitleStudioPanelProps) {
  return (
    <div className="space-y-4">
      {/* Checklist Toggle: Enable / Disable Subtitle */}
      <div className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <label
            htmlFor="subtitle-enable-check"
            className="flex items-center gap-3 cursor-pointer select-none flex-1"
          >
            <input
              id="subtitle-enable-check"
              type="checkbox"
              checked={subtitleStyle.enabled !== false}
              onChange={(e) => {
                const checked = e.target.checked;
                const updated: SubtitleStyle = {
                  ...subtitleStyle,
                  enabled: checked,
                };
                setSubtitleStyle(updated);
                updateStyleMutation.mutate(updated);
                showToast(
                  checked
                    ? "Subtitle diaktifkan."
                    : "Subtitle dinonaktifkan (video bersih tanpa subtitle).",
                  "info"
                );
              }}
              className="w-4 h-4 rounded accent-[#C45B3A] cursor-pointer"
            />
            <div>
              <span className="block text-xs font-semibold text-[#26251F]">
                Gunakan Subtitle pada Video
              </span>
              <span className="text-[10px] text-muted-foreground block">
                {subtitleStyle.enabled !== false
                  ? "Subtitle tampil di preview dan akan dibakar ke render video"
                  : "Video bersih tanpa teks (hanya visual adegan & audio narasi)"}
              </span>
            </div>
          </label>

          <Badge
            variant={subtitleStyle.enabled !== false ? "default" : "secondary"}
            className={`text-[10px] font-mono px-2 py-0.5 shrink-0 ${
              subtitleStyle.enabled !== false
                ? "bg-[#F8EEEA] text-[#A9472C] border border-[#C45B3A]/40"
                : "bg-[#F1EEE6] text-[#77766D] border border-[#E5E1D7]"
            }`}
          >
            {subtitleStyle.enabled !== false ? "AKTIF" : "NONAKTIF"}
          </Badge>
        </div>
      </div>

      {/* Preset Subtitle Kustom Tersimpan */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-[#4D4A42]">
            <Bookmark className="w-3.5 h-3.5 text-[#C45B3A]" />
            <span>Preset Subtitle Kustom</span>
          </label>
          {selectedSubtitlePresetId && (
            <button
              type="button"
              onClick={() => {
                const cur = customSubtitlePresets.find((p) => p.id === selectedSubtitlePresetId);
                if (cur) handleDeleteSubtitlePreset(cur.id, cur.name);
              }}
              title="Hapus Preset Ini"
              className="flex items-center gap-1 text-[11px] text-[#A9472C] hover:underline"
            >
              <Trash2 className="w-3 h-3" />
              <span>Hapus Preset</span>
            </button>
          )}
        </div>
        <Select
          value={selectedSubtitlePresetId || undefined}
          onValueChange={(val) => handleLoadSubtitlePreset(val)}
        >
          <SelectTrigger className="h-9 w-full text-xs font-medium">
            <SelectValue placeholder="-- Muat Preset Subtitle --" />
          </SelectTrigger>
          <SelectContent appearance="workspace">
            {customSubtitlePresets.length === 0 ? (
              <SelectItem value="__empty" disabled className="text-xs">
                Belum ada preset kustom
              </SelectItem>
            ) : (
              customSubtitlePresets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Presets 1-Click */}
      <div>
        <label className="text-[11px] font-semibold text-[#4D4A42] mb-2 flex items-center justify-between">
          <span>Pilihan Gaya Preset Cepat:</span>
          <span className="text-[10px] text-[#C45B3A] font-mono">1-Click Theme</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {COLOR_PRESETS.map((p) => {
            const isSelected =
              subtitleStyle.preset_name === p.name.toLowerCase().replace(/\s+/g, "_");
            const Icon = p.icon;
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  const updated: SubtitleStyle = {
                    ...subtitleStyle,
                    preset_name: p.name.toLowerCase().replace(/\s+/g, "_"),
                    font_family: p.font_family,
                    font_weight: p.font_weight,
                    primary_color: p.primary_color,
                    highlight_color: p.highlight_color,
                    outline_color: p.outline_color,
                    outline_width: p.outline_width,
                    box_color: p.box_color,
                    box_opacity: p.box_opacity,
                    display_mode: p.display_mode,
                    burst_word_count: p.burst_word_count,
                    highlight_animation: p.highlight_animation,
                    scale_factor: p.scale_factor,
                  };
                  setSubtitleStyle(updated);
                  updateStyleMutation.mutate(updated);
                }}
                className={`p-2 rounded-xl text-xs border text-left flex items-center justify-between transition ${
                  isSelected
                    ? "bg-[#F8EEEA] border-[#C45B3A] text-[#A9472C] font-semibold"
                    : "bg-[#FFFEFA] border-[#E5E1D7] text-[#4D4A42] hover:border-[#C45B3A]"
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icon className="w-3.5 h-3.5 text-[#C45B3A] shrink-0" />
                  <span className="truncate">{p.name}</span>
                  {isSelected && <CheckCircle2 className="w-3 h-3 text-[#C45B3A] shrink-0" />}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.primary_color }}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.highlight_color }}
                  />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-black/40"
                    style={{ backgroundColor: p.outline_color }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode Tampilan Kata */}
      <SectionCard icon={Type} title="Mode Tampilan Kata">
        <OptionGrid
          options={[
            { id: "burst", label: "Burst", desc: "Kelompok kata" },
            { id: "per_word", label: "Per-Kata", desc: "1 kata bergantian" },
            { id: "full_sentence", label: "Kalimat", desc: "Baris penuh" },
          ]}
          value={subtitleStyle.display_mode}
          onChange={(id) =>
            setSubtitleStyle((prev) => ({
              ...prev,
              display_mode: id as SubtitleStyle["display_mode"],
            }))
          }
        />

        {subtitleStyle.display_mode === "burst" && (
          <div className="mt-1 flex items-center justify-between rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2">
            <span className="text-xs font-semibold text-[#4D4A42]">Kata per Kelompok Burst</span>
            <div className="flex gap-1.5">
              {[2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() =>
                    setSubtitleStyle((prev) => ({
                      ...prev,
                      burst_word_count: count,
                    }))
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    (subtitleStyle.burst_word_count || 2) === count
                      ? "bg-[#C45B3A] text-white shadow-sm"
                      : "bg-[#FFFEFA] text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  {count} Kata
                </button>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Animasi & Efek Gerak Highlight */}
      <SectionCard
        icon={Zap}
        title="Animasi & Efek Gerak Highlight"
        badge={
          <span className="text-[10px] font-mono text-[#A9472C] uppercase px-2 py-0.5 rounded bg-[#F8EEEA] border border-[#E9C9BD]">
            {subtitleStyle.highlight_animation === "scale"
              ? "Scale Pop"
              : subtitleStyle.highlight_animation === "none"
                ? "Statis"
                : "Warna Glow"}
          </span>
        }
      >
        <OptionGrid
          options={[
            { id: "color", label: "Warna Glow", desc: "Transisi halus glow" },
            { id: "scale", label: "Scale Pop", desc: "Membesar & loncat" },
            { id: "none", label: "Statis", desc: "Tanpa animasi" },
          ]}
          value={subtitleStyle.highlight_animation || "color"}
          onChange={(id) =>
            setSubtitleStyle((prev) => ({ ...prev, highlight_animation: id as SubtitleStyle["highlight_animation"] }))
          }
        />

        {subtitleStyle.highlight_animation === "scale" && (
          <div className="p-2.5 rounded-lg bg-[#FBFAF7] border border-[#E5E1D7] mt-2">
            <SliderField
              label="Tingkat Pembesaran (Scale Factor)"
              value={subtitleStyle.scale_factor || 1.15}
              min={1.05}
              max={1.65}
              step={0.05}
              onChange={(v) => setSubtitleStyle((prev) => ({ ...prev, scale_factor: v }))}
              format={(v) => `${v.toFixed(2)}x`}
              ticks={["Halus (1.05x)", "Standar (1.20x)", "Ekstrem (1.60x)"]}
            />
          </div>
        )}
      </SectionCard>

      {/* Tipografi: Jenis Font & Ketebalan */}
      <SectionCard icon={Sliders} title="Tipografi & Ukuran Teks">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="text-[11px] font-semibold text-[#4D4A42] block mb-1">
              Jenis Font:
            </label>
            <Select
              value={subtitleStyle.font_family || "Poppins"}
              onValueChange={(val) =>
                setSubtitleStyle((prev) => ({ ...prev, font_family: val }))
              }
            >
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent appearance="workspace">
                <SelectItem value="Poppins" className="text-xs">
                  Poppins (Modern Sans)
                </SelectItem>
                <SelectItem value="Montserrat" className="text-xs">
                  Montserrat (Geometric)
                </SelectItem>
                <SelectItem value="Bebas Neue" className="text-xs">
                  Bebas Neue (Punch)
                </SelectItem>
                <SelectItem value="Anton" className="text-xs">
                  Anton (Bold Heavy)
                </SelectItem>
                <SelectItem value="Oswald" className="text-xs">
                  Oswald (Condensed)
                </SelectItem>
                <SelectItem value="Inter" className="text-xs">
                  Inter (Clean)
                </SelectItem>
                <SelectItem value="Roboto" className="text-xs">
                  Roboto (Neutral)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-[#4D4A42] block mb-1">
              Ketebalan Font:
            </label>
            <Select
              value={subtitleStyle.font_weight || "Bold"}
              onValueChange={(val) =>
                setSubtitleStyle((prev) => ({
                  ...prev,
                  font_weight: val,
                }))
              }
            >
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent appearance="workspace">
                <SelectItem value="Bold" className="text-xs">
                  Bold (Tebal)
                </SelectItem>
                <SelectItem value="SemiBold" className="text-xs">
                  SemiBold (Sedang Tebal)
                </SelectItem>
                <SelectItem value="Medium" className="text-xs">
                  Medium (Sedang)
                </SelectItem>
                <SelectItem value="Regular" className="text-xs">
                  Regular (Normal)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SliderField
          label="Ukuran Font"
          value={subtitleStyle.font_size || 38}
          min={20}
          max={72}
          step={1}
          onChange={(v) => setSubtitleStyle((prev) => ({ ...prev, font_size: v }))}
          format={(v) => `${v}px`}
          ticks={["Kecil (24px)", "Sedang (38px)", "Besar (64px)"]}
        />
      </SectionCard>

      {/* Palet Warna, Garis Luar (Outer Text), & Kotak Latar */}
      <SectionCard icon={Palette} title="Warna Teks & Garis Luar (Outer Text)">
        <div className="grid grid-cols-2 gap-2.5">
          <ColorField
            label="Teks Normal"
            value={subtitleStyle.primary_color || "#FFFFFF"}
            onChange={(c) => setSubtitleStyle((prev) => ({ ...prev, primary_color: c }))}
          />
          <ColorField
            label="Highlight Kata"
            value={subtitleStyle.highlight_color || "#FFE600"}
            onChange={(c) => setSubtitleStyle((prev) => ({ ...prev, highlight_color: c }))}
          />
          <ColorField
            label="Garis Luar (Outer)"
            value={subtitleStyle.outline_color || "#000000"}
            onChange={(c) => setSubtitleStyle((prev) => ({ ...prev, outline_color: c }))}
          />
          <ColorField
            label="Kotak Latar (Box)"
            value={subtitleStyle.box_color || "#000000"}
            onChange={(c) => setSubtitleStyle((prev) => ({ ...prev, box_color: c }))}
          />
        </div>

        {/* Sliders: Tebal Outline & Opasitas Kotak */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <SliderField
            label="Tebal Outline"
            value={subtitleStyle.outline_width ?? 4}
            min={0}
            max={10}
            step={1}
            onChange={(v) => setSubtitleStyle((prev) => ({ ...prev, outline_width: Math.round(v) }))}
            format={(v) => `${v}px`}
          />
          <SliderField
            label="Opasitas Kotak"
            value={subtitleStyle.box_opacity || 0}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setSubtitleStyle((prev) => ({ ...prev, box_opacity: v }))}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </SectionCard>

      {/* Posisi Layar & Offset */}
      <SectionCard
        icon={Move}
        title="Posisi Layar Subtitle"
        badge={
          <button
            type="button"
            onClick={() =>
              setSubtitleStyle((prev) => ({
                ...prev,
                position: "bottom",
                offset_x: 0,
                offset_y: -30,
              }))
            }
            className="text-[10px] text-[#C45B3A] hover:underline"
          >
            Reset Posisi
          </button>
        }
      >
        <OptionGrid
          options={[
            { id: "top", label: "Atas" },
            { id: "center", label: "Tengah" },
            { id: "bottom", label: "Bawah" },
          ]}
          value={subtitleStyle.position}
          onChange={(id) =>
            setSubtitleStyle((prev) => ({
              ...prev,
              position: id as SubtitleStyle["position"],
              offset_y: id === "bottom" ? -30 : 0,
            }))
          }
        />

        <SliderField
          label="Offset Posisi Vertikal (Y)"
          value={subtitleStyle.offset_y || 0}
          min={-120}
          max={120}
          step={2}
          onChange={(v) => setSubtitleStyle((prev) => ({ ...prev, offset_y: Math.round(v) }))}
          format={(v) => `${v}px`}
          ticks={["Lebih Rendah", "Bisa digeser langsung di preview", "Lebih Tinggi"]}
        />
      </SectionCard>

      {/* Bottom Action & Save Preset Bar */}
      <div className="mt-4 space-y-2 pt-2 border-t border-[#E5E1D7]">
        {showSaveSubtitleModal && (
          <form
            onSubmit={handleSaveSubtitlePreset}
            className="space-y-2 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-[#26251F]">
              <span className="flex items-center gap-1.5">
                <BookmarkPlus className="w-3.5 h-3.5 text-[#C45B3A]" />
                <span>Simpan Preset Subtitle Baru</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSaveSubtitleModal(false)}
                className="text-[#77766D] hover:text-[#26251F]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Nama preset subtitle (mis. Style Kuning Bold)..."
                value={newSubtitlePresetName}
                onChange={(e) => setNewSubtitlePresetName(e.target.value)}
                autoFocus
                className="h-9 flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                variant="workspace-primary"
                className="h-9 shrink-0 gap-1 px-3 text-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan</span>
              </Button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSaveSubtitleModal(!showSaveSubtitleModal)}
            className="h-10 shrink-0 gap-1.5 px-3 text-xs border-[#E5E1D7] bg-[#FFFEFA] text-[#4D4A42] hover:bg-[#F8EEEA] hover:text-[#A9472C]"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-[#C45B3A]" />
            <span>Simpan Preset</span>
          </Button>

          <Button
            onClick={() => updateStyleMutation.mutate(subtitleStyle)}
            disabled={updateStyleMutation.isPending}
            variant="workspace-primary"
            className="h-10 flex-1 gap-2 text-xs"
          >
            {updateStyleMutation.isPending ? (
              <span>Menyimpan...</span>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Simpan Gaya Subtitle</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

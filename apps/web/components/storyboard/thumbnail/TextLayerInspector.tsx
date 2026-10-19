"use client";

import React from "react";
import {
  Type,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  Layers,
  Square,
  Sun,
  Palette,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ThumbnailTextLayer } from "@/types";
import { AVAILABLE_FONTS, createDefaultTextLayer } from "./thumbnailPresets";
import { Button, Input, Switch, Slider, Badge } from "@/components/ui";

interface TextLayerInspectorProps {
  layers: ThumbnailTextLayer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, updates: Partial<ThumbnailTextLayer>) => void;
  onAddLayer: (newLayer: ThumbnailTextLayer) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  onReorderLayer: (layerId: string, direction: "up" | "down") => void;
}

const COLOR_PRESETS = [
  { label: "Putih", value: "#FFFFFF" },
  { label: "Kuning Viral", value: "#FFE600" },
  { label: "Merah YouTube", value: "#FF1E27" },
  { label: "Cyan Neon", value: "#00F0FF" },
  { label: "Hijau Neon", value: "#22C55E" },
  { label: "Hitam Pekat", value: "#000000" },
  { label: "Oranye", value: "#FF7A00" },
];

const BG_COLOR_PRESETS = [
  { label: "Merah YouTube", value: "#E50914" },
  { label: "Hitam Solid", value: "#000000" },
  { label: "Hitam Transparan", value: "rgba(15, 23, 42, 0.9)" },
  { label: "Kuning Punchy", value: "#FFE600" },
  { label: "Biru Elektrik", value: "#2563EB" },
  { label: "Hijau Stabilo", value: "#22C55E" },
];

export function TextLayerInspector({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onDeleteLayer,
  onDuplicateLayer,
  onReorderLayer,
}: TextLayerInspectorProps) {
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) || null;

  return (
    <div className="space-y-4">
      {/* Top Bar: Layer Tabs & Add Layer */}
      <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white tracking-wide">Daftar Layer Teks</h4>
            <Badge variant="outline" className="border-[#333] text-[10px] text-slate-400 py-0">
              {layers.length} Layer
            </Badge>
          </div>

          <Button
            size="sm"
            onClick={() => {
              const newLayer = createDefaultTextLayer({
                y: 100 + layers.length * 70,
                text: `HOOK BARIS ${layers.length + 1}`,
              });
              onAddLayer(newLayer);
              onSelectLayer(newLayer.id);
            }}
            className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold h-7 px-2.5 shadow-sm shadow-amber-500/20"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            <span>Tambah Teks</span>
          </Button>
        </div>

        {/* Layer Cards Horizontal / Vertical Pill List */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {layers.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-[#2E2E2E] rounded-lg">
              Belum ada layer teks. Klik tombol <span className="text-amber-400 font-semibold">+ Tambah Teks</span> di atas.
            </div>
          ) : (
            layers.map((layer, index) => {
              const isSelected = layer.id === selectedLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => onSelectLayer(layer.id)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? "bg-amber-500/10 border-amber-500/40 text-white shadow-sm"
                      : "bg-[#1E1E1E] border-[#2A2A2A] text-slate-300 hover:bg-[#252525]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded bg-black/40 flex items-center justify-center text-[10px] font-mono text-slate-400">
                      {index + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold truncate block">{layer.text || "(Teks Kosong)"}</span>
                      <span className="text-[10px] text-muted-foreground truncate block">
                        {layer.fontFamily} • {layer.fontSize}px {layer.bgEnabled ? "• Box Highlight" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Geser Naik"
                      disabled={index === 0}
                      onClick={() => onReorderLayer(layer.id, "up")}
                      className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      title="Geser Turun"
                      disabled={index === layers.length - 1}
                      onClick={() => onReorderLayer(layer.id, "down")}
                      className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      title="Duplikat Layer"
                      onClick={() => onDuplicateLayer(layer.id)}
                      className="p-1 rounded text-slate-400 hover:text-amber-400"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      title="Hapus Layer"
                      onClick={() => onDeleteLayer(layer.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Selected Layer Inspector Controls */}
      {selectedLayer ? (
        <div className="space-y-4">
          {/* SECTION 1: Text Content & Styling */}
          <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white">Edit Isi Teks & Tipografi</h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateLayer(selectedLayer.id, {
                    text: selectedLayer.text.toUpperCase(),
                  })
                }
                className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-[#333]"
              >
                HURUF BESAR SEMUA
              </button>
            </div>

            {/* Text Input */}
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                Isi Teks Layer
              </label>
              <Input
                value={selectedLayer.text}
                onChange={(e) =>
                  onUpdateLayer(selectedLayer.id, {
                    text: e.target.value,
                  })
                }
                placeholder="Masukkan teks hook thumbnail..."
                className="bg-black/40 border-[#2E2E2E] text-xs font-bold tracking-wide focus:border-amber-500/50"
              />
            </div>

            {/* Font Family Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 block">
                Jenis Font YouTube ({selectedLayer.fontFamily})
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {AVAILABLE_FONTS.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        fontFamily: font.id,
                      })
                    }
                    className={`p-2 rounded-lg border text-left transition-all ${
                      selectedLayer.fontFamily === font.id
                        ? "bg-amber-500/20 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                        : "bg-[#1E1E1E] border-[#2A2A2A] text-slate-300 hover:bg-[#252525]"
                    }`}
                  >
                    <div
                      className="text-xs font-black truncate"
                      style={{ fontFamily: `'${font.id}', sans-serif` }}
                    >
                      {font.id}
                    </div>
                    <div className="text-[9px] text-muted-foreground truncate">
                      {font.name.split(" ")[0]}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">Ukuran Font</span>
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {selectedLayer.fontSize}px
                </span>
              </div>
              <Slider
                value={[selectedLayer.fontSize]}
                min={24}
                max={110}
                step={2}
                onValueChange={([val]) =>
                  onUpdateLayer(selectedLayer.id, {
                    fontSize: val,
                  })
                }
                className="py-1 cursor-pointer"
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {[36, 48, 56, 68, 80].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        fontSize: sz,
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      selectedLayer.fontSize === sz
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-[#202020] text-slate-400 border-[#333]"
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            {/* Text Color Picker */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-semibold text-slate-300 block">
                Warna Teks
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {COLOR_PRESETS.map((cp) => (
                  <button
                    key={cp.value}
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        fill: cp.value,
                      })
                    }
                    className={`w-6 h-6 rounded-md border transition-transform ${
                      selectedLayer.fill === cp.value
                        ? "scale-110 ring-2 ring-amber-400 border-white"
                        : "border-[#444] hover:scale-105"
                    }`}
                    style={{ backgroundColor: cp.value }}
                    title={cp.label}
                  />
                ))}
                <div className="flex items-center gap-1.5 pl-2 border-l border-[#333]">
                  <input
                    type="color"
                    value={selectedLayer.fill.startsWith("#") ? selectedLayer.fill : "#FFFFFF"}
                    onChange={(e) =>
                      onUpdateLayer(selectedLayer.id, {
                        fill: e.target.value,
                      })
                    }
                    className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                    title="Pilih Warna Kustom"
                  />
                  <span className="font-mono text-[10px] text-slate-400">
                    {selectedLayer.fill}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Background Highlight Box (Photoshop / Canva Pill Style) */}
          <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Square className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-bold text-white">Box Highlight / Background Pill</h4>
                  <p className="text-[10px] text-muted-foreground">Kotak warna di belakang teks ala thumbnail viral</p>
                </div>
              </div>

              <Switch
                checked={selectedLayer.bgEnabled ?? false}
                onCheckedChange={(checked) =>
                  onUpdateLayer(selectedLayer.id, {
                    bgEnabled: checked,
                    bgFill: selectedLayer.bgFill || "#E50914",
                    bgCornerRadius: selectedLayer.bgCornerRadius ?? 8,
                    bgPaddingX: selectedLayer.bgPaddingX ?? 16,
                    bgPaddingY: selectedLayer.bgPaddingY ?? 8,
                  })
                }
              />
            </div>

            {selectedLayer.bgEnabled && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                {/* Background Color */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Warna Background Box
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {BG_COLOR_PRESETS.map((bp) => (
                      <button
                        key={bp.value}
                        type="button"
                        onClick={() =>
                          onUpdateLayer(selectedLayer.id, {
                            bgFill: bp.value,
                          })
                        }
                        className={`w-6 h-6 rounded-md border transition-transform ${
                          selectedLayer.bgFill === bp.value
                            ? "scale-110 ring-2 ring-emerald-400 border-white"
                            : "border-[#444] hover:scale-105"
                        }`}
                        style={{ backgroundColor: bp.value }}
                        title={bp.label}
                      />
                    ))}
                    <div className="flex items-center gap-1.5 pl-2 border-l border-[#333]">
                      <input
                        type="color"
                        value={
                          selectedLayer.bgFill?.startsWith("#")
                            ? selectedLayer.bgFill
                            : "#E50914"
                        }
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            bgFill: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                        title="Pilih Warna Kustom"
                      />
                      <span className="font-mono text-[10px] text-slate-400">
                        {selectedLayer.bgFill}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Corner Radius (Rounded Pill) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Kelengkungan Sudut (Corner Radius)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {selectedLayer.bgCornerRadius ?? 8}px
                    </span>
                  </div>
                  <Slider
                    value={[selectedLayer.bgCornerRadius ?? 8]}
                    min={0}
                    max={32}
                    step={2}
                    onValueChange={([val]) =>
                      onUpdateLayer(selectedLayer.id, {
                        bgCornerRadius: val,
                      })
                    }
                    className="py-1 cursor-pointer"
                  />
                  <div className="flex gap-1.5 pt-0.5">
                    {[
                      { label: "Kotak Tajam (0px)", val: 0 },
                      { label: "Rounded (8px)", val: 8 },
                      { label: "Pill Bulat (24px)", val: 24 },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() =>
                          onUpdateLayer(selectedLayer.id, {
                            bgCornerRadius: btn.val,
                          })
                        }
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#202020] text-slate-400 hover:text-white border border-[#333]"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Padding */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Padding Box (Jarak Tepi)
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      {selectedLayer.bgPaddingX ?? 16}px
                    </span>
                  </div>
                  <Slider
                    value={[selectedLayer.bgPaddingX ?? 16]}
                    min={6}
                    max={36}
                    step={2}
                    onValueChange={([val]) =>
                      onUpdateLayer(selectedLayer.id, {
                        bgPaddingX: val,
                        bgPaddingY: Math.round(val * 0.5),
                      })
                    }
                    className="py-1 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Outline / Stroke Teks */}
          <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-cyan-400" />
                <div>
                  <h4 className="text-xs font-bold text-white">Outline / Stroke Teks</h4>
                  <p className="text-[10px] text-muted-foreground">Garis tepi luar tebal agar teks sangat terbaca</p>
                </div>
              </div>

              <Switch
                checked={selectedLayer.strokeEnabled ?? true}
                onCheckedChange={(checked) =>
                  onUpdateLayer(selectedLayer.id, {
                    strokeEnabled: checked,
                    stroke: selectedLayer.stroke || "#000000",
                    strokeWidth: selectedLayer.strokeWidth || 5,
                  })
                }
              />
            </div>

            {selectedLayer.strokeEnabled && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Ketebalan Stroke (Width)
                    </span>
                    <span className="font-mono text-[11px] text-cyan-400">
                      {selectedLayer.strokeWidth ?? 5}px
                    </span>
                  </div>
                  <Slider
                    value={[selectedLayer.strokeWidth ?? 5]}
                    min={1}
                    max={14}
                    step={1}
                    onValueChange={([val]) =>
                      onUpdateLayer(selectedLayer.id, {
                        strokeWidth: val,
                      })
                    }
                    className="py-1 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Warna Stroke
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {["#000000", "#FFFFFF", "#FF1E27", "#FFE600", "#0F172A"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          onUpdateLayer(selectedLayer.id, {
                            stroke: c,
                          })
                        }
                        className={`w-6 h-6 rounded-md border ${
                          selectedLayer.stroke === c
                            ? "scale-110 ring-2 ring-cyan-400 border-white"
                            : "border-[#444]"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <div className="flex items-center gap-1.5 pl-2 border-l border-[#333]">
                      <input
                        type="color"
                        value={selectedLayer.stroke || "#000000"}
                        onChange={(e) =>
                          onUpdateLayer(selectedLayer.id, {
                            stroke: e.target.value,
                          })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <span className="font-mono text-[10px] text-slate-400">
                        {selectedLayer.stroke || "#000000"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Shadow & 3D Pop Effect */}
          <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-purple-400" />
                <div>
                  <h4 className="text-xs font-bold text-white">Bayangan / 3D Pop / Glow</h4>
                  <p className="text-[10px] text-muted-foreground">Efek dimensi agar teks timbul dari latar belakang</p>
                </div>
              </div>

              <Switch
                checked={selectedLayer.shadowEnabled ?? true}
                onCheckedChange={(checked) =>
                  onUpdateLayer(selectedLayer.id, {
                    shadowEnabled: checked,
                    shadowColor: selectedLayer.shadowColor || "rgba(0,0,0,0.85)",
                    shadowBlur: selectedLayer.shadowBlur ?? 6,
                    shadowOffsetX: selectedLayer.shadowOffsetX ?? 4,
                    shadowOffsetY: selectedLayer.shadowOffsetY ?? 4,
                    shadowOpacity: selectedLayer.shadowOpacity ?? 0.85,
                  })
                }
              />
            </div>

            {selectedLayer.shadowEnabled && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                {/* Preset Shadow Style Buttons */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        shadowBlur: 8,
                        shadowOffsetX: 2,
                        shadowOffsetY: 4,
                        shadowColor: "rgba(0,0,0,0.8)",
                      })
                    }
                    className="p-1.5 rounded-lg border border-[#333] bg-[#202020] hover:bg-[#252525] text-[10px] text-slate-300 font-semibold"
                  >
                    ☁️ Soft Drop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        shadowBlur: 0,
                        shadowOffsetX: 6,
                        shadowOffsetY: 6,
                        shadowColor: "#000000",
                        shadowOpacity: 1,
                      })
                    }
                    className="p-1.5 rounded-lg border border-[#333] bg-[#202020] hover:bg-[#252525] text-[10px] text-slate-300 font-semibold"
                  >
                    💥 3D Solid Pop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        shadowBlur: 18,
                        shadowOffsetX: 0,
                        shadowOffsetY: 0,
                        shadowColor: selectedLayer.fill || "#FFE600",
                        shadowOpacity: 0.9,
                      })
                    }
                    className="p-1.5 rounded-lg border border-[#333] bg-[#202020] hover:bg-[#252525] text-[10px] text-slate-300 font-semibold"
                  >
                    ✨ Outer Glow
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Blur Bayangan
                    </span>
                    <span className="font-mono text-[11px] text-purple-400">
                      {selectedLayer.shadowBlur ?? 6}px
                    </span>
                  </div>
                  <Slider
                    value={[selectedLayer.shadowBlur ?? 6]}
                    min={0}
                    max={24}
                    step={1}
                    onValueChange={([val]) =>
                      onUpdateLayer(selectedLayer.id, {
                        shadowBlur: val,
                      })
                    }
                    className="py-1 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: Rotation & Transform */}
          <div className="p-3.5 rounded-xl bg-[#181818] border border-[#2E2E2E] space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-orange-400" />
                <h4 className="text-xs font-bold text-white">Kemiringan (Rotasi)</h4>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateLayer(selectedLayer.id, {
                    rotation: 0,
                  })
                }
                className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-[#333]"
              >
                Reset 0° (Lurus)
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] font-semibold text-slate-300">
                  Derajat Rotasi
                </span>
                <span className="font-mono text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                  {selectedLayer.rotation || 0}°
                </span>
              </div>
              <Slider
                value={[selectedLayer.rotation || 0]}
                min={-15}
                max={15}
                step={1}
                onValueChange={([val]) =>
                  onUpdateLayer(selectedLayer.id, {
                    rotation: val,
                  })
                }
                className="py-1 cursor-pointer"
              />
              <div className="flex gap-1.5 pt-0.5">
                {[-4, -2, 0, 2, 4].map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() =>
                      onUpdateLayer(selectedLayer.id, {
                        rotation: deg,
                      })
                    }
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      selectedLayer.rotation === deg
                        ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                        : "bg-[#202020] text-slate-400 border-[#333]"
                    }`}
                  >
                    {deg > 0 ? `+${deg}°` : `${deg}°`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl bg-[#181818] border border-[#2E2E2E] text-center space-y-2">
          <Type className="w-8 h-8 mx-auto text-slate-500 opacity-50" />
          <h5 className="text-xs font-bold text-slate-300">Pilih Layer Teks</h5>
          <p className="text-[11px] text-muted-foreground">
            Klik salah satu teks langsung di kanvas thumbnail atau pilih dari daftar layer di atas untuk membuka opsi styling.
          </p>
        </div>
      )}
    </div>
  );
}
export default TextLayerInspector;

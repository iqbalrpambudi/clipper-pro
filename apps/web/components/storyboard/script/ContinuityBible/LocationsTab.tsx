"use client";

import React from "react";
import { Plus, Trash2, Sparkles, Anchor } from "lucide-react";
import { StoryboardLocation } from "@/types";

interface LocationsTabProps {
  locationsList: StoryboardLocation[];
  setLocationsList: React.Dispatch<React.SetStateAction<StoryboardLocation[]>>;
  editingBible: boolean;
  onAddLocation: () => void;
  onDeleteLocation: (idx: number) => void;
}

export function LocationsTab({
  locationsList,
  setLocationsList,
  editingBible,
  onAddLocation,
  onDeleteLocation,
}: LocationsTabProps) {
  if (!locationsList || locationsList.length === 0) {
    return (
      <div className="flex flex-col space-y-3 mt-3.5">
        <div className="rounded-xl border border-dashed border-[#2E2E2E] bg-black/20 p-5 text-center space-y-2">
          <p className="text-xs text-slate-400">Belum ada latar tempat terkunci.</p>
          <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
            Latar tempat (arsitektur, kios pasar, pantai, istana) akan dikunci otomatis agar
            latar belakang dan sudut tempat tetap konsisten antar babak.
          </p>
          <button
            type="button"
            onClick={onAddLocation}
            className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium inline-flex items-center gap-1.5 transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Tempat Pertama</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 mt-3.5">
      {/* Tips Kontinuitas Latar */}
      <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-500/20 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-[11px] text-sky-200/90 leading-relaxed">
          <span className="font-semibold text-sky-300">Tips Kontinuitas Latar Spasial:</span>{" "}
          Agar toko atau latar tidak berpindah tempat (misal toko pedagang tiba-tiba berpindah ke bawah pohon),
          kuncilah <strong>Micro-Set</strong> (bentuk fisik kios/ruangan spesifik), <strong>Anchor Props</strong> (2-3 benda patokan tetap),
          dan <strong>Arah Cahaya</strong>.
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
        {locationsList.map((loc, lIdx) => (
          <div
            key={lIdx}
            className="p-3.5 rounded-xl bg-[#121212] border border-[#262626] hover:border-sky-500/40 transition space-y-2.5"
          >
            {editingBible ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={loc.name}
                    placeholder="Nama Tempat (mis. Kios Rempah di Pasar)"
                    onChange={(e) => {
                      const updated = [...locationsList];
                      updated[lIdx] = { ...loc, name: e.target.value };
                      setLocationsList(updated);
                    }}
                    className="flex-1 px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-white text-xs font-semibold focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="text"
                    value={loc.id || ""}
                    placeholder="Slug ID (mis. kios_rempah)"
                    onChange={(e) => {
                      const updated = [...locationsList];
                      updated[lIdx] = { ...loc, id: e.target.value };
                      setLocationsList(updated);
                    }}
                    className="w-32 px-2 py-1.5 bg-[#181818] rounded border border-[#333] text-sky-300 font-mono text-[11px] focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteLocation(lIdx)}
                    className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
                    title="Hapus Lokasi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 flex items-center gap-1">
                    <span>Arsitektur & Micro-Setting (English)</span>
                  </label>
                  <textarea
                    value={loc.environment_anchor}
                    placeholder="Contoh: a rustic bamboo spice stall in a traditional market, weathered dark teak counter, cobblestone ground, gentle morning sunlight from left..."
                    onChange={(e) => {
                      const updated = [...locationsList];
                      updated[lIdx] = { ...loc, environment_anchor: e.target.value };
                      setLocationsList(updated);
                    }}
                    rows={2}
                    className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-slate-200 text-[11px] font-mono focus:outline-none focus:border-sky-500 leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-semibold tracking-wider text-sky-400 flex items-center gap-1">
                    <Anchor className="w-3 h-3" />
                    <span>Objek Patokan Tetap / Anchor Props (English)</span>
                  </label>
                  <input
                    type="text"
                    value={loc.focal_props || ""}
                    placeholder="Contoh: olive canvas awning, hanging garlic braids, brass balance scales, stacked spice crates"
                    onChange={(e) => {
                      const updated = [...locationsList];
                      updated[lIdx] = { ...loc, focal_props: e.target.value };
                      setLocationsList(updated);
                    }}
                    className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-sky-200 text-[11px] font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-300 flex items-center gap-1">
                    🗺️ {loc.name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
                    [loc:{loc.id || loc.name.toLowerCase().replace(/\s+/g, "")}]
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-black/40 p-2 rounded-lg border border-[#222]">
                  {loc.environment_anchor || "Belum ada deskripsi lingkungan."}
                </p>
                {loc.focal_props && (
                  <div className="flex items-center gap-1.5 text-[11px] font-mono bg-sky-950/30 text-sky-300 px-2.5 py-1.5 rounded-lg border border-sky-500/20">
                    <Anchor className="w-3 h-3 text-sky-400 shrink-0" />
                    <span className="text-[10px] uppercase text-sky-400 font-bold shrink-0">Anchor Props:</span>
                    <span className="truncate">{loc.focal_props}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

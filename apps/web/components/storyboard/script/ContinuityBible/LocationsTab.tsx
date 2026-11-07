"use client";

import React, { useState } from "react";
import { Plus, Trash2, Sparkles, Anchor, Sun, Camera, Loader2, Image as ImageIcon } from "lucide-react";
import { StoryboardLocation } from "@/types";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";

interface LocationsTabProps {
  projectId?: string;
  locationsList: StoryboardLocation[];
  setLocationsList: React.Dispatch<React.SetStateAction<StoryboardLocation[]>>;
  editingBible: boolean;
  onAddLocation: () => void;
  onDeleteLocation: (idx: number) => void;
}

export function LocationsTab({
  projectId,
  locationsList,
  setLocationsList,
  editingBible,
  onAddLocation,
  onDeleteLocation,
}: LocationsTabProps) {
  const { showToast } = useStudioStore();
  const [loadingLocIdx, setLoadingLocIdx] = useState<number | null>(null);

  const handleGenerateMasterPlate = async (loc: StoryboardLocation, idx: number) => {
    if (!projectId) {
      showToast("Project ID tidak ditemukan", "error");
      return;
    }
    const locId = loc.id || loc.name;
    if (!locId) {
      showToast("ID atau nama lokasi harus diisi", "error");
      return;
    }

    try {
      setLoadingLocIdx(idx);
      showToast(`Sedang merender Master Latar untuk '${loc.name}'...`, "info");
      const res = await api.generateLocationMasterImage(projectId, locId);
      if (res.success && res.location) {
        const updated = [...locationsList];
        updated[idx] = { ...updated[idx], ...res.location };
        setLocationsList(updated);
        showToast(`Berhasil membuat Master Latar untuk '${loc.name}'!`, "success");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Gagal membuat latar: ${msg}`, "error");
    } finally {
      setLoadingLocIdx(null);
    }
  };
  if (!locationsList || locationsList.length === 0) {
    return (
      <div className="flex flex-col space-y-3 mt-3.5">
        <div className="space-y-2 rounded-xl border border-dashed border-[#D2CDBF] bg-[#F3F0E8] p-5 text-center">
          <p className="text-xs text-[#77766D]">Belum ada latar tempat terkunci.</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Latar tempat (arsitektur, kios pasar, pantai, istana) akan dikunci otomatis agar latar
            belakang dan sudut tempat tetap konsisten antar babak.
          </p>
          <button
            type="button"
            onClick={onAddLocation}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#C45B3A] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#A9472C]"
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
      <div className="p-2.5 rounded-xl bg-[#EAF0F5] border border-[#CFDDE9] flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-[#41627F] shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs text-[#41627F] leading-relaxed">
          <span className="font-semibold text-[#41627F]">Tips Kontinuitas Latar Spasial:</span> Agar
          toko atau latar tidak berpindah tempat (misal toko pedagang tiba-tiba berpindah ke bawah
          pohon), kuncilah <strong>Micro-Set</strong> (bentuk fisik kios/ruangan spesifik),{" "}
          <strong>Anchor Props</strong> (2-3 benda patokan tetap), dan <strong>Arah Cahaya</strong>.
        </div>
      </div>

      <div className="max-h-[460px] overflow-y-auto custom-scrollbar pr-1 space-y-2.5">
        {locationsList.map((loc, lIdx) => (
          <div
            key={lIdx}
            className="space-y-2.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5 transition hover:border-[#C45B3A]"
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
                    className="flex-1 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 text-xs font-semibold text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
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
                    className="w-32 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1.5 font-mono text-xs text-[#A9472C] focus:border-[#C45B3A] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteLocation(lIdx)}
                    className="p-1.5 rounded text-[#A9472C] hover:text-[#A9472C] hover:bg-[#F3E1D9] transition"
                    title="Hapus Lokasi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[#77766D]">
                      <span>🏞️ Arsitektur Latar Wide Shot (English)</span>
                    </label>
                    <textarea
                      value={loc.environment_anchor}
                      placeholder="Contoh: rustic bamboo spice stall in a bustling Javanese market, weathered dark teak counter, cobblestone aisle..."
                      onChange={(e) => {
                        const updated = [...locationsList];
                        updated[lIdx] = { ...loc, environment_anchor: e.target.value };
                        setLocationsList(updated);
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-[#A9472C]">
                      <Camera className="w-3 h-3" />
                      <span>Latar Close-Up / Bokeh di Belakang Tokoh</span>
                    </label>
                    <textarea
                      value={loc.closeup_background_anchor || ""}
                      placeholder="Contoh: softly blurred bamboo spice shelves, hanging garlic braids, and olive canvas awning bokeh directly behind the subject..."
                      onChange={(e) => {
                        const updated = [...locationsList];
                        updated[lIdx] = { ...loc, closeup_background_anchor: e.target.value };
                        setLocationsList(updated);
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs uppercase font-semibold tracking-wider text-[#41627F] flex items-center gap-1">
                      <Anchor className="w-3 h-3" />
                      <span>Objek Patokan Tetap / Anchor Props</span>
                    </label>
                    <input
                      type="text"
                      value={loc.focal_props || ""}
                      placeholder="olive canvas awning, hanging garlic braids, brass balance scales"
                      onChange={(e) => {
                        const updated = [...locationsList];
                        updated[lIdx] = { ...loc, focal_props: e.target.value };
                        setLocationsList(updated);
                      }}
                      className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#A9472C] focus:border-[#C45B3A] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs uppercase font-semibold tracking-wider text-[#8A6A2F] flex items-center gap-1">
                      <Sun className="w-3 h-3" />
                      <span>Arah Cahaya & Suasana Tetap</span>
                    </label>
                    <input
                      type="text"
                      value={loc.lighting_direction || ""}
                      placeholder="warm morning sunlight 45° from left, dappled awning shadow"
                      onChange={(e) => {
                        const updated = [...locationsList];
                        updated[lIdx] = { ...loc, lighting_direction: e.target.value };
                        setLocationsList(updated);
                      }}
                      className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#8A6A2F] focus:border-[#C45B3A] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs uppercase font-semibold tracking-wider text-[#456A4E] flex items-center gap-1">
                    <span>👥 Dinamika Latar / Kehidupan Sekitar (Ambient Life)</span>
                  </label>
                  <input
                    type="text"
                    value={loc.ambient_life || ""}
                    placeholder="Contoh: busy market crowd in background, street vendors haggling, chickens pecking cobblestones"
                    onChange={(e) => {
                      const updated = [...locationsList];
                      updated[lIdx] = { ...loc, ambient_life: e.target.value };
                      setLocationsList(updated);
                    }}
                    className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#456A4E] focus:border-[#C45B3A] focus:outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#41627F] flex items-center gap-1">
                    🗺️ {loc.name}
                  </span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#EAF0F5] text-[#41627F] border border-[#CFDDE9]">
                    [loc:{loc.id || loc.name.toLowerCase().replace(/\s+/g, "")}]
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div className="rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2 font-mono text-xs leading-relaxed text-[#4D4A42]">
                    <span className="mb-0.5 block font-sans text-xs font-bold uppercase tracking-wider text-[#41627F]">
                      🏞️ Wide Shot (Micro-Set)
                    </span>
                    {loc.environment_anchor || "Belum ada deskripsi lingkungan."}
                  </div>
                  <div className="rounded-lg border border-[#E9C9BD] bg-[#F8EEEA]/60 p-2 font-mono text-xs leading-relaxed text-[#4D4A42]">
                    <span className="mb-0.5 block font-sans text-xs font-bold uppercase tracking-wider text-[#A9472C]">
                      🎯 Close-Up Background / Bokeh
                    </span>
                    {loc.closeup_background_anchor ||
                      "Otomatis menggunakan bokeh dari latar Wide Shot."}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {loc.focal_props && (
                    <div className="flex items-center gap-1.5 text-xs font-mono bg-[#EAF0F5] text-[#41627F] px-2.5 py-1 rounded-lg border border-[#CFDDE9]">
                      <Anchor className="w-3 h-3 text-[#41627F] shrink-0" />
                      <span className="uppercase font-bold shrink-0">Props:</span>
                      <span className="truncate max-w-[260px]">{loc.focal_props}</span>
                    </div>
                  )}
                  {loc.lighting_direction && (
                    <div className="flex items-center gap-1.5 text-xs font-mono bg-[#FBF6EA] text-[#8A6A2F] px-2.5 py-1 rounded-lg border border-[#E8D9B5]">
                      <Sun className="w-3 h-3 text-[#8A6A2F] shrink-0" />
                      <span className="uppercase font-bold shrink-0">Cahaya:</span>
                      <span className="truncate max-w-[260px]">{loc.lighting_direction}</span>
                    </div>
                  )}
                  {loc.ambient_life && (
                    <div className="flex items-center gap-1.5 text-xs font-mono bg-[#EAF2EC] text-[#3D6647] px-2.5 py-1 rounded-lg border border-[#C6DCcb]">
                      <span className="uppercase font-bold shrink-0">Ambient:</span>
                      <span className="truncate max-w-[260px]">{loc.ambient_life}</span>
                    </div>
                  )}
                </div>

                {/* Visual Reference Anchor Plate */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E1D7]">
                  {loc.image_url ? (
                    <div className="flex items-center gap-2.5">
                      <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md border border-[#CFDDE9] bg-black/5">
                        <img
                          src={loc.image_url}
                          alt={loc.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#456A4E]">
                          <Sparkles className="w-3 h-3 text-[#456A4E]" />
                          <span>Master Referensi Aktif</span>
                        </span>
                        <p className="text-[10px] text-[#77766D]">
                          Latar ini dijadikan referensi piksel visual untuk semua shot di lokasi ini.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#77766D]">
                      <ImageIcon className="w-3.5 h-3.5 text-[#77766D]" />
                      <span>Belum ada gambar latar master untuk lokasi ini.</span>
                    </div>
                  )}

                  {projectId && (
                    <button
                      type="button"
                      disabled={loadingLocIdx === lIdx}
                      onClick={() => handleGenerateMasterPlate(loc, lIdx)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#CFDDE9] bg-[#FBFAF7] px-2.5 py-1 text-xs font-semibold text-[#41627F] transition hover:bg-[#EAF0F5] hover:border-[#41627F] disabled:opacity-50"
                      title="Render gambar master latar bersih tanpa karakter sebagai referensi AI"
                    >
                      {loadingLocIdx === lIdx ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-[#41627F]" />
                          <span>Merender Latar...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3 h-3 text-[#41627F]" />
                          <span>{loc.image_url ? "Regenerate Latar" : "📸 Buat Latar Master"}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

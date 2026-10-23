"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { StoryboardCharacter } from "@/types";

interface CharactersTabProps {
  charactersList: StoryboardCharacter[];
  setCharactersList: React.Dispatch<React.SetStateAction<StoryboardCharacter[]>>;
  editingBible: boolean;
  onAddCharacter: () => void;
  onDeleteCharacter: (idx: number) => void;
  onAddVariant: (charIdx: number) => void;
  onDeleteVariant: (charIdx: number, varIdx: number) => void;
}

export function CharactersTab({
  charactersList,
  setCharactersList,
  editingBible,
  onAddCharacter,
  onDeleteCharacter,
  onAddVariant,
  onDeleteVariant,
}: CharactersTabProps) {
  if (!charactersList || charactersList.length === 0) {
    return (
      <div className="flex flex-col space-y-3 mt-3.5">
        <div className="space-y-2 rounded-xl border border-dashed border-[#D2CDBF] bg-[#F3F0E8] p-5 text-center">
          <p className="text-xs text-[#77766D]">Belum ada profil karakter terkunci.</p>
          <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
            Karakter dan varian wujudnya akan dideteksi otomatis saat generate naskah, atau Anda
            dapat menambahkannya manual sekarang.
          </p>
          <button
            type="button"
            onClick={onAddCharacter}
            className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-[#C45B3A] hover:bg-[#A9472C] text-[#FFFAF6] font-medium inline-flex items-center gap-1.5 transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Karakter Pertama</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 mt-3.5">
      <div className="max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
        <div className="space-y-3">
          {charactersList.map((char, cIdx) => (
            <div
              key={cIdx}
              className="space-y-2.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5 transition hover:border-[#C45B3A]"
            >
              {editingBible ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={char.name}
                      placeholder="Nama Tokoh (mis. Malin Kundang)"
                      onChange={(e) => {
                        const updated = [...charactersList];
                        updated[cIdx] = { ...char, name: e.target.value };
                        setCharactersList(updated);
                      }}
                      className="flex-1 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 text-xs font-semibold text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={char.id || ""}
                      placeholder="Slug ID (mis. malin)"
                      onChange={(e) => {
                        const updated = [...charactersList];
                        updated[cIdx] = { ...char, id: e.target.value };
                        setCharactersList(updated);
                      }}
                      className="w-28 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1.5 font-mono text-[11px] text-[#A9472C] focus:border-[#C45B3A] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteCharacter(cIdx)}
                      className="p-1.5 rounded text-[#A9472C] hover:text-[#A9472C] hover:bg-[#F3E1D9] transition"
                      title="Hapus Karakter"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={char.role || ""}
                    placeholder="Peran (mis. Tokoh Utama, Ibu, Antagonis)"
                    onChange={(e) => {
                      const updated = [...charactersList];
                      updated[cIdx] = { ...char, role: e.target.value };
                      setCharactersList(updated);
                    }}
                    className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-[11px] text-[#4D4A42] focus:border-[#C45B3A] focus:outline-none"
                  />

                  <textarea
                    value={char.visual_anchor}
                    placeholder="Ciri visual permanen (Bahasa Inggris): a lean Indonesian man, sun-tanned skin, expressive eyes..."
                    onChange={(e) => {
                      const updated = [...charactersList];
                      updated[cIdx] = { ...char, visual_anchor: e.target.value };
                      setCharactersList(updated);
                    }}
                    rows={2}
                    className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                  />

                  {/* Variants Sub-list */}
                  <div className="space-y-2 border-t border-[#E5E1D7] pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#A9472C] uppercase tracking-wider">
                        Varian Bentuk / Usia:
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddVariant(cIdx)}
                        className="text-[10px] text-[#C45B3A] hover:text-[#A9472C] font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Tambah Varian</span>
                      </button>
                    </div>

                    {char.variants && char.variants.length > 0 ? (
                      <div className="space-y-2">
                        {char.variants.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="space-y-1.5 rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2"
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={v.label}
                                placeholder="Label Varian (mis. Patung Batu)"
                                onChange={(e) => {
                                  const updated = [...charactersList];
                                  const variants = [...(updated[cIdx].variants || [])];
                                  variants[vIdx] = { ...v, label: e.target.value };
                                  updated[cIdx] = { ...updated[cIdx], variants };
                                  setCharactersList(updated);
                                }}
                                className="flex-1 rounded border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1 text-[11px] text-[#26251F] focus:outline-none"
                              />
                              <input
                                type="text"
                                value={v.variant_id}
                                placeholder="ID Varian (mis. batu)"
                                onChange={(e) => {
                                  const updated = [...charactersList];
                                  const variants = [...(updated[cIdx].variants || [])];
                                  variants[vIdx] = { ...v, variant_id: e.target.value };
                                  updated[cIdx] = { ...updated[cIdx], variants };
                                  setCharactersList(updated);
                                }}
                                className="w-24 px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-[#A9472C] font-mono text-[10px] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => onDeleteVariant(cIdx, vIdx)}
                                className="p-1 text-[#A9472C] hover:text-[#A9472C] transition"
                                title="Hapus Varian"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <textarea
                              value={v.visual_anchor}
                              placeholder="Visual Anchor varian (Bahasa Inggris): weathered grey stone statue in prostrating kneeling pose..."
                              onChange={(e) => {
                                const updated = [...charactersList];
                                const variants = [...(updated[cIdx].variants || [])];
                                variants[vIdx] = {
                                  ...v,
                                  visual_anchor: e.target.value,
                                };
                                updated[cIdx] = { ...updated[cIdx], variants };
                                setCharactersList(updated);
                              }}
                              rows={2}
                              className="w-full px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-[#4D4A42] text-[10px] font-mono focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#77766D] italic">
                        Belum ada varian bentuk/usia. Klik &quot;+ Tambah Varian&quot; untuk
                        menambahkan versi muda, dewasa, atau bentuk perubahan wujud.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#A9472C] flex items-center gap-1">
                        👤 {char.name}
                      </span>
                      {char.role && (
                        <span className="text-[10px] text-[#77766D] px-2 py-0.5 rounded-full bg-[#F3F0E8] border border-[#E5E1D7] font-mono">
                          {char.role}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]">
                      [char:{char.id || char.name.toLowerCase().replace(/\s+/g, "")}]
                    </span>
                  </div>

                  <p className="text-[11px] text-[#4D4A42] leading-relaxed font-mono bg-[#F3F0E8] p-2.5 rounded-lg border border-[#E5E1D7]">
                    {char.visual_anchor || "Belum ada ciri visual khusus."}
                  </p>

                  {/* Display Variants if any */}
                  {char.variants && char.variants.length > 0 && (
                    <div className="space-y-1.5 pt-1.5 border-t border-[#E5E1D7]">
                      <span className="text-[10px] font-bold text-[#77766D] uppercase tracking-wider block">
                        Varian Wujud / Usia:
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {char.variants.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="p-2.5 rounded-lg bg-[#F3F0E8] border border-[#E5E1D7] flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-[#A9472C]">
                                ✨ {v.label}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]">
                                [char:
                                {char.id || char.name.toLowerCase().replace(/\s+/g, "")}:
                                {v.variant_id}]
                              </span>
                            </div>
                            <p className="text-[10px] text-[#4D4A42] font-mono leading-relaxed">
                              {v.visual_anchor}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

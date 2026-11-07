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
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Jika opsi &quot;Gunakan Character Bible&quot; dinonaktifkan (mode explainer/narasi bebas),
            adegan langsung disutradarai dari narasi tiap segmen tanpa mengunci karakter tertentu. Anda
            juga dapat menambahkan karakter secara manual kapan saja.
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
      <div className="max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
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
                      className="w-28 rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1.5 font-mono text-xs text-[#A9472C] focus:border-[#C45B3A] focus:outline-none"
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
                    placeholder="Peran (mis. Tokoh Utama, Pedagang Pasar, Antagonis)"
                    onChange={(e) => {
                      const updated = [...charactersList];
                      updated[cIdx] = { ...char, role: e.target.value };
                      setCharactersList(updated);
                    }}
                    className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-xs text-[#4D4A42] focus:border-[#C45B3A] focus:outline-none"
                  />

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#A9472C]">
                        🎯 Wajah & Kepala (Close-Up Anchor)
                      </label>
                      <textarea
                        value={char.face_head_anchor || ""}
                        placeholder="English: sun-tanned Indonesian man in 40s, sharp cheekbones, thick mustache, woven brown peci..."
                        onChange={(e) => {
                          const nextFace = e.target.value;
                          const prevJoined = [char.face_head_anchor, char.outfit_body_anchor]
                            .filter(Boolean)
                            .join(", ");
                          const shouldSyncVisual =
                            !char.visual_anchor || char.visual_anchor === prevJoined;
                          const nextJoined = [nextFace, char.outfit_body_anchor]
                            .filter(Boolean)
                            .join(", ");
                          const updated = [...charactersList];
                          updated[cIdx] = {
                            ...char,
                            face_head_anchor: nextFace,
                            visual_anchor: shouldSyncVisual ? nextJoined : char.visual_anchor,
                          };
                          setCharactersList(updated);
                        }}
                        rows={2}
                        className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#41627F]">
                        👕 Pakaian & Siluet (Wide/Medium Anchor)
                      </label>
                      <textarea
                        value={char.outfit_body_anchor || ""}
                        placeholder="English: lean build, faded indigo lurik shirt with rolled sleeves, brown sarong over shoulder..."
                        onChange={(e) => {
                          const nextOutfit = e.target.value;
                          const prevJoined = [char.face_head_anchor, char.outfit_body_anchor]
                            .filter(Boolean)
                            .join(", ");
                          const shouldSyncVisual =
                            !char.visual_anchor || char.visual_anchor === prevJoined;
                          const nextJoined = [char.face_head_anchor, nextOutfit]
                            .filter(Boolean)
                            .join(", ");
                          const updated = [...charactersList];
                          updated[cIdx] = {
                            ...char,
                            outfit_body_anchor: nextOutfit,
                            visual_anchor: shouldSyncVisual ? nextJoined : char.visual_anchor,
                          };
                          setCharactersList(updated);
                        }}
                        rows={2}
                        className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8A6A2F]">
                        🎭 Rentang Ekspresi (Expression Range)
                      </label>
                      <input
                        type="text"
                        value={char.expression_range || ""}
                        placeholder="wide grin, furrowed brow when thinking, shocked gasp"
                        onChange={(e) => {
                          const updated = [...charactersList];
                          updated[cIdx] = { ...char, expression_range: e.target.value };
                          setCharactersList(updated);
                        }}
                        className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#8A6A2F] focus:border-[#C45B3A] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-[#456A4E]">
                        ✋ Gestur Khas (Signature Gesture)
                      </label>
                      <input
                        type="text"
                        value={char.signature_gesture || ""}
                        placeholder="crosses arms defensively, scratches back of neck"
                        onChange={(e) => {
                          const updated = [...charactersList];
                          updated[cIdx] = { ...char, signature_gesture: e.target.value };
                          setCharactersList(updated);
                        }}
                        className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#456A4E] focus:border-[#C45B3A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#77766D]">
                      Full Visual Anchor (Ringkasan / Fallback)
                    </label>
                    <textarea
                      value={char.visual_anchor}
                      placeholder="Ciri visual lengkap (otomatis terisi dari Wajah + Pakaian atau edit manual)..."
                      onChange={(e) => {
                        const updated = [...charactersList];
                        updated[cIdx] = { ...char, visual_anchor: e.target.value };
                        setCharactersList(updated);
                      }}
                      rows={2}
                      className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
                    />
                  </div>

                  {/* Variants Sub-list */}
                  <div className="space-y-2 border-t border-[#E5E1D7] pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#A9472C] uppercase tracking-wider">
                        Varian Bentuk / Usia:
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddVariant(cIdx)}
                        className="text-xs text-[#C45B3A] hover:text-[#A9472C] font-semibold flex items-center gap-1"
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
                                className="flex-1 rounded border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1 text-xs text-[#26251F] focus:outline-none"
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
                                className="w-24 px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-[#A9472C] font-mono text-xs focus:outline-none"
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
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              <input
                                type="text"
                                value={v.face_head_anchor || ""}
                                placeholder="Wajah/Kepala varian (Close-Up)..."
                                onChange={(e) => {
                                  const nextFace = e.target.value;
                                  const prevJoined = [v.face_head_anchor, v.outfit_body_anchor]
                                    .filter(Boolean)
                                    .join(", ");
                                  const shouldSync = !v.visual_anchor || v.visual_anchor === prevJoined;
                                  const nextJoined = [nextFace, v.outfit_body_anchor]
                                    .filter(Boolean)
                                    .join(", ");
                                  const updated = [...charactersList];
                                  const variants = [...(updated[cIdx].variants || [])];
                                  variants[vIdx] = {
                                    ...v,
                                    face_head_anchor: nextFace,
                                    visual_anchor: shouldSync ? nextJoined : v.visual_anchor,
                                  };
                                  updated[cIdx] = { ...updated[cIdx], variants };
                                  setCharactersList(updated);
                                }}
                                className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1 font-mono text-xs text-[#26251F] focus:outline-none"
                              />
                              <input
                                type="text"
                                value={v.outfit_body_anchor || ""}
                                placeholder="Pakaian/Siluet varian (Wide)..."
                                onChange={(e) => {
                                  const nextOutfit = e.target.value;
                                  const prevJoined = [v.face_head_anchor, v.outfit_body_anchor]
                                    .filter(Boolean)
                                    .join(", ");
                                  const shouldSync = !v.visual_anchor || v.visual_anchor === prevJoined;
                                  const nextJoined = [v.face_head_anchor, nextOutfit]
                                    .filter(Boolean)
                                    .join(", ");
                                  const updated = [...charactersList];
                                  const variants = [...(updated[cIdx].variants || [])];
                                  variants[vIdx] = {
                                    ...v,
                                    outfit_body_anchor: nextOutfit,
                                    visual_anchor: shouldSync ? nextJoined : v.visual_anchor,
                                  };
                                  updated[cIdx] = { ...updated[cIdx], variants };
                                  setCharactersList(updated);
                                }}
                                className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2 py-1 font-mono text-xs text-[#26251F] focus:outline-none"
                              />
                            </div>
                            <textarea
                              value={v.visual_anchor}
                              placeholder="Full Visual Anchor varian (Bahasa Inggris): weathered grey stone statue in prostrating kneeling pose..."
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
                              className="w-full px-2 py-1 rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] text-[#4D4A42] text-xs font-mono focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#77766D] italic">
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
                        <span className="text-xs text-[#77766D] px-2 py-0.5 rounded-full bg-[#F3F0E8] border border-[#E5E1D7] font-mono">
                          {char.role}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]">
                      [char:{char.id || char.name.toLowerCase().replace(/\s+/g, "")}]
                    </span>
                  </div>

                  {char.face_head_anchor || char.outfit_body_anchor ? (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      <div className="rounded-lg border border-[#E9C9BD] bg-[#F8EEEA]/70 p-2 font-mono text-xs leading-relaxed text-[#4D4A42]">
                        <span className="mb-0.5 block font-sans text-xs font-bold uppercase tracking-wider text-[#A9472C]">
                          🎯 Close-Up (Wajah & Kepala)
                        </span>
                        {char.face_head_anchor || char.visual_anchor}
                      </div>
                      <div className="rounded-lg border border-[#CFDDE9] bg-[#EAF0F5]/70 p-2 font-mono text-xs leading-relaxed text-[#4D4A42]">
                        <span className="mb-0.5 block font-sans text-xs font-bold uppercase tracking-wider text-[#41627F]">
                          👕 Wide / Medium (Pakaian & Siluet)
                        </span>
                        {char.outfit_body_anchor || char.visual_anchor}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#4D4A42] leading-relaxed font-mono bg-[#F3F0E8] p-2.5 rounded-lg border border-[#E5E1D7]">
                      {char.visual_anchor || "Belum ada ciri visual khusus."}
                    </p>
                  )}

                  {(char.expression_range || char.signature_gesture) && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {char.expression_range && (
                        <div className="flex items-center gap-1.5 text-xs font-mono bg-[#FBF6EA] text-[#8A6A2F] px-2.5 py-1 rounded-lg border border-[#E8D9B5]">
                          <span className="uppercase font-bold shrink-0">Ekspresi:</span>
                          <span className="truncate max-w-[260px]">{char.expression_range}</span>
                        </div>
                      )}
                      {char.signature_gesture && (
                        <div className="flex items-center gap-1.5 text-xs font-mono bg-[#EAF2EC] text-[#3D6647] px-2.5 py-1 rounded-lg border border-[#C6DCCB]">
                          <span className="uppercase font-bold shrink-0">Gestur:</span>
                          <span className="truncate max-w-[260px]">{char.signature_gesture}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Display Variants if any */}
                  {char.variants && char.variants.length > 0 && (
                    <div className="space-y-1.5 pt-1.5 border-t border-[#E5E1D7]">
                      <span className="text-xs font-bold text-[#77766D] uppercase tracking-wider block">
                        Varian Wujud / Usia:
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {char.variants.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="p-2.5 rounded-lg bg-[#F3F0E8] border border-[#E5E1D7] flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-[#A9472C]">
                                ✨ {v.label}
                              </span>
                              <span className="text-xs font-mono px-1.5 py-0.2 rounded bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]">
                                [char:
                                {char.id || char.name.toLowerCase().replace(/\s+/g, "")}:
                                {v.variant_id}]
                              </span>
                            </div>
                            <p className="text-xs text-[#4D4A42] font-mono leading-relaxed">
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

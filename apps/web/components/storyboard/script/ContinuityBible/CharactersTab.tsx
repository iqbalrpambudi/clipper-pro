"use client";

import React from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
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
        <div className="rounded-xl border border-dashed border-[#2E2E2E] bg-black/20 p-5 text-center space-y-2">
          <p className="text-xs text-slate-400">Belum ada profil karakter terkunci.</p>
          <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
            Karakter dan varian wujudnya akan dideteksi otomatis saat generate naskah,
            atau Anda dapat menambahkannya manual sekarang.
          </p>
          <button
            type="button"
            onClick={onAddCharacter}
            className="mt-1 px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium inline-flex items-center gap-1.5 transition shadow"
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
      {/* Tips Kontinuitas Karakter Interaksi */}
      <div className="p-2.5 rounded-xl bg-violet-950/20 border border-violet-500/20 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-[11px] text-violet-200/90 leading-relaxed">
          <span className="font-semibold text-violet-300">Tips Kontinuitas Tokoh Interaksi:</span>{" "}
          Jika tokoh utama berinteraksi dengan orang lain (seperti pedagang pasar, guru, atau pengawal),
          pastikan tokoh tersebut didaftarkan juga di sini agar wujud wajah, busana, dan kiosnya konsisten antar adegan.
        </div>
      </div>

      <div className="max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
        <div className="space-y-3">
          {charactersList.map((char, cIdx) => (
            <div
              key={cIdx}
              className="p-3.5 rounded-xl bg-[#121212] border border-[#262626] hover:border-violet-500/40 transition space-y-2.5"
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
                      className="flex-1 px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-white text-xs font-semibold focus:outline-none focus:border-violet-500"
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
                      className="w-28 px-2 py-1.5 bg-[#181818] rounded border border-[#333] text-violet-300 font-mono text-[11px] focus:outline-none focus:border-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteCharacter(cIdx)}
                      className="p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition"
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
                    className="w-full px-2.5 py-1 bg-[#181818] rounded border border-[#333] text-slate-300 text-[11px] focus:outline-none focus:border-violet-500"
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
                    className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-slate-200 text-[11px] font-mono focus:outline-none focus:border-violet-500 leading-relaxed"
                  />

                  {/* Variants Sub-list */}
                  <div className="pt-2 border-t border-[#222] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">
                        Varian Bentuk / Usia:
                      </span>
                      <button
                        type="button"
                        onClick={() => onAddVariant(cIdx)}
                        className="text-[10px] text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
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
                            className="p-2 rounded-lg bg-[#0e0e0e] border border-[#2a2a2a] space-y-1.5"
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
                                className="flex-1 px-2 py-1 bg-[#161616] rounded border border-[#333] text-white text-[11px] focus:outline-none"
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
                                className="w-24 px-2 py-1 bg-[#161616] rounded border border-[#333] text-amber-300 font-mono text-[10px] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => onDeleteVariant(cIdx, vIdx)}
                                className="p-1 text-red-400 hover:text-red-300 transition"
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
                              className="w-full px-2 py-1 bg-[#161616] rounded border border-[#333] text-slate-300 text-[10px] font-mono focus:outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">
                        Belum ada varian bentuk/usia. Klik &quot;+ Tambah Varian&quot;
                        untuk menambahkan versi muda, dewasa, atau bentuk perubahan
                        wujud.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-violet-300 flex items-center gap-1">
                        👤 {char.name}
                      </span>
                      {char.role && (
                        <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 font-mono">
                          {char.role}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20">
                      [char:{char.id || char.name.toLowerCase().replace(/\s+/g, "")}]
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed font-mono bg-black/40 p-2 rounded-lg border border-[#222]">
                    {char.visual_anchor || "Belum ada ciri visual khusus."}
                  </p>

                  {/* Display Variants if any */}
                  {char.variants && char.variants.length > 0 && (
                    <div className="space-y-1.5 pt-1.5 border-t border-[#222]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Varian Wujud / Usia:
                      </span>
                      <div className="grid grid-cols-1 gap-1.5">
                        {char.variants.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="p-2 rounded bg-black/60 border border-[#262626] flex flex-col gap-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-amber-300">
                                ✨ {v.label}
                              </span>
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                [char:
                                {char.id || char.name.toLowerCase().replace(/\s+/g, "")}
                                :{v.variant_id}]
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-300 font-mono leading-relaxed">
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

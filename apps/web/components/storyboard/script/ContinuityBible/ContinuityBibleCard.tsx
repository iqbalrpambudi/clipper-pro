"use client";

import React from "react";
import {
  BookOpen,
  MoreVertical,
  RefreshCw,
  Sparkles,
  Users,
  MapPin,
  Compass,
  Check,
  Edit2,
  Loader2,
} from "lucide-react";
import {
  StoryboardCharacter,
  StoryboardLocation,
  StoryboardWorldSetting,
} from "@/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui";
import { CharactersTab } from "./CharactersTab";
import { LocationsTab } from "./LocationsTab";
import { WorldSettingTab } from "./WorldSettingTab";

interface ContinuityBibleCardProps {
  charactersList: StoryboardCharacter[];
  setCharactersList: React.Dispatch<React.SetStateAction<StoryboardCharacter[]>>;
  locationsList: StoryboardLocation[];
  setLocationsList: React.Dispatch<React.SetStateAction<StoryboardLocation[]>>;
  worldSetting: StoryboardWorldSetting;
  setWorldSetting: React.Dispatch<React.SetStateAction<StoryboardWorldSetting>>;
  editingBible: boolean;
  setEditingBible: (val: boolean) => void;
  bibleTab: "characters" | "locations" | "world";
  setBibleTab: (val: "characters" | "locations" | "world") => void;
  isExtracting: boolean;
  onExtractBible: () => void;
  isUpdating: boolean;
  onSaveBible: () => void;
  onCancelBible: () => void;
  onAddCharacter: () => void;
  onDeleteCharacter: (idx: number) => void;
  onAddVariant: (charIdx: number) => void;
  onDeleteVariant: (charIdx: number, varIdx: number) => void;
  onAddLocation: () => void;
  onDeleteLocation: (idx: number) => void;
}

export function ContinuityBibleCard({
  charactersList,
  setCharactersList,
  locationsList,
  setLocationsList,
  worldSetting,
  setWorldSetting,
  editingBible,
  setEditingBible,
  bibleTab,
  setBibleTab,
  isExtracting,
  onExtractBible,
  isUpdating,
  onSaveBible,
  onCancelBible,
  onAddCharacter,
  onDeleteCharacter,
  onAddVariant,
  onDeleteVariant,
  onAddLocation,
  onDeleteLocation,
}: ContinuityBibleCardProps) {
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-[#161616] p-5 shadow-xl flex flex-col">
      {/* Bible Header & Sub-tabs */}
      <div className="space-y-3 pb-3 border-b border-[#2A2A2A] shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Story Continuity Bible
              </h4>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Penguncian konsistensi karakter & varian wujud, latar tempat, dan era waktu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editingBible && (
              <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
                Mode Edit Aktif
              </span>
            )}

            {/* 3 Dots Popup Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1.5 rounded-lg border border-[#333] hover:border-violet-500/50 bg-[#141414] hover:bg-[#202020] text-slate-300 hover:text-white transition flex items-center justify-center focus:outline-none"
                  title="Opsi Story Continuity Bible"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-[#161616] border border-[#2E2E2E] text-slate-200 shadow-2xl p-1 z-50"
              >
                <DropdownMenuItem
                  onClick={onExtractBible}
                  disabled={isExtracting}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-violet-600/20 hover:text-violet-200 transition focus:bg-violet-600/20 focus:text-violet-200"
                >
                  {isExtracting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-violet-400 shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white">Ekstrak dari Naskah</span>
                    <span className="text-[10px] text-slate-400">
                      Analisis naskah untuk sinkron profil
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[#262626] my-1" />

                <DropdownMenuItem
                  onClick={() => {
                    setBibleTab("characters");
                    onAddCharacter();
                  }}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-violet-600/20 hover:text-violet-200 transition focus:bg-violet-600/20 focus:text-violet-200"
                >
                  <Users className="w-4 h-4 text-violet-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white">Tambah Karakter</span>
                    <span className="text-[10px] text-slate-400">
                      Tambah profil tokoh & varian wujud
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    setBibleTab("locations");
                    onAddLocation();
                  }}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-sky-600/20 hover:text-sky-200 transition focus:bg-sky-600/20 focus:text-sky-200"
                >
                  <MapPin className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white">Tambah Tempat</span>
                    <span className="text-[10px] text-slate-400">
                      Kunci konsistensi latar arsitektur
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[#262626] my-1" />

                <DropdownMenuItem
                  onClick={() => setEditingBible(!editingBible)}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/10 hover:text-white transition focus:bg-white/10 focus:text-white"
                >
                  {editingBible ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Edit2 className="w-4 h-4 text-violet-400 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-white">
                      {editingBible ? "Selesai Edit Bible" : "Edit Bible Manual"}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {editingBible ? "Tutup formulir edit" : "Edit teks deskripsi & slug ID"}
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 3 Sub-tabs navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-xl border border-[#262626]">
          <button
            type="button"
            onClick={() => setBibleTab("characters")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              bibleTab === "characters"
                ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Karakter & Varian</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {charactersList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBibleTab("locations")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              bibleTab === "locations"
                ? "bg-sky-600 text-white shadow-md shadow-sky-900/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Latar Tempat</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {locationsList.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setBibleTab("world")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition ${
              bibleTab === "world"
                ? "bg-amber-600 text-white shadow-md shadow-amber-900/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Era & Atmosfer</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
              {worldSetting.era ? "Aktif" : "-"}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {bibleTab === "characters" && (
        <CharactersTab
          charactersList={charactersList}
          setCharactersList={setCharactersList}
          editingBible={editingBible}
          onAddCharacter={onAddCharacter}
          onDeleteCharacter={onDeleteCharacter}
          onAddVariant={onAddVariant}
          onDeleteVariant={onDeleteVariant}
        />
      )}

      {bibleTab === "locations" && (
        <LocationsTab
          locationsList={locationsList}
          setLocationsList={setLocationsList}
          editingBible={editingBible}
          onAddLocation={onAddLocation}
          onDeleteLocation={onDeleteLocation}
        />
      )}

      {bibleTab === "world" && (
        <WorldSettingTab
          worldSetting={worldSetting}
          setWorldSetting={setWorldSetting}
          editingBible={editingBible}
        />
      )}

      {/* Bottom Actions for Story Continuity Bible */}
      {editingBible && (
        <div className="flex items-center justify-between pt-3 border-t border-[#262626] shrink-0 mt-3">
          <button
            type="button"
            onClick={onCancelBible}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition"
          >
            Batal
          </button>
          <Button
            size="sm"
            disabled={isUpdating}
            onClick={onSaveBible}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5"
          >
            {isUpdating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Simpan Story Continuity Bible</span>
          </Button>
        </div>
      )}
    </div>
  );
}

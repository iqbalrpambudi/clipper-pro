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
import { StoryboardCharacter, StoryboardLocation, StoryboardWorldSetting } from "@/types";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  FilterPills,
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
    <div className="flex flex-col rounded-2xl border border-[#E5E1D7] bg-[#FBFAF7] p-5 shadow-sm">
      {/* Bible Header & Sub-tabs */}
      <div className="shrink-0 space-y-3 border-b border-[#E5E1D7] pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#C45B3A]" />
            <div>
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#26251F]">
                Story Continuity Bible
              </h4>
              <p className="mt-0.5 text-[10px] text-[#77766D]">
                Penguncian konsistensi karakter & varian wujud, latar tempat, dan era waktu
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {editingBible && (
              <span className="text-[10px] text-[#8A6A2F] bg-[#F7EFE0] border border-[#E8D9BC] px-2 py-0.5 rounded-full font-medium">
                Mode Edit Aktif
              </span>
            )}

            {/* 3 Dots Popup Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-lg border border-[#E5E1D7] bg-[#FBFAF7] p-1.5 text-[#5E5C54] transition hover:bg-[#F1EEE6] hover:text-[#26251F] focus:outline-none"
                  title="Opsi Story Continuity Bible"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="z-50 w-56 border border-[#E5E1D7] bg-[#FFFEFA] p-1 text-[#4D4A42] shadow-lg"
              >
                <DropdownMenuItem
                  onClick={onExtractBible}
                  disabled={isExtracting}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[#F8EEEA] hover:text-[#4D4A42] transition focus:bg-[#F8EEEA] focus:text-[#4D4A42]"
                >
                  {isExtracting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-[#C45B3A] shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#8A6A2F] shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[#26251F]">Ekstrak dari Naskah</span>
                    <span className="text-[10px] text-[#77766D]">
                      Analisis naskah untuk sinkron profil
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[#E5E1D7] my-1" />

                <DropdownMenuItem
                  onClick={() => {
                    setBibleTab("characters");
                    onAddCharacter();
                  }}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[#F8EEEA] hover:text-[#4D4A42] transition focus:bg-[#F8EEEA] focus:text-[#4D4A42]"
                >
                  <Users className="w-4 h-4 text-[#C45B3A] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[#26251F]">Tambah Karakter</span>
                    <span className="text-[10px] text-[#77766D]">
                      Tambah profil tokoh & varian wujud
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    setBibleTab("locations");
                    onAddLocation();
                  }}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[#DCE7F0] hover:text-[#41627F] transition focus:bg-[#EAF0F5] focus:text-[#41627F]"
                >
                  <MapPin className="w-4 h-4 text-[#41627F] shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[#26251F]">Tambah Tempat</span>
                    <span className="text-[10px] text-[#77766D]">
                      Kunci konsistensi latar arsitektur
                    </span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-1 bg-[#E5E1D7]" />

                <DropdownMenuItem
                  onClick={() => setEditingBible(!editingBible)}
                  className="flex items-center gap-2.5 text-xs px-2.5 py-2 rounded-lg cursor-pointer transition hover:bg-[#EAE6DD] hover:text-[#26251F] focus:bg-[#EAE6DD] focus:text-[#26251F]"
                >
                  {editingBible ? (
                    <Check className="w-4 h-4 text-[#456A4E] shrink-0" />
                  ) : (
                    <Edit2 className="w-4 h-4 text-[#C45B3A] shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-[#26251F]">
                      {editingBible ? "Selesai Edit Bible" : "Edit Bible Manual"}
                    </span>
                    <span className="text-[10px] text-[#77766D]">
                      {editingBible ? "Tutup formulir edit" : "Edit teks deskripsi & slug ID"}
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* 3 Sub-tabs navigation */}
        <FilterPills
          value={bibleTab}
          onChange={setBibleTab}
          items={[
            { id: "characters", label: "Karakter & Varian", icon: Users, badge: charactersList.length },
            { id: "locations", label: "Latar Tempat", icon: MapPin, badge: locationsList.length },
            { id: "world", label: "Era & Atmosfer", icon: Compass, badge: worldSetting.era ? "Aktif" : "-" },
          ]}
        />
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
        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-[#E5E1D7] pt-3">
          <button
            type="button"
            onClick={onCancelBible}
            className="px-3 py-1.5 text-xs text-[#77766D] transition hover:text-[#26251F]"
          >
            Batal
          </button>
          <Button
            size="sm"
            disabled={isUpdating}
            onClick={onSaveBible}
            variant="workspace-primary"
            className="gap-1.5 text-xs"
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

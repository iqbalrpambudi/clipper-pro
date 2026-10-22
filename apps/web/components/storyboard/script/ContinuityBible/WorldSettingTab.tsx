"use client";

import React from "react";
import { StoryboardWorldSetting } from "@/types";

interface WorldSettingTabProps {
  worldSetting: StoryboardWorldSetting;
  setWorldSetting: React.Dispatch<React.SetStateAction<StoryboardWorldSetting>>;
  editingBible: boolean;
}

export function WorldSettingTab({
  worldSetting,
  setWorldSetting,
  editingBible,
}: WorldSettingTabProps) {
  return (
    <div className="flex flex-col space-y-3 mt-3.5 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
      <div className="space-y-3 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5">
        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#77766D]">
            Era & Masa Sejarah:
          </label>
          {editingBible ? (
            <input
              type="text"
              value={worldSetting.era || ""}
              placeholder="mis. Zaman Kerajaan Nusantara Abad ke-14 (Pra-modern, tanpa teknologi mesin/listrik)"
              onChange={(e) => setWorldSetting((prev) => ({ ...prev, era: e.target.value }))}
              className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 text-xs text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
            />
          ) : (
            <p className="rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] p-2 text-xs font-semibold text-[#8A6B3E]">
              {worldSetting.era || "Belum ditentukan (default: Pra-modern/Historis)"}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#77766D]">
            Garis Waktu (Time Setting):
          </label>
          {editingBible ? (
            <input
              type="text"
              value={worldSetting.time_setting || ""}
              placeholder="mis. Masa Lalu Tradisional / Sejarah"
              onChange={(e) =>
                setWorldSetting((prev) => ({ ...prev, time_setting: e.target.value }))
              }
              className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 text-xs text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
            />
          ) : (
            <p className="rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] p-2 text-xs text-[#4D4A42]">
              {worldSetting.time_setting || "Masa Lalu Tradisional"}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#77766D]">
            Atmosfer Visual & Pencahayaan:
          </label>
          {editingBible ? (
            <textarea
              value={worldSetting.atmosphere || ""}
              placeholder="mis. Cinematic warm vintage tone, golden sunset lighting, dramatic stormy sky in climax"
              onChange={(e) => setWorldSetting((prev) => ({ ...prev, atmosphere: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1.5 font-mono text-xs text-[#26251F] focus:border-[#C45B3A] focus:outline-none"
            />
          ) : (
            <p className="rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] p-2 font-mono text-[11px] leading-relaxed text-[#4D4A42]">
              {worldSetting.atmosphere ||
                "Pencahayaan dramatis dan atmosfer visual sesuai tone naskah."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#E5E1D7] pt-2 text-[10px] text-[#77766D]">
          <span>Variabel Prompt:</span>
          <span className="font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            [era]
          </span>
        </div>
      </div>
    </div>
  );
}

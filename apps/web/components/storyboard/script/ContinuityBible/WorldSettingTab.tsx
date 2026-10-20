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
      <div className="p-3.5 rounded-xl bg-[#121212] border border-[#262626] space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Era & Masa Sejarah:
          </label>
          {editingBible ? (
            <input
              type="text"
              value={worldSetting.era || ""}
              placeholder="mis. Zaman Kerajaan Nusantara Abad ke-14 (Pra-modern, tanpa teknologi mesin/listrik)"
              onChange={(e) =>
                setWorldSetting((prev) => ({ ...prev, era: e.target.value }))
              }
              className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-white text-xs focus:outline-none focus:border-amber-500"
            />
          ) : (
            <p className="text-xs text-amber-300 font-semibold bg-black/40 p-2 rounded-lg border border-[#222]">
              {worldSetting.era || "Belum ditentukan (default: Pra-modern/Historis)"}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
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
              className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-white text-xs focus:outline-none focus:border-amber-500"
            />
          ) : (
            <p className="text-xs text-slate-300 bg-black/40 p-2 rounded-lg border border-[#222]">
              {worldSetting.time_setting || "Masa Lalu Tradisional"}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Atmosfer Visual & Pencahayaan:
          </label>
          {editingBible ? (
            <textarea
              value={worldSetting.atmosphere || ""}
              placeholder="mis. Cinematic warm vintage tone, golden sunset lighting, dramatic stormy sky in climax"
              onChange={(e) =>
                setWorldSetting((prev) => ({ ...prev, atmosphere: e.target.value }))
              }
              rows={2}
              className="w-full px-2.5 py-1.5 bg-[#181818] rounded border border-[#333] text-slate-200 text-xs font-mono focus:outline-none focus:border-amber-500"
            />
          ) : (
            <p className="text-[11px] text-slate-300 font-mono bg-black/40 p-2 rounded-lg border border-[#222] leading-relaxed">
              {worldSetting.atmosphere ||
                "Pencahayaan dramatis dan atmosfer visual sesuai tone naskah."}
            </p>
          )}
        </div>

        <div className="pt-2 border-t border-[#222] flex items-center justify-between text-[10px] text-slate-400">
          <span>Variabel Prompt:</span>
          <span className="font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            [era]
          </span>
        </div>
      </div>
    </div>
  );
}

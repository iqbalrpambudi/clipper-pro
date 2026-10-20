"use client";

import React from "react";
import { StoryboardItem } from "@/types";
import { UseMutationResult } from "@tanstack/react-query";

interface MotionInspectorPanelProps {
  activeItem: StoryboardItem | null;
  updateItemMutation: UseMutationResult<
    unknown,
    Error,
    { id: string; data: Partial<StoryboardItem> }
  >;
}

export function MotionInspectorPanel({
  activeItem,
  updateItemMutation,
}: MotionInspectorPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-[#2A2A2A]">
        <span className="text-xs font-semibold text-white">Adegan Saat Ini</span>
        {activeItem && (
          <span className="text-[11px] font-mono text-slate-400">
            Detik {activeItem.start_time}s – {activeItem.end_time}s
          </span>
        )}
      </div>

      {activeItem ? (
        <div className="space-y-4">
          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
              Naskah Narasi Suara:
            </span>
            <p className="text-xs text-slate-200 bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
              &ldquo;{activeItem.script_text}&rdquo;
            </p>
          </div>

          <div>
            <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1">
              Prompt Gambar Ilustrasi:
            </span>
            <p className="text-xs text-slate-300 font-mono bg-black/40 p-3 rounded-xl border border-[#262626] leading-relaxed">
              {activeItem.image_prompt}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Efek Gerakan Ken Burns:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "zoom_in", label: "Slow Zoom In" },
                { id: "zoom_out", label: "Slow Zoom Out" },
                { id: "pan_left", label: "Pan Left" },
                { id: "pan_right", label: "Pan Right" },
                { id: "static", label: "Statis (Diam)" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    updateItemMutation.mutate({
                      id: activeItem.id,
                      data: {
                        motion_effect: m.id as StoryboardItem["motion_effect"],
                      },
                    })
                  }
                  className={`p-2 rounded-xl text-xs font-medium border text-center transition ${
                    activeItem.motion_effect === m.id
                      ? "bg-violet-500/20 border-violet-500/50 text-violet-200 font-semibold"
                      : "bg-[#141414] border-[#2E2E2E] text-slate-400 hover:text-white"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-slate-500 text-xs">
          Pilih titik timeline untuk melihat detail adegan.
        </div>
      )}
    </div>
  );
}

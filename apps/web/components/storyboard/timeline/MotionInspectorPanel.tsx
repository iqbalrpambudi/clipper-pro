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
      <div className="flex items-center justify-between border-b border-[#E5E1D7] pb-2">
        <span className="text-xs font-semibold text-[#26251F]">Adegan Saat Ini</span>
        {activeItem && (
          <span className="font-mono text-[11px] text-[#77766D]">
            Detik {activeItem.start_time}s – {activeItem.end_time}s
          </span>
        )}
      </div>

      {activeItem ? (
        <div className="space-y-4">
          <div>
            <span className="mb-1 block font-mono text-[10px] uppercase text-[#77766D]">
              Naskah Narasi Suara:
            </span>
            <p className="rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] p-3 text-xs leading-relaxed text-[#4D4A42]">
              &ldquo;{activeItem.script_text}&rdquo;
            </p>
          </div>

          <div>
            <span className="mb-1 block font-mono text-[10px] uppercase text-[#77766D]">
              Prompt Gambar Ilustrasi:
            </span>
            <p className="rounded-xl border border-[#E5E1D7] bg-[#FFFEFA] p-3 font-mono text-xs leading-relaxed text-[#4D4A42]">
              {activeItem.image_prompt}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#4D4A42]">
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
                      ? "bg-[#F8EEEA] border-[#C45B3A] text-[#4D4A42] font-semibold"
                      : "bg-[#FBFAF7] border-[#E5E1D7] text-[#77766D] hover:text-[#26251F]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-xs text-[#77766D]">
          Pilih titik timeline untuk melihat detail adegan.
        </div>
      )}
    </div>
  );
}

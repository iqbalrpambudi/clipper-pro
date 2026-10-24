"use client";

import React from "react";
import { StoryboardItem } from "@/types";

interface ClipsTrackListProps {
  items: StoryboardItem[];
  activeItemId?: string;
  onSeek: (timeSecs: number) => void;
  formatTime?: (secs: number) => string;
}

export function ClipsTrackList({ items, activeItemId, onSeek }: ClipsTrackListProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-1.5 shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">
            Daftar Adegan & Durasi Timeline
          </span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            (Klik adegan untuk melompat ke slot & inspeksi motion)
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {items.length} Slot Adegan
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {items.map((item, idx) => {
          const isSelected = activeItemId === item.id;
          return (
            <button
              key={item.id || idx}
              type="button"
              onClick={() => onSeek(item.start_time || 0)}
              aria-label={`Slot ${idx + 1}: ${item.chapter_title || `Scene ${idx + 1}`}`}
              className={`group relative shrink-0 w-24 aspect-[16/9] rounded-lg overflow-hidden border transition text-left ${
                isSelected
                  ? "border-[#C45B3A] ring-2 ring-[#C45B3A]/30 scale-[1.03]"
                  : "border-[#E5E1D7] opacity-70 hover:border-[#C45B3A] hover:opacity-100"
              }`}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.chapter_title || `Scene ${idx + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#F3F0E8] text-[10px] text-[#77766D]">
                  Slot #{idx + 1}
                </div>
              )}

              {/* Top Badge: Slot # & Duration */}
              <div className="absolute top-1 left-1 bg-black/80 backdrop-blur-xs px-1 py-0.2 rounded text-[8px] font-mono text-white font-bold">
                #{idx + 1} {item.duration ? `${item.duration.toFixed(1)}s` : ""}
              </div>

              {/* Bottom Caption: Chapter Title & Motion */}
              <div className="absolute inset-x-0 bottom-0 bg-black/85 px-1 py-0.5 text-[8.5px] text-white truncate font-medium flex items-center justify-between">
                <span className="truncate">{item.chapter_title || `Scene ${idx + 1}`}</span>
                {item.motion_effect && (
                  <span className="text-[7.5px] text-[#A9472C] font-mono shrink-0 ml-1">
                    {item.motion_effect}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

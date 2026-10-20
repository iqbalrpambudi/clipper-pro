"use client";

import React from "react";
import { Clock, Image as ImageIcon } from "lucide-react";
import { StoryboardItem } from "@/types";

interface ClipsTrackListProps {
  items: StoryboardItem[];
  activeItemId?: string;
  onSeek: (timeSecs: number) => void;
  formatTime: (secs: number) => string;
}

export function ClipsTrackList({
  items,
  activeItemId,
  onSeek,
  formatTime,
}: ClipsTrackListProps) {
  return (
    <div className="rounded-2xl border border-[#2E2E2E] bg-[#181818] p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#2E2E2E]">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-violet-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            Urutan Timeline Adegan Gambar ({items.length} Klip)
          </h4>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          Klik kartu untuk melompat ke detik tersebut
        </span>
      </div>

      <div className="flex items-stretch gap-3 overflow-x-auto pb-4 pt-1">
        {items.map((item, idx) => {
          const isCurrent = activeItemId === item.id;

          return (
            <div
              key={item.id}
              onClick={() => onSeek(item.start_time)}
              className={`min-w-[200px] max-w-[220px] rounded-xl border p-2.5 cursor-pointer transition flex flex-col justify-between shrink-0 ${
                isCurrent
                  ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/30"
                  : "border-[#2E2E2E] bg-[#141414] hover:border-violet-500/40"
              }`}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video rounded-lg bg-black overflow-hidden mb-2 border border-[#262626]">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.image_prompt}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-600">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                )}

                <span className="absolute top-1 left-1 text-[9px] font-mono px-1 py-0.5 rounded bg-black/80 text-white font-bold">
                  #{idx + 1}
                </span>
              </div>

              {/* Timing Badge */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span className="font-bold text-violet-300">
                    {formatTime(item.start_time)} - {formatTime(item.end_time)}
                  </span>
                  <span>{item.duration > 0 ? `${item.duration}s` : ""}</span>
                </div>
                <p className="text-[10px] text-slate-300 line-clamp-2 leading-snug">
                  {item.script_text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

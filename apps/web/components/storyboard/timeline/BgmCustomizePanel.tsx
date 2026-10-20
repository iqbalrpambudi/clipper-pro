"use client";

import React, { useState } from "react";
import { Music2, Sparkles, CheckCircle2, Sliders, Play, Pause, UploadCloud, Info } from "lucide-react";
import { Button, Badge } from "@/components/ui";

export interface BgmMood {
  id: string;
  name: string;
  genre: string;
  desc: string;
  duration: string;
}

export const BGM_MOODS: BgmMood[] = [
  {
    id: "cinematic",
    name: "Cinematic Ambient",
    genre: "Orchestral / Film",
    desc: "Suasana megah & emosional, sangat cocok untuk alur cerita dramatis",
    duration: "2:45",
  },
  {
    id: "lofi",
    name: "Lo-Fi Chill Beats",
    genre: "Chillhop / Relax",
    desc: "Ritme santai tidak mengganggu konsentrasi, pas untuk narasi edukatif & fakta",
    duration: "3:10",
  },
  {
    id: "dramatic",
    name: "Epic Trailer & Mystery",
    genre: "Suspense / Tension",
    desc: "Ketegangan tinggi dengan dentuman drum sinematik untuk adegan klimaks",
    duration: "2:15",
  },
  {
    id: "inspiring",
    name: "Inspiring Corporate",
    genre: "Modern Acoustic",
    desc: "Nuansa positif, optimis, dan memotivasi untuk konten profil atau biografi",
    duration: "2:50",
  },
];

interface BgmCustomizePanelProps {
  selectedBgm: string;
  setSelectedBgm: (id: string) => void;
  bgmVolume: number;
  setBgmVolume: (vol: number) => void;
  autoDucking: boolean;
  setAutoDucking: (duck: boolean) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function BgmCustomizePanel({
  selectedBgm,
  setSelectedBgm,
  bgmVolume,
  setBgmVolume,
  autoDucking,
  setAutoDucking,
  showToast,
}: BgmCustomizePanelProps) {
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 rounded-xl bg-gradient-to-r from-violet-900/30 via-indigo-900/20 to-transparent border border-violet-500/20 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Music2 className="w-3.5 h-3.5" />
          </div>
          <h4 className="text-xs font-bold text-white">Musik Latar (BGM) & Mixer</h4>
          <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[9px] px-1.5 py-0">
            Auto-Duck
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Pilih musik latar bebas royalti untuk memperkuat suasana alur cerita narasi AI Anda.
        </p>
      </div>

      {/* Mood Selector Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            Pustaka Mood Sinematik
          </span>
          <span className="text-[10px] text-muted-foreground">{BGM_MOODS.length} Mood</span>
        </div>

        <div className="space-y-2">
          {BGM_MOODS.map((bgm) => {
            const isSelected = selectedBgm === bgm.id;
            return (
              <div
                key={bgm.id}
                onClick={() => {
                  setSelectedBgm(bgm.id);
                  showToast(`Musik latar diatur ke: ${bgm.name}`, "info");
                }}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? "bg-[#18181F] border-violet-500 shadow-md shadow-violet-500/10 ring-1 ring-violet-500/30"
                    : "bg-[#141414] border-[#262626] hover:border-[#383838]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPlayingPreview(!isPlayingPreview);
                        showToast(
                          !isPlayingPreview
                            ? `Memutar sampel: ${bgm.name}`
                            : "Sampel BGM dihentikan",
                          "info"
                        );
                      }}
                      className="w-7 h-7 rounded-lg bg-violet-600/15 group-hover:bg-violet-600 border border-violet-500/30 group-hover:border-violet-500 flex items-center justify-center text-violet-400 group-hover:text-white transition shrink-0"
                      title="Putar sampel audio"
                    >
                      {isSelected && isPlayingPreview ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 ml-0.2" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-1.5 truncate">
                        <span>{bgm.name}</span>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-violet-400 shrink-0" />}
                      </div>
                      <span className="text-[9.5px] text-muted-foreground font-mono">
                        {bgm.genre} • {bgm.duration}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[10.5px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                  {bgm.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mixer & Auto-Ducking Controls */}
      <div className="p-3.5 rounded-xl bg-[#141414] border border-[#262626] space-y-3.5">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-violet-400" />
          Kontrol Mixer BGM
        </h4>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground text-[11px]">Volume Musik Latar</span>
            <span className="font-mono text-white font-semibold text-[11px]">{bgmVolume}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="40"
            step="1"
            value={bgmVolume}
            onChange={(e) => setBgmVolume(Number(e.target.value))}
            className="w-full accent-violet-600 h-1.5 bg-[#2A2A2A] rounded-lg cursor-pointer block"
          />
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Disarankan 12% - 18% agar suara narasi utama tetap dominan.
          </span>
        </div>

        <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#1A1A1A] border border-[#2E2E2E] cursor-pointer">
          <div>
            <div className="font-semibold text-xs text-foreground">Smart Auto-Ducking</div>
            <div className="text-[10px] text-muted-foreground">
              Otomatis turunkan volume BGM saat narasi AI berbicara
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoDucking}
            onChange={(e) => setAutoDucking(e.target.checked)}
            className="w-4 h-4 accent-violet-600 cursor-pointer rounded"
          />
        </label>
      </div>

      {/* Upload Custom Audio CTA */}
      <div className="p-3 rounded-xl border border-dashed border-[#333] hover:border-violet-500/50 bg-[#121212] transition text-center space-y-1.5">
        <div className="flex items-center justify-center gap-2 text-slate-400">
          <UploadCloud className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-slate-200">Unggah Audio BGM Sendiri</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Format didukung: MP3, WAV, AAC (Maks. 25MB)
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => showToast("Unggah kustom audio BGM akan segera hadir di update mendatang", "info")}
          className="h-7 text-xs border-[#333]"
        >
          Pilih File Audio
        </Button>
      </div>

      {/* Info Tip */}
      <div className="p-3 rounded-xl bg-violet-600/5 border border-violet-500/20 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
        <span className="text-[11px] leading-relaxed">
          Musik latar akan digabungkan secara otomatis pada tahap Render 16:9 sesuai volume mixer di atas.
        </span>
      </div>
    </div>
  );
}

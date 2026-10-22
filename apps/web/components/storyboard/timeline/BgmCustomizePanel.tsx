"use client";

import React, { useState } from "react";
import {
  Music2,
  Sparkles,
  CheckCircle2,
  Sliders,
  Play,
  Pause,
  UploadCloud,
  Info,
} from "lucide-react";
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
      <div className="space-y-1.5 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C]">
            <Music2 className="w-3.5 h-3.5" />
          </div>
          <h4 className="text-xs font-semibold text-[#26251F]">Musik Latar (BGM) & Mixer</h4>
          <Badge className="bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD] text-[9px] px-1.5 py-0">
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
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#26251F]">
            <Sparkles className="w-3.5 h-3.5 text-[#C45B3A]" />
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
                    ? "bg-[#F8EEEA] border-[#C45B3A] ring-1 ring-[#E9C9BD]"
                    : "bg-[#FBFAF7] border-[#E5E1D7] hover:border-[#BEB6A5]"
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
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] text-[#A9472C] transition group-hover:border-[#C45B3A] group-hover:bg-[#C45B3A] group-hover:text-white"
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
                        {isSelected && (
                          <CheckCircle2 className="w-3 h-3 text-[#C45B3A] shrink-0" />
                        )}
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
      <div className="space-y-3.5 rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] p-3.5">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[#26251F]">
          <Sliders className="w-3.5 h-3.5 text-[#C45B3A]" />
          Kontrol Mixer BGM
        </h4>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground text-[11px]">Volume Musik Latar</span>
            <span className="font-mono text-[11px] font-semibold text-[#26251F]">{bgmVolume}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="40"
            step="1"
            value={bgmVolume}
            onChange={(e) => setBgmVolume(Number(e.target.value))}
            className="block h-1.5 w-full cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
          />
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Disarankan 12% - 18% agar suara narasi utama tetap dominan.
          </span>
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E5E1D7] bg-[#F3F0E8] p-2.5">
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
            className="w-4 h-4 accent-[#C45B3A] cursor-pointer rounded"
          />
        </label>
      </div>

      {/* Upload Custom Audio CTA */}
      <div className="space-y-1.5 rounded-xl border border-dashed border-[#D2CDBF] bg-[#FBFAF7] p-3 text-center transition hover:border-[#C45B3A]">
        <div className="flex items-center justify-center gap-2 text-[#77766D]">
          <UploadCloud className="w-4 h-4 text-[#C45B3A]" />
          <span className="text-xs font-semibold text-[#4D4A42]">Unggah Audio BGM Sendiri</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Format didukung: MP3, WAV, AAC (Maks. 25MB)
        </p>
        <Button
          size="sm"
          onClick={() =>
            showToast("Unggah kustom audio BGM akan segera hadir di update mendatang", "info")
          }
          variant="workspace-secondary"
          className="h-8 text-xs"
        >
          Pilih File Audio
        </Button>
      </div>

      {/* Info Tip */}
      <div className="p-3 rounded-xl bg-[#F8EEEA] border border-[#E9C9BD] text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-[#C45B3A] shrink-0 mt-0.5" />
        <span className="text-[11px] leading-relaxed">
          Musik latar akan digabungkan secara otomatis pada tahap Render 16:9 sesuai volume mixer di
          atas.
        </span>
      </div>
    </div>
  );
}

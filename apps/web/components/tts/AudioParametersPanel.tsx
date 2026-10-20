"use client";

import React from "react";
import { Sliders, Loader2, StopCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionPanel } from "@/components/fragments/SectionPanel";

interface AudioParametersPanelProps {
  rate: string;
  setRate: (rate: string) => void;
  pitch: string;
  setPitch: (pitch: string) => void;
  fallbackEnabled: boolean;
  setFallbackEnabled: (fallback: boolean) => void;
  costEstimate?: { estimated_cost_usd: number };
  isGeneratingTTS: boolean;
  generationProgress: number;
  generationStepText: string;
  generationElapsed: number;
  onGenerate: () => void;
  isGeneratingPending: boolean;
  hasNarrationText: boolean;
  onCancel: () => void;
}

export function AudioParametersPanel({
  rate,
  setRate,
  pitch,
  setPitch,
  fallbackEnabled,
  setFallbackEnabled,
  costEstimate,
  isGeneratingTTS,
  generationProgress,
  generationStepText,
  generationElapsed,
  onGenerate,
  isGeneratingPending,
  hasNarrationText,
  onCancel,
}: AudioParametersPanelProps) {
  return (
    <SectionPanel
      title="Parameter Suara & Estimasi"
      description="Sesuaikan tempo, intonasi, dan pantau estimasi biaya"
      icon={<Sliders className="w-4 h-4 text-primary" />}
      actions={
        costEstimate ? (
          <Badge variant="outline" className="text-primary border-primary/30 font-mono text-[10px]">
            Est: ${costEstimate.estimated_cost_usd} USD
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Kecepatan (Rate)
            </label>
            <select
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs focus:outline-none focus:border-primary transition"
            >
              <option value="-10%">Lambat (-10%)</option>
              <option value="+0%">Normal (+0%)</option>
              <option value="+10%">Cepat (+10%)</option>
              <option value="+20%">Sangat Cepat (+20%)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">
              Tinggi Nada (Pitch)
            </label>
            <select
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-[#121212] rounded-lg border border-[#2E2E2E] text-foreground text-xs focus:outline-none focus:border-primary transition"
            >
              <option value="-5Hz">Lebih Berat (-5Hz)</option>
              <option value="+0Hz">Standar (+0Hz)</option>
              <option value="+5Hz">Lebih Cerah (+5Hz)</option>
            </select>
          </div>
        </div>

        {/* Fallback to Edge-TTS Checkbox */}
        <div className="pt-1">
          <label className="flex items-start gap-2.5 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={fallbackEnabled}
              onChange={(e) => setFallbackEnabled(e.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 rounded border-[#2E2E2E] bg-[#141414] text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
            />
            <div>
              <span className="text-[11px] font-medium text-slate-300 group-hover:text-white transition-colors">
                Fallback otomatis ke Edge-TTS jika API error / kuota habis
              </span>
              <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                Jika tidak dicentang, proses akan berhenti dengan error dan audio terpotong pada bagian
                yang gagal.
              </p>
            </div>
          </label>
        </div>

        {/* Live Progress Card for TTS */}
        {isGeneratingTTS && (
          <div className="p-3.5 rounded-xl bg-[#141414] border border-primary/40 space-y-2 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-primary font-medium truncate max-w-[200px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">
                  {generationStepText || "Memproses audio TTS..."}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground shrink-0">
                <span>
                  {Math.floor(generationElapsed / 60)}:
                  {String(generationElapsed % 60).padStart(2, "0")}
                </span>
                <Badge variant="supabase" className="text-[10px] py-0 px-1.5 font-bold">
                  {Math.round(generationProgress)}%
                </Badge>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold transition cursor-pointer"
                  title="Batalkan proses TTS"
                >
                  Batal
                </button>
              </div>
            </div>
            <div className="w-full bg-[#1C1C1C] rounded-full h-1.5 overflow-hidden border border-[#2E2E2E]">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, generationProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Generate & Cancel Buttons */}
        {isGeneratingTTS ? (
          <div className="flex items-center gap-2">
            <Button
              variant="supabase"
              size="lg"
              className="flex-1 h-11 text-xs font-semibold gap-2 cursor-wait opacity-85"
              disabled
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="h-11 px-4 text-xs font-bold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
              onClick={onCancel}
              title="Batalkan pembuatan audio & alignment"
            >
              <StopCircle className="w-4 h-4" />
              <span>Batal</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="supabase"
            size="lg"
            className="w-full h-11 text-xs font-semibold gap-2"
            onClick={onGenerate}
            disabled={isGeneratingPending || !hasNarrationText}
          >
            <Sparkles className="w-4 h-4" />
            <span>Generate Suara & Word Alignment</span>
          </Button>
        )}
      </div>
    </SectionPanel>
  );
}

"use client";

import React from "react";
import { Sliders, Loader2, StopCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionPanel } from "@/components/fragments/SectionPanel";

interface AudioParametersPanelProps {
  rate: number;
  setRate: (rate: number) => void;
  pitch: number;
  setPitch: (pitch: number) => void;
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
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-card"
      actions={
        costEstimate ? (
          <Badge variant="outline" className="text-primary border-primary/30 font-mono text-[10px]">
            Est: ${costEstimate.estimated_cost_usd} USD
          </Badge>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Kecepatan (Rate)</span>
              <span className="font-mono text-primary">{rate >= 0 ? `+${rate}` : rate}%</span>
            </div>
            <input
              type="range"
              min={-20}
              max={30}
              step={5}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer rounded-lg bg-muted accent-primary"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Tinggi Nada (Pitch)</span>
              <span className="font-mono text-primary">{pitch >= 0 ? `+${pitch}` : pitch}Hz</span>
            </div>
            <input
              type="range"
              min={-15}
              max={15}
              step={3}
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer rounded-lg bg-muted accent-primary"
            />
          </div>
        </div>

        {/* Live Progress Card for TTS */}
        {isGeneratingTTS && (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-accent p-3.5 shadow-sm">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-primary font-medium truncate max-w-[200px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">{generationStepText || "Memproses audio TTS..."}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground shrink-0">
                <span>
                  {Math.floor(generationElapsed / 60)}:
                  {String(generationElapsed % 60).padStart(2, "0")}
                </span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-bold">
                  {Math.round(generationProgress)}%
                </Badge>
                <button
                  type="button"
                  onClick={onCancel}
                  className="cursor-pointer rounded bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground transition hover:bg-destructive/90"
                  title="Batalkan proses TTS"
                >
                  Batal
                </button>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full border border-border bg-muted">
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
              variant="workspace-primary"
              size="lg"
              className="flex-1 h-11 text-xs font-semibold gap-2 cursor-wait opacity-85"
              disabled
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Membuat Audio ({Math.round(generationProgress)}%)...</span>
            </Button>
            <Button
              variant="workspace-destructive"
              size="lg"
              className="h-11 gap-1.5 px-4 text-xs font-bold shadow-sm"
              onClick={onCancel}
              title="Batalkan pembuatan audio & alignment"
            >
              <StopCircle className="w-4 h-4" />
              <span>Batal</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="workspace-primary"
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

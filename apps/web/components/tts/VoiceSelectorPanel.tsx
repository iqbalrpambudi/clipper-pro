"use client";

import React from "react";
import {
  Mic,
  Cpu,
  Info,
  Loader2,
  RefreshCw,
  ExternalLink,
  Pause,
  Play,
  CheckCircle2,
} from "lucide-react";
import { VoiceInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import {
  GEMINI_TTS_MODELS,
  ELEVENLABS_TTS_MODELS,
  RUNWARE_TTS_MODELS,
  TTSModelOption,
} from "./constants";

interface VoiceSelectorPanelProps {
  provider: string;
  setProvider: (provider: string) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  geminiModel: string;
  setGeminiModel: (model: string) => void;
  elevenlabsModel: string;
  setElevenlabsModel: (model: string) => void;
  runwareModel: string;
  setRunwareModel: (model: string) => void;
  selectedModelObj?: TTSModelOption;
  elevenLabsCustomVoices: VoiceInfo[];
  isSyncingElevenLabs: boolean;
  handleSyncElevenLabsVoices: () => void;
  customVoiceInput: string;
  setCustomVoiceInput: (input: string) => void;
  syncError: string | null;
  runwareCustomVoiceInput: string;
  setRunwareCustomVoiceInput: (input: string) => void;
  projectLanguage: string;
  isEnProject: boolean;
  filteredVoices: VoiceInfo[];
  sampleAudioPlaying: string | null;
  loadingSampleVoiceId: string | null;
  playVoiceSample: (voiceId: string) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function VoiceSelectorPanel({
  provider,
  setProvider,
  selectedVoice,
  setSelectedVoice,
  geminiModel,
  setGeminiModel,
  elevenlabsModel,
  setElevenlabsModel,
  runwareModel,
  setRunwareModel,
  selectedModelObj,
  elevenLabsCustomVoices,
  isSyncingElevenLabs,
  handleSyncElevenLabsVoices,
  customVoiceInput,
  setCustomVoiceInput,
  syncError,
  runwareCustomVoiceInput,
  setRunwareCustomVoiceInput,
  projectLanguage,
  isEnProject,
  filteredVoices,
  sampleAudioPlaying,
  loadingSampleVoiceId,
  playVoiceSample,
  showToast,
}: VoiceSelectorPanelProps) {
  return (
    <SectionPanel
      title="Pilih Karakter Suara"
      description="Pilih narrator voice yang sesuai dengan tema video"
      icon={<Mic className="w-4 h-4 text-primary" />}
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-muted"
      actions={
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={() => {
              setProvider("gemini");
              setSelectedVoice("Puck");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              provider === "gemini"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Gemini
          </button>
          <button
            type="button"
            onClick={() => {
              setProvider("elevenlabs");
              setSelectedVoice("Adam");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              provider === "elevenlabs"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ElevenLabs
          </button>
          <button
            type="button"
            onClick={() => {
              setProvider("runware");
              setSelectedVoice("fishaudio:s2.1@pro");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              provider === "runware"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Runware
          </button>
          <button
            type="button"
            onClick={() => {
              setProvider("edge");
              setSelectedVoice(isEnProject ? "en-US-JennyNeural" : "id-ID-ArdiNeural");
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              provider === "edge"
                ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Edge
          </button>
        </div>
      }
    >
      {/* Gemini Model Selection Box */}
      {provider === "gemini" && (
        <div className="mb-3.5 space-y-2 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Model Gemini TTS</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0"
            >
              {selectedModelObj?.badge || "Gemini"}
            </Badge>
          </div>

          <select
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
            className="w-full rounded-lg border border-input bg-control-background px-2.5 py-1.5 text-xs text-foreground transition focus:border-primary focus:outline-none"
          >
            {GEMINI_TTS_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.badge}
              </option>
            ))}
          </select>

          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
            <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
            <p>
              {selectedModelObj?.desc}{" "}
              <span className="text-primary/90 font-medium">
                (Single-pass kini mendukung hingga 2.200 karakter untuk intonasi vokal seragam).
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ElevenLabs Model Selection Box */}
      {provider === "elevenlabs" && (
        <div className="mb-3.5 space-y-2 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Model ElevenLabs</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0"
            >
              {selectedModelObj?.badge || "ElevenLabs"}
            </Badge>
          </div>

          <select
            value={elevenlabsModel}
            onChange={(e) => setElevenlabsModel(e.target.value)}
            className="w-full rounded-lg border border-input bg-control-background px-2.5 py-1.5 text-xs text-foreground transition focus:border-primary focus:outline-none"
          >
            {ELEVENLABS_TTS_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.badge}
              </option>
            ))}
          </select>

          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
            <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
            <p>
              {selectedModelObj?.desc}{" "}
              <span className="text-primary/90 font-medium">
                (Stabilitas 0.75 menjamin nol intonation drift dari awal hingga akhir video).
              </span>
            </p>
          </div>

          {/* ElevenLabs Voice Sync & Custom Voice ID Box */}
          <div className="space-y-2.5 border-t border-border pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground">
                Suara Akun / Web Library:
              </span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={isSyncingElevenLabs}
                onClick={handleSyncElevenLabsVoices}
                className="h-6 text-[10px] gap-1 px-2 border-[#E9C9BD] text-[#A9472C] hover:bg-[#F8EEEA]"
              >
                {isSyncingElevenLabs ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {elevenLabsCustomVoices.length > 0 ? "Sinkron Ulang" : "Tarik Suara dari Akun"}
              </Button>
            </div>

            {syncError && (
              <div className="p-2 rounded-lg bg-[#F7EFE0] border border-[#E8D9BC] text-[10px] text-[#8A6A2F] leading-normal">
                {syncError}
              </div>
            )}

            {/* Custom Voice ID Direct Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Atau gunakan Voice ID dari web ElevenLabs:</span>
                <a
                  href="https://elevenlabs.io/voice-library"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#C45B3A] hover:text-[#A9472C] hover:underline flex items-center gap-0.5"
                >
                  Buka Voice Library <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customVoiceInput}
                  onChange={(e) => setCustomVoiceInput(e.target.value)}
                  placeholder="Contoh: pNInz6obpgDQGcFmaJgB (20 karakter ID)"
                  className="flex-1 rounded-lg border border-input bg-control-background px-2.5 py-1 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <Button
                  type="button"
                  variant="workspace-primary"
                  size="xs"
                  disabled={!customVoiceInput.trim()}
                  onClick={() => {
                    const clean = customVoiceInput.trim();
                    setSelectedVoice(clean);
                    showToast(`Voice ID '${clean}' dipilih untuk narasi!`, "success");
                  }}
                  className="h-7 text-[10px] px-2.5"
                >
                  Pilih ID Ini
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={!customVoiceInput.trim()}
                  onClick={() => playVoiceSample(customVoiceInput.trim())}
                  className="h-7 text-[10px] px-2"
                  title="Tes sampel audio Voice ID"
                >
                  {sampleAudioPlaying === customVoiceInput.trim() ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Active Custom Voice indicator if selectedVoice is custom */}
            {selectedVoice &&
              !filteredVoices.some((v) => v.id.toLowerCase() === selectedVoice.toLowerCase()) && (
                <div className="p-2 rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#C45B3A] shrink-0" />
                    <span className="text-[11px] font-medium text-[#4D4A42] truncate">
                      Voice ID Aktif: <span className="font-mono">{selectedVoice}</span>
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 px-1 border-[#E9C9BD] text-[#A9472C]"
                  >
                    Custom ID
                  </Badge>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Runware Model Selection Box */}
      {provider === "runware" && (
        <div className="mb-3.5 space-y-2 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">Model Runware TTS</span>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-2 text-primary border-primary/30 shrink-0"
            >
              {selectedModelObj?.badge || "Runware"}
            </Badge>
          </div>

          <select
            value={runwareModel}
            onChange={(e) => setRunwareModel(e.target.value)}
            className="w-full rounded-lg border border-input bg-control-background px-2.5 py-1.5 text-xs text-foreground transition focus:border-primary focus:outline-none"
          >
            {RUNWARE_TTS_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.badge}
              </option>
            ))}
          </select>

          <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-normal">
            <Info className="w-3 h-3 text-primary/70 shrink-0 mt-0.5" />
            <p>
              {selectedModelObj?.desc}{" "}
              <span className="text-primary/90 font-medium">
                (Hemat biaya ~$0.0005/detik dengan performa suara jernih).
              </span>
            </p>
          </div>

          {/* Runware Custom Voice / Speaker ID Input */}
          <div className="space-y-1.5 border-t border-border pt-2.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Custom Voice ID / Speaker Name:</span>
              <span className="text-[#C45B3A] text-[10px]">Opsional / Voice Library</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={runwareCustomVoiceInput}
                onChange={(e) => setRunwareCustomVoiceInput(e.target.value)}
                placeholder="Contoh: Ashley, Eve, Leo, presenter_male, atau ID kustom"
                className="flex-1 rounded-lg border border-input bg-control-background px-2.5 py-1 font-mono text-xs text-foreground focus:border-primary focus:outline-none"
              />
              <Button
                type="button"
                variant="workspace-primary"
                size="xs"
                disabled={!runwareCustomVoiceInput.trim()}
                onClick={() => {
                  const clean = runwareCustomVoiceInput.trim();
                  setSelectedVoice(clean);
                  showToast(`Voice '${clean}' dipilih untuk Runware!`, "success");
                }}
                className="h-7 text-[10px] px-2.5"
              >
                Pilih ID
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!runwareCustomVoiceInput.trim()}
                onClick={() => playVoiceSample(runwareCustomVoiceInput.trim())}
                className="h-7 text-[10px] px-2"
                title="Tes sampel audio Runware Voice"
              >
                {sampleAudioPlaying === runwareCustomVoiceInput.trim() ? (
                  <Pause className="w-3 h-3" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
              </Button>
            </div>
            {selectedVoice &&
              !filteredVoices.some((v) => v.id.toLowerCase() === selectedVoice.toLowerCase()) && (
                <div className="p-2 rounded-lg border border-[#E9C9BD] bg-[#F8EEEA] flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#C45B3A] shrink-0" />
                    <span className="text-[11px] font-medium text-[#4D4A42] truncate">
                      Voice Aktif: <span className="font-mono">{selectedVoice}</span>
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] py-0 px-1 border-[#E9C9BD] text-[#A9472C]"
                  >
                    Custom Speaker
                  </Badge>
                </div>
              )}
          </div>
        </div>
      )}

      {/* Locked Language Status Banner */}
      <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Katalog Suara Terkunci:</span>
          {projectLanguage === "en" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#41627F] bg-[#EAF0F5] px-2 py-0.5 rounded border border-[#CFDDE9]">
              <span>🇬🇧</span> English (EN)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#456A4E] bg-[#ECF3EB] px-2 py-0.5 rounded border border-[#C9DDCF]">
              <span>🇮🇩</span> Indonesia (ID)
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/75 font-mono">
          🔒 Mengikuti Naskah Tab 1
        </span>
      </div>

      {/* Voice Cards List (scrollable) */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {filteredVoices.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlayingSample = sampleAudioPlaying === v.id;
          const isEn = v.id.startsWith("en-");
          const isId = v.id.startsWith("id-");
          const isJa = v.id.startsWith("ja-");
          return (
            <div
              key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                  : "border-border bg-background hover:border-primary/40 hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                  <span
                    className="text-xs font-semibold text-foreground truncate min-w-0"
                    title={v.name}
                  >
                    {v.name}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1.5 text-muted-foreground"
                  >
                    {v.gender}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-[9px] py-0 px-1 font-mono ${
                      isEn
                        ? "bg-[#EAF0F5] text-[#41627F] border-[#CFDDE9]"
                        : isId
                          ? "bg-[#ECF3EB] text-[#456A4E] border-[#C9DDCF]"
                          : isJa
                            ? "bg-[#F7EFE0] text-[#8A6A2F] border-[#E8D9BC]"
                            : "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                    }`}
                  >
                    {isEn ? "🇬🇧 EN" : isId ? "🇮🇩 ID" : isJa ? "🇯🇵 JA" : "🌐 Multi"}
                  </Badge>
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">
                {v.description}
              </p>

              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <Button
                  type="button"
                  variant={isPlayingSample ? "workspace-primary" : "outline"}
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    playVoiceSample(v.id);
                  }}
                  className="gap-1.5 h-6 text-[10px]"
                >
                  {loadingSampleVoiceId === v.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isPlayingSample ? (
                    <Pause className="w-3 h-3 fill-current" />
                  ) : (
                    <Play className="w-3 h-3 fill-current" />
                  )}
                  <span>
                    {loadingSampleVoiceId === v.id
                      ? "Memuat..."
                      : isPlayingSample
                        ? "Berhenti"
                        : "Dengar Sampel"}
                  </span>
                </Button>
                <span className="text-[10px] text-muted-foreground font-mono">ID: {v.id}</span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionPanel>
  );
}

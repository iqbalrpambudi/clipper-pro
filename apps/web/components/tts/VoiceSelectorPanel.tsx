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
  Bookmark,
  BookmarkPlus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { VoiceInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoicePreset } from "@/lib/presetStorage";
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
  voicePresets: VoicePreset[];
  selectedVoicePresetId: string;
  handleLoadVoicePreset: (presetId: string) => void;
  handleSaveVoicePreset: (e: React.FormEvent) => void;
  handleDeleteVoicePreset: (id: string, name: string) => void;
  showSaveVoiceModal: boolean;
  setShowSaveVoiceModal: (show: boolean) => void;
  newVoicePresetName: string;
  setNewVoicePresetName: (name: string) => void;
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
  isEnProject,
  filteredVoices,
  sampleAudioPlaying,
  loadingSampleVoiceId,
  playVoiceSample,
  showToast,
  voicePresets,
  selectedVoicePresetId,
  handleLoadVoicePreset,
  handleSaveVoicePreset,
  handleDeleteVoicePreset,
  showSaveVoiceModal,
  setShowSaveVoiceModal,
  newVoicePresetName,
  setNewVoicePresetName,
}: VoiceSelectorPanelProps) {
  const selectedPreset = voicePresets.find((p) => p.id === selectedVoicePresetId);

  return (
    <SectionPanel
      title="Pilih Karakter Suara"
      description="Pilih narrator voice yang sesuai dengan tema video"
      icon={<Mic className="w-4 h-4 text-primary" />}
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-card"
    >
      {/* Voice Preset Selector */}
      <div className="mb-3.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Bookmark className="h-3.5 w-3.5 text-primary" />
            <span>Preset Suara</span>
          </label>
          {selectedPreset && !selectedPreset.isBuiltin && (
            <button
              type="button"
              onClick={() => handleDeleteVoicePreset(selectedPreset.id, selectedPreset.name)}
              title="Hapus Preset Kustom Ini"
              className="flex items-center gap-1 text-[11px] text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              <span>Hapus Preset</span>
            </button>
          )}
        </div>
        <Select
          value={selectedVoicePresetId || undefined}
          onValueChange={(val) => handleLoadVoicePreset(val)}
        >
          <SelectTrigger className="h-9 w-full text-xs font-medium">
            <SelectValue placeholder="-- Muat Preset Suara --" />
          </SelectTrigger>
          <SelectContent appearance="workspace">
            {voicePresets.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name} {p.isBuiltin ? "(Bawaan)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Voice Provider Selector */}
      <div className="mb-3.5 space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span>Penyedia Suara (Voice Provider)</span>
        </label>
        <Select
          value={provider}
          onValueChange={(val) => {
            setProvider(val);
            if (val === "gemini") setSelectedVoice("Puck");
            else if (val === "elevenlabs") setSelectedVoice("Adam");
            else if (val === "runware") setSelectedVoice("fishaudio:s2.1@pro");
            else if (val === "edge")
              setSelectedVoice(isEnProject ? "en-US-JennyNeural" : "id-ID-ArdiNeural");
          }}
        >
          <SelectTrigger className="h-9 w-full text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent appearance="workspace">
            <SelectItem value="gemini" className="text-xs">
              Google Gemini TTS (Ekspresif)
            </SelectItem>
            <SelectItem value="elevenlabs" className="text-xs">
              ElevenLabs (High Quality)
            </SelectItem>
            <SelectItem value="runware" className="text-xs">
              Runware Fast TTS
            </SelectItem>
            <SelectItem value="edge" className="text-xs">
              Microsoft Edge TTS (Gratis)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

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

          <Select value={geminiModel} onValueChange={setGeminiModel}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent appearance="workspace">
              {GEMINI_TTS_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name} — {m.badge}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

          <Select value={elevenlabsModel} onValueChange={setElevenlabsModel}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent appearance="workspace">
              {ELEVENLABS_TTS_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name} — {m.badge}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

          <Select value={runwareModel} onValueChange={setRunwareModel}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent appearance="workspace">
              {RUNWARE_TTS_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name} — {m.badge}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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

      {/* Bottom Save Preset Section */}
      <div className="mt-3.5 pt-3 border-t border-border">
        {showSaveVoiceModal ? (
          <form onSubmit={handleSaveVoicePreset} className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <BookmarkPlus className="h-3.5 w-3.5 text-primary" />
                <span>Simpan Preset Suara Baru</span>
              </span>
              <button
                type="button"
                onClick={() => setShowSaveVoiceModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Nama preset suara (mis. ElevenLabs Adam Cepat)..."
                value={newVoicePresetName}
                onChange={(e) => setNewVoicePresetName(e.target.value)}
                autoFocus
                className="h-9 flex-1 text-xs"
              />
              <Button
                type="submit"
                variant="workspace-primary"
                size="workspace-sm"
                className="h-9 shrink-0 gap-1 text-xs"
              >
                <Save className="h-3.5 w-3.5" />
                <span>Simpan</span>
              </Button>
            </div>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowSaveVoiceModal(true)}
            className="w-full h-9 gap-1.5 text-xs border-border bg-card text-foreground hover:bg-muted"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-primary" />
            <span>Simpan Pengaturan Suara Sebagai Preset</span>
          </Button>
        )}
      </div>
    </SectionPanel>
  );
}

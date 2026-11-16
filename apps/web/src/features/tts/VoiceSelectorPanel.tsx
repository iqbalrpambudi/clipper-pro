import { Mic, Loader2, RefreshCw, ExternalLink, Pause, Play, CheckCircle2 } from "lucide-react";
import { VoiceInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SectionPanel } from "@/components/fragments/SectionPanel";

interface VoiceSelectorPanelProps {
  provider: string;
  setProvider: (provider: string) => void;
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  elevenLabsCustomVoices: VoiceInfo[];
  isSyncingElevenLabs: boolean;
  handleSyncElevenLabsVoices: () => void;
  customVoiceInput: string;
  setCustomVoiceInput: (input: string) => void;
  syncError: string | null;
  filteredVoices: VoiceInfo[];
  sampleAudioPlaying: string | null;
  loadingSampleVoiceId: string | null;
  playVoiceSample: (voiceId: string) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

const PROVIDERS = [
  { id: "gemini", label: "Gemini", defaultVoice: "Puck" },
  { id: "elevenlabs", label: "ElevenLabs", defaultVoice: "Adam" },
];

export function VoiceSelectorPanel({
  provider,
  setProvider,
  selectedVoice,
  setSelectedVoice,
  elevenLabsCustomVoices,
  isSyncingElevenLabs,
  handleSyncElevenLabsVoices,
  customVoiceInput,
  setCustomVoiceInput,
  syncError,
  filteredVoices,
  sampleAudioPlaying,
  loadingSampleVoiceId,
  playVoiceSample,
  showToast,
}: VoiceSelectorPanelProps) {
  const isCustomVoice =
    !!selectedVoice &&
    !filteredVoices.some((v) => v.id.toLowerCase() === selectedVoice.toLowerCase());

  return (
    <SectionPanel
      title="Pilih Karakter Suara"
      description="Pilih narrator voice yang sesuai dengan tema video"
      icon={<Mic className="w-4 h-4 text-primary" />}
      className="!border-surface-border !bg-card"
      headerClassName="!border-surface-border !bg-card"
    >
      {/* Provider toggle */}
      <div className="mb-3.5 grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProvider(p.id);
              setSelectedVoice(p.defaultVoice);
            }}
            className={`h-9 rounded-xl border text-xs font-medium transition-all ${
              provider === p.id
                ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40"
                : "border-border bg-background text-muted-foreground hover:border-primary/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ElevenLabs: account voices + custom voice ID */}
      {provider === "elevenlabs" && (
        <div className="mb-3.5 space-y-2.5 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-foreground">Suara Akun / Web Library:</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isSyncingElevenLabs}
              onClick={handleSyncElevenLabsVoices}
              className="h-6 text-xs gap-1 px-2"
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
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400">
              {syncError}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Atau gunakan Voice ID dari web ElevenLabs:</span>
              <a
                href="https://elevenlabs.io/voice-library"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-0.5"
              >
                Voice Library <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={customVoiceInput}
                onChange={(e) => setCustomVoiceInput(e.target.value)}
                placeholder="Contoh: pNInz6obpgDQGcFmaJgB"
                aria-label="Voice ID ElevenLabs"
                className="h-8 flex-1 font-mono"
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
                className="h-7 text-xs px-2.5"
              >
                Pilih ID
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!customVoiceInput.trim()}
                onClick={() => playVoiceSample(customVoiceInput.trim())}
                className="h-7 text-xs px-2"
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

          {isCustomVoice && (
            <div className="p-2 rounded-lg border border-primary/30 bg-accent flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                Voice ID Aktif: <span className="font-mono">{selectedVoice}</span>
              </span>
              <Badge
                variant="outline"
                className="text-xs py-0 px-1 border-primary/30 text-accent-foreground"
              >
                Custom ID
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Voice cards */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {filteredVoices.map((v) => {
          const isSelected = selectedVoice === v.id;
          const isPlayingSample = sampleAudioPlaying === v.id;
          return (
            <div
              key={v.id}
              onClick={() => setSelectedVoice(v.id)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                  : "border-border bg-background hover:border-primary/40 hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                  <span className="text-xs font-semibold text-foreground truncate" title={v.name}>
                    {v.name}
                  </span>
                  <Badge variant="outline" className="text-xs py-0 px-1.5 text-muted-foreground">
                    {v.gender}
                  </Badge>
                </div>
                {isSelected && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2.5 line-clamp-2">
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
                  className="gap-1.5 h-6 text-xs"
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
                <span className="text-xs text-muted-foreground font-mono">ID: {v.id}</span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionPanel>
  );
}

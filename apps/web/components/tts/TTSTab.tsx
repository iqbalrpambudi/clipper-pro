"use client";

import React from "react";
import { Music, Volume2 } from "lucide-react";
import { Project, Narration, AudioTrack } from "@/types";
import { Badge } from "@/components/ui/badge";
import { SectionPanel } from "@/components/fragments/SectionPanel";
import { EmptyState } from "@/components/fragments/EmptyState";
import {
  GEMINI_TTS_MODELS,
  ELEVENLABS_TTS_MODELS,
  RUNWARE_TTS_MODELS,
  formatAudioTime,
} from "./constants";
import { VoiceSelectorPanel } from "./VoiceSelectorPanel";
import { AudioParametersPanel } from "./AudioParametersPanel";
import { AudioPlayerCard } from "./AudioPlayerCard";
import { WordAlignmentBreakdown } from "./WordAlignmentBreakdown";
import { useTTSState } from "./hooks";

// Re-export constants for backward compatibility (e.g. StoryboardVoiceTab)
export { GEMINI_TTS_MODELS, ELEVENLABS_TTS_MODELS, RUNWARE_TTS_MODELS, formatAudioTime };

export interface TTSTabProps {
  project: Project & {
    narration?: Narration | null;
    audio?: AudioTrack | null;
  };
}

export function TTSTab({ project }: TTSTabProps) {
  const state = useTTSState({ project });

  return (
    <div className="space-y-5">
      <header className="border-b border-surface-border pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Audio</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-foreground">
          Suara & sinkronisasi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pilih karakter narator, atur suara, lalu tinjau hasil dan sinkronisasi kata.
        </p>
      </header>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ========================================================================= */}
        {/* KOLOM KIRI (5/12): PEMILIHAN KARAKTER SUARA & PARAMETER TUNING           */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 space-y-5">
          <VoiceSelectorPanel
            provider={state.provider}
            setProvider={state.setProvider}
            selectedVoice={state.selectedVoice}
            setSelectedVoice={state.setSelectedVoice}
            geminiModel={state.geminiModel}
            setGeminiModel={state.setGeminiModel}
            elevenlabsModel={state.elevenlabsModel}
            setElevenlabsModel={state.setElevenlabsModel}
            runwareModel={state.runwareModel}
            setRunwareModel={state.setRunwareModel}
            selectedModelObj={state.selectedModelObj}
            elevenLabsCustomVoices={state.elevenLabsCustomVoices}
            isSyncingElevenLabs={state.isSyncingElevenLabs}
            handleSyncElevenLabsVoices={state.handleSyncElevenLabsVoices}
            customVoiceInput={state.customVoiceInput}
            setCustomVoiceInput={state.setCustomVoiceInput}
            syncError={state.syncError}
            runwareCustomVoiceInput={state.runwareCustomVoiceInput}
            setRunwareCustomVoiceInput={state.setRunwareCustomVoiceInput}
            projectLanguage={state.projectLanguage}
            isEnProject={state.isEnProject}
            filteredVoices={state.filteredVoices}
            sampleAudioPlaying={state.sampleAudioPlaying}
            loadingSampleVoiceId={state.loadingSampleVoiceId}
            playVoiceSample={state.playVoiceSample}
            showToast={state.showToast}
          />

          <AudioParametersPanel
            rate={state.rate}
            setRate={state.setRate}
            pitch={state.pitch}
            setPitch={state.setPitch}
            fallbackEnabled={state.fallbackEnabled}
            setFallbackEnabled={state.setFallbackEnabled}
            costEstimate={state.costEstimate}
            isGeneratingTTS={state.isGeneratingTTS}
            generationProgress={state.generationProgress}
            generationStepText={state.generationStepText}
            generationElapsed={state.generationElapsed}
            onGenerate={() => state.generateTTSMutation.mutate()}
            isGeneratingPending={state.generateTTSMutation.isPending}
            hasNarrationText={!!state.narrationText}
            onCancel={state.handleCancelTTS}
          />
        </div>

        {/* ========================================================================= */}
        {/* KOLOM KANAN (7/12): MODERN CUSTOM AUDIO PLAYER & WORD ALIGNMENT          */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 space-y-5">
          <SectionPanel
            title="Audio Narasi & Forced Alignment"
            description="Review hasil rendering suara dan sinkronisasi kata"
            icon={<Music className="w-4 h-4 text-primary" />}
            className="!border-surface-border !bg-card"
            headerClassName="!border-surface-border !bg-muted"
            badge={
              state.project.audio ? (
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] text-primary border-primary/30"
                >
                  {formatAudioTime(state.audioDuration)} • {state.project.audio.voice}
                </Badge>
              ) : undefined
            }
          >
            {state.project.audio && state.project.audio.audio_url ? (
              <div className="space-y-5">
                <AudioPlayerCard
                  audioRef={state.mainAudioRef}
                  audioUrl={state.project.audio.audio_url}
                  projectName={state.project.name}
                  voiceName={state.project.audio.voice}
                  provider={state.project.audio.provider}
                  rate={state.project.audio.rate}
                  isPlaying={state.isPlaying}
                  currentTime={state.currentTime}
                  audioDuration={state.audioDuration}
                  volume={state.volume}
                  isMuted={state.isMuted}
                  onTimeUpdate={state.handleTimeUpdate}
                  onLoadedMetadata={state.handleLoadedMetadata}
                  onEnded={state.handleEnded}
                  onTogglePlay={state.toggleMainPlay}
                  onSeek={state.handleSeek}
                  onSkip={state.handleSkip}
                  onToggleMute={state.toggleMute}
                  onVolumeChange={state.handleVolumeChange}
                />

                {state.project.narration?.segments &&
                  state.project.narration.segments.length > 0 && (
                    <WordAlignmentBreakdown
                      segments={state.project.narration.segments}
                      editableSegments={state.editableSegments}
                      isEditTimingMode={state.isEditTimingMode}
                      onToggleEditTiming={() => {
                        if (!state.isEditTimingMode && state.project.narration?.segments) {
                          state.setEditableSegments(
                            JSON.parse(JSON.stringify(state.project.narration.segments))
                          );
                        }
                        state.setIsEditTimingMode(!state.isEditTimingMode);
                      }}
                      currentTime={state.currentTime}
                      offsetMs={state.offsetMs}
                      isRealignPending={state.realignMutation.isPending}
                      isGeneratingTTS={state.isGeneratingTTS}
                      hasAudioUrl={!!state.project.audio?.audio_url}
                      onRealign={() => state.realignMutation.mutate({ offset_ms: state.offsetMs })}
                      onGlobalOffsetShift={state.handleGlobalOffsetShift}
                      onWordTimingNudge={state.handleWordTimingNudge}
                      onSaveSegments={() =>
                        state.updateSegmentsMutation.mutate(state.editableSegments)
                      }
                      isSaveSegmentsPending={state.updateSegmentsMutation.isPending}
                      onSeek={state.handleSeek}
                      onNavigateTimeline={() => state.setActiveTab("timeline")}
                    />
                  )}
              </div>
            ) : (
              <EmptyState
                icon={<Volume2 className="w-8 h-8 text-primary" />}
                title="Audio Narasi Belum Dibuat"
                description="Pilih karakter suara narator di kolom kiri, sesuaikan parameter, lalu klik Generate Suara & Word Alignment."
              />
            )}
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}

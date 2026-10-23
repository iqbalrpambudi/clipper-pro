"use client";

import React from "react";
import { ArrowRight, Check, Copy, FileText, Sparkles } from "lucide-react";
import { Project } from "@/types";
import { Button } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";
import {
  ScriptParametersForm,
  VideoMetricsCard,
  ContinuityBibleCard,
  SegmentsList,
  NarrationAnalysisModal,
  useStoryboardScriptState,
} from "./script";

interface StoryboardScriptTabProps {
  project: Project;
}

export function StoryboardScriptTab({ project }: StoryboardScriptTabProps) {
  const state = useStoryboardScriptState(project);

  return (
    <div className="flex flex-col w-full pb-16">
      {/* Step Header - Menempel pada Header Stepper */}
      <StoryboardTabHeader
        icon={FileText}
        title="Ide Konten & Naskah Narasi (4–8 Menit)"
        badge="Langkah 1 • Naskah"
        secondaryBadge="16:9 Storyboard"
        description="Tentukan ide cerita. LLM akan merancang alur terstruktur dan prompt visual setiap adegan."
        actions={
          state.segments.length > 0 ? (
            <>
              <Button
                size="sm"
                onClick={() => state.handleOpenNarrationAnalysis()}
                className="h-9 gap-1.5 border-[#E9C9BD] bg-[#F8EEEA] text-xs font-semibold text-[#A9472C] shadow-sm transition hover:bg-[#F3E1D9]"
                title="Analisis Skor Narasi untuk Retensi YouTube"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#8A6A2F]" />
                <span>Skor Narasi</span>
              </Button>

              <Button
                size="sm"
                onClick={state.handleCopyAllNarration}
                variant="workspace-secondary"
                className="h-9 gap-1.5 text-xs"
                title="Salin seluruh teks narasi ke clipboard"
              >
                {state.hasCopiedNarration ? (
                  <Check className="w-3.5 h-3.5 text-[#456A4E]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#C45B3A]" />
                )}
                <span>{state.hasCopiedNarration ? "Tersalin!" : "Salin Narasi"}</span>
              </Button>

              <Button
                size="sm"
                onClick={() => state.setActiveTab("storyboard_voice")}
                variant="workspace-primary"
                className="h-9 gap-1.5 text-xs"
              >
                <span>Lanjut ke Suara & Sync</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Main Tab Content */}
      <div className="mx-auto w-full max-w-[1920px] space-y-5 px-4 py-5 sm:px-6">
        {/* Top Grid: Form on Left (6 Cols), Stats & Karakter Terkunci on Right (6 Cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form: Parameters (6 Cols) */}
          <ScriptParametersForm
            topic={state.topic}
            setTopic={state.setTopic}
            language={state.language}
            onLanguageSelect={state.handleLanguageSelect}
            durationMins={state.durationMins}
            setDurationMins={state.setDurationMins}
            tone={state.tone}
            setTone={state.setTone}
            selectedPresetId={state.selectedPresetId}
            setSelectedPresetId={state.setSelectedPresetId}
            presets={state.presets}
            activePreset={state.activePreset}
            imagesPerSegment={state.imagesPerSegment}
            setImagesPerSegment={state.setImagesPerSegment}
            customInstructions={state.customInstructions}
            setCustomInstructions={state.setCustomInstructions}
            hasSegments={state.segments.length > 0}
            isGenerating={state.generateScriptMutation.isPending}
            onGenerate={state.handleGenerate}
            scriptPresets={state.scriptPresets}
            selectedScriptPresetId={state.selectedScriptPresetId}
            onLoadScriptPreset={state.handleLoadScriptPreset}
            onDeleteScriptPreset={state.handleDeleteScriptPreset}
            showSaveScriptModal={state.showSaveScriptModal}
            setShowSaveScriptModal={state.setShowSaveScriptModal}
            newScriptPresetName={state.newScriptPresetName}
            setNewScriptPresetName={state.setNewScriptPresetName}
            onSaveScriptPreset={state.handleSaveScriptPreset}
          />

          {/* Right Column: Stats (Top) & Continuity Bible (Bottom) (6 Cols) */}
          <div className="lg:col-span-6 flex flex-col gap-5">
            <VideoMetricsCard
              durationMins={state.durationMins}
              imagesPerSegment={state.imagesPerSegment}
              wordCount={state.wordCount}
              charCount={state.charCount}
              resultDurationFormatted={state.resultDurationFormatted}
              hasSegments={state.segments.length > 0}
              hasCopiedNarration={state.hasCopiedNarration}
              onCopyAllNarration={state.handleCopyAllNarration}
              onOpenNarrationAnalysis={state.handleOpenNarrationAnalysis}
              itemsCount={state.items.length}
            />

            <ContinuityBibleCard
              charactersList={state.charactersList}
              setCharactersList={state.setCharactersList}
              locationsList={state.locationsList}
              setLocationsList={state.setLocationsList}
              worldSetting={state.worldSetting}
              setWorldSetting={state.setWorldSetting}
              editingBible={state.editingBible}
              setEditingBible={state.setEditingBible}
              bibleTab={state.bibleTab}
              setBibleTab={state.setBibleTab}
              isExtracting={state.extractBibleMutation.isPending}
              onExtractBible={() => state.extractBibleMutation.mutate({})}
              isUpdating={state.updateBibleMutation.isPending}
              onSaveBible={() => state.updateBibleMutation.mutate()}
              onCancelBible={state.handleCancelBible}
              onAddCharacter={state.handleAddCharacter}
              onDeleteCharacter={state.handleDeleteCharacter}
              onAddVariant={state.handleAddVariant}
              onDeleteVariant={state.handleDeleteVariant}
              onAddLocation={state.handleAddLocation}
              onDeleteLocation={state.handleDeleteLocation}
            />
          </div>
        </div>

        {/* Bottom Section: Full-Width Daftar Babak & Segmen Naskah */}
        <SegmentsList
          segments={state.segments}
          items={state.items}
          language={project.narration?.language || state.language}
          hasCopiedNarration={state.hasCopiedNarration}
          copiedSegmentId={state.copiedSegmentId}
          onCopyAllNarration={state.handleCopyAllNarration}
          onCopySegment={state.handleCopySegment}
          onNextStep={() => state.setActiveTab("storyboard_voice")}
          editingSegmentId={state.editingSegmentId}
          editingSegmentIndex={state.editingSegmentIndex}
          editChapter={state.editChapter}
          setEditChapter={state.setEditChapter}
          editText={state.editText}
          setEditText={state.setEditText}
          editItemPrompts={state.editItemPrompts}
          setEditItemPrompts={state.setEditItemPrompts}
          onStartEditSegment={state.handleStartEditSegment}
          onCancelEditSegment={state.handleCancelEditSegment}
          onSaveEditSegment={state.handleSaveEditSegment}
          isUpdatingSegment={state.updateSegmentMutation.isPending}
        />

        {/* Modal Analisis Skor Narasi YouTube */}
        <NarrationAnalysisModal
          isOpen={state.showNarrationAnalysisModal}
          onClose={() => state.setShowNarrationAnalysisModal(false)}
          analysisData={state.analysisData}
          isLoading={state.analyzeNarrationMutation.isPending}
          isApplying={state.applyImprovementsMutation.isPending}
          onAnalyze={(focusAspect, customInstructions) =>
            state.analyzeNarrationMutation.mutate({ focusAspect, customInstructions })
          }
          onApplyImprovements={(selectedSegments, updateVisualPrompts) =>
            state.applyImprovementsMutation.mutate({
              segments: selectedSegments,
              updateVisualPrompts,
            })
          }
        />
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { ArrowRight, Check, Copy, FileText } from "lucide-react";
import { Project } from "@/types";
import { Button } from "@/components/ui";
import { StoryboardTabHeader } from "./StoryboardTabHeader";
import {
  ScriptParametersForm,
  VideoMetricsCard,
  ContinuityBibleCard,
  SegmentsList,
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
                variant="outline"
                size="sm"
                onClick={state.handleCopyAllNarration}
                className="h-8 text-xs font-semibold gap-1.5 border-[#333] bg-[#202020] hover:bg-[#2A2A2A] text-slate-200 hover:text-white transition shadow-sm"
                title="Salin seluruh teks narasi ke clipboard"
              >
                {state.hasCopiedNarration ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-violet-400" />
                )}
                <span>{state.hasCopiedNarration ? "Tersalin!" : "Salin Narasi"}</span>
              </Button>

              <Button
                size="sm"
                onClick={() => state.setActiveTab("storyboard_voice")}
                className="h-8 bg-violet-600 hover:bg-violet-500 text-white gap-1.5 text-xs font-semibold shadow-md shadow-violet-500/20"
              >
                <span>Lanjut ke Suara & Sync</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Main Tab Content */}
      <div className="max-w-[1920px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
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
          resetBibleOnGenerate={state.resetBibleOnGenerate}
          setResetBibleOnGenerate={state.setResetBibleOnGenerate}
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
      </div>
    </div>
  );
}

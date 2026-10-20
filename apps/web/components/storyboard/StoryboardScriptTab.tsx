"use client";

import React from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { Project } from "@/types";
import { Button, Badge } from "@/components/ui";
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
    <div className="space-y-6 max-w-8xl mx-auto pb-16">
      {/* Step Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E2E2E] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-semibold">
              Langkah 1 dari 6
            </span>
            <Badge variant="outline" className="border-[#2E2E2E] text-slate-400 text-[11px]">
              Dokumenter / Explainer 16:9
            </Badge>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Ide Konten & Naskah Narasi Panjang (4–8 Menit)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tentukan ide cerita. LLM akan merancang alur terstruktur (Hook, Inti Cerita, Penutup)
            dan prompt gambar sketsa untuk setiap adegan.
          </p>
        </div>

        {state.segments.length > 0 && (
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={state.handleCopyAllNarration}
              className="h-9 text-xs font-semibold gap-1.5 border-[#333] bg-[#202020] hover:bg-[#2A2A2A] text-slate-200 hover:text-white transition shadow-sm"
              title="Salin seluruh teks narasi ke clipboard"
            >
              {state.hasCopiedNarration ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-violet-400" />
              )}
              <span>{state.hasCopiedNarration ? "Tersalin!" : "Salin Semua Narasi"}</span>
            </Button>

            <Button
              onClick={() => state.setActiveTab("storyboard_voice")}
              className="bg-violet-600 hover:bg-violet-500 text-white gap-2 text-xs font-semibold shadow-md shadow-violet-500/20"
            >
              <span>Lanjut ke Suara & Sync</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

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
  );
}

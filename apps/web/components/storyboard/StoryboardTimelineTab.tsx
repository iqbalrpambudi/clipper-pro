"use client";

import React from "react";
import { Layers, Type } from "lucide-react";
import { Project } from "@/types";
import { useStudioStore } from "@/lib/store";
import {
  TimelineStepHeader,
  VideoPreviewScreen,
  VideoPlayerControls,
  SubtitleStudioPanel,
  MotionInspectorPanel,
  ClipsTrackList,
  useStoryboardTimelineState,
} from "./timeline";

export interface StoryboardTimelineTabProps {
  project: Project;
}

export function StoryboardTimelineTab({ project }: StoryboardTimelineTabProps) {
  const { showToast } = useStudioStore();
  const state = useStoryboardTimelineState(project);

  return (
    <div className="space-y-8 max-w-8xl mx-auto pb-16">
      {/* 1. Step Navigation Header */}
      <TimelineStepHeader
        onNavigateImages={() => state.setActiveTab("storyboard_images")}
        onNavigateWatermark={() => state.setActiveTab("storyboard_watermark")}
      />

      {/* 2. Hidden Audio Element for Playback Sync */}
      {state.audio && (
        <audio
          ref={state.audioRef}
          src={state.audio.audio_url || state.audio.file_url || undefined}
          onTimeUpdate={state.handleTimeUpdate}
          onLoadedMetadata={state.handleLoadedMetadata}
          onEnded={() => state.togglePlay()}
        />
      )}

      {/* 3. Main Preview Player & Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: 16:9 Landscape Video Screen & Controls (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <VideoPreviewScreen
            videoFrameRef={state.videoFrameRef}
            activeItem={state.activeItem}
            itemsLength={state.items.length}
            isPlaying={state.isPlaying}
            getMotionAnimationClass={state.getMotionAnimationClass}
            subtitleStyle={state.subtitleStyle}
            activeSegment={state.activeSegment}
            scaledOffsetX={state.scaledOffsetX}
            scaledOffsetY={state.scaledOffsetY}
            scaledFontSize={state.scaledFontSize}
            scaledOutlineWidth={state.scaledOutlineWidth}
            fontWeightValue={state.fontWeightValue}
            zoomScale={state.zoomScale}
            isScaleAnim={state.isScaleAnim}
            isHighlightEnabled={state.isHighlightEnabled}
            segWords={state.segWords}
            activeWordIndex={state.activeWordIndex}
            activeBurstGroup={state.activeBurstGroup}
            handlePointerDown={state.handlePointerDown}
            handlePointerMove={state.handlePointerMove}
            handlePointerUp={state.handlePointerUp}
            currentTime={state.currentTime}
            duration={state.duration || state.audio?.duration || 0}
            formatTime={state.formatTime}
          />

          <VideoPlayerControls
            isPlaying={state.isPlaying}
            togglePlay={state.togglePlay}
            currentTime={state.currentTime}
            duration={state.duration || state.audio?.duration || 0}
            handleSeek={state.handleSeek}
            isMuted={state.isMuted}
            toggleMute={() => {
              if (state.audioRef.current) {
                state.audioRef.current.muted = !state.isMuted;
                state.setIsMuted(!state.isMuted);
              }
            }}
            subtitleEnabled={state.subtitleStyle.enabled !== false}
            onToggleSubtitle={() => {
              const newEnabled = state.subtitleStyle.enabled === false;
              const updated = { ...state.subtitleStyle, enabled: newEnabled };
              state.setSubtitleStyle(updated);
              state.updateStyleMutation.mutate(updated);
              showToast(
                newEnabled ? "Subtitle diaktifkan." : "Subtitle dinonaktifkan (video bersih).",
                "info"
              );
            }}
            formatTime={state.formatTime}
          />
        </div>

        {/* Right Column: Tabbed Inspector (Motion vs Subtitle Studio) (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-[#2E2E2E] bg-[#181818] p-5 space-y-5 shadow-xl">
          {/* Tab Switcher */}
          <div className="flex items-center gap-2 p-1 bg-[#121212] rounded-xl border border-[#2E2E2E]">
            <button
              type="button"
              onClick={() => state.setActiveRightTab("subtitles")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition ${
                state.activeRightTab === "subtitles"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>Studio Subtitle</span>
            </button>
            <button
              type="button"
              onClick={() => state.setActiveRightTab("motion")}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition ${
                state.activeRightTab === "motion"
                  ? "bg-violet-600 text-white font-semibold shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Adegan & Motion</span>
            </button>
          </div>

          {state.activeRightTab === "subtitles" ? (
            <SubtitleStudioPanel
              subtitleStyle={state.subtitleStyle}
              setSubtitleStyle={state.setSubtitleStyle}
              updateStyleMutation={state.updateStyleMutation}
              customSubtitlePresets={state.customSubtitlePresets}
              selectedSubtitlePresetId={state.selectedSubtitlePresetId}
              handleLoadSubtitlePreset={state.handleLoadSubtitlePreset}
              handleDeleteSubtitlePreset={state.handleDeleteSubtitlePreset}
              showSaveSubtitleModal={state.showSaveSubtitleModal}
              setShowSaveSubtitleModal={state.setShowSaveSubtitleModal}
              newSubtitlePresetName={state.newSubtitlePresetName}
              setNewSubtitlePresetName={state.setNewSubtitlePresetName}
              handleSaveSubtitlePreset={state.handleSaveSubtitlePreset}
              showToast={showToast}
            />
          ) : (
            <MotionInspectorPanel
              activeItem={state.activeItem}
              updateItemMutation={state.updateItemMutation}
            />
          )}
        </div>
      </div>

      {/* 4. Horizontal Storyboard Track List */}
      <ClipsTrackList
        items={state.items}
        activeItemId={state.activeItem?.id}
        onSeek={state.handleSeek}
        formatTime={state.formatTime}
      />
    </div>
  );
}

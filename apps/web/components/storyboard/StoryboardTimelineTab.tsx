"use client";

import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Eye, Layers, Type, Stamp, Music2 } from "lucide-react";
import { Project } from "@/types";
import { useStudioStore } from "@/lib/store";
import { Button, Badge } from "@/components/ui";
import { WatermarkCustomizePanel } from "@/components/watermark/WatermarkCustomizePanel";
import {
  TimelineStepHeader,
  VideoPreviewScreen,
  VideoPlayerControls,
  SubtitleStudioPanel,
  MotionInspectorPanel,
  BgmCustomizePanel,
  ClipsTrackList,
  useStoryboardTimelineState,
} from "./timeline";

export interface StoryboardTimelineTabProps {
  project: Project;
}

export function StoryboardTimelineTab({ project }: StoryboardTimelineTabProps) {
  const { showToast } = useStudioStore();
  const state = useStoryboardTimelineState(project);
  const [showSafeZones, setShowSafeZones] = useState(false);

  // Active scene index based on playback / current active item
  const activeItemIndex = useMemo(() => {
    if (!state.activeItem || !state.items.length) return 0;
    const idx = state.items.findIndex((it) => it.id === state.activeItem?.id);
    return idx >= 0 ? idx : 0;
  }, [state.items, state.activeItem]);

  const handlePrevScene = () => {
    if (activeItemIndex > 0) {
      const prev = state.items[activeItemIndex - 1];
      state.handleSeek(prev.start_time || 0);
    }
  };

  const handleNextScene = () => {
    if (activeItemIndex < state.items.length - 1) {
      const next = state.items[activeItemIndex + 1];
      state.handleSeek(next.start_time || 0);
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F3F0E8] text-[#26251F]">
      {/* 1. Step Navigation Header - Menempel pada Header Stepper */}
      <TimelineStepHeader
        onNavigateImages={() => state.setActiveTab("storyboard_images")}
        onNavigateRender={() => state.setActiveTab("storyboard_render")}
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

      {/* 3. Main Split View: Left Studio Panel (Media Player + Bottom Scenes) + Right Inner-Scrollable Option Configuration */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Media Player in Panel & Bottom Scenes Filmstrip */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-r border-[#E5E1D7] bg-[#F3F0E8] p-4">
          {/* Top Preview Toolbar */}
          <div className="mb-3 flex shrink-0 items-center justify-between rounded-xl border border-[#E5E1D7] bg-[#FBFAF7] px-3.5 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevScene}
                disabled={activeItemIndex <= 0}
                className="h-7 w-7 p-0 border-[#E5E1D7]"
                title="Adegan Sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>

              <div className="flex items-center gap-2">
                <select
                  value={activeItemIndex}
                  onChange={(e) => {
                    const target = state.items[Number(e.target.value)];
                    if (target) state.handleSeek(target.start_time || 0);
                  }}
                  className="max-w-[260px] truncate rounded-lg border border-[#E5E1D7] bg-[#FFFEFA] px-2.5 py-1 text-xs text-[#26251F] focus:border-[#C45B3A] focus:outline-none sm:max-w-[340px]"
                >
                  {state.items.length > 0 ? (
                    state.items.map((it, idx) => (
                      <option key={it.id || idx} value={idx}>
                        Slot #{idx + 1}: {it.chapter_title || `Scene ${idx + 1}`} (
                        {it.duration ? `${it.duration.toFixed(1)}s` : "0s"})
                      </option>
                    ))
                  ) : (
                    <option value={0}>Simulasi Canvas 16:9 (Tanpa Adegan)</option>
                  )}
                </select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextScene}
                disabled={activeItemIndex >= state.items.length - 1}
                className="h-7 w-7 p-0 border-[#E5E1D7]"
                title="Adegan Berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* View options: Safe Zones and Drag Badge */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSafeZones(!showSafeZones)}
                className={`h-7 text-xs gap-1.5 border-[#E5E1D7] ${
                  showSafeZones
                    ? "bg-[#F8EEEA] text-[#A9472C] border-[#E9C9BD]"
                    : "text-muted-foreground"
                }`}
                title="Batas aman YouTube player & border (Title & Action Safe)"
              >
                <Eye className="w-3 h-3" />
                <span>Batas Aman</span>
              </Button>

              <Badge
                variant="outline"
                className="text-[10px] text-muted-foreground border-[#E5E1D7] hidden sm:inline-flex"
              >
                {state.activeRightTab === "watermark"
                  ? "Drag Watermark Bebas"
                  : "Drag Subtitle Bebas"}
              </Badge>
            </div>
          </div>

          {/* 16:9 Video Canvas Frame & Controls inside Panel */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-1 relative overflow-hidden gap-2">
            {/* Dedicated 16:9 Video Screen Wrapper */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
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
                showSafeZones={showSafeZones}
                watermark={state.liveWatermark}
                isWatermarkDraggable={state.activeRightTab === "watermark"}
                onCustomWatermarkPositionChange={state.handleCustomWatermarkPositionChange}
                onWatermarkDragEnd={state.handleWatermarkDragEnd}
                className="group relative flex aspect-video h-full w-auto max-h-full max-w-full shrink-0 select-none items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5E1D7] bg-[#FFFEFA] shadow-lg"
              />
            </div>

            {/* Video Player Controls Deck */}
            <div className="w-full shrink-0 max-w-3xl">
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
          </div>

          {/* Bottom: Daftar Scene Berada di Bawah (Carousel Strip) */}
          <ClipsTrackList
            items={state.items}
            activeItemId={state.activeItem?.id}
            onSeek={state.handleSeek}
            formatTime={state.formatTime}
          />
        </div>

        {/* Right Column: Option Configuration Berada di Kanan Innerscroll (4 Tabs: Subtitle, Motion, Watermark, BGM) */}
        <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-t border-[#E5E1D7] bg-[#FBFAF7] lg:w-[420px] lg:border-t-0 xl:w-[460px] 2xl:w-[500px]">
          {/* Pinned Tab Switcher Header */}
          <div className="shrink-0 border-b border-[#E5E1D7] bg-[#FBFAF7] p-2.5">
            <div className="flex items-center gap-1 rounded-xl border border-[#E5E1D7] bg-[#F3F0E8] p-1">
              <button
                type="button"
                onClick={() => state.setActiveRightTab("subtitles")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  state.activeRightTab === "subtitles"
                    ? "bg-[#C45B3A] text-white font-semibold shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
                title="Pengaturan Subtitle & Karaoke"
              >
                <Type className="w-3.5 h-3.5" />
                <span>Subtitle</span>
              </button>
              <button
                type="button"
                onClick={() => state.setActiveRightTab("motion")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  state.activeRightTab === "motion"
                    ? "bg-[#C45B3A] text-white font-semibold shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
                title="Pengaturan Efek Ken Burns Motion"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Motion</span>
              </button>
              <button
                type="button"
                onClick={() => state.setActiveRightTab("watermark")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  state.activeRightTab === "watermark"
                    ? "bg-[#C45B3A] text-white font-semibold shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
                title="Watermark & Branding"
              >
                <Stamp className="w-3.5 h-3.5" />
                <span>Watermark</span>
                {state.liveWatermark?.enabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FFFAF6] shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={() => state.setActiveRightTab("bgm")}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                  state.activeRightTab === "bgm"
                    ? "bg-[#C45B3A] text-white font-semibold shadow-sm"
                    : "text-[#77766D] hover:text-[#26251F]"
                }`}
                title="Musik Latar (BGM) & Auto-Ducking"
              >
                <Music2 className="w-3.5 h-3.5" />
                <span>Audio BGM</span>
              </button>
            </div>
          </div>

          {/* Inner Scrollable Option Configuration */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#D2CDBF] hover:scrollbar-thumb-[#BFB9A9] lg:p-5">
            {state.activeRightTab === "subtitles" && (
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
            )}

            {state.activeRightTab === "motion" && (
              <MotionInspectorPanel
                activeItem={state.activeItem}
                updateItemMutation={state.updateItemMutation}
              />
            )}

            {state.activeRightTab === "watermark" && (
              <WatermarkCustomizePanel
                project={{ ...project, watermark: state.liveWatermark }}
                onWatermarkChange={state.handleWatermarkChange}
              />
            )}

            {state.activeRightTab === "bgm" && (
              <BgmCustomizePanel
                selectedBgm={state.selectedBgm}
                setSelectedBgm={state.setSelectedBgm}
                bgmVolume={state.bgmVolume}
                setBgmVolume={state.setBgmVolume}
                autoDucking={state.autoDucking}
                setAutoDucking={state.setAutoDucking}
                showToast={showToast}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

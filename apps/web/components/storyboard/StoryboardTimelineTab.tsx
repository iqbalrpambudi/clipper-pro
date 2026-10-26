"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Layers,
  Type,
  Stamp,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Repeat,
} from "lucide-react";
import { Project } from "@/types";
import { useStudioStore } from "@/lib/store";
import { WatermarkCustomizePanel } from "@/components/watermark/WatermarkCustomizePanel";
import {
  TimelineStepHeader,
  VideoPreviewScreen,
  SubtitleStudioPanel,
  MotionInspectorPanel,
  BgmCustomizePanel,
  ClipsTrackList,
  useStoryboardTimelineState,
} from "./timeline";

type SideTab = "subtitles" | "motion" | "watermark" | "bgm";

const SIDE_TABS: { id: SideTab; icon: typeof Type; label: string; title: string }[] = [
  { id: "subtitles", icon: Type, label: "Subtitle", title: "Pengaturan Subtitle & Karaoke" },
  { id: "motion", icon: Layers, label: "Motion", title: "Efek Ken Burns Motion" },
  { id: "watermark", icon: Stamp, label: "Watermark", title: "Watermark & Branding" },
  { id: "bgm", icon: Music2, label: "Audio BGM", title: "Musik Latar (BGM) & Auto-Ducking" },
];

export interface StoryboardTimelineTabProps {
  project: Project;
}

export function StoryboardTimelineTab({ project }: StoryboardTimelineTabProps) {
  const { showToast } = useStudioStore();
  const state = useStoryboardTimelineState(project);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [isDrawerCollapsed, setIsDrawerCollapsed] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState(340);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);

  // Resize drawer via mouse drag
  useEffect(() => {
    if (!isResizingDrawer) return;
    const onMove = (e: MouseEvent) => {
      // 44px icon rail offset
      setDrawerWidth(Math.max(260, Math.min(560, e.clientX - 44)));
    };
    const onUp = () => setIsResizingDrawer(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizingDrawer]);

  const activeItemIndex = useMemo(() => {
    if (!state.activeItem || !state.items.length) return 0;
    const idx = state.items.findIndex((it) => it.id === state.activeItem?.id);
    return idx >= 0 ? idx : 0;
  }, [state.items, state.activeItem]);

  const handlePrevScene = useCallback(() => {
    if (activeItemIndex > 0) {
      const prev = state.items[activeItemIndex - 1];
      state.handleSeek(prev.start_time || 0);
    }
  }, [activeItemIndex, state]);

  const handleNextScene = useCallback(() => {
    if (activeItemIndex < state.items.length - 1) {
      const next = state.items[activeItemIndex + 1];
      state.handleSeek(next.start_time || 0);
    }
  }, [activeItemIndex, state]);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F3F0E8] text-[#26251F]">
      {/* Step Navigation Header */}
      <TimelineStepHeader
        onNavigateImages={() => state.setActiveTab("storyboard_images")}
        onNavigateRender={() => state.setActiveTab("storyboard_render")}
      />

      {/* Hidden Audio Element */}
      {state.audio && (
        <audio
          ref={state.audioRef}
          src={state.audio.audio_url || state.audio.file_url || undefined}
          onTimeUpdate={state.handleTimeUpdate}
          onLoadedMetadata={state.handleLoadedMetadata}
          onEnded={state.handleEnded}
        />
      )}

      {/* Main NLE Layout: Left Rail+Drawer | Center Monitor | Bottom Clips Track */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Upper Section: Rail + Drawer + Monitor side by side */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden border-b border-[#E5E1D7]">
          {/* Left Side: Icon Rail + Collapsible Drawer Panel */}
          <div className="flex shrink-0 flex-row min-h-0 overflow-hidden">
            {/* Narrow Icon Rail — always visible */}
            <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-[#E5E1D7] bg-[#EEEBE2] py-2">
              {SIDE_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = state.activeRightTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    aria-label={tab.title}
                    onClick={() => {
                      if (isActive && !isDrawerCollapsed) {
                        setIsDrawerCollapsed(true);
                      } else {
                        state.setActiveRightTab(tab.id);
                        setIsDrawerCollapsed(false);
                      }
                    }}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                      isActive && !isDrawerCollapsed
                        ? "bg-[#C45B3A] text-white shadow-sm"
                        : "text-[#77766D] hover:bg-[#E5E1D7] hover:text-[#26251F]"
                    }`}
                    title={tab.title}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </button>
                );
              })}

              {/* Watermark active indicator */}
              {state.liveWatermark?.enabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#C45B3A] mt-0.5" aria-hidden="true" />
              )}

              {/* Collapse toggle at bottom */}
              <div className="mt-auto">
                <button
                  type="button"
                  aria-label={
                    isDrawerCollapsed ? "Buka panel konfigurasi" : "Tutup panel konfigurasi"
                  }
                  onClick={() => setIsDrawerCollapsed(!isDrawerCollapsed)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#77766D] hover:bg-[#E5E1D7] hover:text-[#26251F] transition-colors"
                >
                  {isDrawerCollapsed ? (
                    <PanelLeftOpen className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <PanelLeftClose className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Drawer Panel */}
            {!isDrawerCollapsed && (
              <div
                style={{ width: drawerWidth }}
                className="flex shrink-0 flex-col border-r border-[#E5E1D7] bg-[#FBFAF7] overflow-hidden"
              >
                {/* Drawer Header */}
                <div className="shrink-0 border-b border-[#E5E1D7] px-4 py-2.5">
                  <span className="text-xs font-semibold text-[#26251F]">
                    {SIDE_TABS.find((t) => t.id === state.activeRightTab)?.label ?? "Konfigurasi"}
                  </span>
                </div>

                {/* Drawer Content — scrollable */}
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
            )}
          </div>

          {/* Resizer Handle: Drawer Width */}
          {!isDrawerCollapsed && (
            <div
              onMouseDown={() => setIsResizingDrawer(true)}
              className="group z-10 flex w-1.5 shrink-0 cursor-col-resize select-none items-center justify-center bg-transparent transition hover:bg-[#C45B3A]/20 active:bg-[#C45B3A]"
              title="Drag untuk mengubah lebar panel"
            >
              <div className="w-px h-8 bg-[#E5E1D7] group-hover:bg-[#C45B3A]" />
            </div>
          )}

          {/* Center: Video Preview Monitor */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#F3F0E8] pt-3">
            {/* 16:9 Video Canvas */}
            <div className="flex-1 min-h-0 flex flex-column items-center justify-center overflow-hidden">
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
                onDimensionsChange={state.handleDimensionsChange}
                className="group relative flex aspect-video h-full w-auto max-h-full max-w-full shrink-0 select-none items-center justify-center overflow-hidden rounded-xl border-2 border-[#E5E1D7] bg-[#FFFEFA] shadow-lg"
              />
            </div>
            
              {/* Seekbar */}
              <input
                type="range"
                min={0}
                max={state.duration || state.audio?.duration || 1}
                step={0.1}
                value={state.currentTime}
                onChange={(e) => state.handleSeek(Number(e.target.value))}
                aria-label="Posisi playback"
                className="mt-2 mb-2 block h-1.5 w-full shrink-0 cursor-pointer rounded-lg bg-[#E5E1D7] accent-[#C45B3A]"
              />

            {/* Unified Transport Bar — single row */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[#E5E1D7] bg-[#FBFAF7] px-3 py-1.5">
              {/* Left: Rewind / Forward */}
              <div className="flex items-center gap-1">
                <TBtn
                  title="Mundur 5 detik"
                  onClick={() => state.handleSeek(Math.max(0, state.currentTime - 5))}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </TBtn>
                <TBtn
                  title="Maju 5 detik"
                  onClick={() =>
                    state.handleSeek(
                      Math.min(state.duration || state.audio?.duration || 0, state.currentTime + 5)
                    )
                  }
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </TBtn>
              </div>

              {/* Center: Scene nav + Play + Timecode */}
              <div className="flex items-center gap-1.5">
                <TBtn
                  title="Adegan Sebelumnya"
                  onClick={handlePrevScene}
                  disabled={activeItemIndex <= 0}
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </TBtn>
                <TBtn title="Mundur" onClick={handlePrevScene} disabled={activeItemIndex <= 0}>
                  <ChevronLeft className="w-4 h-4" />
                </TBtn>

                <button
                  type="button"
                  onClick={state.togglePlay}
                  className="mx-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C45B3A] text-white shadow-sm transition hover:bg-[#A9472C] active:scale-95"
                  aria-label={state.isPlaying ? "Jeda" : "Putar"}
                  title={state.isPlaying ? "Jeda (Spasi)" : "Putar (Spasi)"}
                >
                  {state.isPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  ) : (
                    <Play className="w-3.5 h-3.5 ml-0.5 fill-current" aria-hidden="true" />
                  )}
                </button>

                <TBtn
                  title="Maju"
                  onClick={handleNextScene}
                  disabled={activeItemIndex >= state.items.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </TBtn>
                <TBtn
                  title="Adegan Berikutnya"
                  onClick={handleNextScene}
                  disabled={activeItemIndex >= state.items.length - 1}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </TBtn>

                <div className="ml-2 font-mono text-[11px] tabular-nums hidden sm:inline">
                  <span className="font-bold text-[#C45B3A]">
                    {state.formatTime(state.currentTime)}
                  </span>
                  <span className="text-[#77766D]">
                    {" "}
                    / {state.formatTime(state.duration || state.audio?.duration || 0)}
                  </span>
                </div>
              </div>

              {/* Right: Loop, Subtitle toggle, Mute, Safe Zones */}
              <div className="flex items-center gap-1">
                <TBtn
                  title={state.isLooping ? "Matikan Loop Video" : "Aktifkan Loop Video"}
                  onClick={() => state.setIsLooping(!state.isLooping)}
                  active={state.isLooping}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </TBtn>
                <TBtn
                  title={state.isMuted ? "Unmute Audio" : "Mute Audio"}
                  onClick={() => {
                    if (state.audioRef.current) {
                      state.audioRef.current.muted = !state.isMuted;
                      state.setIsMuted(!state.isMuted);
                    }
                  }}
                >
                  {state.isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 text-[#A9472C]" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </TBtn>

                <TBtn
                  title="Toggle batas aman YouTube"
                  onClick={() => setShowSafeZones(!showSafeZones)}
                  active={showSafeZones}
                >
                  <Eye className="w-3.5 h-3.5" />
                </TBtn>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Full-Width Scene Clips Track */}
        <div className="shrink-0 bg-[#F3F0E8] px-4 py-1">
          <ClipsTrackList
            items={state.items}
            activeItemId={state.activeItem?.id}
            onSeek={state.handleSeek}
            formatTime={state.formatTime}
          />
        </div>
      </div>
    </div>
  );
}

function TBtn({
  children,
  title,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-25 disabled:cursor-not-allowed ${
        active
          ? "bg-[#F8EEEA] text-[#A9472C] border border-[#E9C9BD]"
          : "text-[#77766D] hover:text-[#26251F] hover:bg-[#EAE6DD]"
      }`}
    >
      {children}
    </button>
  );
}

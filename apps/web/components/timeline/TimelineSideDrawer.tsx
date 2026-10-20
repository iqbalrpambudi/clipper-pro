"use client";

import React from "react";
import {
  Film,
  SlidersHorizontal,
  Subtitles,
  Maximize2,
  Stamp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TimelineMediaPool } from "./TimelineMediaPool";
import { ClipInspector } from "./ClipInspector";
import { SubtitleCustomizePanel } from "../subtitles/SubtitleCustomizePanel";
import { VideoLayoutCustomizePanel } from "./VideoLayoutCustomizePanel";
import { WatermarkCustomizePanel } from "../watermark/WatermarkCustomizePanel";
import {
  Project,
  Timeline,
  TimelineClip,
  Scene,
  AudioTrack,
  Narration,
  SourceVideo,
  WatermarkConfig,
  BackgroundFill,
  SubtitleStyle,
} from "@/types";
import { SceneMap } from "@/lib/timeline/editOps";

export type SideTab = "pool" | "inspector" | "subtitles" | "layout" | "watermark";

interface TimelineSideDrawerProps {
  activeSideTab: SideTab;
  setActiveSideTab: (tab: SideTab) => void;
  isDrawerCollapsed: boolean;
  setIsDrawerCollapsed: (collapsed: boolean) => void;
  drawerWidth?: number;
  isVertical: boolean;
  selectedClipIndex: number | null;
  project: Project & {
    timeline?: Timeline | null;
    scenes: Scene[];
    audio?: AudioTrack | null;
    narration?: Narration | null;
    source_videos?: SourceVideo[];
  };
  usedSceneMap: Map<string, number[]>;
  totalDuration: number;
  clips: TimelineClip[];
  sceneMap: SceneMap;
  time: number;
  canSplit: boolean;
  loopRange: { start: number; end: number } | null;
  beginGesture: () => void;
  cancelIfUnchanged: () => void;
  setClips: (clips: TimelineClip[], commit?: boolean) => void;
  handleReplaceSelectedClip: (sc: Scene) => void;
  handleInsertAtPlayhead: (sc: Scene) => void;
  handleAppendScene: (sc: Scene) => void;
  handleSetClipDuration: (dur: number) => void;
  handleSetClipSpeed: (speed: number) => void;
  handleSplit: () => void;
  handleDeleteSelectedClip: () => void;
  handleSwapNeighbor: (dir: -1 | 1) => void;
  handleCenterClip: () => void;
  handleFillScene: () => void;
  handlePreviewSelectedClipSource: () => void;
  toggleLoop: () => void;
  setPreviewData: (data: {
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    startTime: number;
    endTime: number;
    title: string;
    description?: string | null;
    tags?: string[];
  } | null) => void;
  setLiveAspectRatio: (ratio: string) => void;
  setLiveBackgroundFill: (fill: BackgroundFill | null) => void;
  setLiveWatermark: (wm: WatermarkConfig | null) => void;
  setLiveSubtitleStyle: (style: SubtitleStyle | null) => void;
  seekTo: (t: number) => void;
}

export function TimelineSideDrawer({
  activeSideTab,
  setActiveSideTab,
  isDrawerCollapsed,
  setIsDrawerCollapsed,
  drawerWidth = 380,
  isVertical,
  selectedClipIndex,
  project,
  usedSceneMap,
  totalDuration,
  clips,
  sceneMap,
  time,
  canSplit,
  loopRange,
  beginGesture,
  cancelIfUnchanged,
  setClips,
  handleReplaceSelectedClip,
  handleInsertAtPlayhead,
  handleAppendScene,
  handleSetClipDuration,
  handleSetClipSpeed,
  handleSplit,
  handleDeleteSelectedClip,
  handleSwapNeighbor,
  handleCenterClip,
  handleFillScene,
  handlePreviewSelectedClipSource,
  toggleLoop,
  setPreviewData,
  setLiveAspectRatio,
  setLiveBackgroundFill,
  setLiveWatermark,
  setLiveSubtitleStyle,
  seekTo,
}: TimelineSideDrawerProps) {
  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] || null : null;
  const selectedScene = selectedClip ? sceneMap.get(selectedClip.scene_id) : undefined;

  const handleTabClick = (tab: SideTab) => {
    setActiveSideTab(tab);
    if (!isVertical) {
      setIsDrawerCollapsed(false);
    }
  };

  const renderActiveContent = () => {
    if (activeSideTab === "pool") {
      return (
        <TimelineMediaPool
          scenes={project.scenes || []}
          sourceVideos={project.source_videos || []}
          usedSceneMap={usedSceneMap}
          selectedClipNumber={selectedClipIndex !== null ? selectedClipIndex + 1 : null}
          selectedSceneId={selectedClip?.scene_id || null}
          canInsertAtPlayhead={totalDuration > 0}
          onReplace={handleReplaceSelectedClip}
          onInsert={handleInsertAtPlayhead}
          onAppend={handleAppendScene}
          onPreview={(sc) =>
            setPreviewData({
              videoUrl: sc.video_url,
              thumbnailUrl: sc.thumbnail_url,
              startTime: sc.start_time,
              endTime: sc.end_time,
              title: `Scene #${sc.scene_index + 1}`,
              description: sc.description,
              tags: sc.tags,
            })
          }
        />
      );
    }

    if (activeSideTab === "inspector") {
      return (
        <ClipInspector
          clip={selectedClip}
          index={selectedClipIndex}
          total={clips.length}
          scene={selectedScene}
          sceneMap={sceneMap}
          time={time}
          canSplit={canSplit}
          isLooping={Boolean(loopRange)}
          onCommit={(updated) => {
            if (selectedClipIndex === null) return;
            const out = [...clips];
            out[selectedClipIndex] = updated;
            setClips(out);
          }}
          onGestureStart={beginGesture}
          onGestureUpdate={(updated) => {
            if (selectedClipIndex === null) return;
            const out = [...clips];
            out[selectedClipIndex] = updated;
            setClips(out, false);
          }}
          onGestureEnd={cancelIfUnchanged}
          onSetDuration={handleSetClipDuration}
          onSetSpeed={handleSetClipSpeed}
          onSplit={handleSplit}
          onDelete={handleDeleteSelectedClip}
          onMove={handleSwapNeighbor}
          onCenter={handleCenterClip}
          onFillScene={handleFillScene}
          onPreviewSource={handlePreviewSelectedClipSource}
          onToggleLoop={toggleLoop}
        />
      );
    }

    if (activeSideTab === "layout") {
      return (
        <VideoLayoutCustomizePanel
          project={project}
          onLayoutChange={(ratio, fill) => {
            setLiveAspectRatio(ratio);
            setLiveBackgroundFill(fill);
          }}
        />
      );
    }

    if (activeSideTab === "watermark") {
      return (
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          <WatermarkCustomizePanel
            project={project}
            onWatermarkChange={(wm) => setLiveWatermark(wm)}
          />
        </div>
      );
    }

    return (
      <SubtitleCustomizePanel
        project={project}
        currentTime={time}
        onSeek={seekTo}
        onStyleChange={(style) => setLiveSubtitleStyle(style)}
      />
    );
  };

  return (
    <>
      {/* Vertical Icon Rail */}
      <div className="w-12 shrink-0 border-r border-border bg-surface flex flex-col items-center py-2.5 justify-between select-none">
        <div className="flex flex-col items-center gap-2 w-full">
          <button
            type="button"
            onClick={() => handleTabClick("pool")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
              activeSideTab === "pool" && (isVertical || !isDrawerCollapsed)
                ? "bg-primary text-black font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Media Pool (Koleksi Scene)"
          >
            <Film className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("inspector")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition relative ${
              activeSideTab === "inspector" && (isVertical || !isDrawerCollapsed)
                ? "bg-primary text-black font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Clip Inspector (Pengaturan Klip)"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {selectedClipIndex !== null && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary absolute top-1.5 right-1.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("subtitles")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
              activeSideTab === "subtitles" && (isVertical || !isDrawerCollapsed)
                ? "bg-primary text-black font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Subtitle Style & Presets"
          >
            <Subtitles className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("layout")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
              activeSideTab === "layout" && (isVertical || !isDrawerCollapsed)
                ? "bg-primary text-black font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Mode Tampilan & Rasio Video"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("watermark")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
              activeSideTab === "watermark" && (isVertical || !isDrawerCollapsed)
                ? "bg-primary text-black font-semibold shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            title="Watermark Video (Teks & Posisi)"
          >
            <Stamp className="w-4 h-4" />
          </button>
        </div>

        {/* Collapse toggle (only in horizontal mode) */}
        {!isVertical && (
          <button
            type="button"
            onClick={() => setIsDrawerCollapsed(!isDrawerCollapsed)}
            className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent flex items-center justify-center transition"
            title={isDrawerCollapsed ? "Buka panel drawer" : "Tutup panel drawer"}
          >
            {isDrawerCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Drawer Content */}
      {isVertical ? (
        <div className="flex-1 min-w-0 bg-surface-secondary flex flex-col overflow-hidden">
          {renderActiveContent()}
        </div>
      ) : (
        <div
          style={{ width: isDrawerCollapsed ? 0 : drawerWidth }}
          className={`shrink-0 border-r border-surface-border bg-surface-secondary flex flex-col overflow-hidden transition-[width] duration-75 ${
            isDrawerCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          {renderActiveContent()}
        </div>
      )}
    </>
  );
}

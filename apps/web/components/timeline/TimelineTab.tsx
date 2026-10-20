"use client";

import React from "react";
import { ScenePreviewModal } from "../media/ScenePreviewModal";
import { TimelineMonitor } from "./TimelineMonitor";
import { TimelineTracks } from "./TimelineTracks";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineSideDrawer } from "./TimelineSideDrawer";
import { ClearTimelineModal } from "./ClearTimelineModal";
import { useTimelineState, TimelineProjectData } from "./hooks/useTimelineState";

interface TimelineTabProps {
  project: TimelineProjectData;
}

export function TimelineTab({ project }: TimelineTabProps) {
  const {
    clips,
    setClips,
    beginGesture,
    cancelIfUnchanged,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    sceneMap,
    usedSceneMap,
    time,
    handleTimeChange,
    seekRequest,
    isPlaying,
    setIsPlaying,
    selectedClipIndex,
    handleSelectClip,
    loopRange,
    toggleLoop,
    activeSideTab,
    setActiveSideTab,
    isDrawerCollapsed,
    setIsDrawerCollapsed,
    drawerWidth,
    tracksHeight,
    setIsResizingDrawer,
    setIsResizingTracks,
    liveAspectRatio,
    setLiveAspectRatio,
    liveBackgroundFill,
    setLiveBackgroundFill,
    verticalPreviewWidth,
    setIsResizingVerticalPreview,
    isVertical,
    liveSubtitleStyle,
    setLiveSubtitleStyle,
    liveWatermark,
    setLiveWatermark,
    isAudioAttached,
    isSubtitlesAttached,
    attachedSegments,
    totalDuration,
    seekTo,
    stepFrames,
    jumpCut,
    peaks,
    previewData,
    setPreviewData,
    isAutoMatching,
    matchElapsed,
    autoMatchMutation,
    saveTimelineMutation,
    isClearConfirmOpen,
    setIsClearConfirmOpen,
    clearScope,
    setClearScope,
    clearTimelineMutation,
    readdNarrationMutation,
    handleReaddAll,
    handleReaddAudio,
    handleReaddSubtitles,
    canSplit,
    handleSplit,
    handleDeleteSelectedClip,
    getEdgeRange,
    handleEdgeDragStart,
    handleEdgeDrag,
    handleEdgeDragEnd,
    handleDropScene,
    handleReplaceSelectedClip,
    handleInsertAtPlayhead,
    handleAppendScene,
    handleSetClipDuration,
    handleSetClipSpeed,
    handleCenterClip,
    handleFillScene,
    handleSwapNeighbor,
    handlePreviewSelectedClipSource,
    setActiveTab,
  } = useTimelineState(project);

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] min-h-[640px] max-h-[calc(100vh-120px)] w-full border border-[#2E2E2E] bg-[#121212] overflow-hidden shadow-xl">
      {/* Top Header Bar */}
      <TimelineHeader
        clipsCount={clips.length}
        isSaving={saveTimelineMutation.isPending}
        isDirty={isDirty}
        totalDuration={totalDuration}
        isAudioAttached={isAudioAttached}
        isSubtitlesAttached={isSubtitlesAttached}
        isReadding={readdNarrationMutation.isPending}
        isAutoMatching={isAutoMatching}
        matchElapsed={matchElapsed}
        onReaddAll={handleReaddAll}
        onOpenClearModal={() => {
          setClearScope("all");
          setIsClearConfirmOpen(true);
        }}
        onAutoMatch={() => autoMatchMutation.mutate()}
        onRender={() => {
          if (isDirty) {
            saveTimelineMutation.mutate({});
          }
          setActiveTab("render");
        }}
      />

      {/* Main Studio Body: Zero-Scroll NLE Layout */}
      {isVertical ? (
        /* Vertical Layout: Left area (Rail + Panel on top, Tracks on bottom) & Right area (Full-height Preview) */
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* Left Column: Editor controls & Tracks */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-row overflow-hidden border-b border-surface-border/70">
              <TimelineSideDrawer
                activeSideTab={activeSideTab}
                setActiveSideTab={setActiveSideTab}
                isDrawerCollapsed={isDrawerCollapsed}
                setIsDrawerCollapsed={setIsDrawerCollapsed}
                drawerWidth={drawerWidth}
                isVertical={true}
                selectedClipIndex={selectedClipIndex}
                project={project}
                usedSceneMap={usedSceneMap}
                totalDuration={totalDuration}
                clips={clips}
                sceneMap={sceneMap}
                time={time}
                canSplit={canSplit}
                loopRange={loopRange}
                beginGesture={beginGesture}
                cancelIfUnchanged={cancelIfUnchanged}
                setClips={setClips}
                handleReplaceSelectedClip={handleReplaceSelectedClip}
                handleInsertAtPlayhead={handleInsertAtPlayhead}
                handleAppendScene={handleAppendScene}
                handleSetClipDuration={handleSetClipDuration}
                handleSetClipSpeed={handleSetClipSpeed}
                handleSplit={handleSplit}
                handleDeleteSelectedClip={handleDeleteSelectedClip}
                handleSwapNeighbor={handleSwapNeighbor}
                handleCenterClip={handleCenterClip}
                handleFillScene={handleFillScene}
                handlePreviewSelectedClipSource={handlePreviewSelectedClipSource}
                toggleLoop={toggleLoop}
                setPreviewData={setPreviewData}
                setLiveAspectRatio={setLiveAspectRatio}
                setLiveBackgroundFill={setLiveBackgroundFill}
                setLiveWatermark={setLiveWatermark}
                setLiveSubtitleStyle={setLiveSubtitleStyle}
                seekTo={seekTo}
              />
            </div>

            {/* Resizer Handle: Tracks Height */}
            <div
              onMouseDown={() => setIsResizingTracks(true)}
              className="h-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-row-resize transition flex items-center justify-center group z-10 select-none"
              title="Drag to resize tracks"
            >
              <div className="h-[1px] w-12 bg-surface-border group-hover:bg-brand-400" />
            </div>

            {/* Lower row: Multi-Track Timeline */}
            <div
              style={{ height: tracksHeight }}
              className="shrink-0 flex flex-col bg-surface-secondary overflow-hidden transition-[height] duration-75"
            >
              <TimelineTracks
                clips={clips}
                segments={attachedSegments}
                peaks={isAudioAttached ? peaks : null}
                audioDuration={isAudioAttached ? project.audio?.duration || totalDuration : 0}
                voice={project.audio?.voice}
                duration={totalDuration}
                time={time}
                isPlaying={isPlaying}
                selectedIndex={selectedClipIndex}
                loopRange={loopRange}
                hasAudio={isAudioAttached}
                hasSubtitles={isSubtitlesAttached}
                onSelect={handleSelectClip}
                onSeek={seekTo}
                getEdgeRange={getEdgeRange}
                onEdgeDragStart={handleEdgeDragStart}
                onEdgeDrag={handleEdgeDrag}
                onEdgeDragEnd={handleEdgeDragEnd}
                onDropScene={handleDropScene}
                onEditSubtitles={() => setActiveSideTab("subtitles")}
                onReaddAudio={handleReaddAudio}
                onReaddSubtitles={handleReaddSubtitles}
                onReaddAll={handleReaddAll}
              />
            </div>
          </div>

          {/* Resizer Handle: Vertical Preview Column Width */}
          <div
            onMouseDown={() => setIsResizingVerticalPreview(true)}
            className="w-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-col-resize transition flex items-center justify-center group z-10 select-none"
            title="Drag to resize preview monitor"
          >
            <div className="w-[1px] h-12 bg-surface-border group-hover:bg-brand-400" />
          </div>

          {/* Right Column: Full-Height Vertical Program Monitor */}
          <div
            style={{ width: verticalPreviewWidth }}
            className="shrink-0 flex flex-col p-2 bg-black/40 border-l border-surface-border/70 overflow-hidden"
          >
            <TimelineMonitor
              clips={clips}
              audioUrl={isAudioAttached ? project.audio?.audio_url : undefined}
              duration={totalDuration}
              segments={attachedSegments}
              aspectRatio={liveAspectRatio}
              backgroundFill={liveBackgroundFill}
              bgMode={liveBackgroundFill?.mode || "blur"}
              subtitleStyle={liveSubtitleStyle}
              watermark={liveWatermark}
              time={time}
              seekRequest={seekRequest}
              isPlaying={isPlaying}
              loopRange={loopRange}
              onPlayingChange={setIsPlaying}
              onTimeChange={handleTimeChange}
              onSeek={seekTo}
              onStep={stepFrames}
              onJumpCut={jumpCut}
              onToggleLoop={toggleLoop}
              canLoop={selectedClipIndex !== null}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              onSplit={handleSplit}
              canSplit={canSplit}
              onUpdateSubtitlePosition={(pos) => {
                setLiveSubtitleStyle((prev) => (prev ? { ...prev, ...pos } : null));
              }}
            />
          </div>
        </div>
      ) : (
        /* Horizontal Layout: Upper Section (Rail + Drawer + Center Monitor) & Lower Section (Full-width Tracks) */
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-row border-b border-surface-border/70 overflow-hidden">
            <TimelineSideDrawer
              activeSideTab={activeSideTab}
              setActiveSideTab={setActiveSideTab}
              isDrawerCollapsed={isDrawerCollapsed}
              setIsDrawerCollapsed={setIsDrawerCollapsed}
              drawerWidth={drawerWidth}
              isVertical={false}
              selectedClipIndex={selectedClipIndex}
              project={project}
              usedSceneMap={usedSceneMap}
              totalDuration={totalDuration}
              clips={clips}
              sceneMap={sceneMap}
              time={time}
              canSplit={canSplit}
              loopRange={loopRange}
              beginGesture={beginGesture}
              cancelIfUnchanged={cancelIfUnchanged}
              setClips={setClips}
              handleReplaceSelectedClip={handleReplaceSelectedClip}
              handleInsertAtPlayhead={handleInsertAtPlayhead}
              handleAppendScene={handleAppendScene}
              handleSetClipDuration={handleSetClipDuration}
              handleSetClipSpeed={handleSetClipSpeed}
              handleSplit={handleSplit}
              handleDeleteSelectedClip={handleDeleteSelectedClip}
              handleSwapNeighbor={handleSwapNeighbor}
              handleCenterClip={handleCenterClip}
              handleFillScene={handleFillScene}
              handlePreviewSelectedClipSource={handlePreviewSelectedClipSource}
              toggleLoop={toggleLoop}
              setPreviewData={setPreviewData}
              setLiveAspectRatio={setLiveAspectRatio}
              setLiveBackgroundFill={setLiveBackgroundFill}
              setLiveWatermark={setLiveWatermark}
              setLiveSubtitleStyle={setLiveSubtitleStyle}
              seekTo={seekTo}
            />

            {/* Resizer Handle: Drawer Width */}
            {!isDrawerCollapsed && (
              <div
                onMouseDown={() => setIsResizingDrawer(true)}
                className="w-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-col-resize transition flex items-center justify-center group z-10 select-none"
                title="Drag to resize panel"
              >
                <div className="w-[1px] h-8 bg-surface-border group-hover:bg-brand-400" />
              </div>
            )}

            {/* Right Main Area: Program Monitor */}
            <div className="flex-1 min-h-0 flex flex-col p-2 bg-black/40 overflow-hidden">
              <TimelineMonitor
                clips={clips}
                audioUrl={isAudioAttached ? project.audio?.audio_url : undefined}
                duration={totalDuration}
                segments={attachedSegments}
                aspectRatio={liveAspectRatio}
                backgroundFill={liveBackgroundFill}
                bgMode={liveBackgroundFill?.mode || "blur"}
                subtitleStyle={liveSubtitleStyle}
                watermark={liveWatermark}
                time={time}
                seekRequest={seekRequest}
                isPlaying={isPlaying}
                loopRange={loopRange}
                onPlayingChange={setIsPlaying}
                onTimeChange={handleTimeChange}
                onSeek={seekTo}
                onStep={stepFrames}
                onJumpCut={jumpCut}
                onToggleLoop={toggleLoop}
                canLoop={selectedClipIndex !== null}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
                onSplit={handleSplit}
                canSplit={canSplit}
                onUpdateSubtitlePosition={(pos) => {
                  setLiveSubtitleStyle((prev) => (prev ? { ...prev, ...pos } : null));
                }}
              />
            </div>
          </div>

          {/* Resizer Handle: Tracks Height */}
          <div
            onMouseDown={() => setIsResizingTracks(true)}
            className="h-1.5 shrink-0 bg-transparent hover:bg-brand-500/50 active:bg-brand-500 cursor-row-resize transition flex items-center justify-center group z-10 select-none"
            title="Drag to resize tracks"
          >
            <div className="h-[1px] w-12 bg-surface-border group-hover:bg-brand-400" />
          </div>

          {/* Lower Section: Full-Width Multi-Track Timeline */}
          <div
            style={{ height: tracksHeight }}
            className="shrink-0 flex flex-col bg-surface-secondary overflow-hidden transition-[height] duration-75"
          >
            <TimelineTracks
              clips={clips}
              segments={attachedSegments}
              peaks={isAudioAttached ? peaks : null}
              audioDuration={isAudioAttached ? project.audio?.duration || totalDuration : 0}
              voice={project.audio?.voice}
              duration={totalDuration}
              time={time}
              isPlaying={isPlaying}
              selectedIndex={selectedClipIndex}
              loopRange={loopRange}
              hasAudio={isAudioAttached}
              hasSubtitles={isSubtitlesAttached}
              onSelect={handleSelectClip}
              onSeek={seekTo}
              getEdgeRange={getEdgeRange}
              onEdgeDragStart={handleEdgeDragStart}
              onEdgeDrag={handleEdgeDrag}
              onEdgeDragEnd={handleEdgeDragEnd}
              onDropScene={handleDropScene}
              onEditSubtitles={() => {
                setActiveSideTab("subtitles");
                setIsDrawerCollapsed(false);
              }}
              onReaddAudio={handleReaddAudio}
              onReaddSubtitles={handleReaddSubtitles}
              onReaddAll={handleReaddAll}
            />
          </div>
        </div>
      )}

      {/* Single Scene Preview Modal */}
      {previewData && (
        <ScenePreviewModal
          isOpen={Boolean(previewData)}
          onClose={() => setPreviewData(null)}
          videoUrl={previewData.videoUrl}
          thumbnailUrl={previewData.thumbnailUrl}
          startTime={previewData.startTime}
          endTime={previewData.endTime}
          title={previewData.title}
          description={previewData.description}
          tags={previewData.tags}
        />
      )}

      {/* Confirm Clear Timeline Modal */}
      <ClearTimelineModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        clearScope={clearScope}
        onScopeChange={setClearScope}
        onConfirm={() => clearTimelineMutation.mutate(clearScope)}
        isPending={clearTimelineMutation.isPending}
      />
    </div>
  );
}

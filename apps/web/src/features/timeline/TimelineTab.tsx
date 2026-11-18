import { useMemo, useState } from "react";
import { ScenePreviewModal } from "@/features/media/ScenePreviewModal";
import { TimelineMonitor } from "./TimelineMonitor";
import { TimelineTracks } from "./TimelineTracks";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineSideDrawer } from "./TimelineSideDrawer";
import { ClearTimelineModal } from "./ClearTimelineModal";
import { useTimelineState, TimelineProjectData } from "./hooks/useTimelineState";
import { useAssPreview } from "@/hooks/useAssPreview";

interface TimelineTabProps {
  project: TimelineProjectData;
}

export function TimelineTab({ project }: TimelineTabProps) {
  const hardsubBySource = useMemo(
    () => Object.fromEntries((project.source_videos ?? []).map((v) => [v.id, v.hardsub])),
    [project.source_videos]
  );
  const [isAutoMatchConfirmOpen, setIsAutoMatchConfirmOpen] = useState(false);
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
    tracksHeight,
    setIsResizingTracks,
    liveAspectRatio,
    setLiveAspectRatio,
    liveBackgroundFill,
    setLiveBackgroundFill,
    verticalPreviewWidth,
    setIsResizingVerticalPreview,
    liveSubtitleStyle,
    handleSubtitleChange,
    handleCustomSubtitlePositionChange,
    handleSubtitleDragEnd,
    liveWatermark,
    handleCustomWatermarkPositionChange,
    handleWatermarkDragEnd,
    isAudioAttached,
    isSubtitlesAttached,
    attachedSegments,
    totalDuration,
    seekTo,
    peaks,
    previewData,
    setPreviewData,
    isAutoMatching,
    matchElapsed,
    autoMatchMutation,
    saveTimelineMutation,
    isClearConfirmOpen,
    setIsClearConfirmOpen,
    clearTimelineMutation,
    readdNarrationMutation,
    handleReaddAll,
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
    handleSwapNeighbor,
    handlePreviewSelectedClipSource,
    setActiveTab,
  } = useTimelineState(project);
  const subtitleAss = useAssPreview(
    project.id,
    isSubtitlesAttached ? liveSubtitleStyle : null,
    attachedSegments
  );

  const isWatermarkDraggable = Boolean(
    liveWatermark?.enabled && liveWatermark.position === "custom"
  );

  return (
    <div className="flex h-[calc(100vh-112px)] max-h-[calc(100vh-108px)] min-h-[560px] w-full flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-secondary shadow-sm">
      {/* Top Header Bar with Integrated Panel Navigation */}
      <TimelineHeader
        activeSideTab={activeSideTab}
        onSelectSideTab={setActiveSideTab}
        selectedClipIndex={selectedClipIndex}
        clipsCount={clips.length}
        isSaving={saveTimelineMutation.isPending}
        isDirty={isDirty}
        totalDuration={totalDuration}
        isAudioAttached={isAudioAttached}
        isSubtitlesAttached={isSubtitlesAttached}
        isReadding={readdNarrationMutation.isPending}
        onReaddAll={handleReaddAll}
        isAutoMatching={isAutoMatching}
        matchElapsed={matchElapsed}
        onOpenClearModal={() => setIsClearConfirmOpen(true)}
        onAutoMatch={() => {
          // Auto-match replaces every clip and the server reload clears undo.
          // In-app modal, not window.confirm: the desktop webview has no confirm() and returns false.
          if (clips.length) setIsAutoMatchConfirmOpen(true);
          else autoMatchMutation.mutate();
        }}
        onRender={async () => {
          // Render reads the saved timeline, so wait for the save (error toast comes from the mutation)
          if (isDirty) {
            try {
              await saveTimelineMutation.mutateAsync({ clips });
            } catch {
              return;
            }
          }
          setActiveTab("render");
        }}
      />

      {/* Main Studio Body: Zero-Scroll NLE Layout */}
      {/* Left: active panel + tracks. Right: full-height 9:16 monitor */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
        {/* Left Column: Editor controls & Tracks */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-row overflow-hidden border-b border-surface-border/70">
            <TimelineSideDrawer
              activeSideTab={activeSideTab}
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
              handlePreviewSelectedClipSource={handlePreviewSelectedClipSource}
              toggleLoop={toggleLoop}
              setPreviewData={setPreviewData}
              setLiveAspectRatio={setLiveAspectRatio}
              setLiveBackgroundFill={setLiveBackgroundFill}
              liveSubtitleStyle={liveSubtitleStyle}
              onSubtitleChange={handleSubtitleChange}
            />
          </div>

          {/* Resizer Handle: Tracks Height */}
          <div
            onMouseDown={() => setIsResizingTracks(true)}
            className="group z-10 flex h-1.5 shrink-0 cursor-row-resize select-none items-center justify-center bg-transparent transition hover:bg-primary/20 active:bg-primary"
            title="Drag to resize tracks"
          >
            <div className="h-[1px] w-12 bg-surface-border group-hover:bg-primary" />
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
            />
          </div>
        </div>

        {/* Resizer Handle: Vertical Preview Column Width */}
        <div
          onMouseDown={() => setIsResizingVerticalPreview(true)}
          className="group z-10 flex w-1.5 shrink-0 cursor-col-resize select-none items-center justify-center bg-transparent transition hover:bg-primary/20 active:bg-primary"
          title="Drag to resize preview monitor"
        >
          <div className="w-[1px] h-12 bg-surface-border group-hover:bg-primary" />
        </div>

        {/* Right Column: Full-Height Vertical Program Monitor */}
        <div
          style={{ width: verticalPreviewWidth }}
          className="shrink-0 flex flex-col p-2 bg-surface-secondary border-l border-surface-border/70 overflow-hidden"
        >
          <TimelineMonitor
            clips={clips}
            audioUrl={isAudioAttached ? project.audio?.audio_url : undefined}
            duration={totalDuration}
            subtitleAss={subtitleAss}
            aspectRatio={liveAspectRatio}
            backgroundFill={liveBackgroundFill}
            hardsubBySource={hardsubBySource}
            bgMode={liveBackgroundFill?.mode || "blur"}
            subtitleStyle={liveSubtitleStyle}
            watermark={liveWatermark}
            isWatermarkDraggable={isWatermarkDraggable}
            onUpdateWatermarkPosition={handleCustomWatermarkPositionChange}
            onWatermarkDragEnd={handleWatermarkDragEnd}
            time={time}
            seekRequest={seekRequest}
            isPlaying={isPlaying}
            loopRange={loopRange}
            onPlayingChange={setIsPlaying}
            onTimeChange={handleTimeChange}
            onSeek={seekTo}
            onToggleLoop={toggleLoop}
            canLoop={clips.length > 0}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onSplit={handleSplit}
            canSplit={canSplit}
            onUpdateSubtitlePosition={handleCustomSubtitlePositionChange}
            onSubtitleDragEnd={handleSubtitleDragEnd}
          />
        </div>
      </div>

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
        onConfirm={() => clearTimelineMutation.mutate()}
        isPending={clearTimelineMutation.isPending}
      />

      <ClearTimelineModal
        isOpen={isAutoMatchConfirmOpen}
        onClose={() => setIsAutoMatchConfirmOpen(false)}
        onConfirm={() => {
          setIsAutoMatchConfirmOpen(false);
          autoMatchMutation.mutate();
        }}
        isPending={autoMatchMutation.isPending}
        title="Ganti semua klip dengan Auto-Match?"
        description="Auto-Match akan mengganti semua klip di timeline dan riwayat Undo ikut terhapus."
        confirmLabel="Auto-Match"
      />
    </div>
  );
}

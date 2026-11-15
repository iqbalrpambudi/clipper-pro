import { TimelineMediaPool } from "./TimelineMediaPool";
import { ClipInspector } from "./ClipInspector";
import { SubtitleCustomizePanel } from "../subtitles/SubtitleCustomizePanel";
import { toSubtitleStyle } from "../subtitles/constants";
import { VideoLayoutCustomizePanel } from "./VideoLayoutCustomizePanel";
import {
  AudioTrack,
  BackgroundFill,
  Narration,
  Project,
  Scene,
  SourceVideo,
  SubtitleStyle,
  Timeline,
  TimelineClip,
} from "@/types";
import { SceneMap } from "@/lib/timeline/editOps";

export type SideTab = "pool" | "inspector" | "subtitles" | "layout";

interface TimelineSideDrawerProps {
  activeSideTab: SideTab;
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
  liveSubtitleStyle?: SubtitleStyle | null;
  onSubtitleChange: (style: SubtitleStyle, immediate?: boolean) => void;
}

export function TimelineSideDrawer({
  activeSideTab,
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
  handlePreviewSelectedClipSource,
  toggleLoop,
  setPreviewData,
  setLiveAspectRatio,
  setLiveBackgroundFill,
  liveSubtitleStyle,
  onSubtitleChange,
}: TimelineSideDrawerProps) {
  const selectedClip = selectedClipIndex !== null ? clips[selectedClipIndex] || null : null;
  const selectedScene = selectedClip ? sceneMap.get(selectedClip.scene_id) : undefined;

  return (
    <div className="flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden bg-surface-secondary">
      {activeSideTab === "pool" && (
        <TimelineMediaPool
          scenes={project.scenes || []}
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
      )}

      {activeSideTab === "inspector" && (
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
          onPreviewSource={handlePreviewSelectedClipSource}
          onToggleLoop={toggleLoop}
        />
      )}

      {activeSideTab === "layout" && (
        <VideoLayoutCustomizePanel
          project={project}
          onLayoutChange={(ratio, fill) => {
            setLiveAspectRatio(ratio);
            setLiveBackgroundFill(fill);
          }}
        />
      )}

      {activeSideTab === "subtitles" && (
        <SubtitleCustomizePanel
          projectId={project.id}
          style={toSubtitleStyle(liveSubtitleStyle || project.subtitle_style)}
          onChange={onSubtitleChange}
        />
      )}
    </div>
  );
}

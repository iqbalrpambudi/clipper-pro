"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Player, PlayerRef, CallbackListener } from "@remotion/player";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Sparkles,
  Wand2,
  Code2,
  Save,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Palette,
  Sliders,
  Maximize2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";
import type { MotionScene, MotionTransitionType, Project } from "@/types";
import {
  MOTION_THEME_LIST,
  MotionProjectComposition,
  compileMotionSceneCode,
  getMotionTheme,
} from "@/lib/motion";
import {
  Button,
  Badge,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/components/ui";

interface MotionStudioTabProps {
  project: Project;
}

const TRANSITION_OPTIONS: Array<{ id: MotionTransitionType; label: string }> = [
  { id: "camera_push", label: "2.5D Camera Push & Drift" },
  { id: "iris_wipe", label: "Circular Iris Reveal" },
  { id: "slide_morph", label: "Kinetic Slide Morph" },
  { id: "cross_dissolve", label: "Smooth Cross Dissolve" },
  { id: "none", label: "Hard Cut (Tanpa Transisi)" },
];

function formatTimecode(frame: number, fps = 30): string {
  const totalSeconds = Math.max(0, frame) / fps;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const framesRem = Math.floor(Math.max(0, frame) % fps);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(
    framesRem
  ).padStart(2, "0")}`;
}

export function MotionStudioTab({ project }: MotionStudioTabProps) {
  const queryClient = useQueryClient();
  const { setActiveTab, showToast, activeTask } = useStudioStore();
  const playerRef = useRef<PlayerRef>(null);

  const scenes: MotionScene[] = useMemo(() => {
    const raw = project.motion_scenes || [];
    return [...raw].sort((a, b) => a.order_index - b.order_index);
  }, [project.motion_scenes]);

  const savedThemeId = useMemo(() => {
    const ws = project.world_setting as Record<string, unknown> | null | undefined;
    return typeof ws?.motion_theme === "string" ? ws.motion_theme : "claude_editorial";
  }, [project.world_setting]);

  const [activeThemeId, setActiveThemeId] = useState<string>(savedThemeId);
  useEffect(() => {
    setActiveThemeId(savedThemeId);
  }, [savedThemeId]);

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(scenes[0]?.id ?? null);
  const [inspectorTab, setInspectorTab] = useState<"director" | "code" | "audio">("director");
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Ensure selectedSceneId stays valid when scenes array changes
  useEffect(() => {
    if (!scenes.length) {
      setSelectedSceneId(null);
      return;
    }
    if (!selectedSceneId || !scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  // Compute scene start/end frame offsets along the Remotion <Series> timeline
  const sceneTimelineRanges = useMemo(() => {
    let cursor = 0;
    return scenes.map((scene, idx) => {
      const dur = Math.max(45, scene.duration_frames || 120);
      const startFrame = cursor;
      const endFrame = cursor + dur;
      cursor = endFrame;
      return {
        scene,
        index: idx,
        startFrame,
        endFrame,
        durationFrames: dur,
      };
    });
  }, [scenes]);

  const totalFrames = useMemo(() => {
    if (!sceneTimelineRanges.length) return 90;
    return Math.max(45, sceneTimelineRanges[sceneTimelineRanges.length - 1].endFrame);
  }, [sceneTimelineRanges]);

  const selectedRange = useMemo(
    () =>
      sceneTimelineRanges.find((r) => r.scene.id === selectedSceneId) ||
      sceneTimelineRanges[0] ||
      null,
    [sceneTimelineRanges, selectedSceneId]
  );

  const selectedScene = selectedRange?.scene || null;

  // Determine which scene the playhead is currently inside
  const playheadSceneRange = useMemo(() => {
    return (
      sceneTimelineRanges.find(
        (r) => currentFrame >= r.startFrame && currentFrame < r.endFrame
      ) ||
      sceneTimelineRanges[sceneTimelineRanges.length - 1] ||
      null
    );
  }, [sceneTimelineRanges, currentFrame]);

  // Inspector local states for selected scene
  const [remixPrompt, setRemixPrompt] = useState<string>("");
  const [visualConceptDraft, setVisualConceptDraft] = useState<string>("");
  const [draftCode, setDraftCode] = useState<string>("");
  const [isCodeDirty, setIsCodeDirty] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedScene) {
      setVisualConceptDraft("");
      setDraftCode("");
      setIsCodeDirty(false);
      return;
    }
    setVisualConceptDraft(selectedScene.visual_concept || "");
    setDraftCode(selectedScene.component_code || "");
    setIsCodeDirty(false);
    setRemixPrompt("");
  }, [selectedScene?.id, selectedScene?.updated_at, selectedScene?.component_code, selectedScene?.visual_concept]);

  // Live Sucrase compile check for the active draft TSX
  const draftCompileStatus = useMemo(() => {
    if (!draftCode.trim()) return null;
    return compileMotionSceneCode(draftCode);
  }, [draftCode]);

  // Hot-patch selectedScene's component_code in-memory when editing TSX live and it compiles cleanly
  const effectiveScenes = useMemo(() => {
    if (!isCodeDirty || !selectedScene || !draftCompileStatus?.Component) {
      return scenes;
    }
    return scenes.map((s) =>
      s.id === selectedScene.id ? { ...s, component_code: draftCode } : s
    );
  }, [scenes, isCodeDirty, selectedScene, draftCode, draftCompileStatus]);

  // Aspect ratio & dimensions
  const aspectRatio = project.aspect_ratio || "16:9";
  const { compWidth, compHeight, stageBoxClass } = useMemo(() => {
    if (aspectRatio === "9:16") {
      return {
        compWidth: 1080,
        compHeight: 1920,
        stageBoxClass: "aspect-[9/16] h-full max-h-[52vh] w-auto",
      };
    }
    if (aspectRatio === "1:1") {
      return {
        compWidth: 1080,
        compHeight: 1080,
        stageBoxClass: "aspect-square h-full max-h-[52vh] w-auto",
      };
    }
    return {
      compWidth: 1920,
      compHeight: 1080,
      stageBoxClass: "aspect-video w-full max-w-4xl max-h-[54vh]",
    };
  }, [aspectRatio]);

  const audioTrack = project.audio || project.audio_track;
  const audioUrl = audioTrack?.audio_url || null;

  const inputProps = useMemo(
    () => ({
      scenes: effectiveScenes,
      themeId: activeThemeId,
      aspectRatio,
      audioUrl,
      includeAudio: true,
    }),
    [effectiveScenes, activeThemeId, aspectRatio, audioUrl]
  );

  // Subscribe to @remotion/player frame & playback events
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrameUpdate: CallbackListener<"frameupdate"> = (e) => {
      setCurrentFrame(e.detail.frame);
    };
    const onPlay: CallbackListener<"play"> = () => setIsPlaying(true);
    const onPause: CallbackListener<"pause"> = () => setIsPlaying(false);
    const onEnded: CallbackListener<"ended"> = () => setIsPlaying(false);

    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);

    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [scenes.length]);

  const seekToFrame = useCallback(
    (targetFrame: number) => {
      const clamped = Math.max(0, Math.min(totalFrames - 1, Math.round(targetFrame)));
      playerRef.current?.seekTo(clamped);
      setCurrentFrame(clamped);
    },
    [totalFrames]
  );

  const handleSelectScene = useCallback(
    (sceneId: string, seek = true) => {
      setSelectedSceneId(sceneId);
      if (seek) {
        const range = sceneTimelineRanges.find((r) => r.scene.id === sceneId);
        if (range) {
          seekToFrame(range.startFrame);
        }
      }
    },
    [sceneTimelineRanges, seekToFrame]
  );

  const handleTogglePlay = () => {
    playerRef.current?.toggle();
  };

  const handleToggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unmute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleStepScene = (delta: -1 | 1) => {
    if (!sceneTimelineRanges.length) return;
    const baseIdx = selectedRange ? selectedRange.index : 0;
    const nextIdx = Math.max(0, Math.min(sceneTimelineRanges.length - 1, baseIdx + delta));
    const target = sceneTimelineRanges[nextIdx];
    if (target) {
      handleSelectScene(target.scene.id, true);
    }
  };

  // Mutations
  const updateThemeMutation = useMutation({
    mutationFn: (nextThemeId: string) =>
      api.updateProject(project.id, {
        world_setting: {
          ...((project.world_setting as Record<string, unknown>) || {}),
          motion_theme: nextThemeId,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });

  const batchGenerateMutation = useMutation({
    mutationFn: (onlyPending: boolean) =>
      api.generateMotionCodeBatch(project.id, {
        only_pending: onlyPending,
        theme_id: activeThemeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      showToast(
        "Sintesis komponen React/Remotion TSX dimulai di background! Adegan akan muncul otomatis.",
        "info"
      );
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal memulai sintesis kode TSX", "error");
    },
  });

  const remixSceneMutation = useMutation({
    mutationFn: async () => {
      if (!selectedScene) throw new Error("Pilih adegan terlebih dahulu");
      if (visualConceptDraft.trim() !== (selectedScene.visual_concept || "").trim()) {
        await api.updateMotionScene(project.id, selectedScene.id, {
          visual_concept: visualConceptDraft.trim(),
        });
      }
      return api.regenerateMotionScene(project.id, selectedScene.id, {
        remix_prompt: remixPrompt.trim() || undefined,
        theme_id: activeThemeId,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
      setDraftCode(updated.component_code || "");
      setIsCodeDirty(false);
      setRemixPrompt("");
      if (selectedRange) {
        seekToFrame(selectedRange.startFrame);
      }
      showToast("Koreografi React/Remotion TSX adegan ini berhasil disintesis!", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal mensintesis adegan motion", "error");
    },
  });

  const saveCodeMutation = useMutation({
    mutationFn: () => {
      if (!selectedScene) throw new Error("Pilih adegan terlebih dahulu");
      return api.updateMotionScene(project.id, selectedScene.id, {
        component_code: draftCode,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
      setIsCodeDirty(false);
      showToast("Kode komponen TSX berhasil disimpan.", "success");
    },
    onError: (err: Error) => {
      showToast(err.message || "Gagal menyimpan kode TSX", "error");
    },
  });

  const updateTransitionMutation = useMutation({
    mutationFn: (transitionType: MotionTransitionType) => {
      if (!selectedScene) throw new Error("Pilih adegan terlebih dahulu");
      return api.updateMotionScene(project.id, selectedScene.id, {
        transition_type: transitionType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      queryClient.invalidateQueries({ queryKey: ["motion-scenes", project.id] });
    },
  });

  const readyScenesCount = useMemo(
    () => scenes.filter((s) => s.status === "ready" && Boolean(s.component_code)).length,
    [scenes]
  );
  const pendingScenesCount = scenes.length - readyScenesCount;

  const isBatchGenerating =
    batchGenerateMutation.isPending ||
    (activeTask?.task_type === "motion_generate" &&
      (activeTask.status === "progress" || activeTask.status === "queued"));

  const activeThemeObj = getMotionTheme(activeThemeId);

  if (scenes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-accent text-accent-foreground">
          <Code2 className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Belum Ada Adegan untuk Motion Studio
        </h2>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Susun naskah dan blueprint koreografi terlebih dahulu pada Langkah 1 sebelum mensintesis
          kode animasi React/Remotion.
        </p>
        <Button
          variant="workspace-primary"
          size="workspace-sm"
          onClick={() => setActiveTab("motion_script")}
          className="mt-4 text-xs"
        >
          Ke Naskah & Blueprint Motion
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-8.25rem)] w-full flex-col overflow-hidden bg-background">
      {/* Studio Top Command Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-primary/25 bg-accent text-accent-foreground">
              <Code2 className="h-3.5 w-3.5" />
            </span>
            <div>
              <h1 className="text-xs font-semibold text-foreground">
                Generative React/Remotion Studio
              </h1>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {readyScenesCount}/{scenes.length} komponen TSX siap • {compWidth}×{compHeight} @
                30fps
              </p>
            </div>
          </div>

          {/* Live Theme World Hot-Swapper */}
          <div className="flex items-center gap-1.5">
            <Select
              value={activeThemeId}
              onValueChange={(nextId) => {
                setActiveThemeId(nextId);
                updateThemeMutation.mutate(nextId);
              }}
            >
              <SelectTrigger className="h-9 gap-2 text-xs rounded-xl font-medium">
                <div className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-black/15 shrink-0"
                    style={{ backgroundColor: activeThemeObj.accent }}
                  />
                  <span>{activeThemeObj.name}</span>
                </div>
              </SelectTrigger>
              <SelectContent appearance="workspace">
                {MOTION_THEME_LIST.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-black/15 shrink-0"
                        style={{ backgroundColor: t.accent }}
                      />
                      <span>{t.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isBatchGenerating ? (
            <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="font-mono tabular-nums">
                {activeTask?.message || "Mensintesis kode animasi TSX..."}
              </span>
            </div>
          ) : (
            <>
              {pendingScenesCount > 0 && (
                <Button
                  type="button"
                  variant="workspace-primary"
                  onClick={() => batchGenerateMutation.mutate(true)}
                  className="h-9 gap-1.5 px-3.5 text-xs rounded-xl font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate {pendingScenesCount} Animasi TSX</span>
                </Button>
              )}
              <Button
                type="button"
                variant={pendingScenesCount === 0 ? "workspace-primary" : "workspace-secondary"}
                onClick={() => batchGenerateMutation.mutate(false)}
                className="h-9 gap-1.5 px-3.5 text-xs rounded-xl font-medium"
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>
                  {pendingScenesCount === 0
                    ? "Sintesis Ulang Semua TSX"
                    : "Generate Semua Adegan"}
                </span>
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="workspace-secondary"
            onClick={() => setActiveTab("motion_render")}
            className="h-9 gap-1.5 px-3.5 text-xs rounded-xl font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Render MP4</span>
          </Button>
        </div>
      </div>

      {/* Main Split Workspace: Stage + Timeline on Left, Live Inspector on Right */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
        {/* Left/Center Stage + Timeline (7 or 8 cols) */}
        <div className="flex min-h-0 flex-col justify-between bg-muted/35 lg:col-span-7 xl:col-span-8">
          {/* Remotion Live Canvas Stage */}
          <div className="relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
            <div
              className={`relative overflow-hidden rounded-2xl border border-border shadow-lg ${stageBoxClass}`}
              style={{ backgroundColor: activeThemeObj.bg }}
            >
              <Player
                ref={playerRef}
                component={MotionProjectComposition}
                inputProps={inputProps}
                durationInFrames={totalFrames}
                fps={30}
                compositionWidth={compWidth}
                compositionHeight={compHeight}
                loop={isLooping}
                controls={false}
                clickToPlay
                doubleClickToFullscreen
                spaceKeyToPlayOrPause={false}
                acknowledgeRemotionLicense
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            </div>

            {/* Active Playhead Scene Pill */}
            {playheadSceneRange && (
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-border/80 bg-card/90 px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm">
                <span className="font-mono font-bold tabular-nums text-primary">
                  #{String(playheadSceneRange.index + 1).padStart(2, "0")}
                </span>
                <span className="max-w-[200px] truncate font-medium text-foreground">
                  {playheadSceneRange.scene.title || `Adegan ${playheadSceneRange.index + 1}`}
                </span>
              </div>
            )}
          </div>

          {/* Transport Bar & Scrubber */}
          <div className="shrink-0 border-t border-border bg-card px-4 py-2.5">
            <div className="mb-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={Math.max(1, totalFrames - 1)}
                value={Math.min(currentFrame, Math.max(1, totalFrames - 1))}
                onChange={(e) => seekToFrame(parseInt(e.target.value, 10))}
                aria-label="Timeline frame scrubber"
                className="h-1.5 flex-1 cursor-pointer accent-primary"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleStepScene(-1)}
                  title="Adegan sebelumnya"
                  aria-label="Adegan sebelumnya"
                  className="rounded-lg border border-border bg-muted/50 p-1.5 text-foreground transition hover:bg-muted"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  title={isPlaying ? "Jeda" : "Putar"}
                  aria-label={isPlaying ? "Jeda preview" : "Putar preview"}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:opacity-90"
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="ml-0.5 h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleStepScene(1)}
                  title="Adegan berikutnya"
                  aria-label="Adegan berikutnya"
                  className="rounded-lg border border-border bg-muted/50 p-1.5 text-foreground transition hover:bg-muted"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsLooping((v) => !v)}
                  title="Loop playback"
                  aria-label="Toggle loop playback"
                  className={`rounded-lg border p-1.5 transition ${
                    isLooping
                      ? "border-primary/40 bg-accent text-accent-foreground"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleToggleMute}
                  title={isMuted ? "Unmute audio" : "Mute audio"}
                  aria-label={isMuted ? "Aktifkan suara" : "Bisukan suara"}
                  className="rounded-lg border border-border bg-muted/40 p-1.5 text-foreground transition hover:bg-muted"
                >
                  {isMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => playerRef.current?.requestFullscreen()}
                  title="Layar penuh"
                  aria-label="Layar penuh"
                  className="rounded-lg border border-border bg-muted/40 p-1.5 text-foreground transition hover:bg-muted"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {formatTimecode(currentFrame, 30)}
                </span>{" "}
                / {formatTimecode(totalFrames, 30)} • Frame{" "}
                <span className="font-semibold text-foreground">{currentFrame}</span>/{totalFrames}
              </div>
            </div>
          </div>

          {/* Multi-Scene Choreographic Timeline Strip */}
          <div className="shrink-0 border-t border-border bg-card/80 px-4 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sceneTimelineRanges.map((item) => {
                const { scene, index, startFrame, endFrame, durationFrames } = item;
                const isSelected = scene.id === selectedScene?.id;
                const isPlayheadHere =
                  currentFrame >= startFrame && currentFrame < endFrame;
                const localProgress = isPlayheadHere
                  ? Math.min(100, Math.max(0, ((currentFrame - startFrame) / durationFrames) * 100))
                  : currentFrame >= endFrame
                    ? 100
                    : 0;

                const dotClass =
                  scene.status === "ready" && scene.component_code
                    ? "bg-emerald-500"
                    : scene.status === "generating"
                      ? "bg-primary animate-pulse"
                      : scene.status === "failed"
                        ? "bg-destructive"
                        : "bg-muted-foreground/50";

                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => handleSelectScene(scene.id, true)}
                    className={`group relative flex min-w-[168px] max-w-[230px] flex-1 flex-col justify-between overflow-hidden rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? "border-primary bg-accent/65 ring-1 ring-primary/30"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="mb-1.5 flex w-full items-center justify-between gap-1.5">
                      <span className="font-mono text-xs font-bold tabular-nums text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {scene.archetype.replace("_", " ")}
                      </span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                    </div>

                    <div className="line-clamp-1 text-xs font-semibold text-foreground">
                      {scene.title || `Adegan ${index + 1}`}
                    </div>

                    <div className="mt-1 flex w-full items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
                      <span>{Math.round((durationFrames / 30) * 10) / 10}s</span>
                      <span>{durationFrames}f</span>
                    </div>

                    {/* Local scene progress indicator */}
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all duration-75"
                        style={{ width: `${localProgress}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Generative Scene Inspector (5 or 4 cols) */}
        <div className="flex min-h-0 flex-col border-t border-border bg-card lg:col-span-5 lg:border-l lg:border-t-0 xl:col-span-4">
          {/* Inspector Sub-Navigation */}
          <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border bg-muted/40 p-1.5">
            <button
              type="button"
              onClick={() => setInspectorTab("director")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                inspectorTab === "director"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>AI Remix & Cue</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab("code")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                inspectorTab === "code"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Kode TSX</span>
            </button>
            <button
              type="button"
              onClick={() => setInspectorTab("audio")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition ${
                inspectorTab === "audio"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Overlay</span>
            </button>
          </div>

          {/* Inspector Body */}
          {selectedScene && selectedRange ? (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* Active Scene Summary Banner */}
              <div className="flex items-start justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold tabular-nums text-primary">
                      Adegan {String(selectedRange.index + 1).padStart(2, "0")}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {selectedScene.archetype}
                    </Badge>
                  </div>
                  <h2 className="mt-0.5 truncate text-sm font-semibold text-foreground">
                    {selectedScene.title || `Adegan ${selectedRange.index + 1}`}
                  </h2>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  f{selectedRange.startFrame}–f{selectedRange.endFrame}
                </span>
              </div>

              {inspectorTab === "director" && (
                <div className="space-y-4">
                  {/* Spoken Script & Clickable Word-Cue Frame Triggers */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">
                        Word-Cue Triggers (Klik kata untuk lompat ke frame)
                      </label>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {selectedScene.cues?.length || 0} cue
                      </span>
                    </div>
                    {selectedScene.cues && selectedScene.cues.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-muted/30 p-2.5">
                        {selectedScene.cues.map((cue, cIdx) => {
                          const absCueFrame = selectedRange.startFrame + cue.start_frame;
                          const absCueEnd = selectedRange.startFrame + cue.end_frame;
                          const isCueActive =
                            currentFrame >= absCueFrame && currentFrame <= absCueEnd + 2;
                          return (
                            <button
                              key={`${cue.word}-${cIdx}`}
                              type="button"
                              onClick={() => seekToFrame(absCueFrame)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition ${
                                isCueActive
                                  ? "border-primary bg-accent font-semibold text-accent-foreground"
                                  : "border-border bg-card text-foreground hover:border-primary/40"
                              }`}
                            >
                              <span>{cue.word}</span>
                              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                f{cue.start_frame}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                        {selectedScene.script_text}
                      </p>
                    )}
                  </div>

                  {/* Camera Transition Rig */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">
                      Pergerakan Kamera & Transisi Masuk (CameraRig)
                    </label>
                    <Select
                      value={selectedScene.transition_type || "camera_push"}
                      onValueChange={(val) =>
                        updateTransitionMutation.mutate(val as MotionTransitionType)
                      }
                    >
                      <SelectTrigger className="h-9 text-xs rounded-xl font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent appearance="workspace">
                        {TRANSITION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Visual Choreography Concept */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-foreground">
                      Konsep Koreografi Visual Adegan Ini
                    </label>
                    <Textarea
                      value={visualConceptDraft}
                      onChange={(e) => setVisualConceptDraft(e.target.value)}
                      rows={3}
                      className="text-xs leading-relaxed"
                      placeholder="Deskripsikan komposisi vektor SVG, node, kartu, dan aksi animasi..."
                    />
                  </div>

                  {/* AI Per-Scene Remix Box */}
                  <div className="space-y-2.5 rounded-xl border border-primary/25 bg-accent/40 p-3.5">
                    <label className="block text-xs font-semibold text-foreground">
                      Instruksi AI Remix (Opsional)
                    </label>
                    <Textarea
                      value={remixPrompt}
                      onChange={(e) => setRemixPrompt(e.target.value)}
                      rows={3}
                      placeholder="Mis. Buat simulasi jendela terminal kode di kiri dengan garis konektor SVG menyala ke 3 kartu metrik melayang di kanan..."
                      className="bg-card text-xs leading-relaxed"
                    />
                    <Button
                      type="button"
                      variant="workspace-primary"
                      onClick={() => remixSceneMutation.mutate()}
                      disabled={remixSceneMutation.isPending}
                      className="h-9 w-full gap-2 text-xs rounded-xl font-medium"
                    >
                      {remixSceneMutation.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Mensintesis Kode TSX Adegan Ini...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>
                            {selectedScene.component_code
                              ? "Remix Koreografi Adegan dengan AI"
                              : "Generate Komponen TSX Adegan Ini"}
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {inspectorTab === "code" && (
                <div className="flex flex-col space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {draftCompileStatus ? (
                      draftCompileStatus.Component ? (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs tabular-nums text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Compiled OK ({draftCompileStatus.compileTimeMs} ms)</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 font-mono text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          <span className="line-clamp-1">{draftCompileStatus.error}</span>
                        </div>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Belum ada kode TSX. Gunakan AI Remix untuk menghasilkan komponen.
                      </span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {isCodeDirty && (
                        <Button
                          type="button"
                          variant="workspace-secondary"
                          size="workspace-sm"
                          onClick={() => {
                            setDraftCode(selectedScene.component_code || "");
                            setIsCodeDirty(false);
                          }}
                          className="h-7 gap-1 px-2 text-xs"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reset</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="workspace-primary"
                        size="workspace-sm"
                        onClick={() => saveCodeMutation.mutate()}
                        disabled={
                          saveCodeMutation.isPending ||
                          !isCodeDirty ||
                          Boolean(draftCompileStatus?.error)
                        }
                        className="h-7 gap-1 px-2.5 text-xs"
                      >
                        {saveCodeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        <span>Simpan TSX</span>
                      </Button>
                    </div>
                  </div>

                  {draftCompileStatus?.error && (
                    <pre className="max-h-24 overflow-auto rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 font-mono text-xs text-destructive">
                      {draftCompileStatus.error}
                    </pre>
                  )}

                  <textarea
                    value={draftCode}
                    onChange={(e) => {
                      setDraftCode(e.target.value);
                      setIsCodeDirty(true);
                    }}
                    spellCheck={false}
                    rows={18}
                    placeholder="// Kode React + Remotion TSX adegan ini akan muncul di sini dan langsung hot-reload ke canvas..."
                    className="w-full flex-1 rounded-xl border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Setiap perubahan valid otomatis di-hot-reload ke Remotion Player di sebelah
                    kiri menggunakan compiler Sucrase sandbox.
                  </p>
                </div>
              )}

              {inspectorTab === "audio" && (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-border bg-muted/35 p-3.5">
                    <h3 className="text-xs font-semibold text-foreground">
                      Status Audio Narasi
                    </h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {audioTrack?.duration
                        ? `Audio narasi aktif (${Math.round(audioTrack.duration * 10) / 10} detik) dan terputar sinkron di dalam Remotion Player.`
                        : "Belum ada voiceover TTS. Anda tetap dapat mendesain dan me-render motion graphic tanpa voiceover, atau buat suara di tab Suara & Cue Sync."}
                    </p>
                    <Button
                      type="button"
                      variant="workspace-secondary"
                      size="workspace-sm"
                      onClick={() => setActiveTab("motion_voice")}
                      className="mt-1 text-xs"
                    >
                      Buka Pengaturan Suara & Cue Sync
                    </Button>
                  </div>

                  <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/35 p-3.5">
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold text-foreground">
                        Burn-in Subtitle Tambahan saat Render MP4
                      </h3>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Secara bawaan dinonaktifkan pada Motion Studio agar tipografi kinetik di
                        dalam kanvas tampil bersih tanpa tumpang tindih teks.
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(project.subtitle_style?.enabled)}
                      onCheckedChange={async (checked) => {
                        await api.updateSubtitleStyle(project.id, {
                          ...(project.subtitle_style || {}),
                          enabled: checked,
                        });
                        queryClient.invalidateQueries({ queryKey: ["project", project.id] });
                        showToast(
                          checked
                            ? "Overlay subtitle burn-in diaktifkan saat render MP4."
                            : "Overlay subtitle burn-in dinonaktifkan.",
                          "info"
                        );
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

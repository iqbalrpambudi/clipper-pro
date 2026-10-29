"use client";

import React, { useMemo } from "react";
import { AbsoluteFill, Audio, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Activity, Cpu, Sparkles, Zap } from "lucide-react";
import type { MotionScene } from "@/types";
import { compileMotionSceneCode, CompiledSceneProps } from "./compiler";
import {
  AmbientCanvas,
  AnimatedConnector,
  BadgePill,
  CameraRig,
  DrawSvgPath,
  KineticWords,
  SpringCard,
  safeInterpolate,
  useCueFrame,
} from "./primitives";
import { getMotionTheme, MotionTheme } from "./themes";

/**
 * Rich multi-act generative fallback choreography rendered when a scene's TSX code
 * hasn't been generated yet ("pending") or encounters a runtime error during editing.
 */
function DynamicFallbackScene({
  durationInFrames,
  orientation,
  theme,
  cues,
  scriptText,
  sceneIndex,
  transitionType,
  title,
  keyFacts,
}: CompiledSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isPortrait = orientation === "portrait";

  const facts = useMemo(() => {
    const raw = (keyFacts || []).filter(Boolean).slice(0, 3);
    if (raw.length >= 3) return raw;
    const words = String(scriptText || "")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    const out = [...raw];
    while (out.length < 3) {
      const chunk = words.slice(out.length * 2, out.length * 2 + 2).join(" ");
      out.push(chunk || `Beat 0${out.length + 1}`);
    }
    return out;
  }, [keyFacts, scriptText]);

  const beat1 = useCueFrame(cues, facts[0]?.split(" ")[0] || "", durationInFrames, 0.2);
  const beat2 = useCueFrame(cues, facts[1]?.split(" ")[0] || "", durationInFrames, 0.45);
  const beat3 = useCueFrame(cues, facts[2]?.split(" ")[0] || "", durationInFrames, 0.68);
  const beats = [beat1, beat2, beat3];

  const headline = title || facts[0] || `Adegan ${sceneIndex + 1}`;
  const floatOffset = Math.sin(frame * 0.075) * 6;
  const ringRotate = frame * 0.5;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: theme.fontBody,
        overflow: "hidden",
      }}
    >
      <AmbientCanvas theme={theme} variant="architectural" intensity={1} />
      <CameraRig durationInFrames={durationInFrames} transition={transitionType} drift={1}>
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: isPortrait ? "112px 68px 150px" : "76px 96px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              alignItems: isPortrait ? "center" : "flex-start",
            }}
          >
            <BadgePill
              text={`SCENE 0${sceneIndex + 1}`}
              icon={Sparkles}
              startFrame={2}
              color={theme.accent}
              theme={theme}
              pulse
            />
            <KineticWords
              text={headline}
              startFrame={5}
              stagger={3}
              highlightWords={[headline.split(" ")[0] || ""]}
              theme={theme}
              size={isPortrait ? 54 : 62}
              align={isPortrait ? "center" : "left"}
              maxWidth={isPortrait ? 920 : 1280}
            />
            <p
              style={{
                margin: 0,
                fontSize: isPortrait ? 24 : 26,
                lineHeight: 1.45,
                color: theme.textMuted,
                maxWidth: 960,
                textAlign: isPortrait ? "center" : "left",
                opacity: safeInterpolate(frame, [10, 24], [0, 1]),
              }}
            >
              {scriptText}
            </p>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              display: "flex",
              flexDirection: isPortrait ? "column" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isPortrait ? 24 : 34,
              marginTop: 28,
            }}
          >
            {!isPortrait && (
              <svg
                viewBox="0 0 1200 320"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                <AnimatedConnector
                  from={[240, 160]}
                  to={[580, 160]}
                  curve={0.18}
                  startFrame={beat1}
                  durationFrames={22}
                  color={theme.accent}
                  pulse
                />
                <AnimatedConnector
                  from={[620, 160]}
                  to={[960, 160]}
                  curve={-0.18}
                  startFrame={beat2}
                  durationFrames={22}
                  color={theme.accent2}
                  pulse
                />
                <g transform={`translate(600, 160) rotate(${ringRotate})`}>
                  <circle
                    r={122}
                    fill="none"
                    stroke={theme.accent}
                    strokeOpacity={0.22}
                    strokeWidth={1.5}
                    strokeDasharray="8 10"
                  />
                </g>
              </svg>
            )}

            {facts.map((fact, idx) => {
              const IconComp = idx === 0 ? Cpu : idx === 1 ? Zap : Activity;
              const col = idx === 0 ? theme.accent : idx === 1 ? theme.accent2 : theme.accent3;
              const trigger = Math.max(8 + idx * 10, (beats[idx] ?? 18) - 4);
              const pop = spring({
                frame: frame - trigger,
                fps,
                config: { damping: 13, stiffness: 125 },
              });

              return (
                <SpringCard
                  key={`${fact}-${idx}`}
                  startFrame={trigger}
                  theme={theme}
                  accent={col}
                  glow={idx === 1}
                  style={{
                    flex: 1,
                    width: isPortrait ? "100%" : "auto",
                    padding: isPortrait ? "26px 28px" : "32px 30px",
                    transform: `translateY(${floatOffset * (idx % 2 === 0 ? 1 : -1)}px) scale(${safeInterpolate(pop, [0, 1], [0.92, 1])})`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    zIndex: 2,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 14,
                        backgroundColor: `${col}1E`,
                        border: `1.5px solid ${col}60`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: col,
                      }}
                    >
                      <IconComp size={24} />
                    </div>
                    <span
                      style={{
                        fontFamily: theme.fontMono,
                        fontSize: 14,
                        fontWeight: 700,
                        color: col,
                      }}
                    >
                      0{idx + 1}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: theme.fontDisplay,
                      fontSize: isPortrait ? 28 : 30,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      color: theme.text,
                    }}
                  >
                    {fact}
                  </div>
                  <svg viewBox="0 0 240 22" style={{ width: "100%", height: 22 }}>
                    <DrawSvgPath
                      d="M 4 11 L 178 11 L 194 4 L 208 18 L 222 11 L 236 11"
                      startFrame={trigger + 5}
                      durationFrames={22}
                      stroke={col}
                      strokeWidth={2.4}
                      pulseDot
                    />
                  </svg>
                </SpringCard>
              );
            })}
          </div>
        </div>
      </CameraRig>
    </AbsoluteFill>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class SceneErrorBoundary extends React.Component<
  { fallback: React.ReactNode; resetKey: string; children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { fallback: React.ReactNode; resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function CompiledSceneHost({
  scene,
  sceneIndex,
  theme,
  orientation,
}: {
  scene: MotionScene;
  sceneIndex: number;
  theme: MotionTheme;
  orientation: "landscape" | "portrait" | "square";
}) {
  const { width, height, fps } = useVideoConfig();
  const compiled = useMemo(
    () => compileMotionSceneCode(scene.component_code),
    [scene.component_code]
  );

  const sceneProps: CompiledSceneProps = {
    width,
    height,
    fps,
    durationInFrames: Math.max(45, scene.duration_frames || 120),
    orientation,
    theme,
    cues: scene.cues || [],
    scriptText: scene.script_text || "",
    sceneIndex,
    transitionType: scene.transition_type || "camera_push",
    title: scene.title,
    keyFacts: scene.key_facts || [],
  };

  const fallbackEl = <DynamicFallbackScene {...sceneProps} />;
  const GeneratedComp = compiled.Component;

  if (!GeneratedComp) {
    return fallbackEl;
  }

  return (
    <SceneErrorBoundary
      resetKey={`${scene.id}-${scene.updated_at}-${(scene.component_code || "").length}`}
      fallback={fallbackEl}
    >
      <GeneratedComp {...sceneProps} />
    </SceneErrorBoundary>
  );
}

export interface MotionProjectCompositionProps {
  scenes: MotionScene[];
  themeId?: string;
  aspectRatio?: string;
  audioUrl?: string | null;
  includeAudio?: boolean;
}

export function MotionProjectComposition({
  scenes,
  themeId = "claude_editorial",
  aspectRatio = "16:9",
  audioUrl,
  includeAudio = true,
}: MotionProjectCompositionProps) {
  const theme = getMotionTheme(themeId);
  const orientation: "landscape" | "portrait" | "square" =
    aspectRatio === "9:16" ? "portrait" : aspectRatio === "1:1" ? "square" : "landscape";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: theme.fontBody,
        overflow: "hidden",
      }}
    >
      {includeAudio && audioUrl && <Audio src={audioUrl} />}
      <Series>
        {scenes.map((scene, idx) => {
          const dur = Math.max(45, scene.duration_frames || 120);
          return (
            <Series.Sequence key={scene.id || idx} durationInFrames={dur}>
              <CompiledSceneHost
                scene={scene}
                sceneIndex={idx}
                theme={theme}
                orientation={orientation}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
}


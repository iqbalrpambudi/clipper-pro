import { describe, expect, it } from "vitest";
import { compileMotionSceneCode } from "../compiler";
import { safeInterpolate, useCueFrame } from "../primitives";

describe("Generative Motion Runtime Compiler & Primitives", () => {
  it("repairs non-monotonic LLM input ranges in safeInterpolate without throwing", () => {
    expect(safeInterpolate(30, [30, 30], [0, 100])).toBeGreaterThanOrEqual(0);
    expect(safeInterpolate(40, [50, 20], [10, 90])).toBe(10);
    expect(safeInterpolate(15, [0, 30], ["0%", "100%"])).toBe("50%");
  });

  it("maps Whisper word cues to relative 30fps frames with fallback ratio", () => {
    const cues = [
      { word: "Arsitektur", start_frame: 6, end_frame: 18 },
      { word: "paralel", start_frame: 42, end_frame: 55 },
    ];
    expect(useCueFrame(cues, "paralel", 120, 0.25)).toBe(42);
    expect(useCueFrame(cues, "tidak_ada", 120, 0.5)).toBe(60);
  });

  it("transpiles bespoke React + Remotion TSX with unknown Lucide icons safely", () => {
    const sampleTsx = `
      import React from "react";
      import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
      import { Cpu, NonExistentHallucinatedIcon99 } from "lucide-react";
      import { AmbientCanvas, CameraRig, KineticWords, DrawSvgPath, useCueFrame } from "@motion/primitives";

      export default function Scene({ durationInFrames, theme, cues, transitionType }) {
        const frame = useCurrentFrame();
        const cueFrame = useCueFrame(cues, "token", durationInFrames, 0.3);
        const opacity = interpolate(frame, [15, 15], [0, 1]);
        return (
          <AbsoluteFill style={{ backgroundColor: theme.bg, opacity }}>
            <AmbientCanvas theme={theme} variant="circuit" />
            <CameraRig durationInFrames={durationInFrames} transition={transitionType}>
              <Cpu size={32} />
              <NonExistentHallucinatedIcon99 size={24} />
              <KineticWords text="Claude Motion Studio" startFrame={cueFrame} theme={theme} />
              <svg viewBox="0 0 200 40">
                <DrawSvgPath d="M 10 20 L 190 20" startFrame={5} durationFrames={20} stroke={theme.accent} />
              </svg>
            </CameraRig>
          </AbsoluteFill>
        );
      }
    `;

    const res = compileMotionSceneCode(sampleTsx);
    expect(res.error).toBeNull();
    expect(typeof res.Component).toBe("function");
  });

  it("compiles Remotion scenes utilizing MotionStage and StatCallout primitives", () => {
    const stageTsx = `
      import React from "react";
      import { AbsoluteFill } from "remotion";
      import { Zap } from "lucide-react";
      import { AmbientCanvas, CameraRig, KineticWords, MotionStage, StatCallout } from "@motion/primitives";

      export default function Scene({ durationInFrames, theme, cues, transitionType, orientation }) {
        return (
          <AbsoluteFill style={{ backgroundColor: theme.bg }}>
            <AmbientCanvas theme={theme} />
            <CameraRig durationInFrames={durationInFrames} transition={transitionType}>
              <MotionStage orientation={orientation} align="center">
                <KineticWords text="Token Acceleration" startFrame={4} theme={theme} align="center" />
                <StatCallout value={340} suffix="%" label="Throughput" icon={Zap} theme={theme} />
              </MotionStage>
            </CameraRig>
          </AbsoluteFill>
        );
      }
    `;

    const res = compileMotionSceneCode(stageTsx);
    expect(res.error).toBeNull();
    expect(typeof res.Component).toBe("function");
  });

  it("compiles 2.5D Isometric Diorama & Editorial HUD scenes (AIShift / Claude style)", () => {
    const dioramaTsx = `
      import React from "react";
      import { AbsoluteFill } from "remotion";
      import {
        CloudSkyBackdrop,
        CameraRig,
        HighlightBlockTitle,
        NotificationStack,
        TelemetryScoreboard,
        ChecklistCard,
        IsometricIsland,
        ImpactStamp,
        MotionStage,
      } from "@motion/primitives";

      export default function Scene({ width, height, durationInFrames, theme, transitionType, orientation }) {
        return (
          <AbsoluteFill style={{ backgroundColor: theme.bg }}>
            <CloudSkyBackdrop theme={theme} mood="day" />
            <CameraRig durationInFrames={durationInFrames} transition={transitionType}>
              <svg viewBox={\`0 0 \${width} \${height}\`} style={{ position: "absolute", inset: 0 }}>
                <IsometricIsland x={540} y={1180} scale={1.4} label="Claude" emblem="claude" agentsCount={8} />
              </svg>
              <MotionStage orientation={orientation} align="center">
                <HighlightBlockTitle
                  lines={["APA JADINYA KALAU", "4 AI DIKASIH KOTA", "TANPA MANUSIA?"]}
                  highlightIndex={1}
                  theme={theme}
                />
                <NotificationStack
                  items={[{ badge: "!", title: "Hancur dalam 4 hari", subtitle: "kota pertama runtuh" }]}
                  theme={theme}
                />
                <TelemetryScoreboard
                  title="KOTA CLAUDE"
                  metrics={[{ label: "HARI KE-", toValue: 15 }, { label: "KEJAHATAN", value: 0 }]}
                  theme={theme}
                />
                <ChecklistCard
                  title="ATURAN KOTA"
                  rows={[{ label: "Dilarang mencuri", type: "cross" }]}
                  actionButtons={["CURI", "PUKUL"]}
                  theme={theme}
                />
              </MotionStage>
              <ImpactStamp text="TAMAT" startFrame={30} theme={theme} />
            </CameraRig>
          </AbsoluteFill>
        );
      }
    `;

    const res = compileMotionSceneCode(dioramaTsx);
    expect(res.error).toBeNull();
    expect(typeof res.Component).toBe("function");
  });

  it("compiles Zero-Overlap SceneGridLayout & semantic stage primitives (Package 1 & 2)", () => {
    const zeroOverlapTsx = `
      import React from "react";
      import { AbsoluteFill } from "remotion";
      import { Globe, Lock, Eye, Sparkles } from "lucide-react";
      import {
        SceneGridLayout,
        OrbitHubStage,
        ComparisonDuelStage,
        ProcessStepperStage,
        BrowserMockupCard,
        FocusSpotlight,
        SPRING_PRESETS,
        BadgePill,
        KineticWords,
      } from "@motion/primitives";

      export default function Scene({ theme, orientation }) {
        const ref = useRef(null);
        const memoized = useMemo(() => "test", []);
        return (
          <AbsoluteFill style={{ backgroundColor: theme.bg }}>
            <SceneGridLayout
              orientation={orientation}
              subtitleSafeZone
              eyebrow={<BadgePill text="TEST" icon={Sparkles} theme={theme} />}
              headline={<KineticWords text="Evolusi Komputasi" highlightColor="#FF0000" theme={theme} />}
              stage={
                <OrbitHubStage
                  centerHub={{ icon: Globe, label: "HUB" }}
                  nodes={[{ icon: Lock, label: "NODE A" }]}
                  theme={theme}
                  orientation={orientation}
                />
              }
            />
          </AbsoluteFill>
        );
      }
    `;

    const res = compileMotionSceneCode(zeroOverlapTsx);
    expect(res.error).toBeNull();
    expect(typeof res.Component).toBe("function");
  });
});



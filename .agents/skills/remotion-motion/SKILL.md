---
name: remotion-motion
description: "Master Generative Motion Graphics skill for Remotion & React (True Claude Motion) in Cliper Pro. Use when generating, refining, animating, debugging, or reviewing motion graphic scenes, layout geometry, 9:16 / 16:9 canvas centering, video typography scales, Remotion springs, and SVG vector mechanics."
metadata:
  version: 1.0.0
---

# Skill Remotion — True Claude Motion Engineering

This skill defines the architectural, mathematical, and aesthetic rules for synthesizing award-winning, mathematically centered, and typography-precise motion graphic videos using React + Remotion in Cliper Pro.

---

## 1. Resolution & Canvas Math

Motion graphic scenes in Cliper Pro render at **30 FPS** across 3 standardized canvas profiles:
1. **Vertical Portrait (9:16):** `1080 x 1920` (TikTok, Reels, YouTube Shorts).
2. **Widescreen Landscape (16:9):** `1920 x 1080` (Desktop, YouTube, Keynotes).
3. **Square (1:1):** `1080 x 1080` (Instagram feeds, LinkedIn carousels).

> [!IMPORTANT]
> A 1080p video canvas is **NOT** a 14px desktop browser website! 
> Standard web typography (`14px`–`18px`) becomes microscopic and illegible when rendered into an MP4 and viewed on a smartphone screen.

---

## 2. Broadcast Typography Scale Matrix

Never use font sizes below `22px` for primary elements. Always follow this token scale:

| Component Role | Portrait (9:16) | Landscape (16:9) | Weight & Specs |
|---|---|---|---|
| **Hero Headline (`KineticWords`)** | `56px – 68px` | `64px – 80px` | `fontWeight: 800`, `lineHeight: 1.12` |
| **Card / Stage Header** | `30px – 38px` | `32px – 42px` | `fontWeight: 700` |
| **Insight Subtext / Narration Body** | `22px – 28px` | `24px – 30px` | `fontWeight: 500`, min `22px` |
| **Category Eyebrow (`BadgePill`)** | `18px – 22px` | `18px – 22px` | `fontWeight: 700`, uppercase, mono |
| **Metric / Counter (`AnimatedCounter`)** | `76px – 110px` | `84px – 120px` | `fontWeight: 900`, tabular-nums |
| **Node Labels & SVG Diagram Text** | `20px – 26px` | `22px – 28px` | `fontWeight: 700`, anchored center |

---

## 3. Centering & Layout Geometry Laws

### 1. Three-Tier Stage Anatomy
Every scene must be composed with a clear 3-tier vertical hierarchy:
- **Top Tier (15–20% height):** `<BadgePill>` + `<KineticWords>` (centered in Portrait!).
- **Center Stage (60–70% height):** The active visual mechanism (animated SVG vector stage, `<SpringCard>` node flow, rolling counter, or interactive simulation).
- **Bottom Tier (15–20% height):** Punchy takeaway callout badge or secondary spoken cue pill.

### 2. Centering in Portrait (9:16)
- Wrap scene content in `<MotionStage orientation={orientation} align="center">` or use:
  ```tsx
  <div style={{
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: "center",
    padding: isPortrait ? "110px 72px 160px" : "76px 100px",
    boxSizing: "border-box",
  }}>
  ```
- Ensure the header block is explicitly centered:
  ```tsx
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", width: "100%", gap: 16 }}>
    <BadgePill text="LABEL" icon={Zap} startFrame={2} color={theme.accent} theme={theme} pulse />
    <KineticWords text="Judul Animasi" startFrame={4} stagger={3} highlightWords={["Animasi"]} theme={theme} size={isPortrait ? 58 : 68} align="center" maxWidth={920} />
  </div>
  ```

### 3. Coordinate Space Isolation (Preventing Element Misalignment)
- **CRITICAL ANTI-PATTERN:** Never calculate HTML `position: "absolute"` with guessed pixel math on top of an SVG `<svg viewBox="0 0 W H">`!
- **Pure SVG:** Put all `<circle>`, `<rect>`, `<path>`, and `<text>` elements inside the `<svg viewBox="...">` using `textAnchor="middle"` and `dominantBaseline="middle"`.
- **Pure Flexbox Cards:** Build card pipelines using `<SpringCard>` and standard CSS Flexbox/Grid. Flexbox guarantees zero coordinate drift.

---

## 4. Remotion Motion Physics & Springs

### Spring Config Presets
- **Snappy Entrance (Badges, Cards, Words):**
  `spring({ frame: frame - trigger, fps, config: { damping: 14, stiffness: 135, mass: 0.65 } })`
- **Smooth Float / Camera Drift:**
  `spring({ frame: frame - trigger, fps, config: { damping: 20, stiffness: 85, mass: 1.0 } })`
- **Clamping Rule:**
  Always clamp `interpolate()` outputs: `{ extrapolateLeft: "clamp", extrapolateRight: "clamp" }`.

### Continuous Ambient Life
Every scene must have micro-motion driven by `frame = useCurrentFrame()`:
- `const floatY = Math.sin(frame * 0.08) * 6;`
- `const ringRot = frame * 0.45;`
- Continuous SVG dash offsets or pulse dots (`pulseDot` on `<DrawSvgPath>`).

---

## 5. Pre-Installed Imports (`@motion/primitives`)

Every TSX module has access to:
- `import React, { useMemo } from "react";`
- `import { useCurrentFrame, useVideoConfig, AbsoluteFill, Sequence, spring, interpolate, Easing } from "remotion";`
- `import { ... } from "lucide-react";`
- `import { AmbientCanvas, CameraRig, KineticWords, DrawSvgPath, AnimatedConnector, SpringCard, WindowFrame, AnimatedCounter, RadialRing, BadgePill, MotionStage, StatCallout, SceneGridLayout, OrbitHubStage, ComparisonDuelStage, ProcessStepperStage, BrowserMockupCard, FocusSpotlight, SPRING_PRESETS, CloudSkyBackdrop, HighlightBlockTitle, NotificationStack, TelemetryScoreboard, ChecklistCard, IsometricIsland, ImpactStamp, useCueFrame } from "@motion/primitives";`

---

## 7. Zero-Overlap Deterministic Slot Grids & Semantic Primitives (Package 1 & 2)

### 1. Deterministic Layout Grid (`<SceneGridLayout>`)
Never rely on random absolute pixel offsets for top-level layout. Use `<SceneGridLayout>`:
```tsx
<SceneGridLayout
  orientation={orientation}
  subtitleSafeZone={true} // Automatically reserves 240px bottom margin on 9:16 portrait
  eyebrow={<BadgePill text="LABEL" icon={Sparkles} startFrame={2} color={theme.accent} theme={theme} pulse />}
  headline={<KineticWords text="Judul Adegan Utama" startFrame={4} highlightWords={["Utama"]} theme={theme} align="center" />}
  stage={
    /* Hero Visual: Contained inside minmax(0, 1fr) with overflow: hidden */
  }
  footer={
    /* Optional takeaway HUD strip */
  }
/>
```

### 2. High-Craft Semantic Primitives (Eliminates 90% of Layout Overlaps)
- **`<OrbitHubStage>`:** Central concept with orbiting nodes. Automatically calculates clamped safe radius (`max 310px` in portrait) so orbiting chips never break out or collide with the header.
- **`<ComparisonDuelStage>`:** Adaptive comparison. In **9:16 portrait**, automatically renders a **Top-vs-Bottom Stack** with centered `"VS"` badge; in **16:9 landscape**, renders **Left-vs-Right**. Eliminates narrow, squished 50%|50% columns on mobile.
- **`<ProcessStepperStage>`:** Sequential multi-step flow with conduit SVG pipes and traveling energy pulses.
- **`<BrowserMockupCard>`:** Authentic macOS/editorial browser frame for web/tech archetypes.
- **`<FocusSpotlight>`:** Smoothly dims inactive elements (`opacity: 0.4, scale: 0.97`) to guide viewer attention to the active point in time.

### 3. Automated Collision & Layout QA Loop (Self-Healing)
- The headless rendering runtime exposes `window.__inspectMotionLayout(targetFrame)` via Chrome DevTools Protocol (CDP).
- It measures `getBoundingClientRect()` across sibling elements to detect text overlaps, canvas clipping, and subtitle safe zone collisions.
- Any detected spatial collision automatically triggers a 1-shot targeted self-repair prompt with exact pixel coordinates before the scene is finalized.

---

## 6. 2.5D Isometric Diorama & Editorial HUD Style (AIShift / Claude Simulation)

Inspired by high-retention Claude interactive simulation explainers (e.g. `AIShift.Id` 4-AI City Simulation):

1. **Spatial Z-Axis & Vertical Zoning (9:16 Portrait `1080x1920`):**
   - **Atmosphere Layer (`<CloudSkyBackdrop mood="day" | "alert" />`):** Warm parchment sky (`#EFEAE2 -> #D6CEC0`) with drifting 2.5D puffy clouds and optional pulsing red alert vignette.
   - **Lower 65% World Stage (`y: 520px – 1640px`):** Occupied by 2.5D floating `<IsometricIsland />` dioramas (either a **Wide 4-Island Grid** at `scale={0.68..0.76}` or a **Zoomed Single Island** at `scale={1.45..1.55}` centered at `x=540, y=1180`) complete with 3D houses, pine trees, central billboard emblem, and living capsule agents (`agentState="normal" | "chaos" | "fallen" | "stealing"`, `burning={true | false}`).
   - **Upper 35% HUD Zone (`y: 140px – 520px`):** Clean floating UI overlays that never collide with the island below:
     - `<HighlightBlockTitle />`: Stacked white/crimson/dark pill blocks (`APA JADINYA KALAU` / `4 AI DIKASIH KOTA` / `TANPA MANUSIA?`).
     - `<NotificationStack />`: 2–3 progressive white cards with bold square badges (`[!]`, `[0]`, `[?]`).
     - `<TelemetryScoreboard />`: Dark charcoal card (`#231F20`) with 3 metric columns (`HARI KE-`, `KEJAHATAN`, `STATUS`) and rolling counters.
     - `<ChecklistCard />`: Inspector/rulebook card with checkmarks (`✓`), red crosses (`✕`), draining energy bar, and 3D tactile red push buttons (`CURI`, `PUKUL`).
   - **Depth-of-Field Climax Stamp (`<ImpactStamp />`):** Blur the world layer (`filter: blur(6px)`) when slamming a tilted red `[TAMAT]` rubber stamp or giant center stat (`10/10 HIDUP SAMPAI AKHIR`) onto the screen.



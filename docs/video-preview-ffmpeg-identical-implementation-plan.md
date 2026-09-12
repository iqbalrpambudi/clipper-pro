# Implementation Plan — Frame-Accurate Video Preview Matching FFmpeg

## 1. Goal

Build a video-editor preview architecture where the browser preview and the Python/FFmpeg final render consume the **same timeline representation, frame calculations, clip boundaries, transitions, transforms, subtitle timing, and composition rules**.

### Primary objective

Given the same project state:

```text
Project JSON
   ↓
Timeline / Render Manifest
   ├── Preview Renderer
   │     └── WebCodecs + Canvas/WebGL
   │
   └── Final Renderer
         └── Python + FFmpeg
```

The preview must select and compose the same logical frame as FFmpeg.

### Important definition of "100% identical"

There are two different goals:

1. **Frame/timeline identical** — required and achievable:
   - same output FPS
   - same frame number
   - same source frame
   - same clip boundary
   - same transition state
   - same transform
   - same subtitle visibility/timing
   - same audio/video timeline

2. **Pixel identical** — harder:
   - browser GPU/video decoding and FFmpeg can use different decoding/color-conversion/scaling paths.
   - Pixel-perfect equality requires a shared decoding/compositing pipeline or rendering through the same engine.

The implementation should therefore first guarantee **frame-accurate semantic equivalence**, then add pixel-consistency tests where practical.

---

# 2. Recommended Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         Editor UI                            │
│                     Next.js + React                         │
├─────────────────────────────────────────────────────────────┤
│ Timeline UI │ Inspector │ Preview │ Source Panel │ Audio    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Video Core Package                      │
│                                                             │
│ Project Model                                               │
│ Timeline Resolver                                           │
│ Frame Math                                                  │
│ Clip Resolver                                               │
│ Transition Resolver                                         │
│ Transform Resolver                                          │
│ Subtitle Resolver                                           │
│ Composition Resolver                                        │
│ Validation / Diagnostics                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                 Render Manifest / IR
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────────┐   ┌─────────────────────────────┐
│ Browser Preview         │   │ Final Render                │
│                         │   │                             │
│ WebCodecs               │   │ Python                      │
│ Canvas / WebGL          │   │ FFmpeg                      │
│ Audio playback          │   │                             │
└─────────────────────────┘   └─────────────────────────────┘
```

---

# 3. Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- WebCodecs API
- Canvas 2D initially
- WebGL/WebGL2 when compositor performance requires it
- Web Audio API for preview audio
- OffscreenCanvas where supported
- Web Worker for decoding/compositing work
- `requestAnimationFrame` for UI synchronization
- IndexedDB or Cache Storage for preview/proxy media

## Backend

- Python
- FFmpeg / ffprobe
- Existing rendering service
- Existing API/storage infrastructure

## Shared model

Prefer a TypeScript package for the canonical timeline model:

```text
packages/
└── video-core/
```

The Python renderer consumes the serialized JSON schema rather than independently recreating the editor's business rules.

---

# 4. Repository Structure

Recommended monorepo structure:

```text
project/
├── apps/
│   ├── web/
│   │   └── Next.js application
│   │
│   └── renderer/
│       └── Python render service
│
├── packages/
│   ├── video-core/
│   │   ├── src/
│   │   │   ├── project/
│   │   │   ├── timeline/
│   │   │   ├── frame/
│   │   │   ├── clips/
│   │   │   ├── transitions/
│   │   │   ├── transforms/
│   │   │   ├── subtitles/
│   │   │   ├── composition/
│   │   │   ├── manifest/
│   │   │   ├── validation/
│   │   │   └── index.ts
│   │   └── tests/
│   │
│   ├── preview-engine/
│   │   ├── src/
│   │   │   ├── decoder/
│   │   │   ├── compositor/
│   │   │   ├── renderer/
│   │   │   ├── audio/
│   │   │   ├── cache/
│   │   │   └── worker/
│   │   └── tests/
│   │
│   └── render-schema/
│       └── schema/
│
└── services/
    └── ffmpeg-renderer/
        ├── manifest/
        ├── filters/
        ├── renderer/
        └── tests/
```

If a monorepo is not practical, keep the same conceptual boundaries as separate modules.

---

# 5. Phase 0 — Audit Existing Renderer

Before changing the frontend, document the existing FFmpeg pipeline.

## Tasks

### 5.1 Record current FFmpeg command generation

Identify:

- input handling
- `-ss`
- `-t`
- `-to`
- `-itsoffset`
- `-filter_complex`
- `trim`
- `setpts`
- `concat`
- `xfade`
- `overlay`
- `scale`
- `crop`
- `fps`
- `settb`
- `aresample`
- audio filters
- output codec
- output FPS
- output pixel format

### 5.2 Record media properties

Use `ffprobe` for every source:

```bash
ffprobe -v error \
  -show_streams \
  -show_format \
  -of json \
  input.mp4
```

Store:

- width
- height
- frame rate
- duration
- time base
- codec
- pixel format
- sample rate
- audio channels
- start time
- number of frames when available
- variable/constant frame-rate characteristics

### 5.3 Identify current flash-cut behavior

Create test projects containing:

```text
Clip A → Clip B
Clip A → transition → Clip B
Clip A trimmed at arbitrary timestamps
```

Record:

- expected boundary
- actual frontend boundary
- actual FFmpeg boundary
- source frame shown at boundary

---

# 6. Phase 1 — Define Canonical Project Model

The most important architectural decision is that the timeline is represented independently of the UI.

## 6.1 Project

```ts
type Project = {
  version: number

  composition: Composition

  tracks: Track[]

  assets: MediaAsset[]

  subtitles?: SubtitleTrack[]

  metadata?: Record<string, unknown>
}
```

## 6.2 Composition

```ts
type Composition = {
  width: number
  height: number
  fps: number
  durationFrames: number

  pixelAspectRatio?: number
}
```

Example:

```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationFrames": 1800
}
```

---

# 7. Phase 2 — Make Frames the Canonical Unit

Do not use floating-point seconds as the primary timeline unit.

## 7.1 Frame type

```ts
type Frame = number
```

## 7.2 Conversion

```ts
function frameToSeconds(frame: number, fps: number): number {
  return frame / fps
}

function secondsToFrame(time: number, fps: number): number {
  return Math.round(time * fps)
}
```

The exact rounding policy must be centralized.

Do not allow individual components to implement their own rounding.

## 7.3 Recommended policy

Use integer frames internally:

```text
timeline frame
       ↓
source frame
       ↓
timestamp
```

Seconds are primarily a display/API compatibility format.

---

# 8. Phase 3 — Clip Model

```ts
type VideoClip = {
  id: string
  assetId: string

  sourceInFrame: Frame
  sourceOutFrame: Frame

  timelineStartFrame: Frame
  timelineEndFrame: Frame

  transform?: Transform

  opacity?: number

  speed?: number
}
```

Example:

```json
{
  "id": "clip-001",
  "assetId": "asset-a",
  "sourceInFrame": 150,
  "sourceOutFrame": 450,
  "timelineStartFrame": 0,
  "timelineEndFrame": 300
}
```

This means:

```text
Source:
150 ─────────────── 450

Timeline:
0   ─────────────── 300
```

---

# 9. Phase 4 — Source Frame Mapping

Create one canonical function:

```ts
function resolveSourceFrame(
  clip: VideoClip,
  timelineFrame: Frame
): Frame {
  const relativeFrame =
    timelineFrame - clip.timelineStartFrame

  return clip.sourceInFrame + relativeFrame
}
```

For speed:

```ts
function resolveSourceFrame(
  clip: VideoClip,
  timelineFrame: Frame
): number {
  const relative =
    timelineFrame - clip.timelineStartFrame

  return Math.floor(
    clip.sourceInFrame + relative * (clip.speed ?? 1)
  )
}
```

The exact speed/rounding behavior must be documented and mirrored by FFmpeg.

---

# 10. Phase 5 — Timeline Resolver

Implement:

```ts
resolveTimelineFrame(project, frame)
```

Output:

```ts
type ResolvedFrame = {
  frame: Frame

  layers: ResolvedLayer[]

  audioSegments: ResolvedAudioSegment[]
}
```

Each layer:

```ts
type ResolvedLayer = {
  clipId: string
  assetId: string

  sourceFrame: Frame

  opacity: number
  transform: Transform

  transition?: ResolvedTransition
}
```

Example:

```json
{
  "frame": 302,
  "layers": [
    {
      "clipId": "clip-b",
      "assetId": "video-b",
      "sourceFrame": 154,
      "opacity": 1,
      "transform": {
        "x": 0,
        "y": 0,
        "scaleX": 1,
        "scaleY": 1,
        "rotation": 0
      }
    }
  ]
}
```

This resolved frame is the central object used for diagnostics and rendering.

---

# 11. Phase 6 — Transition System

Transitions must be frame-based.

```ts
type Transition = {
  type: "cut" | "crossfade" | "fade" | "wipe"
  durationFrames: number
}
```

Example:

```json
{
  "type": "crossfade",
  "durationFrames": 15
}
```

Resolver:

```ts
resolveTransition(frame, clipA, clipB)
```

Returns:

```ts
type ResolvedTransition = {
  progress: number
  clipAOpacity: number
  clipBOpacity: number
}
```

For 15-frame crossfade:

```text
frame 0  → A 100%, B 0%
frame 7  → A ~50%, B ~50%
frame 14 → A 0%, B 100%
```

The formula must be shared/documented.

---

# 12. Phase 7 — Explicit Cut Semantics

A normal cut must never temporarily expose a frame from the previous/next clip.

For every frame:

```ts
resolveActiveClip(frame)
```

must return exactly the clip(s) that own that frame.

For a hard cut:

```text
A: [0, 300)
B: [300, 600)
```

At:

```text
frame 299 → A
frame 300 → B
```

Never:

```text
frame 300 → A
frame 301 → B
```

because that introduces an extra frame.

Use half-open intervals:

```text
[startFrame, endFrame)
```

This should become a project-wide rule.

---

# 13. Phase 8 — Preview Engine

## 13.1 Do not use `<video>.currentTime` as the compositor clock

Avoid:

```ts
video.currentTime = time
```

as the primary frame-selection mechanism.

Use:

```text
timeline frame
      ↓
source frame
      ↓
decoder
      ↓
VideoFrame
      ↓
compositor
```

## 13.2 WebCodecs pipeline

```text
MP4
 ↓
Demuxer
 ↓
EncodedVideoChunk
 ↓
VideoDecoder
 ↓
VideoFrame
 ↓
Canvas/WebGL
```

Important: WebCodecs does not provide MP4 demuxing by itself. Add a suitable browser-compatible demuxer layer.

Possible implementation choices:

- MP4 demuxer implemented in WASM
- an existing WebCodecs-compatible MP4 demuxing library
- a project-specific WASM demuxer

Choose based on bundle size, codec support, maintenance, and licensing.

---

# 14. Phase 9 — Decoder Cache

Random seeking is expensive.

Implement a frame cache:

```ts
type FrameCache = Map<
  string,
  VideoFrame
>
```

Key:

```text
assetId:sourceFrame
```

Example:

```text
asset-a:150
asset-a:151
asset-a:152
```

## Playback strategy

When playing forward:

```text
current frame
     ↓
decode current
     ↓
decode +5
     ↓
decode +10
```

Prefetch a small window.

When the user jumps far away:

```text
flush
seek to nearest keyframe
decode forward
```

---

# 15. Phase 10 — Keyframe-Aware Seeking

H.264/H.265 video may require decoding from an earlier keyframe.

Maintain:

```ts
type SeekPoint = {
  presentationFrame: number
  timestamp: number
  keyframe: boolean
}
```

For requested source frame:

```text
requested frame
      ↓
find previous keyframe
      ↓
decode sequentially
      ↓
requested VideoFrame
```

This is essential for responsive timeline scrubbing.

---

# 16. Phase 11 — Compositor

Start with Canvas 2D for correctness.

```text
Canvas
 ├── background
 ├── video layer
 ├── image layer
 ├── subtitle layer
 ├── overlay
 └── effects
```

Render:

```ts
renderFrame(resolvedFrame)
```

Example:

```ts
for (const layer of resolvedFrame.layers) {
  const frame = await decoder.getFrame(
    layer.assetId,
    layer.sourceFrame
  )

  drawVideoLayer(frame, layer.transform)
}
```

Once correctness is established, migrate expensive operations to WebGL/WebGL2.

---

# 17. Phase 12 — Transform Model

Use the same transform representation everywhere.

```ts
type Transform = {
  x: number
  y: number

  width?: number
  height?: number

  scaleX: number
  scaleY: number

  rotation: number

  anchorX?: number
  anchorY?: number
}
```

Do not let CSS transforms become the source of truth.

CSS is only a preview implementation detail.

---

# 18. Phase 13 — Color and Scaling Policy

Define a project-wide policy:

```text
Source
 ↓
decode
 ↓
normalized color space
 ↓
composition resolution
 ↓
transform
 ↓
composite
 ↓
output
```

Document:

- color space
- pixel format
- scaling filter
- alpha handling
- aspect ratio
- crop behavior
- letterboxing behavior

For initial implementation, target SDR/BT.709-style workflows and avoid HDR complexity until the core pipeline is stable.

---

# 19. Phase 14 — Audio Preview

Use Web Audio API for editor preview.

Architecture:

```text
Audio Assets
     ↓
Audio decoder
     ↓
AudioBuffer / streaming source
     ↓
AudioContext
     ↓
Timeline scheduler
```

Timeline remains frame-based:

```text
frame
 ↓
timeline time
 ↓
audio position
```

The audio clock should drive playback timing when synchronized playback is required.

---

# 20. Phase 15 — Master Playback Clock

Do not increment time using:

```ts
setInterval()
```

Instead:

```text
AudioContext / high-resolution clock
             ↓
       timeline time
             ↓
       timeline frame
             ↓
       preview frame
```

Example:

```ts
const elapsed =
  performance.now() - playbackStartTime

const frame = Math.floor(
  elapsed * composition.fps / 1000
)
```

For audio-mastered playback, use the audio clock where appropriate.

---

# 21. Phase 16 — Render Manifest

Create an intermediate representation specifically for rendering.

```ts
type RenderManifest = {
  version: number

  composition: {
    width: number
    height: number
    fps: number
    durationFrames: number
  }

  assets: RenderAsset[]

  tracks: RenderTrack[]

  settings: RenderSettings
}
```

The manifest should contain all information required to render the project without depending on editor UI state.

---

# 22. Phase 17 — Manifest Example

```json
{
  "version": 1,
  "composition": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "durationFrames": 900
  },
  "assets": [
    {
      "id": "video-a",
      "uri": "storage://video-a.mp4"
    },
    {
      "id": "video-b",
      "uri": "storage://video-b.mp4"
    }
  ],
  "tracks": [
    {
      "type": "video",
      "clips": [
        {
          "id": "clip-a",
          "assetId": "video-a",
          "sourceInFrame": 0,
          "sourceOutFrame": 300,
          "timelineStartFrame": 0,
          "timelineEndFrame": 300
        },
        {
          "id": "clip-b",
          "assetId": "video-b",
          "sourceInFrame": 30,
          "sourceOutFrame": 330,
          "timelineStartFrame": 300,
          "timelineEndFrame": 600
        }
      ]
    }
  ]
}
```

---

# 23. Phase 18 — Python Renderer

Python should consume the manifest.

Architecture:

```text
manifest.json
     ↓
Python Manifest Parser
     ↓
Timeline Validation
     ↓
FFmpeg Graph Builder
     ↓
FFmpeg
     ↓
Output MP4
```

Python should not independently decide:

- where clips start
- where clips end
- transition timing
- subtitle timing
- transform state

Those decisions belong to the manifest/core model.

---

# 24. Phase 19 — FFmpeg Frame Synchronization

Standardize FFmpeg inputs around the composition FPS.

Depending on the current renderer, use explicit timestamp normalization such as:

```text
setpts
fps
trim
concat
xfade
aresample
```

The exact filter graph depends on the current renderer.

Do not blindly add `fps` to every input. Validate the effect on variable-frame-rate sources first.

---

# 25. Phase 20 — VFR Handling

Variable frame rate is a major source of preview/render differences.

For every asset detect:

```text
CFR
or
VFR
```

If VFR:

```text
source timestamps
      ↓
composition frame mapping
      ↓
deterministic source frame selection
```

Do not assume:

```text
frame number = timestamp × source FPS
```

for VFR video.

Instead use presentation timestamps/keyframe/index information from the demuxer.

The project should still use a fixed composition FPS.

---

# 26. Phase 21 — Proxy Media

For large videos, generate preview proxies.

Example:

```text
Original
3840×2160
60 FPS
100 Mbps

Preview proxy
960×540
30 FPS
2–5 Mbps
```

The proxy must preserve:

- duration
- timeline relationship
- frame mapping metadata

Preview:

```text
Proxy asset
```

Final render:

```text
Original asset
```

Both consume the same manifest.

---

# 27. Phase 22 — Thumbnail / Waveform Cache

Generate:

```text
thumbnail/
waveform/
keyframe index/
proxy/
```

Store metadata:

```json
{
  "assetId": "video-a",
  "fps": 30,
  "durationFrames": 1800,
  "keyframes": [0, 48, 96, 144]
}
```

This makes timeline scrubbing much faster.

---

# 28. Phase 23 — Subtitle / Caption Timing

Subtitles must also use frame-based timing.

```ts
type SubtitleCue = {
  id: string
  startFrame: Frame
  endFrame: Frame
  text: string
}
```

Visibility:

```ts
frame >= startFrame &&
frame < endFrame
```

The same rule must be used by:

- preview
- final FFmpeg renderer
- subtitle export
- karaoke highlighting

---

# 29. Phase 24 — Karaoke Timing

For word-level captions:

```ts
type WordCue = {
  text: string
  startFrame: number
  endFrame: number
}
```

Example:

```json
{
  "text": "hello",
  "startFrame": 120,
  "endFrame": 145
}
```

Preview:

```text
Canvas/WebGL text
```

Final:

```text
FFmpeg drawtext/ASS/custom subtitle rendering
```

The timing model remains identical.

---

# 30. Phase 25 — Debug Overlay

Build a developer-only overlay.

Example:

```text
FRAME       302
TIME        10.0667s
FPS         30

CLIP        clip-b
SOURCE      video-b
SOURCE FR   154

TRANSITION  none

RENDER      preview
```

When the user sees a flash cut, capture the exact frame.

This dramatically reduces debugging time.

---

# 31. Phase 26 — Frame Debug API

Add:

```ts
GET /projects/:id/debug/frame/:frame
```

Response:

```json
{
  "frame": 302,
  "time": 10.066666,
  "layers": [
    {
      "clipId": "clip-b",
      "assetId": "video-b",
      "sourceFrame": 154,
      "sourceTimestamp": 5.133333
    }
  ]
}
```

The browser and backend can be compared directly.

---

# 32. Phase 27 — Automated Frame Contract Tests

Create test vectors.

Example:

```json
{
  "fps": 30,
  "clips": [
    {
      "timelineStartFrame": 0,
      "timelineEndFrame": 300,
      "sourceInFrame": 100
    },
    {
      "timelineStartFrame": 300,
      "timelineEndFrame": 600,
      "sourceInFrame": 50
    }
  ]
}
```

Assertions:

```text
frame 299 → clip A
frame 300 → clip B
```

Test all boundaries.

---

# 33. Phase 28 — Golden Frame Tests

Create a fixed test project.

Render selected frames with FFmpeg:

```text
frame 0
frame 1
frame 29
frame 30
frame 299
frame 300
frame 301
...
```

Export preview frames from WebCodecs.

Compare:

```text
FFmpeg frame
     vs
Preview frame
```

Use image metrics:

- exact pixel diff
- mean absolute error
- maximum channel difference
- SSIM where useful

Do not rely only on visual inspection.

---

# 34. Phase 29 — Boundary Test Suite

Create tests for:

### Hard cut

```text
A [0,300)
B [300,600)
```

### Crossfade

```text
A [0,300)
B [285,600)
transition = 15 frames
```

### Trim

```text
sourceIn = 123
sourceOut = 456
```

### Speed

```text
0.5x
1x
2x
```

### Reverse if supported

### Nested layers

### Empty gaps

### Overlapping clips

### Subtitle boundary

### Audio boundary

---

# 35. Phase 30 — Browser/FFmpeg Differential Test

For each test project:

```text
Project
  ↓
Manifest
  ├── Browser resolver
  └── Python resolver
```

Serialize:

```json
{
  "frame": 300,
  "layers": [
    {
      "clipId": "b",
      "sourceFrame": 150
    }
  ]
}
```

Compare the JSON.

This should be the first test.

Only after the logical result is identical should image-level comparison be performed.

---

# 36. Phase 31 — Render Manifest Hash

Generate a deterministic hash:

```text
canonical manifest
       ↓
SHA-256
       ↓
manifestHash
```

Store:

```json
{
  "manifestHash": "abc123..."
}
```

Use it to identify exactly which timeline state generated a render.

This helps with:

- caching
- bug reports
- reproducibility
- render history
- support/debugging

---

# 37. Phase 32 — Preview Quality Levels

Provide three preview modes.

## Draft

```text
low resolution
proxy
reduced effects
```

## Normal

```text
proxy/full resolution depending on performance
normal effects
```

## Final Preview

```text
original media
full effects
```

The timeline/frame calculation must remain identical across all modes.

---

# 38. Phase 33 — Timeline Scrubbing Strategy

During active dragging:

```text
pointer move
 ↓
requested frame
 ↓
nearest cached frame
 ↓
render immediately
```

Then:

```text
pointer released
 ↓
exact requested frame
 ↓
decode exact frame
 ↓
render
```

This keeps the UI responsive without compromising final frame accuracy.

---

# 39. Phase 34 — Worker Architecture

Move heavy processing away from the React main thread.

Recommended:

```text
Main Thread
 ├── React UI
 ├── Timeline UI
 └── User interaction

Preview Worker
 ├── demux
 ├── WebCodecs decode
 ├── frame cache
 └── composition

Audio
 └── AudioContext
```

Use transferable `VideoFrame` objects where appropriate.

---

# 40. Phase 35 — WebGL Migration

After Canvas 2D correctness is established, migrate compositing to WebGL if required.

Use WebGL for:

- scaling
- rotation
- opacity
- blending
- masks
- crop
- color adjustments
- multiple simultaneous layers

Architecture:

```text
VideoFrame
   ↓
GPU texture
   ↓
shader
   ↓
composition framebuffer
   ↓
canvas
```

Keep the timeline resolver completely independent of WebGL.

---

# 41. Phase 36 — React Integration

The React component should not contain rendering logic.

Bad:

```tsx
function VideoPreview() {
  // timeline math
  // clip selection
  // transition calculation
  // FFmpeg-equivalent logic
}
```

Better:

```tsx
function VideoPreview() {
  const renderer = useVideoPreviewRenderer()

  return (
    <VideoCanvas renderer={renderer} />
  )
}
```

Timeline logic belongs in `video-core`.

---

# 42. Phase 37 — Preview API

Recommended interface:

```ts
interface PreviewEngine {
  loadProject(project: Project): Promise<void>

  seek(frame: Frame): Promise<void>

  play(): void

  pause(): void

  getCurrentFrame(): Frame

  renderFrame(frame: Frame): Promise<void>

  dispose(): void
}
```

Renderer internals:

```ts
interface FrameRenderer {
  render(resolved: ResolvedFrame): Promise<void>
}
```

---

# 43. Phase 38 — Backend API

Suggested endpoints:

```text
POST /video/assets
GET  /video/assets/:id
GET  /video/assets/:id/probe
GET  /video/assets/:id/keyframes
GET  /video/assets/:id/proxy

POST /video/projects
GET  /video/projects/:id
PUT  /video/projects/:id

POST /video/projects/:id/validate
POST /video/projects/:id/render

GET  /video/renders/:id
GET  /video/renders/:id/status
```

---

# 44. Phase 39 — Render Job

The final render request should contain:

```json
{
  "projectId": "project-001",
  "manifestVersion": 1,
  "manifestHash": "abc123"
}
```

The backend loads the exact manifest version.

Do not render directly from potentially changing UI state.

---

# 45. Phase 40 — Deterministic Rendering

The render process should be deterministic.

Input:

```text
manifest hash
+
asset versions
+
renderer version
+
FFmpeg version
```

Store:

```json
{
  "manifestHash": "abc123",
  "rendererVersion": "1.4.0",
  "ffmpegVersion": "..."
}
```

This makes render results reproducible.

---

# 46. Phase 41 — Asset Versioning

Do not allow a project to silently switch source files.

Use:

```json
{
  "assetId": "video-a",
  "version": 3,
  "sha256": "..."
}
```

Manifest references the exact asset version.

---

# 47. Phase 42 — Preview/Render Compatibility Matrix

Maintain a matrix:

| Feature | Preview | FFmpeg | Frame Contract |
|---|---|---|---|
| Hard cut | Yes | Yes | Required |
| Trim | Yes | Yes | Required |
| Crossfade | Yes | Yes | Required |
| Crop | Yes | Yes | Required |
| Scale | Yes | Yes | Required |
| Pan | Yes | Yes | Required |
| Zoom | Yes | Yes | Required |
| Rotation | Yes | Yes | Required |
| Opacity | Yes | Yes | Required |
| Subtitle | Yes | Yes | Required |
| Karaoke | Yes | Yes | Required |
| Audio | Yes | Yes | Required |
| Filters | Later | Yes | Define before enabling |
| VFR | Yes | Yes | Required |

A feature should not be exposed in the editor until its preview/render semantics are defined.

---

# 48. Phase 43 — Error Handling

Preview errors should not silently fall back to incorrect frames.

Example:

```ts
type PreviewError =
  | "UNSUPPORTED_CODEC"
  | "DECODE_ERROR"
  | "FRAME_NOT_AVAILABLE"
  | "INVALID_TIMELINE"
  | "MANIFEST_ERROR"
```

Display:

```text
Preview unavailable for this source.
Use proxy generation or replace the media.
```

For debugging, include:

```text
assetId
sourceFrame
timelineFrame
codec
```

---

# 49. Phase 44 — Performance Targets

Initial targets:

| Metric | Target |
|---|---:|
| Timeline drag response | < 50 ms |
| Cached frame display | < 16 ms |
| Normal playback | 30 FPS |
| Seek to nearby frame | < 150 ms |
| Seek to distant frame | < 500 ms where practical |
| UI main-thread blocking | minimal |
| Final render correctness | 100% manifest/frame contract |

These are engineering targets, not hard guarantees; actual performance depends on codec, source resolution, hardware, and browser.

---

# 50. Phase 45 — Implementation Sprints

## Sprint 1 — Renderer Audit

Deliverables:

- FFmpeg pipeline documentation
- ffprobe metadata
- current timeline model
- current flash-cut reproduction project
- baseline render files

---

## Sprint 2 — Canonical Timeline

Deliverables:

- Project schema
- Composition schema
- Frame utilities
- Clip schema
- transition schema
- validation
- unit tests

Success criteria:

```text
same project → deterministic frame resolution
```

---

## Sprint 3 — Render Manifest

Deliverables:

- manifest schema
- manifest generator
- manifest hash
- manifest validation
- JSON fixtures

Success criteria:

```text
UI project → deterministic manifest
```

---

## Sprint 4 — Python Integration

Deliverables:

- Python manifest parser
- FFmpeg graph builder
- frame boundary tests
- render manifest logging

Success criteria:

```text
manifest → FFmpeg render
```

without Python independently redefining timeline semantics.

---

## Sprint 5 — Browser Frame Resolver

Deliverables:

- JS/TS resolver
- frame diagnostics
- boundary debugger
- JSON differential tests

Success criteria:

```text
TS resolver == Python resolver
```

for all test vectors.

---

## Sprint 6 — WebCodecs Prototype

Deliverables:

- demuxer
- WebCodecs decoder
- frame seeking
- frame cache
- Canvas rendering

Success criteria:

```text
asset → requested source frame → VideoFrame
```

---

## Sprint 7 — Preview Compositor

Deliverables:

- multiple layers
- crop
- scale
- position
- rotation
- opacity
- transitions

Success criteria:

```text
preview uses ResolvedFrame directly
```

---

## Sprint 8 — Audio

Deliverables:

- audio decoding/playback
- timeline synchronization
- master clock
- seeking
- audio/video sync tests

---

## Sprint 9 — Subtitle/Karaoke

Deliverables:

- frame-based subtitle cues
- text rendering
- word timing
- karaoke highlighting
- FFmpeg export parity

---

## Sprint 10 — Proxy Pipeline

Deliverables:

- proxy generation
- keyframe index
- thumbnail cache
- waveform
- source/proxy mapping

---

## Sprint 11 — WebGL

Only after the Canvas implementation is correct.

Deliverables:

- GPU texture upload
- transform shaders
- blending
- crop
- multiple layers
- performance benchmarks

---

## Sprint 12 — Differential Testing

Deliverables:

- golden frame test suite
- FFmpeg frame extraction
- preview frame capture
- pixel-difference reports
- regression test dataset

---

## Sprint 13 — Production Hardening

Deliverables:

- error recovery
- memory management
- worker lifecycle
- resource disposal
- browser compatibility
- telemetry
- render reproducibility

---

# 51. Critical Acceptance Tests

## Test 1 — Hard Cut

```text
A: [0,300)
B: [300,600)
```

Expected:

```text
299 → A
300 → B
```

No flash frame.

---

## Test 2 — Crossfade

```text
A end = 300
transition = 15 frames
B starts transition = 285
```

Expected:

```text
285 → transition begins
299 → transition
300 → B fully visible
```

---

## Test 3 — Arbitrary Trim

```text
sourceIn = 127
sourceOut = 483
```

Verify every timeline frame.

---

## Test 4 — 29.97 FPS Source

Composition:

```text
30 FPS
```

Source:

```text
29.97 FPS
```

Verify deterministic mapping.

---

## Test 5 — 60 FPS Source

Composition:

```text
30 FPS
```

Verify source frame selection.

---

## Test 6 — VFR Source

Verify PTS-based mapping.

---

## Test 7 — Long Timeline

Test:

```text
10 minutes
30 FPS
18,000 frames
```

Verify no floating-point drift.

---

## Test 8 — 10,000+ Timeline Frames

Verify:

- memory
- scrubbing
- cache eviction
- frame resolver speed

---

# 52. Memory Management

`VideoFrame` objects can consume significant memory.

Always close frames when no longer needed:

```ts
frame.close()
```

Implement LRU cache:

```text
recent frames
     ↓
LRU
     ↓
evict old VideoFrames
```

Do not keep every decoded frame in memory.

---

# 53. Cache Strategy

Three levels:

```text
L1
Decoded VideoFrame cache

L2
Compressed/proxy media cache

L3
Server-generated thumbnails/proxies
```

Use different cache sizes depending on device capability.

---

# 54. Browser Compatibility

WebCodecs availability varies by browser/version/codec.

Implement capability detection:

```ts
if (!("VideoDecoder" in window)) {
  // fallback
}
```

Fallback options:

```text
WebCodecs
   ↓ unavailable
HTMLVideoElement preview
   ↓
server-generated preview video
```

The fallback should be clearly treated as a lower-accuracy compatibility mode unless it can satisfy the same frame contract.

---

# 55. Feature Flag Strategy

Introduce:

```text
VIDEO_PREVIEW_V2
WEBCODECS_PREVIEW
WEBGL_COMPOSITOR
PROXY_PREVIEW
FRAME_DEBUG
```

Roll out gradually.

---

# 56. Logging

Every render should be traceable:

```text
projectId
manifestHash
asset versions
renderer version
ffmpeg version
composition FPS
durationFrames
```

For preview debugging:

```text
projectId
frame
clipId
sourceFrame
decoder state
cache hit/miss
```

---

# 57. Observability

Track:

```text
preview_decode_time
preview_render_time
preview_seek_time
preview_cache_hit
preview_cache_miss
dropped_frames
decoder_errors
render_duration
render_failures
```

This helps distinguish:

```text
timeline bug
vs
decoder performance issue
vs
GPU performance issue
```

---

# 58. Definition of Done

The implementation is considered complete when:

### Timeline

- [ ] timeline uses integer frames
- [ ] all clip boundaries use `[start, end)`
- [ ] FPS is defined at composition level
- [ ] source/timeline coordinates are separate
- [ ] transitions are frame-based
- [ ] rounding rules are centralized

### Preview

- [ ] WebCodecs decoding works
- [ ] frame seeking is deterministic
- [ ] decoded frames are cached
- [ ] compositor consumes `ResolvedFrame`
- [ ] audio is synchronized
- [ ] subtitle timing is frame-based

### FFmpeg

- [ ] FFmpeg consumes Render Manifest
- [ ] Python does not independently redefine timeline logic
- [ ] output FPS is deterministic
- [ ] VFR behavior is defined
- [ ] render metadata is stored

### Testing

- [ ] hard-cut tests pass
- [ ] transition tests pass
- [ ] trim tests pass
- [ ] VFR tests pass
- [ ] 29.97 FPS tests pass
- [ ] 60 FPS tests pass
- [ ] subtitle tests pass
- [ ] audio sync tests pass
- [ ] browser resolver == Python resolver
- [ ] golden-frame regression tests pass

---

# 59. Priority Order

Do **not** implement everything at once.

Recommended order:

```text
1. Canonical frame model
        ↓
2. Timeline resolver
        ↓
3. Render Manifest
        ↓
4. Python/FFmpeg integration
        ↓
5. Differential frame tests
        ↓
6. WebCodecs decoder
        ↓
7. Canvas compositor
        ↓
8. Audio clock
        ↓
9. Subtitle/karaoke
        ↓
10. Proxy system
        ↓
11. WebGL optimization
```

The most important rule is:

> **Do not optimize the preview renderer before proving that the timeline resolver produces exactly the same logical frames as the FFmpeg renderer.**

---

# 60. Recommended Final Architecture

```text
                         PROJECT
                            │
                            ▼
                  ┌───────────────────┐
                  │  Timeline Model   │
                  │                   │
                  │ Integer Frames    │
                  │ Source Frames     │
                  │ Transitions       │
                  │ Transforms        │
                  │ Subtitles         │
                  │ Audio             │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ Timeline Resolver │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌───────────────────┐
                  │ Render Manifest   │
                  │ / Resolved Frame  │
                  └─────────┬─────────┘
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
      ┌──────────────────┐      ┌──────────────────┐
      │ Browser Preview  │      │ FFmpeg Renderer  │
      │                  │      │                  │
      │ WebCodecs        │      │ Python           │
      │ Decoder          │      │ FFmpeg           │
      │                  │      │                  │
      │ Canvas/WebGL     │      │ Final MP4        │
      └──────────────────┘      └──────────────────┘
```

The central principle is:

```text
                    SAME
                     │
        ┌────────────┼────────────┐
        │            │            │
     Timeline      Frame       Composition
        │            │            │
        └────────────┼────────────┘
                     │
              Different engines
                     │
          ┌──────────┴──────────┐
          │                     │
       Browser                FFmpeg
```

The browser and FFmpeg may remain different rendering engines, but they must **never make independent decisions about what should be rendered**.

That is the architectural change that will eliminate the class of flash-cut/timing discrepancies you are seeing and give the project the foundation required for a CapCut/Canva-style editor.

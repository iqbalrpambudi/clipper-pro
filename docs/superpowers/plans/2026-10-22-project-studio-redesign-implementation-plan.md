# Project Studio UI Redesign Implementation Plan

**Goal:** Rebuild the Short Video and Storyboard editor layouts with the
dashboard's light editorial theme and reusable UI components while preserving
existing project functionality.

**Design:** [Project Studio UI Redesign](../specs/2026-10-22-project-studio-redesign-design.md)

**Compatibility constraints:** Keep existing routes, tabs, tab ordering, free
navigation, project data, API calls, stores, hooks, form state, timeline
interactions, rendering behavior, and media pixels unchanged. Scope theme
tokens to project-editor routes; do not alter the global dark root theme,
dashboard, Art Studio, or Settings.

## Implementation tasks

### 1. Build the themed project-editor frame and reusable component styles

**Files**

- Modify `apps/web/components/layout/StudioLayout.tsx`
- Modify `apps/web/app/globals.css`
- Modify existing shared primitives under `apps/web/components/ui/` only where
  a project-scoped variant or token-based styling is needed
- Modify `apps/web/app/project/short/[id]/layout.tsx`
- Modify `apps/web/app/project/storyboard/[id]/layout.tsx`

**Steps**

1. Add a project-editor theme boundary using the approved workspace tokens;
   do not modify root `:root` values.
2. Rebuild the common header with a clear Projects return link, editable
   project name, aspect-ratio/resolution metadata, Settings access, and the
   existing Render/Export action where applicable.
3. Rebuild the horizontal workflow navigation using the existing tab data.
   Preserve IDs, order, labels, badges, handlers, keyboard access, and free
   switching. Make the active stage clear without inventing progress.
4. Add responsive behavior: compact the header on mobile and let only the stage
   navigation region scroll horizontally when necessary.
5. Replace hardcoded dark loading and project-load error screens in both route
   layouts with the project theme and standard status/action components.
6. Establish token-based project variants for buttons, inputs, selects,
   badges, dialogs, tabs, cards, and sliders. Preserve dark styles for consumers
   outside the project theme.

**Validation**

- Run formatting and lint on the shared layout, route layouts, and changed UI
  primitives.
- Confirm dashboard, Art Studio, Settings, and existing non-project consumers
  retain their current appearance.
- Verify project loading/error states and tab navigation in both project types.

### 2. Rebuild Short Video tab presentation

**Files**

- Modify `apps/web/components/media/MediaPoolTab.tsx` and
  `apps/web/components/media/ScenePreviewModal.tsx`
- Modify `apps/web/components/narration/NarrationTab.tsx`
- Modify `apps/web/components/tts/TTSTab.tsx` and relevant panels under
  `apps/web/components/tts/`
- Modify `apps/web/components/timeline/TimelineTab.tsx` and related timeline
  panels/controls under `apps/web/components/timeline/`
- Modify `apps/web/components/subtitles/SubtitleStudioTab.tsx` and related
  subtitle panels under `apps/web/components/subtitles/`
- Modify `apps/web/components/render/RenderTab.tsx` and
  `apps/web/components/render/PreviewPlayer.tsx`
- Update directly related project-scoped dialogs or status components as
  discovered during implementation

**Steps**

1. For task-oriented tabs, apply a consistent heading, concise supporting
   description, grouped controls, and clearly prioritized actions.
2. Replace local dark colors and inconsistent control sizing with project
   tokens and shared primitives; preserve component state and event handlers.
3. Rebuild the timeline composition for the light theme while keeping its
   current full-width/full-height behavior, track interactions, inspector,
   transport controls, resizing, and internal scrolling.
4. Make preview frames and surrounding panels light without changing displayed
   video/image pixels or playback behavior.
5. Preserve actual progress, render states, empty states, errors, dialogs, and
   all API interactions.

**Validation**

- Run targeted Short Video component tests, lint, and formatting.
- Verify media upload/selection, narration/TTS controls, timeline edits,
  subtitle controls, render actions, and existing error/loading states.
- Check timeline usability at desktop and narrow viewport sizes.

### 3. Rebuild Storyboard tab presentation

**Files**

- Modify `apps/web/components/storyboard/StoryboardScriptTab.tsx`,
  `StoryboardVoiceTab.tsx`, `StoryboardImagesTab.tsx`,
  `StoryboardTimelineTab.tsx`, `StoryboardRenderTab.tsx`,
  `StoryboardYoutubeTab.tsx`, and `StoryboardWatermarkTab.tsx`
- Modify directly used panels under
  `apps/web/components/storyboard/script/`,
  `apps/web/components/storyboard/timeline/`, and
  `apps/web/components/storyboard/thumbnail/`
- Modify project-scoped dialogs and preview components used by those tabs

**Steps**

1. Apply the same page hierarchy, typography, spacing, panel, and control
   patterns used by the Short Video workflow.
2. Keep the existing step sequence and descriptive tab labels while retaining
   free switching and all current tab state.
3. Recompose script, continuity, voice, image-generation, thumbnail, metadata,
   and render tasks into readable groups; retain their existing controls and
   primary actions.
4. Migrate storyboard timeline, subtitle, player, and preview surfaces to the
   light theme without reducing editing width or changing their behavior.
5. Preserve data-driven statuses and explicit errors; do not create mock
   completion markers.

**Validation**

- Run targeted Storyboard tests, lint, and formatting.
- Verify script/continuity editing, voice/sync, image operations, timeline and
  subtitle editing, thumbnail/YouTube, render, and error/loading states.
- Check wide desktop, tablet, and mobile layouts for clipping and unintended
  page-level overflow.

### 4. Verify full project-editor consistency and regressions

**Files**

- Add or update focused tests alongside affected project-editor components
- No unrelated API, database, dashboard, Art Studio, Settings, or TTS-provider
  changes

**Steps**

1. Search the in-scope project UI for remaining legacy dark surfaces, green
   Supabase accents, inconsistent control patterns, and conflicting spacing or
   typography. Classify actual media pixels separately from app chrome.
2. Run focused web tests, lint, formatting, and type checking. Identify
   pre-existing failures separately rather than changing unrelated code.
3. In a browser, exercise both project-editor routes with representative
   projects and visit every tab.
4. Check desktop and mobile widths including 320 px. Verify focus visibility,
   keyboard navigation, readable contrast, modal usability, touch targets, and
   the timeline's intentional internal scrolling.
5. Confirm project actions, form state, tab switching, timeline interactions,
   status badges, and render/export behavior remain unchanged.

**Completion criteria**

- All acceptance criteria in the approved design spec pass.
- Targeted tests, lint, and formatting pass; any existing unrelated typecheck
  failures are documented without expanding scope.
- Both project types use the shared warm light theme and standard controls
  throughout their project-specific UI.
- No unrelated worktree changes are reverted or included.

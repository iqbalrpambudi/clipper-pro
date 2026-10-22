# Project Studio UI Redesign

## Purpose

Rebuild the Short Video and Storyboard project-editor layouts so they use the
same warm, editorial workspace theme as the Project dashboard, Art Studio, and
Settings. Improve hierarchy, spacing, typography, and navigation clarity
without changing project behavior or production workflows.

## Goals

- Give both project types a consistent, light project-editor shell.
- Make project identity, format metadata, global actions, and workflow
  navigation easy to find.
- Make each tab's content easier to scan, with clear headings, task groups, and
  primary actions.
- Use standard reusable UI components and design tokens instead of per-tab
  dark styling.
- Keep the timeline useful as a dense, full-width editing surface while applying
  the light theme to its controls, tracks, panels, and preview frame.
- Preserve current state, data, routes, tabs, actions, and API behavior.

## Non-goals

- Changing project creation, editing, rendering, media processing, or storyboard
  behavior.
- Restricting navigation or introducing a mandatory wizard.
- Changing APIs, database schemas, project data, or production status semantics.
- Redesigning the Project dashboard, Art Studio, or Settings.
- Replacing Next.js, React, Tailwind, Radix UI, or the existing UI component
  system.
- Altering the pixels of source images or video displayed in a preview.

## Scope

The redesign covers both project-editor routes and all project-specific
surfaces:

- Shared project header and stage navigation.
- Short Video: Media Pool, narration, TTS/audio, timeline/subtitles, and render
  and export.
- Storyboard: script, voice/sync, AI illustrations, timeline/studio, render,
  YouTube/thumbnail, and associated panels.
- Project-scoped dialogs, forms, status badges, loading, error, and empty
  states.

The `StudioLayout` remains the shared project-editor layout owner. The warm
theme is scoped to the project-editor boundary rather than changing global
tokens used by unrelated screens.

## Visual direction

Use the approved dashboard workspace system:

| Role | Value |
| --- | --- |
| Workspace canvas | `#F3F0E8` |
| Primary surface | `#FBFAF7` |
| Raised surface | `#FFFEFA` |
| Primary text | `#26251F` |
| Secondary text | `#77766D` |
| Borders | `#E5E1D7` |
| Primary action | `#C45B3A` |
| Primary action hover | `#A9472C` |
| Supporting olive | `#76816B` |

- Inter is used for interface and body text.
- A restrained system-serif style is reserved for project-level headings.
- Monospace is reserved for compact technical metadata such as aspect ratio,
  resolution, timecode, and duration.
- Spacing follows an 8 px rhythm with consistent control sizing, card padding,
  and section gaps.
- Surface contrast and hierarchy should come from warm canvas, raised panels,
  thin borders, and restrained shadows rather than large dark blocks.
- Standardize buttons, inputs, textareas, selects, badges/chips, dialogs, tabs,
  and sliders using the existing shared primitives and project/workspace
  variants where needed.

## Shared editor layout

Use a compact header above a persistent horizontal stage-navigation row and a
wide work area:

1. The header provides a clear return-to-Projects action, editable project name,
   aspect-ratio/resolution metadata, Settings access, and the relevant
   Render/Export action.
2. The stage navigation keeps the existing stage names, sequence, badges, and
   unrestricted tab switching. It uses clear active, hover, focus, and status
   treatments without suggesting unavailable progress.
3. The work area uses the warm workspace canvas and light panels. Content
   layouts are allowed to vary by task so dense timeline editing is not forced
   into a generic form/card layout.
4. Timeline tabs retain their full-height, full-width working area and existing
   scroll/resize behavior. Track and control surfaces become light. Preview
   frames use the workspace surface; source media is displayed unchanged.
5. On narrow screens, the project header compresses without losing essential
   actions. Stage navigation can scroll horizontally within its own region;
   forms and panels stack, while the page avoids unintended horizontal
   overflow.

## Tab content and interaction

- Form- and setup-oriented tabs use a clear page heading and concise
  description, then related controls grouped into lightweight panels.
- Put the primary action near the controls it affects; secondary and
  destructive actions remain visually distinct.
- Dense timeline tabs prioritize usable width and stable vertical sizing over
  decorative cards. Keep inspector, preview, timeline, transport controls, and
  existing resize affordances recognizable.
- Keep current field labels, validation, confirmation dialogs, error messages,
  loading indicators, and data-dependent badges. Improve their grouping and
  contrast without suppressing or inventing states.
- Preserve empty, loading, and error states across each tab, including project
  load failures.
- Preserve all form values and in-progress state across existing interactions
  and failed requests.

## Architecture and behavior

- Keep `StudioLayout` as the shared owner of project-editor header, navigation,
  project theme boundary, and content frame.
- Reuse existing hooks, stores, queries, mutations, API clients, component
  ownership, and route destinations. Rework visual composition and replace
  bespoke dark classes with shared tokens and standard UI components.
- Scope project theme tokens to project routes; do not alter the global dark
  root theme or the existing workspace shell.
- Preserve current Short Video and Storyboard tab IDs, ordering, labels, status
  data, and free tab navigation.
- Do not make features appear complete unless the corresponding project data
  already provides that status.
- Add no new UI framework, theme package, or remote font dependency.

## Accessibility and responsive behavior

- Keep semantic page headings, navigation landmarks, buttons, links, form
  labels, and accessible names for icon-only actions.
- Provide visible keyboard focus and keyboard-operable tabs, controls, dialogs,
  and navigation.
- Maintain WCAG AA contrast for text and interactive controls on light
  surfaces.
- Use comfortable touch targets and avoid relying on color alone for active,
  error, or status information.
- Respect reduced-motion preferences for nonessential transitions.
- Verify common desktop and mobile widths, including 320 px, with no unintended
  page-level horizontal scrolling. Timeline content may retain its intentional
  internal horizontal scrolling.

## Implementation and validation plan

Implement in coherent phases while keeping feature logic intact:

1. Establish the project theme boundary, shared editor frame, responsive
   header, and stage navigation.
2. Rebuild Short Video tab layouts using shared tokens and primitives.
3. Rebuild Storyboard tab layouts and their project-scoped panels using the
   same system.
4. Migrate specialized timeline, preview, subtitle, and thumbnail surfaces;
   verify project-scoped dialogs and loading/error states.
5. Run targeted formatting, lint, tests, and type checks. Exercise both project
   routes at desktop and mobile sizes, verify tab navigation and representative
   project actions, and check for visual regressions and unintended overflow.

## Acceptance criteria

1. Both Short Video and Storyboard use a light, warm editor header, stage
   navigation, and workspace canvas consistent with the dashboard visual
   system.
2. All in-scope project UI—forms, panels, dialogs, timeline controls, status
   states, and preview frames—uses a consistent light theme and shared component
   styling.
3. Timeline editing remains full-width and functional; displayed source media
   retains its original visual content.
4. Existing tabs, routes, data, mutations, keyboard interactions, and production
   behavior continue to work.
5. Loading, error, empty, and status states remain accurate and understandable.
6. Typography, control sizing, spacing, and panel hierarchy are consistent
   across both project types.
7. Desktop and mobile layouts remain usable, with keyboard focus, accessible
   semantics, readable contrast, and no unintended page overflow at 320 px.

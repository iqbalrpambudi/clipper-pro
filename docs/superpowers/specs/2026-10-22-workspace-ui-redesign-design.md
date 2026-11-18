# Cliper Pro Workspace UI Redesign

## Purpose and scope

Apply the approved warm editorial creator-studio direction to the three
non-editor workspace surfaces:

- Project dashboard (`/`)
- Settings (`/settings`)
- Image Studio (`/image-studio`)

The dashboard, settings, and image studio should feel like one product through a
shared responsive shell and visual system. Project editing routes, including the
short-video and storyboard timelines, remain dark and are explicitly out of
scope for this phase. The approved standalone dashboard preview is a visual
reference, not application code to copy verbatim.

## Design direction

Use a calm, tactile, editorial workspace around the application's production
tools. Typography, generous page rhythm, warm surfaces, and restrained
terracotta actions provide the identity. Functional editing areas retain enough
contrast and density for practical work; the Image Studio's image-preview area
remains dark so generated images read clearly.

This is a product-specific adaptation, not a pixel-for-pixel Claude recreation.

## Visual tokens

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
| Progress/status olive | `#76816B` |
| Image preview canvas | `#171717` |

- Interface and form text use the existing locally hosted Inter font.
- A system serif stack is reserved for major page and project titles.
- A system monospace stack is used for compact technical metadata such as
  aspect ratios, resolution, and durations.
- Spacing follows an 8 px base scale. Dashboard sections breathe; settings and
  image-generation controls keep compact, task-oriented grouping.
- Use the existing component stack (Next.js, React, Tailwind, Radix-based UI);
  do not introduce a replacement framework or external font dependency.

## Shared shell

Create one reusable `WorkspaceShell` for the three in-scope routes. It owns:

- Cliper Pro wordmark and workspace identity.
- Navigation to Project, Image Studio, and Settings.
- Active-route treatment and a responsive navigation layout.
- A consistent page content container and workspace theme boundary.

On desktop, the shell uses a warm, compact sidebar beside the page content. On
mobile, navigation becomes a labeled, keyboard-accessible compact header/menu;
it must not depend on icons alone. The active page is exposed semantically.

The warm theme is scoped to the workspace shell, not applied globally. The
existing dark root/editor styles remain in place so project-editor routes and
their timeline, preview, and controls are unaffected. The shell provides
workspace token values to its descendants, including shared UI components, and
page-specific controls must be updated where current hard-coded dark utility
classes would otherwise override the intended theme.

## Page composition

### Project dashboard

- Use the approved dashboard hierarchy: editorial headline and description,
  create-project action, a recently updated project feature, then the searchable
  and filterable project grid.
- Select the featured project using the existing `updated_at` value. Keep it in
  the project collection as appropriate; do not hide projects from filters or
  search.
- Keep project type, ratio/resolution, media/scene/storyboard counts, language,
  created/updated dates, and existing rename/delete actions accurate.
- Use `Project.status` only for real status labels. Do not imply per-stage
  completion, duration, or progress unless a corresponding source exists in
  project data.
- Keep loading, no-project, and no-filter-results states clear and actionable.
- Preserve current search, type filters, sorting, reset behavior, project
  creation modal, edit modal, delete confirmation, and route destinations.
- Project cards may use restrained CSS artwork as decorative thumbnails, but
  must not suggest that mock artwork is an actual source-video thumbnail.

### Settings

- Place the current model/API, prompt-template, and subtitle-preset sections
  inside the shared shell and warm workspace surfaces.
- Keep the existing tabs, forms, validation, connection tests, API calls,
  encrypted-key behavior, and save/error notifications intact.
- Maintain readable grouping for technical fields and destructive actions.

### Image Studio

- Place the current preset synthesis and test-generation workflow inside the
  shared shell.
- Warm the page background, navigation, forms, and surrounding panels.
- Retain a dark image-preview canvas for generated/reference imagery.
- Preserve upload, analysis, generation, copy, save/apply, preset management,
  activation/deletion, zoom, and all existing dialogs and notifications.
- Keep the page's two-column work area responsive, stacking controls and
  preview on narrow screens without clipping or forcing horizontal scrolling.

## Behavior and data flow

The redesign changes presentation and navigation only. Existing React Query
hooks, API calls, stores, mutations, routes, loading states, errors, and dialog
ownership remain with their current page/features. The shell receives the
current route identity as a small explicit prop and provides navigation; it does
not own page-specific business state.

No dashboard activity, editing stage, render progress, or thumbnail data may be
fabricated to match the static preview. Show only information already exposed by
the relevant API/types.

## Accessibility and responsive behavior

- Maintain visible keyboard focus and semantic buttons, links, labels, and
  navigation landmarks.
- Provide text labels for mobile navigation; preserve usable hit targets.
- Ensure warm surfaces and action colors retain readable contrast.
- Support reduced motion for nonessential transitions.
- Prevent horizontal page overflow at 320 px and preserve usable forms,
  dialogs, filters, and project cards.

## Out of scope

- Restyling short-video or storyboard editor routes and their timeline surfaces.
- Changing APIs, database schema, project workflow, or business logic.
- Replacing the UI framework, adding a theme package, or introducing remote font
  or image dependencies.
- Reworking individual editor features beyond styling required by the three
  in-scope workspace pages.

## Acceptance criteria

1. `/`, `/settings`, and `/image-studio` share one responsive shell with
   consistent warm visual tokens and correct active navigation.
2. The dashboard follows the approved visual reference while rendering only
   real project data and preserving CRUD, search, filtering, sorting, and empty
   and loading states.
3. Settings forms, tabs, connection tests, preset operations, and notifications
   continue to behave as before.
4. Image Studio operations continue to work, and its preview canvas remains
   dark against the warm shell.
5. Existing editor routes retain their dark appearance and existing navigation
   and editing behavior.
6. The three workspace pages work at desktop and mobile widths, have visible
   keyboard focus, and do not show horizontal page overflow at 320 px.
7. Type checking and relevant lint/tests pass; the routes are visually checked
   in a browser at desktop and mobile sizes.

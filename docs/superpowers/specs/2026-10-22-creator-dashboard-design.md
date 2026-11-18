# Cliper Pro Creator Dashboard Design

## Purpose

Create a standalone HTML example of the Cliper Pro project dashboard so the user
can assess a warmer, more editorial visual direction before it is applied to the
application. The dashboard's job is to help creators find a project and resume
their production workflow.

## Direction

Use an editorial creator-studio identity: calm, warm, and readable outside the
editing canvas, while still communicating that this is a video-production tool.
Borrow the restraint and warmth discussed for Claude's website without copying
its branding or turning the dashboard into a chat interface.

## Visual tokens

| Role | Value |
| --- | --- |
| Canvas | `#F3F0E8` |
| Surface | `#FBFAF7` |
| Ink | `#26251F` |
| Muted text | `#77766D` |
| Accent | `#C45B3A` |

- Display: system serif (Georgia fallback), reserved for the page headline.
- Interface: Inter when available, followed by system sans-serif.
- Metadata: system monospace for aspect ratios, durations, and compact status
  labels.
- Spacing: an 8 px base scale; generous dashboard gutters, restrained card
  padding, and consistent control sizing.

## Layout and content

```text
+----------------+-----------------------------------------------+
| Cliper Pro     | Project studio                   [New project] |
|                |                                               |
| Projects       | Bahan mentah, cerita baru.                    |
| Image studio   | Kelola project dan lanjutkan proses editing.  |
| Settings       |                                               |
|                | Continue editing                              |
|                | [Featured project / thumbnail / progress]    |
|                |                                               |
|                | Your projects                 [search/filter]|
|                | [project card] [project card] [project card]  |
+----------------+-----------------------------------------------+
```

The page includes a compact sidebar, a clear title and create-project action, a
featured recently edited project, and a responsive grid of other projects.
Example project names and metadata are illustrative and must not imply real
backend functionality.

## Signature element

Each project card has a concise production-stage strip:
`Media → Script → Voice → Edit → Render`. It connects the editorial treatment
to Cliper Pro's actual production workflow. The strip is a visual summary only;
it does not need to be interactive in the example.

## Scope and constraints

- Deliver one self-contained HTML file for visual review.
- The file is a static mockup; it does not modify or connect to application
  routes, project data, or existing UI components.
- Keep the example responsive, keyboard-readable, and visually coherent without
  external network dependencies.
- Do not change the existing React, Next.js, Tailwind, or component framework.
- Do not alter the current dark video editor or timeline in this prototype.

## Acceptance criteria

1. The HTML opens directly in a browser without a build step or external assets.
2. It shows the approved dashboard hierarchy and production-stage signature.
3. It adapts from a multi-column desktop project grid to a narrow mobile layout.
4. Text and controls have readable contrast, and interactive examples expose
   visible keyboard focus.
5. The visual language is recognizably Cliper Pro creator tooling, not a
   pixel-for-pixel recreation of Claude.

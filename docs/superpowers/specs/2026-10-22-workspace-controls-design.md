# Workspace Control System Design

## Goal

Standardize buttons, chips, and form fields in Image Studio and Settings to
match the warm dashboard workspace. Reuse existing UI primitives wherever
possible and add a small reusable chip primitive for repeated compact choices.
The project dashboard is already approved and must not be restyled by this
change.

## Scope

- Image Studio: page actions, preset actions, inspiration tags, selection
  controls, upload-related buttons, generation controls, history/selection
  controls, and dialogs.
- Settings: model configuration, prompt-template and subtitle-preset tabs,
  including their selectors, actions, options and dialogs.
- Shared primitives: Button, Input, Textarea, Select, Badge, and the new chip
  primitive, only as needed to make in-scope controls consistent.
- Do not change project dashboard appearance or editor/timeline routes.
- Keep image preview/generation canvas and image zoom viewer dark.

## Visual rules

Use workspace tokens already established by the workspace redesign:

- Primary action: terracotta fill, white label, 40 px default target height,
  11–12 px corner radius.
- Secondary action: raised warm surface, subtle border, ink label.
- Quiet action: transparent surface, ink/muted label and warm hover fill.
- Destructive action: restrained red text/surface, distinct from primary action.
- Selectable chip: compact 30–34 px pill, warm neutral when idle, soft
  terracotta selected treatment, visible focus, and disabled state.
- Static status information remains a `Badge`; selected options are interactive
  buttons/chips and must not be represented as decorative badges.
- Form controls use a consistent 40 px minimum height, warm surface, ink text,
  subtle border, muted placeholder, and terracotta focus ring. Textareas retain
  a comfortable minimum writing height and monospace is reserved for prompts,
  identifiers or other technical content.

## Component approach

1. Keep using the existing `Button` primitive for actions. Add only the small
   semantic variant or token adjustments needed for the workspace; do not
   replace it with a parallel button system.
2. Keep `Input`, `Textarea` and `Select` as the shared form primitives. Their
   default tokens continue to match the existing dark application outside the
   workspace; the workspace theme supplies warm values without changing editor
   routes.
3. Add one reusable `WorkspaceChip` for compact, repeated choice controls. It
   accepts normal button props, supports an explicit selected state and exposes
   `aria-pressed` for toggle choices. Use ordinary Button styling for chip-like
   actions that trigger an operation rather than toggle a value.
4. Keep `Badge` for non-interactive status/type labels. Align success, warning,
   info and neutral colors with the warm palette where rendered in the workspace.
5. Prefer small semantic classes/variants over broad selectors that infer
   behavior from arbitrary Tailwind class names. Preserve custom visual
   treatments where they communicate actual status, provider identity, or
   destructive behavior.

## Interaction and accessibility

- Buttons retain clear primary/secondary/quiet/destructive hierarchy and visible
  hover, focus-visible, pressed/selected, and disabled states.
- Choice chips remain keyboard-operable buttons; toggles expose selected state
  with `aria-pressed`. Existing tab controls keep tab semantics.
- Every form control retains its label, validation, placeholder, focus
  visibility, and disabled behavior.
- Loading controls preserve their current disabled state and progress labels.
- Dialogs and portaled select menus must use the same warm tokens as their
  invoking workspace page.
- Preview canvas and image zoom keep dark surfaces and readable light controls.

## Behavior and data

This is a presentation-only change. Preserve API requests, model/provider
selection, prompt values, preset creation/update/delete/activation, uploads,
image generation, notifications, dialog state, validation, and every existing
selection behavior.

## Acceptance criteria

1. Buttons, chips, badges, and form fields in both in-scope areas follow the
   documented variants and token values.
2. Repeated selectable chips share the reusable component; action buttons and
   static badges use their correct semantic primitives.
3. All existing controls remain functional, including enabled/disabled/loading
   states and keyboard interaction.
4. Portaled dialogs and select menus match the light workspace; image canvases
   and zoom remain dark.
5. Dashboard and editor/timeline routes retain their current appearance.
6. Typecheck, lint, relevant tests, and browser checks pass at desktop and mobile
   widths without horizontal overflow.

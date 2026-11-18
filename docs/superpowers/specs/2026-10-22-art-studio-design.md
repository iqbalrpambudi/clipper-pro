# Art Studio Design

## Purpose

Replace the current Image Studio form with a guided workspace for creating,
reviewing, testing, and managing illustration presets. A preset can describe an
illustration style, a character, or both. Users can provide text, one optional
reference image, or both, and inspect generated images before applying a preset
to storyboard generation.

The selected direction is a guided flow in one studio, with a separate preset
collection. This follows the user's approval of the recommended workflow:
choose a preset intent, describe it, generate a representative image, test it
with scene prompts, then save and optionally activate it.

## Goals

- Make the purpose and next action clear for first-time and returning users.
- Support style, character, and combined presets with text and optional image
  references.
- Show a representative generated image before users rely on a preset.
- Let users test the preset against different scene prompts and review results.
- Preserve existing presets and their storyboard integration.
- Keep the approved warm workspace theme and dark image canvas.

## Non-goals

- Guaranteeing identical character identity across independent generated images.
- Image-to-image editing, masks, layers, or a manual drawing canvas.
- Multiple reference images per preset in the first version.
- Persisting every test generation as part of a preset.
- Adding aspect-ratio choices; all Art Studio outputs remain 16:9 to match
  storyboard images.
- Replacing the configured image or vision model/provider.

## Product structure

The visible navigation label changes from **Image Studio** to **Art Studio**.
Keep the existing `/image-studio` route to avoid breaking bookmarks and
internal links.

The page has two modes:

1. **Koleksi** (Collection): the landing view, showing saved presets and the
   active preset. Users can create a preset, open one to edit, activate one, or
   delete a custom preset.
2. **Studio**: a guided three-step flow with a visible stepper:
   **Rancang → Buat contoh → Uji prompt**.

Starting a new preset opens a blank, guided form rather than silently loading
the active preset into the new draft. Opening an existing preset in the Studio
prefills its saved values. Built-in presets remain non-deletable.

### Collection view

- Show each preset as a card with its generated preview (or a neutral
  placeholder), name, type, category, short description, and active/built-in
  status.
- Provide explicit actions: **Buka di Studio**, **Aktifkan untuk storyboard**,
  and **Hapus** for custom presets.
- Visually distinguish the active preset without implying that merely opening
  or saving another preset changes storyboard behavior.
- Keep the existing confirmation and success/error feedback for destructive
  and activation actions.
- Provide clear loading, empty, and error states. The empty state explains how
  to create the first preset.

### Studio: Rancang

- Require a preset intent: **Gaya ilustrasi**, **Karakter**, or **Gaya +
  karakter**.
- Collect a preset name, a plain-language description, and one optional
  reference image. Users may provide text, an image, or both; at least one
  meaningful input is required to analyze.
- Keep the supported PNG, JPEG/JPG, and WebP file formats. Make the upload
  target keyboard accessible and show the selected image with replace/remove
  actions.
- Use a concise primary action such as **Susun preset**. While analyzing, show
  progress and prevent duplicate submission without clearing the form.
- Present AI-produced name, description, category, master prompt, negative
  prompt, and structured visual attributes as editable results. Explain in
  plain language that the prompt can be refined before generating.
- For a **Gaya ilustrasi** preset, treat a reference image only as a source of
  reusable visual treatment (medium, linework, palette, lighting, shading,
  detail level, and texture). Do not carry its particular subject, character,
  clothing, pose, props, setting, background, or composition into the preset;
  future scene prompts determine all image content and composition.
- Prefer crisp, clean contours, clear edges, and controlled fills for style
  presets. Preserve only intentional subtle texture and exclude unwanted film
  grain, speckles, random noise, rough sketch strokes, fuzzy edges, and smudges.

### Studio: Buat contoh

- Offer an editable **Arahan gambar contoh** field, with an initial suggestion
  based on the preset intent. For a character preset, suggest a clear,
  full-body character presentation; for a style preset, suggest a simple scene
  that makes the visual language easy to judge.
- Generate a representative 16:9 image using the current editable preset
  instructions. Keep the image in the dark preview canvas.
- Show the image as the preset's primary preview. Allow regeneration without
  losing the user's text, image reference, or edited prompts.
- Saving is allowed once a usable master prompt exists. The representative
  image is recommended and becomes the card preview when available; saving
  without one remains possible and uses a neutral placeholder.

### Studio: Uji prompt

- Provide a separate scene-prompt field for testing how the preset behaves on
  storyboard-like content. Include a few example prompts that can be inserted
  with one click.
- Generate using the current master prompt and negative prompt. Keep the
  representative preview separate from test outputs so testing does not
  silently replace the preset cover.
- Let users browse and select test outputs from the current session. Test
  history is temporary and is not stored in the preset.
- Testing is optional; users can save after the prompt is ready and can return
  to earlier steps to refine it.

The save action is available in the Studio header and at the end of the flow.
Saving creates or updates a preset but does not activate it. Activation is a
separate, clearly labeled action in the Collection view and on the post-save
confirmation. The active preset continues to supply the storyboard image style
prompt as it does today.

## Data model and API

Extend `ImagePreset` with a `preset_type` field whose values are `style`,
`character`, and `combined`. Add the field to create/update/response schemas and
the web type. A database migration assigns `style` to all existing records so
they remain valid and usable.

Carry `preset_type` through the analysis request and response so the analyzer
can produce suitable prompt attributes and initial sample suggestions. Keep
existing CRUD, activation, upload, and test-generation routes compatible; new
fields should be optional/defaulted where necessary for older clients.

Use the existing preset test-generation flow for both the representative image
and scene tests. Pass the preset's negative prompt to image generation as well
as its master prompt; the underlying image-generation service already accepts a
negative prompt, but the current preset-test service does not forward it.
Continue returning actionable API errors for upload, analysis, saving, and
generation failures.

The representative image URL is persisted as `preview_image_url`. Test output
URLs remain session-only. The reference image URL remains
`reference_image_url`. Existing activation continues to synchronize the active
master prompt to storyboard configuration.

## Character consistency

For character and combined presets, the analyzer includes visual identity
traits in the editable preset prompt. However, the current image-generation
flow is text-conditioned and does not pass the representative character image
as a reference to later scene generations. The interface must not promise exact
identity consistency across separate generations. This can be revisited as a
separate image-conditioning capability if supported by configured providers.

## Interaction, errors, and accessibility

- Use Indonesian, plain-language labels and one clear primary action per step.
- Show the current step and completed steps; allow users to return to previous
  steps without losing edits.
- Preserve form state when a request fails. Display an actionable inline error
  near the affected action and offer retry; do not report success-shaped
  fallbacks.
- Show loading/progress states for upload, analysis, and image generation, and
  prevent duplicate requests.
- Provide semantic labels for all form controls and image actions, keyboard
  access to upload, cards, dialogs, and actions, and visible focus states.
- At narrow widths, stack the work area and avoid horizontal page overflow.
- Use the warm workspace theme for navigation, forms, and cards. Keep reference
  and generated-image canvases dark for image contrast.

## State ownership and component boundaries

- The Art Studio page owns the active draft, current step, selected preset,
  reference upload state, sample generation state, and session-only test
  history.
- The Collection view owns no duplicate preset data; it uses the existing
  preset query and mutations.
- Keep API requests and async mutations in the page or focused feature hooks,
  not in presentational cards or form controls.
- Use focused components for the Collection, Studio stepper, concept/reference
  form, prompt editor, representative preview, and prompt tester. Shared form
  and button primitives remain the existing workspace UI components.

## Validation and acceptance criteria

1. Users can create style, character, and combined presets from text, an image,
   or both; empty input is prevented with a clear instruction.
2. AI analysis produces editable preset details, and later changes are used in
   image generation.
3. The representative image and each test image are generated at 16:9 using
   both the master and negative prompts.
4. Representative previews remain distinct from session-only test history;
   generated representative images are persisted on save.
5. Saving does not activate a preset. Explicit activation still updates the
   active storyboard style.
6. Existing presets load, update, activate, and delete according to their
   current built-in/custom rules; their migration defaults the type to `style`.
7. Upload, analysis, image generation, save, activation, and delete errors
   remain visible and actionable without losing draft input.
8. Collection and all three Studio steps remain usable at desktop and mobile
   widths, with keyboard-operable controls, visible focus, and no horizontal
   overflow.
9. Tests cover the preset-type migration and API schema behavior, prompt
   forwarding (including the negative prompt), and the principal UI states for
   new/edit, generation, save, activation, and failures.

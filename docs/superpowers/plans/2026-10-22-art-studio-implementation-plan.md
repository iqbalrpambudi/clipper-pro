# Art Studio Implementation Plan

**Goal:** Replace the current Image Studio form with a guided Art Studio for
creating style, character, and combined illustration presets, generating a
representative image, testing scene prompts, and explicitly activating saved
presets for storyboard generation.

**Design:** [Art Studio Design](../specs/2026-10-22-art-studio-design.md)

**Compatibility constraints:** Keep `/image-studio`; existing presets migrate
to type `style`; saving never activates; the active preset continues syncing
its master prompt to storyboard configuration; all outputs remain 16:9; keep
test history session-only and image canvases dark.

## Implementation tasks

### 1. Add preset type migration and API contracts

**Files**

- Create `apps/api/migrations/versions/<next_revision>_add_image_preset_type.py`
- Modify `apps/api/app/models/image_preset.py`
- Modify `apps/api/app/schemas/image_preset.py`
- Modify `apps/web/types/index.ts`

**Steps**

1. Check the current Alembic head and choose the next revision identifier.
2. Add non-null `preset_type` with a server default of `style` to
   `image_presets`; the default must apply to existing rows and old API
   clients. Add a check constraint for `style`, `character`, or `combined` if
   supported consistently by this database setup.
3. Add the matching model field with the `style` default.
4. Add a shared literal type and schema validation for the three supported
   values. Include it in create/update/response schemas and default missing
   create values to `style`.
5. Add the matching field to the web `ImagePreset` type.
6. Implement `downgrade()` to remove the constraint and column in reverse
   order.

**Validation**

- Run the migration upgrade and downgrade against the project test database or
  the repository's migration test procedure.
- Verify existing rows receive `style`, new schema payloads round-trip each
  allowed value, and invalid values fail validation.

### 2. Extend analysis and test generation behavior

**Files**

- Modify `apps/api/app/schemas/image_preset.py`
- Modify `apps/api/app/api/v1/image_studio.py`
- Modify `apps/api/app/services/image_studio.py`
- Add `apps/api/tests/services/test_image_studio.py`
- Extend `apps/api/tests/api/test_api_endpoints.py` where endpoint integration
  fixtures are appropriate

**Steps**

1. Add optional/defaulted `preset_type` to the analyze request/response so
   existing clients remain compatible.
2. Update style analysis instructions and fallback synthesis to receive the
   selected intent. Keep style attributes structured; make character identity
   traits explicit for `character` and `combined`, without promising exact
   identity across generations.
3. Add an optional `negative_prompt` to test-generation requests. Forward it
   into `generate_preset_test_image()` and then to the existing
   `generate_image_to_path()` call.
4. Keep the current 16:9 default and endpoint response shape compatible. Use
   the same generation endpoint for representative previews and scene tests;
   the client supplies separate prompts and keeps the returned results in
   separate state.
5. Keep API failures explicit and preserve current HTTP error reporting.

**Validation**

- Unit-test analysis with all three preset types and verify analyzer fallback
  behavior remains deterministic when AI output is missing/incomplete.
- Unit-test test-generation argument forwarding, including master prompt,
  negative prompt, scene prompt, and 16:9 dimensions.
- Exercise API schema compatibility when `preset_type` or
  `negative_prompt` is omitted.

### 3. Replace the single-form page with Collection and guided Studio

**Files**

- Modify `apps/web/app/image-studio/page.tsx`
- Replace or split `apps/web/app/image-studio/_components/ImageStudioSynthesizer.tsx`
- Replace or split `apps/web/app/image-studio/_components/ImageStudioTester.tsx`
- Modify `apps/web/app/image-studio/_components/ImageStudioDialogs.tsx`
- Add focused components under `apps/web/app/image-studio/_components/` for
  the collection cards, stepper, concept/reference form, prompt editor,
  representative preview, and scene tester
- Modify `apps/web/lib/api.ts`

**Steps**

1. Keep the existing route and preset query/mutations. Add `preset_type` and
   `negative_prompt` to client request shapes.
2. Make Collection the landing mode. Show active/built-in status and preview
   images; expose create, edit, activate, and custom-preset delete actions.
   Add loading, empty, and error states.
3. Create a blank draft for new presets. When opening an existing preset,
   prefill the draft and begin at Rancang. Preserve current state while moving
   between steps and after request errors.
4. Implement the three-step flow: Rancang, Buat contoh, Uji prompt. Require
   text or a reference image before analysis. Make the upload target keyboard
   accessible and retain replace/remove controls.
5. Keep AI-generated metadata and prompts editable. Generate a representative
   image with its own editable prompt and preview state.
6. Keep test scene prompt and session-only history separate from the
   representative preview; allow choosing a history image to inspect it
   without replacing the saved cover.
7. Save/update a preset with its `preset_type`, prompts, attributes, reference,
   and representative `preview_image_url`. Saving must not activate. Keep
   activation explicit in Collection and after-save feedback.
8. Show inline loading and error feedback for uploads, analysis, generation,
   save, activation, and deletion. Never clear draft content on failure.

**Validation**

- Run the web lint, typecheck, formatter check, and tests after the UI/API
  contracts are wired.
- Add component tests for empty draft, edit existing, step navigation, failed
  analysis/generation retaining input, saving without activation, and active
  preset status.

### 4. Update workspace navigation and copy

**Files**

- Modify `apps/web/components/layout/WorkspaceShell.tsx`
- Modify any navigation label or page metadata that names Image Studio
- Keep `apps/web/app/image-studio/page.tsx` route unchanged

**Steps**

1. Change the visible navigation and page heading to **Art Studio**.
2. Update page description and accessible names to describe style/character
   preset creation and testing.
3. Preserve existing link destinations and the workspace visual system.

**Validation**

- Verify navigation displays Art Studio and still opens `/image-studio`.
- Confirm Dashboard, Settings, and editor/timeline visual behavior is
  unchanged.

### 5. Verify end-to-end behavior and responsive/accessibility criteria

**Files**

- Add or update relevant tests in `apps/api/tests/` and
  `apps/web/app/image-studio/`
- No unrelated project/editor changes

**Steps**

1. Run focused API tests, focused web tests, web lint, and web typecheck.
2. Run migration validation using the repository-supported database setup.
3. In a browser, verify Collection, each Studio step, upload, image analysis,
   representative generation, test generation, save, activation, and error
   states.
4. Check desktop and narrow mobile widths, including 320 px, for horizontal
   overflow, visible focus, accessible labels, and keyboard-accessible upload
   and actions.
5. Verify representative generation stores its image on save, test history
   remains session-only, and activation—not saving—changes the storyboard's
   active preset.
6. Verify existing built-in/custom preset CRUD behavior and that older preset
   records appear as style presets after migration.

## Completion criteria

- All nine acceptance criteria in the approved design spec pass.
- The focused test/lint/typecheck commands pass, or any pre-existing unrelated
  failures are documented and shown to be unchanged.
- No unrelated working-tree changes are reverted or included in commits.

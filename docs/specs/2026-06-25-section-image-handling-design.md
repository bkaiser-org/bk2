# Consistent Section Image Handling — Design

**Date:** 2026-06-25
**Type:** design
**State:** awaiting implementation

## Problem

Image handling across CMS sections is inconsistent and partly broken:

- `ArticleConfig` was migrated to `images: ImageConfig[]` at the type level, but old Firestore
  docs still carry a legacy single `image` field; `ArticleStore` papers over this with a
  read-time shim.
- Single-image sections (`hero` logo/hero) can only have their image URL typed in manually —
  there is no upload.
- The "add image" button in the multi-image editor (`bk-images-config`) does not open the file
  picker.
- The hero config editor is mis-wired (both logo and hero slots call `onImageConfigChange`,
  which writes `properties.image` on an article).
- The section config modal is dense: every field is shown at once, with no separation between
  the few fields normally needed and the many advanced ones.
- The rich-text editor display inside the modal is visually plain.

## Goals

1. One consistent convention for image config across all sections.
2. Migrate the legacy single article `image` to `images[]`.
3. Allow uploading one or more images both from the section config modal and from the section
   list ActionSheet.
4. Confirm before overwriting when a slot holds a single image.
5. Fix the broken "add image" button (and the mis-wired hero editor).
6. A nicer rich-text editor display.
7. A simplified config form: a minimal set of fields by default, with one global toggle to
   reveal advanced fields.

## Decisions (from brainstorming)

- **Data model:** keep per-config image fields (no change to `BaseSection`).
- **Migration:** one-time batch script (not a permanent read-time shim).
- **Advanced toggle:** a single global toggle for the whole section form (not per-card).
- **List action:** yes — add a per-section "upload image(s)" action for image-bearing sections.
- **"The editor" to beautify:** the rich-text content editor (`bk-editor`).
- **Single-image upload:** yes — single-image editors gain upload + overwrite-confirm.

## Design

### 1. Data model — keep per-config fields, no `BaseSection` change

Image config stays inside each section's own config. We lock in one convention: a config exposes
**either** `images: ImageConfig[]` (multi) **or** one-or-more named `ImageConfig` fields (single),
optionally together with an `imageStyle: ImageStyle`.

| Section | Image fields | Cardinality |
|---|---|---|
| `article` | `images: ImageConfig[]` + `imageStyle` | multi |
| `slider` | `images: ImageConfig[]` + `imageStyle` | multi |
| `hero` | `logo: ImageConfig` + `hero: ImageConfig` + `imageStyle` | two named singles |
| `button` | `imageStyle` only (icon-based) | none |
| `album` | `directory` (runtime-resolved) | unchanged |

The legacy single `image` field is **removed** from `ArticleConfig` (and any code that reads it)
after the migration runs.

`shared-models` change: none structurally — `ArticleConfig.images` already exists. The only model
edit is removing/confirming there is no `image?` field left on `ArticleConfig`. (No `BaseSection`
change, so the "ask before schema change" rule is satisfied — confirmed during brainstorming.)

### 2. Article legacy migration — one-time batch

A one-off admin migration script (firebase-admin, run manually) scans `sections` where
`type === 'article'`. For each doc with a legacy `properties.image` and an empty/missing
`properties.images`, it sets `properties.images = [image]` and deletes `properties.image`.

- Script location: `apps/functions/scripts/migrate-article-images.ts` (or equivalent one-off
  admin script), run by Bruno with a service account. Idempotent: skips docs that already have
  `images`.
- It logs how many docs were inspected, migrated, and skipped.
- **After** the run is confirmed, remove the read-time shim in `ArticleStore`
  (`images` computed fallback and the `image` computed, `article-section.store.ts:41-54`) and the
  dead `article` branch of `onImageConfigChange` in `section.form.ts`.

### 3. Upload from two entry points — centralised `SectionImageService`

Introduce a small `SectionImageService` (in `cms-section-data-access`, or `feature` if it needs
modal/alert controllers) that encapsulates each section's image "slots" and performs
upload → patch → save, including the overwrite-confirm. Both entry points call into it so the
logic lives in one place.

- **Slots model:** for a given `SectionModel`, the service can enumerate its image slots:
  `article`/`slider` → one multi-slot (`images`); `hero` → two single-slots (`logo`, `hero`).
- **Config modal (existing path, enhanced):**
  - Multi editor `bk-images-config`: append uploaded images (after the add-button fix).
  - Single editor `bk-image-config` (hero logo/hero): add an upload button that uploads into that
    slot, with overwrite-confirm when the slot already has a non-default url.
- **Section list ActionSheet** (`section-list.ts`): add an "Upload image(s)" action, shown only
  when the section type is `article`, `slider`, or `hero`.
  - `article`/`slider`: pick one or more files → append to `images[]`.
  - `hero`: present a sub-choice (logo / hero), then overwrite-confirm, then upload into that slot.

Storage path convention stays `tenant/{tenantId}/section/{sectionKey}` (as today in
`section.form.ts:420` and `images-configuration.ts`). The service also creates the backing
document record via `UploadService.createAndSaveDocument`, mirroring current behaviour.

### 4. Single-image overwrite confirmation

A shared confirm dialog (Ionic `AlertController`, "Replace existing image?") fires whenever
uploading into a slot that already holds a non-default url. Used by the single-image editor and
the hero list action. Lives in `SectionImageService` so both callers share it.

### 5. Fix the broken "add image" button + mis-wired hero editor

- **Add button:** in `images-configuration.ts`, drop the `<label>` wrapper, put a template ref on
  the hidden `<input type="file">`, and call `fileInput.click()` from the `<ion-button>`'s
  `(click)`. Root cause: an `<ion-button>` (shadow-DOM custom element) nested in a `<label>`
  wrapping a hidden file input does not reliably trigger the input.
- **Hero editor:** in `section.form.ts`, wire the two `bk-image-config` instances to
  `onLogoConfigChange` and `onHeroConfigChange` respectively (they currently both call
  `onImageConfigChange`, which writes `properties.image` on an article). Remove the now-unused
  `onImageConfigChange`.

### 6. Nicer rich-text editor display

Polish `bk-editor` / `bk-editor-config`:

- Wrap the editor in a card-like container with padding, a subtle border, border-radius, and a
  focus ring (replacing the current `border: none`).
- Style the toolbar as a header strip separated from the text area.
- Sensible `min-height` so empty editors are not collapsed.
- Lighter, less prominent clear/copy buttons.
- Dark-mode tuning consistent with the rest of the modal.

Keep `ngx-editor` as the underlying editor.

### 7. Simplified form + one global "Show advanced" toggle

- Add a `showAdvanced` signal in `SectionForm`, surfaced as a toggle at the top of the form
  (in/near `bk-section-config`'s header). Default **off**, not persisted.
- Pass it down as a `[showAdvanced]` input to the sub-editors. Each sub-editor renders its basic
  fields always and its advanced fields under `@if(showAdvanced())`.

Field tiers:

| Editor | Basic (always) | Advanced (toggle on) |
|---|---|---|
| Section base (`bk-section-config`) | Title, Subtitle, Required role, State | Color, Internal name, Index/order, Column size, Archived |
| `ImageConfig` (single & list item) | image (upload/url), altText | label, type, actionUrl, overlay |
| `ImageStyle` (`bk-image-style`) | width/height, fill | sizes, border, borderRadius, isThumbnail, slot, hasPriority, action, zoomFactor, imgIxParams |

Tiering applies to the **section base + image editors + image-style** only. Other type-specific
configs (map, chat, etc.) may accept the `showAdvanced` input but are otherwise left untouched.

## i18n

New keys needed (in `cms/section/feature/src/i18n/de.json` and wired through the section i18n
util): the "Show advanced" toggle label, the "Upload image(s)" list action label, the overwrite
confirmation title/message/buttons, and the hero logo/hero slot sub-choice labels. Follow the
`i18n` skill (store-driven keys resolved to `Signal<string>`).

## Affected files (non-exhaustive)

- `libs/shared/models/src/lib/section.model.ts` — confirm `ArticleConfig` has no `image?` field.
- `libs/cms/section/feature/src/lib/article-section.store.ts` — remove read-time shim post-migration.
- `libs/cms/section/feature/src/lib/section-list.ts` — add upload action.
- `libs/cms/section/ui/src/lib/section.form.ts` — `showAdvanced`, hero wiring, remove dead handler.
- `libs/cms/section/ui/src/lib/images-configuration.ts` — fix add button.
- `libs/cms/section/ui/src/lib/section-configuration.ts` — basic/advanced split.
- `libs/cms/section/ui/src/lib/image-style-configuration.ts` — basic/advanced split.
- `libs/shared/ui/src/lib/image-config.ts` — single-image upload + overwrite-confirm + tiering.
- `libs/shared/ui/src/lib/editor.ts` — nicer display.
- New: `SectionImageService` in `cms-section-data-access` (or `feature`).
- New: `apps/functions/scripts/migrate-article-images.ts` — one-time migration.
- `libs/cms/section/feature/src/i18n/de.json` + section i18n util — new keys.

## Out of scope

- Album's directory-based model.
- Tiering of non-image type-specific configs (map, chat, etc.).
- Persisting the advanced toggle across sessions.

## Open questions

None outstanding — all resolved during brainstorming.

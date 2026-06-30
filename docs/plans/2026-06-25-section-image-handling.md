# Consistent Section Image Handling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image handling consistent across CMS sections — unified upload (config modal + section list), single-image overwrite confirmation, a fixed add-image button, a one-time article `image`→`images[]` migration, a nicer rich-text editor, and a global "show advanced" toggle that simplifies the config form.

**Architecture:** Pure decision logic (which image slots a section has, whether a slot is occupied, how uploaded files map into a section) lives in `cms-section-util` and is unit-tested. A thin `SectionImageService` in `cms-section-feature` orchestrates pick→confirm→upload→persist for the section-list action, reusing those helpers and the existing `UploadService`. The config-modal editors stay self-contained but get the add-button fix, single-image upload, and a `showAdvanced` input for field tiering. A one-off admin script migrates legacy data; its pure transform is unit-tested.

**Tech Stack:** Angular 20 (zoneless, signals), Ionic 8, NgRx Signal Stores, Vitest, Firebase (Firestore + Storage), firebase-admin (migration script), Transloco i18n.

**Source spec:** [`docs/specs/2026-06-25-section-image-handling-design.md`](../specs/2026-06-25-section-image-handling-design.md)

**Design note (deviation from spec):** the spec proposed a single `SectionImageService`. Because the two
entry points live in different layers (UI editors in `cms-section-ui` operate on sub-models like
`ImageConfig[]`; the section list in `cms-section-feature` operates on whole sections), the *shared logic*
is centralised as pure helpers in `cms-section-util`, and `SectionImageService` (in `cms-section-feature`)
orchestrates the section-list path. The modal editors reuse the helpers but keep their own thin upload
call-sites. This keeps layering clean and matches the existing `SectionStore.uploadImage` pattern.

**Conventions to follow throughout:**
- Type-check a lib with `npx tsc --noEmit -p libs/<domain>/<layer>/tsconfig.json` (NEVER omit `--noEmit`).
- Run a lib's unit tests with `pnpm run test <project>` (e.g. `pnpm run test cms-section-util`).
- Icons: always `<ion-icon src="{{ 'name' | svgIcon }}" />`, never the `name` attribute.
- i18n is store-driven: add keys to `libs/cms/section/util/src/lib/section-i18n.ts` AND
  `libs/cms/section/feature/src/i18n/de.json`; resolve via the existing `SectionI18n` signal map.
- Commit after each task with the shown message.

---

## File Structure

**Create:**
- `libs/cms/section/util/src/lib/image-slots.ts` — pure slot model + helpers.
- `libs/cms/section/util/src/lib/image-slots.spec.ts` — unit tests.
- `libs/cms/section/util/src/lib/article-image-migration.util.ts` — pure legacy-data transform.
- `libs/cms/section/util/src/lib/article-image-migration.util.spec.ts` — unit tests.
- `libs/cms/section/feature/src/lib/section-image.service.ts` — orchestrates list-action uploads.
- `scripts/migrate-article-images.ts` — one-off admin migration (firebase-admin).

**Modify:**
- `libs/cms/section/util/src/index.ts` — export the two new util files.
- `libs/cms/section/util/src/lib/section-i18n.ts` — new i18n keys.
- `libs/cms/section/feature/src/i18n/de.json` — German strings for the new keys.
- `libs/cms/section/feature/src/lib/section-list.ts` — add "upload image(s)" action.
- `libs/cms/section/feature/src/lib/section.store.ts` — generalise `uploadImage`; remove read-shim later.
- `libs/cms/section/feature/src/lib/article-section.store.ts` — remove read-time shim (gated task).
- `libs/cms/section/ui/src/lib/images-configuration.ts` — fix add button.
- `libs/cms/section/ui/src/lib/section.form.ts` — `showAdvanced` plumbing + fix hero wiring.
- `libs/cms/section/ui/src/lib/section-configuration.ts` — basic/advanced field tiering + toggle.
- `libs/cms/section/ui/src/lib/image-style-configuration.ts` — basic/advanced field tiering.
- `libs/shared/ui/src/lib/image-config.ts` — single-image upload + overwrite-confirm + tiering.
- `libs/shared/ui/src/lib/editor.ts` — nicer display.

---

## Phase A — Pure helpers (TDD)

### Task A1: Article legacy-data migration transform

**Files:**
- Create: `libs/cms/section/util/src/lib/article-image-migration.util.ts`
- Test: `libs/cms/section/util/src/lib/article-image-migration.util.spec.ts`
- Modify: `libs/cms/section/util/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/cms/section/util/src/lib/article-image-migration.util.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateArticleImageProperties } from './article-image-migration.util';

describe('migrateArticleImageProperties', () => {
  it('moves a legacy single image into images[] and drops the legacy field', () => {
    const result = migrateArticleImageProperties({
      image: { url: 'a.jpg', label: 'A', type: 0, actionUrl: '', altText: 'A', overlay: '' },
      imageStyle: { width: '160' },
    });
    expect(result.changed).toBe(true);
    expect(result.properties.images).toEqual([
      { url: 'a.jpg', label: 'A', type: 0, actionUrl: '', altText: 'A', overlay: '' },
    ]);
    expect('image' in result.properties).toBe(false);
    expect(result.properties.imageStyle).toEqual({ width: '160' });
  });

  it('leaves docs that already have images[] untouched (only drops the stray legacy field)', () => {
    const result = migrateArticleImageProperties({
      images: [{ url: 'b.jpg' }],
      image: { url: 'a.jpg' },
    });
    expect(result.changed).toBe(true);
    expect(result.properties.images).toEqual([{ url: 'b.jpg' }]);
    expect('image' in result.properties).toBe(false);
  });

  it('reports no change when there is no legacy field and images already exist', () => {
    const result = migrateArticleImageProperties({ images: [{ url: 'b.jpg' }] });
    expect(result.changed).toBe(false);
    expect(result.properties.images).toEqual([{ url: 'b.jpg' }]);
  });

  it('reports no change for an empty article config (no image, no images)', () => {
    const result = migrateArticleImageProperties({ imageStyle: {} });
    expect(result.changed).toBe(false);
    expect(result.properties.images).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test cms-section-util`
Expected: FAIL — cannot find module `./article-image-migration.util`.

- [ ] **Step 3: Write minimal implementation**

Create `libs/cms/section/util/src/lib/article-image-migration.util.ts`:

```ts
/**
 * Pure transform that normalises a legacy ArticleConfig `properties` object to the
 * canonical `images: ImageConfig[]` shape. Used by the one-off migration script.
 *
 * Rules:
 *  - If a legacy single `image` exists and `images` is empty/missing, set `images = [image]`.
 *  - Always drop the legacy `image` field if present.
 *  - `changed` is true whenever the output differs from the input (legacy field present
 *    and/or images were populated from it).
 */
export function migrateArticleImageProperties(
  properties: Record<string, unknown>
): { changed: boolean; properties: Record<string, unknown> } {
  const hasLegacy = 'image' in properties && properties['image'] != null;
  const existingImages = properties['images'];
  const hasImages = Array.isArray(existingImages) && existingImages.length > 0;

  if (!hasLegacy && hasImages) return { changed: false, properties };
  if (!hasLegacy && !hasImages) return { changed: false, properties };

  const next: Record<string, unknown> = { ...properties };
  if (!hasImages) {
    next['images'] = [properties['image']];
  }
  delete next['image'];
  return { changed: true, properties: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test cms-section-util`
Expected: PASS (4 new tests).

- [ ] **Step 5: Export the util**

In `libs/cms/section/util/src/index.ts`, add after the `section.util` export:

```ts
export * from './lib/article-image-migration.util';
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/cms/section/util/src/lib/article-image-migration.util.ts libs/cms/section/util/src/lib/article-image-migration.util.spec.ts libs/cms/section/util/src/index.ts
git commit -m "feat(section): pure transform for legacy article image migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task A2: Image-slot helpers

**Files:**
- Create: `libs/cms/section/util/src/lib/image-slots.ts`
- Test: `libs/cms/section/util/src/lib/image-slots.spec.ts`
- Modify: `libs/cms/section/util/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/cms/section/util/src/lib/image-slots.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SectionModel } from '@bk2/shared-models';
import { getSectionImageSlots, sectionSupportsImages, isSlotOccupied, applyImagesToSlot } from './image-slots';

function section(type: string, properties: unknown): SectionModel {
  return { type, properties } as unknown as SectionModel;
}

const img = (url: string) => ({ url, label: url, type: 0, actionUrl: '', altText: '', overlay: '' });

describe('getSectionImageSlots', () => {
  it('returns a single multi-slot for article and slider', () => {
    expect(getSectionImageSlots(section('article', { images: [] }))).toEqual([{ field: 'images', multi: true }]);
    expect(getSectionImageSlots(section('slider', { images: [] }))).toEqual([{ field: 'images', multi: true }]);
  });

  it('returns two single-slots for hero', () => {
    expect(getSectionImageSlots(section('hero', {}))).toEqual([
      { field: 'logo', multi: false },
      { field: 'hero', multi: false },
    ]);
  });

  it('returns no slots for non-image sections', () => {
    expect(getSectionImageSlots(section('map', {}))).toEqual([]);
    expect(getSectionImageSlots(section('button', { imageStyle: {} }))).toEqual([]);
  });
});

describe('sectionSupportsImages', () => {
  it('is true only for article, slider, hero', () => {
    expect(sectionSupportsImages(section('article', {}))).toBe(true);
    expect(sectionSupportsImages(section('hero', {}))).toBe(true);
    expect(sectionSupportsImages(section('map', {}))).toBe(false);
  });
});

describe('isSlotOccupied', () => {
  it('multi slot is occupied when images[] is non-empty', () => {
    expect(isSlotOccupied(section('article', { images: [img('a.jpg')] }), { field: 'images', multi: true })).toBe(true);
    expect(isSlotOccupied(section('article', { images: [] }), { field: 'images', multi: true })).toBe(false);
  });

  it('single slot is occupied when the named image has a url', () => {
    expect(isSlotOccupied(section('hero', { logo: img('l.jpg') }), { field: 'logo', multi: false })).toBe(true);
    expect(isSlotOccupied(section('hero', { logo: { url: '' } }), { field: 'logo', multi: false })).toBe(false);
    expect(isSlotOccupied(section('hero', {}), { field: 'hero', multi: false })).toBe(false);
  });
});

describe('applyImagesToSlot', () => {
  it('appends to a multi slot', () => {
    const next = applyImagesToSlot(section('article', { images: [img('a.jpg')] }), { field: 'images', multi: true }, [img('b.jpg')]);
    expect((next.properties as { images: unknown[] }).images).toEqual([img('a.jpg'), img('b.jpg')]);
  });

  it('replaces a single slot with the first uploaded image', () => {
    const next = applyImagesToSlot(section('hero', { logo: img('old.jpg') }), { field: 'logo', multi: false }, [img('new.jpg')]);
    expect((next.properties as { logo: unknown }).logo).toEqual(img('new.jpg'));
  });

  it('does not mutate the input section', () => {
    const original = section('article', { images: [] });
    applyImagesToSlot(original, { field: 'images', multi: true }, [img('a.jpg')]);
    expect((original.properties as { images: unknown[] }).images).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test cms-section-util`
Expected: FAIL — cannot find module `./image-slots`.

- [ ] **Step 3: Write minimal implementation**

Create `libs/cms/section/util/src/lib/image-slots.ts`:

```ts
import { ImageConfig, SectionModel } from '@bk2/shared-models';

/** An image "slot" on a section: either the multi `images[]` array or a named single image. */
export interface ImageSlot {
  field: 'images' | 'logo' | 'hero';
  multi: boolean;
}

/** Enumerate the image slots a section type supports. Empty array = no image upload. */
export function getSectionImageSlots(section: SectionModel): ImageSlot[] {
  switch (section.type) {
    case 'article':
    case 'slider':
      return [{ field: 'images', multi: true }];
    case 'hero':
      return [
        { field: 'logo', multi: false },
        { field: 'hero', multi: false },
      ];
    default:
      return [];
  }
}

export function sectionSupportsImages(section: SectionModel): boolean {
  return getSectionImageSlots(section).length > 0;
}

/** True when the slot already holds image data (a non-empty array, or a single image with a url). */
export function isSlotOccupied(section: SectionModel, slot: ImageSlot): boolean {
  const props = section.properties as Record<string, unknown>;
  if (slot.multi) {
    const arr = props[slot.field];
    return Array.isArray(arr) && arr.length > 0;
  }
  const single = props[slot.field] as ImageConfig | undefined;
  return !!single?.url;
}

/**
 * Return a new section with the uploaded images applied to the slot.
 * Multi slot → append. Single slot → replace with the first uploaded image.
 * Pure: never mutates the input.
 */
export function applyImagesToSlot(section: SectionModel, slot: ImageSlot, uploaded: ImageConfig[]): SectionModel {
  const props = section.properties as Record<string, unknown>;
  if (slot.multi) {
    const current = Array.isArray(props[slot.field]) ? (props[slot.field] as ImageConfig[]) : [];
    return { ...section, properties: { ...props, [slot.field]: [...current, ...uploaded] } } as SectionModel;
  }
  return { ...section, properties: { ...props, [slot.field]: uploaded[0] } } as SectionModel;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test cms-section-util`
Expected: PASS.

- [ ] **Step 5: Export the util**

In `libs/cms/section/util/src/index.ts`, add:

```ts
export * from './lib/image-slots';
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/cms/section/util/src/lib/image-slots.ts libs/cms/section/util/src/lib/image-slots.spec.ts libs/cms/section/util/src/index.ts
git commit -m "feat(section): image-slot helpers for sections

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase B — i18n keys

### Task B1: Add new i18n keys

**Files:**
- Modify: `libs/cms/section/util/src/lib/section-i18n.ts`
- Modify: `libs/cms/section/feature/src/i18n/de.json`

- [ ] **Step 1: Add keys to the registry**

In `libs/cms/section/util/src/lib/section-i18n.ts`, inside the `SECTION_I18N_KEYS` object, just before the `// image` comment block, add:

```ts
  // image upload / advanced toggle
  form_advanced_label:                      PFX + 'form.advanced.label',
  image_upload_action:                      PFX + 'image.upload.action',
  image_upload_slot_logo:                   PFX + 'image.upload.logo',
  image_upload_slot_hero:                   PFX + 'image.upload.hero',
  image_overwrite_title:                    PFX + 'image.overwrite.title',
  image_overwrite_message:                  PFX + 'image.overwrite.message',
```

- [ ] **Step 2: Add German strings**

In `libs/cms/section/feature/src/i18n/de.json`, add the matching nested keys (under the existing
`form` and `image` objects — match the file's existing structure). The leaf values:

```
form.advanced.label        = "Erweiterte Einstellungen anzeigen"
image.upload.action        = "Bild(er) hochladen"
image.upload.slot.logo     = "Logo hochladen"
image.upload.slot.hero     = "Hintergrundbild hochladen"
image.overwrite.title      = "Bild ersetzen?"
image.overwrite.message    = "Es ist bereits ein Bild vorhanden. Möchten Sie es ersetzen?"
```

Read the current `de.json` first to place these correctly inside the existing `"form": { … }` and
`"image": { … }` objects (do not create duplicate top-level objects).

- [ ] **Step 3: Type-check the util lib**

Run: `npx tsc --noEmit -p libs/cms/section/util/tsconfig.json`
Expected: no errors (the `satisfies Record<string,string>` still holds).

- [ ] **Step 4: Commit**

```bash
git add libs/cms/section/util/src/lib/section-i18n.ts libs/cms/section/feature/src/i18n/de.json
git commit -m "feat(section): i18n keys for image upload + advanced toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase C — Section-list upload action

### Task C1: SectionImageService

**Files:**
- Create: `libs/cms/section/feature/src/lib/section-image.service.ts`

- [ ] **Step 1: Implement the service**

Create `libs/cms/section/feature/src/lib/section-image.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { ActionSheetController, AlertController } from '@ionic/angular/standalone';

import { ImageConfig, ImageType, SectionModel, UserModel } from '@bk2/shared-models';
import { IMAGE_MIMETYPES } from '@bk2/shared-constants';
import { confirm, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { UploadService } from '@bk2/avatar-data-access';
import { applyImagesToSlot, getSectionImageSlots, ImageSlot, isSlotOccupied } from '@bk2/cms-section-util';

export interface SectionImageUploadLabels {
  slotLogo: string;
  slotHero: string;
  overwriteTitle: string;
  overwriteMessage: string;
  ok: string;
  cancel: string;
  uploadTitle: string;
  actionSheetTitle: string;
}

/**
 * Orchestrates image uploads for the section-list quick action:
 * pick a slot (for multi-slot sections there is exactly one), confirm overwrite for an occupied
 * single slot, upload the file(s), create the backing document(s), and return the updated section.
 * Returns undefined when the user cancels at any step (caller then persists nothing).
 */
@Injectable({ providedIn: 'root' })
export class SectionImageService {
  private readonly uploadService = inject(UploadService);
  private readonly alertController = inject(AlertController);
  private readonly actionSheetController = inject(ActionSheetController);

  public async uploadToSection(
    section: SectionModel,
    tenantId: string,
    labels: SectionImageUploadLabels,
    currentUser?: UserModel,
  ): Promise<SectionModel | undefined> {
    const slots = getSectionImageSlots(section);
    if (slots.length === 0) return undefined;

    const slot = slots.length === 1 ? slots[0] : await this.chooseSlot(slots, labels);
    if (!slot) return undefined;

    if (!slot.multi && isSlotOccupied(section, slot)) {
      const ok = await confirm(this.alertController, labels.overwriteMessage, labels.ok, labels.cancel, true);
      if (ok !== true) return undefined;
    }

    const basePath = `tenant/${tenantId}/section/${section.bkey}`;
    const files = slot.multi
      ? await this.uploadService.pickMultipleFiles(IMAGE_MIMETYPES)
      : [await this.uploadService.pickFile(IMAGE_MIMETYPES)].filter((f): f is File => !!f);
    if (!files.length) return undefined;

    const uploads = files.map(f => ({ file: f, fullPath: `${basePath}/${f.name}` }));
    const urls = await this.uploadService.uploadFiles(uploads, labels.uploadTitle);
    if (!urls) return undefined;

    const newImages: ImageConfig[] = files.map(f => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: `${basePath}/${f.name}`,
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    await Promise.all(files.map((f, idx) => {
      const downloadUrl = urls[idx];
      if (!downloadUrl) return Promise.resolve(undefined);
      return this.uploadService.createAndSaveDocument(f, tenantId, `${basePath}/${f.name}`, downloadUrl, currentUser);
    }));

    return applyImagesToSlot(section, slot, newImages);
  }

  private async chooseSlot(slots: ImageSlot[], labels: SectionImageUploadLabels): Promise<ImageSlot | undefined> {
    const options = createActionSheetOptions(labels.actionSheetTitle);
    for (const slot of slots) {
      const label = slot.field === 'logo' ? labels.slotLogo : labels.slotHero;
      options.buttons.push(createActionSheetButton(`slot.${slot.field}`, label, '', 'image'));
    }
    options.buttons.push(createActionSheetButton('cancel', labels.cancel, '', 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action?.startsWith('slot.')) return undefined;
    const field = data.action.slice('slot.'.length);
    return slots.find(s => s.field === field);
  }
}
```

> Note on `createActionSheetButton` signature: verify the argument order against
> `images-configuration.ts:161` (`createActionSheetButton('image.edit', title, imgixBaseUrl, 'edit')`)
> and `section-list.ts:149` (`createActionSheetButton('section.view', title, 'eye-on')`) — they differ
> in arity. Use the 3-arg form `(action, label, icon)` as in `section-list.ts` if the 4-arg form is
> icon-URL-specific; adjust the two `createActionSheetButton` calls above to match the real signature
> (inspect `@bk2/shared-util-angular` `createActionSheetButton`).

- [ ] **Step 2: Type-check the feature lib**

Run: `npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json`
Expected: no errors. If `createActionSheetButton` arity mismatches, fix the two calls per the note.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/section-image.service.ts
git commit -m "feat(section): SectionImageService for list-action uploads

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task C2: Wire the "upload image(s)" action into the section list

**Files:**
- Modify: `libs/cms/section/feature/src/lib/section-list.ts`

- [ ] **Step 1: Import helpers + service**

In `libs/cms/section/feature/src/lib/section-list.ts`, update imports:

```ts
import { Component, computed, inject, linkedSignal } from '@angular/core';
// ...existing imports...
import { sectionSupportsImages } from '@bk2/cms-section-util';
import { SectionImageService, SectionImageUploadLabels } from './section-image.service';
```

- [ ] **Step 2: Inject the service**

Add a field next to `actionSheetController`:

```ts
  private sectionImageService = inject(SectionImageService);
```

- [ ] **Step 3: Add the action button (only for image-bearing sections, contentAdmin only)**

In `addActionSheetButtons`, after the `section.edit` button block (inside the `if (!this.readOnly())`), add:

```ts
      if (sectionSupportsImages(section)) {
        actionSheetOptions.buttons.push(createActionSheetButton('section.upload', this.store.i18n.image_upload_action(), 'cloud-upload'));
      }
```

> Verify `'cloud-upload'` resolves via the icon repository; if not, reuse an icon already used in this
> file/repo (e.g. `'add-circle'`). Icons are DB-backed — see the `icons` skill.

- [ ] **Step 4: Handle the action**

In `executeActions`, add a case to the `switch (data.action)`:

```ts
        case 'section.upload':
          await this.uploadImages(section);
          break;
```

- [ ] **Step 5: Implement the handler**

Add a method to `SectionAllList`:

```ts
  private async uploadImages(section: SectionModel): Promise<void> {
    const labels: SectionImageUploadLabels = {
      slotLogo: this.store.i18n.image_upload_slot_logo(),
      slotHero: this.store.i18n.image_upload_slot_hero(),
      overwriteTitle: this.store.i18n.image_overwrite_title(),
      overwriteMessage: this.store.i18n.image_overwrite_message(),
      ok: this.store.i18n.ok(),
      cancel: this.store.i18n.cancel(),
      uploadTitle: this.store.i18n.image_upload(),
      actionSheetTitle: this.store.i18n.as_title(),
    };
    const updated = await this.sectionImageService.uploadToSection(section, this.store.tenantId(), labels, this.currentUser());
    if (updated) {
      await this.store.save(updated);
    }
  }
```

- [ ] **Step 6: Add a `save` method to SectionStore**

In `libs/cms/section/feature/src/lib/section.store.ts`, add inside `withMethods`, after `delete`:

```ts
      async save(section: SectionModel): Promise<void> {
        store.clearError();
        try {
          await store.sectionService.update(section, store.currentUser());
          this.reload();
        } catch (error) {
          store.setError(store.i18n.error_save());
          throw error;
        }
      },
```

- [ ] **Step 7: Type-check both libs**

Run: `npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add libs/cms/section/feature/src/lib/section-list.ts libs/cms/section/feature/src/lib/section.store.ts
git commit -m "feat(section): upload image(s) action in the section list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase D — Fix the broken add-image button

### Task D1: Switch the multi-image editor to the Safari-safe picker

**Files:**
- Modify: `libs/cms/section/ui/src/lib/images-configuration.ts`

- [ ] **Step 1: Replace the label + hidden input with a button**

In the template, replace the `<label>…</label>` block (lines ~52-58) with:

```html
              <ion-button (click)="addImages()">
                <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
              </ion-button>
```

- [ ] **Step 2: Replace `onFilesSelected` with `addImages`**

Replace the `onFilesSelected(event: Event)` method with a picker-driven version:

```ts
  protected async addImages(): Promise<void> {
    if (this.readOnly()) return;
    const files = await this.uploadService.pickMultipleFiles(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (!files.length) return;

    const basePath = this.storagePath();
    const uploads: UploadEntry[] = files.map(f => ({ file: f, fullPath: `${basePath}/${f.name}` }));

    const urls = await this.uploadService.uploadFiles(uploads, this.i18n().image_upload() ?? '');
    if (!urls) return;

    const newImages: ImageConfig[] = files.map(f => ({
      label: f.name.replace(/\.[^.]+$/, ''),
      type: ImageType.Image,
      url: `${basePath}/${f.name}`,
      actionUrl: '',
      altText: f.name.replace(/\.[^.]+$/, ''),
      overlay: '',
    }));

    await Promise.all(files.map((f, idx) => {
      const downloadUrl = urls[idx];
      if (!downloadUrl) return Promise.resolve();
      return this.uploadService.createAndSaveDocument(f, this.env.tenantId, `${basePath}/${f.name}`, downloadUrl, this.currentUser());
    }));

    this.images.update(imgs => [...imgs, ...newImages]);
  }
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the app (`pnpm nx serve scs-app`), open an article or slider section in edit mode, click the
`+` button in the Images card. Expected: the OS file picker opens and selected images appear in the
list with thumbnails.

- [ ] **Step 5: Commit**

```bash
git add libs/cms/section/ui/src/lib/images-configuration.ts
git commit -m "fix(section): add-image button now opens the file picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase E — Single-image upload + overwrite-confirm + hero wiring

### Task E1: Add upload to the single-image editor

**Files:**
- Modify: `libs/shared/ui/src/lib/image-config.ts`

- [ ] **Step 1: Extend imports + inputs + injections**

In `libs/shared/ui/src/lib/image-config.ts`, update the top imports and the class:

```ts
import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';
import { AlertController, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone';

import { ImageConfig, ImageType } from '@bk2/shared-models';
import { ImageTypes } from '@bk2/shared-categories';
import { UploadService } from '@bk2/avatar-data-access';
import { confirm } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { CategoryOld } from './category-old';
import { TextInput, TextInputI18n } from './text-input';
```

> If `@bk2/shared-ui` may not depend on `@bk2/avatar-data-access` (circular-dependency risk — verify
> with `pnpm nx graph` / the lib's `tsconfig.json` references), inject `UploadService` is still fine at
> runtime because it is `providedIn: 'root'`, but the import must not create a build cycle. If it does,
> move this single-image upload into a thin wrapper in `cms-section-ui` instead and keep `bk-image-config`
> upload-free. Decide before implementing.

Add to the `@Component` `imports` array: `IonButton, IonButtons, IonIcon, SvgIconPipe`.

Add to the class body (inputs + injected services):

```ts
  // upload support (optional — when storagePath is set, an upload button is shown)
  public storagePath = input<string>();
  public overwriteI18n = input<{ message: string; ok: string; cancel: string }>();
  private readonly uploadService = inject(UploadService);
  private readonly alertController = inject(AlertController);
```

- [ ] **Step 2: Add the upload button to the card header**

Replace the `<ion-card-header>` block with one that shows an upload button when `storagePath()` is set
and not read-only:

```html
      <ion-card-header>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <ion-card-title>{{ i18n().image_edit() }}</ion-card-title>
          @if(!readOnly() && storagePath()) {
            <ion-buttons>
              <ion-button (click)="upload()">
                <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          }
        </div>
      </ion-card-header>
```

- [ ] **Step 3: Implement `upload()` with overwrite-confirm**

Add to the class:

```ts
  protected async upload(): Promise<void> {
    const basePath = this.storagePath();
    if (!basePath || this.readOnly()) return;

    if (this.url()) {
      const labels = this.overwriteI18n();
      if (labels) {
        const ok = await confirm(this.alertController, labels.message, labels.ok, labels.cancel, true);
        if (ok !== true) return;
      }
    }

    const file = await this.uploadService.pickFile(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
    if (!file) return;

    const fullPath = `${basePath}/${file.name}`;
    const downloadUrl = await this.uploadService.uploadFile(file, fullPath, this.i18n().image_edit() ?? '');
    if (!downloadUrl) return;

    this.url.set(fullPath);
    this.formData.update(vm => ({ ...vm, url: fullPath, label: file.name.replace(/\.[^.]+$/, ''), type: ImageType.Image }));
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p libs/shared/ui/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/ui/src/lib/image-config.ts
git commit -m "feat(ui): single-image editor gains upload with overwrite confirm

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task E2: Fix the mis-wired hero editor + pass storagePath/overwrite

**Files:**
- Modify: `libs/cms/section/ui/src/lib/section.form.ts`

- [ ] **Step 1: Fix the hero bindings**

In the `@case('hero')` block (lines ~177-200), change the two `bk-image-config` bindings to use the
correct per-slot change handlers and pass upload context:

```html
        @case('hero') {
          @if(logoConfig(); as logoConfig) {
            <bk-image-config
              [formData]="logoConfig" (formDataChange)="onLogoConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="imageConfigI18n()"
              [storagePath]="storagePath()"
              [overwriteI18n]="overwriteI18n()"
            />
          }
          @if(heroConfig(); as heroConfig) {
            <bk-image-config
              [formData]="heroConfig" (formDataChange)="onHeroConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="imageConfigI18n()"
              [storagePath]="storagePath()"
              [overwriteI18n]="overwriteI18n()"
            />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style
              [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [showAdvanced]="showAdvanced()"
            />
          }
        }
```

- [ ] **Step 2: Remove the dead `onImageConfigChange`**

Delete the `onImageConfigChange(image: ImageConfig)` method (lines ~659-667) — it wrote `properties.image`
on an article and is no longer referenced. `onLogoConfigChange` / `onHeroConfigChange` already exist.

- [ ] **Step 3: Add the `overwriteI18n` computed**

Add near `imageConfigI18n`:

```ts
  protected overwriteI18n = computed(() => ({
    message: this.i18n().image_overwrite_message(),
    ok: this.i18n().ok(),
    cancel: this.i18n().cancel(),
  }));
```

> This relies on `image_overwrite_message`, `ok`, `cancel` existing in `SectionI18n` (Task B1 + existing).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json`
Expected: errors only about the not-yet-added `showAdvanced()` signal — that is added in Phase F. If you
implement Phase F together, expect zero errors; otherwise temporarily bind `[showAdvanced]="false"` and
revisit in F. Prefer doing Task E2 and Task F1 in the same session.

- [ ] **Step 5: Commit**

```bash
git add libs/cms/section/ui/src/lib/section.form.ts
git commit -m "fix(section): wire hero logo/hero editors correctly + upload context

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase F — Global "show advanced" toggle + field tiering

### Task F1: Add the toggle to SectionForm and plumb it down

**Files:**
- Modify: `libs/cms/section/ui/src/lib/section.form.ts`

- [ ] **Step 1: Add IonToggle/IonItem/IonLabel imports + a signal**

Add to the component `imports`: `IonItem, IonLabel, IonToggle` (import from
`@ionic/angular/standalone`). Add the import line at the top:

```ts
import { IonItem, IonLabel, IonToggle } from '@ionic/angular/standalone';
```

Add a signal field to the class (near the other protected signals):

```ts
  protected showAdvanced = signal(false);
```

and add `signal` to the `@angular/core` import.

- [ ] **Step 2: Render the toggle above `bk-section-config`**

Inside `@if (showForm()) {`, immediately before `<bk-section-config …>`, add:

```html
      <ion-item lines="none">
        <ion-toggle [checked]="showAdvanced()" (ionChange)="showAdvanced.set($event.detail.checked)" [disabled]="isReadOnly()">
          {{ i18n().form_advanced_label() }}
        </ion-toggle>
      </ion-item>
```

- [ ] **Step 3: Pass `showAdvanced` to the tiered sub-editors**

Add `[showAdvanced]="showAdvanced()"` to:
- `<bk-section-config …>` (the top one)
- every `<bk-image-style …>` instance (article, button, hero, slider)
- every `<bk-image-config …>` instance (hero logo + hero) — add `[showAdvanced]="showAdvanced()"`.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json`
Expected: errors only about `showAdvanced` input missing on the child components — added in F2/F3/F4.
Implement F2–F4 before re-checking.

- [ ] **Step 5: Commit (after F2–F4 type-check clean)**

Defer commit until F2–F4 done so the lib type-checks. Then:

```bash
git add libs/cms/section/ui/src/lib/section.form.ts
git commit -m "feat(section): global show-advanced toggle in the section form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task F2: Tier the section base fields

**Files:**
- Modify: `libs/cms/section/ui/src/lib/section-configuration.ts`

Basic (always): Title, Subtitle, Required role, State. Advanced: Color, Internal name, Index/order,
Column size, Archived. (Color/Index/Archived are not currently rendered here; only add a field if it
already exists in the template — for fields not yet present, simply gate the ones that exist: Internal
`name` and `colSize` move under advanced; `title`, `subTitle`, role, state stay basic.)

- [ ] **Step 1: Add the `showAdvanced` input**

```ts
  public readonly showAdvanced = input(false);
```

- [ ] **Step 2: Gate the advanced fields**

Wrap the `name` col (lines 44-46) and the `colSize` col (lines 53-55) in `@if(showAdvanced()) { … }`.
The `title`, `subTitle`, role and state cols stay always-visible. Example for the name col:

```html
          @if(showAdvanced()) {
            <ion-col size="12">
              <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="isReadOnly()" />
            </ion-col>
          }
```

> Color, Index/order, Archived are not in this component's template today; no action for them unless you
> are also adding them. Keep scope to gating existing fields.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json`

---

### Task F3: Tier the image-style fields

**Files:**
- Modify: `libs/cms/section/ui/src/lib/image-style-configuration.ts`

Basic: width, height, fill. Advanced: imgIxParams, sizes, border, borderRadius, isThumbnail, slot,
hasPriority, action (imageAction), zoomFactor.

- [ ] **Step 1: Add the input**

```ts
  public readonly showAdvanced = input(false);
```

- [ ] **Step 2: Gate advanced cols**

Keep the `width` col (68-70), `height` col (71-73) and `fill` col (89-91) always visible. Wrap the
remaining cols — imgIxParams (65-67), sizes (74-76), border (77-79), borderRadius (80-82),
isThumbnail (83-85), slot (86-88), hasPriority (92-94), imageAction (95-97), zoomFactor (98-100) — in a
single `@if(showAdvanced()) { … }` (you may group contiguous cols under one block; the `fill` col sits
between them, so use two `@if` blocks or move the `fill` col up next to width/height first, then one
advanced block). Recommended: reorder so width, height, fill come first, then one `@if(showAdvanced())`
wrapping all the rest.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json`

---

### Task F4: Tier the single-image (ImageConfig) fields

**Files:**
- Modify: `libs/shared/ui/src/lib/image-config.ts`

Basic: url, altText. Advanced: label, type, actionUrl, overlay.

- [ ] **Step 1: Add the input**

```ts
  public readonly showAdvanced = input(false);
```

- [ ] **Step 2: Gate advanced cols**

Keep the `url` col (60-62) and `altText` col (66-68) always visible. Wrap `label` (54-56),
`type` (57-59), `actionUrl` (63-65) and `overlay` (69-71) cols in `@if(showAdvanced()) { … }`. (Reorder
so url + altText render first if you prefer them at the top.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/shared/ui/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit F1–F4 together**

```bash
git add libs/cms/section/ui/src/lib/section.form.ts libs/cms/section/ui/src/lib/section-configuration.ts libs/cms/section/ui/src/lib/image-style-configuration.ts libs/shared/ui/src/lib/image-config.ts
git commit -m "feat(section): basic/advanced field tiering driven by global toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual verification**

Serve the app, open any section in edit mode. Expected: with the toggle OFF the form shows only the
basic fields; turning it ON reveals the advanced fields in the section header, image-style and
single-image editors.

---

## Phase G — Nicer rich-text editor

### Task G1: Polish the editor display

**Files:**
- Modify: `libs/shared/ui/src/lib/editor.ts`

- [ ] **Step 1: Replace the `styles` block**

Replace the existing `styles: [...]` array with a card-wrapped, padded, focus-ring styling:

```ts
  styles: [`
    .editor {
      border: 1px solid var(--ion-color-step-200, #ccc);
      border-radius: 8px;
      overflow: hidden;
      background: var(--ion-background-color, #fff);
    }
    .editor:focus-within { border-color: var(--ion-color-primary, #3880ff); }
    ::ng-deep .NgxEditor__MenuBar {
      border-bottom: 1px solid var(--ion-color-step-150, #e0e0e0);
      background: var(--ion-color-step-50, #f7f7f7);
    }
    ::ng-deep {
      .NgxEditor {
        border: none !important; padding: 12px; min-height: 120px;
        @media (prefers-color-scheme: dark) { background-color: #2a2a2a !important; color: #fff !important; }
      }
    }
    .content {
      -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; user-select: text;
      h1 { line-height: 80px; color: #25265e;}
      h2, h3 { color: #25265e; margin-bottom: 12px; }
      p { margin-bottom: 24px; line-height: 24px; }
      ul { list-style-position: inside; padding-left: 20px; margin-bottom: 12px;}
    }
  `],
```

- [ ] **Step 2: Soften the clear/copy buttons**

In the template, change the two `<ion-button fill="outline" …>` to `fill="clear" size="small"` and keep
the rest as-is.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/shared/ui/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Serve the app, edit an article section. Expected: the editor is wrapped in a rounded bordered card with
a shaded toolbar strip, a comfortable min-height, focus highlights the border, and the clear/copy
buttons are subtle.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/ui/src/lib/editor.ts
git commit -m "feat(ui): nicer rich-text editor display (card, toolbar strip, focus ring)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase H — Migration script + read-shim removal (gated)

### Task H1: One-off migration script

**Files:**
- Create: `scripts/migrate-article-images.ts`

- [ ] **Step 1: Write the script**

Create `scripts/migrate-article-images.ts`. It reuses the tested transform from Task A1 via a relative
import (the function is pure; its only imports are type-only and erased at runtime):

```ts
/**
 * One-off migration: normalise legacy ArticleConfig `properties.image` (single) into
 * `properties.images` (array) and drop the legacy field for all `type === 'article'` sections.
 *
 * Usage (dry run, default):   ts-node scripts/migrate-article-images.ts
 *        (apply):             ts-node scripts/migrate-article-images.ts --apply
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS to point at a service-account key for the project.
 */
import { cert, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { migrateArticleImageProperties } from '../libs/cms/section/util/src/lib/article-image-migration.util';

const APPLY = process.argv.includes('--apply');

async function main() {
  initializeApp({ credential: applicationDefault() });
  const db = getFirestore();
  const snap = await db.collection('sections').where('type', '==', 'article').get();

  let inspected = 0, migrated = 0, skipped = 0;
  for (const doc of snap.docs) {
    inspected++;
    const data = doc.data();
    const props = (data['properties'] ?? {}) as Record<string, unknown>;
    const { changed, properties } = migrateArticleImageProperties(props);
    if (!changed) { skipped++; continue; }
    migrated++;
    console.log(`${APPLY ? 'MIGRATE' : 'DRY-RUN'} ${doc.id}`);
    if (APPLY) {
      await doc.ref.update({ properties });
    }
  }
  console.log(`\nDone. inspected=${inspected} migrated=${migrated} skipped=${skipped} ${APPLY ? '(applied)' : '(dry run — pass --apply to write)'}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

> `cert`/`initializeApp` import variant: match how other repo scripts initialise firebase-admin
> (check `set-env.js` and any existing `scripts/*.ts`). Use `applicationDefault()` with
> `GOOGLE_APPLICATION_CREDENTIALS`, or a service-account JSON via `cert(...)`, whichever the project uses.

- [ ] **Step 2: Type-check the script**

Run: `npx tsc --noEmit scripts/migrate-article-images.ts`
Expected: no type errors (firebase-admin is already a dependency of `apps/functions`; if it is not
resolvable from the repo root, run the script from `apps/functions` or add the relative path to
firebase-admin — verify and adjust).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-article-images.ts
git commit -m "chore(section): one-off article image migration script

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: MANUAL CHECKPOINT — Bruno runs the migration**

This step is performed by the maintainer, not the agent:
1. `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`
2. Dry run: `ts-node scripts/migrate-article-images.ts` — review the list and counts.
3. Apply: `ts-node scripts/migrate-article-images.ts --apply`.
4. Spot-check a few article sections in Firestore: `properties.images` is populated and
   `properties.image` is gone.

Do not proceed to Task H2 until this is confirmed done in production.

---

### Task H2: Remove the read-time shim (ONLY after H1 step 4 is confirmed)

**Files:**
- Modify: `libs/cms/section/feature/src/lib/article-section.store.ts`

- [ ] **Step 1: Simplify the `images` computed**

Replace the backward-compat `images` computed (lines 37-44) with:

```ts
      images: computed((): ImageConfig[] => store.config()?.images ?? []),
```

- [ ] **Step 2: Keep or simplify the single-`image` computed**

The second `withComputed` `image` computed (lines 49-54) can stay (it derives from `images`), so no
change is required. Leave it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Verify the app still renders legacy-migrated articles**

Serve the app, open a previously-legacy article — its image still shows (now sourced from `images[]`).

- [ ] **Step 5: Commit**

```bash
git add libs/cms/section/feature/src/lib/article-section.store.ts
git commit -m "refactor(section): drop legacy single-image read shim after migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase I — Final verification

### Task I1: Full type-check, lint, and tests of touched libs

- [ ] **Step 1: Unit tests**

Run: `pnpm run test cms-section-util`
Expected: PASS (including the new `image-slots` and `article-image-migration` specs).

- [ ] **Step 2: Type-check all touched libs**

Run each:
```bash
npx tsc --noEmit -p libs/cms/section/util/tsconfig.json
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
npx tsc --noEmit -p libs/shared/ui/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Lint (per-project to avoid the nx OOM — see the `eslint` skill)**

Run:
```bash
pnpm nx lint cms-section-util
pnpm nx lint cms-section-feature
pnpm nx lint cms-section-ui
pnpm nx lint shared-ui
```
Expected: no new errors.

- [ ] **Step 4: Manual smoke test of all entry points**

Serve the app and verify:
1. Article: add multiple images via the `+` button; toggle advanced shows label/type/actionUrl/overlay.
2. Slider: add images via the `+` button.
3. Hero: upload a logo and a hero image; uploading over an existing one prompts the overwrite confirm.
4. Section list: the "Bild(er) hochladen" action appears for article/slider/hero only; hero prompts the
   logo/hero slot choice; multi sections append.
5. Advanced toggle hides/shows the advanced fields across section header, image-style, single-image.
6. Editor looks polished.

---

## Self-Review notes (for the implementer)

- **Spec coverage:** (1) consistency → Phase A2 slot convention; (2) migration → A1+H1+H2; (3) upload
  from config + list → D1, E1, C1, C2; (4) overwrite confirm → C1, E1; (5) broken add button + hero
  wiring → D1, E2; (6) nicer editor → G1; (7) simplified form + global toggle → F1–F4. All covered.
- **Verify-before-implement flags** are inlined as `>` notes: `createActionSheetButton` arity, the
  `shared-ui → avatar-data-access` dependency direction, icon-name validity, and firebase-admin init
  style. Resolve each by inspection before coding that step.
- **Ordering caveat:** Phase E2 and Phase F1 both edit `section.form.ts` and depend on each other for a
  clean type-check; do them in one session. H2 is strictly gated on the manual migration run (H1 step 4).

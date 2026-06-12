# trip-edit.form Signal Forms Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `trip-edit.form.ts` from `ngx-vest-forms` to Angular Signal Forms, reusing the existing `tripValidationSuite` unchanged.

**Architecture:** Create a shared `validateVestTree` bridge in `shared-util-angular` that wraps the Vest suite result in Angular Signal Forms' `validateTree` callback; then replace the vest-forms directive on the form with the Signal Forms `form()` FieldTree; custom sub-components (`NotesInput`, `NumberInput`, `Avatars`) keep their `(valueChange)` event outputs unchanged since they don't need `[formField]` bindings.

**Tech Stack:** Angular 21.2.9 `@angular/forms/signals` (`validateTree`, `form`, `FormField`), Vest `staticSuite`, NgRx Signal Store, Ionic Angular.

---

## API Reality Check (Angular 21.2.9)

The spec was written before the API was fully stable. Verified facts for the installed version:

| Spec says | Angular 21.2.9 reality |
|-----------|----------------------|
| `ctx.field` | `ctx.fieldTree` |
| `field: ref` in error | `fieldTree: ref` in error |
| `ValidationError.WithOptionalField` | `ValidationError.WithOptionalFieldTree` (former is a deprecated alias) |
| `[field]="form.x"` template directive | `[formField]="form.x"` (directive selector is `[formField]`) |

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `libs/shared/util-angular/src/lib/vest-bridge.ts` | **Create** | Shared `validateVestTree` bridge function |
| `libs/shared/util-angular/src/index.ts` | **Modify** | Export `validateVestTree` |
| `libs/shared/util-angular/package.json` | **Modify** | Add `@angular/forms` dependency |
| `libs/geo/trip/ui/src/lib/trip-edit.form.ts` | **Modify** | Replace vest-forms wiring with Signal Forms |
| `libs/geo/trip/ui/package.json` | **Modify** | Remove `ngx-vest-forms` dep (if only user), add `@angular/forms` |

---

## Task 1: Create vest-bridge utility

**Files:**
- Create: `libs/shared/util-angular/src/lib/vest-bridge.ts`

- [ ] **Step 1: Add `@angular/forms` to shared-util-angular package.json**

Edit `libs/shared/util-angular/package.json` — add to `dependencies`:
```json
{
  "name": "@bk2/shared-util-angular",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@angular/forms": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

- [ ] **Step 2: Create vest-bridge.ts**

Create `libs/shared/util-angular/src/lib/vest-bridge.ts`:
```ts
import { FieldTree, TreeValidationResult, validateTree } from '@angular/forms/signals';
import type { StaticSuite } from 'vest';

function resolveFieldTree(root: FieldTree<any>, key: string): FieldTree<unknown> | undefined {
  if (!key) return root;
  return key
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((node: any, segment) => (node == null ? node : node[segment]), root) as FieldTree<unknown> | undefined;
}

export function validateVestTree<T>(
  path: any,
  suite: StaticSuite<(model: T, field?: string) => void>,
): void {
  validateTree(path, (ctx): TreeValidationResult => {
    const result = suite(ctx.value() as T);
    const fieldErrors = result.getErrors();
    const errors: { kind: string; message: string; fieldTree: FieldTree<unknown> }[] = [];

    for (const [key, messages] of Object.entries(fieldErrors)) {
      const fieldTree = resolveFieldTree(ctx.fieldTree, key);
      if (!fieldTree) continue;
      for (const message of messages) {
        errors.push({ kind: `vest.${key}`, message, fieldTree });
      }
    }

    return errors.length ? errors : undefined;
  });
}
```

- [ ] **Step 3: Export from barrel**

In `libs/shared/util-angular/src/index.ts`, add at the end:
```ts
export * from './lib/vest-bridge';
```

- [ ] **Step 4: Type-check shared-util-angular**

```bash
npx tsc --noEmit -p libs/shared/util-angular/tsconfig.json
```

Expected: no errors. If `vest` types are missing, add `"vest": "*"` to the package.json dependencies.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/util-angular/src/lib/vest-bridge.ts libs/shared/util-angular/src/index.ts libs/shared/util-angular/package.json
git commit -m "feat(shared-util-angular): add validateVestTree bridge for Angular Signal Forms"
```

---

## Task 2: Migrate trip-edit.form.ts

**Files:**
- Modify: `libs/geo/trip/ui/src/lib/trip-edit.form.ts`
- Modify: `libs/geo/trip/ui/package.json`

- [ ] **Step 1: Update trip-ui package.json**

Edit `libs/geo/trip/ui/package.json` — add `@angular/forms` and `@bk2/shared-util-angular` if not present:
```json
{
  "name": "@bk2/trip-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@angular/forms": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/trip-util": "*"
  }
}
```

(Note: `@bk2/shared-util-angular` was already present; `@angular/forms` is new.)

- [ ] **Step 2: Replace trip-edit.form.ts**

Replace the entire file content of `libs/geo/trip/ui/src/lib/trip-edit.form.ts`:

```ts
import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonChip, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryItemModel, CategoryListModel, LocationModel, ResourceModel, RoleName, TripModel, UserModel } from '@bk2/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n } from '@bk2/shared-ui';
import { debugFormModel, getDurationLabel, hasRole } from '@bk2/shared-util-core';
import { validateVestTree } from '@bk2/shared-util-angular';
import { DEFAULT_NOTES } from '@bk2/shared-constants';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { Avatars } from '@bk2/avatar-ui';
import { formatTripTime, TripI18n, tripValidationSuite } from '@bk2/trip-util';


@Component({
  selector: 'bk-trip-edit-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonLabel, IonGrid, IonRow, IonCol, IonIcon, IonChip, IonCard, IonCardContent, IonButton,
    NotesInput, Avatars, NumberInput
  ],
  styles: [`ion-thumbnail { width: 30px; height: 30px; }`],
  template: `
    <form novalidate>

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().date() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ duration() }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- boat -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().boat() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().resource; as boat) {
                    <ion-icon slot="start" src="{{ getIcon(boat) | svgIcon }}" />
                    <ion-label>{{ boat.name2 }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearBoat()" />
                  } @else {
                    <ion-button (click)="boatSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'boat' | svgIcon }}" />
                      {{ i18n().select_boat_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- location -->
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().location() }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-item lines="none">
                  @if(formData().locations.length > 0) {
                    <ion-label>{{ formData().locations[0]?.name2 }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                  } @else if(formData().customLocationLabel) {
                    <ion-label>{{ formData().customLocationLabel }}</ion-label>
                    <ion-icon slot="end" src="{{'cancel-circle' | svgIcon }}" (click)="clearLocation()" />
                  } @else {
                    <ion-button (click)="locationSelectClicked.emit()">
                      <ion-icon slot="start" src="{{'location' | svgIcon }}" />
                      {{ i18n().select_location_add() }}
                    </ion-button>
                  }
                </ion-item>
              </ion-col>
            </ion-row>

            <!-- distance -->
            @if(formData().locations.length > 0 || formData().customLocationLabel) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-number-input [i18n]="distanceI18n()" [value]="distance()" (valueChange)="onFieldChange('distance', $event)" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    @if (formData().distance === 0) {
                      <ion-chip color="warning">{{ i18n().warning_distance_zero() }}</ion-chip>
                    }
                    @if (formData().distance > 50) {
                      <ion-chip color="warning">{{ i18n().warning_distance_high() }}</ion-chip>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- participants -->
      @if(currentUser(); as currentUser) {
        <bk-avatars (selectClicked)="personSelectClicked.emit()"
          [avatars]="participants()"
          (avatarsChange)="onFieldChange('participants', $event)"
          [readOnly]="false"
          [currentUser]="currentUser"
          [title]="i18n().select_participant_title()"
        />
      }

    @if(hasRole('admin')) {
      <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="false" />
    }
  `,
})
export class TripEditForm {
  // inputs
  public readonly i18n = input.required<TripI18n>();
  public readonly formData = model.required<TripModel>();
  protected readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();
  public readonly boats = input.required<ResourceModel[]>();
  public readonly locations = input.required<LocationModel[]>();
  public readonly category = input.required<CategoryListModel>();

  // outputs
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public personSelectClicked = output<void>();
  public boatSelectClicked = output<void>();
  public locationSelectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly tripForm = form(this.formData, (path) =>
    validateVestTree(path, tripValidationSuite),
  );

  constructor() {
    effect(() => this.valid.emit(this.tripForm().valid()));
  }

  // derived
  protected duration = computed(() =>
    getDurationLabel(this.formData().startDate, this.formData().startTime, this.formData().endTime)
  );
  protected selectedLocationKey = computed(() => this.formData().locations?.[0] ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected participants = linkedSignal(() => this.formData()?.participants ?? []);
  protected distance = computed(() => this.formData().distance ?? 0);

  protected distanceI18n = computed(() => ({
    name: 'distance',
    label: this.i18n().distance_label(),
    placeholder: this.i18n().distance_placeholder(),
    helper: this.i18n().distance_helper()
  } as NumberInputI18n));

  // constants
  protected formatTime = formatTripTime;

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean | AvatarInfo | AvatarInfo[] | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormModel<TripModel>('TripEditForm', this.formData(), this.currentUser());
  }

  protected clearBoat(): void {
    this.onFieldChange('resource', undefined);
  }

  protected clearLocation(): void {
    this.onFieldChange('locations', []);
    this.onFieldChange('customLocationLabel', '');
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  protected getIcon(boat: AvatarInfo): string {
    const itemName = boat.type === 'rboat' ? boat.subType : boat.type;
    return this.getCategoryItem(this.category(), itemName)?.icon ?? '';
  }

  getCategoryItem(cat: CategoryListModel, itemName?: string): CategoryItemModel | undefined {
    return cat ? cat.items.find(i => i.name === itemName) : undefined;
  }
}
```

Key changes from original:
- Removed `vestForms` import and `scVestForm` directive
- Added `form` from `@angular/forms/signals`
- Added `validateVestTree` from `@bk2/shared-util-angular`
- Added `protected readonly tripForm = form(this.formData, ...)`
- Replaced effect `valid.emit(!validationResult().hasErrors())` with `valid.emit(this.tripForm().valid())`
- Removed `suite`, `validationResult`, `onFormChange`
- Removed `debugFormErrors` import (no longer needed)
- Template: removed `scVestForm`, `[formValue]`, `[suite]`, `(dirtyChange)`, `(formValueChange)` — replaced `<form>` with `<form novalidate>`

- [ ] **Step 3: Type-check trip-ui**

```bash
npx tsc --noEmit -p libs/geo/trip/ui/tsconfig.json
```

Expected: no errors. Common issues:
- If `vest` `StaticSuite` type is not found in `vest-bridge.ts`, it's a `vest` package types issue — check `node_modules/vest/types`.
- If `form()` parameter type mismatch, check that `ModelSignal<TripModel>` satisfies `WritableSignal<TripModel>` — it should in Angular 21.

- [ ] **Step 4: Commit**

```bash
git add libs/geo/trip/ui/src/lib/trip-edit.form.ts libs/geo/trip/ui/package.json
git commit -m "feat(trip-ui): migrate trip-edit.form to Angular Signal Forms"
```

---

## Self-Review Against Spec (§13 Definition of Done)

| Criterion | Status |
|-----------|--------|
| Suite file unchanged (`trip.validations.ts`) | ✅ Not touched |
| Component uses `model` signal + `form(model, validateVestTree(...))` | ✅ Yes |
| Template uses old directives removed | ✅ `scVestForm`, `[formValue]`, `[suite]`, `(dirtyChange)`, `(formValueChange)` all removed |
| `validationConfig` and `formValueChange` wiring deleted | ✅ `onFormChange` removed; no `validationConfig` existed |
| State classes: not applicable | ✅ No `ng-*` class styling present |
| Submission via `submit()`: not applicable | ✅ This form emits outputs; parent handles save — no `<form (ngSubmit)>` needed |
| Parity tests: suite tests unchanged | ✅ `trip.validations.ts` unchanged |
| Async/array/warn: N/A | ✅ Suite is synchronous, no `warn()`, no form arrays |

**Note on `[formField]` binding:** The spec migration table shows `[field]="form.x"` for ngModel replacements, but this form has NO `[ngModel]` bindings — all sub-component values flow through `(valueChange)` outputs. No `[formField]` bindings are needed; the bridge works at the model level via `form(this.formData, ...)`.

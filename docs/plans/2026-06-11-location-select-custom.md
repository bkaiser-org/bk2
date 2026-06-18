# LocationSelect – Custom Route (Freitext-Strecke) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `LocationSelectModal` with an opt-in free-text ("custom") route entry that appears as the first result when the user types ≥4 characters and no exact match exists, and return a discriminated `LocationSelectResult` to callers.

**Architecture:** Add `allowCustom: boolean` state to `LocationSelectStore` with two derived computed signals (`hasExactMatch`, `showCustomEntry`) and a `selectCustom()` method on the modal. The new `LocationSelectResult` discriminated union type replaces the bare `LocationModel` return. `ModelSelectService` gets a new `selectLocationResult()` method (opens modal with `allowCustom: true`), used by the trip flow; the existing `selectLocation()` is updated to handle the new return type while keeping its `LocationModel | undefined` signature. The trip-edit modal branches on `kind` to populate `locations` (predefined) or `customLocationLabel` (custom).

**Tech Stack:** Angular 20 signals, NgRx Signal Stores (`@ngrx/signals`), Ionic Angular standalone, Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `libs/shared/feature/src/lib/select-i18n.ts` |
| Modify | `libs/shared/feature/src/i18n/de.json` |
| Modify | `libs/shared/feature/src/lib/location-select.store.ts` |
| Modify | `libs/shared/feature/src/lib/location-select.modal.ts` |
| Modify | `libs/shared/feature/src/index.ts` |
| Modify | `libs/shared/feature/src/lib/model-select.service.ts` |
| Modify | `libs/geo/trip/feature/src/lib/trip.store.ts` |
| Modify | `libs/geo/trip/feature/src/lib/trip-edit.modal.ts` |
| Create | `libs/shared/feature/src/lib/location-select.spec.ts` |

---

## Task 1: i18n key and translation

**Files:**
- Modify: `libs/shared/feature/src/lib/select-i18n.ts`
- Modify: `libs/shared/feature/src/i18n/de.json`

- [ ] **Step 1: Add `location_custom_use` to `LOCATION_SELECT_I18N_KEYS` and `LocationSelectI18n`**

In `libs/shared/feature/src/lib/select-i18n.ts`, replace the location-select block:

```ts
export const LOCATION_SELECT_I18N_KEYS = {
  location_select:     PFX + 'location.select',
  location_empty:      PFX + 'location.empty',
  location_custom_use: PFX + 'location.custom_use',
} satisfies Record<string, string>;

export type LocationSelectI18n = { [K in keyof typeof LOCATION_SELECT_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 2: Add German translation**

In `libs/shared/feature/src/i18n/de.json`, find the `"location"` key and add `"custom_use"`:

```json
"location": {
  "select": "Ort wählen",
  "empty": "Keine Orte gefunden.",
  "custom_use": "Andere Strecke verwenden"
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add libs/shared/feature/src/lib/select-i18n.ts libs/shared/feature/src/i18n/de.json
git commit -m "feat(location-select): add location_custom_use i18n key"
```

---

## Task 2: Normalizer helpers and store state

**Files:**
- Modify: `libs/shared/feature/src/lib/location-select.store.ts`
- Create: `libs/shared/feature/src/lib/location-select.spec.ts`

- [ ] **Step 1: Write failing tests for the normalizer functions**

Create `libs/shared/feature/src/lib/location-select.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeWhitespace, normalizeForCompare } from './location-select.store';

describe('normalizeWhitespace', () => {
  it('trims leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  Hallo  ')).toBe('Hallo');
  });
  it('collapses multiple spaces to one', () => {
    expect(normalizeWhitespace('Brünishusen  via   Insel ')).toBe('Brünishusen via Insel');
  });
  it('preserves original casing', () => {
    expect(normalizeWhitespace('ABC def')).toBe('ABC def');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeWhitespace('   ')).toBe('');
  });
});

describe('normalizeForCompare', () => {
  it('lowercases input', () => {
    expect(normalizeForCompare('ABC')).toBe('abc');
  });
  it('collapses whitespace AND lowercases', () => {
    expect(normalizeForCompare('  Brünishusen  Via  Insel ')).toBe('brünishusen via insel');
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeForCompare('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm run test shared-feature
```

Expected: FAIL — `normalizeWhitespace` and `normalizeForCompare` not found

- [ ] **Step 3: Update `location-select.store.ts` — add exports, state, computed, method**

Replace the entire file content:

```ts
import { computed, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { FirestoreService } from '@bk2/shared-data-access';
import { LocationModel, UserModel } from '@bk2/shared-models';
import { chipMatches, nameMatches } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { LocationService } from '@bk2/location-data-access';
import { AppStore } from './app.store';
import { LOCATION_SELECT_I18N_KEYS, LocationSelectI18n } from './select-i18n';
import { rxResource } from '@angular/core/rxjs-interop';

export const MIN_CUSTOM_SEARCH_LENGTH = 4;

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeForCompare(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
  allowCustom: boolean;
};

export const locationInitialState: LocationSelectState = {
  searchTerm: '',
  currentUser: undefined,
  type: 'logbuch',
  allowCustom: false,
};

export const LocationSelectStore = signalStore(
  withState(locationInitialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    locationService: inject(LocationService),
    i18nService: inject(I18nService)
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(LOCATION_SELECT_I18N_KEYS) as LocationSelectI18n,
    locationsResource: rxResource({
      params: () => ({
        currentUser: store.appStore.currentUser(),
        type: store.type()
      }),
      stream: ({ params }) => {
        return store.locationService.list(params.type, 'distance', 'asc');
      }
    })
  })),

  withComputed((store) => ({
    isLoading: computed(() => store.appStore.isLoading()),
    locations: computed(() => store.locationsResource.value() ?? [])
  })),

  withComputed((store) => ({
    locationsCount: computed(() => store.locations()?.length ?? 0),
    filteredLocations: computed(() =>
      store.locations()?.filter((location: LocationModel) =>
        nameMatches(location.index, store.searchTerm()) &&
        chipMatches(location.type, store.type()))
    ),
    customLabel: computed(() => normalizeWhitespace(store.searchTerm())),
    hasExactMatch: computed(() => {
      const q = normalizeForCompare(store.searchTerm());
      return store.locations().some(l => normalizeForCompare(l.name) === q);
    }),
  })),

  withComputed((store) => ({
    showCustomEntry: computed(() => {
      const q = normalizeWhitespace(store.searchTerm());
      return store.allowCustom()
        && q.length >= MIN_CUSTOM_SEARCH_LENGTH
        && !store.hasExactMatch();
    }),
  })),

  withMethods((store) => ({
    setCurrentUser(currentUser: UserModel | undefined) {
      patchState(store, { currentUser });
    },
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },
    setType(type: string) {
      patchState(store, { type });
    },
    setAllowCustom(allowCustom: boolean) {
      patchState(store, { allowCustom });
    },
  })),
);
```

- [ ] **Step 4: Run tests — must pass**

```bash
pnpm run test shared-feature
```

Expected: all `normalizeWhitespace` and `normalizeForCompare` tests PASS

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add libs/shared/feature/src/lib/location-select.store.ts libs/shared/feature/src/lib/location-select.spec.ts
git commit -m "feat(location-select): add allowCustom state, normalizers, showCustomEntry computed"
```

---

## Task 3: Modal — `LocationSelectResult` type, `allowCustom` input, template, `selectCustom()`

**Files:**
- Modify: `libs/shared/feature/src/lib/location-select.modal.ts`
- Modify: `libs/shared/feature/src/index.ts`

- [ ] **Step 1: Rewrite `location-select.modal.ts`**

Replace the entire file:

```ts
import { Component, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonContent, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular/standalone';

import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { LocationModel, LocationModelName, UserModel } from '@bk2/shared-models';

import { AvatarPipe } from '@bk2/avatar-ui';
import { IonAvatar, IonImg } from '@ionic/angular/standalone';

import { LocationSelectStore } from './location-select.store';

export type LocationSelectResult =
  | { kind: 'predefined'; location: LocationModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'bk-location-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    AvatarPipe, EmptyList,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
  ],
  providers: [LocationSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
  `],
  template: `
    <bk-header 
      [searchTerm]="searchTerm()"
      (searchTermChange)="onSearchTermChange($event)"
      [isSearchable]="true"
      [i18n]="{ title: store.i18n.location_select() }"
      [isModal]="true"
    />
    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else {
        @if(store.showCustomEntry()) {
          <ion-list lines="none">
            <ion-item class="item" color="light" (click)="selectCustom()">
              <ion-icon name="create-outline" slot="start" />
              <ion-label>
                <p>{{ store.i18n.location_custom_use() }}</p>
                <h3>„{{ store.customLabel() }}"</h3>
              </ion-label>
            </ion-item>
          </ion-list>
        }
        @if(selectedLocationsCount() === 0 && !store.showCustomEntry()) {
          <bk-empty-list [message]="store.i18n.location_empty()" />
        } @else {
          @for(location of filteredLocations(); track $index) {
            <ion-list lines="none">
              <ion-item class="item" (click)="select(location)">
                <ion-avatar slot="start">
                  <ion-img src="{{ 'location.' + location.bkey | avatar:defaultIcon }}" alt="Avatar Logo" />
                </ion-avatar>
                <ion-label>{{location.name}}</ion-label>
              </ion-item>
            </ion-list>
          }
        }
      }
    </ion-content>
  `
})
export class LocationSelectModal {
  protected readonly store = inject(LocationSelectStore);
  private readonly modalController = inject(ModalController);

  // inputs
  public type = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredLocations = computed(() => this.store.filteredLocations() ?? []);
  protected selectedLocationsCount = computed(() => this.filteredLocations().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', LocationModelName);

  constructor() {
    effect(() => this.store.setType(this.type()));
    effect(() => this.store.setCurrentUser(this.currentUser()));
    effect(() => this.store.setAllowCustom(this.allowCustom()));
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  public select(location: LocationModel): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'predefined', location } satisfies LocationSelectResult,
      'confirm'
    );
  }

  public selectCustom(): Promise<boolean> {
    return this.modalController.dismiss(
      { kind: 'custom', label: this.store.customLabel() } satisfies LocationSelectResult,
      'confirm'
    );
  }
}
```

- [ ] **Step 2: Export `LocationSelectModal` and `LocationSelectResult` from library index**

In `libs/shared/feature/src/index.ts`, add at the end:

```ts
export * from './lib/location-select.modal';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add libs/shared/feature/src/lib/location-select.modal.ts libs/shared/feature/src/index.ts
git commit -m "feat(location-select): add LocationSelectResult type, allowCustom input, selectCustom() method"
```

---

## Task 4: Update `ModelSelectService` — handle new result type, add `selectLocationResult()`

**Files:**
- Modify: `libs/shared/feature/src/lib/model-select.service.ts`

The existing `selectLocation()` still returns `LocationModel | undefined` (non-breaking for callers). It must now unwrap the `LocationSelectResult` since the modal returns that type. Add a new `selectLocationResult()` for the custom-enabled trip flow.

- [ ] **Step 1: Update `selectLocation()` and add `selectLocationResult()` in `model-select.service.ts`**

Find the `selectLocation` method and replace it (lines ~127–144):

```ts
public async selectLocation(selectedTag = DEFAULT_TAGS): Promise<LocationModel | undefined> {
  const modal = await this.modalController.create({
    component: LocationSelectModal,
    cssClass: 'list-modal',
    componentProps: {
      type: selectedTag,
      currentUser: this.appStore.currentUser(),
    },
  });
  modal.present();
  const { data, role } = await modal.onWillDismiss<LocationSelectResult>();
  if (role === 'confirm' && data?.kind === 'predefined') {
    if (isLocation(data.location, this.appStore.env.tenantId)) {
      return data.location;
    }
  }
  return undefined;
}

public async selectLocationResult(selectedTag = DEFAULT_TAGS): Promise<LocationSelectResult | undefined> {
  const modal = await this.modalController.create({
    component: LocationSelectModal,
    cssClass: 'list-modal',
    componentProps: {
      type: selectedTag,
      currentUser: this.appStore.currentUser(),
      allowCustom: true,
    },
  });
  modal.present();
  const { data, role } = await modal.onWillDismiss<LocationSelectResult>();
  if (role === 'confirm' && data) {
    return data;
  }
  return undefined;
}
```

Also add `LocationSelectResult` to the import from `'./location-select.modal'`:

```ts
import { LocationSelectModal, LocationSelectResult } from './location-select.modal';
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add libs/shared/feature/src/lib/model-select.service.ts
git commit -m "feat(location-select): update ModelSelectService to handle LocationSelectResult, add selectLocationResult()"
```

---

## Task 5: Update trip flow — `trip.store.ts` and `trip-edit.modal.ts`

**Files:**
- Modify: `libs/geo/trip/feature/src/lib/trip.store.ts`
- Modify: `libs/geo/trip/feature/src/lib/trip-edit.modal.ts`

- [ ] **Step 1: Add `selectLocationForTrip()` to `trip.store.ts`**

In `libs/geo/trip/feature/src/lib/trip.store.ts`, add `LocationSelectResult` import at the top:

```ts
import { LocationSelectResult } from '@bk2/shared-feature';
```

Then in the `withMethods` block, **replace** the existing `selectLocationAvatar()` method (which is currently at line ~186) by adding a new sibling `selectLocationForTrip()` method alongside it (keep `selectLocationAvatar` unchanged for any remaining callers):

```ts
async selectLocationForTrip(): Promise<LocationSelectResult | undefined> {
  return await store.modelSelectService.selectLocationResult('logbuch');
},
```

- [ ] **Step 2: Update `addLocation()` in `trip-edit.modal.ts`**

In `libs/geo/trip/feature/src/lib/trip-edit.modal.ts`, replace the `addLocation()` method:

```ts
protected async addLocation(): Promise<void> {
  const result = await this.store.selectLocationForTrip();
  if (!result) return;
  if (result.kind === 'predefined') {
    const locations = this.formData()?.locations;
    if (!locations) return;
    locations.push({
      key: result.location.bkey,
      name1: result.location.distance + '',
      name2: result.location.name,
      label: '',
      modelType: 'location',
      type: result.location.type,
      subType: '',
    });
    this.onFieldChange('locations', locations);
    this.onFieldChange('distance', result.location.distance);
  } else {
    this.onFieldChange('customLocationLabel', result.label);
  }
}
```

- [ ] **Step 3: Type-check both libs**

```bash
npx tsc --noEmit -p libs/geo/trip/feature/tsconfig.json
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors

- [ ] **Step 4: Run all tests**

```bash
pnpm run test shared-feature
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add libs/geo/trip/feature/src/lib/trip.store.ts libs/geo/trip/feature/src/lib/trip-edit.modal.ts
git commit -m "feat(trip): use selectLocationForTrip() with custom location support"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §2 `allowCustom` input, `MIN_CUSTOM_SEARCH_LENGTH=4` | Task 2 (store), Task 3 (modal input) |
| §3.1 Normalisation functions | Task 2 (exported, tested) |
| §3.2 Three decision cases | Task 2 `showCustomEntry` computed |
| §3.3 Empty-state only when no custom row | Task 3 template condition |
| §4 `LocationSelectResult` discriminated union | Task 3 (type), Tasks 4+5 (callers) |
| §5 Store state + computed + `setAllowCustom` | Task 2 |
| §6 Modal input, `effect`, template, `select()`/`selectCustom()` | Task 3 |
| §7 `location_custom_use` i18n key | Task 1 |
| §8 Edge cases (whitespace, exact match) | Task 2 normalizers + spec |

**No gaps found.**

**Placeholder check:** All steps contain complete code. No TBDs.

**Type consistency:**
- `LocationSelectResult` defined in Task 3, used in Tasks 4 and 5 ✓
- `normalizeWhitespace` / `normalizeForCompare` defined + exported in Task 2, tested in Task 2 ✓
- `showCustomEntry`, `customLabel`, `hasExactMatch` defined in Task 2, used in Task 3 template ✓
- `selectLocationForTrip()` defined in Task 5 step 1, called in step 2 ✓
- `store.i18n.location_custom_use()` — key added in Task 1, type updated in Task 1, used in Task 3 template ✓

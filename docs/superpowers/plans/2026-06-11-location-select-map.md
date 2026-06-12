# LocationSelect – Map View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `LocationSelectModal` with an opt-in Leaflet map view showing swisstopo tiles, per-type marker icons, and a popup with name/what3words/select button — without changing the list-only experience.

**Architecture:** Three store fields (`showMap`, `mapTag`, `viewMode`) and a `mappableLocations` computed control the map. The modal lazily loads Leaflet only when the user switches to the map segment for the first time; markers are re-rendered (debounced 250 ms) on search changes via a reactive `effect`. Leaflet stays in a private `leafletModule` cache so repeat activations are synchronous. The popup is a plain DOM element with click listeners attached on `popupopen`.

**Tech Stack:** Angular 20 signals, NgRx Signal Stores, Leaflet 1.9.x (lazy, type-safe via `import type`), swisstopo WMTS, Ionic Angular standalone, Vitest.

---

## File Map

| Action | File |
|--------|------|
| Modify | `libs/shared/feature/src/lib/select-i18n.ts` |
| Modify | `libs/shared/feature/src/i18n/de.json` |
| Modify | `libs/shared/feature/src/lib/location-select.store.ts` |
| Modify | `libs/shared/feature/src/lib/location-select.spec.ts` |
| Modify | `libs/shared/feature/src/lib/location-select.modal.ts` |

---

## Task 1: Install Leaflet and add i18n keys

**Files:**
- Modify: `libs/shared/feature/src/lib/select-i18n.ts`
- Modify: `libs/shared/feature/src/i18n/de.json`

- [ ] **Step 1: Install leaflet and types**

```bash
cd /Users/bruno/proj/bkaiser/bk2
pnpm add leaflet
pnpm add -D @types/leaflet
```

Expected: `package.json` gains `"leaflet"` in dependencies and `"@types/leaflet"` in devDependencies.

- [ ] **Step 2: Add 5 new i18n keys to `select-i18n.ts`**

Replace the location-select block (lines 76–82):

```ts
export const LOCATION_SELECT_I18N_KEYS = {
  location_select:        PFX + 'location.select',
  location_empty:         PFX + 'location.empty',
  location_custom_use:    PFX + 'location.custom_use',
  location_segment_list:  PFX + 'location.segment.list',
  location_segment_map:   PFX + 'location.segment.map',
  location_map_select:    PFX + 'location.map.select',
  location_map_copy_w3w:  PFX + 'location.map.copy_w3w',
  location_map_copied:    PFX + 'location.map.copied',
} satisfies Record<string, string>;

export type LocationSelectI18n = { [K in keyof typeof LOCATION_SELECT_I18N_KEYS]: Signal<string> };
```

- [ ] **Step 3: Add translations to `de.json`**

Replace the `"location"` block:

```json
"location": {
  "select": "Ort wählen",
  "empty": "Keine Orte gefunden.",
  "custom_use": "als Ziel oder Strecke verwenden",
  "segment": {
    "list": "Liste",
    "map": "Karte"
  },
  "map": {
    "select": "Auswählen",
    "copy_w3w": "what3words kopieren",
    "copied": "Kopiert"
  }
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/feature/src/lib/select-i18n.ts libs/shared/feature/src/i18n/de.json package.json pnpm-lock.yaml
git commit -m "feat(location-select-map): install leaflet, add map i18n keys"
```

---

## Task 2: Store — showMap/mapTag/viewMode state, mappableLocations computed, new methods

**Files:**
- Modify: `libs/shared/feature/src/lib/location-select.store.ts`
- Modify: `libs/shared/feature/src/lib/location-select.spec.ts`

- [ ] **Step 1: Write failing tests for `hasValidCoordinates`**

Append to `libs/shared/feature/src/lib/location-select.spec.ts`:

```ts
import { hasValidCoordinates } from './location-select.store';

describe('hasValidCoordinates', () => {
  it('returns false for (0, 0) null island', () => {
    expect(hasValidCoordinates({ latitude: 0, longitude: 0 } as any)).toBe(false);
  });
  it('returns false for NaN latitude', () => {
    expect(hasValidCoordinates({ latitude: NaN, longitude: 8.5 } as any)).toBe(false);
  });
  it('returns false for latitude > 90', () => {
    expect(hasValidCoordinates({ latitude: 91, longitude: 8.5 } as any)).toBe(false);
  });
  it('returns false for longitude > 180', () => {
    expect(hasValidCoordinates({ latitude: 47.4, longitude: 181 } as any)).toBe(false);
  });
  it('returns true for valid Swiss coordinates', () => {
    expect(hasValidCoordinates({ latitude: 47.3769, longitude: 8.5417 } as any)).toBe(true);
  });
  it('returns true for edge values ±90/±180', () => {
    expect(hasValidCoordinates({ latitude: 90, longitude: 180 } as any)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm run test shared-feature
```

Expected: FAIL — `hasValidCoordinates` not exported.

- [ ] **Step 3: Rewrite `location-select.store.ts`**

Replace the entire file:

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
export const MAX_FIT_ZOOM = 16;
export const FIT_PADDING: [number, number] = [32, 32];

export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeForCompare(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function hasValidCoordinates(l: LocationModel): boolean {
  return Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
    && !(l.latitude === 0 && l.longitude === 0)
    && Math.abs(l.latitude) <= 90 && Math.abs(l.longitude) <= 180;
}

export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
  allowCustom: boolean;
  showMap: boolean;
  mapTag: string | undefined;
  viewMode: 'list' | 'map';
};

export const locationInitialState: LocationSelectState = {
  searchTerm: '',
  currentUser: undefined,
  type: 'logbuch',
  allowCustom: false,
  showMap: false,
  mapTag: undefined,
  viewMode: 'list',
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
    showCustomEntry: computed(() =>
      store.allowCustom()
      && store.customLabel().length >= MIN_CUSTOM_SEARCH_LENGTH
      && !store.hasExactMatch()
    ),
    mappableLocations: computed(() =>
      (store.filteredLocations() ?? [])
        .filter(hasValidCoordinates)
        .filter(l => {
          const tag = store.mapTag();
          return tag == null || (l.tags ?? []).includes(tag);
        })
    ),
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
    setShowMap(showMap: boolean) {
      patchState(store, { showMap });
    },
    setMapTag(mapTag: string | undefined) {
      patchState(store, { mapTag });
    },
    setViewMode(viewMode: 'list' | 'map') {
      patchState(store, { viewMode });
    },
  })),
);
```

- [ ] **Step 4: Run tests — must pass**

```bash
pnpm run test shared-feature
```

Expected: 13 tests pass (7 existing + 6 new `hasValidCoordinates` tests).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/feature/src/lib/location-select.store.ts libs/shared/feature/src/lib/location-select.spec.ts
git commit -m "feat(location-select-map): add showMap/mapTag/viewMode state, mappableLocations computed"
```

---

## Task 3: Modal — segment toggle, Leaflet map, markers, popup

**Files:**
- Modify: `libs/shared/feature/src/lib/location-select.modal.ts`

This task rewrites the entire modal file. Read the current file before making changes.

- [ ] **Step 1: Rewrite `location-select.modal.ts`**

Replace the entire file:

```ts
import { Component, ElementRef, OnDestroy, computed, effect, inject, input, linkedSignal } from '@angular/core';
import { IonAvatar, IonContent, IonIcon, IonImg, IonItem, IonLabel, IonList, IonSegment, IonSegmentButton, ModalController, ToastController } from '@ionic/angular/standalone';
import type * as L from 'leaflet';

import { EmptyList, Header, Spinner } from '@bk2/shared-ui';
import { LocationModel, LocationModelName, UserModel } from '@bk2/shared-models';
import { copyToClipboardWithConfirmation } from '@bk2/shared-util-angular';

import { AvatarPipe } from '@bk2/avatar-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { FIT_PADDING, MAX_FIT_ZOOM, LocationSelectStore } from './location-select.store';

export type LocationSelectResult =
  | { kind: 'predefined'; location: LocationModel }
  | { kind: 'custom'; label: string };

@Component({
  selector: 'bk-location-select-modal',
  standalone: true,
  imports: [
    Header, Spinner,
    AvatarPipe, EmptyList, SvgIconPipe,
    IonContent, IonItem, IonLabel, IonAvatar, IonImg, IonList, IonIcon,
    IonSegment, IonSegmentButton,
  ],
  providers: [LocationSelectStore],
  styles: [`
    .item { padding: 0px; min-height: 40px; }
    ion-avatar { margin-top: 0px; margin-bottom: 0px; }
    ion-list { padding: 0px; }
    #location-map { width: 100%; height: 60vh; }
    .location-popup { min-width: 180px; }
    .location-popup strong { display: block; margin-bottom: 4px; }
    .popup-w3w { display: flex; align-items: center; gap: 4px; font-family: monospace; font-size: 0.85em; margin-bottom: 6px; }
    .popup-copy-btn { background: none; border: none; cursor: pointer; font-size: 1em; padding: 2px 4px; }
    .popup-select-btn { width: 100%; padding: 6px; cursor: pointer; background: var(--ion-color-primary); color: #fff; border: none; border-radius: 4px; }
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
        @if(store.showMap()) {
          <ion-segment [value]="store.viewMode()" (ionChange)="onSegmentChange($event)">
            <ion-segment-button value="list">
              <ion-label>{{ store.i18n.location_segment_list() }}</ion-label>
            </ion-segment-button>
            <ion-segment-button value="map">
              <ion-label>{{ store.i18n.location_segment_map() }}</ion-label>
            </ion-segment-button>
          </ion-segment>
        }

        @if(store.viewMode() === 'list') {
          @if(store.showCustomEntry()) {
            <ion-list lines="none">
              <ion-item class="item" color="light" (click)="selectCustom()">
                <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
                <ion-label>
                  <h3>„{{ store.customLabel() }}"</h3>
                  <p>{{ store.i18n.location_custom_use() }}</p>
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
        } @else {
          @if(store.mappableLocations().length === 0) {
            <bk-empty-list [message]="store.i18n.location_empty()" />
          }
          <div id="location-map"></div>
        }
      }
    </ion-content>
  `
})
export class LocationSelectModal implements OnDestroy {
  protected readonly store = inject(LocationSelectStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly el = inject(ElementRef);

  // inputs
  public type = input.required<string>();
  public currentUser = input.required<UserModel>();
  public allowCustom = input<boolean>(false);
  public showMap = input<boolean>(false);
  public mapTag = input<string | undefined>(undefined);

  protected searchTerm = linkedSignal(() => this.store.searchTerm());
  protected filteredLocations = computed(() => this.store.filteredLocations() ?? []);
  protected selectedLocationsCount = computed(() => this.filteredLocations().length);
  protected isLoading = computed(() => this.store.isLoading());

  protected defaultIcon = this.store.appStore.getCategoryIcon('model_type', LocationModelName);

  // Leaflet state (all lazily initialized)
  private leafletModule?: typeof import('leaflet');
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;
  private refitTimeout?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.store.setType(this.type()));
    effect(() => this.store.setCurrentUser(this.currentUser()));
    effect(() => this.store.setAllowCustom(this.allowCustom()));
    effect(() => this.store.setShowMap(this.showMap()));
    effect(() => this.store.setMapTag(this.mapTag()));

    // Activate the Leaflet map when switching to map segment
    effect(() => {
      if (this.store.viewMode() === 'map') {
        setTimeout(() => this.activateMap(), 0);
      }
    });

    // Re-render markers on search changes (debounced), only when map is active
    effect(() => {
      const _ = this.store.mappableLocations(); // reactive dependency
      if (this.map && this.store.viewMode() === 'map') {
        this.scheduleMarkerRerender();
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.refitTimeout);
    this.map?.remove();
  }

  protected onSearchTermChange(searchTerm: string): void {
    this.store.setSearchTerm(searchTerm);
  }

  protected onSegmentChange(event: CustomEvent): void {
    this.store.setViewMode(event.detail.value as 'list' | 'map');
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

  // ─── Leaflet ───────────────────────────────────────────────────────────────

  private async ensureLeaflet(): Promise<typeof import('leaflet')> {
    this.leafletModule ??= await import('leaflet');
    return this.leafletModule;
  }

  private async activateMap(): Promise<void> {
    const L = await this.ensureLeaflet();
    const container = this.el.nativeElement.querySelector('#location-map') as HTMLElement | null;
    if (!container) return;

    if (!this.map) {
      this.map = L.map(container);
      L.tileLayer(
        'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
        { maxZoom: 19, attribution: '© swisstopo' }
      ).addTo(this.map);
      this.markerLayer = L.layerGroup().addTo(this.map);
    } else {
      this.map.invalidateSize();
    }
    this.renderMarkers(L);
  }

  private renderMarkers(L: typeof import('leaflet')): void {
    if (!this.map || !this.markerLayer) return;
    this.markerLayer.clearLayers();

    const locations = this.store.mappableLocations();
    if (locations.length === 0) return;

    const latLngs: L.LatLngExpression[] = [];
    for (const location of locations) {
      const iconName = this.store.appStore.getCategoryItem('location_type', location.type)?.icon ?? 'location-outline';
      const icon = L.divIcon({
        className: 'location-marker',
        html: `<ion-icon name="${iconName}"></ion-icon>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      const marker = L.marker([location.latitude, location.longitude], { icon });
      marker.bindPopup(this.buildPopupEl(location));
      marker.addTo(this.markerLayer);
      latLngs.push([location.latitude, location.longitude]);
    }
    this.map.fitBounds(L.latLngBounds(latLngs), { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
  }

  private buildPopupEl(location: LocationModel): HTMLElement {
    const el = document.createElement('div');
    el.className = 'location-popup';
    el.innerHTML = `
      <strong class="popup-name">${location.name}</strong>
      ${location.what3words ? `
        <div class="popup-w3w">
          <span class="popup-w3w-code">/// ${location.what3words}</span>
          <button class="popup-copy-btn" aria-label="${this.store.i18n.location_map_copy_w3w()}">⧉</button>
        </div>
      ` : ''}
      <button class="popup-select-btn">${this.store.i18n.location_map_select()}</button>
    `;
    el.querySelector('.popup-select-btn')?.addEventListener('click', () => this.select(location));
    if (location.what3words) {
      el.querySelector('.popup-copy-btn')?.addEventListener('click', () => this.copyW3w(location.what3words));
    }
    return el;
  }

  private async copyW3w(w3w: string): Promise<void> {
    await copyToClipboardWithConfirmation(
      this.toastController,
      `///${w3w}`,
      this.store.i18n.location_map_copied()
    );
  }

  private scheduleMarkerRerender(): void {
    clearTimeout(this.refitTimeout);
    this.refitTimeout = setTimeout(async () => {
      const L = await this.ensureLeaflet();
      this.renderMarkers(L);
    }, 250);
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/shared/feature/tsconfig.json
```

Expected: no new errors. (Pre-existing errors in `model-select.service.ts` are acceptable.)

- [ ] **Step 3: Run tests**

```bash
pnpm run test shared-feature
```

Expected: 13 tests still pass (modal changes add no new tests — map logic requires DOM).

- [ ] **Step 4: Commit**

```bash
git add libs/shared/feature/src/lib/location-select.modal.ts
git commit -m "feat(location-select-map): Leaflet map view with swisstopo tiles, markers, popup"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §2 Leaflet 1.9.x, swisstopo WMTS, `divIcon` | Task 3 `activateMap()` + `renderMarkers()` |
| §3 `showMap`, `mapTag`, `MAX_FIT_ZOOM`, `FIT_PADDING` | Task 2 store constants + Task 3 inputs |
| §4 `latitude`/`longitude`/`tags`/`what3words` on `LocationModel` | Fields already exist — verified |
| §5.1 `ion-segment` below header, default `list` | Task 3 template |
| §5.2 List view unchanged, allowCustom row list-only | Task 3 — custom row inside `@if(viewMode === 'list')` |
| §5.3 Map fills modal body, `fitBounds`, debounced on search | Task 3 `activateMap`, `scheduleMarkerRerender` |
| §5.4 `divIcon` with `ion-icon name`, fallback icon | Task 3 `renderMarkers` |
| §5.5 Popup: name + w3w + copy + Auswählen | Task 3 `buildPopupEl` + `copyW3w` |
| §6 Store state/computed/methods | Task 2 store rewrite |
| §7 Lazy `import('leaflet')`, CSS not global | Task 3 `ensureLeaflet()` + component inline styles |
| §9 5 i18n keys | Task 1 |
| §10 AC1: no change without `showMap` | Default `showMap=false`, segment hidden |
| §10 AC2: segment appears with `showMap=true` | Task 3 `@if(store.showMap())` |
| §10 AC3–4: list vs map scope | `filteredLocations` unchanged; `mappableLocations` uses `mapTag` |
| §10 AC5: `fitBounds` + debounce | Task 3 `renderMarkers` + `scheduleMarkerRerender` |
| §10 AC6: marker icon from `CategoryItem.icon` | Task 3 `getCategoryItem('location_type', ...)` |
| §10 AC7: popup copy + toast | Task 3 `copyW3w` |
| §10 AC8: `select()` dismisses `{ kind: 'predefined' }` | Unchanged `select()` method |
| §10 AC9: invalid coords silently skipped | Task 2 `hasValidCoordinates` + `mappableLocations` |
| §10 AC10: Leaflet only on first map activation | Task 3 `ensureLeaflet()` with `??=` cache |

**No gaps found.**

**Placeholder check:** All steps have complete code, no TBDs.

**Type consistency:** `FIT_PADDING` and `MAX_FIT_ZOOM` exported from store, imported in modal ✓. `hasValidCoordinates` exported and tested ✓. `LocationSelectState` extended with 3 new fields ✓. `setShowMap`/`setMapTag`/`setViewMode` defined in store, called from modal ✓.

# Spec: LocationSelect – Map View

**Status:** Draft · **Scope:** `LocationSelectModal` + `LocationSelectStore` (shared/feature)
**Depends on:** existing list-based selection; compatible with `spec-location-select-custom.md` (`allowCustom`)

---

## 1. Goal

Extend the existing `LocationSelectModal` with an optional **map view**. The user can:

1. select a predefined location from the list (existing behavior, unchanged),
2. switch to a map showing markers for a **tag-selected subset** of the locations,
3. tap a marker to see **Name** and **what3words** (with a copy button), and
   confirm the selection from the marker popup via a **Select** button.

The map view is **opt-in** per modal call. Callers that do not enable it see no change.

---

## 2. Decisions

| Topic | Decision |
|---|---|
| Layout | **Segment toggle** `List ⇄ Map` (full-height views). |
| Map library | **Leaflet 1.9.x**, lazy-loaded via dynamic `import()`. |
| Tile provider | **swisstopo** WMTS/XYZ (`ch.swisstopo.pixelkarte-farbe`, EPSG:3857). |
| Marker selection | Subset driven by a **`mapTag`** (not `type`). |
| Marker icon | Per `type`, using the `icon` attribute from the matching `CategoryItem`. |
| Marker interaction | **Two-step**: tap opens popup → **Select** button confirms. |
| Zoom | `fitBounds` over all markers with padding and `maxZoom` cap. |
| Locations without coordinates | **Ignored** (not shown on map, no hint). |

---

## 3. Configuration

| Parameter | Type | Default | Description |
|---|---|---|---|
| `showMap` | `boolean` | `false` | Enables the map segment for this modal call. |
| `mapTag` | `string \| undefined` | `undefined` | Selects which locations appear as markers. A location is mapped iff its `tags` include `mapTag`. If `undefined`, all locations with valid coordinates are mapped. |
| `MAX_FIT_ZOOM` | `const number` | `16` | Upper zoom bound for `fitBounds` (prevents rooftop zoom with a single marker). |
| `FIT_PADDING` | `const [number, number]` | `[32, 32]` | Pixel padding passed to `fitBounds`. |

`MAX_FIT_ZOOM` and `FIT_PADDING` are module-level constants (not inputs).
`showMap` and `mapTag` are passed via `componentProps` like the existing `type` and `allowCustom` parameters.

> **List vs. map scope:** the **list** keeps showing the full result set filtered by
> `type` + search term (unchanged). The **map** shows only the `mapTag` subset of those.
> This lets a caller, e.g., list all locations but pin only the nearest ones
> (`tags: ['nearby']`, `mapTag: 'nearby'`).

---

## 4. Data prerequisites (`LocationModel`)

| Field | Required for map | Notes |
|---|---|---|
| `name` | yes | Popup title. |
| `latitude` / `longitude` | yes | Marker position (flat fields on `LocationModel`). |
| `tags` | yes (if `mapTag` set) | Marker subset selection. |
| `type` | yes | Drives marker icon lookup (see §6). |
| `what3words` | no | Shown as `///word.word.word` in the popup; row hidden if empty. Not validated or regenerated here. |

Locations with missing/invalid coordinates are silently skipped on the map and remain
selectable via the list. No count, no hint.

---

## 5. UI

### 5.1 Header

Unchanged: title, close button, search bar. New: an `ion-segment` directly below the
search bar, visible only when `showMap === true`:

```
[ Liste ] [ Karte ]
```

Default segment: `list`. The search bar stays visible/active in both segments; typing
in map mode re-filters the markers live (within the `mapTag` subset).

### 5.2 List view

Unchanged, including the optional `allowCustom` free-text row (list-only).

### 5.3 Map view

- Fills the modal body below header/segment (`height: 100%` container; call
  `map.invalidateSize()` after the segment becomes visible — Leaflet measures a hidden
  container as 0×0).
- One marker per location in `mappableLocations` (see §6), icon per `type`.
- Tile layer (swisstopo, no key, Referer-based access):

  ```ts
  L.tileLayer(
    'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg',
    { maxZoom: 19, attribution: '© swisstopo' }
  );
  ```

- After (re-)rendering markers:

  ```ts
  map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: MAX_FIT_ZOOM });
  ```

  Re-fit is debounced (250 ms) on search changes to avoid jitter while typing.
- Empty marker set: show the existing `bk-empty-list` pattern as an overlay.

### 5.4 Marker icon

Resolved per location from its `type` via the category registry:

```
LocationModel.type → CategoryItem (where item.name/id === type) → CategoryItem.icon
```

Rendered as a Leaflet `divIcon` wrapping an `<ion-icon name="{icon}">`:

```ts
function markerIcon(L: typeof import('leaflet'), iconName: string): L.DivIcon {
  return L.divIcon({
    className: 'location-marker',
    html: `<ion-icon name="${iconName}"></ion-icon>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}
```

- The category list is the existing `CategoryListModel` for location types
  (`CategoryItem[]`). Look-up by the same key used elsewhere to resolve a type.
- Fallback icon (e.g. `location-outline`) if no `CategoryItem` matches the type.
- `ion-icon` works inside `divIcon` HTML because it is a registered web component;
  styling (size, color) via the `.location-marker` class in the lazy chunk's CSS.

### 5.5 Marker popup

Opened on marker tap (`bindPopup`):

```
┌──────────────────────────────┐
│ <Name>                       │  ← bold
│ ///saft.tafel.juni     [⧉]  │  ← monospace; copy button; row hidden if no w3w
│ ┌──────────────────────────┐ │
│ │        Auswählen         │ │  ← primary button
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

- **Copy button:** `navigator.clipboard.writeText(what3words)` (reuse the shared copy
  util if available), then a short toast `"Kopiert"`. Copy does **not** select or dismiss.
- **Auswählen:** dismisses with the existing contract — no new result kind:

  ```ts
  modalController.dismiss(
    { kind: 'predefined', location } satisfies LocationSelectResult,
    'confirm'
  );
  ```

- One popup open at a time (Leaflet default).

---

## 6. Store changes (`location-select.store.ts`)

**State:**

```ts
export type LocationSelectState = {
  searchTerm: string;
  currentUser: UserModel | undefined;
  type: string;
  allowCustom: boolean;
  showMap: boolean;                 // new
  mapTag: string | undefined;       // new
  viewMode: 'list' | 'map';         // new
};

export const locationInitialState: LocationSelectState = {
  // ...existing...
  showMap: false,
  mapTag: undefined,
  viewMode: 'list',
};
```

**Computed** (after `filteredLocations`):

```ts
withComputed((store) => ({
  mappableLocations: computed(() =>
    store.filteredLocations()
      .filter(hasValidCoordinates)
      .filter(l => {
        const tag = store.mapTag();
        return tag == null || (l.tags ?? []).includes(tag);
      })
  ),
})),
```

```ts
function hasValidCoordinates(l: LocationModel): boolean {
  return Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
    && !(l.latitude === 0 && l.longitude === 0)
    && Math.abs(l.latitude) <= 90 && Math.abs(l.longitude) <= 180;
}
```

**Methods:**

```ts
setShowMap(showMap: boolean) { patchState(store, { showMap }); }
setMapTag(mapTag: string | undefined) { patchState(store, { mapTag }); }
setViewMode(viewMode: 'list' | 'map') { patchState(store, { viewMode }); }
```

---

## 7. Lazy loading

Leaflet is loaded only when the user activates the map segment for the first time:

```ts
private leaflet?: typeof import('leaflet');

async ensureLeaflet(): Promise<typeof import('leaflet')> {
  this.leaflet ??= await import('leaflet');
  return this.leaflet;
}
```

- `leaflet` and `@types/leaflet` as dependencies (pnpm).
- Leaflet CSS imported in the lazy chunk, **not** in global styles.
- No default-icon asset config needed (markers use `divIcon`, not the bundled PNG icons).
- List-only callers (`showMap === false`) never download the chunk.

---

## 8. Non-functional

- **Performance:** plain markers up to ~200 locations; clustering
  (`leaflet.markercluster`) **deferred** until a tenant exceeds that.
- **Offline/PWA:** swisstopo tiles not precached; map view requires connectivity.
  No service-worker change.
- **A11y:** segment buttons labeled; popup "Auswählen" is a real `<button>`; copy
  button has `aria-label="what3words kopieren"`.
- **Privacy / DSG:** swisstopo tile requests expose the client IP to the swisstopo
  endpoint (CH-hosted, no key/login). Note in privacy documentation if relevant.

---

## 9. i18n keys (new)

| Key | de |
|---|---|
| `locationSelect.segment.list` | Liste |
| `locationSelect.segment.map` | Karte |
| `locationSelect.map.select` | Auswählen |
| `locationSelect.map.copyW3w` | what3words kopieren |
| `locationSelect.map.copied` | Kopiert |

---

## 10. Acceptance criteria

1. With `showMap = false` (default), the modal is pixel- and behavior-identical to today.
2. With `showMap = true`, a `List ⇄ Map` segment appears; default is the list.
3. The list shows the full `type` + search result set; the map shows only the
   `mapTag` subset of those that have valid coordinates.
4. With `mapTag` unset, all coordinate-bearing locations of the result set are mapped.
5. On render and on every (debounced) search change, the map fits all visible markers
   at the highest possible zoom, capped at `MAX_FIT_ZOOM`.
6. Each marker uses the icon resolved from its `type` via `CategoryItem.icon`
   (fallback icon if no match).
7. Tapping a marker opens a popup with name and `///what3words`; the copy button copies
   the w3w string and shows a toast without dismissing the modal.
8. Tapping "Auswählen" dismisses with `{ kind: 'predefined', location }`, role `confirm`
   — identical to a list selection.
9. Locations without valid coordinates are silently skipped on the map.
10. The Leaflet chunk is only loaded after the map segment is activated.

---

## 11. Confirmed decisions

- Tile provider: **swisstopo** `ch.swisstopo.pixelkarte-farbe` (EPSG:3857, Referer-based, no key).
- Coordinates: flat `latitude` / `longitude` on `LocationModel`.
- Marker icons: per `type` from `CategoryItem.icon` of the location-type `CategoryListModel`.
- One-step (select-on-tap) selection: **not** implemented.

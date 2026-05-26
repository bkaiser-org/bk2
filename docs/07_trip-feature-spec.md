# Trip Feature Specification

**Version:** 1.0  
**Date:** 2026-05-25  
**Status:** Draft  
**Domain:** `libs/geo/trip`

---

## 1. Overview

The trip feature allows club members to log rowing trips on a shared kiosk device at the boathouse. Because the kiosk is accessible to many members without per-user authentication, the feature applies specific security and audit measures (soft delete, photo capture, suspicious-activity detection).

### 1.1 Goals

- Fast, low-friction trip entry at a kiosk device.
- Accurate accounting of boat usage: who, which boat, where, how far, when.
- Tamper-evident records: soft deletes require a photo and notify the responsible person.
- Administrative oversight via `aoc/trip`.

### 1.2 Out of scope (this iteration)

- Multi-stop trip recording (single destination per trip only).
- Automated distance calculation from GPS tracks.
- Guest management beyond adding a non-member person as participant.

---

## 2. Actors and Roles

| Actor | Role / condition | Write access |
| --- | --- | --- |


| Kiosk device | Dedicated Firebase user (`uid = kiosk`, `roles.kiosk = true`) | Yes — all trip write ops |
| trip_responsibility | `ResponsibilityModel` with `name = 'trip_responsibility'` | Yes — approve/deny deletes, edit any trip |
| Admin | `roles.admin = true` | Yes — full access |
| Regular member | `roles.registered = true` | No write access to trips |

> **New role:** `kiosk` must be added to `RoleName` and `Roles` in `libs/shared/models/src/lib/roles.ts` and to the `isKioskGuard` auth guard.  
> **Do not add** to `RoleName` without asking — confirm with the team before touching `roles.ts`.

---

## 3. Data Model

### 3.1 TripModel (existing — do not change without asking)

Located in `libs/shared/models/src/lib/trip.model.ts`. Fields:

| Field | Type | Notes |
| --- | --- | --- |


| `bkey` | `string` | Firestore document ID |
| `tenants` | `string[]` | Multi-tenancy filter |
| `isArchived` | `boolean` | Standard archive flag |
| `name` | `string` | Format: `yyyymmddhhmmboatname` (auto-generated) |
| `index` | `string` | Searchable index: boatName + date + participant names |
| `tags` | `string[]` | |
| `notes` | `string` | Optional free-text description |
| `startDate` | `string` | `DateFormat.storeDate`, e.g. `'20240601'` |
| `startTime` | `string` | `DateFormat.storeTime`, e.g. `'0830'` |
| `endDate` | `string` | Empty for open trips |
| `endTime` | `string` | Empty for open trips |
| `resource` | `AvatarInfo \| undefined` | The rowing boat used (`type === 'rboat'`) |
| `locations` | `string[]` | Zero or one `LocationModel.bkey` for now |
| `customLocationLabel` | `string` | Free-text when no structured location selected |
| `distance` | `number` | km, 0 = not entered yet |
| `participants` | `AvatarInfo[]` | At least one required |
| `state` | `string` | See state machine §3.2 |
| `deletedAt` | `string \| null` | ISO timestamp of soft delete |
| `deletedBy` | `string \| null` | kiosk uid or admin uid |

### 3.2 State Machine

```
draft  →  open  →  closed
                 ↘  closed.rev   (closed after edit)
         open.rev              (re-opened and edited)
         *        →  *.rev     (any state after edit)
         *        →  deleted   (soft delete, see §7.2)
```

State values used in filters:

| Value pattern | Meaning |
| --- | --- |


| `draft` | Freshly created, not yet confirmed |
| `open` | Trip started, no end time |
| `closed` | Trip ended normally |
| `*.rev` | Any state that has been edited (suffix `.rev`) |
| `*.corr` | Administrative correction (suffix `.corr`) |
| `deleted` | Soft-deleted (deletedAt / deletedBy set) |

### 3.3 Image storage

Trip images are stored in Firebase Storage at `trips/{bkey}/images/{filename}` and referenced via a `DocumentModel` entry in the `documents` Firestore collection. The `DocumentModel.folderKeys` array holds `['t:' + trip.bkey]` as the folder key prefix for trip images.

---

## 4. Library Structure

```
libs/geo/trip/
  util/
    src/lib/
      trip.util.ts          — newTrip(), newTripName(), getTripIndex()
      trip.validations.ts   — vest validations for TripEditForm
      trip.util.spec.ts     — unit tests
    src/index.ts
  data-access/
    src/lib/
      trip.service.ts       — TripService (CRUD + list)
    src/index.ts
  ui/
    src/lib/
      trip-edit.form.ts     — TripEditForm (dumb component)
      location-select.ts    — LocationSelect (new, see §8)
    src/index.ts
  feature/
    src/lib/
      trip.store.ts         — TripStore
      trip-list.ts          — TripList (smart, route component)
      trip-edit.modal.ts    — TripEditModal (smart, modal)
      aoc-trip.ts           — AocTrip (admin overview, route component)
    src/i18n/
      de.json
    src/index.ts
```

Import aliases (to add to `tsconfig.base.json`):
- `@bk2/trip-util` → `libs/geo/trip/util/src/index.ts`
- `@bk2/trip-data-access` → `libs/geo/trip/data-access/src/index.ts`
- `@bk2/trip-ui` → `libs/geo/trip/ui/src/index.ts`
- `@bk2/trip-feature` → `libs/geo/trip/feature/src/index.ts`

---

## 5. TripService (`trip.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class TripService {
  list(orderBy = 'startDate', sortOrder: 'asc' | 'desc' = 'desc'): Observable<TripModel[]>
  read(key: string): Observable<TripModel | undefined>
  create(trip: TripModel, currentUser?: UserModel): Promise<string | undefined>
  update(trip: TripModel, currentUser?: UserModel): Promise<string | undefined>
  softDelete(trip: TripModel, reason: string, photoUrl: string, currentUser?: UserModel): Promise<void>
}
```

- `list()` uses `FirestoreService.searchData(TripCollection, getSystemQuery(tenantId), orderBy, sortOrder)`.
- `create()` sets `trip.index = getTripIndex(trip)` before writing.
- `update()` sets `trip.index = getTripIndex(trip)` before writing.
- `softDelete()` sets `trip.deletedAt = new Date().toISOString()`, `trip.deletedBy = currentUser?.bkey`, `trip.state = 'deleted'`, then calls `update()`. It also sends a notification task to `trip_responsibility` (via a Firebase Cloud Function or a Firestore task document — TBD with team).

---

## 6. TripStore (`trip.store.ts`)

NgRx Signal Store using `signalStore` from `@ngrx/signals`.

### State

```typescript
withState({
  searchTerm: '',
  stateFilter: 'open' as string,   // matches TripList filter dropdown default
})
```

### Computed

```typescript
withComputed(store => ({
  filteredTrips: computed(() => {
    const all = store.tripsResource.value() ?? [];
    const term = store.searchTerm().toLowerCase();
    const stateFilter = store.stateFilter();
    return all
      .filter(t => stateFilter === 'all' || matchesStateFilter(t.state, stateFilter))
      .filter(t => !term || t.index.toLowerCase().includes(term))
      .sort((a, b) => compareTripDate(b, a)); // descending
  }),
  groupedByDay: computed(() => groupTripsByDay(store.filteredTrips())),
}))
```

### Methods

```typescript
withMethods(store => ({
  setSearchTerm(term: string): void
  setStateFilter(state: string): void
  async createTrip(): Promise<string | undefined>           // opens TripEditModal in 'add' mode
  async editTrip(trip: TripModel): Promise<void>            // opens TripEditModal in 'edit' mode
  async endTrip(trip: TripModel): Promise<void>             // opens TripEditModal in 'end' mode
  async deleteTrip(trip: TripModel): Promise<void>          // confirmation + photo + soft delete
  async addGuest(trip: TripModel): Promise<void>            // opens PersonEditModal to create a non-member
  async showImages(trip: TripModel): Promise<void>          // opens gallery modal
  async reportDamage(trip: TripModel): Promise<void>        // notifies trip_responsibility
  async reportBug(trip: TripModel): Promise<void>           // notifies dev_responsibility
  recordSuspiciousActivity(trip: TripModel, reason: string): Promise<void>
}))
```

### Resource

```typescript
withProps(store => ({
  tripsResource: rxResource({
    params: () => ({ tenantId: store.appStore.tenantId() }),
    stream: () => store.tripService.list(),
  }),
}))
```

---

## 7. TripList (`trip-list.ts`)

Route component. Selector: `bk-trip-list`.

### 7.1 Layout

```
<ion-header>
  <ion-toolbar color="secondary">
    <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
    <ion-title>{{ filteredTrips().length }} {{ i18n.list_title() }}</ion-title>
    <ion-buttons slot="end">
      <ion-button (click)="store.createTrip()">
        <ion-icon src="{{ 'add-circle' | svgIcon }}" slot="icon-only" />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
  <bk-list-filter
    (searchTermChanged)="store.setSearchTerm($event)"
    [stateOptions]="stateOptions"
    (stateChanged)="store.setStateFilter($event)" />
</ion-header>

<ion-content>
  @for (day of store.groupedByDay(); track day.date) {
    <ion-item-divider>{{ day.date | date:'EEEE, d. MMMM yyyy' }}</ion-item-divider>
    @for (trip of day.trips; track trip.bkey) {
      <ion-item button (click)="store.showActions(trip)">
        <!-- left: hh:mm  boatName -->
        <!-- right: destination · km · participant avatars -->
      </ion-item>
    }
  }
</ion-content>
```

### 7.2 Per-item columns

| Column | Content |
| --- | --- |


| Time | `startTime` formatted as `HH:mm` |
| Boat | `trip.resource?.name1` (boat name) |
| Destination | `trip.locations[0]` label or `trip.customLocationLabel` |
| km | `trip.distance` km |
| Participants | Row of `<bk-avatar>` icons (avatars only, no names) |
| State chip | Coloured `<ion-chip>` for state |

### 7.3 Context Menu (Action Sheet)

Shown on item tap via `ActionSheetController`. Buttons:

| Button key | Label (i18n) | Shown when |
| --- | --- | --- |


| `trip.add` | Ausfahrt erfassen | Always (shortcut) |
| `trip.responsibility` | Schaden melden | Always |
| `dev.responsibility` | Fehler melden | Always |
| `person.add_guest` | Gast hinzufügen | Always |
| `trip.show_images` | Bilder anzeigen | `trip.images.length > 0` (derived from DocumentModel query) |
| `trip.edit` | Ausfahrt bearbeiten | state ≠ deleted |
| `trip.end` | Ausfahrt beenden | state === 'open' or 'open.rev' |
| `trip.delete` | Ausfahrt löschen | state ≠ deleted |
| `cancel` | Abbrechen | Always |

### 7.4 State Filter Options

```typescript
const stateOptions = ['all', 'draft', 'open', 'closed', 'deleted', 'revised', 'corrected'];
```

Mapping:
- `revised` → filter: `state.endsWith('.rev')`
- `corrected` → filter: `state.endsWith('.corr')`
- `deleted` → filter: `state === 'deleted'` (only visible to admin / trip_responsibility)

### 7.5 List Grouping

Trips are sorted descending by `startDate + startTime`. Grouped by `startDate` into day buckets. Day header shows the full date.

---

## 8. TripEditModal (`trip-edit.modal.ts`)

Modal component. Selector: `bk-trip-edit-modal`. Used in three modes passed via input:

| Mode | `mode` input | startDate/Time | endDate/Time | state on save |
| --- | --- | --- | --- | --- |


| `add` | `'add'` | Now (locked) | Hidden, empty | `open` |
| `edit` | `'edit'` | Locked (display only) | Shown if closed | append `.rev` |
| `end` | `'end'` | Locked | Set to now | `closed` (or `closed.rev`) |

### 8.1 Form Fields

| Field | Type | Mandatory | Notes |
| --- | --- | --- | --- |


| `startDate` | Date display | Display only | Set to now on add, locked |
| `startTime` | Time display | Display only | Set to now on add, locked |
| `endDate` | Date picker | No (only in end/edit mode) | Shown only for end/edit |
| `endTime` | Time picker | No (only in end/edit mode) | Shown only for end/edit |
| `resource` | Boat select | Yes | Filter: `type === 'rboat'`; shows boat avatar + name |
| `location` | `LocationSelect` | No | Single location; falls back to `customLocationLabel` |
| `customLocationLabel` | Text input | No | Shown when no structured location selected |
| `distance` | Number input | No | km; 0 triggers confirmation (§8.2) |
| `participants` | `MultiSelectModal` | Yes (≥ 1) | Segments: members / allPersons / groups |
| `notes` | Textarea | No | Optional free-text |

### 8.2 Validation & Confirmations

All validation uses **vest** (`@bk2/trip-util/trip.validations.ts`).

| Rule | Behaviour |
| --- | --- |


| `resource` empty | Hard block — cannot save |
| `participants` empty | Hard block — cannot save |
| `participants.length !== resource.seats` | Show warning chip (not blocking) |
| `distance === 0` | Confirmation dialog + notify `trip_responsibility` |
| `distance > 50` | Confirmation dialog + notify `trip_responsibility` |

### 8.3 Save Flow

1. Validate form (vest).
2. If warnings → show confirmation alert.
3. Set `trip.name = newTripName(trip)` (format `yyyymmddhhmmboatname`).
4. Set `trip.index = getTripIndex(trip)`.
5. Set `trip.state` per mode table above.
6. Call `tripService.create()` (add mode) or `tripService.update()` (edit/end mode).
7. Dismiss modal.

---

## 9. TripEditForm (`trip-edit.form.ts`)

Dumb/presentational component. Uses `ngx-vest-forms` with Angular template-driven forms.

Inputs:
```typescript
public readonly trip = input.required<TripModel>();
public readonly mode = input.required<'add' | 'edit' | 'end'>();
public readonly boats = input.required<ResourceModel[]>();   // pre-filtered rboat list
public readonly locations = input.required<LocationModel[]>();
public readonly allPersons = input.required<PersonModel[]>();
public readonly i18n = input.required<TripFormI18n>();
```

Output:
```typescript
public readonly tripChange = output<TripModel>();
public readonly validityChange = output<boolean>();
```

---

## 10. LocationSelect (`location-select.ts`)

New UI component. Selector: `bk-location-select`. Standalone, dumb.

### 10.1 Modes

Toggles between two views via a `<ion-segment>`:

**List view:**
- `<bk-list-filter>` search input
- Scrollable list of `LocationModel` entries (name + coordinates if available)
- Tap to select

**Map view:**
- Renders a Leaflet or Google Maps tile (use the existing map pattern in `geo/location` if one exists)
- Location markers — tap to select
- Current selection highlighted

### 10.2 Inputs / Outputs

```typescript
public readonly locations = input.required<LocationModel[]>();
public readonly selectedKey = input<string>('');
public readonly locationChange = output<string>();   // emits LocationModel.bkey or '' for none
```

### 10.3 Fallback

If user clears the selection or no location matches the search, the parent (`TripEditForm`) reveals the `customLocationLabel` text input.

---

## 11. Security: Kiosk Mode

### 11.1 Write Authorization

Write operations on trips are allowed only for:
- `roles.kiosk === true`
- `roles.admin === true`
- The `trip_responsibility` person (identified by their `bkey` matching `ResponsibilityModel.responsibleAvatar.key` where `name === 'trip_responsibility'`)

All other roles are read-only.

Firestore security rules (`firestore.rules`):

```
match /trips/{tripId} {
  allow read: if isAuthenticated() && belongsToTenant(resource);
  allow create, update: if isKiosk() || isAdmin() || isTripResponsibility();
  allow delete: false;  // hard deletes are never allowed
}
```

### 11.2 Soft Delete

`trip_delete` never calls Firestore `delete()`. Instead:

1. Prompt confirmation alert with a text input for the reason.
2. Capture a photo using Capacitor Camera (`Camera.getPhoto()`). The photo is uploaded to Firebase Storage at `trips/{bkey}/images/delete_{timestamp}.jpg` and registered as a `DocumentModel`.
3. Set `trip.deletedAt`, `trip.deletedBy`, `trip.state = 'deleted'`, append deletion reason to `trip.notes`.
4. Call `tripService.softDelete()`.
5. Send a Firestore notification/task document to `trip_responsibility` with the photo URL and reason.

### 11.3 Suspicious Activity Detection

Suspicious activities to detect:

| Trigger | Threshold |
| --- | --- |


| Multiple trip entries from same kiosk | > 3 new trips within 15 minutes |
| Unusual distance | > 100 km |
| Participant count mismatch | ≠ boat seats AND ≥ 2 difference |
| Entry at unusual hours | Before 05:00 or after 23:00 |

When triggered:
1. Show a warning alert to the user.
2. Capture a photo (same Capacitor Camera pattern as soft delete).
3. Upload photo to `trips/{bkey}/images/flag_{timestamp}.jpg` and register as `DocumentModel`.
4. Set a `flagged: true` field on the trip (add `flagged: boolean` field — **ask before adding** to `TripModel`).
5. Notify `trip_responsibility` via Firestore task document.

---

## 12. AocTrip Admin View (`aoc-trip.ts`)

Route component. Selector: `bk-aoc-trip`. Route: `aoc/trip` (admin-only, `isAdminGuard`).

Four cards / sections:

### 12.1 Trash — Repair Soft Deletes

Lists trips where `deletedAt !== null`. Per row:
- Trip name, deleted by, deletion reason (from notes), date
- Photo thumbnail (from documents)
- Actions: **Restore** (clears `deletedAt`/`deletedBy`, sets state to previous state, notifies `trip_responsibility`) | **Hard delete** (admin only, irreversible — confirm twice)

### 12.2 Trips with Notes

Lists trips where `notes !== ''`. Per row: trip summary + note preview. Tap to open `TripEditModal` in edit mode.

### 12.3 Trips with 0 km Distance

Lists trips where `distance === 0`. Per row: trip summary. Tap to open edit modal. Shows count badge on the card header.

### 12.4 Flagged Trips

Lists trips that are flagged for suspicious activity (`flagged === true`). Per row:
- Trip summary + flag reason (from notes)
- Photo thumbnail
- Actions: **Clear flag** (sets `flagged = false`, optionally adds a note) | **Delete** (soft delete)

---

## 13. Routes

Add to `apps/scs-app/src/app/app.routes.ts`:

```typescript
// under the geo section or admin section:
{
  path: 'trips',
  canActivate: [isKioskGuard],   // kiosk OR admin
  children: [
    {
      path: '',
      loadComponent: () => import('@bk2/trip-feature').then(m => m.TripList),
    },
  ],
},
{
  path: 'aoc',
  children: [
    // existing aoc children...
    {
      path: 'trip',
      canActivate: [isAdminGuard],
      loadComponent: () => import('@bk2/trip-feature').then(m => m.AocTrip),
    },
  ],
},
```

> `isKioskGuard` needs to be created in `libs/shared/util-angular/src/lib/` alongside the existing guards. It should pass for `roles.kiosk === true || roles.admin === true`.

---

## 14. i18n Keys (`libs/geo/trip/feature/src/i18n/de.json`)

```json
{
  "list": { "title": "Ausfahrten" },
  "empty": "Keine Ausfahrten gefunden.",
  "group": { "title": "{{ date }}" },
  "add": { "title": "Neue Ausfahrt" },
  "edit": { "title": "Ausfahrt bearbeiten" },
  "end": { "title": "Ausfahrt beenden" },
  "delete": {
    "confirm": "Soll diese Ausfahrt wirklich gelöscht werden?",
    "reason": "Grund für die Löschung",
    "conf": "Ausfahrt gelöscht.",
    "error": "Löschen fehlgeschlagen."
  },
  "actionsheet": {
    "add": "Ausfahrt erfassen",
    "edit": "Ausfahrt bearbeiten",
    "end": "Ausfahrt beenden",
    "delete": "Ausfahrt löschen",
    "report_damage": "Schaden melden",
    "report_bug": "Fehler melden",
    "add_guest": "Gast hinzufügen",
    "show_images": "Bilder anzeigen"
  },
  "save": {
    "add": { "conf": "Ausfahrt erfasst.", "error": "Speichern fehlgeschlagen." },
    "edit": { "conf": "Ausfahrt aktualisiert.", "error": "Aktualisierung fehlgeschlagen." },
    "end": { "conf": "Ausfahrt beendet.", "error": "Beenden fehlgeschlagen." }
  },
  "warning": {
    "distance_zero": "Distanz ist 0 km. Bitte bestätigen.",
    "distance_high": "Distanz über 50 km. Bitte bestätigen.",
    "seats_mismatch": "Anzahl Teilnehmende entspricht nicht der Bootskapazität.",
    "suspicious": "Verdächtige Aktivität erkannt. Bitte bestätigen."
  },
  "field": {
    "boat": "Boot",
    "location": "Zielort",
    "custom_location": "Eigener Zielort",
    "distance": "Distanz (km)",
    "participants": "Teilnehmende",
    "notes": "Notizen",
    "start_date": "Startdatum",
    "start_time": "Startzeit",
    "end_date": "Enddatum",
    "end_time": "Endzeit",
    "state": "Status"
  },
  "state": {
    "draft": "Entwurf",
    "open": "Offen",
    "closed": "Abgeschlossen",
    "deleted": "Gelöscht",
    "revised": "Überarbeitet",
    "corrected": "Korrigiert",
    "all": "Alle"
  },
  "aoc": {
    "title": "Ausfahrten Administration",
    "trash": "Papierkorb",
    "notes": "Ausfahrten mit Notizen",
    "zero_km": "Ausfahrten mit 0 km",
    "flagged": "Markierte Ausfahrten",
    "restore": "Wiederherstellen",
    "clear_flag": "Markierung entfernen"
  },
  "location_select": {
    "list_view": "Liste",
    "map_view": "Karte",
    "search": "Ort suchen",
    "none": "Kein Ort ausgewählt"
  },
  "cancel": "Abbrechen"
}
```

---

## 15. Utility Functions (`trip.util.ts`)

```typescript
export function newTrip(tenantId: string): TripModel
// Returns a TripModel with startDate/startTime = now, state = 'draft'

export function newTripName(trip: TripModel): string
// Format: yyyymmddhhmmboatname (e.g. '202406011430Skiff')

export function getTripIndex(trip: TripModel): string
// Concatenates: boatName + startDate + participant names (space-separated)
// Uses addIndexElement from @bk2/shared-util-core

export function groupTripsByDay(trips: TripModel[]): { date: string; trips: TripModel[] }[]
// Groups sorted trips into day buckets, date = 'YYYYMMDD' key

export function matchesStateFilter(state: string, filter: string): boolean
// Maps filter strings ('revised' → endsWith('.rev'), 'corrected' → endsWith('.corr'), etc.)

export function compareTripDate(a: TripModel, b: TripModel): number
// Compares by startDate + startTime descending

export function formatTripTime(time: string): string
// Converts storeTime '0830' → 'HH:mm' → '08:30'
```

---

## 16. Vest Validations (`trip.validations.ts`)

```typescript
export const tripValidationSuite = create((trip: TripModel, field?: string) => {
  test('resource', '@trip/field.boat', () => {
    enforce(trip.resource?.key).isNotBlank();
  });
  test('participants', '@trip/field.participants', () => {
    enforce(trip.participants.length).greaterThan(0);
  });
  // Seat mismatch: warn only, not enforce
  // Distance zero: warn only
  // Distance > 50: warn only
});
```

---

## 17. Open Questions

| # | Question | Owner |
| --- | --- | --- |


| 1 | Add `kiosk` to `RoleName` / `Roles` — confirm before implementing | Bruno |
| 2 | Add `flagged: boolean` field to `TripModel` — confirm before implementing | Bruno |
| 3 | Notification mechanism for `trip_responsibility`: Firestore task document or Cloud Function call? | Bruno |
| 4 | Map library for LocationSelect: Leaflet (already in project?) or Google Maps? | Bruno |
| 5 | `dev_responsibility`: is this a `ResponsibilityModel` with `name = 'dev_responsibility'`, or a hardcoded admin contact? | Bruno |
| 6 | Should `aoc_trip` also be accessible to `trip_responsibility` (not only admin)? | Bruno |

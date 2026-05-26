# Trip Feature Design

**Date:** 2026-05-26
**Spec reference:** `docs/07_trip-feature-spec.md`
**Implementation:** Plan 1 (core kiosk flow) + Plan 2 (LocationSelect + AocTrip full + suspicious activity)

---

## Scope Split

### Plan 1 — Core Kiosk Flow (this plan)

- Schema changes (`kiosk` role, `flagged` field on `TripModel`)
- All 4 library layers scaffolded (`util`, `data-access`, `ui`, `feature`)
- Utility functions + vest validations + unit tests
- `TripService` (CRUD + soft delete)
- `TripStore` (signal store, actions, rxResource)
- `TripList` (route component, grouped list, ActionSheet context menu)
- `TripEditModal` (3 modes: add / edit / end)
- `TripEditForm` (dumb, template-driven, location = `customLocationLabel` only)
- i18n `de.json`
- Soft delete: Capacitor Camera photo + `TaskModel` notification
- Firestore security rules
- Routes (no `isKioskGuard` — see Auth section)

### Plan 2 — Admin & Advanced (follow-on)

- `LocationSelect` (list + Capacitor Google Maps toggle)
- `TripEditForm` wired to `LocationSelect`
- `AocTrip` full implementation (Trash, Notes, 0km, Flagged cards)
- Suspicious activity detection
- Photo capture on suspicious activity

---

## Schema Changes

### `libs/shared/models/src/lib/roles.ts`

Add `kiosk?: boolean` to the `Roles` type.

### `env.ts` (RoleName)

Add `'kiosk'` to `RoleName` union type.

### `libs/shared/models/src/lib/trip.model.ts`

Add `flagged?: boolean` field.

---

## Library Structure

```
libs/geo/trip/
  util/         @bk2/trip-util
  data-access/  @bk2/trip-data-access
  ui/           @bk2/trip-ui
  feature/      @bk2/trip-feature
```

Each layer: `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json` — modelled on `libs/geo/location/{layer}`.

Import aliases added to `tsconfig.base.json`:
- `@bk2/trip-util` → `libs/geo/trip/util/src/index.ts`
- `@bk2/trip-data-access` → `libs/geo/trip/data-access/src/index.ts`
- `@bk2/trip-ui` → `libs/geo/trip/ui/src/index.ts`
- `@bk2/trip-feature` → `libs/geo/trip/feature/src/index.ts`

---

## `@bk2/trip-util`

### Utility functions (`trip.util.ts`)

| Function | Description |
|----------|-------------|
| `newTrip(tenantId)` | Returns `TripModel` with `startDate/Time = now`, `state = 'draft'` |
| `newTripName(trip)` | `yyyymmddhhmmboatname` |
| `getTripIndex(trip)` | boatName + startDate + participantNames (space-separated) |
| `groupTripsByDay(trips)` | Groups sorted trips into `{date: string, trips: TripModel[]}[]` |
| `matchesStateFilter(state, filter)` | `'revised'` → `endsWith('.rev')`, `'corrected'` → `endsWith('.corr')`, others = exact match |
| `compareTripDate(a, b)` | Descending by `startDate + startTime` |
| `formatTripTime(time)` | `'0830'` → `'08:30'` |

### Vest validations (`trip.validations.ts`)

- Hard block: `resource.key` is not blank
- Hard block: `participants.length > 0`
- Warn (non-blocking): `participants.length !== resource.seats` (if seats known)

### Unit tests (`trip.util.spec.ts`)

Test all utility functions.

---

## `@bk2/trip-data-access`

### `TripService`

```typescript
list(orderBy?, sortOrder?): Observable<TripModel[]>
read(key): Observable<TripModel | undefined>
create(trip, currentUser?): Promise<string | undefined>
update(trip, currentUser?): Promise<string | undefined>
softDelete(trip, reason, photoUrl, currentUser?): Promise<void>
```

`softDelete()`:
1. Sets `trip.deletedAt = new Date().toISOString()`, `trip.deletedBy = currentUser?.bkey`
2. Sets `trip.state = 'deleted'`
3. Appends reason to `trip.notes`
4. Calls `update()`
5. Creates a `TaskModel` via `TaskService` with assignee = `trip` responsibility person (looked up from `responsibilities` collection where `name = 'trip'`)

---

## `@bk2/trip-ui`

### `TripEditForm`

Dumb component using `ngx-vest-forms` with Angular template-driven forms.

Inputs: `trip`, `mode`, `boats` (pre-filtered rboat list), `allPersons`, `i18n: TripFormI18n`

Outputs: `tripChange`, `validityChange`

**Plan 1 location field**: `customLocationLabel` text input only. `LocationSelect` wired in Plan 2.

**Mode behaviour:**
- `add`: startDate/Time locked (display only), endDate/Time hidden
- `edit`: startDate/Time locked, endDate/Time shown if trip is closed
- `end`: startDate/Time locked, endDate/Time set to now

---

## `@bk2/trip-feature`

### `TripStore`

NgRx Signal Store with:
- State: `searchTerm`, `stateFilter`
- Props: `tripsResource` (rxResource via `TripService.list()`)
- Computed: `filteredTrips`, `groupedByDay`
- Methods:
  - `setSearchTerm()`, `setStateFilter()`
  - `createTrip()` — opens `TripEditModal` in 'add' mode (kiosk/admin only)
  - `editTrip(trip)` — opens `TripEditModal` in 'edit' mode (kiosk/admin only)
  - `endTrip(trip)` — opens `TripEditModal` in 'end' mode (kiosk/admin only)
  - `deleteTrip(trip)` — confirmation + photo (Capacitor Camera) + `tripService.softDelete()` (kiosk/admin only)
  - `addGuest(trip)` — opens `PersonEditModal` to create non-member
  - `showImages(trip)` — opens gallery modal
  - `reportDamage(trip)` — creates `TaskModel` assigned to `trip` responsibility
  - `reportBug(trip)` — creates `TaskModel` assigned to `dev` responsibility

Write guards: methods check `hasRole('kiosk') || hasRole('admin')` via `AppStore.currentUser()` before executing. No route guard needed on `/trips`.

### `TripList`

Route component. Selector: `bk-trip-list`.
- Header: `ion-toolbar color="secondary"`, title shows `filteredTrips().length + i18n.list_title`
- Add button in header (shown for kiosk/admin only)
- `bk-list-filter` for search + state filter
- Grouped list: `ion-item-divider` per day, `ion-item` per trip
- Trip row columns: time, boat name, destination, km, participant avatars, state chip
- Tap: `ActionSheetController` with buttons per §7.3 of spec (write buttons hidden for non-kiosk/non-admin)

### `TripEditModal`

Modal component. Selector: `bk-trip-edit-modal`.
- Input: `trip: TripModel`, `mode: 'add' | 'edit' | 'end'`
- Uses `TripEditForm`
- Distance `=== 0` or `> 50`: confirmation alert, then `reportDamage()` notification
- Save flow: validate → confirm if warnings → set name/index/state → create or update → dismiss

### `AocTrip`

Stub route component. Selector: `bk-aoc-trip`. Plan 1: renders a placeholder. Full implementation in Plan 2.

---

## Authentication & Authorization

- **`/trips` route**: `isAuthenticatedGuard` — all registered users can view
- **`/aoc/trip` route**: `isAdminGuard` — admin only
- **Write actions** in `TripStore`: gated by `hasRole('kiosk') || hasRole('admin')` at runtime
- **No `isKioskGuard`** created (not needed as a route guard)
- **`kiosk` role**: still added to `Roles`/`RoleName` to identify kiosk Firebase users

---

## Firestore Security Rules

```
match /trips/{tripId} {
  allow read: if isAuthenticated() && belongsToTenant(resource);
  allow create, update: if isKiosk() || isAdmin() || isTripResponsibility();
  allow delete: false;
}
```

Where `isKiosk()` checks `request.auth.token.kiosk == true` (custom claim) or via `roles.kiosk` on the user document.

---

## Notification via TaskModel

When `softDelete()` or `reportDamage()` or `reportBug()` is called:
1. Look up `ResponsibilityModel` from `responsibilities` collection where `name = 'trip'` (or `'dev'`)
2. Create a `TaskModel` with:
   - `assignee = responsibility.responsibleAvatar`
   - `name = 'Trip gelöscht: [tripName]'` (or appropriate description)
   - `notes = reason + photoUrl`
   - `tags = ['trip', 'delete']` (or relevant tags)
   - `tenants = trip.tenants`

---

## Routes

```typescript
// in apps/scs-app/src/app/app.routes.ts
{
  path: 'trips',
  canActivate: [isAuthenticatedGuard],
  loadComponent: () => import('@bk2/trip-feature').then(m => m.TripList),
},
// under existing aoc children:
{
  path: 'trip',
  canActivate: [isAdminGuard],
  loadComponent: () => import('@bk2/trip-feature').then(m => m.AocTrip),
},
```

---

## i18n

`libs/geo/trip/feature/src/i18n/de.json` — full content per `docs/07_trip-feature-spec.md` §14.

---

## Open Items Resolved

| # | Question | Decision |
|---|----------|----------|
| 1 | Add `kiosk` role? | Yes |
| 2 | Add `flagged` field? | Yes |
| 3 | Notification mechanism? | `TaskModel` via existing task feature |
| 4 | Map library? | Capacitor Google Maps — deferred to Plan 2 |
| 5 | `dev_responsibility`? | `ResponsibilityModel` with `name = 'dev'` |
| 6 | `aoc/trip` access? | Admin only |
| — | `isKioskGuard`? | Not needed as route guard; role still added |
| — | Notification consistency? | Use `tasks` collection (dynamic notification count) |

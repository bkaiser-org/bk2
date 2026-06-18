# Flight Tracker Feature Design

**Date:** 2026-05-04  
**Status:** Approved

## Overview

A new feature under `libs/geo/flighttracker/` that lets an authenticated user enter a flight number and date, then look up live flight data via a Firebase Cloud Function. The result is displayed on a Google Maps view with departure airport, arrival airport, and current airplane position markers. Tapping the airplane marker opens a detail modal.

---

## Requirements

- Authenticated users only (`isAuthenticatedGuard`)
- One-time fetch (no automatic polling); a Reload button triggers a fresh call
- Date defaults to today (pre-filled); user can change it
- If the flight has no live position (scheduled / landed / cancelled): show departure and arrival markers only with a status message
- If live position exists: additionally show a plane marker; tapping it opens the detail modal

---

## Architecture

### Cloud Function — `apps/functions/src/flighttracker/index.ts`

Callable: `getFlightInfo`  
Secret: `AVIATIONSTACK_APIKEY` (`defineSecret`)  
Region: `europe-west6`  
Auth: enforced (`request.auth` check)  
AppCheck: `enforceAppCheck: true`

**Input:**
```ts
interface FlightInfoRequest {
  flightNumber: string;   // e.g. "LX1234"
  date: string;           // YYYY-MM-DD
}
```

**Processing:**
1. Call `https://api.aviationstack.com/v1/flights?access_key=KEY&flight_iata={flightNumber}&flight_date={date}`
2. For each airport IATA (departure + arrival), resolve coordinates using a **Firestore-first cache**:
   - Read `locations/{IATA}` from Firestore Admin SDK
   - If the document exists and has `type = 'airport'`: use its `latitude`/`longitude` directly
   - If not found: call `/v1/airports?access_key=KEY&search={IATA}`, then write the result to `locations/{IATA}` with `type = 'airport'`, `tenants: ['_global']`, `name = airport name`, `latitude`, `longitude` (stripping `bkey` before write, per project convention)
   - Both airports are resolved in parallel (`Promise.all`)
3. Assemble and return `FlightInfoResponse`

This means the aviationstack airports endpoint is only called once per IATA code, ever. Subsequent flight searches reuse the cached Firestore document.

**Output:**
```ts
interface FlightInfoResponse {
  flightNumber: string;
  status: string;          // 'scheduled' | 'active' | 'landed' | 'cancelled' | 'unknown'
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  aircraft?: FlightAircraft;
  live?: FlightLivePosition;
}

interface FlightEndpoint {
  airport: string;
  iata: string;
  terminal?: string;
  gate?: string;
  delay?: number;          // minutes
  scheduled?: string;      // ISO datetime
  estimated?: string;      // ISO datetime
  lat?: number;
  lng?: number;
}

interface FlightAircraft {
  registration?: string;
  iata?: string;
  icao24?: string;
}

interface FlightLivePosition {
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  speed_horizontal: number;
}
```

Exported from `apps/functions/src/main.ts` as `getFlightInfo`.

---

### Library: `libs/geo/flighttracker/data-access` → `@bk2/geo-flighttracker-data-access`

**Files:**
- `tsconfig.json` (noEmit: true, references shared deps)
- `tsconfig.lib.json`
- `package.json` (name: `@bk2/geo-flighttracker-data-access`)
- `src/index.ts`
- `src/lib/flighttracker.service.ts`

**`FlightTrackerService`** — injectable service that wraps the `getFlightInfo` Firebase callable using `httpsCallable` from `firebase/functions` with `getFunctions(getApp(), 'europe-west6')`, matching the pattern in `LocationConversionService`. Returns `Promise<FlightInfoResponse>`.

---

### Library: `libs/geo/flighttracker/feature` → `@bk2/geo-flighttracker-feature`

**Files:**
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`
- `src/index.ts`
- `src/lib/flighttracker.store.ts`
- `src/lib/flighttracker-search.component.ts`
- `src/lib/flighttracker-detail.modal.ts`

#### `FlightTrackerStore` (NgRx Signal Store)

State:
- `flightNumber: string` — current input value
- `date: string` — YYYY-MM-DD, defaults to today
- `flightData: FlightInfoResponse | null`
- `isLoading: boolean`
- `error: string | null`

Methods:
- `setFlightNumber(value)` / `setDate(value)`
- `search()` — calls `FlightTrackerService`, sets loading/data/error
- `reload()` — alias for `search()`

#### `FlightTrackerSearchComponent`

Selector: `bk-flighttracker-search`  
Route: `/flighttracker` (lazy-loaded, `isAuthenticatedGuard`)  
Providers: `[FlightTrackerStore]`

Template structure:
1. `<ion-header>` with title "✈ Flight Tracker" and menu button
2. Search toolbar: flight number input + date input (default today) + Search button + Reload button
3. Status bar (shown when `flightData()` is set): flight number, status badge, route (dep IATA → arr IATA), altitude / speed / direction (only if `live` present)
4. Map area: `<capacitor-google-map>` full width/height
   - On data load: place departure marker (📍 + IATA label), arrival marker (📍 + IATA label)
   - If `live` present: place airplane marker with custom plane icon; register `setOnMarkerClickListener` to open `FlightDetailModal`
   - Fit camera to show all markers
5. When no `flightData`: show empty/prompt state

#### `FlightDetailModal`

Selector: `bk-flighttracker-detail-modal`  
Input: `flightData = input.required<FlightInfoResponse>()`

Template: `<bk-header>` + `<ion-content>` with 4 sections in a 2-column grid:
- **Departure**: airport, IATA, terminal, gate, delay, scheduled, estimated
- **Arrival**: airport, IATA, terminal, gate, delay, scheduled, estimated
- **Aircraft**: registration, IATA, ICAO24 (hidden entirely if `aircraft` is null)
- **Live Position**: altitude, direction, speed_horizontal (hidden entirely if `live` is null)

---

## Routing

Add to the app's routing config (lazy-loaded):

```ts
{
  path: 'flighttracker',
  canActivate: [isAuthenticatedGuard],
  loadComponent: () =>
    import('@bk2/geo-flighttracker-feature').then(m => m.FlightTrackerSearchComponent)
}
```

---

## Error Handling

- No results from aviationstack → store sets `error: 'Flight not found'`; template shows ion-note with message
- Network/function error → store sets `error` from the HttpsError message; template shows ion-note
- Loading state → `<bk-spinner>` + `<ion-backdrop>` (matching existing pattern)

---

## Map Behaviour

- Uses `@capacitor/google-maps` (same as `MapSectionComponent` and `MapViewModal`)
- Dynamic import to avoid SSR issues
- Unique map ID per instance
- Destroyed in `ngOnDestroy`
- Departure and arrival airport markers always shown when `flightData` is present and coords are available
- Plane marker shown only when `flightData.live` is present; uses a custom plane icon SVG via `iconUrl`
- `setOnMarkerClickListener`: only the plane marker ID triggers the modal; airport marker clicks are ignored
- Camera fitted to show all placed markers (using `setCamera` with appropriate zoom after placement)
- If airport coordinates are not returned by `/v1/airports` (IATA not found), that marker is silently skipped; the map still renders with whatever markers are available

---

## i18n

New keys added to `apps/scs-app/src/assets/i18n/de.json` under `@flighttracker.*`:
- `@flighttracker.title`
- `@flighttracker.search.placeholder` 
- `@flighttracker.reload`
- `@flighttracker.status.active`, `scheduled`, `landed`, `cancelled`, `unknown`
- `@flighttracker.detail.departure`, `arrival`, `aircraft`, `live`
- `@flighttracker.error.notFound`, `error.generic`

---

## Out of Scope

- Polling / auto-refresh
- Saving/history of past lookups
- Flight search by route (only by flight number)
- SSR rendering of the map

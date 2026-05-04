# Flight Tracker Route Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw two geodesic polyline segments on the flight tracker map — a bold line for the flown portion (departure → plane) and a faint line for the remaining portion (plane → arrival), falling back to a single faint line when no live position is available.

**Architecture:** All changes are confined to one component file. Polyline IDs are tracked alongside marker IDs and cleared on every data refresh. `@capacitor/google-maps` `addPolylines()` is used directly — no new dependencies.

**Tech Stack:** Angular 20 (standalone, zoneless), `@capacitor/google-maps`, TypeScript strict.

---

### Task 1: Add polyline state, `drawRoute`, and wire it up

**Files:**
- Modify: `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`

- [ ] **Step 1: Add `polylineIds` field next to `markerIds`**

In the class body, after `private planeMarkerId: string | null = null;` (line 154), add:

```ts
private polylineIds: string[] = [];
```

- [ ] **Step 2: Update `clearMarkers()` to also remove polylines**

Replace the existing `clearMarkers()` method:

```ts
private async clearMarkers(): Promise<void> {
  if (this.polylineIds.length > 0) {
    try { await this.map.removePolylines(this.polylineIds); } catch { /* ignore */ }
    this.polylineIds = [];
  }
  for (const id of this.markerIds) {
    try { await this.map.removeMarker(id); } catch { /* ignore */ }
  }
  this.markerIds = [];
  this.planeMarkerId = null;
}
```

- [ ] **Step 3: Add the `drawRoute` method**

Add this private method after `fitCameraToMarkers`:

```ts
private async drawRoute(data: FlightInfoResponse): Promise<void> {
  const dep = data.departure;
  const arr = data.arrival;
  if (dep.lat == null || dep.lng == null || arr.lat == null || arr.lng == null) return;

  const polylines: any[] = [];

  if (data.live) {
    polylines.push({
      path: [
        { lat: dep.lat, lng: dep.lng },
        { lat: data.live.latitude, lng: data.live.longitude },
      ],
      geodesic: true,
      strokeColor: '#3880ff',
      strokeWeight: 3,
      strokeOpacity: 1.0,
    });
    polylines.push({
      path: [
        { lat: data.live.latitude, lng: data.live.longitude },
        { lat: arr.lat, lng: arr.lng },
      ],
      geodesic: true,
      strokeColor: '#3880ff',
      strokeWeight: 2,
      strokeOpacity: 0.35,
    });
  } else {
    polylines.push({
      path: [
        { lat: dep.lat, lng: dep.lng },
        { lat: arr.lat, lng: arr.lng },
      ],
      geodesic: true,
      strokeColor: '#3880ff',
      strokeWeight: 2,
      strokeOpacity: 0.35,
    });
  }

  const result = await this.map.addPolylines(polylines);
  this.polylineIds.push(...(result?.ids ?? []));
}
```

- [ ] **Step 4: Call `drawRoute` in `onFlightDataChanged`**

Replace the existing `onFlightDataChanged` method:

```ts
private async onFlightDataChanged(data: FlightInfoResponse | null): Promise<void> {
  await this.clearMarkers();
  if (!data) return;
  await this.addAirportMarker(data.departure.lat, data.departure.lng, data.departure.iata, data.departure.airport);
  await this.addAirportMarker(data.arrival.lat, data.arrival.lng, data.arrival.iata, data.arrival.airport);
  if (data.live) {
    this.planeMarkerId = await this.map.addMarker({
      coordinate: { lat: data.live.latitude, lng: data.live.longitude },
      title: data.flightNumber,
      snippet: `${data.live.altitude.toFixed(0)} ft · ${data.live.speed_horizontal.toFixed(0)} kn`,
      iconUrl: PLANE_ICON_URL,
    });
    this.markerIds.push(this.planeMarkerId!);
  }
  await this.fitCameraToMarkers(data);
  await this.drawRoute(data);
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts
git commit -m "feat(flighttracker): draw two-segment geodesic route line on map"
```

---

### Manual verification checklist

After deploying or serving locally (`pnpm nx serve scs-app`):

- [ ] Search a flight that is currently **active** (e.g. LX1234) — confirm bold blue line dep → plane and faint line plane → arr.
- [ ] Search a **scheduled** flight (no live position) — confirm single faint line dep → arr.
- [ ] Search again (reload button) — confirm old lines are cleared and new ones drawn without ghosting.
- [ ] Search a flight where airport coords are missing — confirm no crash, no partial polyline.

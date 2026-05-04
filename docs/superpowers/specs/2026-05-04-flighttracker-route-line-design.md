# Flight Tracker Route Line — Design Spec

**Date:** 2026-05-04
**File touched:** `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`

## Goal

Draw an approximate route line on the flight tracker map using two polyline segments to distinguish the flown portion from the remaining portion of the flight.

## Behaviour

| Condition | Line drawn |
|-----------|-----------|
| Live position available | Segment 1: departure → plane (bold). Segment 2: plane → arrival (faint). |
| No live position | Single faint segment: departure → arrival. |
| Airport coords missing | Skip silently — no polyline drawn. |

Both segments use `geodesic: true` (great-circle arc).

## Visual Style

| Segment | `strokeColor` | `strokeWeight` | `strokeOpacity` |
|---------|--------------|----------------|-----------------|
| Flown (dep → plane) | `#3880ff` | 3 | 1.0 |
| Remaining (plane → arr) | `#3880ff` | 2 | 0.35 |
| Fallback (dep → arr, no live) | `#3880ff` | 2 | 0.35 |

Note: Capacitor Google Maps does not expose dash patterns through its `addPolylines()` API. Lower opacity + thinner weight achieves a visually equivalent "faint ahead" effect.

## Implementation

### New state

```ts
private polylineIds: string[] = [];
```

### New method: `drawRoute(data: FlightInfoResponse)`

- Returns early if departure or arrival coords are missing.
- Builds a `polylines` array:
  - If `data.live`: push flown segment (dep → plane) then remaining segment (plane → arr).
  - If no `data.live`: push single faint segment (dep → arr).
- Calls `this.map.addPolylines(polylines)` and appends returned IDs to `this.polylineIds`.

### Updated `clearMarkers()`

Before clearing markers, call `this.map.removePolylines(this.polylineIds)` and reset `this.polylineIds = []`.

### Updated `onFlightDataChanged()`

After `fitCameraToMarkers(data)`, call `await this.drawRoute(data)`.

## Out of scope

- Animated plane movement
- Actual filed flight path (only great-circle approximation)
- Dashed line pattern (not supported by Capacitor wrapper)

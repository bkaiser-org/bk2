# Flight Tracker Airplane Icon Rotation — Design Spec

**Date:** 2026-05-04
**File touched:** `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`

## Goal

Rotate the airplane marker icon on the flight tracker map to match the live flight heading, so the icon visually points in the direction of travel.

## Constraint

Capacitor Google Maps `addMarker()` has no `rotation` property. Rotation must be baked into the `iconUrl` SVG.

## Approach

Replace the static `PLANE_ICON_URL` constant with a pure `planeIconUrl(direction: number): string` function that embeds an SVG `<g transform="rotate(dir, 12, 12)">` wrapping the existing path.

- The existing SVG viewBox is `0 0 24 24`, centre `(12, 12)`.
- The path points north (0°) at rest.
- `rotate(direction, 12, 12)` rotates it clockwise to the correct heading.
- `direction` comes from `FlightLivePosition.direction` (degrees from north, 0–359), already present in `data.live`.

## Implementation

### Remove

```ts
const PLANE_ICON_URL = '...'; // static constant — deleted
```

### Add (module level, before the component class)

```ts
function planeIconUrl(direction: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
    `<g transform="rotate(${direction}, 12, 12)">` +
    '<path fill="%233880ff" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' +
    '</g></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
```

### Update call site in `onFlightDataChanged`

```ts
iconUrl: planeIconUrl(data.live.direction),
```

## Out of scope

- Snapping to discrete headings (every 5° or 10°) — unnecessary, exact value is fine
- Animating rotation changes on reload

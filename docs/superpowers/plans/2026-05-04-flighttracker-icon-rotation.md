# Flight Tracker Icon Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rotate the airplane marker icon to match the live flight heading by replacing the static SVG data URL constant with a function that embeds a rotation transform.

**Architecture:** Single file change. The static `PLANE_ICON_URL` constant is deleted and replaced with a pure `planeIconUrl(direction: number): string` function at module level. The one call site in `onFlightDataChanged` is updated to pass `data.live.direction`. No new dependencies.

**Tech Stack:** Angular 20 (standalone, zoneless), `@capacitor/google-maps`, TypeScript strict.

---

### Task 1: Replace static icon constant with direction-aware function

**Files:**
- Modify: `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts`

- [ ] **Step 1: Read the file**

Read `libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts` and locate:
- The `PLANE_ICON_URL` constant near the top (around line 21–27)
- The `addMarker` call in `onFlightDataChanged` that uses `iconUrl: PLANE_ICON_URL`

- [ ] **Step 2: Replace `PLANE_ICON_URL` with `planeIconUrl` function**

Delete these lines:
```ts
const PLANE_ICON_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36">' +
    '<path fill="%233880ff" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>' +
    '</svg>'
  );
```

Replace with:
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

- [ ] **Step 3: Update the `addMarker` call site**

In `onFlightDataChanged`, find:
```ts
iconUrl: PLANE_ICON_URL,
```

Replace with:
```ts
iconUrl: planeIconUrl(data.live.direction),
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/geo/flighttracker/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/geo/flighttracker/feature/src/lib/flighttracker-search.component.ts
git commit -m "feat(flighttracker): rotate airplane icon to match live flight heading"
```

---

### Manual verification

After serving locally (`pnpm nx serve scs-app`):

- [ ] Search an active flight — confirm the airplane icon points in the direction of travel (not always north).
- [ ] Search a flight heading roughly east (~90°) — icon should point right.
- [ ] Search a flight heading roughly south (~180°) — icon should point down.
- [ ] Reload the same flight — icon is re-drawn with the correct rotation (no stale icon).

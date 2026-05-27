# Trip Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trip kilometre aggregation via Cloud Functions and a configurable `trip-stats` CMS section displaying sortable list and echarts line-chart views.

**Architecture:** A Firestore-triggered Cloud Function (`onTripWrite`) updates per-boat and per-member yearly kilometre stats in subcollections (`stats_boats/{key}/years/{year}`, `stats_members/{key}/years/{year}`) on every trip write. A nightly scheduled CF rewrites the current-year stats from scratch for drift protection. A new `trip-stats` CMS section type (living in `libs/cms/section/feature`) reads those stats via `TripStatsService` and renders either a sortable list or an echarts line chart.

**Tech Stack:** Angular 20 zoneless, NgRx Signal Stores, rxResource, Firebase Admin SDK v2 Cloud Functions, `ngx-echarts` (already installed), `FirestoreService.readObject` + `searchData` for Angular-side reads.

**Firestore path convention:** Stats document paths use 4-segment paths (Firestore requires even segment counts for document refs):
- `stats_boats/{boatKey}/years/{year}` — one doc per boat per year
- `stats_members/{memberKey}/years/{year}` — one doc per member per year

**Field mapping (TripModel → CF):**
- Boat ID: `data.resource?.key`
- Member IDs: `(data.participants ?? []).map(p => p.key).filter(Boolean)`
- Year: `parseInt((data.startDate ?? '').substring(0, 4), 10)` → stored as string `"2026"` in doc ID
- Distance: `data.distance`
- State: `data.state`

---

## File Map

| Action | Path |
|---|---|
| **Modify** | `libs/shared/models/src/lib/section.model.ts` |
| **Create** | `libs/geo/trip/data-access/src/lib/trip-stats.service.ts` |
| **Modify** | `libs/geo/trip/data-access/src/index.ts` |
| **Create** | `apps/functions/src/trip/index.ts` |
| **Modify** | `apps/functions/src/main.ts` |
| **Modify** | `libs/cms/section/feature/package.json` |
| **Modify** | `libs/cms/section/feature/tsconfig.json` |
| **Create** | `libs/cms/section/feature/src/lib/trip-stats-section.store.ts` |
| **Create** | `libs/cms/section/feature/src/lib/trip-stats-section.ts` |
| **Modify** | `libs/cms/section/feature/src/lib/section-dispatcher.ts` |
| **Modify** | `libs/cms/section/feature/src/i18n/de.json` |
| **Create** | `libs/cms/section/ui/src/lib/trip-stats-configuration.ts` |
| **Modify** | `libs/cms/section/ui/src/index.ts` |
| **Modify** | `libs/cms/section/ui/src/i18n/de.json` |

---

## Task 1: Extend SectionModel with TripStatsSection

**Files:**
- Modify: `libs/shared/models/src/lib/section.model.ts`

- [ ] **Step 1: Add `'trip-stats'` to `SectionType`**

In `section.model.ts`, the current last entries are `'member-age' | 'member-cat'`. Append `| 'trip-stats'`:

```typescript
export type SectionType =
    'album' | 'article' | 'button' | 'cal' | 'chart' | 'chat' | 'emergency' | 'hero' | 'iframe' | 'map' |
    'people' | 'responsibility' | 'slider' | 'table' | 'tracker' | 'video' | 'accordion' | 'events' | 'invitations' | 'tasks' |
    'news' | 'activities' | 'messages' | 'files' | 'links' | 'rag' | 'orgchart' | 'context' | 'member-age' | 'member-cat' | 'trip-stats';
```

- [ ] **Step 2: Add `TripStatsSection` and `TripStatsConfig` interfaces**

Add after the `// --------------------------------------- MEMBER CAT` block (around line 79), before the `// --------------------------------------- ABSTRACT BASE SECTION MODELS` comment:

```typescript
// --------------------------------------- TRIP STATS ----------------------------------------
export interface TripStatsSection extends BaseSection {
  type: 'trip-stats';
  properties: TripStatsConfig;
}

export interface TripStatsConfig {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
}
```

- [ ] **Step 3: Add `TripStatsSection` to the `SectionModel` discriminated union**

Change the current last line of the union (line ~28):
```typescript
// before:
export type SectionModel =
    AlbumSection | ArticleSection | ButtonSection | CalendarSection | ChartSection | ChatSection |
    HeroSection | IframeSection | MapSection | PeopleSection | ResponsibilitySection | SliderSection |
    TableSection | TrackerSection | VideoSection | AccordionSection | EventsSection | InvitationsSection | TasksSection |
    NewsSection | ActivitiesSection | MessagesSection | FilesSection | LinksSection | RagSection | OrgchartSection | ContextDiagramSection | MemberAgeSection | MemberCatSection;

// after:
export type SectionModel =
    AlbumSection | ArticleSection | ButtonSection | CalendarSection | ChartSection | ChatSection |
    HeroSection | IframeSection | MapSection | PeopleSection | ResponsibilitySection | SliderSection |
    TableSection | TrackerSection | VideoSection | AccordionSection | EventsSection | InvitationsSection | TasksSection |
    NewsSection | ActivitiesSection | MessagesSection | FilesSection | LinksSection | RagSection | OrgchartSection | ContextDiagramSection | MemberAgeSection | MemberCatSection | TripStatsSection;
```

- [ ] **Step 4: Add `TripStatsConfig` to `BaseSection.properties` union**

The `properties?` field in `BaseSection` (~line 97-99) is a large union. Add `| TripStatsConfig` at the end:

```typescript
  properties?: AccordionConfig | AlbumConfig | ArticleConfig | ButtonConfig | CalendarOptions | EChartsOption | ChatConfig | HeroConfig |
  IframeConfig | MapConfig | OrgchartConfig | ContextDiagramConfig | PeopleConfig | ResponsibilityConfig | SliderConfig | TableConfig | TrackerConfig | VideoConfig | EventsConfig | InvitationsConfig |
  TasksConfig | NewsConfig | ActivitiesConfig | MessagesConfig | FilesConfig | LinksConfig | RagConfig | MemberAgeConfig | MemberCatConfig | TripStatsConfig;
```

- [ ] **Step 5: Type-check the models library**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/models/src/lib/section.model.ts
git commit -m "feat(section-model): add TripStatsSection and TripStatsConfig"
```

---

## Task 2: TripStatsService

**Files:**
- Create: `libs/geo/trip/data-access/src/lib/trip-stats.service.ts`
- Modify: `libs/geo/trip/data-access/src/index.ts`

Context: `FirestoreService` (from `@bk2/shared-data-access`) provides `readObject<T>(collectionName, key)` which wraps `docData(doc(firestore, path))` and `searchData<T>(collectionName, dbQuery, orderBy, sortOrder)` which wraps `collectionData`. Stats documents live at 4-segment Firestore paths, e.g. `stats_boats/B1/years/2026`.

- [ ] **Step 1: Write the unit test file**

Create `libs/geo/trip/data-access/src/lib/trip-stats.service.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';

// Minimal mock for FirestoreService
const mockReadObject = vi.fn();
const mockSearchData = vi.fn();
vi.mock('@bk2/shared-data-access', () => ({
  FirestoreService: class {
    readObject = mockReadObject;
    searchData   = mockSearchData;
  },
}));

import { TestBed } from '@angular/core/testing';
import { TripStatsService, YearStats } from './trip-stats.service';
import { FirestoreService } from '@bk2/shared-data-access';

describe('TripStatsService', () => {
  let service: TripStatsService;

  beforeEach(() => {
    mockReadObject.mockReset();
    mockSearchData.mockReset();
    TestBed.configureTestingModule({ providers: [TripStatsService] });
    service = TestBed.inject(TripStatsService);
  });

  it('getStats calls readObject with the correct path', async () => {
    const expected: YearStats = { totalKm: 120, tripCount: 5 };
    mockReadObject.mockReturnValue(of(expected));
    const result = await firstValueFrom(service.getStats('boats', 'B1', 2026));
    expect(mockReadObject).toHaveBeenCalledWith('stats_boats/B1/years', '2026');
    expect(result).toEqual(expected);
  });

  it('getStats calls readObject for members with the correct path', async () => {
    mockReadObject.mockReturnValue(of(undefined));
    await firstValueFrom(service.getStats('members', 'M5', 2025));
    expect(mockReadObject).toHaveBeenCalledWith('stats_members/M5/years', '2025');
  });

  it('getHistory calls searchData with the correct collection path', async () => {
    const history: YearStats[] = [
      { bkey: '2025', totalKm: 100, tripCount: 4 },
      { bkey: '2026', totalKm: 150, tripCount: 6 },
    ];
    mockSearchData.mockReturnValue(of(history));
    const result = await firstValueFrom(service.getHistory('boats', 'B1'));
    expect(mockSearchData).toHaveBeenCalledWith('stats_boats/B1/years', [], '__name__', 'asc');
    expect(result).toEqual(history);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm run test trip-data-access
```
Expected: FAIL — `TripStatsService` not yet defined.

- [ ] **Step 3: Create the service**

Create `libs/geo/trip/data-access/src/lib/trip-stats.service.ts`:

```typescript
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';

export interface YearStats {
  bkey?: string;   // document ID (year string e.g. '2026') — present when loaded via searchData
  totalKm: number;
  tripCount: number;
}

@Injectable({ providedIn: 'root' })
export class TripStatsService {
  private readonly firestoreService = inject(FirestoreService);

  getStats(entityType: 'boats' | 'members', key: string, year: number): Observable<YearStats | undefined> {
    return this.firestoreService.readObject<YearStats>(`stats_${entityType}/${key}/years`, String(year));
  }

  getHistory(entityType: 'boats' | 'members', key: string): Observable<YearStats[]> {
    return this.firestoreService.searchData<YearStats>(`stats_${entityType}/${key}/years`, [], '__name__', 'asc');
  }
}
```

- [ ] **Step 4: Export from the library index**

Edit `libs/geo/trip/data-access/src/index.ts` — add:

```typescript
export * from './lib/trip-stats.service';
```

Full file after edit:
```typescript
export * from './lib/trip.service';
export * from './lib/trip-stats.service';
```

- [ ] **Step 5: Run tests — expect pass**

```bash
pnpm run test trip-data-access
```
Expected: PASS (3 tests).

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/geo/trip/data-access/tsconfig.json
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/geo/trip/data-access/src/lib/trip-stats.service.ts \
        libs/geo/trip/data-access/src/lib/trip-stats.service.spec.ts \
        libs/geo/trip/data-access/src/index.ts
git commit -m "feat(trip-data-access): add TripStatsService with getStats and getHistory"
```

---

## Task 3: Cloud Function — `onTripWrite` with `computeDeltas`

**Files:**
- Create: `apps/functions/src/trip/index.ts`

Context: Follow the exact pattern in `apps/functions/src/task/index.ts`. Region is `'europe-west6'`. Interfaces are inlined (no monorepo imports). The `computeDeltas` function is pure and exported so it can be unit-tested. Stats paths: `stats_boats/${boatKey}/years/${yearStr}` (4 segments) and `stats_members/${memberKey}/years/${yearStr}` (4 segments).

- [ ] **Step 1: Write the unit test for `computeDeltas`**

Create `apps/functions/src/trip/index.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDeltas } from './index';

const BOAT_KEY = 'B1';
const MEMBER_1 = 'M1';
const MEMBER_2 = 'M2';

function makeTrip(overrides: Partial<Parameters<typeof computeDeltas>[0]> = {}) {
  return {
    state: 'closed',
    distance: 10,
    startDate: '20260515',
    resource: { key: BOAT_KEY },
    participants: [{ key: MEMBER_1 }, { key: MEMBER_2 }],
    ...overrides,
  };
}

describe('computeDeltas', () => {
  it('create counted trip: adds km and count to boat and each member', () => {
    const deltas = computeDeltas(undefined, makeTrip());
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_1}/years/2026`, km: 10, count: 1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_2}/years/2026`, km: 10, count: 1 });
    expect(deltas).toHaveLength(3);
  });

  it('create draft trip: no deltas', () => {
    expect(computeDeltas(undefined, makeTrip({ state: 'draft' }))).toHaveLength(0);
  });

  it('create deleted trip (no .corr): no deltas', () => {
    expect(computeDeltas(undefined, makeTrip({ state: 'deleted' }))).toHaveLength(0);
  });

  it('delete counted trip: subtracts km', () => {
    const deltas = computeDeltas(makeTrip(), undefined);
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: -10, count: -1 });
    expect(deltas).toContainEqual({ path: `stats_members/${MEMBER_1}/years/2026`, km: -10, count: -1 });
    expect(deltas).toHaveLength(3);
  });

  it('state change: open -> closed adds deltas', () => {
    const deltas = computeDeltas(makeTrip({ state: 'open' }), makeTrip({ state: 'closed' }));
    // before was not in COUNTING_STATES, after is
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
  });

  it('state change: closed -> deleted subtracts', () => {
    const deltas = computeDeltas(makeTrip({ state: 'closed' }), makeTrip({ state: 'deleted' }));
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: -10, count: -1 });
  });

  it('distance edit within counted state: net delta applied', () => {
    const deltas = computeDeltas(makeTrip({ distance: 10 }), makeTrip({ distance: 14 }));
    // subtract old (-10), add new (+14) → net +4
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 4, count: 0 });
  });

  it('deleted.corr state counts', () => {
    const deltas = computeDeltas(undefined, makeTrip({ state: 'deleted.corr' }));
    expect(deltas).toContainEqual({ path: `stats_boats/${BOAT_KEY}/years/2026`, km: 10, count: 1 });
  });

  it('missing resource.key: skips boat delta', () => {
    const deltas = computeDeltas(undefined, makeTrip({ resource: undefined }));
    const boatDelta = deltas.find(d => d.path.startsWith('stats_boats'));
    expect(boatDelta).toBeUndefined();
    expect(deltas).toHaveLength(2); // only members
  });

  it('aggregates duplicate paths', () => {
    // same before and after same boat but different distance: net delta
    const deltas = computeDeltas(makeTrip({ distance: 10 }), makeTrip({ distance: 12 }));
    const boatDelta = deltas.find(d => d.path === `stats_boats/${BOAT_KEY}/years/2026`);
    expect(boatDelta?.km).toBe(2); // -10 + 12
    expect(boatDelta?.count).toBe(0); // -1 + 1
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm run test functions
```
Expected: FAIL — `computeDeltas` not yet defined.

- [ ] **Step 3: Create `apps/functions/src/trip/index.ts`**

```typescript
// apps/functions/src/trip/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west6';

const COUNTING_STATES = new Set([
  'closed',
  'closed.rev',
  'deleted.corr',
  'deleted.corr.rev',
]);

// Inlined — no monorepo cross-bundle imports
interface TripDoc {
  state: string;
  distance: number;
  startDate: string;  // 'yyyyMMdd'
  resource?: { key?: string };
  participants?: Array<{ key?: string }>;
}

export interface StatDelta {
  path: string;
  km: number;
  count: number;
}

function effectiveTrip(doc: TripDoc | undefined): TripDoc | undefined {
  return doc && COUNTING_STATES.has(doc.state) ? doc : undefined;
}

function collectDeltas(doc: TripDoc, sign: 1 | -1, out: Map<string, StatDelta>): void {
  const year = (doc.startDate ?? '').substring(0, 4);
  if (!year || year === '0000') return;

  function accumulate(path: string): void {
    const existing = out.get(path) ?? { path, km: 0, count: 0 };
    out.set(path, {
      path,
      km:    existing.km    + sign * doc.distance,
      count: existing.count + sign,
    });
  }

  const boatKey = doc.resource?.key;
  if (boatKey) accumulate(`stats_boats/${boatKey}/years/${year}`);

  for (const p of doc.participants ?? []) {
    if (p.key) accumulate(`stats_members/${p.key}/years/${year}`);
  }
}

export function computeDeltas(
  rawBefore: TripDoc | undefined,
  rawAfter:  TripDoc | undefined,
): StatDelta[] {
  const map = new Map<string, StatDelta>();
  const before = effectiveTrip(rawBefore);
  const after  = effectiveTrip(rawAfter);
  if (before) collectDeltas(before, -1, map);
  if (after)  collectDeltas(after,   1, map);
  return [...map.values()];
}

export const onTripWrite = onDocumentWritten(
  { document: 'trips/{tripId}', region: REGION },
  async (event) => {
    const rawBefore = event.data?.before?.data() as TripDoc | undefined;
    const rawAfter  = event.data?.after?.data()  as TripDoc | undefined;

    const deltas = computeDeltas(rawBefore, rawAfter);
    if (!deltas.length) return;

    const db = getFirestore();
    await db.runTransaction(async (tx) => {
      const refs  = deltas.map(d => db.doc(d.path));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < deltas.length; i++) {
        const cur = snaps[i].data() ?? { totalKm: 0, tripCount: 0 };
        tx.set(refs[i], {
          totalKm:   (cur['totalKm']   as number ?? 0) + deltas[i].km,
          tripCount: (cur['tripCount'] as number ?? 0) + deltas[i].count,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    logger.info(`onTripWrite: applied ${deltas.length} stat delta(s)`);
  }
);
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
pnpm run test functions
```
Expected: PASS (9 tests).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/functions/src/trip/index.ts apps/functions/src/trip/index.spec.ts
git commit -m "feat(functions): add onTripWrite CF with computeDeltas helper"
```

---

## Task 4: Cloud Function — `onTripStatsReconcile` + export registration

**Files:**
- Modify: `apps/functions/src/trip/index.ts` (append `onTripStatsReconcile`)
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Append `onTripStatsReconcile` to `apps/functions/src/trip/index.ts`**

Add after the `onTripWrite` export:

```typescript
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const onTripStatsReconcile = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Europe/Zurich', region: REGION },
  async () => {
    const db = getFirestore();
    const year     = new Date().getFullYear();
    const yearStr  = String(year);
    const fromDate = `${yearStr}0101`;
    const toDate   = `${yearStr}1231`;

    const snap = await db.collection('trips')
      .where('startDate', '>=', fromDate)
      .where('startDate', '<=', toDate)
      .get();

    const boatTotals   = new Map<string, { totalKm: number; tripCount: number }>();
    const memberTotals = new Map<string, { totalKm: number; tripCount: number }>();

    for (const doc of snap.docs) {
      const t = doc.data() as TripDoc;
      if (!COUNTING_STATES.has(t.state)) continue;

      const boatKey = t.resource?.key;
      if (boatKey) {
        const cur = boatTotals.get(boatKey) ?? { totalKm: 0, tripCount: 0 };
        boatTotals.set(boatKey, { totalKm: cur.totalKm + t.distance, tripCount: cur.tripCount + 1 });
      }

      for (const p of t.participants ?? []) {
        if (!p.key) continue;
        const cur = memberTotals.get(p.key) ?? { totalKm: 0, tripCount: 0 };
        memberTotals.set(p.key, { totalKm: cur.totalKm + t.distance, tripCount: cur.tripCount + 1 });
      }
    }

    const batch = db.batch();
    for (const [key, totals] of boatTotals) {
      batch.set(db.doc(`stats_boats/${key}/years/${yearStr}`), { ...totals, updatedAt: FieldValue.serverTimestamp() });
    }
    for (const [key, totals] of memberTotals) {
      batch.set(db.doc(`stats_members/${key}/years/${yearStr}`), { ...totals, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();

    logger.info(`onTripStatsReconcile: wrote ${boatTotals.size} boat + ${memberTotals.size} member docs for ${yearStr}`);
  }
);
```

- [ ] **Step 2: Register both functions in `apps/functions/src/main.ts`**

Add the import near the other `* as X` imports at the top of `main.ts`:
```typescript
import * as Trip from './trip';
```

Add the exports after the `// task notifications` block:
```typescript
// trip stats
export const onTripWrite           = Trip.onTripWrite;
export const onTripStatsReconcile  = Trip.onTripStatsReconcile;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p apps/functions/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/functions/src/trip/index.ts apps/functions/src/main.ts
git commit -m "feat(functions): add onTripStatsReconcile scheduled CF and register trip exports"
```

---

## Task 5: Add `@bk2/trip-data-access` dependency to `cms-section-feature`

**Files:**
- Modify: `libs/cms/section/feature/package.json`
- Modify: `libs/cms/section/feature/tsconfig.json`

- [ ] **Step 1: Add dependency to `package.json`**

In `libs/cms/section/feature/package.json`, add `"@bk2/trip-data-access": "*"` to the `dependencies` block. Final `dependencies` block:

```json
{
  "name": "@bk2/cms-section-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-categories": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/cms-section-data-access": "*",
    "@bk2/cms-section-util": "*",
    "@bk2/cms-section-ui": "*",
    "@bk2/calevent-data-access": "*",
    "@bk2/calevent-util": "*",
    "@bk2/subject-group-util": "*",
    "@bk2/avatar-data-access": "*",
    "@bk2/document-ui": "*",
    "@bk2/document-feature": "*",
    "@bk2/activity-data-access": "*",
    "@bk2/activity-feature": "*",
    "@bk2/relationship-membership-data-access": "*",
    "@bk2/relationship-responsibility-data-access": "*",
    "@bk2/trip-data-access": "*"
  }
}
```

- [ ] **Step 2: Add tsconfig reference**

In `libs/cms/section/feature/tsconfig.json`, add to the `references` array (after the `responsibility/data-access` entry):
```json
{"path": "../../../geo/trip/data-access/tsconfig.lib.json"}
```

- [ ] **Step 3: Type-check (should still pass — no new imports yet)**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/section/feature/package.json libs/cms/section/feature/tsconfig.json
git commit -m "chore(cms-section-feature): add trip-data-access dependency"
```

---

## Task 6: TripStatsSectionStore

**Files:**
- Create: `libs/cms/section/feature/src/lib/trip-stats-section.store.ts`

Context:
- `AppStore` (from `@bk2/shared-feature`) exposes `allResources(): ResourceModel[]` and `allPersons(): PersonModel[]`
- `TripStatsService` (from `@bk2/trip-data-access`) provides `getStats(entityType, key, year)` and `getHistory(entityType, key)`
- Two separate `rxResource` instances: `listResource` (loads only selected year) and `graphResource` (loads full history). Each short-circuits with `of([])` when viewType doesn't match, avoiding unnecessary reads.
- `EChartsOption` type comes from `'echarts'`
- `combineLatest` from `'rxjs'`
- The store follows the pattern established in `member-age-section.store.ts`
- `PFX = '@cms/section/feature.'` (from `./scope`)

- [ ] **Step 1: Create `trip-stats-section.store.ts`**

```typescript
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of } from 'rxjs';
import type { EChartsOption } from 'echarts';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PersonModel, ResourceModel, TripStatsConfig } from '@bk2/shared-models';
import { TripStatsService, YearStats } from '@bk2/trip-data-access';

import { PFX } from './scope';

const TRIP_STATS_I18N_KEYS = {
  empty:    PFX + 'tripStats.empty',
  colName:  PFX + 'tripStats.colName',
  colKm:    PFX + 'tripStats.colKm',
  colTrips: PFX + 'tripStats.colTrips',
} satisfies Record<string, string>;

export type TripStatsI18n = { [K in keyof typeof TRIP_STATS_I18N_KEYS]: Signal<string> };

export interface StatsRow {
  key: string;
  name: string;
  km: number;
  trips: number;
}

type TripStatsSectionState = {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
  selectedYear: number;
  sortField: 'km' | 'trips';
  sortAsc: boolean;
  searchTerm: string;
};

const initialState: TripStatsSectionState = {
  viewType: 'list',
  contentType: 'boat',
  selectedYear: new Date().getFullYear(),
  sortField: 'km',
  sortAsc: false,
  searchTerm: '',
};

export const TripStatsSectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore:         inject(AppStore),
    tripStatsService: inject(TripStatsService),
    i18nService:      inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TRIP_STATS_I18N_KEYS),
  })),
  withComputed(store => ({
    entityKeys: computed(() => {
      if (store.contentType() === 'boat') {
        return store.appStore.allResources()
          .filter((r: ResourceModel) => r.type === 'rboat')
          .map((r: ResourceModel) => r.bkey)
          .filter((k): k is string => !!k);
      }
      return store.appStore.allPersons()
        .map((p: PersonModel) => p.bkey)
        .filter((k): k is string => !!k);
    }),
  })),
  withProps(store => ({
    // Loads only the selected year — active when viewType === 'list'
    listResource: rxResource({
      params: () => ({
        viewType:     store.viewType(),
        entityType:   store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
        keys:         store.entityKeys(),
        selectedYear: store.selectedYear(),
      }),
      stream: ({ params }) => {
        if (params.viewType !== 'list' || !params.keys.length) return of([] as Array<{ key: string; stats: YearStats | undefined }>);
        return combineLatest(
          params.keys.map(key =>
            store.tripStatsService.getStats(params.entityType, key, params.selectedYear).pipe(
              map(stats => ({ key, stats }))
            )
          )
        );
      },
    }),
    // Loads full history — active when viewType === 'graph'
    graphResource: rxResource({
      params: () => ({
        viewType:   store.viewType(),
        entityType: store.contentType() === 'boat' ? 'boats' as const : 'members' as const,
        keys:       store.entityKeys(),
      }),
      stream: ({ params }) => {
        if (params.viewType !== 'graph' || !params.keys.length) return of([] as Array<{ key: string; history: YearStats[] }>);
        return combineLatest(
          params.keys.map(key =>
            store.tripStatsService.getHistory(params.entityType, key).pipe(
              map(history => ({ key, history }))
            )
          )
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.listResource.isLoading() || store.graphResource.isLoading()),

    listRows: computed((): StatsRow[] => {
      const raw         = store.listResource.value() ?? [];
      const term        = store.searchTerm().toLowerCase();
      const contentType = store.contentType();
      const sortField   = store.sortField();
      const sortAsc     = store.sortAsc();

      return raw
        .map(({ key, stats }: { key: string; stats: YearStats | undefined }) => {
          let name: string;
          if (contentType === 'boat') {
            name = store.appStore.allResources().find((r: ResourceModel) => r.bkey === key)?.name ?? key;
          } else {
            const p = store.appStore.allPersons().find((p: PersonModel) => p.bkey === key);
            name = p ? `${p.firstName} ${p.lastName}`.trim() : key;
          }
          return { key, name, km: stats?.totalKm ?? 0, trips: stats?.tripCount ?? 0 };
        })
        .filter(r => r.km > 0 && (!term || r.name.toLowerCase().includes(term)))
        .sort((a, b) => {
          const diff = sortField === 'km' ? b.km - a.km : b.trips - a.trips;
          return sortAsc ? -diff : diff;
        });
    }),

    echartsOption: computed((): EChartsOption | null => {
      const raw = store.graphResource.value() ?? [];
      if (!raw.length) return null;

      const yearMap = new Map<string, number>();
      for (const { history } of raw as { key: string; history: YearStats[] }[]) {
        for (const h of history) {
          if (!h.bkey) continue;
          yearMap.set(h.bkey, (yearMap.get(h.bkey) ?? 0) + h.totalKm);
        }
      }
      const years = [...yearMap.keys()].sort();
      if (!years.length) return null;

      return {
        xAxis: { type: 'category', data: years },
        yAxis: { type: 'value', name: 'km' },
        tooltip: { trigger: 'axis' },
        series: [{
          name: 'Total km',
          type: 'line',
          smooth: true,
          data: years.map(y => yearMap.get(y) ?? 0),
        }],
      };
    }),
  })),
  withMethods(store => ({
    setConfig(config: TripStatsConfig | undefined): void {
      if (!config) return;
      patchState(store, {
        viewType:    config.viewType    ?? 'list',
        contentType: config.contentType ?? 'boat',
      });
    },

    setYear(selectedYear: number): void {
      patchState(store, { selectedYear });
    },

    setSearchTerm(searchTerm: string): void {
      patchState(store, { searchTerm });
    },

    setSort(field: 'km' | 'trips'): void {
      patchState(store, {
        sortAsc:   store.sortField() === field ? !store.sortAsc() : false,
        sortField: field,
      });
    },
  }))
);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/cms/section/feature/src/lib/trip-stats-section.store.ts
git commit -m "feat(cms-section-feature): add TripStatsSectionStore"
```

---

## Task 7: TripStatsSectionComponent + SectionDispatcher update

**Files:**
- Create: `libs/cms/section/feature/src/lib/trip-stats-section.ts`
- Modify: `libs/cms/section/feature/src/lib/section-dispatcher.ts`

Context: Follow the exact echarts import pattern from `chart-section.ts` (which uses `provideEchartsCore`). The `ListFilter` component (from `@bk2/shared-ui`) shows a year selector when `[years]` is provided and a search bar when `showSearch` is `true` (default). Available years passed as a plain array, not a signal (defined as a class field). The `section-dispatcher.ts` needs one import line added and one `@case` block added before `@default`.

- [ ] **Step 1: Create `trip-stats-section.ts`**

```typescript
import { Component, computed, effect, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([LineChart, BarChart, GridComponent, CanvasRenderer, LegendComponent, TooltipComponent]);

import { TripStatsSection } from '@bk2/shared-models';
import { EmptyList, ListFilter, OptionalCardHeader, Spinner } from '@bk2/shared-ui';

import { TripStatsSectionStore } from './trip-stats-section.store';

@Component({
  selector: 'bk-trip-stats-section',
  standalone: true,
  imports: [
    Spinner, EmptyList, OptionalCardHeader, ListFilter, NgxEchartsDirective,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  providers: [
    TripStatsSectionStore,
    provideEchartsCore({ echarts }),
  ],
  styles: [`
    .header-row { font-weight: 600; }
    .clickable   { cursor: pointer; user-select: none; }
    .num         { text-align: right; }
    .chart       { height: 300px; }
    ion-card         { padding: 0; margin: 0; border: 0; box-shadow: none !important; }
    ion-card-content { padding: 0; }
  `],
  template: `
    @if(store.isLoading()) {
      <bk-spinner />
    } @else {
      <bk-list-filter
        [years]="availableYears"
        [selectedYear]="store.selectedYear()"
        (yearChanged)="store.setYear($event)"
        (searchTermChanged)="store.setSearchTerm($event)"
      />
      @if(store.listRows().length === 0 && store.viewType() === 'list') {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        @switch(store.viewType()) {
          @case('list') {
            <ion-card>
              <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
              <ion-card-content>
                <ion-grid>
                  <ion-row class="header-row">
                    <ion-col>{{ store.i18n.colName() }}</ion-col>
                    <ion-col class="num clickable" (click)="store.setSort('km')">
                      {{ store.i18n.colKm() }}{{ sortIcon('km') }}
                    </ion-col>
                    <ion-col class="num clickable" (click)="store.setSort('trips')">
                      {{ store.i18n.colTrips() }}{{ sortIcon('trips') }}
                    </ion-col>
                  </ion-row>
                  @for(row of store.listRows(); track row.key) {
                    <ion-row>
                      <ion-col>{{ row.name }}</ion-col>
                      <ion-col class="num">{{ row.km }}</ion-col>
                      <ion-col class="num">{{ row.trips }}</ion-col>
                    </ion-row>
                  }
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
          @case('graph') {
            @if(store.echartsOption(); as opt) {
              <ion-card>
                <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
                <ion-card-content>
                  <div echarts [options]="opt" class="chart"></div>
                </ion-card-content>
              </ion-card>
            } @else {
              <bk-empty-list [message]="store.i18n.empty()" />
            }
          }
        }
      }
    }
  `,
})
export class TripStatsSectionComponent {
  protected readonly store = inject(TripStatsSectionStore);

  public section  = input<TripStatsSection>();
  public editMode = input<boolean>(false);

  protected readonly title    = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  protected readonly availableYears = Array.from(
    { length: 10 },
    (_, i) => new Date().getFullYear() - i,
  );

  constructor() {
    effect(() => {
      this.store.setConfig(this.section()?.properties);
    });
  }

  protected sortIcon(field: 'km' | 'trips'): string {
    if (this.store.sortField() !== field) return '';
    return this.store.sortAsc() ? ' ↑' : ' ↓';
  }
}
```

- [ ] **Step 2: Update `section-dispatcher.ts` — add import**

At the top of `section-dispatcher.ts`, after the `MemberCatSectionComponent` import (line 36), add:

```typescript
import { TripStatsSectionComponent } from './trip-stats-section';
```

- [ ] **Step 3: Update `section-dispatcher.ts` — add to imports array**

The `@Component` decorator in `section-dispatcher.ts` has an `imports` array. Add `TripStatsSectionComponent` to it alongside the other section components. The imports array currently ends with `MemberCatSectionComponent`. Add it after:

```typescript
MemberCatSectionComponent,
TripStatsSectionComponent,
```

- [ ] **Step 4: Update `section-dispatcher.ts` — add `@case` block**

In the template, after the `@case('member-cat')` block (line 161-163) and before `@default` (line 164), insert:

```html
          @case('trip-stats') {
            <bk-trip-stats-section [section]="section" [editMode]="editMode()" />
          }
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/cms/section/feature/src/lib/trip-stats-section.ts \
        libs/cms/section/feature/src/lib/section-dispatcher.ts
git commit -m "feat(cms-section-feature): add TripStatsSectionComponent and register in dispatcher"
```

---

## Task 8: TripStatsConfiguration (section-ui config component)

**Files:**
- Create: `libs/cms/section/ui/src/lib/trip-stats-configuration.ts`
- Modify: `libs/cms/section/ui/src/index.ts`

Context: `PFX = '@cms/section/ui.'` (from `./scope`). `StringSelect` (from `@bk2/shared-ui`) takes `i18n: StringSelectI18n`, `selectedString: model('')`, `stringList: string[]`, `readOnly: boolean`. Use `model.required<TripStatsConfig>()` for two-way binding, matching the pattern of `people-configuration.ts`.

- [ ] **Step 1: Create `trip-stats-configuration.ts`**

```typescript
import { Component, computed, inject, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TripStatsConfig } from '@bk2/shared-models';
import { StringSelect, StringSelectI18n } from '@bk2/shared-ui';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Component({
  selector: 'bk-trip-stats-config',
  standalone: true,
  imports: [
    StringSelect,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ headerTitle() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="viewTypeI18n()"
                [selectedString]="formData().viewType"
                (selectedStringChange)="onViewTypeChange($event)"
                [stringList]="['list', 'graph']"
                [readOnly]="false"
              />
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-string-select
                [i18n]="contentTypeI18n()"
                [selectedString]="formData().contentType"
                (selectedStringChange)="onContentTypeChange($event)"
                [stringList]="['boat', 'member']"
                [readOnly]="false"
              />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `,
})
export class TripStatsConfiguration {
  private readonly i18nService = inject(I18nService);

  public formData    = model.required<TripStatsConfig>();
  public headerTitle = input('@content.section.type.tripStats.edit');

  protected readonly fieldI18n = this.i18nService.translateAll({
    viewType_label:    PFX + 'tripStats.viewType_label',
    contentType_label: PFX + 'tripStats.contentType_label',
  });

  protected viewTypeI18n    = computed(() => ({ name: 'viewType',    label: this.fieldI18n.viewType_label()    } as StringSelectI18n));
  protected contentTypeI18n = computed(() => ({ name: 'contentType', label: this.fieldI18n.contentType_label() } as StringSelectI18n));

  protected onViewTypeChange(viewType: string): void {
    this.formData.update(vm => ({ ...vm, viewType: viewType as TripStatsConfig['viewType'] }));
  }

  protected onContentTypeChange(contentType: string): void {
    this.formData.update(vm => ({ ...vm, contentType: contentType as TripStatsConfig['contentType'] }));
  }
}
```

- [ ] **Step 2: Export from `libs/cms/section/ui/src/index.ts`**

Add at the end of the file:
```typescript
export * from './lib/trip-stats-configuration';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/cms/section/ui/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/cms/section/ui/src/lib/trip-stats-configuration.ts \
        libs/cms/section/ui/src/index.ts
git commit -m "feat(cms-section-ui): add TripStatsConfiguration component"
```

---

## Task 9: i18n translations + final build

**Files:**
- Modify: `libs/cms/section/feature/src/i18n/de.json`
- Modify: `libs/cms/section/ui/src/i18n/de.json`

- [ ] **Step 1: Add keys to section feature `de.json`**

The feature `de.json` is a large file. The store uses these keys under the prefix `@cms/section/feature.`. Add the `tripStats` block inside the root JSON object. Find the end of the `memberCat` block and add after it:

```json
  "tripStats": {
    "empty":    "Keine Statistiken für dieses Jahr gefunden.",
    "colName":  "Name",
    "colKm":    "km",
    "colTrips": "Fahrten"
  }
```

- [ ] **Step 2: Add keys to section ui `de.json`**

The ui `de.json` is also large. The config component uses keys under `@cms/section/ui.`. Add before the closing `}` of the root object (inside the existing `actionsheet` or root level):

```json
  "tripStats": {
    "viewType_label":    "Ansichtstyp",
    "contentType_label": "Inhaltstyp"
  }
```

Also add the `headerTitle` i18n key (used as a plain string, not resolved through translateAll, but add it to `@content.section.type.tripStats.edit` in the app's section-related i18n if that file exists). Check if `@content.section.type.tripStats.edit` needs to be defined — if the key is only used as the `headerTitle` default input value and Transloco resolves it at runtime from the app's i18n files, add it to the app's de.json. If not found, it shows the raw key which is acceptable for admin-only config UI.

- [ ] **Step 3: Build the scs-app to verify everything compiles**

```bash
pnpm nx build scs-app
```
Expected: successful build with no errors.

- [ ] **Step 4: Run all affected tests**

```bash
pnpm run test trip-data-access
pnpm run test functions
```
Expected: all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add libs/cms/section/feature/src/i18n/de.json \
        libs/cms/section/ui/src/i18n/de.json
git commit -m "feat(trip-stats): add i18n translations for trip-stats section"
```

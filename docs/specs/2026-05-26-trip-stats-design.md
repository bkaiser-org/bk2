# Trip Statistics Design

## Context

The club app records rowing trips. This spec adds:

1. **Cloud Function `onTripWrite`** — maintains per-boat and per-member kilometre aggregates in Firestore stat subcollections whenever a trip document is written.
2. **Nightly reconcile CF `onTripStatsReconcile`** — rewrites current-year aggregates from scratch as drift protection.
3. **`trip-stats` CMS section type** — displays either a sortable list (boat-km or member-km for a selectable year) or a yearly-total line chart (echarts), placed via the existing Section → SectionDispatcher pattern.

---

## Field Mapping

The existing `TripModel` is **not** changed. The Cloud Function maps its Firestore fields:

| Stat concept | TripModel Firestore field |
|---|---|
| Boat ID | `resource.key` |
| Member IDs | `participants[i].key` (array, skip missing keys) |
| Year | `parseInt(startDate.substring(0, 4), 10)` |
| Distance | `distance` |
| State | `state` |

---

## COUNTING_STATES

```ts
const COUNTING_STATES = new Set([
  'closed',
  'closed.rev',
  'deleted.corr',
  'deleted.corr.rev',
]);
```

A trip contributes to aggregates iff its `state` is in this set. The spec's rationale: drafts and open trips don't count; soft-deleted trips don't count; restored trips (`deleted.corr`) count again.

---

## Firestore Stat Collections

```
stats/boats/{boatKey}/years/{year}   → { totalKm: number, tripCount: number, updatedAt: Timestamp }
stats/members/{memberKey}/years/{year} → { totalKm: number, tripCount: number, updatedAt: Timestamp }
```

- `boatKey` = `resource.key` from `TripModel`
- `memberKey` = `participants[i].key` from `TripModel`
- `year` = 4-digit string, e.g. `"2026"`
- Documents that don't exist yet are created on first write (merge: true)

---

## Architecture

```
TripModel write (Firestore)
  └─ onTripWrite CF
       ├─ read before + after
       ├─ computeDeltas(effectiveBefore, effectiveAfter)
       └─ runTransaction → update stats/boats + stats/members docs

onTripStatsReconcile (scheduled 02:00 Zurich, nightly)
  ├─ query trips for current year
  └─ overwrite current-year stats/boats + stats/members docs

TripStatsSectionComponent (cms/section/feature)
  └─ TripStatsSectionStore
       ├─ reads AppStore.allResources() (boats) / AppStore.allPersons() (members)
       ├─ rxResource → TripStatsService (reads stats subcollections)
       └─ computed → list rows OR EChartsOption (graph)
```

---

## Files

### New files

| Path | Purpose |
|---|---|
| `apps/functions/src/trip/index.ts` | `onTripWrite` + `onTripStatsReconcile` CFs |
| `libs/geo/trip/data-access/src/lib/trip-stats.service.ts` | Firestore reads for stats subcollections |
| `libs/cms/section/feature/src/lib/trip-stats-section.store.ts` | NgRx Signal Store for the stats section |
| `libs/cms/section/feature/src/lib/trip-stats-section.ts` | Smart section component (list + graph views) |
| `libs/cms/section/ui/src/lib/trip-stats-configuration.ts` | Section-config UI for viewType + contentType |

### Modified files

| Path | Change |
|---|---|
| `apps/functions/src/main.ts` | Add `* as Trip` import + export both CFs |
| `libs/shared/models/src/lib/section.model.ts` | Add `TripStatsSection`, `TripStatsConfig`, add `'trip-stats'` to `SectionType` and discriminated union |
| `libs/cms/section/feature/src/lib/section-dispatcher.ts` | Add `@case('trip-stats')` + import |
| `libs/cms/section/feature/package.json` | Add `@bk2/trip-data-access` dependency |
| `libs/cms/section/feature/tsconfig.json` | Add reference to `../../../geo/trip/data-access/tsconfig.lib.json` |
| `libs/cms/section/ui/src/index.ts` | Export `TripStatsConfiguration` |
| `libs/geo/trip/data-access/src/index.ts` | Export `TripStatsService` |
| `libs/cms/section/feature/src/i18n/de.json` | Add `tripStats.*` i18n keys |

---

## Cloud Function Details

### `onTripWrite`

```ts
// apps/functions/src/trip/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west6';
const COUNTING_STATES = new Set(['closed', 'closed.rev', 'deleted.corr', 'deleted.corr.rev']);

interface TripDoc {
  state: string;
  distance: number;
  startDate: string;            // 'yyyyMMdd'
  resource?: { key?: string };
  participants?: Array<{ key?: string }>;
}

interface StatDelta {
  path: string;   // e.g. 'stats/boats/abc123/years/2026'
  km: number;
  count: number;
}

function extractYear(startDate: string): string {
  return startDate?.substring(0, 4) ?? '0000';
}

function computeDeltas(before: TripDoc | undefined, after: TripDoc | undefined): StatDelta[] {
  const deltas: StatDelta[] = [];

  function subtract(doc: TripDoc): void {
    const year = extractYear(doc.startDate);
    const boatKey = doc.resource?.key;
    if (boatKey) deltas.push({ path: `stats/boats/${boatKey}/years/${year}`, km: -doc.distance, count: -1 });
    for (const p of doc.participants ?? []) {
      if (p.key) deltas.push({ path: `stats/members/${p.key}/years/${year}`, km: -doc.distance, count: -1 });
    }
  }

  function add(doc: TripDoc): void {
    const year = extractYear(doc.startDate);
    const boatKey = doc.resource?.key;
    if (boatKey) deltas.push({ path: `stats/boats/${boatKey}/years/${year}`, km: doc.distance, count: 1 });
    for (const p of doc.participants ?? []) {
      if (p.key) deltas.push({ path: `stats/members/${p.key}/years/${year}`, km: doc.distance, count: 1 });
    }
  }

  if (before) subtract(before);
  if (after) add(after);
  return deltas;
}

export const onTripWrite = onDocumentWritten(
  { document: 'trips/{tripId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const rawBefore = event.data?.before?.data() as TripDoc | undefined;
    const rawAfter  = event.data?.after?.data()  as TripDoc | undefined;

    const effectiveBefore = rawBefore && COUNTING_STATES.has(rawBefore.state) ? rawBefore : undefined;
    const effectiveAfter  = rawAfter  && COUNTING_STATES.has(rawAfter.state)  ? rawAfter  : undefined;

    if (!effectiveBefore && !effectiveAfter) return;

    const deltas = computeDeltas(effectiveBefore, effectiveAfter);
    if (!deltas.length) return;

    await db.runTransaction(async (tx) => {
      const refs = deltas.map(d => db.doc(d.path));
      const snaps = await Promise.all(refs.map(r => tx.get(r)));
      for (let i = 0; i < deltas.length; i++) {
        const cur = snaps[i].data() ?? { totalKm: 0, tripCount: 0 };
        tx.set(refs[i], {
          totalKm:   cur.totalKm   + deltas[i].km,
          tripCount: cur.tripCount + deltas[i].count,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });
  }
);
```

### `onTripStatsReconcile`

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';

export const onTripStatsReconcile = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Europe/Zurich', region: REGION },
  async () => {
    const db = getFirestore();
    const year = new Date().getFullYear();
    const yearStr = String(year);
    const fromDate = `${yearStr}0101`;
    const toDate   = `${yearStr}1231`;

    const snap = await db.collection('trips')
      .where('startDate', '>=', fromDate)
      .where('startDate', '<=', toDate)
      .get();

    const boatTotals = new Map<string, { totalKm: number; tripCount: number }>();
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
      batch.set(db.doc(`stats/boats/${key}/years/${yearStr}`),
        { ...totals, updatedAt: FieldValue.serverTimestamp() });
    }
    for (const [key, totals] of memberTotals) {
      batch.set(db.doc(`stats/members/${key}/years/${yearStr}`),
        { ...totals, updatedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
);
```

---

## Schema: section.model.ts additions

```ts
export type SectionType = /* existing */ | 'trip-stats';

export type SectionModel = /* existing */ | TripStatsSectionModel;

export interface TripStatsSectionModel extends BaseSection {
  type: 'trip-stats';
  properties: TripStatsConfig;
}

export interface TripStatsConfig {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
}
```

---

## TripStatsService

```ts
// libs/geo/trip/data-access/src/lib/trip-stats.service.ts
@Injectable({ providedIn: 'root' })
export class TripStatsService {
  private readonly db = inject(Firestore);

  // One stats doc for one entity+year
  getStats(entityType: 'boats' | 'members', key: string, year: number): Observable<YearStats | undefined>

  // All year docs for one entity (graph data)
  getHistory(entityType: 'boats' | 'members', key: string): Observable<YearStats[]>
}

export interface YearStats {
  year: string;   // document ID, e.g. '2026'
  totalKm: number;
  tripCount: number;
}
```

Uses `docData` from `rxfire/firestore` for single-doc reads and `collectionData` for history reads (ordering by `__name__`).

---

## TripStatsSectionStore

```ts
type TripStatsState = {
  viewType: 'list' | 'graph';
  contentType: 'boat' | 'member';
  selectedYear: number;
};
```

**List view rxResource:**
- params: `{ contentType, selectedYear, entityKeys: string[] }` — entity keys from AppStore
- stream: `combineLatest(entityKeys.map(key => tripStatsService.getStats(entityType, key, year)))`
- computed `listRows`: join stats with entity display names; sort by km desc

**Graph view rxResource:**
- params: `{ contentType, entityKeys }`
- stream: `combineLatest(entityKeys.map(key => tripStatsService.getHistory(entityType, key)))`
- computed `echartsOption`: aggregate across all entities per year, produce a single-line `LineChart` option

**i18n keys** (prefix `@content.section.tripStats.`):
```
empty, col_name, col_km, col_trips, year_label, view_list, view_graph, content_boat, content_member
```

---

## TripStatsSectionComponent

```
selector: bk-trip-stats-section
inputs: section: TripStatsSectionModel, editMode: boolean
providers: [TripStatsSectionStore]
imports: NgxEchartsDirective, provideEchartsCore, LineChart, GridComponent, TooltipComponent, IonList, IonItem, IonLabel, IonSelect, IonSelectOption, ListFilter, OptionalCardHeader, Spinner, EmptyList
```

Template:
- Toolbar: `ListFilter` for name search (list view only) + `IonSelect` for year picker
- `@switch (store.viewType())`:
  - `@case('list')`: `IonGrid` with header row + `@for(row of store.listRows())` — columns: Name, km, nrOfTrips; click column header to sort
  - `@case('graph')`: `<div echarts [options]="store.echartsOption()" class="chart">` (height 300px)

Years available in the selector: current year down to `(currentYear - 9)` (10 years), default = current year.

---

## TripStatsConfiguration

```
selector: bk-trip-stats-config
model.required: TripStatsConfig
imports: StringSelect (viewType + contentType selectors)
```

Two `StringSelect` inputs:
- `viewType`: options `['list', 'graph']`
- `contentType`: options `['boat', 'member']`

---

## Section Dispatcher addition

In `section-dispatcher.ts`, add after `@case('member-cat')`:
```ts
@case('trip-stats') {
  <bk-trip-stats-section [section]="section" [editMode]="editMode()" />
}
```

And import `TripStatsSectionComponent` from `'./trip-stats-section'`.

---

## echarts Imports

Follow the exact pattern from `chart-section.ts`:
```ts
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
echarts.use([LineChart, GridComponent, CanvasRenderer, LegendComponent, TooltipComponent]);
```

---

## EChartsOption structure (graph view)

```ts
// Example for contentType='boat', showing total km per year across all boats:
{
  xAxis: { type: 'category', data: ['2017', '2018', ..., '2026'] },
  yAxis: { type: 'value', name: 'km' },
  series: [{
    name: 'Total km',
    type: 'line',
    smooth: true,
    data: [1200, 1400, ..., 1850],
  }],
  tooltip: { trigger: 'axis' },
}
```

The graph aggregates totalKm across all entities for each year (single line). The X axis shows all years present in the data, sorted ascending.

---

## Open Questions

None — all design decisions are resolved.

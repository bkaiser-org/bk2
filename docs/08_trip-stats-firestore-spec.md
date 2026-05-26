# Trip Statistics — Firestore Data Model Spec

## 1\. Context

The club app records boat trips taken by members. Each trip has:

- Date / time  
- Boat (1 of N)  
- Participants (1–8 members)  
- Distance in kilometres

The system must support:

- **boatkm**: per boat, sum of all `distance` within a calendar year  
- **personkm**: per participant, sum of all `distance` within a calendar year  
- **History**: 10+ years retained, used to render per-year total graphs  
- **Year-to-date view**: during the current year, the same aggregates must reflect the running total from 1 January up to today  
- **Kiosk usage**: writes come from an unauthenticated iPad in kiosk mode; reads happen often (stats displays, lists)  
- **Consistency**: aggregates must always match the underlying trips  
- **No hard deletes**: trips are never physically removed. Deletion is a state transition that is later either reverted or accepted as archived.

## 2\. Design Approach

Aggregates are **maintained on write** (not computed on read). With a decade-plus of history and frequent reads, recomputing totals on every dashboard view is wasteful. A Cloud Function listens to trip changes and updates the aggregate documents transactionally.

Trips use the existing `TripModel.state` field. The base states are:

- `draft` — being entered, not yet finalised  
- `open` — finalised, trip in progress or just completed  
- `closed` — finalised and confirmed  
- `deleted` — soft-deleted at the kiosk, pending review by trip\_responsibility

Two postfixes may apply:

- `.rev` — participants were revised after the trip was already finalised  
- `.corr` — applied to `deleted` once trip\_responsibility reverts the soft-delete (i.e. `deleted.corr` means "was deleted, now restored")

In addition to `state`, two fields record the deletion lifecycle:

- `deletedAt` — timestamp when a kiosk user soft-deleted the trip  
- `deletedBy` — identifier of trip\_responsibility when they archive the deletion (i.e. accept it as final)

### Which states count in the stats

Stats include a trip iff its state is in `COUNTING_STATES`. The proposed default set:

const COUNTING\_STATES \= new Set(\[

  'closed',

  'closed.rev',

  'deleted.corr',     // restored after soft-delete — counts again

  'deleted.corr.rev', // restored, then revised

\]);

Rationale:

- `draft` and `open` do not yet count — only `closed` trips contribute to official statistics.  
- `deleted` (without `.corr`) never counts; the soft-delete suppresses it regardless of whether trip\_responsibility has reviewed yet.  
- A pure `deleted` state that is later archived (the admin accepts the deletion) remains excluded. `deletedBy` records who archived it; the state itself stays `deleted`.

If `open` should also count toward live stats, add it to the set — the Cloud Function logic is unchanged.

## 3\. Collections

### 3.1 `/trips/{tripId}`

The source of truth. One document per trip. Documents are never physically deleted.

| Field | Type | Notes |
| :---- | :---- | :---- |
| `date` | Timestamp | Trip date/time |
| `year` | number | Denormalised calendar year, e.g. `2026` |
| `boatId` | string | Reference to `/boats/{boatId}` |
| `boatName` | string | Denormalised boat name at time of entry |
| `participantIds` | string\[\] | 1–8 member IDs |
| `distance` | integer | Whole kilometres, e.g. `12` |
| `state` | string | See § 2 — `draft` | `open` | `closed` | `deleted`, with optional `.rev` / `.corr` postfixes |
| `deletedAt` | Timestamp | null | Set when a kiosk user soft-deletes the trip; `null` otherwise |
| `deletedBy` | string | null | Identifier of trip\_responsibility once the deletion is archived (i.e. accepted as final); `null` otherwise |
| `createdAt` | Timestamp | Server timestamp |
| `createdBy` | string | `'kiosk'` or admin identifier |

**Why `year` is denormalised:** allows simple equality queries (`where('year', '==', 2026)`) without composite indexes on date ranges.

**Why `boatName` is denormalised:** historical trips keep the boat's name as it was at the time. Saves a join on every list view. Trade-off: a boat rename does not retroactively update old trip displays — this is intentional for statistics.

**Distance is an integer.** Inputs are rounded to whole kilometres at entry time. Eliminates float-accumulation concerns and matches how trips are recorded in practice.

**`deletedAt` vs. `deletedBy`:** these capture two distinct moments. `deletedAt` is written when the kiosk performs the soft-delete (no identified user — it's `'kiosk'`). `deletedBy` is written later by trip\_responsibility when they archive (accept) the deletion. If they instead revert it, the state becomes `deleted.corr`, `deletedAt` is cleared back to `null`, and `deletedBy` stays `null`.

### 3.2 `/boats/{boatId}`

| Field | Type | Notes |
| :---- | :---- | :---- |
| `name` | string | Display name |
| `active` | boolean | Hide inactive boats from kiosk UI |

### 3.3 `/members/{memberId}`

| Field | Type | Notes |
| :---- | :---- | :---- |
| `name` | string | Display name |
| `active` | boolean | Hide inactive members from kiosk UI |

### 3.4 `/stats/boats/{boatId}/years/{year}`

One document per (boat, year). Document ID is the year as a string (e.g. `"2026"`).

| Field | Type | Notes |
| :---- | :---- | :---- |
| `totalKm` | integer | Sum of `distance` for year |
| `tripCount` | number | Number of trips for year |
| `updatedAt` | Timestamp | Last aggregate update |

For the current year, this document holds the **year-to-date total** (1 January through the most recent trip). Reading it mid-year gives the running total directly; no separate YTD computation is needed.

### 3.5 `/stats/members/{memberId}/years/{year}`

Same shape as boat stats, indexed by member.

| Field | Type | Notes |
| :---- | :---- | :---- |
| `totalKm` | integer | Sum of `distance` for trips member was on |
| `tripCount` | number | Number of trips for year |
| `updatedAt` | Timestamp | Last aggregate update |

As with boat stats, the current-year document is the running YTD total.

## 4\. Why Subcollections for Stats

Each (boat, year) and (member, year) is its own document. This gives:

- **Independent writes**: a trip with 6 participants updates 1 boat-year doc \+ 6 member-year docs — each independent, no contention with other entities  
- **Cheap history queries**: "all years for boat X" is one subcollection read returning \~10 small docs  
- **No document size limits** even after decades of use  
- **Naturally partitioned** by entity for security rules

## 5\. Aggregate Maintenance

### 5.1 Cloud Function Trigger

A function on `onWrite` for `/trips/{tripId}` computes deltas and updates the affected stat docs in a single transaction.

// pseudocode — COUNTING\_STATES defined in § 2

const COUNTING\_STATES \= new Set(\[

  'closed',

  'closed.rev',

  'deleted.corr',

  'deleted.corr.rev',

\]);

export const onTripWrite \= onDocumentWritten('trips/{tripId}', async (event) \=\> {

  const before \= event.data?.before.data() as Trip | undefined;

  const after  \= event.data?.after.data()  as Trip | undefined;

  // A trip contributes to stats only when its state counts

  const effectiveBefore \= before && COUNTING\_STATES.has(before.state) ? before : undefined;

  const effectiveAfter  \= after  && COUNTING\_STATES.has(after.state)  ? after  : undefined;

  const deltas \= computeDeltas(effectiveBefore, effectiveAfter);

  // e.g. \[

  //   { path: 'stats/boats/B1/years/2026',    km: \+12, count: \+1 },

  //   { path: 'stats/members/M3/years/2026',  km: \+12, count: \+1 },

  //   ...

  // \]

  await db.runTransaction(async (tx) \=\> {

    for (const d of deltas) {

      const ref \= db.doc(d.path);

      const snap \= await tx.get(ref);

      const cur \= snap.data() ?? { totalKm: 0, tripCount: 0 };

      tx.set(ref, {

        totalKm:   cur.totalKm   \+ d.km,

        tripCount: cur.tripCount \+ d.count,

        updatedAt: FieldValue.serverTimestamp(),

      }, { merge: true });

    }

  });

});

### 5.2 Cases Handled

The delta logic is driven entirely by `COUNTING_STATES`. Any transition into the set adds; any transition out subtracts; edits within the set re-compute the difference field by field.

| Event | State transition | Behaviour |
| :---- | :---- | :---- |
| Create draft | (none) → `draft` | No-op (not in `COUNTING_STATES`) |
| Finalise trip | `draft`/`open` → `closed` | Add to boat-year and each member-year bucket |
| Edit (distance changed) | `closed` unchanged | Subtract old km, add new km in same buckets |
| Edit (boat changed) | `closed` unchanged | Subtract from old boat-year, add to new boat-year |
| Edit (date crosses year) | `closed` unchanged | Subtract from old year buckets, add to new year buckets |
| Revise participants | `closed` → `closed.rev` | Subtract from removed members, add to added members |
| Kiosk soft-delete | `closed`/`closed.rev` → `deleted` | Subtract from every bucket; set `deletedAt` |
| trip\_responsibility reverts deletion | `deleted` → `deleted.corr` | Add back to every bucket; clear `deletedAt` |
| Revise participants after revert | `deleted.corr` → `deleted.corr.rev` | Subtract from removed members, add to added members |
| trip\_responsibility archives deletion | `deleted` unchanged (state stays `deleted`) | No-op for stats; set `deletedBy` |
| Edit while not in `COUNTING_STATES` | state unchanged | No-op for stats |

### 5.3 Idempotency & Drift Protection

Cloud Functions can fire more than once. Two safeguards:

1. **Hash check on the trip**: store `lastProcessedHash` on the trip doc; skip if unchanged.  
2. **Nightly reconciliation**: a scheduled job recomputes stats for the current year from scratch and overwrites the aggregates. Catches any drift without affecting historical years.

## 6\. Query Patterns

### Current-year boat-km table

// For \~20 boats, simple per-boat reads:

const boats \= await db.collection('boats').where('active', '==', true).get();

const stats \= await Promise.all(

  boats.docs.map(b \=\> db.doc(\`stats/boats/${b.id}/years/2026\`).get())

);

### Per-member graph: 10-year history

db.collection(\`stats/members/${memberId}/years\`)

  .orderBy('\_\_name\_\_')

  .get();

// Returns \~10 small docs in a single subcollection read

### Trips for a given year (counting only)

db.collection('trips')

  .where('year', '==', 2026\)

  .where('state', 'in', \['closed', 'closed.rev', 'deleted.corr', 'deleted.corr.rev'\])

  .orderBy('date', 'desc');

Requires a composite index on `(year, state, date)`. Firestore's `in` filter accepts up to 30 values, so the COUNTING\_STATES set fits comfortably.

### Trips for a specific member in a year

db.collection('trips')

  .where('year', '==', 2026\)

  .where('participantIds', 'array-contains', memberId)

  .where('state', 'in', \['closed', 'closed.rev', 'deleted.corr', 'deleted.corr.rev'\]);

### Trips awaiting trip\_responsibility review

db.collection('trips')

  .where('state', '==', 'deleted')

  .where('deletedBy', '==', null)

  .orderBy('deletedAt', 'desc');

## 7\. Operational Considerations

### 7.1 Backfill / Migration

A one-time script iterates all trips and rebuilds the stats collections. Keep this script in the repo — it is also the recovery tool when drift is detected.

### 7.2 Editing Historical Trips

Admins can edit trips from prior years. The Cloud Function naturally updates the corresponding year's stat docs. The UI should make clear when a historical trip is being modified.

### 7.3 Numeric Precision

`distance` is an integer (kilometres). No float drift, no rounding rules at the aggregate layer. Inputs should be rounded at the entry form before being written.

### 7.4 Security Rules (outline)

- `/trips`: kiosk can create (`draft` → `closed`) and soft-delete (`closed` → `deleted`, setting `deletedAt`). Only trip\_responsibility can transition `deleted` → `deleted.corr` or write `deletedBy`. No client may physically delete a document.  
- `/stats/**`: read-only from clients. Only the Cloud Function (admin SDK) writes here.  
- `/boats`, `/members`: read for all, write for admins only.

## 8\. Open Questions

- **Which states exactly count toward the stats?** The proposed `COUNTING_STATES` set in § 2 assumes only `closed` (and its `.corr` / `.rev` variants) contribute. If `open` trips should also appear in live YTD numbers, add `open` and `open.rev` to the set.  
- **Should the kiosk be allowed to edit an `open` trip in place**, or must every revision go through the `.rev` postfix? This affects how often the function is triggered but not its correctness.  
- **Where does the audit log of state transitions live?** The current spec keeps only the latest `deletedAt` / `deletedBy`. A separate `/trips/{tripId}/history` subcollection could capture every transition if that level of audit is required.


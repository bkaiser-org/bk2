# Design: Extend the AOC Session view

**Date:** 2026-06-24
**Author:** Bruno Kaiser (with Claude)
**Status:** Draft — awaiting review
**Area:** `libs/aoc/feature` (admin operations center, sessions), `libs/session/*`, `libs/shared/models`

## 1. Goal

Rework the AOC sessions view (`aoc-session`) from a three-button (Today/Week/All) prototype
into a standard list view that matches the rest of the app:

- standard `bk-list-filter` toolbar with **search** + **status** filter
- a **context menu** (export, statistics, change duration)
- a per-row **ActionSheet** (view session, edit user, edit person, hide user)
- **default view = sessions of the last 7 days**, with a custom date range via *change duration*
- a new searchable **`index`** field on `SessionModel`

## 2. Background

Current state ([aoc-session.ts](../../libs/aoc/feature/src/lib/aoc-session.ts),
[aoc-session.store.ts](../../libs/aoc/feature/src/lib/aoc-session.store.ts)):

- toolbar with three buttons `Today | Week | All`, client-side date filtering
- loads **all** sessions of the tenant and filters in a computed
- no search, no per-row actions, no detail view
- `SessionModel` ([session.model.ts](../../libs/shared/models/src/lib/session.model.ts))
  has `userEmail`, `browser`, `os`, timestamps, `durationSeconds`, `isActive` — but no `index`

Sessions are written by `SessionService`
([session.service.ts](../../libs/session/data-access/src/lib/session.service.ts)) on
`startSession` (anonymous), `upgradeSession` (email added on login), heartbeat, and `endSession`.

## 3. Decisions (confirmed)

| Topic | Decision |
| --- | --- |
| `index` field | Add to `SessionModel`; populate on write; **backfill** existing docs |
| Backfill mechanism | Extend the existing `createIndexesOnCollection` in **aoc-data** (new `session` case) |
| Date filtering | **Server-side** query by `startedAt` range; default = last 7 days |
| `view.session` | New **read-only detail modal** |
| `showStatistics` | **Summary modal** over the currently filtered set |
| `filterUser` | **Dropped from context menu.** Replaced by ActionSheet action `hide.user` (transient, multiple users) |
| Status filter | `bk-list-filter` **string-select**: `all / active / stale / orphaned / ended` |
| `exportRaw` | Real **CSV** export of the filtered set (via `exportCsv` + `getExportFileName`) |
| New modals placement | In `libs/aoc/feature` alongside `aoc-session` |

## 4. Architecture

### 4.1 Schema — `SessionModel.index`

Add to [session.model.ts](../../libs/shared/models/src/lib/session.model.ts):

```ts
public index = '';   // search index: lowercased "userEmail browser os"
```

New `libs/session/util` lib (matches the `getXxxIndex` convention — every other index
function lives in a `*-util` lib):

```ts
// session.util.ts
export function getSessionIndex(session: SessionModel): string {
  return `${session.userEmail} ${session.browser} ${session.os}`.toLowerCase().trim();
}
export function getSessionIndexInfo(): string {
  return 'e:userEmail b:browser o:os';
}
```

Per the **new-lib hard rule**, `libs/session/util` ships `tsconfig.json`,
`tsconfig.lib.json` (with `references`), and `package.json` named `@bk2/session-util`,
modeled on a sibling lib (e.g. `libs/user/util`).

`SessionService` calls `getSessionIndex(session)` before every write that can change the
indexed fields: `startSession`, `upgradeSession`, `endSession`. (Heartbeat does not touch
indexed fields, so it may skip recomputation — but recomputing is cheap and idempotent.)

### 4.2 Backfill — aoc-data

Add a `case 'session':` to `createIndexesOnCollection`
([aoc-data.store.ts](../../libs/aoc/feature/src/lib/aoc-data.store.ts):553):

```ts
case 'session':
  this.createIndex<SessionModel>(SessionCollection, getSessionIndex, 'startedAt');
  break;
```

`createIndex` already reads the collection, recomputes `index`, and writes back only when
changed. `session` must also be a selectable `modelType` in the AOC-data UI (verify the
model-type list includes it; add if missing).

### 4.3 Firestore composite index

The server-side query is `tenants array-contains <tenantId>` + `startedAt >= from` +
`startedAt <= to`, ordered by `startedAt desc`. The range and the `orderBy` are on the
**same field** (`startedAt`), so the existing `sessions` composite index in
`firestore.indexes.json` — `tenants (ARRAY_CONTAINS) + startedAt (DESCENDING)` — already
covers it. **No new index is required** (and the query must NOT add an `isArchived ==`
clause, which would need a different index). Verify the index exists before relying on it.

### 4.4 Store — `AocSessionStore` (rework)

State:

```ts
type AocSessionState = {
  searchTerm: string;
  selectedStatus: 'all' | 'active' | 'stale' | 'orphaned' | 'ended';
  fromDateTime: string;   // StoreDateTime; default now-7d
  toDateTime: string;     // StoreDateTime; default now
  hiddenUserKeys: string[];   // transient, set by hide.user
};
```

- `sessionsResource` params `{ tenantId, from, to }`; stream queries by `startedAt` range,
  ordered `startedAt desc`. Reloads when the range changes.
- `allSessions` = resource value.
- `filteredSessions` computed: status match + `index.includes(searchTerm)` (fallback to
  `userEmail` for not-yet-backfilled docs) + exclude `hiddenUserKeys`.
- counts: `activeCount`, `uniqueUserCount`, `anonymousCount`, `filteredCount`, computed
  over `filteredSessions` (statistics) and `allSessions` (header totals).
- Status derivation (`active/stale/orphaned/ended`) moves from the component into a shared
  pure helper so both store (filtering) and component (badge) use the same logic.

Methods: `setSearchTerm`, `setStatus`, `setDuration(from, to)`, `hideUser(session)`,
`clearHidden`, `reload`, plus the actions in 4.6.

### 4.5 Component — `aoc-session.ts` (rework)

Template structure (modeled on `aoc-user-account` + `trip-list`):

- `ion-header` → `ion-toolbar` (secondary): menu button, title with counts, **context-menu
  popover** (inline `ion-popover`, `dismissOnSelect`), items:
  - `exportRaw` (icon `download`)
  - `showStatistics` (icon `chart`)
  - `changeDuration` (icon `calendar`)
  - guarded by `hasRole('admin')` (AOC is already admin-gated)
- `bk-list-filter` — `(searchTermChanged)` + `[strings]`/`(stringsChanged)` for the status
  string-select (`all/active/stale/orphaned/ended`).
- list header toolbar (User | Browser | OS | Started | Duration | Status).
- `ion-content` → spinner / `bk-empty-list` / `ion-list` of rows; each row
  `(click)="showActions(session)"`.

Remove the Today/Week/All buttons entirely.

### 4.6 Actions

**Context menu** (`onPopoverDismiss`):

- `exportRaw` → `store.export('raw')`: build a `string[][]` from `filteredSessions`
  (header row + one row per session), `exportCsv(rows, getExportFileName('sessions','csv'))`.
- `showStatistics` → open `SessionStatisticsModal` with the current `filteredSessions`.
- `changeDuration` → open `SessionDurationModal` (from/to date+time); on confirm
  `store.setDuration(from, to)` → resource reloads.

**ActionSheet** (`showActions`, `executeActions`) — only `view.session` and `hide.user`
for anonymous sessions; `editUser`/`editPerson` shown only when `session.userKey`:

- `view.session` → open read-only `SessionDetailModal` with the session.
- `editUser` → `navigateByUrl(router, '/user/' + session.userKey, { readOnly: false })`.
- `editPerson` → resolve `personKey` via `UserService.read(session.userKey)`, then open
  `PersonEditModal` (same pattern as `aoc-user-account.store.editPerson`); save via
  `PersonService.update` on `confirm`.
- `hide.user` → `store.hideUser(session)` (adds `userKey` to `hiddenUserKeys`).

### 4.7 New modals (in `libs/aoc/feature`)

- `session-detail.modal.ts` — read-only `ion-modal` listing every session field
  (user/email, browser, os, started/ended/lastSeen, duration, status, keys, tenants).
- `session-statistics.modal.ts` — summary over the passed-in sessions: total, unique
  users, anonymous, counts per status, avg + median duration, per-browser and per-os
  breakdown.
- `session-duration.modal.ts` — two `ion-datetime` (from / to) returning
  `{ from, to }` as StoreDateTime; dismiss role `confirm`/`cancel`.

All three exported from `libs/aoc/feature/src/index.ts`.

### 4.8 i18n

New labels go through the AOC i18n store pattern: add keys to `AOC_I18N_KEYS`
(`@bk2/aoc-util`) and the AOC `de.json`, resolved via `store.i18n` (per the i18n skill and
CLAUDE.md). Keys needed: session column headers, status values, context-menu and
ActionSheet labels, statistics labels, duration-modal labels, export confirmation.

## 5. Components & responsibilities (isolation)

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `getSessionIndex` (`session-util`) | pure index string | `SessionModel` |
| `SessionService` | write `index` on session writes | `session-util`, Firestore |
| `aoc-data` backfill case | rewrite `index` on existing docs | `session-util` |
| `AocSessionStore` | range query, filter, counts, actions | Firestore, services, modals |
| `aoc-session` | presentation, popover, ActionSheet wiring | store |
| `SessionDetailModal` | read-only render of one session | `SessionModel` |
| `SessionStatisticsModal` | aggregate the passed set | `SessionModel[]` |
| `SessionDurationModal` | pick from/to | — |

## 6. Error handling

- Missing composite index → query errors; surfaced via the existing resource error path;
  mitigated by deploying the index (4.3).
- `editPerson` with no resolvable user/person → no-op (guarded), consistent with
  `aoc-user-account.store`.
- Export with empty filtered set → no-op with a toast ("nothing to export").
- Anonymous sessions (`userKey === ''`) → `editUser`/`editPerson` actions hidden.

## 7. Testing

- Unit (Vitest) for `getSessionIndex`/`getSessionIndexInfo` and the status-derivation
  helper (pure functions) — per the QA rule (unit-test every util function).
- Status helper edge cases: active vs stale (>10 min) vs orphaned (>30 min) vs ended.
- Manual: range query returns last-7-days by default; change-duration widens it; search
  filters by index; hide.user removes a user's rows; export downloads CSV; the three
  modals open and render.

## 8. Out of scope / YAGNI

- Persisting the hidden-user list or the chosen duration across reloads (transient only).
- A reusable `session` UI lib (modals stay in `aoc/feature`, admin-only).
- Pagination/virtual scroll (range default keeps the set small).
- Editing or deleting sessions (read-only admin view).

## 9. Open items for reviewer

- Confirm `libs/session/util` (new lib) vs. placing `getSessionIndex` directly in
  `libs/session/data-access` to avoid new-lib scaffolding.
- Confirm CSV column set for `exportRaw`.
- Confirm the orphan/stale thresholds (10 / 30 min) stay as the status definitions.

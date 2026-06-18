# Session Analytics Design

**Date:** 2026-05-05
**Status:** Approved

## Goal

Track user sessions — who uses the app, how often, and for how long — stored in Firestore and visible in the Aoc admin panel.

## Scope

- Client-side session tracking (Angular service)
- Anonymous session support with upgrade on login
- Heartbeat-based activity tracking
- Scheduled Cloud Function for orphan session cleanup
- Aoc session list UI

Out of scope: data retention/cleanup (to be added later), export to external tools.

---

## Data Model

New file: `libs/shared/models/src/lib/session.model.ts`

```ts
export class SessionModel implements BkModel {
  bkey = DEFAULT_KEY;
  tenants: string[] = DEFAULT_TENANTS;
  isArchived = false;

  startedAt = '';        // StoreDateTime: yyyyMMddHHmmss
  endedAt = '';          // StoreDateTime, empty while active
  lastSeenAt = '';       // StoreDateTime, updated by heartbeat every 5 min
  durationSeconds = 0;   // set on session end
  isActive = true;

  userKey = '';          // UserModel.bkey, empty for anonymous sessions
  userEmail = '';        // Firebase Auth email, empty for anonymous sessions

  browser: BrowserName = 'other';   // from platform.util
  os: OsName = 'other';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export type OsName = 'ios' | 'android' | 'macos' | 'windows' | 'other';
export const SessionCollection = 'sessions';
export const SessionModelName = 'session';
```

Exported from `libs/shared/models/src/index.ts`.

---

## Library Structure

New lib: `libs/session/data-access/`

Files:
- `src/lib/session.service.ts` — session CRUD + tracking logic
- `src/index.ts` — public API
- `tsconfig.json`, `tsconfig.lib.json`, `package.json` — standard lib scaffolding

---

## SessionService

Located in `@bk2/session-data-access`.

### Methods

**`startSession(): Promise<void>`**
- Reads `getBrowser()`, `isIOS()`, `isAndroid()`, `isMacOS()` from `@bk2/shared-util-angular`
- Builds a `SessionModel` with `startedAt = now`, `isActive = true`, empty `userKey`/`userEmail`
- Writes to `sessions` collection via `FirestoreService`, stores returned `bkey` in memory
- Starts heartbeat `setInterval` (5-minute interval)
- Called on app bootstrap regardless of auth state

**`upgradeSession(user: UserModel): Promise<void>`**
- Updates current session doc with `userKey` and `userEmail`
- No-op if no active session key in memory
- Called when Firebase auth state changes to an authenticated user

**`endSession(): Promise<void>`**
- Guards against double-calls: no-op if no active session key
- Updates session doc: `isActive = false`, `endedAt = now`, `durationSeconds = endedAt − startedAt`
- Clears in-memory session key
- Clears heartbeat interval

**`heartbeat(): Promise<void>`** (private, called by interval)
- Updates `lastSeenAt = now` on current session doc
- No-op if no active session key

### Session end triggers

| Event | Action |
|---|---|
| Explicit logout (auth state → null) | `endSession()` |
| `visibilitychange → hidden` | `endSession()` |
| App foregrounded, no session key | `startSession()` (fresh session) |

`beforeunload` is not used — `visibilitychange → hidden` fires first and is the only reliable signal on iOS Safari.

### iOS Safari note

On `visibilitychange → hidden`, async Firestore writes may not complete before the browser suspends the page. `navigator.sendBeacon` is used to POST to an HTTPS Cloud Function named `endSession` (separate from the scheduled orphan cleanup). That function performs the Firestore update server-side and is the only reliable path on iOS Safari for session-end writes.

### Capacitor (native mobile)

On native iOS/Android, supplement `visibilitychange` with Capacitor's `App.addListener('appStateChange', ({ isActive }) => ...)` — it fires more reliably than browser visibility events when the app is backgrounded or killed by the OS.

---

## AppStore Integration

`SessionService` injected into `AppStore` (`@bk2/shared-feature`):

```
App bootstrap
  → startSession()                     // anonymous session opens

Auth state → user
  → upgradeSession(user)               // enrich session with user identity

Auth state → null
  → endSession()                       // explicit logout

visibilitychange → hidden
  → endSession()

visibilitychange → visible (user present, no session key)
  → startSession() + upgradeSession(user)   // fresh session after orphan cleanup
```

---

## Orphan Cleanup — Cloud Function

Scheduled Cloud Function, runs every 30 minutes.

Query: `sessions` where `isActive == true` AND `lastSeenAt < now − 30 min`

For each result:
- `isActive = false`
- `endedAt = lastSeenAt`
- `durationSeconds = endedAt − startedAt`

This handles sessions killed by browser crash, iOS memory eviction, or force-quit.

---

## Aoc UI

### New files

- `libs/aoc/feature/src/lib/aoc-session.ts` — list component
- `libs/aoc/feature/src/lib/aoc-session.store.ts` — NgRx Signal Store

### Store

Loads `sessions` collection ordered by `startedAt desc`. State:

```ts
type AocSessionState = {
  dateFilter: 'today' | 'week' | 'all';
};
```

Computed signals:
- `sessions` — filtered list
- `activeSessions` — count of `isActive == true`
- `uniqueUserCount` — distinct `userKey` values (excluding empty = anonymous)
- `anonymousCount` — sessions with empty `userKey`

### Component

Table/grid columns:

| User | Browser | OS | Started | Duration | Status |
|---|---|---|---|---|---|
| user@email.com (or "anonymous") | Safari | iOS | 05.05.2026 14:32 | 12 min | active / ended / orphaned |

Status badges:
- **active** — `isActive = true` and `lastSeenAt` within last 10 min
- **orphaned** — `isActive = true` but `lastSeenAt` older than 30 min (cleanup pending)
- **ended** — `isActive = false`

Duration shows `—` for still-active sessions.

### Route

Added to `aoc` routes: `/aoc/sessions`, guard: `isAdminGuard`.

---

## platform.util dependency

`SessionService` uses the following already-implemented functions from `@bk2/shared-util-angular`:
- `getBrowser(): BrowserName`
- `isIOS(): boolean`
- `isAndroid(): boolean`
- `isMacOS(): boolean`

No changes needed to `platform.util`.

---

## Out of Scope (future)

- Data retention / automatic cleanup of old sessions
- Aggregated statistics (sessions per day chart, average duration)
- Export to BigQuery or Sheets

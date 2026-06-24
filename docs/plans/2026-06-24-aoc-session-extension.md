# AOC Session Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the AOC sessions view into a standard list (search + status filter, context menu, per-row ActionSheet, read-only detail / statistics / duration modals) backed by a searchable `index` field and a default last-7-days server-side range query.

**Architecture:** A new `@bk2/session-util` lib holds the pure `getSessionIndex` and `getSessionStatus` helpers (unit-tested). `SessionService` writes `index` on every session write; the existing aoc-data `createIndexesOnCollection` backfills old docs. `AocSessionStore` is reworked to query by `startedAt` range and filter client-side; `aoc-session.ts` renders the standard toolbar/list and wires the popover + ActionSheet to store methods and three new modals in `libs/aoc/feature`.

**Tech Stack:** Angular 20 (zoneless, standalone, signals), Ionic 8, NgRx Signal Stores, Firebase/Firestore, Vitest, Nx, pnpm.

**Spec:** [docs/specs/2026-06-24-aoc-session-extension-design.md](../specs/2026-06-24-aoc-session-extension-design.md)

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `libs/session/util/**` (new lib) | pure `getSessionIndex`, `getSessionIndexInfo`, `getSessionStatus`, `getSessionStatusColor` + tests | 1, 2 |
| `libs/shared/models/src/lib/session.model.ts` | add `index` field | 3 |
| `libs/session/data-access/src/lib/session.service.ts` | populate `index` on write | 4 |
| `libs/aoc/feature/src/lib/aoc-data.store.ts` | backfill `session` case | 5 |
| `libs/aoc/util/src/lib/aoc-i18n.ts` + `libs/aoc/feature/src/i18n/de.json` | session i18n keys | 6 |
| `libs/aoc/feature/src/lib/session-detail.modal.ts` (new) | read-only session detail | 7 |
| `libs/aoc/feature/src/lib/session-statistics.modal.ts` (new) | stats over filtered set | 8 |
| `libs/aoc/feature/src/lib/session-duration.modal.ts` (new) | from/to picker | 9 |
| `libs/aoc/feature/src/lib/aoc-session.store.ts` | range query, filter, counts, actions | 10 |
| `libs/aoc/feature/src/lib/aoc-session.ts` | toolbar, popover, list, ActionSheet | 11 |
| `libs/aoc/feature/src/index.ts` | export new modals | 7–9 |

**Conventions reused (read before coding):**
- Index function pattern: [user.util.ts](../../libs/user/util/src/lib/user.util.ts) `getUserIndex`/`getUserIndexInfo`.
- New-lib scaffolding template: `libs/user/util/` (project.json, tsconfig*, vite.config.ts, package.json).
- ActionSheet wiring: [aoc-user-account.ts](../../libs/aoc/feature/src/lib/aoc-user-account.ts) (`showActions`/`executeActions`, `createActionSheetButton`).
- Inline context-menu popover: [trip-list.ts](../../libs/geo/trip/feature/src/lib/trip-list.ts) lines 42–77.
- Modal template: [aoc-srv-mismatch.modal.ts](../../libs/aoc/feature/src/lib/aoc-srv-mismatch.modal.ts).
- `editPerson` via PersonEditModal: [aoc-user-account.store.ts](../../libs/aoc/feature/src/lib/aoc-user-account.store.ts) lines 247–268.
- Query helpers: `getSystemQuery` is NOT used here (would add `isArchived ==`, needing a new index). Build the query manually so it matches the existing `(tenants CONTAINS, startedAt DESC)` index.
- CSV export: `exportCsv` + `getExportFileName` from [download.util.ts](../../libs/shared/util-angular/src/lib/download.util.ts).

---

## Task 1: Scaffold `libs/session/util` lib

**Files:**
- Create: `libs/session/util/package.json`
- Create: `libs/session/util/project.json`
- Create: `libs/session/util/tsconfig.json`
- Create: `libs/session/util/tsconfig.lib.json`
- Create: `libs/session/util/tsconfig.spec.json`
- Create: `libs/session/util/vite.config.ts`
- Create: `libs/session/util/README.md`
- Create: `libs/session/util/src/index.ts`
- Create: `libs/session/util/src/lib/session.util.ts` (empty placeholder export for now)
- Modify: `tsconfig.base.json` (add path)

- [ ] **Step 1: Create `libs/session/util/package.json`**

```json
{
  "name": "@bk2/session-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

- [ ] **Step 2: Create `libs/session/util/project.json`**

```json
{
  "name": "session-util",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/session/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:session", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/session/util",
        "main": "libs/session/util/src/index.ts",
        "tsConfig": "libs/session/util/tsconfig.lib.json",
        "assets": ["libs/session/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "configFile": "libs/session/util/vite.config.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 3: Create `libs/session/util/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true
  },
  "angularCompilerOptions": {
    "strictTemplates": true,
    "strictInjectionParameters": true,
    "fullTemplateTypeCheck": true,
    "disableTypeScriptVersionCheck": true,
    "compileNonExportedClasses": true,
    "skipTemplateCodegen": false
  },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../shared/models/tsconfig.lib.json"},
    {"path": "../../shared/constants/tsconfig.lib.json"},
    {"path": "../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 4: Create `libs/session/util/tsconfig.lib.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "../../../dist/libs/session/util",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "moduleResolution": "bundler",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/session-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 5: Create `libs/session/util/tsconfig.spec.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc/libs/session/util/spec",
    "rootDir": "./",
    "types": ["node", "vitest"],
    "module": "es2020",
    "target": "es2020",
    "esModuleInterop": true,
    "allowJs": true
  },
  "include": ["vite.config.ts", "vite.config.mts", "vitest.config.ts", "vitest.config.mts", "src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": [],
  "references": [
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/constants/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" }
  ]
}
```

- [ ] **Step 6: Create `libs/session/util/vite.config.ts`**

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/session/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../coverage/libs/session/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

- [ ] **Step 7: Create `libs/session/util/README.md`**

```md
# session-util

Pure helpers for sessions: search index and runtime status derivation.
```

- [ ] **Step 8: Create `libs/session/util/src/lib/session.util.ts` (placeholder)**

```ts
// implemented in Task 2
export {};
```

- [ ] **Step 9: Create `libs/session/util/src/index.ts`**

```ts
export * from './lib/session.util';
```

- [ ] **Step 10: Register the path in `tsconfig.base.json`**

Find the line `"@bk2/session-data-access": ["libs/session/data-access/src/index.ts"],` and add directly below it:

```json
      "@bk2/session-util": ["libs/session/util/src/index.ts"],
```

- [ ] **Step 11: Commit**

```bash
git add libs/session/util tsconfig.base.json
git commit -m "chore(session): scaffold @bk2/session-util lib"
```

---

## Task 2: Implement `getSessionIndex` / `getSessionStatus` helpers (TDD)

**Files:**
- Modify: `libs/session/util/src/lib/session.util.ts`
- Test: `libs/session/util/src/lib/session.util.spec.ts`

Status thresholds (confirmed): `ended` when `!isActive`; otherwise compare `lastSeenAt` age vs `now`: `> 30` min → `orphaned`, `> 10` min → `stale`, else `active`. `getSessionStatus` takes an explicit `nowMs` so it is deterministically testable.

- [ ] **Step 1: Write the failing test** — create `libs/session/util/src/lib/session.util.spec.ts`

```ts
import { describe, expect, it } from 'vitest';
import { SessionModel } from '@bk2/shared-models';
import { getSessionIndex, getSessionIndexInfo, getSessionStatus, getSessionStatusColor } from './session.util';

function makeSession(partial: Partial<SessionModel>): SessionModel {
  const s = new SessionModel('t1');
  return Object.assign(s, partial);
}

// helper: build a StoreDateTime (yyyyMMddHHmmss) `minutesAgo` before the given nowMs
function sdtMinutesBefore(nowMs: number, minutesAgo: number): string {
  const d = new Date(nowMs - minutesAgo * 60_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

describe('getSessionIndex', () => {
  it('lowercases and joins userEmail, browser, os', () => {
    const s = makeSession({ userEmail: 'Alice@Example.COM', browser: 'safari', os: 'ios' });
    expect(getSessionIndex(s)).toBe('alice@example.com safari ios');
  });

  it('handles an anonymous session (empty email)', () => {
    const s = makeSession({ userEmail: '', browser: 'chrome', os: 'windows' });
    expect(getSessionIndex(s)).toBe('chrome windows');
  });
});

describe('getSessionIndexInfo', () => {
  it('returns the field layout string', () => {
    expect(getSessionIndexInfo()).toBe('e:userEmail b:browser o:os');
  });
});

describe('getSessionStatus', () => {
  const now = new Date(2026, 5, 24, 12, 0, 0).getTime();

  it('returns ended for an inactive session', () => {
    const s = makeSession({ isActive: false, lastSeenAt: sdtMinutesBefore(now, 1) });
    expect(getSessionStatus(s, now)).toBe('ended');
  });

  it('returns active when last seen within 10 minutes', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 5) });
    expect(getSessionStatus(s, now)).toBe('active');
  });

  it('returns stale when last seen between 10 and 30 minutes', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 20) });
    expect(getSessionStatus(s, now)).toBe('stale');
  });

  it('returns orphaned when last seen more than 30 minutes ago', () => {
    const s = makeSession({ isActive: true, lastSeenAt: sdtMinutesBefore(now, 45) });
    expect(getSessionStatus(s, now)).toBe('orphaned');
  });
});

describe('getSessionStatusColor', () => {
  it('maps each status to an Ionic color', () => {
    expect(getSessionStatusColor('active')).toBe('success');
    expect(getSessionStatusColor('stale')).toBe('tertiary');
    expect(getSessionStatusColor('orphaned')).toBe('warning');
    expect(getSessionStatusColor('ended')).toBe('medium');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test session-util`
Expected: FAIL — `getSessionIndex`/`getSessionStatus` not exported (module has only `export {}`).

- [ ] **Step 3: Implement** — replace the contents of `libs/session/util/src/lib/session.util.ts`

```ts
import { SessionModel } from '@bk2/shared-models';

export type SessionStatus = 'active' | 'stale' | 'orphaned' | 'ended';

/*-------------------------- search index --------------------------------*/
/**
 * Create a lowercased search index for a session: "userEmail browser os".
 * For anonymous sessions the (empty) email is dropped by the trim/normalisation.
 */
export function getSessionIndex(session: SessionModel): string {
  return `${session.userEmail} ${session.browser} ${session.os}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function getSessionIndexInfo(): string {
  return 'e:userEmail b:browser o:os';
}

/*-------------------------- runtime status ------------------------------*/
/** Parse a StoreDateTime (yyyyMMddHHmmss) into epoch millis (local time). */
function parseStoreDateTime(sdt: string): number {
  const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1, d = +sdt.slice(6, 8);
  const h = +sdt.slice(8, 10), mi = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
  return new Date(y, mo, d, h, mi, s).getTime();
}

/**
 * Derive a session's runtime status from its activity and last heartbeat.
 * @param nowMs current time in millis (injected for testability)
 */
export function getSessionStatus(session: SessionModel, nowMs: number): SessionStatus {
  if (!session.isActive) return 'ended';
  if (!session.lastSeenAt || session.lastSeenAt.length < 14) return 'active';
  const ageMin = (nowMs - parseStoreDateTime(session.lastSeenAt)) / 60_000;
  if (ageMin > 30) return 'orphaned';
  if (ageMin > 10) return 'stale';
  return 'active';
}

export function getSessionStatusColor(status: SessionStatus): string {
  switch (status) {
    case 'active': return 'success';
    case 'stale': return 'tertiary';
    case 'orphaned': return 'warning';
    case 'ended': return 'medium';
  }
}
```

- [ ] **Step 4: Update the barrel** — `libs/session/util/src/index.ts` already re-exports `./lib/session.util`; no change needed. Confirm it still reads:

```ts
export * from './lib/session.util';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test session-util`
Expected: PASS (all 9 assertions).

- [ ] **Step 6: Type-check the lib**

Run: `npx tsc --noEmit -p libs/session/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/session/util/src
git commit -m "feat(session): add getSessionIndex and getSessionStatus helpers"
```

---

## Task 3: Add `index` field to `SessionModel`

**Files:**
- Modify: `libs/shared/models/src/lib/session.model.ts`

- [ ] **Step 1: Add the field** — in [session.model.ts](../../libs/shared/models/src/lib/session.model.ts), after the `os` line (`public os: OsName = 'other';`), add:

```ts

  public index = '';            // search index: lowercased "userEmail browser os"
```

- [ ] **Step 2: Type-check the models lib**

Run: `npx tsc --noEmit -p libs/shared/models/tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/models/src/lib/session.model.ts
git commit -m "feat(models): add searchable index field to SessionModel"
```

---

## Task 4: Populate `index` on session writes

**Files:**
- Modify: `libs/session/data-access/src/lib/session.service.ts`
- Modify: `libs/session/data-access/tsconfig.json` (add session-util reference)
- Modify: `libs/session/data-access/package.json` (add session-util dep)

- [ ] **Step 1: Add the dependency** — in `libs/session/data-access/package.json`, add to `dependencies` (after `@bk2/shared-models`):

```json
    "@bk2/session-util": "*",
```

- [ ] **Step 2: Add the project reference** — in `libs/session/data-access/tsconfig.json`, add to the `references` array:

```json
    {
      "path": "../util/tsconfig.lib.json"
    },
```

- [ ] **Step 3: Import the helper** — in [session.service.ts](../../libs/session/data-access/src/lib/session.service.ts), add to the imports near the top:

```ts
import { getSessionIndex } from '@bk2/session-util';
```

- [ ] **Step 4: Set `index` before each write.** Make these edits in `session.service.ts`:

In `startSession`, immediately before `const key = await this.firestoreService.createModel...`:

```ts
      session.index = getSessionIndex(session);
```

In `upgradeSession`, after `this.session.userEmail = user.loginEmail;` and before the `updateModel` call:

```ts
    this.session.index = getSessionIndex(this.session);
```

In `endSession`, after `session.durationSeconds = this.calcDurationSeconds(...)` and before the `if (isSafari()...` block:

```ts
    session.index = getSessionIndex(session);
```

- [ ] **Step 5: Type-check the data-access lib**

Run: `npx tsc --noEmit -p libs/session/data-access/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/session/data-access
git commit -m "feat(session): write search index on session create/upgrade/end"
```

---

## Task 5: Backfill `index` for existing sessions (aoc-data)

**Files:**
- Modify: `libs/aoc/feature/src/lib/aoc-data.store.ts`
- Modify: `libs/aoc/feature/tsconfig.json` (add session-util reference)
- Modify: `libs/aoc/feature/package.json` (add session-util dep)

> **Manual step (DB, not code):** the aoc-data model-type selector is populated from the
> `model_type` DB category (`getCategory('model_type')`). To trigger the session backfill
> from the UI, an admin must add a `session` item to that category. The code below adds the
> handling; the DB item enables selecting it. Note this in the PR description.

- [ ] **Step 1: Add the dependency** — in `libs/aoc/feature/package.json`, add to `dependencies`:

```json
    "@bk2/session-util": "*",
```

- [ ] **Step 2: Add the project reference** — in `libs/aoc/feature/tsconfig.json`, add to the `references` array:

```json
    {
      "path": "../../session/util/tsconfig.lib.json"
    },
```

- [ ] **Step 3: Import the model + helper** — in [aoc-data.store.ts](../../libs/aoc/feature/src/lib/aoc-data.store.ts), add `SessionCollection, SessionModel` to the existing `@bk2/shared-models` import, and add a new import:

```ts
import { getSessionIndex } from '@bk2/session-util';
```

- [ ] **Step 4: Add the switch case** — in `createIndexesOnCollection`, add before the `case 'account':` block:

```ts
          case 'session':
            this.createIndex<SessionModel>(SessionCollection, getSessionIndex, 'startedAt');
            break;
```

- [ ] **Step 5: Type-check the aoc-feature lib**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-data.store.ts libs/aoc/feature/tsconfig.json libs/aoc/feature/package.json
git commit -m "feat(aoc): backfill session search index via createIndexesOnCollection"
```

---

## Task 6: Add session i18n keys

**Files:**
- Modify: `libs/aoc/util/src/lib/aoc-i18n.ts`
- Modify: `libs/aoc/feature/src/i18n/de.json`

- [ ] **Step 1: Add keys to `AOC_I18N_KEYS`** — in [aoc-i18n.ts](../../libs/aoc/util/src/lib/aoc-i18n.ts), replace the `// session` comment line (around line 332) with:

```ts
  // session
  session_title:                          PFX + 'session.title',
  session_empty:                          PFX + 'session.empty',
  session_anonymous:                      PFX + 'session.anonymous',
  session_col_user:                       PFX + 'session.col.user',
  session_col_browser:                    PFX + 'session.col.browser',
  session_col_os:                         PFX + 'session.col.os',
  session_col_started:                    PFX + 'session.col.started',
  session_col_duration:                   PFX + 'session.col.duration',
  session_col_status:                     PFX + 'session.col.status',
  session_status_all:                     PFX + 'session.status.all',
  session_status_active:                  PFX + 'session.status.active',
  session_status_stale:                   PFX + 'session.status.stale',
  session_status_orphaned:                PFX + 'session.status.orphaned',
  session_status_ended:                   PFX + 'session.status.ended',
  session_menu_export:                    PFX + 'session.menu.export',
  session_menu_statistics:                PFX + 'session.menu.statistics',
  session_menu_duration:                  PFX + 'session.menu.duration',
  session_as_title:                       PFX + 'session.as.title',
  session_view:                           PFX + 'session.view',
  session_edit_user:                      PFX + 'session.edit.user',
  session_edit_person:                    PFX + 'session.edit.person',
  session_hide_user:                      PFX + 'session.hide.user',
  session_export_empty:                   PFX + 'session.export.empty',
  session_export_conf:                    PFX + 'session.export.conf',
  session_detail_title:                   PFX + 'session.detail.title',
  session_stats_title:                    PFX + 'session.stats.title',
  session_stats_total:                    PFX + 'session.stats.total',
  session_stats_users:                    PFX + 'session.stats.users',
  session_stats_anonymous:                PFX + 'session.stats.anonymous',
  session_stats_avg_duration:             PFX + 'session.stats.avgDuration',
  session_stats_median_duration:          PFX + 'session.stats.medianDuration',
  session_stats_by_browser:               PFX + 'session.stats.byBrowser',
  session_stats_by_os:                    PFX + 'session.stats.byOs',
  session_duration_title:                 PFX + 'session.duration.title',
  session_duration_from:                  PFX + 'session.duration.from',
  session_duration_to:                    PFX + 'session.duration.to',
```

- [ ] **Step 2: Add the German translations** — in [de.json](../../libs/aoc/feature/src/i18n/de.json), add a new `"session"` object (place it after the `"roles"` block, before `"srv"`; ensure surrounding commas are valid JSON):

```json
  "session": {
    "title": "Sessions",
    "empty": "Keine Sessions im gewählten Zeitraum",
    "anonymous": "anonym",
    "col": {
      "user": "Benutzer",
      "browser": "Browser",
      "os": "OS",
      "started": "Gestartet",
      "duration": "Dauer",
      "status": "Status"
    },
    "status": {
      "all": "Alle",
      "active": "aktiv",
      "stale": "inaktiv",
      "orphaned": "verwaist",
      "ended": "beendet"
    },
    "menu": {
      "export": "Rohdaten exportieren",
      "statistics": "Statistik anzeigen",
      "duration": "Zeitraum ändern"
    },
    "as": {
      "title": "Session-Aktionen"
    },
    "view": "Session anzeigen",
    "edit": {
      "user": "Benutzer bearbeiten",
      "person": "Person bearbeiten"
    },
    "hide": {
      "user": "Diesen Benutzer ausblenden"
    },
    "export": {
      "empty": "Keine Sessions zum Exportieren.",
      "conf": "Die Sessions wurden exportiert."
    },
    "detail": {
      "title": "Session-Details"
    },
    "stats": {
      "title": "Session-Statistik",
      "total": "Sessions total",
      "users": "Eindeutige Benutzer",
      "anonymous": "Anonyme Sessions",
      "avgDuration": "Durchschnittliche Dauer",
      "medianDuration": "Median-Dauer",
      "byBrowser": "Nach Browser",
      "byOs": "Nach OS"
    },
    "duration": {
      "title": "Zeitraum wählen",
      "from": "Von",
      "to": "Bis"
    }
  },
```

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('libs/aoc/feature/src/i18n/de.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Type-check the aoc-util lib**

Run: `npx tsc --noEmit -p libs/aoc/util/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/aoc/util/src/lib/aoc-i18n.ts libs/aoc/feature/src/i18n/de.json
git commit -m "i18n(aoc): add session view keys"
```

---

## Task 7: Create `SessionDetailModal`

**Files:**
- Create: `libs/aoc/feature/src/lib/session-detail.modal.ts`
- Modify: `libs/aoc/feature/src/index.ts`

- [ ] **Step 1: Create the modal** — `libs/aoc/feature/src/lib/session-detail.modal.ts`

```ts
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { getSessionStatus } from '@bk2/session-util';
import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

interface DetailRow { label: string; value: string; }

@Component({
  selector: 'bk-session-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`ion-row { border-bottom: 1px solid var(--ion-color-light); }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        @for (row of rows(); track row.label) {
          <ion-row>
            <ion-col size="5"><strong>{{ row.label }}</strong></ion-col>
            <ion-col size="7">{{ row.value || '—' }}</ion-col>
          </ion-row>
        }
      </ion-grid>
    </ion-content>
  `,
})
export class SessionDetailModal {
  private readonly modalController = inject(ModalController);

  public session = input.required<SessionModel>();
  public title = input('Session-Details');
  public closeLabel = input('Schliessen');

  protected rows = computed<DetailRow[]>(() => {
    const s = this.session();
    const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
    return [
      { label: 'User', value: s.userEmail || 'anonym' },
      { label: 'Browser', value: s.browser },
      { label: 'OS', value: s.os },
      { label: 'Status', value: getSessionStatus(s, Date.now()) },
      { label: 'Started', value: fmt(s.startedAt) },
      { label: 'Last seen', value: fmt(s.lastSeenAt) },
      { label: 'Ended', value: fmt(s.endedAt) },
      { label: 'Duration (s)', value: String(s.durationSeconds) },
      { label: 'userKey', value: s.userKey },
      { label: 'bkey', value: s.bkey },
      { label: 'tenants', value: s.tenants.join(', ') },
    ];
  });

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 2: Export it** — in `libs/aoc/feature/src/index.ts`, add:

```ts
export * from './lib/session-detail.modal';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/aoc/feature/src/lib/session-detail.modal.ts libs/aoc/feature/src/index.ts
git commit -m "feat(aoc): add read-only session detail modal"
```

---

## Task 8: Create `SessionStatisticsModal`

**Files:**
- Create: `libs/aoc/feature/src/lib/session-statistics.modal.ts`
- Modify: `libs/aoc/feature/src/index.ts`

- [ ] **Step 1: Create the modal** — `libs/aoc/feature/src/lib/session-statistics.modal.ts`

```ts
import { Component, computed, inject, input } from '@angular/core';
import { IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonRow, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { getSessionStatus, SessionStatus } from '@bk2/session-util';

interface CountRow { key: string; count: number; }

@Component({
  selector: 'bk-session-statistics-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonGrid, IonRow, IonCol, IonList, IonListHeader, IonItem, IonLabel,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()">{{ closeLabel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row><ion-col size="8">Sessions total</ion-col><ion-col size="4">{{ total() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">Eindeutige Benutzer</ion-col><ion-col size="4">{{ uniqueUsers() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">Anonyme Sessions</ion-col><ion-col size="4">{{ anonymous() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">aktiv</ion-col><ion-col size="4">{{ statusCount('active') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">inaktiv</ion-col><ion-col size="4">{{ statusCount('stale') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">verwaist</ion-col><ion-col size="4">{{ statusCount('orphaned') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">beendet</ion-col><ion-col size="4">{{ statusCount('ended') }}</ion-col></ion-row>
        <ion-row><ion-col size="8">Durchschnittliche Dauer</ion-col><ion-col size="4">{{ avgDuration() }}</ion-col></ion-row>
        <ion-row><ion-col size="8">Median-Dauer</ion-col><ion-col size="4">{{ medianDuration() }}</ion-col></ion-row>
      </ion-grid>

      <ion-list>
        <ion-list-header>Nach Browser</ion-list-header>
        @for (row of byBrowser(); track row.key) {
          <ion-item><ion-label>{{ row.key }}</ion-label><ion-label slot="end">{{ row.count }}</ion-label></ion-item>
        }
        <ion-list-header>Nach OS</ion-list-header>
        @for (row of byOs(); track row.key) {
          <ion-item><ion-label>{{ row.key }}</ion-label><ion-label slot="end">{{ row.count }}</ion-label></ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class SessionStatisticsModal {
  private readonly modalController = inject(ModalController);

  public sessions = input.required<SessionModel[]>();
  public title = input('Session-Statistik');
  public closeLabel = input('Schliessen');

  protected total = computed(() => this.sessions().length);
  protected uniqueUsers = computed(() => new Set(this.sessions().filter(s => s.userKey).map(s => s.userKey)).size);
  protected anonymous = computed(() => this.sessions().filter(s => !s.userKey).length);

  protected statusCount(status: SessionStatus): number {
    const now = Date.now();
    return this.sessions().filter(s => getSessionStatus(s, now) === status).length;
  }

  private endedDurations = computed(() => this.sessions().filter(s => !s.isActive && s.durationSeconds > 0).map(s => s.durationSeconds));

  protected avgDuration = computed(() => {
    const d = this.endedDurations();
    if (d.length === 0) return '—';
    return this.fmt(Math.round(d.reduce((a, b) => a + b, 0) / d.length));
  });

  protected medianDuration = computed(() => {
    const d = [...this.endedDurations()].sort((a, b) => a - b);
    if (d.length === 0) return '—';
    const mid = Math.floor(d.length / 2);
    const med = d.length % 2 ? d[mid] : Math.round((d[mid - 1] + d[mid]) / 2);
    return this.fmt(med);
  });

  protected byBrowser = computed<CountRow[]>(() => this.groupCount(s => s.browser));
  protected byOs = computed<CountRow[]>(() => this.groupCount(s => s.os));

  private groupCount(keyFn: (s: SessionModel) => string): CountRow[] {
    const map = new Map<string, number>();
    for (const s of this.sessions()) map.set(keyFn(s), (map.get(keyFn(s)) ?? 0) + 1);
    return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  }

  private fmt(s: number): string {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected close(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 2: Export it** — in `libs/aoc/feature/src/index.ts`, add:

```ts
export * from './lib/session-statistics.modal';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/aoc/feature/src/lib/session-statistics.modal.ts libs/aoc/feature/src/index.ts
git commit -m "feat(aoc): add session statistics modal"
```

---

## Task 9: Create `SessionDurationModal`

**Files:**
- Create: `libs/aoc/feature/src/lib/session-duration.modal.ts`
- Modify: `libs/aoc/feature/src/index.ts`

The modal returns `{ from, to }` as StoreDateTime strings on `confirm`. `ion-datetime` works in ISO; convert with `DateFormat` helpers.

- [ ] **Step 1: Create the modal** — `libs/aoc/feature/src/lib/session-duration.modal.ts`

```ts
import { Component, inject, input, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonDatetime, IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { DateFormat, convertDateFormatToString } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-session-duration-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonList, IonItem, IonLabel, IonDatetime,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ title() }}</ion-title>
        <ion-buttons slot="start"><ion-button (click)="cancel()">{{ cancelLabel() }}</ion-button></ion-buttons>
        <ion-buttons slot="end"><ion-button (click)="confirm()">{{ okLabel() }}</ion-button></ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list>
        <ion-item lines="none"><ion-label>{{ fromLabel() }}</ion-label></ion-item>
        <ion-datetime presentation="date-time" [value]="fromIso()" (ionChange)="fromIso.set($any($event.detail.value))" />
        <ion-item lines="none"><ion-label>{{ toLabel() }}</ion-label></ion-item>
        <ion-datetime presentation="date-time" [value]="toIso()" (ionChange)="toIso.set($any($event.detail.value))" />
      </ion-list>
    </ion-content>
  `,
})
export class SessionDurationModal {
  private readonly modalController = inject(ModalController);

  // inputs are StoreDateTime (yyyyMMddHHmmss); convert to ISO for ion-datetime
  public fromDateTime = input.required<string>();
  public toDateTime = input.required<string>();
  public title = input('Zeitraum wählen');
  public fromLabel = input('Von');
  public toLabel = input('Bis');
  public okLabel = input('OK');
  public cancelLabel = input('Abbrechen');

  protected fromIso = signal('');
  protected toIso = signal('');

  constructor() {
    // initialise the ISO signals from the StoreDateTime inputs once they resolve
    queueMicrotask(() => {
      this.fromIso.set(convertDateFormatToString(this.fromDateTime(), DateFormat.StoreDateTime, DateFormat.IsoDateTime));
      this.toIso.set(convertDateFormatToString(this.toDateTime(), DateFormat.StoreDateTime, DateFormat.IsoDateTime));
    });
  }

  protected confirm(): void {
    const from = convertDateFormatToString(this.fromIso(), DateFormat.IsoDateTime, DateFormat.StoreDateTime);
    const to = convertDateFormatToString(this.toIso(), DateFormat.IsoDateTime, DateFormat.StoreDateTime);
    this.modalController.dismiss({ from, to }, 'confirm');
  }

  protected cancel(): void {
    this.modalController.dismiss(null, 'cancel');
  }
}
```

> **Verify before Step 2:** confirm `DateFormat.IsoDateTime` exists in `@bk2/shared-util-core`
> (`grep -n "IsoDateTime" libs/shared/util-core/src/lib/*date*`). If the enum member has a
> different name (e.g. `IsoDateTime` vs `Iso`), use the actual one in both conversions.

- [ ] **Step 2: Export it** — in `libs/aoc/feature/src/index.ts`, add:

```ts
export * from './lib/session-duration.modal';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/aoc/feature/src/lib/session-duration.modal.ts libs/aoc/feature/src/index.ts
git commit -m "feat(aoc): add session duration (from/to) modal"
```

---

## Task 10: Rework `AocSessionStore`

**Files:**
- Modify (full rewrite): `libs/aoc/feature/src/lib/aoc-session.store.ts`

- [ ] **Step 1: Replace the store** — overwrite `libs/aoc/feature/src/lib/aoc-session.store.ts` with:

```ts
// libs/aoc/feature/src/lib/aoc-session.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { Observable, firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { SessionCollection, SessionModel } from '@bk2/shared-models';
import { DateFormat, convertDateFormatToString, getTodayStr, subDuration } from '@bk2/shared-util-core';
import { exportCsv, getExportFileName, navigateByUrl, showToast } from '@bk2/shared-util-angular';
import { getSessionStatus, SessionStatus } from '@bk2/session-util';
import { AOC_I18N_KEYS } from '@bk2/aoc-util';
import { UserService } from '@bk2/user-data-access';
import { PersonService } from '@bk2/subject-person-data-access';

export type StatusFilter = 'all' | SessionStatus;

export type AocSessionState = {
  searchTerm: string;
  selectedStatus: StatusFilter;
  fromDateTime: string;   // StoreDateTime
  toDateTime: string;     // StoreDateTime
  hiddenUserKeys: string[];
};

function lastWeekFrom(): string {
  const now = getTodayStr(DateFormat.StoreDateTime);
  return subDuration(now, { days: 7 }, DateFormat.StoreDateTime);
}

const initialState: AocSessionState = {
  searchTerm: '',
  selectedStatus: 'all',
  fromDateTime: lastWeekFrom(),
  toDateTime: getTodayStr(DateFormat.StoreDateTime),
  hiddenUserKeys: [],
};

export const AocSessionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    modalController: inject(ModalController),
    toastController: inject(ToastController),
    router: inject(Router),
    userService: inject(UserService),
    personService: inject(PersonService),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(AOC_I18N_KEYS),
    sessionsResource: rxResource({
      params: () => ({
        tenantId: store.appStore.tenantId(),
        from: store.fromDateTime(),
        to: store.toDateTime(),
      }),
      stream: ({ params }): Observable<SessionModel[]> => {
        // No isArchived clause -> matches the existing (tenants CONTAINS, startedAt DESC) index.
        const query = [
          { key: 'tenants', operator: 'array-contains', value: params.tenantId },
          { key: 'startedAt', operator: '>=', value: params.from },
          { key: 'startedAt', operator: '<=', value: params.to },
        ];
        return store.firestoreService.searchData<SessionModel>(SessionCollection, query, 'startedAt', 'desc');
      },
    }),
  })),
  withComputed(state => ({
    isLoading: computed(() => state.sessionsResource.isLoading()),
    allSessions: computed(() => state.sessionsResource.value() ?? []),
    currentUser: computed(() => state.appStore.currentUser()),
  })),
  withComputed(state => ({
    filteredSessions: computed(() => {
      const now = Date.now();
      const term = state.searchTerm();
      const status = state.selectedStatus();
      const hidden = new Set(state.hiddenUserKeys());
      return state.allSessions().filter(s => {
        if (s.userKey && hidden.has(s.userKey)) return false;
        if (status !== 'all' && getSessionStatus(s, now) !== status) return false;
        if (term) {
          const idx = s.index || `${s.userEmail} ${s.browser} ${s.os}`.toLowerCase();
          if (!idx.includes(term)) return false;
        }
        return true;
      });
    }),
    activeCount: computed(() => state.allSessions().filter(s => s.isActive).length),
    uniqueUserCount: computed(() => new Set(state.allSessions().filter(s => s.userKey).map(s => s.userKey)).size),
    anonymousCount: computed(() => state.allSessions().filter(s => !s.userKey).length),
  })),
  withMethods(store => ({
    /* ---------------- filters ---------------- */
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: (term ?? '').toLowerCase() });
    },
    setStatus(status: string): void {
      patchState(store, { selectedStatus: (status || 'all') as StatusFilter });
    },
    setDuration(from: string, to: string): void {
      patchState(store, { fromDateTime: from, toDateTime: to });
    },
    hideUser(session: SessionModel): void {
      if (!session.userKey) return;
      if (store.hiddenUserKeys().includes(session.userKey)) return;
      patchState(store, { hiddenUserKeys: [...store.hiddenUserKeys(), session.userKey] });
    },
    clearHidden(): void {
      patchState(store, { hiddenUserKeys: [] });
    },
    reload(): void {
      store.sessionsResource.reload();
    },

    /* ---------------- context-menu actions ---------------- */
    async export(type: string): Promise<void> {
      if (type !== 'raw') return;
      const sessions = store.filteredSessions();
      if (sessions.length === 0) {
        showToast(store.toastController, store.i18n.session_export_empty());
        return;
      }
      const fmt = (sdt: string) => sdt ? convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime) : '';
      const header = ['userEmail', 'browser', 'os', 'status', 'startedAt', 'endedAt', 'lastSeenAt', 'durationSeconds', 'userKey', 'bkey'];
      const now = Date.now();
      const rows = sessions.map(s => [
        s.userEmail, s.browser, s.os, getSessionStatus(s, now),
        fmt(s.startedAt), fmt(s.endedAt), fmt(s.lastSeenAt),
        String(s.durationSeconds), s.userKey, s.bkey,
      ]);
      await exportCsv([header, ...rows], getExportFileName('sessions', 'csv'));
      showToast(store.toastController, store.i18n.session_export_conf());
    },

    async showStatistics(): Promise<void> {
      const { SessionStatisticsModal } = await import('./session-statistics.modal');
      const modal = await store.modalController.create({
        component: SessionStatisticsModal,
        componentProps: { sessions: store.filteredSessions(), title: store.i18n.session_stats_title() },
      });
      await modal.present();
    },

    async changeDuration(): Promise<void> {
      const { SessionDurationModal } = await import('./session-duration.modal');
      const modal = await store.modalController.create({
        component: SessionDurationModal,
        componentProps: {
          fromDateTime: store.fromDateTime(),
          toDateTime: store.toDateTime(),
          title: store.i18n.session_duration_title(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data?.from && data?.to) {
        this.setDuration(data.from, data.to);
      }
    },

    /* ---------------- row actions ---------------- */
    async viewSession(session: SessionModel): Promise<void> {
      const { SessionDetailModal } = await import('./session-detail.modal');
      const modal = await store.modalController.create({
        component: SessionDetailModal,
        componentProps: { session, title: store.i18n.session_detail_title() },
      });
      await modal.present();
    },

    async editUser(session: SessionModel): Promise<void> {
      if (!session.userKey) return;
      await navigateByUrl(store.router, `/user/${session.userKey}`, { readOnly: false });
    },

    async editPerson(session: SessionModel): Promise<void> {
      if (!session.userKey) return;
      const user = await firstValueFrom(store.userService.read(session.userKey));
      if (!user?.personKey) return;
      const person = store.appStore.getPerson(user.personKey);
      if (!person) return;
      const { PersonEditModal } = await import('@bk2/subject-person-feature');
      const modal = await store.modalController.create({
        component: PersonEditModal,
        componentProps: {
          person,
          currentUser: store.appStore.currentUser(),
          tags: store.appStore.getTags('person'),
          tenantId: store.appStore.tenantId(),
          genders: store.appStore.getCategory('gender'),
          readOnly: false,
        },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        await store.personService.update(data, store.appStore.currentUser());
      }
    },
  })),
);
```

> **Verify before Step 2 (signatures may differ slightly):**
> - `subDuration(dateStr, {days}, format)` — confirmed used in the old store with `DateFormat.StoreDate`; here it uses `DateFormat.StoreDateTime`. Run `grep -n "export function subDuration" libs/shared/util-core/src/lib/*date*` and confirm it accepts `StoreDateTime`.
> - `UserService.read(key)` returns `Observable<UserModel | undefined>` — confirm with `grep -n "read" libs/user/data-access/src/lib/user.service.ts`.
> - `PersonService.update(person, currentUser)` — confirmed in `aoc-user-account.store.ts`.
> - `showToast` / `exportCsv` / `getExportFileName` / `navigateByUrl` are exported from `@bk2/shared-util-angular` (grep to confirm `showToast` is exported there; it is used in download.util).

- [ ] **Step 2: Add the `subject-person-data-access` and `user-data-access` deps/refs if missing.** Check `libs/aoc/feature/package.json` for `@bk2/subject-person-data-access` and `@bk2/user-data-access`; `@bk2/user-data-access` is already present (seen in grep). If `@bk2/subject-person-data-access` is absent, add it to `dependencies` and add `{ "path": "../../subject/person/data-access/tsconfig.lib.json" }` to `libs/aoc/feature/tsconfig.json` references. (The store already imports `PersonService`; confirm the dep exists.)

Run: `grep -n "subject-person-data-access\|user-data-access" libs/aoc/feature/package.json`
Expected: both present. Add whichever is missing.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors. Fix any signature mismatches flagged by the "Verify" note above.

- [ ] **Step 4: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-session.store.ts libs/aoc/feature/package.json libs/aoc/feature/tsconfig.json
git commit -m "feat(aoc): rework session store with range query, filters and actions"
```

---

## Task 11: Rework `aoc-session.ts` component

**Files:**
- Modify (full rewrite): `libs/aoc/feature/src/lib/aoc-session.ts`

- [ ] **Step 1: Replace the component** — overwrite `libs/aoc/feature/src/lib/aoc-session.ts` with:

```ts
// libs/aoc/feature/src/lib/aoc-session.ts
import { Component, computed, inject } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonBadge, IonButton, IonButtons, IonCard, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SessionModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { DateFormat, convertDateFormatToString, generateRandomString, hasRole } from '@bk2/shared-util-core';
import { getSessionStatus, getSessionStatusColor } from '@bk2/session-util';

import { AocSessionStore } from './aoc-session.store';

@Component({
  selector: 'bk-aoc-session',
  standalone: true,
  imports: [
    SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonButton, IonTitle, IonIcon,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonList, IonItem, IonLabel, IonBadge, IonPopover,
  ],
  providers: [AocSessionStore],
  template: `
    <ion-header>
      <!-- title and context menu -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ filteredCount() }}/{{ totalCount() }} {{ store.i18n.session_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button id="{{ popupId() }}">
            <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
          </ion-button>
          <ion-popover trigger="{{ popupId() }}" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
            <ng-template>
              <ion-content>
                <ion-list>
                  <ion-item button (click)="dismissPopover('exportRaw')">
                    <ion-icon slot="start" src="{{ 'download' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_export() }}</ion-label>
                  </ion-item>
                  <ion-item button (click)="dismissPopover('showStatistics')">
                    <ion-icon slot="start" src="{{ 'chart' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_statistics() }}</ion-label>
                  </ion-item>
                  <ion-item button (click)="dismissPopover('changeDuration')">
                    <ion-icon slot="start" src="{{ 'calendar' | svgIcon }}" />
                    <ion-label>{{ store.i18n.session_menu_duration() }}</ion-label>
                  </ion-item>
                </ion-list>
              </ion-content>
            </ng-template>
          </ion-popover>
        </ion-buttons>
      </ion-toolbar>

      <!-- search and status filter -->
      <bk-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        [strings]="statusOptions()"
        [stringsName]="'sessionStatus'"
        [selectedString]="store.selectedStatus()"
        (stringsChanged)="store.setStatus($event)"
      />

      <!-- list header -->
      <ion-toolbar color="primary">
        <ion-item lines="none" color="primary">
          <ion-label><strong>{{ store.i18n.session_col_user() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_browser() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_os() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_started() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_duration() }}</strong></ion-label>
          <ion-label><strong>{{ store.i18n.session_col_status() }}</strong></ion-label>
        </ion-item>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <bk-spinner />
      } @else {
        <ion-card>
          <ion-card-header>
            <ion-card-title>
              {{ store.uniqueUserCount() }} users &nbsp;|&nbsp;
              {{ store.anonymousCount() }} anonymous &nbsp;|&nbsp;
              {{ store.activeCount() }} active
            </ion-card-title>
          </ion-card-header>
        </ion-card>

        @if (sessions().length === 0) {
          <bk-empty-list [message]="store.i18n.session_empty()" />
        } @else {
          <ion-list lines="inset">
            @for (session of sessions(); track session.bkey) {
              <ion-item button (click)="showActions(session)">
                <ion-label>{{ session.userEmail || store.i18n.session_anonymous() }}</ion-label>
                <ion-label>{{ session.browser }}</ion-label>
                <ion-label>{{ session.os }}</ion-label>
                <ion-label>{{ formatDate(session.startedAt) }}</ion-label>
                <ion-label>{{ formatDuration(session) }}</ion-label>
                <ion-label>
                  <ion-badge [color]="statusColor(session)">{{ statusLabel(session) }}</ion-badge>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
})
export class AocSession {
  protected readonly store = inject(AocSessionStore);
  private readonly actionSheetController = inject(ActionSheetController);

  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly sessions = computed(() => this.store.filteredSessions());
  protected readonly filteredCount = computed(() => this.store.filteredSessions().length);
  protected readonly totalCount = computed(() => this.store.allSessions().length);
  protected readonly popupId = computed(() => `c_sessions_${generateRandomString(5)}`);
  protected readonly statusOptions = computed(() => ['all', 'active', 'stale', 'orphaned', 'ended']);

  /* ---------------- context menu ---------------- */
  protected dismissPopover(method: string): void {
    void this.store.modalController; // keep tree-shaking honest; no-op
    this.popoverDismissWith(method);
  }

  // ion-popover with dismissOnSelect closes itself; we forward the chosen method.
  private pendingMethod: string | null = null;
  private popoverDismissWith(method: string): void {
    this.pendingMethod = method;
  }

  protected async onPopoverDismiss(_event: CustomEvent): Promise<void> {
    const method = this.pendingMethod;
    this.pendingMethod = null;
    switch (method) {
      case 'exportRaw': await this.store.export('raw'); break;
      case 'showStatistics': await this.store.showStatistics(); break;
      case 'changeDuration': await this.store.changeDuration(); break;
    }
  }

  /* ---------------- ActionSheet ---------------- */
  protected async showActions(session: SessionModel): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.session_as_title());
    options.buttons.push(createActionSheetButton('session.view', this.store.i18n.session_view(), this.imgixBaseUrl, 'eye'));
    if (session.userKey) {
      options.buttons.push(createActionSheetButton('session.editUser', this.store.i18n.session_edit_user(), this.imgixBaseUrl, 'edit'));
      options.buttons.push(createActionSheetButton('session.editPerson', this.store.i18n.session_edit_person(), this.imgixBaseUrl, 'person'));
      options.buttons.push(createActionSheetButton('session.hideUser', this.store.i18n.session_hide_user(), this.imgixBaseUrl, 'eye-off'));
    }
    options.buttons.push(createActionSheetButton('cancel', 'Abbrechen', this.imgixBaseUrl, 'cancel'));

    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'session.view': await this.store.viewSession(session); break;
      case 'session.editUser': await this.store.editUser(session); break;
      case 'session.editPerson': await this.store.editPerson(session); break;
      case 'session.hideUser': this.store.hideUser(session); break;
    }
  }

  /* ---------------- formatting ---------------- */
  protected formatDate(sdt: string): string {
    if (!sdt) return '—';
    return convertDateFormatToString(sdt, DateFormat.StoreDateTime, DateFormat.ViewDateTime);
  }

  protected formatDuration(session: SessionModel): string {
    if (session.isActive) return '—';
    const s = session.durationSeconds;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  }

  protected statusLabel(session: SessionModel): string {
    return getSessionStatus(session, Date.now());
  }

  protected statusColor(session: SessionModel): string {
    return getSessionStatusColor(getSessionStatus(session, Date.now()));
  }

  protected hasRole = (role: Parameters<typeof hasRole>[0]) => hasRole(role, this.store.currentUser());
}
```

> **Note on the popover→action bridge:** `ion-popover` with `[dismissOnSelect]="true"` closes
> on item click, then fires `ionPopoverDidDismiss`. The `pendingMethod` field captures which
> item was clicked so `onPopoverDismiss` can dispatch it. This mirrors how trip-list uses
> `dismissPopover(...)` + `onPopoverDismiss`. If the project's `dismissPopover` helper instead
> calls `popoverController.dismiss(method)` and reads `$event.detail.data`, follow that exact
> pattern from [trip-list.ts](../../libs/geo/trip/feature/src/lib/trip-list.ts) — check which
> one trip-list actually uses and match it (remove the `pendingMethod` shim if so).

- [ ] **Step 2: Verify the popover dispatch pattern** — open [trip-list.ts](../../libs/geo/trip/feature/src/lib/trip-list.ts) and read its `dismissPopover` + `onPopoverDismiss`. If it uses `popoverController.dismiss(method)` and `onPopoverDismiss` reads `$event.detail.data`, replace the `pendingMethod` shim in Step 1 with that pattern (inject `PopoverController`, `dismissPopover(m){ this.popoverController.dismiss(m); }`, and read `const method = $event.detail.data;`). Keep whichever the codebase already uses.

- [ ] **Step 3: Verify icon names exist** — `eye`, `eye-off`, `person`, `chart`, `calendar`, `download`, `edit`, `menu`, `cancel`. Per the icons skill, icon names come from the DB icon set. Run a quick check against an existing usage (`grep -rn "'eye-off'\|'eye'\|'person'" libs --include='*.ts' | head`). If a name isn't used anywhere, pick an existing equivalent (e.g. reuse `'edit'`/`'trash'`/`'copy'` seen in aoc-user-account). Do not invent names.

- [ ] **Step 4: Type-check the whole aoc-feature lib**

Run: `npx tsc --noEmit -p libs/aoc/feature/tsconfig.json`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/aoc/feature/src/lib/aoc-session.ts
git commit -m "feat(aoc): standard list-filter, context menu and ActionSheet for sessions"
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests for the new util lib**

Run: `pnpm nx test session-util`
Expected: PASS.

- [ ] **Step 2: Type-check every touched lib**

Run each; expected: no errors:
```bash
npx tsc --noEmit -p libs/session/util/tsconfig.json
npx tsc --noEmit -p libs/session/data-access/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/aoc/util/tsconfig.json
npx tsc --noEmit -p libs/aoc/feature/tsconfig.json
```

- [ ] **Step 3: Lint the changed projects** (use the eslint skill's per-project form to avoid the heap OOM)

Run:
```bash
pnpm nx lint session-util
pnpm nx lint aoc-feature
```
Expected: no lint errors. Fix any.

- [ ] **Step 4: Build the affected libs to confirm buildable**

Run:
```bash
pnpm nx build session-util
pnpm nx build aoc-feature
```
Expected: successful builds, output under `dist/libs/...`.

- [ ] **Step 5: Manual smoke test** (serve the app, navigate to `/aoc/sessions`)

Run: `pnpm nx serve scs-app` (after env setup), then:
- Default view shows last-7-days sessions, newest first.
- Search filters by email/browser/os.
- Status string-select filters active/stale/orphaned/ended.
- Context menu: export downloads a CSV; statistics modal opens; change-duration widens the range and the list reloads.
- Row tap → ActionSheet: view opens detail modal; edit user navigates to `/user/:userKey`; edit person opens PersonEditModal; hide user removes that user's rows.

- [ ] **Step 6: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "chore(aoc): verification fixes for session view"
```

---

## Self-Review notes

- **Spec coverage:** list-filter+search (T11), status filter (T2/T11), removed Today/Week/All (T11), context menu export/statistics/changeDuration (T10/T11), default last week (T10), changeDuration from/to (T9/T10), ActionSheet view/editUser/editPerson + hide.user (T10/T11), `index` field + populate + backfill (T3/T4/T5), CSV export (T10), detail/statistics modals (T7/T8). All covered.
- **Decisions honoured:** server-side range query reusing the existing index (T10), new `session-util` lib (T1/T2), real CSV export (T10), backfill via aoc-data (T5).
- **Verify-before-coding flags** are embedded where a signature/name could differ (DateFormat.IsoDateTime, subDuration with StoreDateTime, UserService.read, popover dispatch pattern, icon names, showToast export, person-data-access dep). These are confirmations, not placeholders — each has a concrete grep + fallback.

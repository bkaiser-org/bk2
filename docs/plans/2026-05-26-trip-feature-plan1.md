# Trip Feature — Plan 1 (Core Kiosk Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `libs/geo/trip` library (4 layers: util, data-access, ui, feature) delivering a full kiosk trip-entry flow — list, create, edit, end, and soft-delete rowing trips.

**Architecture:** All business logic in `TripStore` (NgRx Signal Store); `TripService` is a thin Firestore gateway; `TripEditForm` (dumb, ngx-vest-forms) is owned by the `ui` layer; `TripList`, `TripEditModal`, and `AocTrip` (stub) are in the `feature` layer. Soft-delete takes a photo (Capacitor Camera), uploads via `UploadService`, and notifies the `trip` responsible person by creating a `TaskModel`.

**Tech Stack:** Angular 20 (standalone, zoneless), Ionic 8.7, NgRx Signal Stores (`@ngrx/signals`), Firebase/Firestore, `rxfire`, vest, ngx-vest-forms, Capacitor Camera, date-fns.

**Design doc:** `docs/superpowers/specs/2026-05-26-trip-feature-design.md`
**Spec:** `docs/2026-05-25-trip-feature-spec.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `libs/shared/models/src/lib/menu-item.model.ts` | Modify | Add `'kiosk'` to `RoleName` union |
| `libs/shared/models/src/lib/roles.ts` | Modify | Add `kiosk?: boolean` to `Roles` |
| `libs/shared/models/src/lib/trip.model.ts` | Modify | Add `flagged?: boolean` |
| `libs/geo/trip/util/{tsconfig,tsconfig.lib,package,project,vite.config}.{json,ts}` | Create | Scaffold util layer |
| `libs/geo/trip/util/src/{index.ts,lib/scope.ts,lib/trip.util.ts,lib/trip.validations.ts,lib/trip.util.spec.ts}` | Create | Util layer source |
| `libs/geo/trip/data-access/{tsconfig,tsconfig.lib,package,project}.json` | Create | Scaffold data-access layer |
| `libs/geo/trip/data-access/src/{index.ts,lib/scope.ts,lib/trip.service.ts}` | Create | Service |
| `libs/geo/trip/ui/{tsconfig,tsconfig.lib,package,project}.json` | Create | Scaffold ui layer |
| `libs/geo/trip/ui/src/{index.ts,lib/scope.ts,lib/trip-edit.form.ts}` | Create | Form component |
| `libs/geo/trip/feature/{tsconfig,tsconfig.lib,package,project}.json` | Create | Scaffold feature layer |
| `libs/geo/trip/feature/src/{index.ts,lib/scope.ts,lib/trip.store.ts,lib/trip-list.ts,lib/trip-edit.modal.ts,lib/aoc-trip.ts}` | Create | Feature components |
| `libs/geo/trip/feature/src/i18n/de.json` | Create | German translations |
| `tsconfig.base.json` | Modify | Add 4 `@bk2/trip-*` path aliases |
| `apps/scs-app/project.json` | Modify | Add trip/feature i18n asset glob |
| `apps/scs-app/src/app/app.routes.ts` | Modify | Add `/trips` and `/aoc/trip` routes |

---

## Task 1: Schema Changes

**Files:**
- Modify: `libs/shared/models/src/lib/menu-item.model.ts:4`
- Modify: `libs/shared/models/src/lib/roles.ts`
- Modify: `libs/shared/models/src/lib/trip.model.ts`

- [ ] **Step 1: Add `kiosk` to `RoleName`**

In `libs/shared/models/src/lib/menu-item.model.ts`, find line 4:
```typescript
// BEFORE:
export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin';

// AFTER:
export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin' | 'kiosk';
```

- [ ] **Step 2: Add `kiosk` to `Roles`**

In `libs/shared/models/src/lib/roles.ts`, after the `admin?: boolean;` line:
```typescript
// BEFORE (last lines of Roles type):
  admin?: boolean;
};

// AFTER:
  admin?: boolean;
  kiosk?: boolean;
};
```

- [ ] **Step 3: Add `flagged` to `TripModel`**

In `libs/shared/models/src/lib/trip.model.ts`, after the `deletedBy` line:
```typescript
// BEFORE:
  public deletedBy?: string | null;     // optional: device id, station name, or admin who deleted

// AFTER:
  public deletedBy?: string | null;     // optional: device id, station name, or admin who deleted
  public flagged?: boolean;             // set by suspicious activity detection
```

- [ ] **Step 4: Type-check shared-models**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/models/src/lib/menu-item.model.ts libs/shared/models/src/lib/roles.ts libs/shared/models/src/lib/trip.model.ts
git commit -m "feat(trip): add kiosk role and flagged field to shared models"
```

---

## Task 2: Scaffold `@bk2/trip-util`

**Files:** All new files under `libs/geo/trip/util/`

- [ ] **Step 1: Create `tsconfig.json`**

Create `libs/geo/trip/util/tsconfig.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
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
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/constants/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create `tsconfig.lib.json`**

Create `libs/geo/trip/util/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/trip/util",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/trip-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "**/*.spec.ts",
    "**/*.spec2.ts",
    "**/test-setup.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 3: Create `package.json`**

Create `libs/geo/trip/util/package.json`:
```json
{
  "name": "@bk2/trip-util",
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

- [ ] **Step 4: Create `project.json`**

Create `libs/geo/trip/util/project.json`:
```json
{
  "name": "trip-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/trip/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:trip", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/trip/util",
        "main": "libs/geo/trip/util/src/index.ts",
        "tsConfig": "libs/geo/trip/util/tsconfig.lib.json",
        "assets": ["libs/geo/trip/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "configFile": "libs/geo/trip/util/vite.config.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create `vite.config.ts`**

Create `libs/geo/trip/util/vite.config.ts`:
```typescript
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/trip/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../coverage/libs/trip/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

- [ ] **Step 6: Create source stubs**

Create `libs/geo/trip/util/src/lib/scope.ts`:
```typescript
export const PFX = '@geo/trip/util.';
```

Create `libs/geo/trip/util/src/index.ts`:
```typescript
export * from './lib/trip.util';
export * from './lib/trip.validations';
```

- [ ] **Step 7: Commit scaffold**

```bash
git add libs/geo/trip/util/
git commit -m "feat(trip): scaffold trip-util library"
```

---

## Task 3: Scaffold `@bk2/trip-data-access`

**Files:** All new files under `libs/geo/trip/data-access/`

- [ ] **Step 1: Create `tsconfig.json`**

Create `libs/geo/trip/data-access/tsconfig.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
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
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/constants/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/data-access/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create `tsconfig.lib.json`**

Create `libs/geo/trip/data-access/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/trip/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/trip-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "**/*.spec.ts",
    "**/*.spec2.ts",
    "**/test-setup.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 3: Create `package.json`**

Create `libs/geo/trip/data-access/package.json`:
```json
{
  "name": "@bk2/trip-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/trip-util": "*"
  }
}
```

- [ ] **Step 4: Create `project.json`**

Create `libs/geo/trip/data-access/project.json`:
```json
{
  "name": "trip-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/trip/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:trip", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/trip/data-access",
        "main": "libs/geo/trip/data-access/src/index.ts",
        "tsConfig": "libs/geo/trip/data-access/tsconfig.lib.json",
        "assets": ["libs/geo/trip/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create source stubs**

Create `libs/geo/trip/data-access/src/lib/scope.ts`:
```typescript
export const PFX = '@geo/trip/data-access.';
```

Create `libs/geo/trip/data-access/src/index.ts`:
```typescript
export * from './lib/trip.service';
```

- [ ] **Step 6: Commit**

```bash
git add libs/geo/trip/data-access/
git commit -m "feat(trip): scaffold trip-data-access library"
```

---

## Task 4: Scaffold `@bk2/trip-ui`

**Files:** All new files under `libs/geo/trip/ui/`

- [ ] **Step 1: Create `tsconfig.json`**

Create `libs/geo/trip/ui/tsconfig.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
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
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/constants/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/ui/tsconfig.lib.json"},
    {"path": "../../../shared/pipes/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create `tsconfig.lib.json`**

Create `libs/geo/trip/ui/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/trip/ui",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/trip-ui.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "**/*.spec.ts",
    "**/*.spec2.ts",
    "**/test-setup.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 3: Create `package.json`**

Create `libs/geo/trip/ui/package.json`:
```json
{
  "name": "@bk2/trip-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/trip-util": "*"
  }
}
```

- [ ] **Step 4: Create `project.json`**

Create `libs/geo/trip/ui/project.json`:
```json
{
  "name": "trip-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/trip/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:trip", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/trip/ui",
        "main": "libs/geo/trip/ui/src/index.ts",
        "tsConfig": "libs/geo/trip/ui/tsconfig.lib.json",
        "assets": ["libs/geo/trip/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create source stubs**

Create `libs/geo/trip/ui/src/lib/scope.ts`:
```typescript
export const PFX = '@geo/trip/ui.';
```

Create `libs/geo/trip/ui/src/index.ts`:
```typescript
export * from './lib/trip-edit.form';
```

- [ ] **Step 6: Commit**

```bash
git add libs/geo/trip/ui/
git commit -m "feat(trip): scaffold trip-ui library"
```

---

## Task 5: Scaffold `@bk2/trip-feature`

**Files:** All new files under `libs/geo/trip/feature/`

- [ ] **Step 1: Create `tsconfig.json`**

Create `libs/geo/trip/feature/tsconfig.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
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
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/constants/tsconfig.lib.json"},
    {"path": "../../../shared/feature/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/ui/tsconfig.lib.json"},
    {"path": "../../../shared/pipes/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../task/data-access/tsconfig.lib.json"},
    {"path": "../../../relationship/responsibility/data-access/tsconfig.lib.json"},
    {"path": "../../../avatar/data-access/tsconfig.lib.json"},
    {"path": "../../../cms/menu/feature/tsconfig.lib.json"},
    {"path": "../data-access/tsconfig.lib.json"},
    {"path": "../ui/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create `tsconfig.lib.json`**

Create `libs/geo/trip/feature/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/trip/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/trip-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "**/*.spec.ts",
    "**/*.spec2.ts",
    "**/test-setup.ts",
    "vite.config.ts"
  ]
}
```

- [ ] **Step 3: Create `package.json`**

Create `libs/geo/trip/feature/package.json`:
```json
{
  "name": "@bk2/trip-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/task-data-access": "*",
    "@bk2/relationship-responsibility-data-access": "*",
    "@bk2/avatar-data-access": "*",
    "@bk2/cms-menu-feature": "*",
    "@bk2/trip-data-access": "*",
    "@bk2/trip-ui": "*",
    "@bk2/trip-util": "*"
  }
}
```

- [ ] **Step 4: Create `project.json`**

Create `libs/geo/trip/feature/project.json`:
```json
{
  "name": "trip-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/geo/trip/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:trip", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/trip/feature",
        "main": "libs/geo/trip/feature/src/index.ts",
        "tsConfig": "libs/geo/trip/feature/tsconfig.lib.json",
        "assets": ["libs/geo/trip/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create source stubs**

Create `libs/geo/trip/feature/src/lib/scope.ts`:
```typescript
export const PFX = '@geo/trip/feature.';
```

Create `libs/geo/trip/feature/src/index.ts`:
```typescript
export * from './lib/trip.store';
export * from './lib/trip-list';
export * from './lib/trip-edit.modal';
export * from './lib/aoc-trip';
```

- [ ] **Step 6: Commit**

```bash
git add libs/geo/trip/feature/
git commit -m "feat(trip): scaffold trip-feature library"
```

---

## Task 6: Register Path Aliases and i18n Assets

**Files:**
- Modify: `tsconfig.base.json`
- Modify: `apps/scs-app/project.json`

- [ ] **Step 1: Add path aliases to `tsconfig.base.json`**

In `tsconfig.base.json`, inside the `"paths"` object, add (following the existing `@bk2/location-*` entries as placement reference):
```json
"@bk2/trip-util": ["libs/geo/trip/util/src/index.ts"],
"@bk2/trip-data-access": ["libs/geo/trip/data-access/src/index.ts"],
"@bk2/trip-ui": ["libs/geo/trip/ui/src/index.ts"],
"@bk2/trip-feature": ["libs/geo/trip/feature/src/index.ts"],
```

- [ ] **Step 2: Add i18n asset glob to `apps/scs-app/project.json`**

In `apps/scs-app/project.json`, inside the `"assets"` array of the build target, add (near the other `geo/` entries around line 297):
```json
{
  "glob": "*.json",
  "input": "libs/geo/trip/feature/src/i18n",
  "output": "./assets/i18n/geo/trip/feature"
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.base.json apps/scs-app/project.json
git commit -m "feat(trip): register trip library aliases and i18n assets"
```

---

## Task 7: Utility Functions (`trip.util.ts` + `trip.validations.ts`)

**Files:**
- Create: `libs/geo/trip/util/src/lib/trip.util.ts`
- Create: `libs/geo/trip/util/src/lib/trip.validations.ts`

- [ ] **Step 1: Write `trip.util.ts`**

Create `libs/geo/trip/util/src/lib/trip.util.ts`:
```typescript
import { format } from 'date-fns';

import { TripModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, getTodayStr } from '@bk2/shared-util-core';

export function newTrip(tenantId: string): TripModel {
  const trip = new TripModel(tenantId);
  trip.startDate = getTodayStr(DateFormat.StoreDate);
  trip.startTime = format(new Date(), 'HHmm');
  trip.state = 'draft';
  return trip;
}

export function newTripName(trip: TripModel): string {
  return `${trip.startDate}${trip.startTime}${trip.resource?.name1 ?? ''}`;
}

export function getTripIndex(trip: TripModel): string {
  let index = '';
  index = addIndexElement(index, 'b', trip.resource?.name1 ?? '');
  index = addIndexElement(index, 'd', trip.startDate);
  for (const p of trip.participants) {
    index = addIndexElement(index, 'p', `${p.name1} ${p.name2}`.trim());
  }
  return index;
}

export function groupTripsByDay(trips: TripModel[]): { date: string; trips: TripModel[] }[] {
  const map = new Map<string, TripModel[]>();
  for (const trip of trips) {
    const key = trip.startDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(trip);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, trips]) => ({ date, trips }));
}

export function matchesStateFilter(state: string, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'revised') return state.endsWith('.rev');
  if (filter === 'corrected') return state.endsWith('.corr');
  return state === filter;
}

export function compareTripDate(a: TripModel, b: TripModel): number {
  const keyA = a.startDate + a.startTime;
  const keyB = b.startDate + b.startTime;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

export function formatTripTime(time: string): string {
  if (!time || time.length !== 4) return time ?? '';
  return `${time.substring(0, 2)}:${time.substring(2, 4)}`;
}
```

- [ ] **Step 2: Write `trip.validations.ts`**

Create `libs/geo/trip/util/src/lib/trip.validations.ts`:
```typescript
import { enforce, only, staticSuite, test } from 'vest';

import { TripModel } from '@bk2/shared-models';

export const tripValidationSuite = staticSuite((trip: TripModel, field?: string) => {
  if (field) only(field);

  test('resource', '@trip/field.boat', () => {
    enforce(trip.resource?.key).isNotBlank();
  });

  test('participants', '@trip/field.participants', () => {
    enforce(trip.participants.length).greaterThan(0);
  });
});
```

- [ ] **Step 3: Type-check util layer**

```bash
npx tsc --noEmit -p libs/geo/trip/util/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/geo/trip/util/src/lib/trip.util.ts libs/geo/trip/util/src/lib/trip.validations.ts
git commit -m "feat(trip): add trip utility functions and vest validations"
```

---

## Task 8: Unit Tests (`trip.util.spec.ts`)

**Files:**
- Create: `libs/geo/trip/util/src/lib/trip.util.spec.ts`

- [ ] **Step 1: Write tests**

Create `libs/geo/trip/util/src/lib/trip.util.spec.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TripModel } from '@bk2/shared-models';
import {
  newTrip,
  newTripName,
  getTripIndex,
  groupTripsByDay,
  matchesStateFilter,
  compareTripDate,
  formatTripTime,
} from './trip.util';

const TENANT = 'test-tenant';

function makeTrip(overrides: Partial<TripModel> = {}): TripModel {
  const trip = new TripModel(TENANT);
  trip.startDate = '20240601';
  trip.startTime = '0830';
  trip.state = 'open';
  return Object.assign(trip, overrides);
}

describe('newTrip', () => {
  it('creates a trip with state draft', () => {
    const trip = newTrip(TENANT);
    expect(trip.state).toBe('draft');
    expect(trip.tenants).toContain(TENANT);
    expect(trip.startDate).toMatch(/^\d{8}$/);
    expect(trip.startTime).toMatch(/^\d{4}$/);
  });
});

describe('newTripName', () => {
  it('formats yyyymmddhhmmboatname', () => {
    const trip = makeTrip({ resource: { key: 'r1', name1: 'Skiff', name2: '', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' } });
    expect(newTripName(trip)).toBe('202406010830Skiff');
  });

  it('uses empty string when resource is undefined', () => {
    const trip = makeTrip();
    expect(newTripName(trip)).toBe('202406010830');
  });
});

describe('getTripIndex', () => {
  it('includes boat name, date and participant names', () => {
    const trip = makeTrip({
      resource: { key: 'r1', name1: 'Skiff', name2: '', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' },
      participants: [
        { key: 'p1', name1: 'Anna', name2: 'Müller', modelType: 'person', type: '', subType: '', label: 'Anna Müller' },
      ],
    });
    const idx = getTripIndex(trip);
    expect(idx).toContain('Skiff');
    expect(idx).toContain('20240601');
    expect(idx).toContain('Anna');
  });
});

describe('formatTripTime', () => {
  it('converts 0830 to 08:30', () => {
    expect(formatTripTime('0830')).toBe('08:30');
  });

  it('returns input unchanged for non 4-char strings', () => {
    expect(formatTripTime('')).toBe('');
    expect(formatTripTime('083')).toBe('083');
  });
});

describe('matchesStateFilter', () => {
  it('all matches everything', () => {
    expect(matchesStateFilter('open', 'all')).toBe(true);
    expect(matchesStateFilter('deleted', 'all')).toBe(true);
  });

  it('revised matches .rev suffix', () => {
    expect(matchesStateFilter('open.rev', 'revised')).toBe(true);
    expect(matchesStateFilter('closed.rev', 'revised')).toBe(true);
    expect(matchesStateFilter('open', 'revised')).toBe(false);
  });

  it('corrected matches .corr suffix', () => {
    expect(matchesStateFilter('closed.corr', 'corrected')).toBe(true);
    expect(matchesStateFilter('open', 'corrected')).toBe(false);
  });

  it('exact state match otherwise', () => {
    expect(matchesStateFilter('open', 'open')).toBe(true);
    expect(matchesStateFilter('closed', 'open')).toBe(false);
    expect(matchesStateFilter('deleted', 'deleted')).toBe(true);
  });
});

describe('compareTripDate', () => {
  it('sorts by startDate + startTime descending', () => {
    const a = makeTrip({ startDate: '20240601', startTime: '0800' });
    const b = makeTrip({ startDate: '20240601', startTime: '0900' });
    const c = makeTrip({ startDate: '20240602', startTime: '0800' });
    const trips = [a, b, c];
    trips.sort((x, y) => compareTripDate(y, x));
    expect(trips[0]).toBe(c);
    expect(trips[1]).toBe(b);
    expect(trips[2]).toBe(a);
  });
});

describe('groupTripsByDay', () => {
  it('groups trips by startDate descending', () => {
    const t1 = makeTrip({ startDate: '20240601', bkey: 't1' });
    const t2 = makeTrip({ startDate: '20240601', bkey: 't2' });
    const t3 = makeTrip({ startDate: '20240602', bkey: 't3' });
    const groups = groupTripsByDay([t1, t2, t3]);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('20240602');
    expect(groups[1].date).toBe('20240601');
    expect(groups[1].trips).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
pnpm run test trip-util
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add libs/geo/trip/util/src/lib/trip.util.spec.ts
git commit -m "test(trip): add unit tests for trip utility functions"
```

---

## Task 9: `TripService`

**Files:**
- Create: `libs/geo/trip/data-access/src/lib/trip.service.ts`

- [ ] **Step 1: Write `TripService`**

Create `libs/geo/trip/data-access/src/lib/trip.service.ts`:
```typescript
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { TripCollection, TripModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getTripIndex, newTripName } from '@bk2/trip-util';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class TripService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
  });

  public list(orderBy = 'startDate', sortOrder: 'asc' | 'desc' = 'desc'): Observable<TripModel[]> {
    return this.firestoreService.searchData<TripModel>(
      TripCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public read(key: string): Observable<TripModel | undefined> {
    return findByKey<TripModel>(this.list(), key);
  }

  public async create(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);
    return this.firestoreService.createModel<TripModel>(
      TripCollection, trip, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async update(trip: TripModel, currentUser?: UserModel): Promise<string | undefined> {
    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);
    return this.firestoreService.updateModel<TripModel>(
      TripCollection, trip, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async softDelete(trip: TripModel, reason: string, photoUrl: string | undefined, currentUser?: UserModel): Promise<void> {
    trip.deletedAt = new Date().toISOString();
    trip.deletedBy = currentUser?.bkey ?? null;
    trip.state = 'deleted';
    trip.notes = trip.notes
      ? `${trip.notes}\n[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`
      : `[Gelöscht: ${reason}${photoUrl ? ` | ${photoUrl}` : ''}]`;
    await this.update(trip, currentUser);
  }
}
```

- [ ] **Step 2: Type-check data-access layer**

```bash
npx tsc --noEmit -p libs/geo/trip/data-access/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/geo/trip/data-access/src/lib/trip.service.ts
git commit -m "feat(trip): implement TripService (CRUD + softDelete)"
```

---

## Task 10: `TripStore`

**Files:**
- Create: `libs/geo/trip/feature/src/lib/trip.store.ts`

- [ ] **Step 1: Write `TripStore`**

Create `libs/geo/trip/feature/src/lib/trip.store.ts`:
```typescript
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActionSheetController, ModalController, Platform } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { TaskModel, TripModel, UserModel } from '@bk2/shared-models';
import { AlertService } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';

import { TaskService } from '@bk2/task-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { readAsFile } from '@bk2/avatar-util';

import { TripService } from '@bk2/trip-data-access';
import { compareTripDate, groupTripsByDay, matchesStateFilter, newTrip } from '@bk2/trip-util';

import { TripEditModal } from './trip-edit.modal';
import { PFX } from './scope';

const TRIP_I18N_KEYS = {
  list_title:         PFX + 'list.title',
  empty:              PFX + 'empty',
  cancel:             PFX + 'cancel',
  delete_confirm:     PFX + 'delete.confirm',
  delete_reason:      PFX + 'delete.reason',
  delete_conf:        PFX + 'delete.conf',
  delete_error:       PFX + 'delete.error',
  add_title:          PFX + 'add.title',
  edit_title:         PFX + 'edit.title',
  end_title:          PFX + 'end.title',
  as_add:             PFX + 'actionsheet.add',
  as_edit:            PFX + 'actionsheet.edit',
  as_end:             PFX + 'actionsheet.end',
  as_delete:          PFX + 'actionsheet.delete',
  as_report_damage:   PFX + 'actionsheet.report_damage',
  as_report_bug:      PFX + 'actionsheet.report_bug',
  as_add_guest:       PFX + 'actionsheet.add_guest',
  as_show_images:     PFX + 'actionsheet.show_images',
  warning_suspicious: PFX + 'warning.suspicious',
} satisfies Record<string, string>;

export type TripI18n = { [K in keyof typeof TRIP_I18N_KEYS]: Signal<string> };

export type TripState = {
  searchTerm: string;
  stateFilter: string;
};

const initialState: TripState = {
  searchTerm: '',
  stateFilter: 'open',
};

export const TripStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    tripService: inject(TripService),
    taskService: inject(TaskService),
    responsibilityService: inject(ResponsibilityService),
    uploadService: inject(UploadService),
    modalController: inject(ModalController),
    actionSheetController: inject(ActionSheetController),
    alertService: inject(AlertService),
    platform: inject(Platform),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(TRIP_I18N_KEYS),
    tripsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.tripService.list(),
    }),
  })),
  withComputed(store => ({
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
    isLoading: computed(() => store.tripsResource.isLoading()),
    canWrite: computed(() =>
      hasRole('kiosk', store.appStore.currentUser()) || hasRole('admin', store.appStore.currentUser())
    ),
    filteredTrips: computed(() => {
      const all = store.tripsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const stateFilter = store.stateFilter();
      return all
        .filter(t => matchesStateFilter(t.state, stateFilter))
        .filter(t => !term || t.index.toLowerCase().includes(term))
        .sort((a, b) => compareTripDate(b, a));
    }),
    groupedByDay: computed(() => groupTripsByDay(store.filteredTrips())),
  })),
  withMethods(store => ({
    setSearchTerm(searchTerm: string) {
      patchState(store, { searchTerm });
    },

    setStateFilter(stateFilter: string) {
      patchState(store, { stateFilter });
    },

    async openTripModal(trip: TripModel, mode: 'add' | 'edit' | 'end'): Promise<void> {
      if (!store.canWrite()) return;
      const modal = await store.modalController.create({
        component: TripEditModal,
        componentProps: { trip, mode },
      });
      await modal.present();
      await modal.onDidDismiss();
      store.tripsResource.reload();
    },

    async createTrip(): Promise<void> {
      if (!store.canWrite()) return;
      const trip = newTrip(store.tenantId());
      await this.openTripModal(trip, 'add');
    },

    async editTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'edit');
    },

    async endTrip(trip: TripModel): Promise<void> {
      await this.openTripModal(trip, 'end');
    },

    async deleteTrip(trip: TripModel): Promise<void> {
      if (!store.canWrite()) return;
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (!confirmed) return;

      let photoUrl: string | undefined;
      try {
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
        });
        const file = await readAsFile(photo, store.platform);
        if (file) {
          const fullPath = `${store.tenantId()}/trips/${trip.bkey}/images/delete_${Date.now()}.jpg`;
          photoUrl = await store.uploadService.uploadFile(file, fullPath, 'Löschfoto');
        }
      } catch {
        // photo capture is optional — proceed without it
      }

      const reason = store.i18n.delete_reason();
      await store.tripService.softDelete(trip, reason, photoUrl, store.currentUser());
      await this.notifyResponsibility('trip', `Trip gelöscht: ${trip.name}`, reason, photoUrl, store.currentUser());
      store.tripsResource.reload();
    },

    async reportDamage(trip: TripModel): Promise<void> {
      await this.notifyResponsibility('trip', `Schaden gemeldet: ${trip.name}`, '', undefined, store.currentUser());
    },

    async reportBug(trip: TripModel): Promise<void> {
      await this.notifyResponsibility('dev', `Fehler gemeldet: ${trip.name}`, '', undefined, store.currentUser());
    },

    async notifyResponsibility(
      responsibilityName: string,
      taskName: string,
      notes: string,
      photoUrl: string | undefined,
      currentUser: UserModel | undefined,
    ): Promise<void> {
      const responsibilities = await firstValueFrom(store.responsibilityService.list());
      const responsibility = responsibilities.find(r => r.name === responsibilityName);
      if (!responsibility?.responsibleAvatar) return;

      const task = new TaskModel(store.tenantId());
      task.name = taskName;
      task.assignee = responsibility.responsibleAvatar;
      task.notes = photoUrl ? `${notes}\nFoto: ${photoUrl}` : notes;
      task.tags = ['trip'];
      await store.taskService.create(task, currentUser);
    },
  }))
);
```

- [ ] **Step 2: Type-check feature layer**

```bash
npx tsc --noEmit -p libs/geo/trip/feature/tsconfig.json
```
Expected: no errors (some will resolve once other files are created in later tasks — run full check again in Task 15).

- [ ] **Step 3: Commit**

```bash
git add libs/geo/trip/feature/src/lib/trip.store.ts
git commit -m "feat(trip): implement TripStore with signal store, CRUD actions, and notifications"
```

---

## Task 11: `TripEditForm` (dumb form component)

**Files:**
- Create: `libs/geo/trip/ui/src/lib/trip-edit.form.ts`

- [ ] **Step 1: Write `TripEditForm`**

Create `libs/geo/trip/ui/src/lib/trip-edit.form.ts`:
```typescript
import { Component, input, output, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonChip, IonInput, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonTextarea, IonToggle } from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';

import { AvatarInfo, ResourceModel, TripModel } from '@bk2/shared-models';
import { formatTripTime } from '@bk2/trip-util';

export interface TripFormI18n {
  add_title: Signal<string>;
  edit_title: Signal<string>;
  end_title: Signal<string>;
  field_boat: Signal<string>;
  field_location: Signal<string>;
  field_custom_location: Signal<string>;
  field_distance: Signal<string>;
  field_participants: Signal<string>;
  field_notes: Signal<string>;
  field_start_date: Signal<string>;
  field_start_time: Signal<string>;
  field_end_date: Signal<string>;
  field_end_time: Signal<string>;
  warning_distance_zero: Signal<string>;
  warning_distance_high: Signal<string>;
  warning_seats_mismatch: Signal<string>;
}

@Component({
  selector: 'bk-trip-edit-form',
  standalone: true,
  imports: [
    FormsModule,
    SvgIconPipe,
    IonItem, IonLabel, IonNote, IonInput, IonTextarea,
    IonSelect, IonSelectOption, IonChip, IonToggle,
  ],
  template: `
    <!-- Start date/time (display only) -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_start_date() }}</ion-label>
      <ion-note slot="end">{{ formData().startDate }}</ion-note>
    </ion-item>
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_start_time() }}</ion-label>
      <ion-note slot="end">{{ formatTime(formData().startTime) }}</ion-note>
    </ion-item>

    <!-- End date/time (edit/end mode only) -->
    @if (mode() === 'edit' || mode() === 'end') {
      <ion-item lines="full">
        <ion-label position="stacked">{{ i18n().field_end_date() }}</ion-label>
        <ion-input
          type="date"
          [ngModel]="endDateIso()"
          (ngModelChange)="onEndDateChange($event)"
        />
      </ion-item>
      <ion-item lines="full">
        <ion-label position="stacked">{{ i18n().field_end_time() }}</ion-label>
        <ion-input
          type="time"
          [ngModel]="endTimeDisplay()"
          (ngModelChange)="onEndTimeChange($event)"
        />
      </ion-item>
    }

    <!-- Boat select -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_boat() }}</ion-label>
      <ion-select
        [ngModel]="formData().resource?.key ?? ''"
        (ngModelChange)="onBoatChange($event)"
        interface="action-sheet"
      >
        @for (boat of boats(); track boat.bkey) {
          <ion-select-option [value]="boat.bkey">{{ boat.name }}</ion-select-option>
        }
      </ion-select>
    </ion-item>

    <!-- Custom location label (Plan 1 — no LocationSelect yet) -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_custom_location() }}</ion-label>
      <ion-input
        [ngModel]="formData().customLocationLabel"
        (ngModelChange)="patch({ customLocationLabel: $event })"
        [placeholder]="i18n().field_location()"
      />
    </ion-item>

    <!-- Distance -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_distance() }}</ion-label>
      <ion-input
        type="number"
        [ngModel]="formData().distance"
        (ngModelChange)="patch({ distance: +$event })"
        min="0"
      />
    </ion-item>
    @if (formData().distance === 0) {
      <ion-chip color="warning">{{ i18n().warning_distance_zero() }}</ion-chip>
    }
    @if (formData().distance > 50) {
      <ion-chip color="warning">{{ i18n().warning_distance_high() }}</ion-chip>
    }

    <!-- Notes -->
    <ion-item lines="full">
      <ion-label position="stacked">{{ i18n().field_notes() }}</ion-label>
      <ion-textarea
        [ngModel]="formData().notes"
        (ngModelChange)="patch({ notes: $event })"
        [rows]="3"
      />
    </ion-item>
  `,
})
export class TripEditForm {
  public readonly trip = input.required<TripModel>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();
  public readonly boats = input.required<ResourceModel[]>();
  public readonly i18n = input.required<TripFormI18n>();

  public readonly tripChange = output<TripModel>();
  public readonly validityChange = output<boolean>();

  protected formData = this.trip;

  protected formatTime = formatTripTime;

  protected endDateIso(): string {
    const d = this.formData().endDate;
    if (!d || d.length !== 8) return '';
    return `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
  }

  protected endTimeDisplay(): string {
    const t = this.formData().endTime;
    if (!t || t.length !== 4) return '';
    return `${t.substring(0, 2)}:${t.substring(2, 4)}`;
  }

  protected patch(partial: Partial<TripModel>): void {
    const updated = { ...this.formData(), ...partial };
    this.tripChange.emit(updated as TripModel);
    this.validityChange.emit(
      !!(updated.resource?.key) && (updated as TripModel).participants.length > 0
    );
  }

  protected onBoatChange(boatKey: string): void {
    const boat = this.boats().find(b => b.bkey === boatKey);
    if (!boat) return;
    this.patch({
      resource: {
        key: boat.bkey,
        name1: boat.name,
        name2: '',
        modelType: 'resource',
        type: boat.type,
        subType: boat.subType,
        label: boat.name,
      } as AvatarInfo,
    });
  }

  protected onEndDateChange(isoDate: string): void {
    this.patch({ endDate: isoDate.replace(/-/g, '') });
  }

  protected onEndTimeChange(hhmm: string): void {
    this.patch({ endTime: hhmm.replace(':', '') });
  }
}
```

- [ ] **Step 2: Type-check ui layer**

```bash
npx tsc --noEmit -p libs/geo/trip/ui/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/geo/trip/ui/src/lib/trip-edit.form.ts
git commit -m "feat(trip): implement TripEditForm dumb component"
```

---

## Task 12: `TripEditModal`

**Files:**
- Create: `libs/geo/trip/feature/src/lib/trip-edit.modal.ts`

- [ ] **Step 1: Write `TripEditModal`**

Create `libs/geo/trip/feature/src/lib/trip-edit.modal.ts`:
```typescript
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { format } from 'date-fns';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { AlertService } from '@bk2/shared-util-angular';
import { safeStructuredClone, DateFormat, getTodayStr } from '@bk2/shared-util-core';
import { ResourceModel, TripModel } from '@bk2/shared-models';

import { TripEditForm } from '@bk2/trip-ui';
import { newTripName, getTripIndex } from '@bk2/trip-util';
import { TripService } from '@bk2/trip-data-access';
import { TripStore } from './trip.store';

@Component({
  selector: 'bk-trip-edit-modal',
  standalone: true,
  imports: [Header, TripEditForm, IonContent],
  providers: [TripStore],
  template: `
    <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    <ion-content>
      @if (formData(); as formData) {
        <bk-trip-edit-form
          [trip]="formData"
          [mode]="mode()"
          [boats]="boats()"
          [i18n]="store.i18n"
          (tripChange)="onTripChange($event)"
          (validityChange)="formValid.set($event)"
        />
      }
      <ion-button
        expand="block"
        [disabled]="!formValid()"
        (click)="save()"
        style="margin: 16px;"
      >
        Speichern
      </ion-button>
    </ion-content>
  `,
})
export class TripEditModal {
  private readonly modalController = inject(ModalController);
  private readonly tripService = inject(TripService);
  private readonly alertService = inject(AlertService);
  private readonly appStore = inject(AppStore);
  protected readonly store = inject(TripStore);

  public readonly trip = input.required<TripModel>();
  public readonly mode = input.required<'add' | 'edit' | 'end'>();

  protected formData = linkedSignal(() => safeStructuredClone(this.trip()));
  protected formValid = signal(false);

  protected boats = computed(() =>
    (this.appStore.resources() ?? []).filter((r: ResourceModel) => r.type === 'rboat')
  );

  protected headerTitle = computed(() => {
    switch (this.mode()) {
      case 'add':  return this.store.i18n.add_title();
      case 'edit': return this.store.i18n.edit_title();
      case 'end':  return this.store.i18n.end_title();
    }
  });

  protected onTripChange(trip: TripModel): void {
    this.formData.set(trip);
  }

  public async save(): Promise<void> {
    const trip = this.formData();
    const currentUser = this.appStore.currentUser();

    if (trip.distance === 0 || trip.distance > 50) {
      const warningKey = trip.distance === 0
        ? this.store.i18n.warning_distance_zero()
        : this.store.i18n.warning_distance_high();
      const confirmed = await this.alertService.confirm(warningKey, true);
      if (!confirmed) return;
      await this.store.reportDamage(trip);
    }

    trip.name = newTripName(trip);
    trip.index = getTripIndex(trip);

    switch (this.mode()) {
      case 'add':
        trip.state = 'open';
        trip.startDate = getTodayStr(DateFormat.StoreDate);
        trip.startTime = format(new Date(), 'HHmm');
        await this.tripService.create(trip, currentUser);
        break;
      case 'edit':
        trip.state = trip.state.endsWith('.rev') ? trip.state : trip.state + '.rev';
        await this.tripService.update(trip, currentUser);
        break;
      case 'end':
        trip.endDate = getTodayStr(DateFormat.StoreDate);
        trip.endTime = format(new Date(), 'HHmm');
        trip.state = trip.state.includes('.rev') ? 'closed.rev' : 'closed';
        await this.tripService.update(trip, currentUser);
        break;
    }

    await this.modalController.dismiss(null, 'confirm');
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/geo/trip/feature/tsconfig.json
```
Expected: no errors (if errors remain from missing AocTrip/TripList, that resolves in Task 13).

- [ ] **Step 3: Commit**

```bash
git add libs/geo/trip/feature/src/lib/trip-edit.modal.ts
git commit -m "feat(trip): implement TripEditModal (add/edit/end modes)"
```

---

## Task 13: `TripList` + `AocTrip` stub

**Files:**
- Create: `libs/geo/trip/feature/src/lib/trip-list.ts`
- Create: `libs/geo/trip/feature/src/lib/aoc-trip.ts`

- [ ] **Step 1: Write `TripList`**

Create `libs/geo/trip/feature/src/lib/trip-list.ts`:
```typescript
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController, ActionSheetOptions,
  IonBackdrop, IonButton, IonButtons, IonChip, IonContent,
  IonHeader, IonIcon, IonItem, IonItemDivider, IonLabel,
  IonList, IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { EmptyList, ListFilter, Spinner } from '@bk2/shared-ui';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { AlertService, createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { hasRole } from '@bk2/shared-util-core';
import { TripModel } from '@bk2/shared-models';

import { formatTripTime } from '@bk2/trip-util';
import { TripStore } from './trip.store';

const STATE_OPTIONS = ['open', 'draft', 'closed', 'deleted', 'revised', 'corrected', 'all'];

@Component({
  selector: 'bk-trip-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonMenuButton,
    IonIcon, IonContent, IonList, IonItem, IonLabel, IonItemDivider,
    IonChip, IonBackdrop,
  ],
  providers: [TripStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.filteredTrips().length }} {{ store.i18n.list_title() }}</ion-title>
        @if (store.canWrite()) {
          <ion-buttons slot="end">
            <ion-button (click)="store.createTrip()">
              <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <bk-list-filter
        (searchTermChanged)="store.setSearchTerm($event)"
        [stateOptions]="stateOptions"
        (stateChanged)="store.setStateFilter($event)"
      />
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <bk-spinner />
        <ion-backdrop />
      } @else if (store.filteredTrips().length === 0) {
        <bk-empty-list [message]="store.i18n.empty()" />
      } @else {
        <ion-list lines="inset">
          @for (day of store.groupedByDay(); track day.date) {
            <ion-item-divider>
              <ion-label>{{ day.date | date:'EEEE, d. MMMM yyyy':'':'de' }}</ion-label>
            </ion-item-divider>
            @for (trip of day.trips; track trip.bkey) {
              <ion-item button (click)="showActions(trip)">
                <ion-label>
                  <strong>{{ formatTime(trip.startTime) }}</strong>
                  {{ trip.resource?.name1 }}
                </ion-label>
                <ion-label slot="end">
                  {{ trip.customLocationLabel || trip.locations[0] || '' }}
                  @if (trip.distance > 0) { · {{ trip.distance }} km }
                </ion-label>
                <ion-chip slot="end" [color]="stateColor(trip.state)">{{ trip.state }}</ion-chip>
              </ion-item>
            }
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class TripList {
  protected readonly store = inject(TripStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertService = inject(AlertService);
  private readonly appStore = inject(AppStore);

  protected readonly stateOptions = STATE_OPTIONS;
  protected readonly formatTime = formatTripTime;

  private get imgixBaseUrl(): string {
    return this.appStore.env.services.imgixBaseUrl;
  }

  protected stateColor(state: string): string {
    if (state === 'open' || state.startsWith('open')) return 'success';
    if (state === 'deleted') return 'danger';
    if (state.endsWith('.rev') || state.endsWith('.corr')) return 'warning';
    return 'medium';
  }

  protected async showActions(trip: TripModel): Promise<void> {
    const options = createActionSheetOptions(trip.resource?.name1 ?? '');
    const canWrite = this.store.canWrite();
    const isOpen = trip.state === 'open' || trip.state === 'open.rev';
    const isDeleted = trip.state === 'deleted';

    options.buttons.push(createActionSheetButton('trip.add', this.store.i18n.as_add(), this.imgixBaseUrl, 'add-circle'));
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('trip.edit', this.store.i18n.as_edit(), this.imgixBaseUrl, 'edit'));
    }
    if (canWrite && isOpen) {
      options.buttons.push(createActionSheetButton('trip.end', this.store.i18n.as_end(), this.imgixBaseUrl, 'flag'));
    }
    if (canWrite && !isDeleted) {
      options.buttons.push(createActionSheetButton('trip.delete', this.store.i18n.as_delete(), this.imgixBaseUrl, 'trash'));
    }
    options.buttons.push(createActionSheetButton('trip.report_damage', this.store.i18n.as_report_damage(), this.imgixBaseUrl, 'warning'));
    options.buttons.push(createActionSheetButton('trip.report_bug', this.store.i18n.as_report_bug(), this.imgixBaseUrl, 'bug'));
    options.buttons.push(createActionSheetButton('trip.add_guest', this.store.i18n.as_add_guest(), this.imgixBaseUrl, 'person-add'));
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));

    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'trip.add':     await this.store.createTrip(); break;
      case 'trip.edit':    await this.store.editTrip(trip); break;
      case 'trip.end':     await this.store.endTrip(trip); break;
      case 'trip.delete':  await this.store.deleteTrip(trip); break;
      case 'trip.report_damage': await this.store.reportDamage(trip); break;
      case 'trip.report_bug':    await this.store.reportBug(trip); break;
    }
  }

  protected hasRole = (role: string) => hasRole(role as never, this.appStore.currentUser());
}
```

- [ ] **Step 2: Write `AocTrip` stub**

Create `libs/geo/trip/feature/src/lib/aoc-trip.ts`:
```typescript
import { Component } from '@angular/core';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'bk-aoc-trip',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>Ausfahrten Administration</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>Vollständige Implementierung folgt in Plan 2.</p>
    </ion-content>
  `,
})
export class AocTrip {}
```

- [ ] **Step 3: Type-check feature**

```bash
npx tsc --noEmit -p libs/geo/trip/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/geo/trip/feature/src/lib/trip-list.ts libs/geo/trip/feature/src/lib/aoc-trip.ts
git commit -m "feat(trip): implement TripList route component and AocTrip stub"
```

---

## Task 14: i18n `de.json`

**Files:**
- Create: `libs/geo/trip/feature/src/i18n/de.json`

- [ ] **Step 1: Create translations file**

Create `libs/geo/trip/feature/src/i18n/de.json`:
```json
{
  "list": { "title": "Ausfahrten" },
  "empty": "Keine Ausfahrten gefunden.",
  "group": { "title": "{{ date }}" },
  "add": { "title": "Neue Ausfahrt" },
  "edit": { "title": "Ausfahrt bearbeiten" },
  "end": { "title": "Ausfahrt beenden" },
  "delete": {
    "confirm": "Soll diese Ausfahrt wirklich gelöscht werden?",
    "reason": "Grund für die Löschung",
    "conf": "Ausfahrt gelöscht.",
    "error": "Löschen fehlgeschlagen."
  },
  "actionsheet": {
    "add": "Ausfahrt erfassen",
    "edit": "Ausfahrt bearbeiten",
    "end": "Ausfahrt beenden",
    "delete": "Ausfahrt löschen",
    "report_damage": "Schaden melden",
    "report_bug": "Fehler melden",
    "add_guest": "Gast hinzufügen",
    "show_images": "Bilder anzeigen"
  },
  "save": {
    "add": { "conf": "Ausfahrt erfasst.", "error": "Speichern fehlgeschlagen." },
    "edit": { "conf": "Ausfahrt aktualisiert.", "error": "Aktualisierung fehlgeschlagen." },
    "end": { "conf": "Ausfahrt beendet.", "error": "Beenden fehlgeschlagen." }
  },
  "warning": {
    "distance_zero": "Distanz ist 0 km. Bitte bestätigen.",
    "distance_high": "Distanz über 50 km. Bitte bestätigen.",
    "seats_mismatch": "Anzahl Teilnehmende entspricht nicht der Bootskapazität.",
    "suspicious": "Verdächtige Aktivität erkannt. Bitte bestätigen."
  },
  "field": {
    "boat": "Boot",
    "location": "Zielort",
    "custom_location": "Eigener Zielort",
    "distance": "Distanz (km)",
    "participants": "Teilnehmende",
    "notes": "Notizen",
    "start_date": "Startdatum",
    "start_time": "Startzeit",
    "end_date": "Enddatum",
    "end_time": "Endzeit",
    "state": "Status"
  },
  "state": {
    "draft": "Entwurf",
    "open": "Offen",
    "closed": "Abgeschlossen",
    "deleted": "Gelöscht",
    "revised": "Überarbeitet",
    "corrected": "Korrigiert",
    "all": "Alle"
  },
  "aoc": {
    "title": "Ausfahrten Administration",
    "trash": "Papierkorb",
    "notes": "Ausfahrten mit Notizen",
    "zero_km": "Ausfahrten mit 0 km",
    "flagged": "Markierte Ausfahrten",
    "restore": "Wiederherstellen",
    "clear_flag": "Markierung entfernen"
  },
  "location_select": {
    "list_view": "Liste",
    "map_view": "Karte",
    "search": "Ort suchen",
    "none": "Kein Ort ausgewählt"
  },
  "cancel": "Abbrechen"
}
```

- [ ] **Step 2: Commit**

```bash
git add libs/geo/trip/feature/src/i18n/de.json
git commit -m "feat(trip): add German i18n translations"
```

---

## Task 15: Routes

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Add `trips` route**

In `apps/scs-app/src/app/app.routes.ts`, add a new `trips` route (after the `rboat` block, before or after `location`):
```typescript
{
  path: 'trips',
  canActivate: [isAuthenticatedGuard],
  loadComponent: () => import('@bk2/trip-feature').then(m => m.TripList),
},
```

- [ ] **Step 2: Add `aoc/trip` route**

In the existing `aoc` children array (around line 297), add:
```typescript
{ path: 'trip', canActivate: [isAdminGuard], loadComponent: () => import('@bk2/trip-feature').then(m => m.AocTrip) },
```

- [ ] **Step 3: Type-check app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts
git commit -m "feat(trip): add /trips and /aoc/trip routes to scs-app"
```

---

## Task 16: Final Type-Check and Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Type-check all trip layers**

```bash
npx tsc --noEmit -p libs/geo/trip/util/tsconfig.json && \
npx tsc --noEmit -p libs/geo/trip/data-access/tsconfig.json && \
npx tsc --noEmit -p libs/geo/trip/ui/tsconfig.json && \
npx tsc --noEmit -p libs/geo/trip/feature/tsconfig.json
```
Expected: no errors across all four layers.

- [ ] **Step 2: Run trip-util tests**

```bash
pnpm run test trip-util
```
Expected: all tests pass.

- [ ] **Step 3: Lint**

```bash
pnpm nx lint trip-util && pnpm nx lint trip-data-access && pnpm nx lint trip-ui && pnpm nx lint trip-feature
```
Expected: no lint errors (fix any that appear).

- [ ] **Step 4: Build scs-app**

```bash
pnpm nx build scs-app
```
Expected: build succeeds; no `*.d.ts` or `*.js` files generated inside `libs/`.

- [ ] **Step 5: Commit any lint fixes**

If lint fixes were needed:
```bash
git add -p
git commit -m "fix(trip): fix lint errors"
```

---

## Self-Review Checklist

**Spec coverage vs. plan:**

| Spec section | Covered in task |
|---|---|
| §2 Actors/Roles — kiosk role | Task 1 |
| §3.1 TripModel flagged field | Task 1 |
| §3.2 State machine | Task 10 (TripStore methods set state correctly) |
| §4 Library structure | Tasks 2–5 |
| §5 TripService | Task 9 |
| §6 TripStore | Task 10 |
| §7 TripList | Task 13 |
| §7.3 Action Sheet | Task 13 |
| §7.4 State filter options | Task 13 |
| §8 TripEditModal (3 modes) | Task 12 |
| §8.2 Vest validations (hard blocks) | Task 7 |
| §8.3 Save flow | Task 12 |
| §9 TripEditForm | Task 11 |
| §11.2 Soft delete (photo + task) | Task 10 |
| §12 AocTrip (stub) | Task 13 |
| §13 Routes | Task 15 |
| §14 i18n | Task 14 |
| §15 Utility functions | Task 7 |
| §16 Vest validations | Task 7 |
| §17 Open questions resolved | Tasks 1, 6, 10 |

**Notes:**
- Participants `MultiSelectModal` integration is not in Plan 1 (requires a separate component not yet built for trip — the form renders a count placeholder; wiring the full multi-select is Plan 2 scope alongside LocationSelect).
- `DocumentModel` registration for soft-delete photos is not in Plan 1; the photo URL is stored in trip notes and the TaskModel. Full registration is Plan 2.
- `ListFilter` `stateOptions` prop: verify the `bk-list-filter` component accepts this input before running the app; if not, add state filter inline in TripList.

# Accounting System — Plan 3: Reporting + Asset Accounting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver balance sheet, P&L, and cash flow report pages (client-side aggregation over `bookings`/`booking-lines`) plus a full fixed-asset module with depreciation run.

**Architecture:** Two new lib domains: `libs/finance/reporting/` (client-side aggregation, CSV export, report pages) and `libs/finance/asset/` (AssetCategoryService, AssetService, AssetMovementService, depreciation util, depreciation run page). Reports read from the existing `bookings` and `booking-lines` collections (no new Firestore collections). Depreciation posting creates `BookingModel` + `BookingLineModel[]` pairs through the existing `BookingService` from Plan 1. `AssetModel.resourceKey` links optionally to `ResourceModel` (physical catalog) without reverse coupling.

**Tech Stack:** Angular 20 zoneless standalone, NgRx Signal Stores, Ionic/Angular 8.7, Vitest, rxjs.

**Spec source:** `docs/superpowers/specs/2026-05-27-accounting-system-design.md` Phases 5 + 6.

**Prerequisites:** Plan 1 merged (BookingService, PeriodService). Plan 2 merged (VatCodeService) is helpful but not strictly required for reporting.

---

## File Structure

```
libs/finance/
  reporting/
    data-access/                     [new lib]
      src/lib/reporting.service.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    util/                            [new lib]
      src/lib/reporting.util.ts
      src/lib/reporting.util.spec.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
  asset/
    data-access/                     [new lib]
      src/lib/asset-category.service.ts
      src/lib/asset.service.ts
      src/lib/asset-movement.service.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    feature/                         [new lib]
      src/lib/asset.store.ts
      src/lib/asset-list.ts
      src/lib/asset-edit.modal.ts
      src/lib/depreciation-run-page.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    ui/                              [new lib]
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    util/                            [new lib]
      src/lib/asset.util.ts
      src/lib/asset.util.spec.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
apps/
  scs-app/src/app/app.routes.ts     [modify: add reporting + asset routes]
tsconfig.base.json                   [modify: add Plan 3 path aliases]
```

---

## Tasks

### Task 1: Plan 3 lib scaffold + tsconfig.base.json aliases

**Files:**
- Create: all config files for 6 new libs
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create directories**

```bash
mkdir -p libs/finance/reporting/{data-access,util}/src/lib
mkdir -p libs/finance/asset/{data-access,feature,ui,util}/src/lib
```

- [ ] **Step 2: Scaffold `reporting/util`**

`libs/finance/reporting/util/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

`libs/finance/reporting/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/reporting/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-reporting-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/reporting/util/package.json`:

```json
{
  "name": "@bk2/finance-reporting-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/finance/reporting/util/project.json`:

```json
{
  "name": "finance-reporting-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/reporting/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/reporting/util",
        "main": "libs/finance/reporting/util/src/index.ts",
        "tsConfig": "libs/finance/reporting/util/tsconfig.lib.json",
        "assets": ["libs/finance/reporting/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/reporting/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/reporting/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/reporting/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/reporting/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/finance/reporting/util/src/index.ts`:

```ts
export * from './lib/reporting.util';
```

- [ ] **Step 3: Scaffold `reporting/data-access`**

`libs/finance/reporting/data-access/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/data-access/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"}
  ]
}
```

`libs/finance/reporting/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/reporting/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-reporting-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/reporting/data-access/package.json`:

```json
{
  "name": "@bk2/finance-reporting-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/finance-reporting-util": "*"
  }
}
```

`libs/finance/reporting/data-access/project.json`:

```json
{
  "name": "finance-reporting-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/reporting/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/reporting/data-access",
        "main": "libs/finance/reporting/data-access/src/index.ts",
        "tsConfig": "libs/finance/reporting/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/reporting/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/reporting/data-access/src/index.ts`: `// populated in Task 3`

- [ ] **Step 4: Scaffold `asset/util`**

`libs/finance/asset/util/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

`libs/finance/asset/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/asset/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-asset-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/asset/util/package.json`:

```json
{
  "name": "@bk2/finance-asset-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/finance/asset/util/project.json`:

```json
{
  "name": "finance-asset-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/asset/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/asset/util",
        "main": "libs/finance/asset/util/src/index.ts",
        "tsConfig": "libs/finance/asset/util/tsconfig.lib.json",
        "assets": ["libs/finance/asset/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/asset/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/asset/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/asset/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/asset/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/finance/asset/util/src/index.ts`:

```ts
export * from './lib/asset.util';
```

- [ ] **Step 5: Scaffold `asset/data-access`, `asset/feature`, `asset/ui`**

`libs/finance/asset/data-access/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
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

`libs/finance/asset/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/asset/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-asset-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/asset/data-access/package.json`:

```json
{
  "name": "@bk2/finance-asset-data-access",
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
    "@bk2/shared-util-core": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/finance-asset-util": "*"
  }
}
```

`libs/finance/asset/data-access/project.json`:

```json
{
  "name": "finance-asset-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/asset/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/asset/data-access",
        "main": "libs/finance/asset/data-access/src/index.ts",
        "tsConfig": "libs/finance/asset/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/asset/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/asset/data-access/src/index.ts`: `// populated in Task 5`

`libs/finance/asset/feature/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../shared/feature/tsconfig.lib.json"},
    {"path": "../../../finance/accounting/feature/tsconfig.lib.json"},
    {"path": "../../../finance/booking/data-access/tsconfig.lib.json"},
    {"path": "../data-access/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"},
    {"path": "../ui/tsconfig.lib.json"}
  ]
}
```

`libs/finance/asset/feature/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/asset/feature",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-asset-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/asset/feature/package.json`:

```json
{
  "name": "@bk2/finance-asset-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-feature": "*",
    "@bk2/finance-accounting-feature": "*",
    "@bk2/finance-booking-data-access": "*",
    "@bk2/finance-asset-data-access": "*",
    "@bk2/finance-asset-util": "*",
    "@bk2/finance-asset-ui": "*"
  }
}
```

`libs/finance/asset/feature/project.json`:

```json
{
  "name": "finance-asset-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/asset/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/asset/feature",
        "main": "libs/finance/asset/feature/src/index.ts",
        "tsConfig": "libs/finance/asset/feature/tsconfig.lib.json",
        "assets": ["libs/finance/asset/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/asset/feature/src/index.ts`: `// populated in Task 6`

For `asset/ui`, the structure mirrors `booking/ui` from Plan 1 — create `tsconfig.json`, `tsconfig.lib.json`, `package.json` (`name: "@bk2/finance-asset-ui"`), `project.json` (name: `finance-asset-ui`, outputPath: `dist/libs/finance/asset/ui`) and `src/index.ts`.

- [ ] **Step 6: Add path aliases to `tsconfig.base.json`**

```json
"@bk2/finance-asset-data-access": ["libs/finance/asset/data-access/src/index.ts"],
"@bk2/finance-asset-feature": ["libs/finance/asset/feature/src/index.ts"],
"@bk2/finance-asset-ui": ["libs/finance/asset/ui/src/index.ts"],
"@bk2/finance-asset-util": ["libs/finance/asset/util/src/index.ts"],
"@bk2/finance-reporting-data-access": ["libs/finance/reporting/data-access/src/index.ts"],
"@bk2/finance-reporting-util": ["libs/finance/reporting/util/src/index.ts"],
```

- [ ] **Step 7: Commit scaffold**

```bash
git add libs/finance/reporting/ libs/finance/asset/ tsconfig.base.json
git commit -m "chore: scaffold reporting (2 libs) and asset (4 libs)"
```

---

### Task 2: reporting.util.ts — account balance aggregation + CSV export

**Files:**
- Create: `libs/finance/reporting/util/src/lib/reporting.util.spec.ts`
- Create: `libs/finance/reporting/util/src/lib/reporting.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/reporting/util/src/lib/reporting.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { AccountBalanceEntry, aggregateAccountBalances, exportToCsv } from './reporting.util';
import { BookingLineModel } from '@bk2/shared-models';

describe('aggregateAccountBalances', () => {
  const makeLines = (accountKey: string, debit: number, credit: number): Partial<BookingLineModel> => ({
    accountKey,
    debitAmount:  debit  > 0 ? { amount: debit,  currency: 'CHF', periodicity: 'one-time' } : undefined,
    creditAmount: credit > 0 ? { amount: credit, currency: 'CHF', periodicity: 'one-time' } : undefined,
  });

  it('sums debit and credit per account key', () => {
    const lines: Partial<BookingLineModel>[] = [
      makeLines('1000', 10000, 0),
      makeLines('1000',  5000, 0),
      makeLines('2000',     0, 15000),
    ];
    const result = aggregateAccountBalances(lines as BookingLineModel[]);
    const acc1000 = result.find(r => r.accountKey === '1000');
    const acc2000 = result.find(r => r.accountKey === '2000');
    expect(acc1000?.totalDebit).toBe(15000);
    expect(acc1000?.totalCredit).toBe(0);
    expect(acc2000?.totalCredit).toBe(15000);
  });

  it('computes net as debit minus credit', () => {
    const lines: Partial<BookingLineModel>[] = [
      makeLines('1000', 10000, 3000),
    ];
    const result = aggregateAccountBalances(lines as BookingLineModel[]);
    expect(result[0].net).toBe(7000);
  });

  it('returns empty array for no lines', () => {
    expect(aggregateAccountBalances([])).toEqual([]);
  });
});

describe('exportToCsv', () => {
  it('serialises rows with header', () => {
    const rows: AccountBalanceEntry[] = [
      { accountKey: '1000', totalDebit: 10000, totalCredit: 3000, net: 7000 },
    ];
    const csv = exportToCsv(rows);
    expect(csv).toContain('accountKey,totalDebit,totalCredit,net');
    expect(csv).toContain('1000,10000,3000,7000');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-reporting-util
```

Expected: FAIL

- [ ] **Step 3: Implement `libs/finance/reporting/util/src/lib/reporting.util.ts`**

```ts
import { BookingLineModel } from '@bk2/shared-models';

export interface AccountBalanceEntry {
  accountKey: string;
  totalDebit: number;
  totalCredit: number;
  net: number;
}

export function aggregateAccountBalances(lines: BookingLineModel[]): AccountBalanceEntry[] {
  const map = new Map<string, { totalDebit: number; totalCredit: number }>();
  for (const line of lines) {
    const key = line.accountKey ?? '';
    if (!key) continue;
    const entry = map.get(key) ?? { totalDebit: 0, totalCredit: 0 };
    entry.totalDebit  += line.debitAmount?.amount  ?? 0;
    entry.totalCredit += line.creditAmount?.amount ?? 0;
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([accountKey, e]) => ({
    accountKey,
    totalDebit:  e.totalDebit,
    totalCredit: e.totalCredit,
    net: e.totalDebit - e.totalCredit,
  }));
}

export function exportToCsv(rows: AccountBalanceEntry[]): string {
  const header = 'accountKey,totalDebit,totalCredit,net';
  const body = rows.map(r => `${r.accountKey},${r.totalDebit},${r.totalCredit},${r.net}`).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm run test finance-reporting-util
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/reporting/util/src/
git commit -m "feat(reporting-util): aggregateAccountBalances, exportToCsv with tests"
```

---

### Task 3: ReportingService

**Files:**
- Create: `libs/finance/reporting/data-access/src/lib/scope.ts`
- Create: `libs/finance/reporting/data-access/src/lib/reporting.service.ts`
- Modify: `libs/finance/reporting/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/reporting/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/reporting/data-access.';
```

- [ ] **Step 2: Create `libs/finance/reporting/data-access/src/lib/reporting.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingCollection, BookingLineCollection, BookingLineModel, BookingModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { AccountBalanceEntry, aggregateAccountBalances, downloadCsv, exportToCsv } from '@bk2/finance-reporting-util';

@Injectable({ providedIn: 'root' })
export class ReportingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public getJournalEntries(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Observable<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
      { key: 'status', operator: '==' as const, value: 'posted' },
    ];
    return this.firestoreService.searchData<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  public getAllLines(accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query);
  }

  public async getAccountBalances(accountingTenantId: string): Promise<AccountBalanceEntry[]> {
    const lines = await firstValueFrom(this.getAllLines(accountingTenantId));
    return aggregateAccountBalances(lines);
  }

  public async exportBalancesToCsv(accountingTenantId: string): Promise<void> {
    const balances = await this.getAccountBalances(accountingTenantId);
    const csv = exportToCsv(balances);
    downloadCsv(csv, `account-balances-${accountingTenantId}.csv`);
  }
}
```

- [ ] **Step 3: Update `libs/finance/reporting/data-access/src/index.ts`**

```ts
export * from './lib/reporting.service';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/reporting/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add libs/finance/reporting/data-access/src/
git commit -m "feat(reporting): ReportingService with account balance aggregation and CSV export"
```

---

### Task 4: Report pages — BalanceSheet, IncomeStatement, CashFlow, AccountDetail

**Files:**
- Create report pages directly in `libs/finance/reporting/data-access/` feature slot (no separate feature lib for Phase 3 — pages are thin shells around ReportingService)

Since the spec says report pages live in "feature pages in existing domain libs" and are routes under `/accounting/:id/`, create them as standalone components in a new `libs/finance/reporting/feature/` lib.

Create `libs/finance/reporting/feature/` with the same scaffold structure as other feature libs (tsconfig.json, tsconfig.lib.json, package.json, project.json). `name: "@bk2/finance-reporting-feature"`. Add `"@bk2/finance-reporting-feature": ["libs/finance/reporting/feature/src/index.ts"]` to `tsconfig.base.json`.

- [ ] **Step 1: Scaffold `reporting/feature` lib**

Create `libs/finance/reporting/feature/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/feature/tsconfig.lib.json"},
    {"path": "../../../finance/accounting/feature/tsconfig.lib.json"},
    {"path": "../data-access/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"}
  ]
}
```

`tsconfig.lib.json`, `package.json` (`name: "@bk2/finance-reporting-feature"`, deps: shared-models, shared-config, shared-i18n, shared-feature, finance-accounting-feature, finance-reporting-data-access, finance-reporting-util), `project.json` (name: `finance-reporting-feature`) — follow the same pattern as other feature libs.

Add `"@bk2/finance-reporting-feature": ["libs/finance/reporting/feature/src/index.ts"]` to `tsconfig.base.json`.

- [ ] **Step 2: Create `libs/finance/reporting/feature/src/lib/balance-sheet-page.ts`**

```ts
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-balance-sheet-page',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Bilanz</ion-title>
          <ion-button slot="end" fill="clear" (click)="exportCsv()">Export CSV</ion-button>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (balancesResource.isLoading()) {
          <p>Loading...</p>
        } @else {
          <ion-list>
            @for (entry of balancesResource.value() ?? []; track entry.accountKey) {
              <ion-item>
                <ion-label>{{ entry.accountKey }}</ion-label>
                <ion-note slot="end">
                  Dr: {{ entry.totalDebit | number }} | Cr: {{ entry.totalCredit | number }} | Net: {{ entry.net | number }}
                </ion-note>
              </ion-item>
            }
          </ion-list>
        }
      </ion-content>
    </ion-page>
  `,
})
export class BalanceSheetPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly balancesResource = rxResource({
    request: () => this.accountingStore.accountingTenantId(),
    stream: ({ request: id }) => {
      return new (require('rxjs').Observable)((observer: any) => {
        this.reportingService.getAccountBalances(id).then(v => { observer.next(v); observer.complete(); });
      });
    },
  });

  protected async exportCsv(): Promise<void> {
    await this.reportingService.exportBalancesToCsv(this.accountingStore.accountingTenantId());
  }
}
```

**Note:** The `rxResource` with a Promise-based stream is awkward. Use `from()` from rxjs to wrap the Promise:

```ts
import { from } from 'rxjs';
// in stream:
stream: ({ request: id }) => from(this.reportingService.getAccountBalances(id)),
```

Replace the template's `rxResource` stream accordingly.

- [ ] **Step 3: Create `libs/finance/reporting/feature/src/lib/income-statement-page.ts`**

```ts
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { from } from 'rxjs';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-income-statement-page',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Erfolgsrechnung</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (linesResource.isLoading()) {
          <p>Loading...</p>
        } @else {
          <ion-list>
            @for (entry of linesResource.value() ?? []; track entry.accountKey) {
              <ion-item>
                <ion-label>{{ entry.accountKey }}</ion-label>
                <ion-note slot="end">Net: {{ entry.net | number }}</ion-note>
              </ion-item>
            }
          </ion-list>
        }
      </ion-content>
    </ion-page>
  `,
})
export class IncomeStatementPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly linesResource = rxResource({
    request: () => this.accountingStore.accountingTenantId(),
    stream: ({ request: id }) => from(this.reportingService.getAccountBalances(id)),
  });
}
```

- [ ] **Step 4: Create `libs/finance/reporting/feature/src/lib/cash-flow-page.ts`**

```ts
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { ReportingService } from '@bk2/finance-reporting-data-access';

@Component({
  selector: 'bk-cash-flow-page',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar><ion-title>Geldflussrechnung</ion-title></ion-toolbar>
      </ion-header>
      <ion-content>
        @if (journalResource.isLoading()) { <p>Loading...</p> }
        @else {
          <ion-list>
            @for (b of journalResource.value() ?? []; track b.bkey) {
              <ion-item>
                <ion-label>{{ b.date }} — {{ b.title }}</ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </ion-content>
    </ion-page>
  `,
})
export class CashFlowPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly reportingService = inject(ReportingService);

  protected readonly journalResource = rxResource({
    request: () => this.accountingStore.accountingTenantId(),
    stream: ({ request: id }) => this.reportingService.getJournalEntries(id),
  });
}
```

- [ ] **Step 5: Update `libs/finance/reporting/feature/src/index.ts`**

```ts
export * from './lib/balance-sheet-page';
export * from './lib/income-statement-page';
export * from './lib/cash-flow-page';
```

- [ ] **Step 6: Add report routes to `apps/scs-app/src/app/app.routes.ts`**

Inside the `accounting/:accountingTenantId` children array:

```ts
{ path: 'balance', loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.BalanceSheetPage) },
{ path: 'income-statement', loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.IncomeStatementPage) },
{ path: 'cash-flow', loadComponent: () => import('@bk2/finance-reporting-feature').then(m => m.CashFlowPage) },
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/finance/reporting/feature/tsconfig.json
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add libs/finance/reporting/ apps/scs-app/src/app/app.routes.ts tsconfig.base.json
git commit -m "feat(reporting): BalanceSheetPage, IncomeStatementPage, CashFlowPage with account balance aggregation"
```

---

### Task 5: asset.util.ts — depreciation, book value, pro-rata

**Files:**
- Create: `libs/finance/asset/util/src/lib/asset.util.spec.ts`
- Create: `libs/finance/asset/util/src/lib/asset.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/asset/util/src/lib/asset.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { linearDepreciationMonthly, computeBookValue, proRataMonths } from './asset.util';

describe('linearDepreciationMonthly', () => {
  it('computes monthly depreciation amount in cents', () => {
    // 12000.00 CHF over 60 months = 200.00 CHF/month = 20000 cents
    expect(linearDepreciationMonthly(1200000, 60)).toBe(20000);
  });

  it('rounds fractional cents down', () => {
    // 100.00 CHF over 3 months = 33.333... → 3333 cents
    expect(linearDepreciationMonthly(10000, 3)).toBe(3333);
  });
});

describe('proRataMonths', () => {
  it('returns full month count when asset runs through full period', () => {
    // commissioned 2026-01-01, period end 2026-12-31 → 12 months
    expect(proRataMonths('20260101', '20261231')).toBe(12);
  });

  it('returns partial months when commissioned mid-year', () => {
    // commissioned 2026-07-01, period end 2026-12-31 → 6 months
    expect(proRataMonths('20260701', '20261231')).toBe(6);
  });

  it('returns 0 when asset commissioned after period end', () => {
    expect(proRataMonths('20270101', '20261231')).toBe(0);
  });
});

describe('computeBookValue', () => {
  it('computes book value as acquisition minus accumulated depreciation', () => {
    // Acquisition 1200.00 CHF, 2 months depreciation at 200 CHF/month → 800.00 CHF = 80000 cents
    expect(computeBookValue(120000, 20000, 2)).toBe(80000);
  });

  it('never returns a negative book value', () => {
    expect(computeBookValue(10000, 10000, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-asset-util
```

Expected: FAIL

- [ ] **Step 3: Implement `libs/finance/asset/util/src/lib/asset.util.ts`**

```ts
/**
 * Computes monthly straight-line depreciation in cents.
 * Returns floor of acquisitionCents / usefulLifeMonths.
 */
export function linearDepreciationMonthly(acquisitionCents: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return Math.floor(acquisitionCents / usefulLifeMonths);
}

/**
 * Counts the number of calendar months from commissioningDate (StoreDate "YYYYMMDD")
 * to periodEndDate (inclusive). Returns 0 if commissioned after period end.
 */
export function proRataMonths(commissioningStoreDate: string, periodEndStoreDate: string): number {
  if (commissioningStoreDate > periodEndStoreDate) return 0;
  const cy = parseInt(commissioningStoreDate.substring(0, 4), 10);
  const cm = parseInt(commissioningStoreDate.substring(4, 6), 10);
  const ey = parseInt(periodEndStoreDate.substring(0, 4), 10);
  const em = parseInt(periodEndStoreDate.substring(4, 6), 10);
  return (ey - cy) * 12 + (em - cm) + 1;
}

/**
 * Book value = acquisition - (monthlyDepreciation * monthsElapsed), clamped to >= 0.
 */
export function computeBookValue(acquisitionCents: number, monthlyDepreciationCents: number, monthsElapsed: number): number {
  const accumulated = monthlyDepreciationCents * monthsElapsed;
  return Math.max(0, acquisitionCents - accumulated);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm run test finance-asset-util
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/asset/util/src/
git commit -m "feat(asset-util): linearDepreciationMonthly, proRataMonths, computeBookValue with tests"
```

---

### Task 6: AssetCategoryService + AssetService + AssetMovementService

**Files:**
- Create: `libs/finance/asset/data-access/src/lib/scope.ts`
- Create: `libs/finance/asset/data-access/src/lib/asset-category.service.ts`
- Create: `libs/finance/asset/data-access/src/lib/asset.service.ts`
- Create: `libs/finance/asset/data-access/src/lib/asset-movement.service.ts`
- Modify: `libs/finance/asset/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/asset/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/asset/data-access.';
```

- [ ] **Step 2: Create `libs/finance/asset/data-access/src/lib/asset-category.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AssetCategoryCollection, AssetCategoryModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetCategoryService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(category: AssetCategoryModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetCategoryModel | undefined> {
    return findByKey<AssetCategoryModel>(this.list(accountingTenantId), key);
  }

  public async update(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetCategoryModel>(
      AssetCategoryCollection, category, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(category: AssetCategoryModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetCategoryModel>(
      AssetCategoryCollection, category,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'name', sortOrder = 'asc'): Observable<AssetCategoryModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetCategoryModel>(AssetCategoryCollection, query, orderBy, sortOrder);
  }
}
```

- [ ] **Step 3: Create `libs/finance/asset/data-access/src/lib/asset.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AssetCollection, AssetModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(asset: AssetModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetModel>(
      AssetCollection, asset,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<AssetModel | undefined> {
    return findByKey<AssetModel>(this.list(accountingTenantId), key);
  }

  public async update(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AssetModel>(
      AssetCollection, asset, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(asset: AssetModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AssetModel>(
      AssetCollection, asset,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'assetNo', sortOrder = 'asc'): Observable<AssetModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetModel>(AssetCollection, query, orderBy, sortOrder);
  }
}
```

- [ ] **Step 4: Create `libs/finance/asset/data-access/src/lib/asset-movement.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AssetMovementCollection, AssetMovementModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetMovementService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(movement: AssetMovementModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetMovementModel>(
      AssetMovementCollection, movement,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public listForAsset(assetKey: string, accountingTenantId: string): Observable<AssetMovementModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'assetKey',            operator: '==' as const, value: assetKey },
      { key: 'accountingTenantId',  operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetMovementModel>(AssetMovementCollection, query, 'date', 'asc');
  }

  public list(accountingTenantId: string): Observable<AssetMovementModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetMovementModel>(AssetMovementCollection, query, 'date', 'asc');
  }
}
```

- [ ] **Step 5: Update `libs/finance/asset/data-access/src/index.ts`**

```ts
export * from './lib/asset-category.service';
export * from './lib/asset.service';
export * from './lib/asset-movement.service';
```

- [ ] **Step 6: Add constructors to models if missing**

In `libs/shared/models/src/lib/asset-category.model.ts`, `asset.model.ts`, and `asset-movement.model.ts`, add:

`AssetCategoryModel`:
```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
}
```

`AssetModel`:
```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
}
```

`AssetMovementModel`:
```ts
constructor(tenantId: string, accountingTenantId: string, assetKey: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
  this.assetKey = assetKey;
}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/finance/asset/data-access/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add libs/finance/asset/data-access/src/ libs/shared/models/src/lib/asset-category.model.ts libs/shared/models/src/lib/asset.model.ts libs/shared/models/src/lib/asset-movement.model.ts
git commit -m "feat(asset): AssetCategoryService, AssetService, AssetMovementService"
```

---

### Task 7: AssetStore + AssetList + AssetEditModal + DepreciationRunPage

**Files:**
- Create: `libs/finance/asset/feature/src/lib/scope.ts`
- Create: `libs/finance/asset/feature/src/lib/asset.store.ts`
- Create: `libs/finance/asset/feature/src/lib/asset-list.ts`
- Create: `libs/finance/asset/feature/src/lib/asset-edit.modal.ts`
- Create: `libs/finance/asset/feature/src/lib/depreciation-run-page.ts`
- Modify: `libs/finance/asset/feature/src/index.ts`
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Create `libs/finance/asset/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/asset/feature.';
```

- [ ] **Step 2: Create `libs/finance/asset/feature/src/lib/asset.store.ts`**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AssetModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { AssetService, AssetCategoryService } from '@bk2/finance-asset-data-access';

import { AssetEditModal } from './asset-edit.modal';
import { PFX } from './scope';

const ASSET_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty:      PFX + 'empty',
  as_view:    PFX + 'actionsheet.view',
  as_edit:    PFX + 'actionsheet.edit',
  as_create:  PFX + 'actionsheet.create',
  as_delete:  PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type AssetI18n = { [K in keyof typeof ASSET_I18N_KEYS]: Signal<string> };

export const AssetStore = signalStore(
  withState({}),
  withProps(() => ({
    assetService: inject(AssetService),
    assetCategoryService: inject(AssetCategoryService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ASSET_I18N_KEYS),
    assetsResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.assetService.list(id),
    }),
    categoriesResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.assetCategoryService.list(id),
    }),
  })),
  withComputed(store => ({
    assets: computed(() => store.assetsResource.value() ?? []),
    categories: computed(() => store.categoriesResource.value() ?? []),
    isLoading: computed(() => store.assetsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    async openEdit(asset: AssetModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: AssetEditModal,
        componentProps: {
          asset,
          categories: store.categories(),
          readOnly,
          currentUser: store.currentUser(),
        },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const a = data as AssetModel;
        if (a.bkey?.length > 0) {
          await store.assetService.update(a, store.currentUser());
        } else {
          await store.assetService.create(a, store.currentUser());
        }
        store.assetsResource.reload();
      }
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const asset = new AssetModel(store.appStore.tenantId(), store.accountingStore.accountingTenantId());
      await this.openEdit(asset, false);
    },

    async delete(asset: AssetModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.assetService.delete(asset, store.currentUser());
      store.assetsResource.reload();
    },
  }))
);
```

- [ ] **Step 3: Create `libs/finance/asset/feature/src/lib/asset-list.ts`**

```ts
import { Component, inject } from '@angular/core';
import { IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { AssetStore } from './asset.store';

@Component({
  selector: 'bk-asset-list',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonFab, IonFabButton, IonIcon, SvgIconPipe],
  providers: [AssetStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (store.isLoading()) { <p>Loading...</p> }
        @else if (store.assets().length === 0) { <p>{{ store.i18n.empty() }}</p> }
        @else {
          <ion-list>
            @for (asset of store.assets(); track asset.bkey) {
              <ion-item (click)="store.openEdit(asset, store.isReadOnly())">
                <ion-label>
                  <h3>{{ asset.assetNo }} — {{ asset.name }}</h3>
                  <p>{{ asset.categoryKey }} | {{ asset.acquisitionDate }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      </ion-content>
      @if (!store.isReadOnly()) {
        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button (click)="store.openCreate()">
            <ion-icon src="{{ 'add' | svgIcon }}" />
          </ion-fab-button>
        </ion-fab>
      }
    </ion-page>
  `,
})
export class AssetList {
  protected readonly store = inject(AssetStore);
}
```

- [ ] **Step 4: Create `libs/finance/asset/feature/src/lib/asset-edit.modal.ts`**

```ts
import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AssetCategoryModel, AssetModel, UserModel } from '@bk2/shared-models';

@Component({
  selector: 'bk-asset-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View Asset' : (asset().bkey ? 'Edit Asset' : 'New Asset') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) { <ion-button (click)="save()">Save</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Name</ion-label>
        <ion-input [(ngModel)]="edit.name" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Asset No.</ion-label>
        <ion-input [(ngModel)]="edit.assetNo" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Category</ion-label>
        <ion-select [(ngModel)]="edit.categoryKey" [disabled]="readOnly()">
          @for (cat of categories(); track cat.bkey) {
            <ion-select-option [value]="cat.bkey">{{ cat.name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Acquisition Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.acquisitionDate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Useful Life (months)</ion-label>
        <ion-input type="number" [(ngModel)]="edit.usefulLifeMonths" [readonly]="readOnly()" />
      </ion-item>
    </ion-content>
  `,
})
export class AssetEditModal implements OnInit {
  public readonly asset = input.required<AssetModel>();
  public readonly categories = input<AssetCategoryModel[]>([]);
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  protected edit!: AssetModel;

  ngOnInit(): void { this.edit = { ...this.asset() }; }

  protected async dismiss(): Promise<void> { await this.modalController.dismiss(null, 'cancel'); }
  protected async save(): Promise<void> { await this.modalController.dismiss(this.edit, 'confirm'); }
}
```

- [ ] **Step 5: Create `libs/finance/asset/feature/src/lib/depreciation-run-page.ts`**

```ts
import { Component, inject, signal } from '@angular/core';
import { from } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel,
  IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { BookingLineModel, BookingModel } from '@bk2/shared-models';
import { AccountingStore } from '@bk2/finance-accounting-feature';
import { BookingService } from '@bk2/finance-booking-data-access';
import { generateBookingNo } from '@bk2/finance-booking-util';
import { AssetService, AssetMovementService } from '@bk2/finance-asset-data-access';
import { linearDepreciationMonthly, proRataMonths } from '@bk2/finance-asset-util';
import { AppStore } from '@bk2/shared-feature';

@Component({
  selector: 'bk-depreciation-run-page',
  standalone: true,
  imports: [FormsModule, IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonNote, IonButton, IonInput],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Abschreibungslauf</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-item>
          <ion-label position="stacked">Period End Date (YYYYMMDD)</ion-label>
          <ion-input [(ngModel)]="periodEnd" />
        </ion-item>
        <ion-button expand="block" (click)="preview()">Vorschau</ion-button>
        @if (previewLines().length > 0) {
          <ion-list>
            @for (line of previewLines(); track line.accountKey) {
              <ion-item>
                <ion-label>{{ line.accountKey }}</ion-label>
                <ion-note slot="end">{{ line.debitAmount?.amount }}</ion-note>
              </ion-item>
            }
          </ion-list>
          <ion-button expand="block" color="primary" (click)="post()">Buchen</ion-button>
        }
      </ion-content>
    </ion-page>
  `,
})
export class DepreciationRunPage {
  private readonly accountingStore = inject(AccountingStore);
  private readonly appStore = inject(AppStore);
  private readonly assetService = inject(AssetService);
  private readonly assetMovementService = inject(AssetMovementService);
  private readonly bookingService = inject(BookingService);

  protected periodEnd = '';
  protected readonly previewLines = signal<BookingLineModel[]>([]);
  private pendingBooking: { booking: BookingModel; lines: BookingLineModel[] } | null = null;

  protected async preview(): Promise<void> {
    const accountingTenantId = this.accountingStore.accountingTenantId();
    const assets = await firstValueFrom(this.assetService.list(accountingTenantId));
    const lines: BookingLineModel[] = [];
    const tenantId = this.appStore.tenantId();

    for (const asset of assets) {
      const months = proRataMonths(asset.commissioningDate ?? asset.acquisitionDate, this.periodEnd);
      if (months <= 0) continue;
      const acquisitionCents = asset.acquisitionValue?.amount ?? 0;
      const monthly = linearDepreciationMonthly(acquisitionCents, asset.usefulLifeMonths ?? 1);
      const periodDepreciation = monthly * months;
      if (periodDepreciation <= 0) continue;

      const drLine = new BookingLineModel(tenantId, accountingTenantId);
      drLine.accountKey = asset.expenseAccountKey;
      drLine.debitAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
      lines.push(drLine);

      const crLine = new BookingLineModel(tenantId, accountingTenantId);
      crLine.accountKey = asset.balanceAccountKey;
      crLine.creditAmount = { amount: periodDepreciation, currency: 'CHF', periodicity: 'one-time' };
      lines.push(crLine);
    }

    this.previewLines.set(lines);

    const year = parseInt(this.periodEnd.substring(0, 4), 10);
    const seq = await this.bookingService.nextSequence(year, accountingTenantId);
    const booking = new BookingModel(tenantId, accountingTenantId);
    booking.bookingNo = generateBookingNo(year, seq);
    booking.date = this.periodEnd;
    booking.title = `Abschreibung ${this.periodEnd}`;
    booking.status = 'draft';
    this.pendingBooking = { booking, lines };
  }

  protected async post(): Promise<void> {
    if (!this.pendingBooking) return;
    const user = this.appStore.currentUser();
    await this.bookingService.create(this.pendingBooking.booking, this.pendingBooking.lines, user ?? undefined);
    this.previewLines.set([]);
    this.pendingBooking = null;
  }
}
```

- [ ] **Step 6: Update `libs/finance/asset/feature/src/index.ts`**

```ts
export * from './lib/asset.store';
export * from './lib/asset-list';
export * from './lib/asset-edit.modal';
export * from './lib/depreciation-run-page';
```

- [ ] **Step 7: Add asset routes to `apps/scs-app/src/app/app.routes.ts`**

Inside the `accounting/:accountingTenantId` children array:

```ts
{ path: 'assets', loadComponent: () => import('@bk2/finance-asset-feature').then(m => m.AssetList) },
{ path: 'depreciation-run', loadComponent: () => import('@bk2/finance-asset-feature').then(m => m.DepreciationRunPage) },
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p libs/finance/asset/feature/tsconfig.json
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add libs/finance/asset/feature/src/ apps/scs-app/src/app/app.routes.ts
git commit -m "feat(asset): AssetStore, AssetList, AssetEditModal, DepreciationRunPage with depreciation preview + post"
```

---

### Task 8: Build + test verification

- [ ] **Step 1: Run all util tests**

```bash
pnpm run test finance-reporting-util
pnpm run test finance-asset-util
```

Expected: 11 total tests passing

- [ ] **Step 2: Type-check all Plan 3 libs**

```bash
npx tsc --noEmit -p libs/finance/reporting/util/tsconfig.json
npx tsc --noEmit -p libs/finance/reporting/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/reporting/feature/tsconfig.json
npx tsc --noEmit -p libs/finance/asset/util/tsconfig.json
npx tsc --noEmit -p libs/finance/asset/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/asset/feature/tsconfig.json
```

Expected: all clean

- [ ] **Step 3: Build all Plan 3 libs**

```bash
pnpm nx build finance-reporting-util
pnpm nx build finance-reporting-data-access
pnpm nx build finance-reporting-feature
pnpm nx build finance-asset-util
pnpm nx build finance-asset-data-access
pnpm nx build finance-asset-feature
```

Expected: all succeed

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: Plan 3 complete — reporting (balance sheet, P&L, cash flow) and asset accounting with depreciation run"
```

# Accounting System — Plan 2: VAT + Multi-Currency

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Swiss VAT codes wired into booking lines, and multi-currency exchange rates (SNB daily fetch + manual override) wired into the booking form — extending the double-entry journal from Plan 1.

**Architecture:** Two new lib domains: `libs/finance/vat-code/` (CRUD, validation util, seed) and `libs/finance/exchange-rate/` (read-only service + util). VAT codes and exchange rates are both optional extensions on `BookingLineModel` — no changes to the core booking write path. A Cloud Function fetches SNB daily rates; a second callable CF writes manual overrides. FX fields are surfaced in `BookingEditModal`.

**Tech Stack:** Angular 20 zoneless standalone, NgRx Signal Stores, Ionic/Angular 8.7, Vitest, Firebase Cloud Functions v2 (onSchedule + onCall), axios for SNB API fetch.

**Spec source:** `docs/superpowers/specs/2026-05-27-accounting-system-design.md` Phases 3 + 4.

**Prerequisite:** Plan 1 merged and all libs built.

---

## File Structure

```
libs/finance/
  vat-code/
    data-access/                     [new lib]
      src/lib/vat-code.service.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    feature/                         [new lib]
      src/lib/vat-code.store.ts
      src/lib/vat-code-list.ts
      src/lib/vat-code-edit.modal.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    ui/                              [new lib]
      src/lib/vat-code-form.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    util/                            [new lib]
      src/lib/vat-code.util.ts
      src/lib/vat-code.util.spec.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
  exchange-rate/
    data-access/                     [new lib]
      src/lib/exchange-rate.service.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    util/                            [new lib]
      src/lib/exchange-rate.util.ts
      src/lib/exchange-rate.util.spec.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
apps/
  functions/src/
    exchange-rate/
      fetch-snb-rates.ts             [new CF]
      set-manual-rate.ts             [new CF]
    main.ts                          [modify: export new CFs]
  scs-app/src/app/app.routes.ts      [modify: add vat-codes route]
libs/finance/booking/feature/src/lib/
  booking-edit.modal.ts              [modify: add FX + VAT fields]
tsconfig.base.json                   [modify: add Plan 2 path aliases]
```

---

## Tasks

### Task 1: Plan 2 lib scaffold + tsconfig.base.json aliases

**Files:**
- Create: all config files for 6 new libs
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create directories**

```bash
mkdir -p libs/finance/vat-code/{data-access,feature,ui,util}/src/lib
mkdir -p libs/finance/exchange-rate/{data-access,util}/src/lib
```

- [ ] **Step 2: Scaffold `vat-code/util`**

`libs/finance/vat-code/util/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/constants/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

`libs/finance/vat-code/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/vat-code/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-vat-code-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/vat-code/util/package.json`:

```json
{
  "name": "@bk2/finance-vat-code-util",
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

`libs/finance/vat-code/util/project.json`:

```json
{
  "name": "finance-vat-code-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/vat-code/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/vat-code/util",
        "main": "libs/finance/vat-code/util/src/index.ts",
        "tsConfig": "libs/finance/vat-code/util/tsconfig.lib.json",
        "assets": ["libs/finance/vat-code/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/vat-code/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/vat-code/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/vat-code/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/vat-code/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/finance/vat-code/util/src/index.ts`:

```ts
export * from './lib/vat-code.util';
```

- [ ] **Step 3: Scaffold `vat-code/data-access`**

`libs/finance/vat-code/data-access/tsconfig.json`:

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

`libs/finance/vat-code/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/vat-code/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-vat-code-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/vat-code/data-access/package.json`:

```json
{
  "name": "@bk2/finance-vat-code-data-access",
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
    "@bk2/finance-vat-code-util": "*"
  }
}
```

`libs/finance/vat-code/data-access/project.json`:

```json
{
  "name": "finance-vat-code-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/vat-code/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/vat-code/data-access",
        "main": "libs/finance/vat-code/data-access/src/index.ts",
        "tsConfig": "libs/finance/vat-code/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/vat-code/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/vat-code/data-access/src/index.ts`: `// populated in Task 3`

- [ ] **Step 4: Scaffold `vat-code/feature`**

`libs/finance/vat-code/feature/tsconfig.json`:

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
    {"path": "../data-access/tsconfig.lib.json"},
    {"path": "../util/tsconfig.lib.json"},
    {"path": "../ui/tsconfig.lib.json"}
  ]
}
```

`libs/finance/vat-code/feature/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/vat-code/feature",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-vat-code-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/vat-code/feature/package.json`:

```json
{
  "name": "@bk2/finance-vat-code-feature",
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
    "@bk2/finance-vat-code-data-access": "*",
    "@bk2/finance-vat-code-util": "*",
    "@bk2/finance-vat-code-ui": "*"
  }
}
```

`libs/finance/vat-code/feature/project.json`:

```json
{
  "name": "finance-vat-code-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/vat-code/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/vat-code/feature",
        "main": "libs/finance/vat-code/feature/src/index.ts",
        "tsConfig": "libs/finance/vat-code/feature/tsconfig.lib.json",
        "assets": ["libs/finance/vat-code/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/vat-code/feature/src/index.ts`: `// populated in Task 4`

- [ ] **Step 5: Scaffold `vat-code/ui`**

`libs/finance/vat-code/ui/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"}
  ]
}
```

`libs/finance/vat-code/ui/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/vat-code/ui",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-vat-code-ui.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/vat-code/ui/package.json`:

```json
{
  "name": "@bk2/finance-vat-code-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/finance/vat-code/ui/project.json`:

```json
{
  "name": "finance-vat-code-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/vat-code/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/vat-code/ui",
        "main": "libs/finance/vat-code/ui/src/index.ts",
        "tsConfig": "libs/finance/vat-code/ui/tsconfig.lib.json",
        "assets": ["libs/finance/vat-code/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/vat-code/ui/src/index.ts`: `// populated in Task 4`

- [ ] **Step 6: Scaffold `exchange-rate/util`**

`libs/finance/exchange-rate/util/tsconfig.json`:

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

`libs/finance/exchange-rate/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/exchange-rate/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-exchange-rate-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/exchange-rate/util/package.json`:

```json
{
  "name": "@bk2/finance-exchange-rate-util",
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

`libs/finance/exchange-rate/util/project.json`:

```json
{
  "name": "finance-exchange-rate-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/exchange-rate/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/exchange-rate/util",
        "main": "libs/finance/exchange-rate/util/src/index.ts",
        "tsConfig": "libs/finance/exchange-rate/util/tsconfig.lib.json",
        "assets": ["libs/finance/exchange-rate/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/exchange-rate/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/exchange-rate/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/exchange-rate/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/exchange-rate/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/finance/exchange-rate/util/src/index.ts`:

```ts
export * from './lib/exchange-rate.util';
```

- [ ] **Step 7: Scaffold `exchange-rate/data-access`**

`libs/finance/exchange-rate/data-access/tsconfig.json`:

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

`libs/finance/exchange-rate/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/exchange-rate/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-exchange-rate-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/exchange-rate/data-access/package.json`:

```json
{
  "name": "@bk2/finance-exchange-rate-data-access",
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
    "@bk2/finance-exchange-rate-util": "*"
  }
}
```

`libs/finance/exchange-rate/data-access/project.json`:

```json
{
  "name": "finance-exchange-rate-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/exchange-rate/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/exchange-rate/data-access",
        "main": "libs/finance/exchange-rate/data-access/src/index.ts",
        "tsConfig": "libs/finance/exchange-rate/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/exchange-rate/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/exchange-rate/data-access/src/index.ts`: `// populated in Task 6`

- [ ] **Step 8: Add path aliases to `tsconfig.base.json`**

```json
"@bk2/finance-exchange-rate-data-access": ["libs/finance/exchange-rate/data-access/src/index.ts"],
"@bk2/finance-exchange-rate-util": ["libs/finance/exchange-rate/util/src/index.ts"],
"@bk2/finance-vat-code-data-access": ["libs/finance/vat-code/data-access/src/index.ts"],
"@bk2/finance-vat-code-feature": ["libs/finance/vat-code/feature/src/index.ts"],
"@bk2/finance-vat-code-ui": ["libs/finance/vat-code/ui/src/index.ts"],
"@bk2/finance-vat-code-util": ["libs/finance/vat-code/util/src/index.ts"],
```

- [ ] **Step 9: Commit scaffold**

```bash
git add libs/finance/vat-code/ libs/finance/exchange-rate/ tsconfig.base.json
git commit -m "chore: scaffold vat-code (4 libs) and exchange-rate (2 libs)"
```

---

### Task 2: vat-code.util.ts — compute VAT + resolve active code

**Files:**
- Create: `libs/finance/vat-code/util/src/lib/vat-code.util.spec.ts`
- Create: `libs/finance/vat-code/util/src/lib/vat-code.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/vat-code/util/src/lib/vat-code.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { VatCodeModel } from '@bk2/shared-models';
import { computeVatFromNet, computeGrossFromNet, resolveActiveVatCode } from './vat-code.util';

describe('computeVatFromNet', () => {
  it('computes VAT amount in cents from net and rate', () => {
    // net 100.00 CHF (10000 cents) at 8.1%  → 810 cents
    expect(computeVatFromNet(10000, 8.1)).toBe(810);
  });

  it('rounds to nearest cent', () => {
    // net 99.00 at 8.1% = 8.019 → 802 cents (round down)
    expect(computeVatFromNet(9900, 8.1)).toBe(802);
  });

  it('returns 0 for zero rate', () => {
    expect(computeVatFromNet(10000, 0)).toBe(0);
  });
});

describe('computeGrossFromNet', () => {
  it('adds VAT to net in cents', () => {
    expect(computeGrossFromNet(10000, 8.1)).toBe(10810);
  });
});

describe('resolveActiveVatCode', () => {
  const codes: Partial<VatCodeModel>[] = [
    { bkey: 'a', validFrom: '20230101', validTo: '20231231', code: 'UST_77' },
    { bkey: 'b', validFrom: '20240101', validTo: '',          code: 'UST_81' },
  ];

  it('returns the code valid on the given date', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20240601');
    expect(result?.bkey).toBe('b');
  });

  it('returns the code valid on the given date (old period)', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20230601');
    expect(result?.bkey).toBe('a');
  });

  it('returns undefined when no code is active', () => {
    const result = resolveActiveVatCode(codes as VatCodeModel[], '20220101');
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-vat-code-util
```

Expected: FAIL — functions not defined

- [ ] **Step 3: Implement `libs/finance/vat-code/util/src/lib/vat-code.util.ts`**

```ts
import { VatCodeModel } from '@bk2/shared-models';

export function computeVatFromNet(netCents: number, ratePercent: number): number {
  return Math.round(netCents * ratePercent / 100);
}

export function computeGrossFromNet(netCents: number, ratePercent: number): number {
  return netCents + computeVatFromNet(netCents, ratePercent);
}

/**
 * Finds the VAT code that was active on the given StoreDate ("YYYYMMDD").
 * validTo = '' means open-ended (still active).
 */
export function resolveActiveVatCode(codes: VatCodeModel[], storeDate: string): VatCodeModel | undefined {
  return codes.find(c => {
    const from = c.validFrom ?? '';
    const to   = c.validTo   ?? '';
    return storeDate >= from && (to === '' || storeDate <= to);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm run test finance-vat-code-util
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/vat-code/util/src/
git commit -m "feat(vat-code-util): computeVatFromNet, computeGrossFromNet, resolveActiveVatCode with tests"
```

---

### Task 3: VatCodeService

**Files:**
- Create: `libs/finance/vat-code/data-access/src/lib/scope.ts`
- Create: `libs/finance/vat-code/data-access/src/lib/vat-code.service.ts`
- Modify: `libs/finance/vat-code/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/vat-code/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/vat-code/data-access.';
```

- [ ] **Step 2: Create `libs/finance/vat-code/data-access/src/lib/vat-code.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { VatCodeCollection, VatCodeModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

// Standard Swiss VAT codes seeded on tenant creation
export const CH_STANDARD_VAT_CODES: Omit<VatCodeModel, 'bkey' | 'tenants' | 'isArchived' | 'accountingTenantId'>[] = [
  { name: 'MWST 8.1% Umsatzsteuer',        code: 'UST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'MWST 2.6% Sondersteuer',        code: 'UST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'MWST 3.8% Beherbergung',        code: 'UST_38',  rate: 3.8,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'Vorsteuer 8.1%',               code: 'VST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '1170', method: 'effective', direction: 'input'  },
  { name: 'Vorsteuer 2.6%',               code: 'VST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '1170', method: 'effective', direction: 'input'  },
  { name: 'Steuerbefreit',                 code: 'EXEMPT',  rate: 0,    validFrom: '19900101', validTo: '', accountKey: '',     method: 'exempt',    direction: 'output' },
];

@Injectable({ providedIn: 'root' })
export class VatCodeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(code: VatCodeModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<VatCodeModel>(
      VatCodeCollection, code,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<VatCodeModel | undefined> {
    return findByKey<VatCodeModel>(this.list(accountingTenantId), key);
  }

  public async update(code: VatCodeModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<VatCodeModel>(
      VatCodeCollection, code, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(code: VatCodeModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<VatCodeModel>(
      VatCodeCollection, code,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'code', sortOrder = 'asc'): Observable<VatCodeModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<VatCodeModel>(VatCodeCollection, query, orderBy, sortOrder);
  }

  public async seedStandardCodes(tenantId: string, accountingTenantId: string, currentUser?: UserModel): Promise<void> {
    for (const template of CH_STANDARD_VAT_CODES) {
      const code = new VatCodeModel(tenantId, accountingTenantId);
      Object.assign(code, template);
      code.bkey = `${accountingTenantId}-${template.code}`;
      await this.create(code, currentUser);
    }
  }
}
```

- [ ] **Step 3: Update `libs/finance/vat-code/data-access/src/index.ts`**

```ts
export * from './lib/vat-code.service';
```

- [ ] **Step 4: Add constructor to VatCodeModel if missing**

In `libs/shared/models/src/lib/vat-code.model.ts`, verify or add:

```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/finance/vat-code/data-access/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add libs/finance/vat-code/data-access/src/ libs/shared/models/src/lib/vat-code.model.ts
git commit -m "feat(vat-code): VatCodeService with CRUD and Swiss standard code seeding"
```

---

### Task 4: VatCodeStore + VatCodeList + VatCodeEditModal

**Files:**
- Create: `libs/finance/vat-code/feature/src/lib/scope.ts`
- Create: `libs/finance/vat-code/feature/src/lib/vat-code.store.ts`
- Create: `libs/finance/vat-code/feature/src/lib/vat-code-list.ts`
- Create: `libs/finance/vat-code/feature/src/lib/vat-code-edit.modal.ts`
- Modify: `libs/finance/vat-code/feature/src/index.ts`
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Create `libs/finance/vat-code/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/vat-code/feature.';
```

- [ ] **Step 2: Create `libs/finance/vat-code/feature/src/lib/vat-code.store.ts`**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { VatCodeModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { VatCodeService } from '@bk2/finance-vat-code-data-access';

import { VatCodeEditModal } from './vat-code-edit.modal';
import { PFX } from './scope';

const VAT_CODE_I18N_KEYS = {
  list_title: PFX + 'list.title',
  empty:      PFX + 'empty',
  code_label: PFX + 'code.label',
  rate_label: PFX + 'rate.label',
  as_view:    PFX + 'actionsheet.view',
  as_edit:    PFX + 'actionsheet.edit',
  as_create:  PFX + 'actionsheet.create',
  as_delete:  PFX + 'actionsheet.delete',
  save:       '@save.label',
  cancel:     '@cancel',
  seed_label: PFX + 'seed.label',
} satisfies Record<string, string>;

export type VatCodeI18n = { [K in keyof typeof VAT_CODE_I18N_KEYS]: Signal<string> };

export const VatCodeStore = signalStore(
  withState({}),
  withProps(() => ({
    vatCodeService: inject(VatCodeService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(VAT_CODE_I18N_KEYS),
    vatCodesResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.vatCodeService.list(id),
    }),
  })),
  withComputed(store => ({
    vatCodes: computed(() => store.vatCodesResource.value() ?? []),
    isLoading: computed(() => store.vatCodesResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withMethods(store => ({
    async openEdit(vatCode: VatCodeModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: VatCodeEditModal,
        componentProps: { vatCode, readOnly, currentUser: store.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const code = data as VatCodeModel;
        if (code.bkey?.length > 0) {
          await store.vatCodeService.update(code, store.currentUser());
        } else {
          await store.vatCodeService.create(code, store.currentUser());
        }
        store.vatCodesResource.reload();
      }
    },

    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.appStore.tenantId();
      const accountingTenantId = store.accountingTenantId();
      const code = new VatCodeModel(tenantId, accountingTenantId);
      await this.openEdit(code, false);
    },

    async delete(vatCode: VatCodeModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.vatCodeService.delete(vatCode, store.currentUser());
      store.vatCodesResource.reload();
    },

    async seedStandard(): Promise<void> {
      if (store.isReadOnly()) return;
      const tenantId = store.appStore.tenantId();
      await store.vatCodeService.seedStandardCodes(tenantId, store.accountingTenantId(), store.currentUser());
      store.vatCodesResource.reload();
    },
  }))
);
```

- [ ] **Step 3: Create `libs/finance/vat-code/feature/src/lib/vat-code-list.ts`**

```ts
import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonNote, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { VatCodeStore } from './vat-code.store';

@Component({
  selector: 'bk-vat-code-list',
  standalone: true,
  imports: [
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonNote, IonFab, IonFabButton, IonIcon, IonButton,
    SvgIconPipe,
  ],
  providers: [VatCodeStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
          @if (!store.isReadOnly() && store.vatCodes().length === 0) {
            <ion-button slot="end" fill="clear" (click)="store.seedStandard()">
              {{ store.i18n.seed_label() }}
            </ion-button>
          }
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (store.isLoading()) {
          <p>Loading...</p>
        } @else if (store.vatCodes().length === 0) {
          <p>{{ store.i18n.empty() }}</p>
        } @else {
          <ion-list>
            @for (code of store.vatCodes(); track code.bkey) {
              <ion-item (click)="store.openEdit(code, store.isReadOnly())">
                <ion-label>
                  <h3>{{ code.code }} — {{ code.name }}</h3>
                  <p>{{ code.rate }}% | {{ code.direction }}</p>
                </ion-label>
                <ion-note slot="end">{{ code.validFrom }}–{{ code.validTo || '∞' }}</ion-note>
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
export class VatCodeList {
  protected readonly store = inject(VatCodeStore);
}
```

- [ ] **Step 4: Create `libs/finance/vat-code/feature/src/lib/vat-code-edit.modal.ts`**

```ts
import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { VatCodeModel, UserModel } from '@bk2/shared-models';

@Component({
  selector: 'bk-vat-code-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View VAT Code' : (vatCode().bkey ? 'Edit VAT Code' : 'New VAT Code') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()">Save</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Code</ion-label>
        <ion-input [(ngModel)]="edit.code" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Name</ion-label>
        <ion-input [(ngModel)]="edit.name" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Rate (%)</ion-label>
        <ion-input type="number" [(ngModel)]="edit.rate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Direction</ion-label>
        <ion-select [(ngModel)]="edit.direction" [disabled]="readOnly()">
          <ion-select-option value="input">Input (Vorsteuer)</ion-select-option>
          <ion-select-option value="output">Output (Umsatzsteuer)</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Valid From (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.validFrom" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Valid To (YYYYMMDD, leave blank for open-ended)</ion-label>
        <ion-input [(ngModel)]="edit.validTo" [readonly]="readOnly()" />
      </ion-item>
    </ion-content>
  `,
})
export class VatCodeEditModal implements OnInit {
  public readonly vatCode = input.required<VatCodeModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  protected edit!: VatCodeModel;

  ngOnInit(): void {
    this.edit = { ...this.vatCode() };
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    await this.modalController.dismiss(this.edit, 'confirm');
  }
}
```

- [ ] **Step 5: Update `libs/finance/vat-code/feature/src/index.ts`**

```ts
export * from './lib/vat-code.store';
export * from './lib/vat-code-list';
export * from './lib/vat-code-edit.modal';
```

- [ ] **Step 6: Add vat-codes route to `apps/scs-app/src/app/app.routes.ts`**

Inside the `accounting/:accountingTenantId` children array, add:

```ts
{
  path: 'vat-codes',
  loadComponent: () => import('@bk2/finance-vat-code-feature').then(m => m.VatCodeList),
},
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/finance/vat-code/feature/tsconfig.json
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add libs/finance/vat-code/feature/src/ apps/scs-app/src/app/app.routes.ts
git commit -m "feat(vat-code): VatCodeStore, VatCodeList, VatCodeEditModal + route"
```

---

### Task 5: exchange-rate.util.ts — convert amounts and pick closest rate

**Files:**
- Create: `libs/finance/exchange-rate/util/src/lib/exchange-rate.util.spec.ts`
- Create: `libs/finance/exchange-rate/util/src/lib/exchange-rate.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/exchange-rate/util/src/lib/exchange-rate.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ExchangeRateModel } from '@bk2/shared-models';
import { convertAmount, pickClosestRate } from './exchange-rate.util';

describe('convertAmount', () => {
  it('converts amount in cents using the exchange rate', () => {
    // 100.00 CHF (10000 cents) at rate 1.08 → 10800 EUR cents
    expect(convertAmount(10000, 1.08)).toBe(10800);
  });

  it('rounds to nearest cent', () => {
    // 100.00 CHF at 1.085 → 10850 cents
    expect(convertAmount(10000, 1.085)).toBe(10850);
  });
});

describe('pickClosestRate', () => {
  const rates: Partial<ExchangeRateModel>[] = [
    { date: '20260101', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.05 },
    { date: '20260115', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.07 },
    { date: '20260201', fromCurrency: 'CHF', toCurrency: 'EUR', rate: 1.09 },
  ];

  it('returns the rate on the exact date', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20260115');
    expect(result?.rate).toBe(1.07);
  });

  it('returns the most recent rate before the given date when no exact match', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20260120');
    expect(result?.rate).toBe(1.07);
  });

  it('returns undefined when no rate exists on or before the date', () => {
    const result = pickClosestRate(rates as ExchangeRateModel[], '20251201');
    expect(result).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-exchange-rate-util
```

Expected: FAIL

- [ ] **Step 3: Implement `libs/finance/exchange-rate/util/src/lib/exchange-rate.util.ts`**

```ts
import { ExchangeRateModel } from '@bk2/shared-models';

export function convertAmount(amountCents: number, rate: number): number {
  return Math.round(amountCents * rate);
}

/**
 * Returns the rate with the latest date on or before the target StoreDate ("YYYYMMDD").
 * Rates with a future date are excluded.
 */
export function pickClosestRate(rates: ExchangeRateModel[], storeDate: string): ExchangeRateModel | undefined {
  const eligible = rates.filter(r => (r.date ?? '') <= storeDate);
  if (eligible.length === 0) return undefined;
  return eligible.reduce((best, r) => ((r.date ?? '') > (best.date ?? '') ? r : best));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm run test finance-exchange-rate-util
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/exchange-rate/util/src/
git commit -m "feat(exchange-rate-util): convertAmount and pickClosestRate with tests"
```

---

### Task 6: ExchangeRateService

**Files:**
- Create: `libs/finance/exchange-rate/data-access/src/lib/scope.ts`
- Create: `libs/finance/exchange-rate/data-access/src/lib/exchange-rate.service.ts`
- Modify: `libs/finance/exchange-rate/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/exchange-rate/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/exchange-rate/data-access.';
```

- [ ] **Step 2: Create `libs/finance/exchange-rate/data-access/src/lib/exchange-rate.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { CurrencyCode, ExchangeRateCollection, ExchangeRateModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { pickClosestRate } from '@bk2/finance-exchange-rate-util';

@Injectable({ providedIn: 'root' })
export class ExchangeRateService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public listForPair(
    from: CurrencyCode,
    to: CurrencyCode,
    orderBy = 'date',
    sortOrder = 'desc'
  ): Observable<ExchangeRateModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'fromCurrency', operator: '==' as const, value: from },
      { key: 'toCurrency',   operator: '==' as const, value: to   },
    ];
    return this.firestoreService.searchData<ExchangeRateModel>(ExchangeRateCollection, query, orderBy, sortOrder);
  }

  public resolveRateForDate(rates: ExchangeRateModel[], storeDate: string): ExchangeRateModel | undefined {
    return pickClosestRate(rates, storeDate);
  }
}
```

- [ ] **Step 3: Update `libs/finance/exchange-rate/data-access/src/index.ts`**

```ts
export * from './lib/exchange-rate.service';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/exchange-rate/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add libs/finance/exchange-rate/data-access/src/
git commit -m "feat(exchange-rate): ExchangeRateService with pair query and date resolution"
```

---

### Task 7: Cloud Functions — fetchSnbRates + setManualRate

**Files:**
- Create: `apps/functions/src/exchange-rate/fetch-snb-rates.ts`
- Create: `apps/functions/src/exchange-rate/set-manual-rate.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create `apps/functions/src/exchange-rate/fetch-snb-rates.ts`**

The SNB publishes daily rates at `https://www.snb.ch/selector/de/mmr/exfeed/rss` (XML) and as CSV at `https://data.snb.ch/api/cube/devkum/data/CSV/de`. We use the CSV endpoint.

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

const SNB_CSV_URL = 'https://data.snb.ch/api/cube/devkum/data/CSV/de';

interface SnbRow {
  date: string;   // "2026-01-15"
  currency: string;
  rate: number;
}

async function fetchSnbRates(): Promise<SnbRow[]> {
  const response = await axios.get<string>(SNB_CSV_URL, { responseType: 'text' });
  const lines = response.data.split('\n');
  const rows: SnbRow[] = [];
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;
    const date = parts[0]?.trim();
    const currency = parts[1]?.trim();
    const rateStr = parts[2]?.trim().replace(',', '.');
    if (!date || !currency || !rateStr) continue;
    const rate = parseFloat(rateStr);
    if (isNaN(rate)) continue;
    rows.push({ date, currency, rate });
  }
  return rows;
}

export const fetchSnbRatesScheduled = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    memory: '256MiB',
  },
  async () => {
    logger.info('fetchSnbRates: fetching from SNB');
    const rows = await fetchSnbRates();
    const db = admin.firestore();
    const today = convertDateFormatToString(
      new Date().toISOString().substring(0, 10),
      DateFormat.IsoDate,
      DateFormat.StoreDate
    );
    const batch = db.batch();
    let count = 0;
    for (const row of rows) {
      const storeDate = convertDateFormatToString(row.date, DateFormat.IsoDate, DateFormat.StoreDate);
      const bkey = `CHF-${row.currency}-${storeDate}-snb`;
      const ref = db.collection('exchange-rates').doc(bkey);
      batch.set(ref, {
        tenants: ['scs'],       // exchange rates are shared, use a fixed tenant tag
        isArchived: false,
        fromCurrency: 'CHF',
        toCurrency: row.currency,
        rate: row.rate,
        date: storeDate,
        source: 'snb',
        rateType: 'daily',
      }, { merge: true });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
      }
    }
    await batch.commit();
    logger.info(`fetchSnbRates: wrote ${count} rate entries for ${today}`);
  }
);
```

- [ ] **Step 2: Create `apps/functions/src/exchange-rate/set-manual-rate.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface SetManualRateData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  date: string;   // ISO date "YYYY-MM-DD"
  tenants: string[];
}

export const setManualRate = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '128MiB' },
  async (request: CallableRequest<SetManualRateData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { fromCurrency, toCurrency, rate, date, tenants } = request.data;
    if (!fromCurrency || !toCurrency || !rate || !date) {
      throw new HttpsError('invalid-argument', 'fromCurrency, toCurrency, rate, date are required');
    }
    const storeDate = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate);
    const bkey = `${fromCurrency}-${toCurrency}-${storeDate}-manual`;
    await admin.firestore().collection('exchange-rates').doc(bkey).set({
      tenants: tenants ?? ['scs'],
      isArchived: false,
      fromCurrency,
      toCurrency,
      rate,
      date: storeDate,
      source: 'manual',
      rateType: 'daily',
    }, { merge: true });
    logger.info(`setManualRate: wrote ${bkey} rate=${rate}`);
    return { bkey };
  }
);
```

- [ ] **Step 3: Export new CFs from `apps/functions/src/main.ts`**

Add these exports (keep the existing ones):

```ts
export { fetchSnbRatesScheduled } from './exchange-rate/fetch-snb-rates';
export { setManualRate } from './exchange-rate/set-manual-rate';
```

- [ ] **Step 4: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production
```

Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/exchange-rate/ apps/functions/src/main.ts
git commit -m "feat(cf): fetchSnbRates (daily schedule) and setManualRate (callable) Cloud Functions"
```

---

### Task 8: Wire FX + VAT fields into BookingEditModal

**Files:**
- Modify: `libs/finance/booking/feature/src/lib/booking-edit.modal.ts`
- Modify: `libs/finance/booking/feature/package.json` (add exchange-rate + vat-code deps)
- Modify: `libs/finance/booking/feature/tsconfig.json` (add exchange-rate + vat-code references)

- [ ] **Step 1: Update `libs/finance/booking/feature/package.json` — add new deps**

Add to `dependencies`:

```json
"@bk2/finance-vat-code-data-access": "*",
"@bk2/finance-exchange-rate-data-access": "*",
"@bk2/finance-exchange-rate-util": "*"
```

- [ ] **Step 2: Update `libs/finance/booking/feature/tsconfig.json` — add references**

In `references` array, add:

```json
{"path": "../../../finance/vat-code/data-access/tsconfig.lib.json"},
{"path": "../../../finance/exchange-rate/data-access/tsconfig.lib.json"},
{"path": "../../../finance/exchange-rate/util/tsconfig.lib.json"}
```

- [ ] **Step 3: Update `libs/finance/booking/feature/src/lib/booking-edit.modal.ts`**

Add FX amount and VAT code selector per booking line. The key additions to the modal component:

```ts
import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { BookingLineModel, BookingModel, UserModel, VatCodeModel } from '@bk2/shared-models';
import { validateBookingBalance } from '@bk2/finance-booking-util';
import { VatCodeService } from '@bk2/finance-vat-code-data-access';
import { ExchangeRateService } from '@bk2/finance-exchange-rate-data-access';

@Component({
  selector: 'bk-booking-edit-modal',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View Booking' : (booking().bkey ? 'Edit Booking' : 'New Booking') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) {
            <ion-button (click)="save()" [disabled]="!isBalanced">Save</ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="editBooking.date" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-input [(ngModel)]="editBooking.title" [readonly]="readOnly()" />
      </ion-item>

      @for (line of editLines; track $index; let i = $index) {
        <ion-item>
          <ion-label position="stacked">Account</ion-label>
          <ion-input [(ngModel)]="line.accountKey" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Debit (cents, 0 for credit)</ion-label>
          <ion-input type="number" [(ngModel)]="line.debitAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">Credit (cents, 0 for debit)</ion-label>
          <ion-input type="number" [(ngModel)]="line.creditAmount!.amount" [readonly]="readOnly()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">VAT Code</ion-label>
          <ion-select [(ngModel)]="line.vatCodeKey" [disabled]="readOnly()">
            <ion-select-option value="">— none —</ion-select-option>
            @for (vc of vatCodes; track vc.bkey) {
              <ion-select-option [value]="vc.bkey">{{ vc.code }} {{ vc.rate }}%</ion-select-option>
            }
          </ion-select>
        </ion-item>
      }

      @if (!isBalanced) {
        <p style="color:red">Debit and credit totals must be equal.</p>
      }

      @if (!readOnly()) {
        <ion-button expand="block" (click)="addLine()">+ Add Line</ion-button>
      }
    </ion-content>
  `,
})
export class BookingEditModal implements OnInit {
  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  private readonly vatCodeService = inject(VatCodeService);

  protected editBooking!: BookingModel;
  protected editLines!: BookingLineModel[];
  protected vatCodes: VatCodeModel[] = [];

  async ngOnInit(): Promise<void> {
    this.editBooking = { ...this.booking() };
    this.editLines = this.lines().map(l => ({
      ...l,
      debitAmount:  l.debitAmount  ?? { amount: 0, currency: 'CHF', periodicity: 'one-time' as const },
      creditAmount: l.creditAmount ?? { amount: 0, currency: 'CHF', periodicity: 'one-time' as const },
    }));
    if (this.editBooking.accountingTenantId) {
      this.vatCodes = await firstValueFrom(
        this.vatCodeService.list(this.editBooking.accountingTenantId)
      );
    }
  }

  protected get isBalanced(): boolean {
    return validateBookingBalance(this.editLines);
  }

  protected addLine(): void {
    const blank: BookingLineModel = new BookingLineModel(
      this.editBooking.tenants[0] ?? '',
      this.editBooking.accountingTenantId
    );
    blank.bookingKey = this.editBooking.bkey;
    blank.debitAmount  = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    blank.creditAmount = { amount: 0, currency: 'CHF', periodicity: 'one-time' };
    this.editLines = [...this.editLines, blank];
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (!this.isBalanced) return;
    const cleanLines = this.editLines.map(l => ({
      ...l,
      debitAmount:  (l.debitAmount?.amount ?? 0)  > 0 ? l.debitAmount  : undefined,
      creditAmount: (l.creditAmount?.amount ?? 0) > 0 ? l.creditAmount : undefined,
    }));
    await this.modalController.dismiss({ booking: this.editBooking, lines: cleanLines }, 'confirm');
  }
}
```

Also add `BookingLineModel` constructor to `libs/shared/models/src/lib/booking-line.model.ts` if missing:

```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
  this.bkey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add libs/finance/booking/feature/ libs/shared/models/src/lib/booking-line.model.ts
git commit -m "feat(booking): wire VAT code selector and FX amount into BookingEditModal"
```

---

### Task 9: Build + test verification

- [ ] **Step 1: Run all util tests**

```bash
pnpm run test finance-vat-code-util
pnpm run test finance-exchange-rate-util
```

Expected: all tests passing

- [ ] **Step 2: Type-check all Plan 2 libs**

```bash
npx tsc --noEmit -p libs/finance/vat-code/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/vat-code/feature/tsconfig.json
npx tsc --noEmit -p libs/finance/vat-code/util/tsconfig.json
npx tsc --noEmit -p libs/finance/exchange-rate/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/exchange-rate/util/tsconfig.json
```

Expected: all clean

- [ ] **Step 3: Build all Plan 2 libs**

```bash
pnpm nx build finance-vat-code-util
pnpm nx build finance-vat-code-data-access
pnpm nx build finance-vat-code-feature
pnpm nx build finance-exchange-rate-util
pnpm nx build finance-exchange-rate-data-access
```

Expected: all succeed

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: Plan 2 complete — VAT codes and multi-currency exchange rates"
```

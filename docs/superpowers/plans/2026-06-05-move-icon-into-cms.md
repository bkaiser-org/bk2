# Move Icon Feature into CMS Domain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate `libs/icon/` into `libs/cms/icon/`, rename all TS import aliases from `@bk2/icon-*` to `@bk2/cms-icon-*`, and update Transloco scope strings from `@icon/` to `@cms/icon/`.

**Architecture:** Pure physical relocation + rename. No behaviour changes. Four layers move together (`data-access`, `feature`, `ui`, `util`). Only two files outside the icon libs reference `@bk2/icon-*` and need updating.

**Tech Stack:** Angular 20, Nx monorepo, TypeScript, Transloco i18n.

---

## File Map

Files **moved** (git mv preserves history):
- `libs/icon/data-access/` → `libs/cms/icon/data-access/`
- `libs/icon/feature/` → `libs/cms/icon/feature/`
- `libs/icon/ui/` → `libs/cms/icon/ui/`
- `libs/icon/util/` → `libs/cms/icon/util/`

Files **edited** after move (all paths relative to repo root):

| File | What changes |
|---|---|
| `tsconfig.base.json` | 4 alias entries: path `libs/icon/` → `libs/cms/icon/` |
| `libs/cms/icon/data-access/package.json` | `name`, dep `icon-util` → `cms-icon-util` |
| `libs/cms/icon/feature/package.json` | `name`, 3 icon deps renamed |
| `libs/cms/icon/ui/package.json` | `name`, dep `icon-util` → `cms-icon-util` |
| `libs/cms/icon/util/package.json` | `name` only |
| `libs/cms/icon/data-access/project.json` | `$schema` level, all paths |
| `libs/cms/icon/feature/project.json` | `$schema` level, all paths |
| `libs/cms/icon/ui/project.json` | `$schema` level, all paths |
| `libs/cms/icon/util/project.json` | `$schema` level, all paths |
| `libs/cms/icon/data-access/tsconfig.json` | `extends` level, non-icon refs depth |
| `libs/cms/icon/feature/tsconfig.json` | `extends` level, non-icon refs depth |
| `libs/cms/icon/ui/tsconfig.json` | `extends` level, non-icon refs depth |
| `libs/cms/icon/util/tsconfig.json` | `extends` level, non-icon refs depth |
| `libs/cms/icon/data-access/tsconfig.lib.json` | `extends` level, `outDir`, `tsBuildInfoFile` |
| `libs/cms/icon/feature/tsconfig.lib.json` | `extends` level, `outDir`, `tsBuildInfoFile` |
| `libs/cms/icon/ui/tsconfig.lib.json` | `extends` level, `outDir`, `tsBuildInfoFile` |
| `libs/cms/icon/util/tsconfig.lib.json` | `extends` level, `outDir`, `tsBuildInfoFile` |
| `libs/cms/icon/util/src/lib/icon-i18n.ts` | `PFX` → `@cms/icon/feature.` |
| `libs/cms/icon/data-access/src/lib/scope.ts` | `PFX` → `@cms/icon/data-access.` |
| `libs/cms/icon/feature/src/lib/scope.ts` | `PFX` → `@cms/icon/feature.` |
| `libs/cms/icon/util/src/lib/scope.ts` | `PFX` → `@cms/icon/util.` |
| `libs/cms/icon/data-access/src/lib/icon.service.ts` | `@bk2/icon-util` → `@bk2/cms-icon-util` |
| `libs/cms/icon/feature/src/lib/icon.store.ts` | `@bk2/icon-data-access`, `@bk2/icon-util` → cms variants |
| `libs/cms/icon/feature/src/lib/icon-edit.modal.ts` | `@bk2/icon-ui`, `@bk2/icon-util` → cms variants |
| `libs/cms/icon/ui/src/lib/icon-edit.form.ts` | `@bk2/icon-util` → `@bk2/cms-icon-util` |
| `apps/scs-app/project.json` | 2 icon i18n entries renamed, 1 stale ui entry removed |
| `apps/scs-app/src/app/app.routes.ts` | `@bk2/icon-feature` → `@bk2/cms-icon-feature` |
| `libs/cms/menu/feature/src/lib/menu.modal.ts` | dynamic import alias updated |

---

## Task 1: Move all four icon layers with git mv

**Files:** `libs/icon/` → `libs/cms/icon/` (via git)

- [ ] **Create target directory and move layers**

```bash
mkdir -p libs/cms/icon
git mv libs/icon/data-access libs/cms/icon/data-access
git mv libs/icon/feature libs/cms/icon/feature
git mv libs/icon/ui libs/cms/icon/ui
git mv libs/icon/util libs/cms/icon/util
```

- [ ] **Verify the move**

```bash
ls libs/cms/icon/
# Expected: data-access  feature  ui  util
ls libs/icon/
# Expected: .DS_Store only (or empty — the icon dir itself is now empty)
```

- [ ] **Commit**

```bash
git add -A
git commit -m "refactor(icon): git mv libs/icon → libs/cms/icon"
```

---

## Task 2: Update tsconfig.base.json aliases

**Files:** Modify `tsconfig.base.json:119-122`

- [ ] **Replace the 4 icon alias entries**

In `tsconfig.base.json`, find the block:
```json
"@bk2/icon-data-access": ["libs/icon/data-access/src/index.ts"],
"@bk2/icon-feature": ["libs/icon/feature/src/index.ts"],
"@bk2/icon-ui": ["libs/icon/ui/src/index.ts"],
"@bk2/icon-util": ["libs/icon/util/src/index.ts"],
```

Replace with:
```json
"@bk2/cms-icon-data-access": ["libs/cms/icon/data-access/src/index.ts"],
"@bk2/cms-icon-feature": ["libs/cms/icon/feature/src/index.ts"],
"@bk2/cms-icon-ui": ["libs/cms/icon/ui/src/index.ts"],
"@bk2/cms-icon-util": ["libs/cms/icon/util/src/index.ts"],
```

- [ ] **Commit**

```bash
git add tsconfig.base.json
git commit -m "refactor(icon): rename @bk2/icon-* aliases to @bk2/cms-icon-* in tsconfig.base.json"
```

---

## Task 3: Update package.json in all four layers

**Files:** Modify the 4 `package.json` files under `libs/cms/icon/`.

- [ ] **Update `libs/cms/icon/data-access/package.json`**

```json
{
  "name": "@bk2/cms-icon-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/cms-icon-util": "*"
  },
  "module": "./src/index.js",
  "type": "module"
}
```

- [ ] **Update `libs/cms/icon/feature/package.json`**

```json
{
  "name": "@bk2/cms-icon-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/avatar-data-access": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/cms-icon-data-access": "*",
    "@bk2/cms-icon-ui": "*",
    "@bk2/cms-icon-util": "*"
  },
  "module": "./src/index.js",
  "type": "module"
}
```

- [ ] **Update `libs/cms/icon/ui/package.json`**

```json
{
  "name": "@bk2/cms-icon-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-constants": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/cms-icon-util": "*"
  },
  "module": "./src/index.js",
  "type": "module"
}
```

- [ ] **Update `libs/cms/icon/util/package.json`**

```json
{
  "name": "@bk2/cms-icon-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-constants": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-util-core": "*"
  },
  "module": "./src/index.js",
  "type": "module"
}
```

- [ ] **Commit**

```bash
git add libs/cms/icon/data-access/package.json libs/cms/icon/feature/package.json libs/cms/icon/ui/package.json libs/cms/icon/util/package.json
git commit -m "refactor(icon): rename package names to @bk2/cms-icon-*"
```

---

## Task 4: Update project.json in all four layers

The `$schema` path gains one `../` level (now 4 levels from workspace root). All `libs/icon/` references become `libs/cms/icon/` and `dist/libs/icon/` become `dist/libs/cms/icon/`.

**Files:** Modify 4 `project.json` files under `libs/cms/icon/`.

- [ ] **Update `libs/cms/icon/data-access/project.json`**

```json
{
  "name": "cms-icon-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/cms/icon/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:icon", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/cms/icon/data-access",
        "main": "libs/cms/icon/data-access/src/index.ts",
        "tsConfig": "libs/cms/icon/data-access/tsconfig.lib.json",
        "assets": ["libs/cms/icon/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Update `libs/cms/icon/feature/project.json`**

```json
{
  "name": "cms-icon-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/cms/icon/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:icon", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/cms/icon/feature",
        "main": "libs/cms/icon/feature/src/index.ts",
        "tsConfig": "libs/cms/icon/feature/tsconfig.lib.json",
        "assets": ["libs/cms/icon/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Update `libs/cms/icon/ui/project.json`**

```json
{
  "name": "cms-icon-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/cms/icon/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:icon", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/cms/icon/ui",
        "main": "libs/cms/icon/ui/src/index.ts",
        "tsConfig": "libs/cms/icon/ui/tsconfig.lib.json",
        "assets": ["libs/cms/icon/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Update `libs/cms/icon/util/project.json`**

```json
{
  "name": "cms-icon-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/cms/icon/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:icon", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/cms/icon/util",
        "main": "libs/cms/icon/util/src/index.ts",
        "tsConfig": "libs/cms/icon/util/tsconfig.lib.json",
        "assets": ["libs/cms/icon/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "configFile": "libs/cms/icon/util/vite.config.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Commit**

```bash
git add libs/cms/icon/data-access/project.json libs/cms/icon/feature/project.json libs/cms/icon/ui/project.json libs/cms/icon/util/project.json
git commit -m "refactor(icon): update project.json files for cms/icon location"
```

---

## Task 5: Update tsconfig.json in all four layers

**Background:** Moving from `libs/icon/<layer>/` to `libs/cms/icon/<layer>/` adds one directory level. This means:
- `extends: "../../../tsconfig.base.json"` → `"../../../../tsconfig.base.json"` (one extra `../`)
- References to `@bk2/shared-*` libs change from `../../shared/` → `../../../shared/` (one extra `../`)
- References to sibling icon layers (`../../icon/<sibling>/`) **stay unchanged** — they still resolve to `libs/cms/icon/<sibling>/` ✓

**Files:** Modify 4 `tsconfig.json` files.

- [ ] **Update `libs/cms/icon/data-access/tsconfig.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true,
    "module": "preserve",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
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
    { "path": "../../../shared/config/tsconfig.lib.json" },
    { "path": "../../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../icon/util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/feature/tsconfig.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true,
    "module": "preserve",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
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
    { "path": "../../../avatar/data-access/tsconfig.lib.json" },
    { "path": "../../../shared/config/tsconfig.lib.json" },
    { "path": "../../../shared/feature/tsconfig.lib.json" },
    { "path": "../../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/pipes/tsconfig.lib.json" },
    { "path": "../../../shared/ui/tsconfig.lib.json" },
    { "path": "../../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../icon/data-access/tsconfig.lib.json" },
    { "path": "../../icon/ui/tsconfig.lib.json" },
    { "path": "../../icon/util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/ui/tsconfig.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node", "vitest"],
    "declaration": true,
    "module": "preserve",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
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
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/ui/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../icon/util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/util/tsconfig.json`**

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
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" }
  ]
}
```

- [ ] **Commit**

```bash
git add libs/cms/icon/data-access/tsconfig.json libs/cms/icon/feature/tsconfig.json libs/cms/icon/ui/tsconfig.json libs/cms/icon/util/tsconfig.json
git commit -m "refactor(icon): update tsconfig.json reference paths for cms/icon location"
```

---

## Task 6: Update tsconfig.lib.json in all four layers

**Background:** `extends`, `outDir`, and `tsBuildInfoFile` paths all gain one `../` level. The `references` arrays in `tsconfig.lib.json` only contain sibling icon layers (relative `../`) so they stay unchanged.

**Files:** Modify 4 `tsconfig.lib.json` files.

- [ ] **Update `libs/cms/icon/data-access/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/cms/icon/data-access",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/cms-icon-data-access.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/feature/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/cms/icon/feature",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/cms-icon-feature.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../data-access/tsconfig.lib.json" },
    { "path": "../ui/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/ui/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/cms/icon/ui",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/cms-icon-ui.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"],
  "references": [
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

- [ ] **Update `libs/cms/icon/util/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/cms/icon/util",
    "declaration": true,
    "composite": true,
    "moduleResolution": "bundler",
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/cms-icon-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Commit**

```bash
git add libs/cms/icon/data-access/tsconfig.lib.json libs/cms/icon/feature/tsconfig.lib.json libs/cms/icon/ui/tsconfig.lib.json libs/cms/icon/util/tsconfig.lib.json
git commit -m "refactor(icon): update tsconfig.lib.json paths for cms/icon location"
```

---

## Task 7: Update Transloco scope strings

**Files:** Modify 4 source files.

- [ ] **Update `libs/cms/icon/util/src/lib/icon-i18n.ts` line 3**

Change:
```ts
const PFX = '@icon/feature.';
```
To:
```ts
const PFX = '@cms/icon/feature.';
```

- [ ] **Update `libs/cms/icon/data-access/src/lib/scope.ts`**

Change:
```ts
export const PFX = '@icon/data-access.';
```
To:
```ts
export const PFX = '@cms/icon/data-access.';
```

- [ ] **Update `libs/cms/icon/feature/src/lib/scope.ts`**

Change:
```ts
export const PFX = '@icon/feature.';
```
To:
```ts
export const PFX = '@cms/icon/feature.';
```

- [ ] **Update `libs/cms/icon/util/src/lib/scope.ts`**

Change:
```ts
export const PFX = '@icon/util.';
```
To:
```ts
export const PFX = '@cms/icon/util.';
```

- [ ] **Commit**

```bash
git add libs/cms/icon/util/src/lib/icon-i18n.ts libs/cms/icon/data-access/src/lib/scope.ts libs/cms/icon/feature/src/lib/scope.ts libs/cms/icon/util/src/lib/scope.ts
git commit -m "refactor(icon): rename Transloco scope strings from @icon/ to @cms/icon/"
```

---

## Task 8: Update internal @bk2/icon-* imports within the icon libs

Four source files inside the moved libs still import `@bk2/icon-*` aliases and need updating to `@bk2/cms-icon-*`.

**Files:** Modify 4 source files.

- [ ] **Update `libs/cms/icon/data-access/src/lib/icon.service.ts` line 9**

Change:
```ts
import { getIconIndex } from '@bk2/icon-util';
```
To:
```ts
import { getIconIndex } from '@bk2/cms-icon-util';
```

- [ ] **Update `libs/cms/icon/feature/src/lib/icon.store.ts` lines 15–16**

Change:
```ts
import { IconService } from '@bk2/icon-data-access';
import { buildIconModel, buildIconModelFromStorage, getIconStoragePath, ICON_I18N_KEYS, IconI18n } from '@bk2/icon-util';
```
To:
```ts
import { IconService } from '@bk2/cms-icon-data-access';
import { buildIconModel, buildIconModelFromStorage, getIconStoragePath, ICON_I18N_KEYS, IconI18n } from '@bk2/cms-icon-util';
```

- [ ] **Update `libs/cms/icon/feature/src/lib/icon-edit.modal.ts` lines 10–11**

Change:
```ts
import { IconEditForm } from '@bk2/icon-ui';
import { ICON_I18N_KEYS, IconI18n } from '@bk2/icon-util';
```
To:
```ts
import { IconEditForm } from '@bk2/cms-icon-ui';
import { ICON_I18N_KEYS, IconI18n } from '@bk2/cms-icon-util';
```

- [ ] **Update `libs/cms/icon/ui/src/lib/icon-edit.form.ts` line 6**

Change:
```ts
import { iconValidations } from '@bk2/icon-util';
```
To:
```ts
import { iconValidations } from '@bk2/cms-icon-util';
```

- [ ] **Commit**

```bash
git add libs/cms/icon/data-access/src/lib/icon.service.ts libs/cms/icon/feature/src/lib/icon.store.ts libs/cms/icon/feature/src/lib/icon-edit.modal.ts libs/cms/icon/ui/src/lib/icon-edit.form.ts
git commit -m "refactor(icon): update internal @bk2/icon-* imports to @bk2/cms-icon-*"
```

---

## Task 9: Update asset paths in scs-app/project.json

Two entries are renamed; one stale entry (icon/ui — directory never existed) is removed.

**Files:** Modify `apps/scs-app/project.json` around lines 347–359.

- [ ] **Replace the three icon i18n asset entries**

Find this block:
```json
{
  "glob": "*.json",
  "input": "libs/icon/data-access/src/i18n",
  "output": "./assets/i18n/icon/data-access"
},
{
  "glob": "*.json",
  "input": "libs/icon/feature/src/i18n",
  "output": "./assets/i18n/icon/feature"
},
{
  "glob": "*.json",
  "input": "libs/icon/ui/src/i18n",
  "output": "./assets/i18n/icon/ui"
},
```

Replace with:
```json
{
  "glob": "*.json",
  "input": "libs/cms/icon/data-access/src/i18n",
  "output": "./assets/i18n/cms/icon/data-access"
},
{
  "glob": "*.json",
  "input": "libs/cms/icon/feature/src/i18n",
  "output": "./assets/i18n/cms/icon/feature"
},
```

(The ui entry is removed because `libs/icon/ui/src/i18n` never existed — it was a stale entry.)

- [ ] **Commit**

```bash
git add apps/scs-app/project.json
git commit -m "refactor(icon): update i18n asset paths in scs-app to cms/icon"
```

---

## Task 10: Update external consumers

Two files outside the icon libs reference `@bk2/icon-feature`.

**Files:** Modify `apps/scs-app/src/app/app.routes.ts` and `libs/cms/menu/feature/src/lib/menu.modal.ts`.

- [ ] **Update `apps/scs-app/src/app/app.routes.ts`**

Find (around line 282):
```ts
loadComponent: () => import('@bk2/icon-feature').then(m => m.IconList)
```

Replace with:
```ts
loadComponent: () => import('@bk2/cms-icon-feature').then(m => m.IconList)
```

- [ ] **Update `libs/cms/menu/feature/src/lib/menu.modal.ts`**

Find (inside `selectIcon()`):
```ts
const { IconSelectModal: IconSelectModal } = await import('@bk2/icon-feature');
```

Replace with:
```ts
const { IconSelectModal: IconSelectModal } = await import('@bk2/cms-icon-feature');
```

- [ ] **Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts libs/cms/menu/feature/src/lib/menu.modal.ts
git commit -m "refactor(icon): update external consumers to @bk2/cms-icon-feature"
```

---

## Task 11: Type-check and verify

- [ ] **Run type-check on all affected libs**

```bash
npx tsc --noEmit -p libs/cms/icon/util/tsconfig.json 2>&1
npx tsc --noEmit -p libs/cms/icon/data-access/tsconfig.json 2>&1
npx tsc --noEmit -p libs/cms/icon/ui/tsconfig.json 2>&1
npx tsc --noEmit -p libs/cms/icon/feature/tsconfig.json 2>&1
npx tsc --noEmit -p libs/cms/menu/feature/tsconfig.json 2>&1
```

Expected: no output (zero errors) for each command.

- [ ] **Run type-check on the app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json 2>&1 | head -30
```

Expected: no icon-related errors.

- [ ] **Verify no old icon alias remains**

```bash
grep -r "@bk2/icon-" libs/ apps/ --include="*.ts" --include="*.json" | grep -v "node_modules" | grep -v ".DS_Store"
```

Expected: no output.

- [ ] **Fix any errors found**, then commit the fix with a descriptive message.

---

## Task 12: Final cleanup commit

- [ ] **Remove the now-empty `libs/icon/` directory if it only contains `.DS_Store`**

```bash
ls libs/icon/
# If only .DS_Store remains:
rm -rf libs/icon/
git add -A
git commit -m "refactor(icon): remove empty libs/icon/ directory after move to libs/cms/icon/"
```

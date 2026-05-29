# Expense Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the expense submission feature (Auslagen/Spesen) so employees can file expense claims that create double-entry bookings automatically.

**Architecture:** Client-side saga in `ExpenseStore` drives all steps (IBAN save → file upload → expense persist → booking creation) with compensating rollback on failure. Four-layer Nx lib under `libs/finance/expense/`. Old Bexio-centric `ExpenseModel` is replaced in place.

**Tech Stack:** Angular 20 zoneless standalone, Ionic 8.7, NgRx Signal Stores, Firebase Storage + Firestore, vest validations, ngx-vest-forms, Transloco i18n.

---

## File Map

### Modify existing
- `libs/shared/models/src/lib/expense.model.ts` — replace with spec model
- `libs/shared/models/src/lib/accounting-config.model.ts` — add two optional fields
- `libs/shared/models/src/index.ts` — add expense-document export
- `libs/subject/address/data-access/src/lib/address.service.ts` — add `listBankAccounts(parentKey)`
- `tsconfig.base.json` — add 4 new path aliases
- `apps/scs-app/project.json` — add 2 i18n asset entries
- `apps/scs-app/src/app/app.routes.ts` — add expense routes

### Create new — shared model
- `libs/shared/models/src/lib/expense-document.model.ts`

### Create new — libs/finance/expense/data-access/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `src/lib/scope.ts`, `src/index.ts`, `src/i18n/de.json`
- `src/lib/expense.service.ts`
- `src/lib/expense-document.service.ts`

### Create new — libs/finance/expense/util/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `src/lib/scope.ts`, `src/index.ts`
- `src/lib/expense.util.ts`
- `src/lib/expense.util.spec.ts`
- `src/lib/expense.validations.ts`

### Create new — libs/finance/expense/ui/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `src/lib/scope.ts`, `src/index.ts`
- `src/lib/expense.form.ts`

### Create new — libs/finance/expense/feature/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `src/lib/scope.ts`, `src/index.ts`, `src/i18n/de.json`
- `src/lib/expense.store.ts`
- `src/lib/expense-new.modal.ts`
- `src/lib/expense-list.ts`
- `src/lib/expense-detail.modal.ts`

---

## Task 1: Replace ExpenseModel, add ExpenseDocumentModel, extend AccountingConfigModel

**Files:**
- Modify: `libs/shared/models/src/lib/expense.model.ts`
- Create: `libs/shared/models/src/lib/expense-document.model.ts`
- Modify: `libs/shared/models/src/lib/accounting-config.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1.1: Replace expense.model.ts**

Replace the entire file content with:

```ts
import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, SearchableModel, TaggedModel } from './base.model';

export type ExpenseStatus = 'draft' | 'processing' | 'validated' | 'error' | 'posted';

export class ExpenseModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public abstract = '';
  public amountTotal = 0;
  public currency = 'CHF';
  public iban = '';
  public category = '';
  public costCenterId = '';
  public note = '';
  public status: ExpenseStatus = 'draft';
  public bookingKey = DEFAULT_KEY;
  public userId = DEFAULT_KEY;
  public accountingTenantId = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseCollection = 'expenses';
export const ExpenseModelName = 'expense';
```

- [ ] **Step 1.2: Create expense-document.model.ts**

```ts
import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel } from './base.model';

export type OcrStatus = 'pending' | 'completed' | 'failed' | 'manual';

export class ExpenseDocumentModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public expenseKey = DEFAULT_KEY;
  public documentKey = DEFAULT_KEY;

  public ocrInvoiceDate = '';
  public ocrAmount = 0;
  public ocrSubject = '';
  public ocrVatAmount = 0;
  public ocrVatRate = 0;
  public ocrCurrency = '';
  public ocrConfidence = 0;
  public ocrStatus: OcrStatus = 'pending';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ExpenseDocumentCollection = 'expense-documents';
export const ExpenseDocumentModelName = 'expenseDocument';
```

- [ ] **Step 1.3: Add two optional fields to AccountingConfigModel**

After `public depreciationProRata: DepreciationProRata = 'daily';` add:
```ts
  public defaultExpenseAccountKey = '';
  public employeePayablesAccountKey = '';
```

- [ ] **Step 1.4: Add export to shared/models/src/index.ts**

Add after the existing `expense.model` export:
```ts
export * from './lib/expense-document.model';
```

- [ ] **Step 1.5: Commit**

```bash
git add libs/shared/models/src/lib/expense.model.ts \
        libs/shared/models/src/lib/expense-document.model.ts \
        libs/shared/models/src/lib/accounting-config.model.ts \
        libs/shared/models/src/index.ts
git commit -m "feat(models): replace ExpenseModel with spec model, add ExpenseDocumentModel, extend AccountingConfigModel"
```

---

## Task 2: Create library scaffold for all four finance/expense layers

**Files:** All tsconfig, package.json, project.json, scope.ts, and index.ts files for data-access, util, ui, feature.

- [ ] **Step 2.1: Create data-access scaffold**

`libs/finance/expense/data-access/tsconfig.json`:
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
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/config/tsconfig.lib.json" },
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../../shared/i18n/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/finance/expense/data-access/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/expense/data-access",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-expense-data-access.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/expense/data-access/package.json`:
```json
{
  "name": "@bk2/finance-expense-data-access",
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
    "@bk2/shared-i18n": "*",
    "@bk2/finance-expense-util": "*"
  }
}
```

`libs/finance/expense/data-access/project.json`:
```json
{
  "name": "finance-expense-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/expense/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/expense/data-access",
        "main": "libs/finance/expense/data-access/src/index.ts",
        "tsConfig": "libs/finance/expense/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/expense/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/expense/data-access/src/lib/scope.ts`:
```ts
export const PFX = '@finance/expense/data-access.';
```

`libs/finance/expense/data-access/src/index.ts`:
```ts
export * from './lib/expense.service';
export * from './lib/expense-document.service';
```

- [ ] **Step 2.2: Create util scaffold**

`libs/finance/expense/util/tsconfig.json`:
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
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../../subject/address/util/tsconfig.lib.json" }
  ]
}
```

`libs/finance/expense/util/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/expense/util",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-expense-util.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/expense/util/package.json`:
```json
{
  "name": "@bk2/finance-expense-util",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/subject-address-util": "*"
  }
}
```

`libs/finance/expense/util/project.json`:
```json
{
  "name": "finance-expense-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/expense/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/expense/util",
        "main": "libs/finance/expense/util/src/index.ts",
        "tsConfig": "libs/finance/expense/util/tsconfig.lib.json",
        "assets": ["libs/finance/expense/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/libs/finance/expense/util"],
      "options": { "reportsDirectory": "../../../coverage/libs/finance/expense/util" }
    }
  }
}
```

`libs/finance/expense/util/src/lib/scope.ts`:
```ts
export const PFX = '@finance/expense/util.';
```

`libs/finance/expense/util/src/index.ts`:
```ts
export * from './lib/expense.util';
export * from './lib/expense.validations';
```

- [ ] **Step 2.3: Create ui scaffold**

`libs/finance/expense/ui/tsconfig.json`:
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
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../../shared/ui/tsconfig.lib.json" },
    { "path": "../../../shared/pipes/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" }
  ]
}
```

`libs/finance/expense/ui/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/expense/ui",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-expense-ui.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/expense/ui/package.json`:
```json
{
  "name": "@bk2/finance-expense-ui",
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
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/finance-expense-util": "*"
  }
}
```

`libs/finance/expense/ui/project.json`:
```json
{
  "name": "finance-expense-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/expense/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/expense/ui",
        "main": "libs/finance/expense/ui/src/index.ts",
        "tsConfig": "libs/finance/expense/ui/tsconfig.lib.json",
        "assets": ["libs/finance/expense/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/expense/ui/src/lib/scope.ts`:
```ts
export const PFX = '@finance/expense/ui.';
```

`libs/finance/expense/ui/src/index.ts`:
```ts
export * from './lib/expense.form';
```

- [ ] **Step 2.4: Create feature scaffold**

`libs/finance/expense/feature/tsconfig.json`:
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
    { "path": "../../../shared/models/tsconfig.lib.json" },
    { "path": "../../../shared/config/tsconfig.lib.json" },
    { "path": "../../../shared/constants/tsconfig.lib.json" },
    { "path": "../../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../../shared/feature/tsconfig.lib.json" },
    { "path": "../../../shared/pipes/tsconfig.lib.json" },
    { "path": "../../../subject/address/data-access/tsconfig.lib.json" },
    { "path": "../../../avatar/data-access/tsconfig.lib.json" },
    { "path": "../../../document/data-access/tsconfig.lib.json" },
    { "path": "../../accounting/data-access/tsconfig.lib.json" },
    { "path": "../../booking/data-access/tsconfig.lib.json" },
    { "path": "../data-access/tsconfig.lib.json" },
    { "path": "../util/tsconfig.lib.json" },
    { "path": "../ui/tsconfig.lib.json" }
  ]
}
```

`libs/finance/expense/feature/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/expense/feature",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-expense-feature.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/expense/feature/package.json`:
```json
{
  "name": "@bk2/finance-expense-feature",
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
    "@bk2/shared-i18n": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/subject-address-data-access": "*",
    "@bk2/avatar-data-access": "*",
    "@bk2/document-data-access": "*",
    "@bk2/finance-accounting-data-access": "*",
    "@bk2/finance-booking-data-access": "*",
    "@bk2/finance-expense-data-access": "*",
    "@bk2/finance-expense-util": "*",
    "@bk2/finance-expense-ui": "*"
  }
}
```

`libs/finance/expense/feature/project.json`:
```json
{
  "name": "finance-expense-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/expense/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/expense/feature",
        "main": "libs/finance/expense/feature/src/index.ts",
        "tsConfig": "libs/finance/expense/feature/tsconfig.lib.json",
        "assets": ["libs/finance/expense/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/expense/feature/src/lib/scope.ts`:
```ts
export const PFX = '@finance/expense/feature.';
```

`libs/finance/expense/feature/src/index.ts`:
```ts
export * from './lib/expense.store';
export * from './lib/expense-new.modal';
export * from './lib/expense-list';
export * from './lib/expense-detail.modal';
```

- [ ] **Step 2.5: Add path aliases to tsconfig.base.json**

In the `paths` object of `tsconfig.base.json`, add the four new aliases (alphabetical order near other `finance-` entries):
```json
"@bk2/finance-expense-data-access": ["libs/finance/expense/data-access/src/index.ts"],
"@bk2/finance-expense-feature": ["libs/finance/expense/feature/src/index.ts"],
"@bk2/finance-expense-ui": ["libs/finance/expense/ui/src/index.ts"],
"@bk2/finance-expense-util": ["libs/finance/expense/util/src/index.ts"],
```

- [ ] **Step 2.6: Add i18n asset entries to apps/scs-app/project.json**

In the `assets` array add (after existing finance entries):
```json
{
  "glob": "*.json",
  "input": "libs/finance/expense/data-access/src/i18n",
  "output": "./assets/i18n/finance/expense/data-access"
},
{
  "glob": "*.json",
  "input": "libs/finance/expense/feature/src/i18n",
  "output": "./assets/i18n/finance/expense/feature"
}
```

- [ ] **Step 2.7: Commit scaffold**

```bash
git add libs/finance/expense \
        tsconfig.base.json \
        apps/scs-app/project.json
git commit -m "feat(expense): scaffold four-layer library infrastructure for finance/expense"
```

---

## Task 3: Add listBankAccounts to AddressService

**Files:**
- Modify: `libs/subject/address/data-access/src/lib/address.service.ts`

- [ ] **Step 3.1: Add the method**

At the end of `AddressService`, before the closing `}`, add:

```ts
  public listBankAccounts(parentKey: string): Observable<AddressModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'addressChannel', operator: '==', value: 'bankaccount' });
    query.push({ key: 'parentKey', operator: '==', value: parentKey });
    return this.firestoreService.searchData<AddressModel>(AddressCollection, query, 'isFavorite', 'desc');
  }
```

- [ ] **Step 3.2: Commit**

```bash
git add libs/subject/address/data-access/src/lib/address.service.ts
git commit -m "feat(address): add listBankAccounts query method"
```

---

## Task 4: Implement ExpenseService and ExpenseDocumentService

**Files:**
- Create: `libs/finance/expense/data-access/src/lib/expense.service.ts`
- Create: `libs/finance/expense/data-access/src/lib/expense-document.service.ts`
- Create: `libs/finance/expense/data-access/src/i18n/de.json`

- [ ] **Step 4.1: Create expense.service.ts**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ExpenseCollection, ExpenseModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  public async create(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async update(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.updateModel<ExpenseModel>(
      ExpenseCollection, expense, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(expense: ExpenseModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public read(key: string): Observable<ExpenseModel | undefined> {
    return this.firestoreService.readModel<ExpenseModel>(ExpenseCollection, key);
  }

  public listAll(orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    return this.firestoreService.searchData<ExpenseModel>(
      ExpenseCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public listForUser(userId: string, orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'userId', operator: '==', value: userId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }

  public listForTenant(accountingTenantId: string, orderBy = 'bkey', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'accountingTenantId', operator: '==', value: accountingTenantId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }
}
```

- [ ] **Step 4.2: Create expense-document.service.ts**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ExpenseDocumentCollection, ExpenseDocumentModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ExpenseDocumentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  PFX + 'expenseDoc.create.conf',
    create_error: PFX + 'expenseDoc.create.error',
    delete_conf:  PFX + 'expenseDoc.delete.conf',
    delete_error: PFX + 'expenseDoc.delete.error',
  });

  public async create(doc: ExpenseDocumentModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<ExpenseDocumentModel>(
      ExpenseDocumentCollection, doc, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async delete(doc: ExpenseDocumentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ExpenseDocumentModel>(
      ExpenseDocumentCollection, doc, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public listForExpense(expenseKey: string): Observable<ExpenseDocumentModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'expenseKey', operator: '==', value: expenseKey });
    return this.firestoreService.searchData<ExpenseDocumentModel>(ExpenseDocumentCollection, query);
  }
}
```

- [ ] **Step 4.3: Create data-access i18n de.json**

`libs/finance/expense/data-access/src/i18n/de.json`:
```json
{
  "create": {
    "conf": "Auslage wurde gespeichert.",
    "error": "Die Auslage konnte nicht gespeichert werden."
  },
  "update": {
    "conf": "Auslage wurde aktualisiert.",
    "error": "Die Auslage konnte nicht aktualisiert werden."
  },
  "delete": {
    "conf": "Auslage wurde gelöscht.",
    "error": "Die Auslage konnte nicht gelöscht werden."
  },
  "expenseDoc": {
    "create": {
      "conf": "Beleg wurde gespeichert.",
      "error": "Der Beleg konnte nicht gespeichert werden."
    },
    "delete": {
      "conf": "Beleg wurde gelöscht.",
      "error": "Der Beleg konnte nicht gelöscht werden."
    }
  }
}
```

- [ ] **Step 4.4: Commit**

```bash
git add libs/finance/expense/data-access/src/
git commit -m "feat(expense): implement ExpenseService and ExpenseDocumentService"
```

---

## Task 5: Implement expense util (factory functions + vest validations)

**Files:**
- Create: `libs/finance/expense/util/src/lib/expense.util.ts`
- Create: `libs/finance/expense/util/src/lib/expense.util.spec.ts`
- Create: `libs/finance/expense/util/src/lib/expense.validations.ts`

- [ ] **Step 5.1: Write the failing tests first**

`libs/finance/expense/util/src/lib/expense.util.spec.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeIban, chfToCents, centsToCHF, newExpenseModel, newExpenseDocumentModel } from './expense.util';

describe('normalizeIban', () => {
  it('strips whitespace and uppercases', () => {
    expect(normalizeIban('ch67 0070 0110 4044 7417 6')).toBe('CH6700700110404474176');
  });
  it('already normalized iban stays the same', () => {
    expect(normalizeIban('CH6700700110404474176')).toBe('CH6700700110404474176');
  });
});

describe('chfToCents', () => {
  it('converts 25.50 CHF to 2550 cents', () => {
    expect(chfToCents(25.50)).toBe(2550);
  });
  it('rounds half-penny correctly', () => {
    expect(chfToCents(1.005)).toBe(101);
  });
  it('converts 0 to 0', () => {
    expect(chfToCents(0)).toBe(0);
  });
});

describe('centsToCHF', () => {
  it('converts 2550 cents to 25.50', () => {
    expect(centsToCHF(2550)).toBe(25.50);
  });
  it('converts 0 to 0', () => {
    expect(centsToCHF(0)).toBe(0);
  });
});

describe('newExpenseModel', () => {
  it('creates model with correct tenants and userId', () => {
    const m = newExpenseModel('tenant1', 'user1', 'acctTenant1');
    expect(m.tenants).toContain('tenant1');
    expect(m.userId).toBe('user1');
    expect(m.accountingTenantId).toBe('acctTenant1');
    expect(m.status).toBe('draft');
  });
});

describe('newExpenseDocumentModel', () => {
  it('creates model with expenseKey and documentKey', () => {
    const m = newExpenseDocumentModel('tenant1', 'expense1', 'doc1');
    expect(m.expenseKey).toBe('expense1');
    expect(m.documentKey).toBe('doc1');
    expect(m.ocrStatus).toBe('pending');
  });
});
```

- [ ] **Step 5.2: Run tests to confirm they fail**

```bash
pnpm run test finance-expense-util
```

Expected: FAIL (functions not defined yet)

- [ ] **Step 5.3: Implement expense.util.ts**

```ts
import { ExpenseDocumentModel, ExpenseModel } from '@bk2/shared-models';

export const ALLOWED_CURRENCIES = ['CHF', 'EUR', 'USD', 'GBP'] as const;

export function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

export function chfToCents(chf: number): number {
  return Math.round(chf * 100);
}

export function centsToCHF(cents: number): number {
  return cents / 100;
}

export function newExpenseModel(tenantId: string, userId: string, accountingTenantId: string): ExpenseModel {
  const m = new ExpenseModel(tenantId);
  m.userId = userId;
  m.accountingTenantId = accountingTenantId;
  m.status = 'draft';
  return m;
}

export function newExpenseDocumentModel(tenantId: string, expenseKey: string, documentKey: string): ExpenseDocumentModel {
  const m = new ExpenseDocumentModel(tenantId);
  m.expenseKey = expenseKey;
  m.documentKey = documentKey;
  m.ocrStatus = 'pending';
  return m;
}
```

- [ ] **Step 5.4: Implement expense.validations.ts**

```ts
import { enforce, only, staticSuite, test } from 'vest';

import { ibanValidations } from '@bk2/subject-address-util';

import { ALLOWED_CURRENCIES } from './expense.util';

export interface ExpenseFormValue {
  abstract: string;
  amountCHF: number;
  currency: string;
  iban: string;
  category: string;
  costCenterId: string;
  note: string;
}

export const expenseValidations = staticSuite((model: ExpenseFormValue, field?: string) => {
  if (field) only(field);

  test('abstract', '@finance/expense/feature.validation.abstractRequired', () => {
    enforce(model.abstract).isNotEmpty();
  });
  test('abstract', '@finance/expense/feature.validation.abstractMin', () => {
    enforce(model.abstract.length).greaterThanOrEquals(3);
  });
  test('abstract', '@finance/expense/feature.validation.abstractMax', () => {
    enforce(model.abstract.length).lessThanOrEquals(200);
  });

  test('amountCHF', '@finance/expense/feature.validation.amountRequired', () => {
    enforce(model.amountCHF).greaterThan(0);
  });
  test('amountCHF', '@finance/expense/feature.validation.amountMax', () => {
    enforce(model.amountCHF).lessThanOrEquals(9999999.99);
  });

  test('currency', '@finance/expense/feature.validation.currencyRequired', () => {
    enforce(model.currency).isNotEmpty();
  });
  test('currency', '@finance/expense/feature.validation.currencyInvalid', () => {
    enforce(ALLOWED_CURRENCIES as unknown as string[]).isContaining(model.currency);
  });

  ibanValidations('iban', model.iban);
});
```

- [ ] **Step 5.5: Run tests to confirm they pass**

```bash
pnpm run test finance-expense-util
```

Expected: PASS (5 suites)

- [ ] **Step 5.6: Commit**

```bash
git add libs/finance/expense/util/src/
git commit -m "feat(expense): implement expense util (factory functions, normalizeIban, vest validations)"
```

---

## Task 6: Implement ExpenseForm (dumb UI component)

**Files:**
- Create: `libs/finance/expense/ui/src/lib/expense.form.ts`

The form handles the serializable fields via ngx-vest-forms. Files are managed by the parent modal and passed in as a separate `model<File[]>`.

- [ ] **Step 6.1: Create expense.form.ts**

```ts
import { Component, Signal, computed, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel,
  IonList, IonNote, IonRow, IonSelect, IonSelectOption, IonTextarea,
} from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { formatIban, IbanFormat } from '@bk2/shared-util-angular';

import { ALLOWED_CURRENCIES, ExpenseFormValue, expenseValidations } from '@bk2/finance-expense-util';

export interface ExpenseFormI18n {
  abstract_label: Signal<string>;
  amount_label: Signal<string>;
  currency_label: Signal<string>;
  iban_label: Signal<string>;
  iban_new: Signal<string>;
  category_label: Signal<string>;
  costcenter_label: Signal<string>;
  note_label: Signal<string>;
  belege_label: Signal<string>;
  belege_pick: Signal<string>;
  belege_photo: Signal<string>;
}

@Component({
  selector: 'bk-expense-form',
  standalone: true,
  imports: [
    FormsModule,
    vestForms,
    TextInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote,
    IonSelect, IonSelectOption, IonTextarea, IonList,
    IonButton, IonIcon,
    SvgIconPipe,
  ],
  template: `
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <bk-text-input [i18n]="abstractI18n()" [value]="abstract()"
              (valueChange)="onFieldChange('abstract', $event)" [autofocus]="true" />
            <bk-error-note [errors]="abstractErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="8">
            <bk-text-input [i18n]="amountI18n()" [value]="amountCHFStr()"
              (valueChange)="onAmountChange($event)" />
            <bk-error-note [errors]="amountErrors()" />
          </ion-col>
          <ion-col size="4">
            <ion-item>
              <ion-label>{{ i18n().currency_label() }}</ion-label>
              <ion-select [(ngModel)]="currencyModel" name="currency">
                @for (c of currencies; track c) {
                  <ion-select-option [value]="c">{{ c }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().iban_label() }}</ion-label>
              <ion-select [(ngModel)]="ibanSelectModel" name="ibanSelect">
                @for (addr of ibans(); track addr.bkey) {
                  <ion-select-option [value]="addr.iban">
                    {{ addr.isFavorite ? '★ ' : '' }}{{ formatIban(addr.iban) }}
                  </ion-select-option>
                }
                <ion-select-option value="__new__">{{ i18n().iban_new() }}</ion-select-option>
              </ion-select>
            </ion-item>
            @if (showIbanInput()) {
              <bk-text-input [i18n]="ibanI18n()" [value]="iban()"
                (valueChange)="onFieldChange('iban', $event)" />
              <bk-error-note [errors]="ibanErrors()" />
            }
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().belege_label() }}</ion-label>
            </ion-item>
            <ion-list>
              @for (f of files(); track f.name; let i = $index) {
                <ion-item>
                  <ion-label>{{ f.name }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="removeFile(i)">
                    <ion-icon src="{{ 'close' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
            <ion-row>
              <ion-col>
                <ion-button fill="outline" (click)="pickFiles.emit()">
                  {{ i18n().belege_pick() }}
                </ion-button>
              </ion-col>
              <ion-col>
                <ion-button fill="outline" (click)="takePhoto.emit()">
                  {{ i18n().belege_photo() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().note_label() }}</ion-label>
              <ion-textarea [(ngModel)]="noteModel" name="note" [autoGrow]="true" />
            </ion-item>
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
  `,
})
export class ExpenseForm {
  public readonly i18n = input.required<ExpenseFormI18n>();
  public readonly ibans = input<AddressModel[]>([]);
  public formData = model.required<ExpenseFormValue>();
  public files = model<File[]>([]);

  public dirty = output<boolean>();
  public valid = output<boolean>();
  public pickFiles = output<void>();
  public takePhoto = output<void>();

  protected readonly suite = expenseValidations;
  protected readonly currencies = ALLOWED_CURRENCIES;
  protected readonly formatIban = (iban: string) => formatIban(iban, IbanFormat.Friendly);

  private readonly result = computed(() => expenseValidations(this.formData()));
  protected readonly abstractErrors = computed(() => this.result().getErrors('abstract'));
  protected readonly amountErrors   = computed(() => this.result().getErrors('amountCHF'));
  protected readonly ibanErrors     = computed(() => this.result().getErrors('iban'));

  protected abstract    = linkedSignal(() => this.formData().abstract);
  protected amountCHF   = linkedSignal(() => this.formData().amountCHF);
  protected currency    = linkedSignal(() => this.formData().currency);
  protected iban        = linkedSignal(() => this.formData().iban);
  protected note        = linkedSignal(() => this.formData().note);

  protected amountCHFStr = computed(() => this.amountCHF() > 0 ? String(this.amountCHF()) : '');
  protected showIbanInput = computed(() => this.iban() !== '' && !this.ibans().some(a => a.iban === this.iban()));

  private get ibanSelectModel(): string {
    const saved = this.ibans().find(a => a.iban === this.iban());
    return saved ? this.iban() : (this.iban() ? '__new__' : '');
  }
  private set ibanSelectModel(v: string) {
    if (v === '__new__') {
      this.onFieldChange('iban', '');
    } else {
      this.onFieldChange('iban', v);
    }
  }

  private get currencyModel(): string { return this.currency(); }
  private set currencyModel(v: string) { this.onFieldChange('currency', v); }

  private get noteModel(): string { return this.note(); }
  private set noteModel(v: string) { this.onFieldChange('note', v); }

  protected abstractI18n = computed(() => ({ name: 'abstract', label: this.i18n().abstract_label() }) as TextInputI18n);
  protected amountI18n   = computed(() => ({ name: 'amountCHF', label: this.i18n().amount_label() }) as TextInputI18n);
  protected ibanI18n     = computed(() => ({ name: 'iban', label: this.i18n().iban_label() }) as TextInputI18n);

  protected onAmountChange(v: string): void {
    const parsed = parseFloat(v);
    this.onFieldChange('amountCHF', isNaN(parsed) ? 0 : parsed);
  }

  protected onFieldChange(field: string, value: unknown): void {
    this.dirty.emit(true);
    this.formData.update(d => ({ ...d, [field]: value }));
  }

  protected onFormChange(value: ExpenseFormValue): void {
    this.formData.update(d => ({ ...d, ...value }));
  }

  protected removeFile(index: number): void {
    this.files.update(fs => fs.filter((_, i) => i !== index));
  }
}
```

- [ ] **Step 6.2: Commit**

```bash
git add libs/finance/expense/ui/src/
git commit -m "feat(expense): implement ExpenseForm dumb UI component"
```

---

## Task 7: Implement ExpenseStore with submit saga

**Files:**
- Create: `libs/finance/expense/feature/src/lib/expense.store.ts`

The store manages the submission saga. Steps run sequentially; failures compensate in reverse. `submitStep` signal drives the modal's progress UI.

- [ ] **Step 7.1: Create expense.store.ts**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AddressModel, BookingLineModel, BookingModel, ExpenseModel } from '@bk2/shared-models';
import { getTodayStr } from '@bk2/shared-util-core';
import { parseIban } from '@bk2/shared-util-angular';

import { AddressService } from '@bk2/subject-address-data-access';
import { UploadService } from '@bk2/avatar-data-access';
import { DocumentService } from '@bk2/document-data-access';
import { AccountingConfigService } from '@bk2/finance-accounting-data-access';
import { BookingService, BookingLineService } from '@bk2/finance-booking-data-access';

import { ExpenseService } from '@bk2/finance-expense-data-access';
import { ExpenseDocumentService } from '@bk2/finance-expense-data-access';
import { chfToCents, ExpenseFormValue, newExpenseDocumentModel, newExpenseModel, normalizeIban } from '@bk2/finance-expense-util';

import { ExpenseDetailModal } from './expense-detail.modal';
import { PFX } from './scope';

export type SubmitStep = 'idle' | 'iban' | 'upload' | 'saving' | 'booking' | 'done' | 'error';

const EXPENSE_I18N_KEYS = {
  list_title:    PFX + 'list.title',
  new_title:     PFX + 'new.title',
  detail_title:  PFX + 'detail.title',
  submit_iban:   PFX + 'submit.iban',
  submit_upload: PFX + 'submit.upload',
  submit_saving: PFX + 'submit.saving',
  submit_booking:PFX + 'submit.booking',
  submit_done:   PFX + 'submit.done',
  submit_error:  PFX + 'submit.error',
  status_draft:      PFX + 'status.draft',
  status_processing: PFX + 'status.processing',
  status_validated:  PFX + 'status.validated',
  status_error:      PFX + 'status.error',
  status_posted:     PFX + 'status.posted',
} satisfies Record<string, string>;

export type ExpenseI18n = { [K in keyof typeof EXPENSE_I18N_KEYS]: Signal<string> };

export interface ExpenseState {
  submitStep: SubmitStep;
  submitError: string;
}

export const ExpenseStore = signalStore(
  withState<ExpenseState>({ submitStep: 'idle', submitError: '' }),
  withProps(() => ({
    env:                  inject(ENV),
    appStore:             inject(AppStore),
    modalController:      inject(ModalController),
    addressService:       inject(AddressService),
    uploadService:        inject(UploadService),
    documentService:      inject(DocumentService),
    accountingConfigService: inject(AccountingConfigService),
    bookingService:       inject(BookingService),
    bookingLineService:   inject(BookingLineService),
    expenseService:       inject(ExpenseService),
    expenseDocService:    inject(ExpenseDocumentService),
    i18nService:          inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(EXPENSE_I18N_KEYS),
    expensesResource: rxResource({
      stream: () => {
        const user = store.appStore.currentUser();
        if (!user) return store.expenseService.listForUser('');
        const isTreasurer = user.roles?.includes('privileged') || user.roles?.includes('admin');
        return isTreasurer
          ? store.expenseService.listAll()
          : store.expenseService.listForUser(user.bkey);
      },
    }),
  })),
  withComputed(store => ({
    expenses:     computed(() => store.expensesResource.value() ?? []),
    isLoading:    computed(() => store.expensesResource.isLoading()),
    currentUser:  computed(() => store.appStore.currentUser()),
    tenantId:     computed(() => store.env.tenantId),
    canSubmit:    computed(() => store.submitStep() === 'idle' || store.submitStep() === 'error'),
    submitLabel:  computed(() => {
      const step = store.submitStep();
      const i = store.i18n;
      switch (step) {
        case 'iban':    return i.submit_iban();
        case 'upload':  return i.submit_upload();
        case 'saving':  return i.submit_saving();
        case 'booking': return i.submit_booking();
        case 'done':    return i.submit_done();
        case 'error':   return i.submit_error();
        default:        return '';
      }
    }),
  })),
  withMethods(store => ({
    async openDetail(expense: ExpenseModel): Promise<void> {
      const modal = await store.modalController.create({
        component: ExpenseDetailModal,
        componentProps: { expense },
      });
      await modal.present();
    },

    async submit(formValue: ExpenseFormValue, files: File[]): Promise<void> {
      if (files.length === 0) return;
      const currentUser = store.currentUser();
      if (!currentUser) return;

      const tenantId   = store.tenantId();
      const userId     = currentUser.bkey;
      const accountingTenantId = tenantId;

      const accountingConfig = await firstValueFrom(
        store.accountingConfigService.read(accountingTenantId)
      );
      if (!accountingConfig) {
        patchState(store, { submitStep: 'error', submitError: 'No accounting config found' });
        return;
      }

      let newAddressKey: string | undefined;
      const documentKeys: string[] = [];
      let expenseKey: string | undefined;

      // Step 1 — IBAN
      patchState(store, { submitStep: 'iban' });
      try {
        const normalizedIban = normalizeIban(formValue.iban);
        const existingIbans = await firstValueFrom(store.addressService.listBankAccounts(userId));
        const exists = existingIbans.some(a => parseIban(a.iban) === parseIban(normalizedIban));
        if (!exists) {
          const addr = new AddressModel(tenantId);
          addr.addressChannel = 'bankaccount';
          addr.iban = normalizedIban;
          addr.parentKey = userId;
          addr.isFavorite = existingIbans.length === 0;
          addr.tenants = [tenantId];
          newAddressKey = await store.addressService.create(addr, currentUser);
        }
      } catch {
        patchState(store, { submitStep: 'error', submitError: 'IBAN step failed' });
        return;
      }

      // Step 2 — Upload documents
      patchState(store, { submitStep: 'upload' });
      try {
        for (const file of files) {
          const storagePath = `tenant/${tenantId}/expense/${file.name}`;
          const downloadUrl = await store.uploadService.uploadFile(file, storagePath, file.name);
          if (!downloadUrl) throw new Error('Upload returned no URL for ' + file.name);
          const docKey = await store.uploadService.createAndSaveDocument(file, tenantId, storagePath, downloadUrl, currentUser);
          if (!docKey) throw new Error('DocumentModel creation failed for ' + file.name);
          documentKeys.push(docKey);
        }
      } catch {
        await compensateDocuments(store, documentKeys, currentUser);
        if (newAddressKey) await compensateAddress(store, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Upload step failed' });
        return;
      }

      // Step 3 — Persist expense + expense-document records
      patchState(store, { submitStep: 'saving' });
      try {
        const expense = newExpenseModel(tenantId, userId, accountingTenantId);
        expense.abstract    = formValue.abstract;
        expense.amountTotal = chfToCents(formValue.amountCHF);
        expense.currency    = formValue.currency;
        expense.iban        = normalizeIban(formValue.iban);
        expense.category    = formValue.category;
        expense.costCenterId = formValue.costCenterId;
        expense.note        = formValue.note;
        expense.status      = 'draft';

        expenseKey = await store.expenseService.create(expense, currentUser);
        if (!expenseKey) throw new Error('ExpenseModel creation failed');

        for (const docKey of documentKeys) {
          const expDoc = newExpenseDocumentModel(tenantId, expenseKey, docKey);
          await store.expenseDocService.create(expDoc, currentUser);
        }
      } catch {
        await compensateDocuments(store, documentKeys, currentUser);
        if (newAddressKey) await compensateAddress(store, newAddressKey, currentUser);
        patchState(store, { submitStep: 'error', submitError: 'Save step failed' });
        return;
      }

      // Step 4 — Create booking
      patchState(store, { submitStep: 'booking' });
      try {
        const debitAccountKey  = formValue.category || accountingConfig.defaultExpenseAccountKey;
        const creditAccountKey = accountingConfig.employeePayablesAccountKey;
        const amountCents      = chfToCents(formValue.amountCHF);
        const userName         = `${currentUser.firstName} ${currentUser.lastName}`.trim();

        const booking = new BookingModel(tenantId, accountingTenantId);
        booking.title = `${formValue.abstract} – Auslage ${userName}`;
        booking.date  = getTodayStr();

        const lineDebit = new BookingLineModel(tenantId, accountingTenantId);
        lineDebit.accountKey   = debitAccountKey;
        lineDebit.debitAmount  = { amount: amountCents, currency: formValue.currency as 'CHF', periodicity: 'one-time' };
        lineDebit.bookingKey   = expenseKey!;

        const lineCredit = new BookingLineModel(tenantId, accountingTenantId);
        lineCredit.accountKey    = creditAccountKey;
        lineCredit.creditAmount  = { amount: amountCents, currency: formValue.currency as 'CHF', periodicity: 'one-time' };
        lineCredit.bookingKey    = expenseKey!;

        const bookingKey = await store.bookingService.create(booking, [lineDebit, lineCredit], currentUser);
        if (!bookingKey) throw new Error('Booking creation failed');

        const savedExpense = await firstValueFrom(store.expenseService.read(expenseKey!));
        if (savedExpense) {
          savedExpense.bookingKey = bookingKey;
          savedExpense.status = 'posted';
          await store.expenseService.update(savedExpense, currentUser);
        }
      } catch {
        if (expenseKey) {
          const savedExpense = await firstValueFrom(store.expenseService.read(expenseKey));
          if (savedExpense) {
            savedExpense.status = 'error';
            await store.expenseService.update(savedExpense, currentUser);
          }
        }
        patchState(store, { submitStep: 'error', submitError: 'Booking step failed' });
        return;
      }

      patchState(store, { submitStep: 'done' });
      store.expensesResource.reload();
    },

    resetSubmit(): void {
      patchState(store, { submitStep: 'idle', submitError: '' });
    },
  }))
);

async function compensateDocuments(store: typeof ExpenseStore.prototype, documentKeys: string[], currentUser: unknown): Promise<void> {
  for (const key of documentKeys) {
    try {
      const doc = await firstValueFrom((store as any).documentService.read(key));
      if (doc) await (store as any).documentService.delete(doc, currentUser);
    } catch { /* best-effort */ }
  }
}

async function compensateAddress(store: typeof ExpenseStore.prototype, addressKey: string, currentUser: unknown): Promise<void> {
  try {
    const addr = await firstValueFrom((store as any).addressService.read(addressKey));
    if (addr) await (store as any).addressService.delete(addr, currentUser);
  } catch { /* best-effort */ }
}
```

> **Note on compensation helpers:** The helpers are standalone functions referencing private service fields via `any`. If strict typing is preferred, move them inside `withMethods` as private-style nested functions.

- [ ] **Step 7.2: Commit**

```bash
git add libs/finance/expense/feature/src/lib/expense.store.ts
git commit -m "feat(expense): implement ExpenseStore with sequential submit saga and rollback"
```

---

## Task 8: Implement ExpenseNewModal

**Files:**
- Create: `libs/finance/expense/feature/src/lib/expense-new.modal.ts`

- [ ] **Step 8.1: Create expense-new.modal.ts**

```ts
import { Component, inject, model, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, IonButton, IonButtons, IonContent, IonFooter,
  IonHeader, IonTitle, IonToolbar, ToastController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';

import { UploadService } from '@bk2/avatar-data-access';
import { AddressService } from '@bk2/subject-address-data-access';

import { ExpenseFormValue } from '@bk2/finance-expense-util';
import { ExpenseForm, ExpenseFormI18n } from '@bk2/finance-expense-ui';
import { ExpenseStore, SubmitStep } from './expense.store';
import { PFX } from './scope';

const EXPENSE_MIMETYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

const MODAL_I18N_KEYS = {
  title:          PFX + 'new.title',
  cancel:         PFX + 'new.cancel',
  submit:         PFX + 'new.submit',
  abstract_label: PFX + 'field.abstract',
  amount_label:   PFX + 'field.amount',
  currency_label: PFX + 'field.currency',
  iban_label:     PFX + 'field.iban',
  iban_new:       PFX + 'field.iban.new',
  category_label: PFX + 'field.category',
  costcenter_label: PFX + 'field.costcenter',
  note_label:     PFX + 'field.note',
  belege_label:   PFX + 'field.belege',
  belege_pick:    PFX + 'field.belege.pick',
  belege_photo:   PFX + 'field.belege.photo',
  toast_success:  PFX + 'submit.done',
  toast_error:    PFX + 'submit.error',
} satisfies Record<string, string>;

@Component({
  selector: 'bk-expense-new-modal',
  standalone: true,
  imports: [
    ExpenseForm,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonFooter,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <bk-expense-form
        [i18n]="formI18n"
        [ibans]="ibans()"
        [(formData)]="formValue"
        [(files)]="files"
        (pickFiles)="onPickFiles()"
        (takePhoto)="onTakePhoto()"
        (validChange)="isValid = $event"
      />
    </ion-content>
    <ion-footer>
      @if (store.submitStep() !== 'idle') {
        <p style="text-align:center; padding: 8px;">{{ store.submitLabel() }}</p>
      }
      <ion-button expand="block"
        [disabled]="!isValid || files().length === 0 || !store.canSubmit()"
        (click)="onSubmit()">
        {{ i18n.submit() }}
      </ion-button>
    </ion-footer>
  `,
})
export class ExpenseNewModal {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly uploadService = inject(UploadService);
  private readonly addressService = inject(AddressService);
  private readonly appStore = inject(AppStore);

  private readonly i18nService = inject(I18nService);
  protected readonly i18n = this.i18nService.translateAll(MODAL_I18N_KEYS);

  protected formValue = model<ExpenseFormValue>({
    abstract: '', amountCHF: 0, currency: 'CHF', iban: '', category: '', costCenterId: '', note: '',
  });
  protected files = model<File[]>([]);
  protected isValid = false;

  private readonly ibansResource = rxResource({
    stream: () => {
      const user = this.appStore.currentUser();
      return user ? this.addressService.listBankAccounts(user.bkey) : this.addressService.listBankAccounts('');
    },
  });
  protected ibans = () => this.ibansResource.value() ?? [];

  protected readonly formI18n: ExpenseFormI18n = {
    abstract_label:   this.i18n.abstract_label,
    amount_label:     this.i18n.amount_label,
    currency_label:   this.i18n.currency_label,
    iban_label:       this.i18n.iban_label,
    iban_new:         this.i18n.iban_new,
    category_label:   this.i18n.category_label,
    costcenter_label: this.i18n.costcenter_label,
    note_label:       this.i18n.note_label,
    belege_label:     this.i18n.belege_label,
    belege_pick:      this.i18n.belege_pick,
    belege_photo:     this.i18n.belege_photo,
  };

  protected async onPickFiles(): Promise<void> {
    const picked = await this.uploadService.pickMultipleFiles(EXPENSE_MIMETYPES);
    if (picked.length > 0) {
      this.files.update(fs => [...fs, ...picked].slice(0, 10));
    }
  }

  protected async onTakePhoto(): Promise<void> {
    // Camera returns a Photo; convert to File for consistency
    const photo = await this.uploadService.takePhoto();
    if (photo.webPath) {
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      this.files.update(fs => [...fs, file].slice(0, 10));
    }
  }

  protected async onSubmit(): Promise<void> {
    this.store.resetSubmit();
    await this.store.submit(this.formValue(), this.files());

    if (this.store.submitStep() === 'done') {
      const toast = await this.toastController.create({
        message: this.i18n.toast_success(),
        duration: 3000,
        color: 'success',
      });
      await toast.present();
      await this.modalController.dismiss(null, 'confirm');
    } else if (this.store.submitStep() === 'error') {
      const toast = await this.toastController.create({
        message: this.i18n.toast_error(),
        duration: 4000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 8.2: Commit**

```bash
git add libs/finance/expense/feature/src/lib/expense-new.modal.ts
git commit -m "feat(expense): implement ExpenseNewModal with saga progress display"
```

---

## Task 9: Implement ExpenseList page

**Files:**
- Create: `libs/finance/expense/feature/src/lib/expense-list.ts`

- [ ] **Step 9.1: Create expense-list.ts**

```ts
import { Component, inject } from '@angular/core';
import { ModalController, IonButton, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { centsToCHF } from '@bk2/finance-expense-util';
import { ExpenseNewModal } from './expense-new.modal';
import { ExpenseStore } from './expense.store';

@Component({
  selector: 'bk-expense-list',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel,
    IonFab, IonFabButton, IonIcon,
    SvgIconPipe,
  ],
  providers: [ExpenseStore],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (store.isLoading()) {
        <p style="text-align:center">…</p>
      } @else if (store.expenses().length === 0) {
        <p style="text-align:center; padding:16px;">Keine Auslagen gefunden</p>
      } @else {
        <ion-list>
          @for (expense of store.expenses(); track expense.bkey) {
            <ion-item (click)="store.openDetail(expense)">
              <ion-label>
                <h3>{{ expense.abstract }}</h3>
                <p>{{ toCHF(expense.amountTotal) }} {{ expense.currency }} · {{ expense.status }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button (click)="openNew()">
        <ion-icon src="{{ 'add' | svgIcon }}" />
      </ion-fab-button>
    </ion-fab>
  `,
})
export class ExpenseList {
  protected readonly store = inject(ExpenseStore);
  private readonly modalController = inject(ModalController);

  protected toCHF = centsToCHF;

  protected async openNew(): Promise<void> {
    const modal = await this.modalController.create({ component: ExpenseNewModal });
    await modal.present();
    const { role } = await modal.onDidDismiss();
    if (role === 'confirm') this.store.expensesResource.reload();
  }
}
```

- [ ] **Step 9.2: Commit**

```bash
git add libs/finance/expense/feature/src/lib/expense-list.ts
git commit -m "feat(expense): implement ExpenseList page component"
```

---

## Task 10: Implement ExpenseDetailModal

**Files:**
- Create: `libs/finance/expense/feature/src/lib/expense-detail.modal.ts`

- [ ] **Step 10.1: Create expense-detail.modal.ts**

```ts
import { Component, inject, input, OnInit } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController, IonBadge, IonButton, IonButtons, IonContent,
  IonHeader, IonItem, IonLabel, IonList, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';

import { ExpenseDocumentModel, ExpenseModel } from '@bk2/shared-models';
import { centsToCHF } from '@bk2/finance-expense-util';

import { ExpenseDocumentService } from '@bk2/finance-expense-data-access';

@Component({
  selector: 'bk-expense-detail-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonList, IonItem, IonLabel, IonBadge,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ expense().abstract }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Schliessen</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-label>
            <h3>Betrag</h3>
            <p>{{ toCHF(expense().amountTotal) }} {{ expense().currency }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>IBAN</h3>
            <p>{{ expense().iban }}</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>Status</h3>
          </ion-label>
          <ion-badge slot="end">{{ expense().status }}</ion-badge>
        </ion-item>
        @if (expense().bookingKey) {
          <ion-item>
            <ion-label>
              <h3>Buchungsnummer</h3>
              <p>{{ expense().bookingKey }}</p>
            </ion-label>
          </ion-item>
        }
        @if (expense().note) {
          <ion-item>
            <ion-label>
              <h3>Notiz</h3>
              <p>{{ expense().note }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>

      @if (docs().length > 0) {
        <ion-list>
          @for (doc of docs(); track doc.bkey) {
            <ion-item>
              <ion-label>Beleg {{ $index + 1 }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class ExpenseDetailModal {
  public readonly expense = input.required<ExpenseModel>();

  private readonly modalController = inject(ModalController);
  private readonly expenseDocService = inject(ExpenseDocumentService);

  protected readonly toCHF = centsToCHF;

  private readonly docsResource = rxResource<ExpenseDocumentModel[], string>({
    request: () => this.expense().bkey,
    stream: (req) => this.expenseDocService.listForExpense(req.request),
  });
  protected docs = () => this.docsResource.value() ?? [];

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 10.2: Commit**

```bash
git add libs/finance/expense/feature/src/lib/expense-detail.modal.ts
git commit -m "feat(expense): implement read-only ExpenseDetailModal"
```

---

## Task 11: Add i18n translation files

**Files:**
- Create: `libs/finance/expense/feature/src/i18n/de.json`

- [ ] **Step 11.1: Create feature de.json**

```json
{
  "list": { "title": "Auslagen" },
  "new": {
    "title": "Neue Auslage",
    "cancel": "Abbrechen",
    "submit": "Einreichen"
  },
  "detail": { "title": "Auslage" },
  "field": {
    "abstract": "Betreff",
    "amount": "Betrag (CHF)",
    "currency": "Währung",
    "iban": "IBAN",
    "iban_new": "+ Neue IBAN",
    "category": "Kategorie",
    "costcenter": "Kostenstelle",
    "note": "Interne Notiz",
    "belege": "Belege",
    "belege_pick": "Datei wählen",
    "belege_photo": "Foto aufnehmen"
  },
  "submit": {
    "iban": "Bankverbindung wird gespeichert…",
    "upload": "Belege werden hochgeladen…",
    "saving": "Auslage wird gespeichert…",
    "booking": "Buchung wird erstellt…",
    "done": "✓ Auslage eingereicht",
    "error": "Fehler — Vorgang wurde zurückgerollt"
  },
  "status": {
    "draft": "Entwurf",
    "processing": "In Bearbeitung",
    "validated": "Validiert",
    "error": "Fehler",
    "posted": "Verbucht"
  },
  "validation": {
    "abstractRequired": "Betreff ist erforderlich.",
    "abstractMin": "Betreff muss mindestens 3 Zeichen lang sein.",
    "abstractMax": "Betreff darf maximal 200 Zeichen lang sein.",
    "amountRequired": "Betrag muss grösser als 0 sein.",
    "amountMax": "Betrag ist zu gross.",
    "currencyRequired": "Währung ist erforderlich.",
    "currencyInvalid": "Ungültige Währung."
  }
}
```

- [ ] **Step 11.2: Commit**

```bash
git add libs/finance/expense/feature/src/i18n/de.json
git commit -m "feat(expense): add German i18n translations for expense feature"
```

---

## Task 12: Add routes to app.routes.ts

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 12.1: Add expense routes**

In `appRoutes`, add the following two routes after the existing finance routes (e.g., after the `invoice` block):

```ts
{
  path: 'expense',
  canActivate: [isAuthenticatedGuard],
  loadComponent: () => import('@bk2/finance-expense-feature').then(m => m.ExpenseList),
},
{
  path: 'expense/:expenseKey',
  canActivate: [isAuthenticatedGuard],
  loadComponent: () => import('@bk2/finance-expense-feature').then(m => m.ExpenseDetailModal),
},
```

> The detail route is included for deep-linking, though the primary entry point is the modal opened from the list.

- [ ] **Step 12.2: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts
git commit -m "feat(expense): add expense list and detail routes to app router"
```

---

## Task 13: Type-check all new layers

- [ ] **Step 13.1: Type-check util**

```bash
npx tsc --noEmit -p libs/finance/expense/util/tsconfig.json
```

Expected: no errors

- [ ] **Step 13.2: Type-check data-access**

```bash
npx tsc --noEmit -p libs/finance/expense/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 13.3: Type-check ui**

```bash
npx tsc --noEmit -p libs/finance/expense/ui/tsconfig.json
```

Expected: no errors

- [ ] **Step 13.4: Type-check feature**

```bash
npx tsc --noEmit -p libs/finance/expense/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 13.5: Run util tests**

```bash
pnpm run test finance-expense-util
```

Expected: PASS

- [ ] **Step 13.6: Final commit (if any type fixes needed)**

```bash
git add -u
git commit -m "fix(expense): resolve type errors found during tsc check"
```

---

## Self-Review: Spec Coverage

| Spec Requirement | Task |
|---|---|
| Replace ExpenseModel with spec-aligned model | Task 1 |
| Add ExpenseDocumentModel (ocrStatus='pending') | Task 1 |
| Extend AccountingConfigModel with expense account keys | Task 1 |
| AddressModel with bankaccount channel — no schema change | Confirmed: uses existing model |
| libs/finance/expense/ four-layer scaffold | Task 2 |
| tsconfig.base.json path aliases | Task 2 |
| ExpenseService CRUD on 'expenses' | Task 4 |
| ExpenseDocumentService CRUD on 'expense-documents' | Task 4 |
| normalizeIban, chfToCents factory functions | Task 5 |
| vest suite: abstract, amount, currency, iban, (files in store) | Task 5 |
| ExpenseForm dumb component with IBAN dropdown + file zone | Task 6 |
| ExpenseStore submit saga (4 steps + rollback) | Task 7 |
| submitStep signal drives progress UX | Task 7 |
| Compensating rollback on failure | Task 7 |
| ExpenseNewModal with progress line and toasts | Task 8 |
| ExpenseList (all vs own based on role) | Task 9 |
| ExpenseDetailModal read-only view | Task 10 |
| i18n keys under @finance/expense/feature.* | Task 11 |
| app routes: /expense and /expense/:key | Task 12 |

**Out of scope confirmed:** OCR, approval workflow, multi-currency, offline, pain.001, duplicate detection.

**Gaps found and handled:**
- `belege` min-1 file validated in store (`canSubmit` + guard in `submit()`) rather than vest (File[] not vest-compatible)
- `ExpenseList` role check: privileged/admin sees all, others see own — implemented via `currentUser.roles?.includes`
- `AccountingStore` not injected directly (ExpenseList is outside AccountingShell); store reads config via `AccountingConfigService.read(tenantId)` directly

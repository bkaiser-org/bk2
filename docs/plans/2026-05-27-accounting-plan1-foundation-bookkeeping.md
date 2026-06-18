# Accounting System — Plan 1: Foundation + Core Bookkeeping

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a working double-entry accounting shell with tenant switching, full journal (bookings + lines), period management, and Bexio CF adaptations — the backbone all later plans build on.

**Architecture:** Two new lib domains: `libs/finance/accounting/` (shell + config store) and `libs/finance/booking/` (bookings, lines, periods). `AccountingStore` is provided at `AccountingShell` level and holds the active `accountingTenantId` from the route param. Every booking write uses an atomic Firestore `WriteBatch` (header + lines together). Bexio sync CFs are adapted to write into the new `bookings` / `booking-lines` collections.

**Tech Stack:** Angular 20 zoneless standalone, NgRx Signal Stores, Ionic/Angular 8.7, rxfire, Firebase Firestore (client SDK + admin SDK for CFs), Vitest, pnpm/Nx.

**Spec source:** `docs/superpowers/specs/2026-05-27-accounting-system-design.md` Phases 1 + 2.

---

## File Structure

```
libs/
  auth/feature/src/lib/
    isAuditor.guard.ts               [new]
  shared/models/src/lib/
    menu-item.model.ts               [modify: add 'auditor' to RoleName]
  shared/util-core/src/lib/
    auth.util.ts                     [modify: add case 'auditor' to hasRole]
  finance/
    accounting/
      data-access/                   [new lib]
        src/lib/accounting-config.service.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
      feature/                       [new lib]
        src/lib/accounting.store.ts
        src/lib/accounting-shell.ts
        src/lib/tenant-selector.ts
        src/lib/read-only-banner.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
    booking/
      data-access/                   [new lib]
        src/lib/booking.service.ts
        src/lib/booking-line.service.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
      feature/                       [new lib]
        src/lib/booking.store.ts
        src/lib/booking-edit.modal.ts
        src/lib/booking-list.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
      ui/                            [new lib]
        src/lib/booking-line-row.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
      util/                          [new lib]
        src/lib/booking.util.ts
        src/lib/booking.util.spec.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
    period/
      data-access/                   [new lib]
        src/lib/period.service.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
      feature/                       [new lib]
        src/lib/period-list.ts
        src/lib/period.store.ts
        src/lib/scope.ts
        src/index.ts
        tsconfig.json / tsconfig.lib.json / package.json / project.json
apps/
  scs-app/src/app/app.routes.ts      [modify: add accounting routes]
  functions/src/bexio/
    shared.ts                        [modify: replace toStoreDate]
    journal.ts                       [modify: write to bookings + booking-lines]
    account.ts                       [modify: add accountingTenantId]
    invoice.ts                       [modify: add accountingTenantId]
    bill.ts                          [modify: add accountingTenantId]
tsconfig.base.json                   [modify: add all Plan 1 path aliases]
```

---

## Tasks

### Task 1: isAuditorGuard + role updates

**Files:**
- Modify: `libs/shared/models/src/lib/menu-item.model.ts`
- Modify: `libs/shared/util-core/src/lib/auth.util.ts`
- Create: `libs/auth/feature/src/lib/isAuditor.guard.ts`
- Modify: `libs/auth/feature/src/index.ts`

- [ ] **Step 1: Add 'auditor' to RoleName in `libs/shared/models/src/lib/menu-item.model.ts`**

Find the line with the `RoleName` type and add `'auditor'`:

```ts
export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin' | 'kiosk' | 'auditor';
```

- [ ] **Step 2: Add `case 'auditor'` to hasRole switch in `libs/shared/util-core/src/lib/auth.util.ts`**

Insert after `case 'kiosk': roles = ['kiosk', 'admin']; break;`:

```ts
case 'auditor': roles = ['auditor', 'admin']; break;
```

- [ ] **Step 3: Create `libs/auth/feature/src/lib/isAuditor.guard.ts`**

```ts
import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@bk2/shared-feature';
import { hasRole } from '@bk2/shared-util-core';

export const isAuditorGuard = (): CanActivateFn => {
  return () => {
    return hasRole('auditor', inject(AppStore).currentUser());
  };
};
```

- [ ] **Step 4: Export from `libs/auth/feature/src/index.ts`**

Add line:

```ts
export * from './lib/isAuditor.guard';
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/shared/util-core/tsconfig.json
npx tsc --noEmit -p libs/auth/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add libs/shared/models/src/lib/menu-item.model.ts \
        libs/shared/util-core/src/lib/auth.util.ts \
        libs/auth/feature/src/lib/isAuditor.guard.ts \
        libs/auth/feature/src/index.ts
git commit -m "feat(auth): add auditor role and isAuditorGuard"
```

---

### Task 2: Accounting libs scaffold + tsconfig.base.json path aliases

**Files:**
- Create: all files under `libs/finance/accounting/data-access/` and `libs/finance/accounting/feature/`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create `libs/finance/accounting/data-access/tsconfig.json`**

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
    {"path": "../../../shared/data-access/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create `libs/finance/accounting/data-access/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/accounting/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-accounting-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 3: Create `libs/finance/accounting/data-access/package.json`**

```json
{
  "name": "@bk2/finance-accounting-data-access",
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
    "@bk2/shared-data-access": "*"
  }
}
```

- [ ] **Step 4: Create `libs/finance/accounting/data-access/project.json`**

```json
{
  "name": "finance-accounting-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/accounting/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/accounting/data-access",
        "main": "libs/finance/accounting/data-access/src/index.ts",
        "tsConfig": "libs/finance/accounting/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/accounting/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

- [ ] **Step 5: Create `libs/finance/accounting/data-access/src/index.ts`**

```ts
// populated in Task 3
```

- [ ] **Step 6: Create `libs/finance/accounting/feature/tsconfig.json`**

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
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../shared/feature/tsconfig.lib.json"},
    {"path": "../data-access/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 7: Create `libs/finance/accounting/feature/tsconfig.lib.json`**

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/accounting/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-accounting-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 8: Create `libs/finance/accounting/feature/package.json`**

```json
{
  "name": "@bk2/finance-accounting-feature",
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
    "@bk2/finance-accounting-data-access": "*"
  }
}
```

- [ ] **Step 9: Create `libs/finance/accounting/feature/project.json`**

```json
{
  "name": "finance-accounting-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/accounting/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/accounting/feature",
        "main": "libs/finance/accounting/feature/src/index.ts",
        "tsConfig": "libs/finance/accounting/feature/tsconfig.lib.json",
        "assets": ["libs/finance/accounting/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

- [ ] **Step 10: Create `libs/finance/accounting/feature/src/index.ts`**

```ts
// populated in Tasks 4 & 5
```

- [ ] **Step 11: Add path aliases to `tsconfig.base.json`**

In the `"paths"` object, add (keep alphabetical order with the existing finance entries):

```json
"@bk2/finance-accounting-data-access": ["libs/finance/accounting/data-access/src/index.ts"],
"@bk2/finance-accounting-feature": ["libs/finance/accounting/feature/src/index.ts"],
```

- [ ] **Step 12: Commit**

```bash
git add libs/finance/accounting/ tsconfig.base.json
git commit -m "chore: scaffold finance-accounting-data-access and feature libs"
```

---

### Task 3: AccountingConfigService

**Files:**
- Create: `libs/finance/accounting/data-access/src/lib/scope.ts`
- Create: `libs/finance/accounting/data-access/src/lib/accounting-config.service.ts`
- Modify: `libs/finance/accounting/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/accounting/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/accounting/data-access.';
```

- [ ] **Step 2: Create `libs/finance/accounting/data-access/src/lib/accounting-config.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { AccountingConfigCollection, AccountingConfigModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AccountingConfigService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(config: AccountingConfigModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(accountingTenantId: string): Observable<AccountingConfigModel | undefined> {
    return findByKey<AccountingConfigModel>(this.listForTenant(), accountingTenantId);
  }

  public async update(config: AccountingConfigModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<AccountingConfigModel>(
      AccountingConfigCollection, config, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(config: AccountingConfigModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<AccountingConfigModel>(
      AccountingConfigCollection, config,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public listForTenant(orderBy = 'bkey', sortOrder = 'asc'): Observable<AccountingConfigModel[]> {
    return this.firestoreService.searchData<AccountingConfigModel>(
      AccountingConfigCollection, getSystemQuery(this.tenantId), orderBy, sortOrder
    );
  }
}
```

- [ ] **Step 3: Update `libs/finance/accounting/data-access/src/index.ts`**

```ts
export * from './lib/accounting-config.service';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/accounting/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add libs/finance/accounting/data-access/src/
git commit -m "feat(accounting): AccountingConfigService CRUD and tenant list"
```

---

### Task 4: AccountingStore

**Files:**
- Create: `libs/finance/accounting/feature/src/lib/scope.ts`
- Create: `libs/finance/accounting/feature/src/lib/accounting.store.ts`

- [ ] **Step 1: Create `libs/finance/accounting/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/accounting/feature.';
```

- [ ] **Step 2: Create `libs/finance/accounting/feature/src/lib/accounting.store.ts`**

```ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { AccountingConfigModel } from '@bk2/shared-models';

import { AccountingConfigService } from '@bk2/finance-accounting-data-access';

import { PFX } from './scope';

const ACCOUNTING_I18N_KEYS = {
  read_only_title: PFX + 'readonly.title',
  read_only_msg:   PFX + 'readonly.msg',
  select_tenant:   PFX + 'select.tenant',
} satisfies Record<string, string>;

export type AccountingI18n = { [K in keyof typeof ACCOUNTING_I18N_KEYS]: import('@angular/core').Signal<string> };

export type AccountingState = { accountingTenantId: string };

export const AccountingStore = signalStore(
  withState<AccountingState>({ accountingTenantId: '' }),
  withProps(() => ({
    configService: inject(AccountingConfigService),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(ACCOUNTING_I18N_KEYS),
    configResource: rxResource({
      request: () => store.accountingTenantId(),
      stream: ({ request: id }) => id ? store.configService.read(id) : of(undefined),
    }),
    tenantsResource: rxResource({
      stream: () => store.configService.listForTenant(),
    }),
  })),
  withComputed(store => ({
    config: computed(() => store.configResource.value()),
    availableTenants: computed(() => store.tenantsResource.value() ?? []),
    isExternallyManaged: computed(() => store.configResource.value()?.accountingBackend !== 'native'),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId: computed(() => store.appStore.tenantId()),
  })),
  withMethods(store => ({
    setTenant(id: string): void {
      patchState(store, { accountingTenantId: id });
    },
    async createConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.create(config, store.currentUser());
      store.tenantsResource.reload();
    },
    async updateConfig(config: AccountingConfigModel): Promise<void> {
      await store.configService.update(config, store.currentUser());
      store.configResource.reload();
    },
  }))
);
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/finance/accounting/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add libs/finance/accounting/feature/src/lib/scope.ts \
        libs/finance/accounting/feature/src/lib/accounting.store.ts
git commit -m "feat(accounting): AccountingStore with reactive config and tenant list"
```

---

### Task 5: ReadOnlyBanner + AccountingShell + TenantSelector

**Files:**
- Create: `libs/finance/accounting/feature/src/lib/read-only-banner.ts`
- Create: `libs/finance/accounting/feature/src/lib/tenant-selector.ts`
- Create: `libs/finance/accounting/feature/src/lib/accounting-shell.ts`
- Modify: `libs/finance/accounting/feature/src/index.ts`

- [ ] **Step 1: Create `libs/finance/accounting/feature/src/lib/read-only-banner.ts`**

```ts
import { Component, inject } from '@angular/core';
import { IonBanner, IonIcon, IonText } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'bk-read-only-banner',
  standalone: true,
  imports: [IonBanner, IonIcon, IonText],
  template: `
    @if (store.isExternallyManaged()) {
      <ion-banner>
        <ion-icon slot="icon" src="{{ 'warning' | svgIcon }}" />
        <ion-text>{{ store.i18n.read_only_title() }}: {{ store.i18n.read_only_msg() }}</ion-text>
      </ion-banner>
    }
  `,
})
export class ReadOnlyBanner {
  protected readonly store = inject(AccountingStore);
}
```

- [ ] **Step 2: Create `libs/finance/accounting/feature/src/lib/tenant-selector.ts`**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonItem, IonLabel, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';

@Component({
  selector: 'bk-tenant-selector',
  standalone: true,
  imports: [IonItem, IonLabel, IonSelect, IonSelectOption],
  template: `
    <ion-item>
      <ion-label>{{ store.i18n.select_tenant() }}</ion-label>
      <ion-select
        [value]="store.accountingTenantId()"
        (ionChange)="onTenantChange($event)">
        @for (tenant of store.availableTenants(); track tenant.bkey) {
          <ion-select-option [value]="tenant.bkey">{{ tenant.bkey }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
  `,
})
export class TenantSelector {
  protected readonly store = inject(AccountingStore);
  private readonly router = inject(Router);

  protected onTenantChange(event: CustomEvent): void {
    const id = event.detail.value as string;
    this.router.navigate(['/accounting', id, 'journal']);
  }
}
```

- [ ] **Step 3: Create `libs/finance/accounting/feature/src/lib/accounting-shell.ts`**

```ts
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonContent, IonHeader, IonPage, IonRouterOutlet, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from './accounting.store';
import { ReadOnlyBanner } from './read-only-banner';
import { TenantSelector } from './tenant-selector';

@Component({
  selector: 'bk-accounting-shell',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonContent, IonRouterOutlet, ReadOnlyBanner, TenantSelector],
  providers: [AccountingStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <bk-tenant-selector />
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <bk-read-only-banner />
        <ion-router-outlet />
      </ion-content>
    </ion-page>
  `,
})
export class AccountingShell {
  protected readonly store = inject(AccountingStore);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(params => {
      const id = params['accountingTenantId'] as string;
      if (id) this.store.setTenant(id);
    });
  }
}
```

- [ ] **Step 4: Update `libs/finance/accounting/feature/src/index.ts`**

```ts
export * from './lib/accounting.store';
export * from './lib/accounting-shell';
export * from './lib/read-only-banner';
export * from './lib/tenant-selector';
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/finance/accounting/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add libs/finance/accounting/feature/src/
git commit -m "feat(accounting): AccountingShell, TenantSelector, ReadOnlyBanner"
```

---

### Task 6: Routes in scs-app

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Add accounting route block to `apps/scs-app/src/app/app.routes.ts`**

Add this block to the `appRoutes` array (after existing finance routes or before the catch-all):

```ts
{
  path: 'accounting/:accountingTenantId',
  canActivate: [isPrivilegedGuard],
  loadComponent: () => import('@bk2/finance-accounting-feature').then(m => m.AccountingShell),
  children: [
    {
      path: 'journal',
      loadComponent: () => import('@bk2/finance-booking-feature').then(m => m.BookingList),
    },
    {
      path: 'periods',
      loadComponent: () => import('@bk2/finance-period-feature').then(m => m.PeriodList),
    },
    {
      path: '',
      pathMatch: 'full',
      redirectTo: 'journal',
    },
  ],
},
```

Ensure `isPrivilegedGuard` is imported from `@bk2/auth-feature` at the top of the file (it already is).

- [ ] **Step 2: Add nav item to scs-app side menu**

In the app's menu configuration (search for `menuItems` or similar in `apps/scs-app/src/`), add a nav item pointing to `/accounting/<firstTenantId>/journal`. If the menu is data-driven from Firestore, add the entry there manually after deploy.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors (imports resolve after libs are built)

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts
git commit -m "feat(routing): add /accounting/:accountingTenantId routes with child journal + periods"
```

---

### Task 7: Booking libs scaffold

**Files:**
- Create: all config files for 6 new libs:
  `booking/data-access`, `booking/feature`, `booking/ui`, `booking/util`,
  `period/data-access`, `period/feature`
- Modify: `tsconfig.base.json` (add 6 new path aliases)

- [ ] **Step 1: Create all 6 libs — scaffold files**

Run these mkdir commands:

```bash
mkdir -p libs/finance/booking/{data-access,feature,ui,util}/src/lib
mkdir -p libs/finance/period/{data-access,feature}/src/lib
```

Create `libs/finance/booking/util/tsconfig.json`:

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

Create `libs/finance/booking/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/booking/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-booking-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

Create `libs/finance/booking/util/package.json`:

```json
{
  "name": "@bk2/finance-booking-util",
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

Create `libs/finance/booking/util/project.json`:

```json
{
  "name": "finance-booking-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/booking/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/booking/util",
        "main": "libs/finance/booking/util/src/index.ts",
        "tsConfig": "libs/finance/booking/util/tsconfig.lib.json",
        "assets": ["libs/finance/booking/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/booking/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

Create `libs/finance/booking/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/booking/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/booking/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

Create `libs/finance/booking/util/src/index.ts`:

```ts
export * from './lib/booking.util';
```

- [ ] **Step 2: Scaffold `booking/data-access`**

Create `libs/finance/booking/data-access/tsconfig.json` (same angularCompilerOptions block as Task 2):

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

`libs/finance/booking/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/booking/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-booking-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/booking/data-access/package.json`:

```json
{
  "name": "@bk2/finance-booking-data-access",
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
    "@bk2/finance-booking-util": "*"
  }
}
```

`libs/finance/booking/data-access/project.json`:

```json
{
  "name": "finance-booking-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/booking/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/booking/data-access",
        "main": "libs/finance/booking/data-access/src/index.ts",
        "tsConfig": "libs/finance/booking/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/booking/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/booking/data-access/src/index.ts`:

```ts
// populated in Task 9
```

- [ ] **Step 3: Scaffold `booking/feature`**

`libs/finance/booking/feature/tsconfig.json`:

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

`libs/finance/booking/feature/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/booking/feature",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-booking-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/booking/feature/package.json`:

```json
{
  "name": "@bk2/finance-booking-feature",
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
    "@bk2/finance-booking-util": "*",
    "@bk2/finance-booking-ui": "*"
  }
}
```

`libs/finance/booking/feature/project.json`:

```json
{
  "name": "finance-booking-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/booking/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/booking/feature",
        "main": "libs/finance/booking/feature/src/index.ts",
        "tsConfig": "libs/finance/booking/feature/tsconfig.lib.json",
        "assets": ["libs/finance/booking/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/booking/feature/src/index.ts`: `// populated in Task 11`

- [ ] **Step 4: Scaffold `booking/ui`**

`libs/finance/booking/ui/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vitest"], "declaration": true },
  "angularCompilerOptions": { "strictTemplates": true, "strictInjectionParameters": true, "fullTemplateTypeCheck": true, "disableTypeScriptVersionCheck": true, "compileNonExportedClasses": true, "skipTemplateCodegen": false },
  "include": ["src/**/*", "**/*.spec.ts", "**/*.test.ts"],
  "exclude": ["dist/**/*"],
  "references": [
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"}
  ]
}
```

`libs/finance/booking/ui/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/booking/ui",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-booking-ui.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/booking/ui/package.json`:

```json
{
  "name": "@bk2/finance-booking-ui",
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

`libs/finance/booking/ui/project.json`:

```json
{
  "name": "finance-booking-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/booking/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/booking/ui",
        "main": "libs/finance/booking/ui/src/index.ts",
        "tsConfig": "libs/finance/booking/ui/tsconfig.lib.json",
        "assets": ["libs/finance/booking/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/booking/ui/src/index.ts`: `// populated later`

- [ ] **Step 5: Scaffold `period/data-access` and `period/feature`**

`libs/finance/period/data-access/tsconfig.json`:

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
    {"path": "../../../shared/data-access/tsconfig.lib.json"}
  ]
}
```

`libs/finance/period/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/period/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-period-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/period/data-access/package.json`:

```json
{
  "name": "@bk2/finance-period-data-access",
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
    "@bk2/shared-data-access": "*"
  }
}
```

`libs/finance/period/data-access/project.json`:

```json
{
  "name": "finance-period-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/period/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/period/data-access",
        "main": "libs/finance/period/data-access/src/index.ts",
        "tsConfig": "libs/finance/period/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/period/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/period/data-access/src/index.ts`: `// populated in Task 10`

`libs/finance/period/feature/tsconfig.json`:

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
    {"path": "../data-access/tsconfig.lib.json"}
  ]
}
```

`libs/finance/period/feature/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/period/feature",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-period-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/period/feature/package.json`:

```json
{
  "name": "@bk2/finance-period-feature",
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
    "@bk2/finance-period-data-access": "*"
  }
}
```

`libs/finance/period/feature/project.json`:

```json
{
  "name": "finance-period-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/period/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/period/feature",
        "main": "libs/finance/period/feature/src/index.ts",
        "tsConfig": "libs/finance/period/feature/tsconfig.lib.json",
        "assets": ["libs/finance/period/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/period/feature/src/index.ts`: `// populated in Task 12`

- [ ] **Step 6: Add 6 path aliases to `tsconfig.base.json`**

In the `"paths"` object:

```json
"@bk2/finance-booking-data-access": ["libs/finance/booking/data-access/src/index.ts"],
"@bk2/finance-booking-feature": ["libs/finance/booking/feature/src/index.ts"],
"@bk2/finance-booking-ui": ["libs/finance/booking/ui/src/index.ts"],
"@bk2/finance-booking-util": ["libs/finance/booking/util/src/index.ts"],
"@bk2/finance-period-data-access": ["libs/finance/period/data-access/src/index.ts"],
"@bk2/finance-period-feature": ["libs/finance/period/feature/src/index.ts"],
```

- [ ] **Step 7: Commit**

```bash
git add libs/finance/booking/ libs/finance/period/ tsconfig.base.json
git commit -m "chore: scaffold booking and period libs (6 new libs)"
```

---

### Task 8: booking.util.ts — balance validation and booking number

**Files:**
- Create: `libs/finance/booking/util/src/lib/booking.util.spec.ts`
- Create: `libs/finance/booking/util/src/lib/booking.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/booking/util/src/lib/booking.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { BookingLineModel } from '@bk2/shared-models';
import { validateBookingBalance, generateBookingNo } from './booking.util';

describe('validateBookingBalance', () => {
  it('returns true when Σ debit equals Σ credit in cents', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(true);
  });

  it('returns false when Σ debit does not equal Σ credit', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount:  9000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(false);
  });

  it('returns true for empty lines (zero = zero)', () => {
    expect(validateBookingBalance([])).toBe(true);
  });

  it('handles multi-line bookings correctly', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 6000, currency: 'CHF', periodicity: 'one-time' } },
      { debitAmount:  { amount: 4000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(true);
  });
});

describe('generateBookingNo', () => {
  it('formats as YYYY-NNNNNN with zero-padding', () => {
    expect(generateBookingNo(2026, 1)).toBe('2026-000001');
    expect(generateBookingNo(2026, 999)).toBe('2026-000999');
    expect(generateBookingNo(2026, 1000000)).toBe('2026-1000000');
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

```bash
pnpm run test finance-booking-util
```

Expected: FAIL — `validateBookingBalance` and `generateBookingNo` are not defined.

- [ ] **Step 3: Implement `libs/finance/booking/util/src/lib/booking.util.ts`**

```ts
import { BookingLineModel } from '@bk2/shared-models';

export function validateBookingBalance(lines: BookingLineModel[]): boolean {
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    debitTotal  += line.debitAmount?.amount  ?? 0;
    creditTotal += line.creditAmount?.amount ?? 0;
  }
  return debitTotal === creditTotal;
}

export function generateBookingNo(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm run test finance-booking-util
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/booking/util/src/
git commit -m "feat(booking-util): validateBookingBalance and generateBookingNo with tests"
```

---

### Task 9: BookingService and BookingLineService

**Files:**
- Create: `libs/finance/booking/data-access/src/lib/scope.ts`
- Create: `libs/finance/booking/data-access/src/lib/booking.service.ts`
- Create: `libs/finance/booking/data-access/src/lib/booking-line.service.ts`
- Modify: `libs/finance/booking/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/booking/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/booking/data-access.';
```

- [ ] **Step 2: Create `libs/finance/booking/data-access/src/lib/booking-line.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { doc, WriteBatch } from 'firebase/firestore';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingLineCollection, BookingLineModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

@Injectable({ providedIn: 'root' })
export class BookingLineService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public listForBooking(bookingKey: string, accountingTenantId: string): Observable<BookingLineModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'bookingKey', operator: '==' as const, value: bookingKey },
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query);
  }

  public addLinesToBatch(lines: BookingLineModel[], batch: WriteBatch): void {
    for (const line of lines) {
      const ref = doc(this.firestoreService.firestore, BookingLineCollection, line.bkey);
      const { bkey: _, ...data } = line as BookingLineModel & { bkey: string };
      batch.set(ref, data, { merge: false });
    }
  }

  public deleteLinesToBatch(lines: BookingLineModel[], batch: WriteBatch): void {
    for (const line of lines) {
      const ref = doc(this.firestoreService.firestore, BookingLineCollection, line.bkey);
      batch.delete(ref);
    }
  }
}
```

- [ ] **Step 3: Create `libs/finance/booking/data-access/src/lib/booking.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { doc } from 'firebase/firestore';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { BookingCollection, BookingLineModel, BookingModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';
import { generateBookingNo, validateBookingBalance } from '@bk2/finance-booking-util';

import { BookingLineService } from './booking-line.service';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly bookingLineService = inject(BookingLineService);
  private readonly tenantId = this.env.tenantId;

  public async create(
    booking: BookingModel,
    lines: BookingLineModel[],
    currentUser?: UserModel
  ): Promise<string | undefined> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.create: booking lines are not balanced');
      return undefined;
    }
    const batch = this.firestoreService.getBatch();
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, booking.bkey || 'new');
    const { bkey: _, ...headerData } = booking as BookingModel & { bkey: string };
    batch.set(headerRef, headerData);
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
    return headerRef.id;
  }

  public read(key: string, accountingTenantId: string): Observable<BookingModel | undefined> {
    return findByKey<BookingModel>(this.list(accountingTenantId), key);
  }

  public async update(booking: BookingModel, lines: BookingLineModel[], currentUser?: UserModel): Promise<void> {
    if (!validateBookingBalance(lines)) {
      console.error('BookingService.update: booking lines are not balanced');
      return;
    }
    const oldLines = await firstValueFrom(this.bookingLineService.listForBooking(booking.bkey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(oldLines, batch);
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, booking.bkey);
    const { bkey: _, ...headerData } = booking as BookingModel & { bkey: string };
    batch.set(headerRef, headerData, { merge: false });
    this.bookingLineService.addLinesToBatch(lines, batch);
    await batch.commit();
  }

  public async delete(booking: BookingModel, currentUser?: UserModel): Promise<void> {
    const lines = await firstValueFrom(this.bookingLineService.listForBooking(booking.bkey, booking.accountingTenantId));
    const batch = this.firestoreService.getBatch();
    this.bookingLineService.deleteLinesToBatch(lines, batch);
    const headerRef = doc(this.firestoreService.firestore, BookingCollection, booking.bkey);
    batch.delete(headerRef);
    await batch.commit();
  }

  public list(accountingTenantId: string, orderBy = 'date', sortOrder = 'desc'): Observable<BookingModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<BookingModel>(BookingCollection, query, orderBy, sortOrder);
  }

  public async nextSequence(year: number, accountingTenantId: string): Promise<number> {
    const bookings = await firstValueFrom(this.list(accountingTenantId));
    const prefix = `${year}-`;
    const maxNo = bookings
      .map(b => b.bookingNo ?? '')
      .filter(no => no.startsWith(prefix))
      .map(no => parseInt(no.replace(prefix, ''), 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0);
    return maxNo + 1;
  }
}
```

- [ ] **Step 4: Update `libs/finance/booking/data-access/src/index.ts`**

```ts
export * from './lib/booking.service';
export * from './lib/booking-line.service';
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/finance/booking/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add libs/finance/booking/data-access/src/
git commit -m "feat(booking): BookingService and BookingLineService with atomic batch writes"
```

---

### Task 10: PeriodService

**Files:**
- Create: `libs/finance/period/data-access/src/lib/scope.ts`
- Create: `libs/finance/period/data-access/src/lib/period.service.ts`
- Modify: `libs/finance/period/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/period/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/period/data-access.';
```

- [ ] **Step 2: Create `libs/finance/period/data-access/src/lib/period.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PeriodCollection, PeriodModel, UserModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat, getFullName, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PeriodService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(period: PeriodModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PeriodModel>(
      PeriodCollection, period,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public async update(period: PeriodModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PeriodModel>(
      PeriodCollection, period, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'year', sortOrder = 'desc'): Observable<PeriodModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PeriodModel>(PeriodCollection, query, orderBy, sortOrder);
  }

  public async lock(period: PeriodModel, currentUser: UserModel): Promise<void> {
    period.isLocked = true;
    period.lockedBy = currentUser.bkey;
    period.lockedAt = convertDateFormatToString(new Date().toISOString().substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
    await this.update(period, currentUser);
  }

  public async unlock(period: PeriodModel, currentUser: UserModel): Promise<void> {
    period.isLocked = false;
    period.lockedBy = '';
    period.lockedAt = '';
    await this.update(period, currentUser);
  }
}
```

- [ ] **Step 3: Update `libs/finance/period/data-access/src/index.ts`**

```ts
export * from './lib/period.service';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/finance/period/data-access/tsconfig.json
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add libs/finance/period/data-access/src/
git commit -m "feat(period): PeriodService with CRUD, lock, and unlock"
```

---

### Task 11: BookingStore + BookingList + BookingEditModal

**Files:**
- Create: `libs/finance/booking/feature/src/lib/scope.ts`
- Create: `libs/finance/booking/feature/src/lib/booking.store.ts`
- Create: `libs/finance/booking/feature/src/lib/booking-list.ts`
- Create: `libs/finance/booking/feature/src/lib/booking-edit.modal.ts`
- Modify: `libs/finance/booking/feature/src/index.ts`

- [ ] **Step 1: Create `libs/finance/booking/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/booking/feature.';
```

- [ ] **Step 2: Create `libs/finance/booking/feature/src/lib/booking.store.ts`**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { BookingLineModel, BookingModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { BookingLineService, BookingService } from '@bk2/finance-booking-data-access';
import { generateBookingNo } from '@bk2/finance-booking-util';

import { BookingEditModal } from './booking-edit.modal';
import { PFX } from './scope';

const BOOKING_I18N_KEYS = {
  list_title:  PFX + 'list.title',
  empty:       PFX + 'empty',
  date_label:  PFX + 'date.label',
  desc_label:  PFX + 'desc.label',
  no_label:    PFX + 'no.label',
  save:        '@save.label',
  cancel:      '@cancel',
  as_view:     PFX + 'actionsheet.view',
  as_edit:     PFX + 'actionsheet.edit',
  as_create:   PFX + 'actionsheet.create',
  as_delete:   PFX + 'actionsheet.delete',
} satisfies Record<string, string>;

export type BookingI18n = { [K in keyof typeof BOOKING_I18N_KEYS]: Signal<string> };

export const BookingStore = signalStore(
  withState({ filter: '' }),
  withProps(() => ({
    bookingService: inject(BookingService),
    bookingLineService: inject(BookingLineService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(BOOKING_I18N_KEYS),
    bookingsResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.bookingService.list(id),
    }),
  })),
  withComputed(store => ({
    bookings: computed(() => store.bookingsResource.value() ?? []),
    isLoading: computed(() => store.bookingsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const accountingTenantId = store.accountingTenantId();
      const year = new Date().getFullYear();
      const seq = await store.bookingService.nextSequence(year, accountingTenantId);
      const booking = new BookingModel(store.appStore.tenantId(), accountingTenantId);
      booking.bookingNo = generateBookingNo(year, seq);
      await this.openEdit(booking, [], false);
    },

    async openEdit(booking: BookingModel, lines: BookingLineModel[], readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: BookingEditModal,
        componentProps: { booking, lines, readOnly, currentUser: store.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const { booking: b, lines: l } = data as { booking: BookingModel; lines: BookingLineModel[] };
        if (b.bkey?.length > 0) {
          await store.bookingService.update(b, l, store.currentUser());
        } else {
          await store.bookingService.create(b, l, store.currentUser());
        }
        store.bookingsResource.reload();
      }
    },

    async delete(booking: BookingModel): Promise<void> {
      if (store.isReadOnly()) return;
      await store.bookingService.delete(booking, store.currentUser());
      store.bookingsResource.reload();
    },

    getTitleLabel(readOnly: boolean, key?: string): string {
      if (readOnly) return store.i18n.as_view();
      return (key && key.length > 0) ? store.i18n.as_edit() : store.i18n.as_create();
    },
  }))
);
```

- [ ] **Step 3: Create `libs/finance/booking/feature/src/lib/booking-list.ts`**

```ts
import { Component, inject } from '@angular/core';
import { IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { BookingStore } from './booking.store';

@Component({
  selector: 'bk-booking-list',
  standalone: true,
  imports: [
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonFab, IonFabButton, IonIcon, IonButton,
    SvgIconPipe,
  ],
  providers: [BookingStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (store.isLoading()) {
          <p>Loading...</p>
        } @else if (store.bookings().length === 0) {
          <p>{{ store.i18n.empty() }}</p>
        } @else {
          <ion-list>
            @for (booking of store.bookings(); track booking.bkey) {
              <ion-item (click)="store.openEdit(booking, [], !store.isReadOnly())">
                <ion-label>
                  <h3>{{ booking.bookingNo }} — {{ booking.title }}</h3>
                  <p>{{ booking.date }}</p>
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
export class BookingList {
  protected readonly store = inject(BookingStore);
}
```

- [ ] **Step 4: Create `libs/finance/booking/feature/src/lib/booking-edit.modal.ts`**

```ts
import { Component, inject, input } from '@angular/core';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { BookingLineModel, BookingModel, UserModel } from '@bk2/shared-models';
import { validateBookingBalance } from '@bk2/finance-booking-util';

@Component({
  selector: 'bk-booking-edit-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput,
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
        <ion-label position="stacked">Date</ion-label>
        <ion-input [(ngModel)]="editBooking.date" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Description</ion-label>
        <ion-input [(ngModel)]="editBooking.title" [readonly]="readOnly()" />
      </ion-item>
      <!-- Booking lines managed via editLines array; full line editor component added in booking/ui -->
      @for (line of editLines; track $index) {
        <ion-item>
          <ion-label>Account: {{ line.accountKey }} | Dr: {{ line.debitAmount?.amount }} | Cr: {{ line.creditAmount?.amount }}</ion-label>
        </ion-item>
      }
      @if (!isBalanced) {
        <p style="color:red">Debit and credit totals must be equal.</p>
      }
    </ion-content>
  `,
})
export class BookingEditModal {
  public readonly booking = input.required<BookingModel>();
  public readonly lines = input.required<BookingLineModel[]>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);

  protected editBooking!: BookingModel;
  protected editLines!: BookingLineModel[];

  ngOnInit(): void {
    this.editBooking = { ...this.booking() };
    this.editLines = [...this.lines()];
  }

  protected get isBalanced(): boolean {
    return validateBookingBalance(this.editLines);
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  protected async save(): Promise<void> {
    if (!this.isBalanced) return;
    await this.modalController.dismiss({ booking: this.editBooking, lines: this.editLines }, 'confirm');
  }
}
```

- [ ] **Step 5: Update `libs/finance/booking/feature/src/index.ts`**

```ts
export * from './lib/booking.store';
export * from './lib/booking-list';
export * from './lib/booking-edit.modal';
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add libs/finance/booking/feature/src/
git commit -m "feat(booking): BookingStore, BookingList, BookingEditModal"
```

---

### Task 12: PeriodList + PeriodStore

**Files:**
- Create: `libs/finance/period/feature/src/lib/scope.ts`
- Create: `libs/finance/period/feature/src/lib/period.store.ts`
- Create: `libs/finance/period/feature/src/lib/period-list.ts`
- Modify: `libs/finance/period/feature/src/index.ts`

- [ ] **Step 1: Create `libs/finance/period/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/period/feature.';
```

- [ ] **Step 2: Create `libs/finance/period/feature/src/lib/period.store.ts`**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PeriodModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PeriodService } from '@bk2/finance-period-data-access';
import { PFX } from './scope';

const PERIOD_I18N_KEYS = {
  list_title:   PFX + 'list.title',
  empty:        PFX + 'empty',
  year_label:   PFX + 'year.label',
  month_label:  PFX + 'month.label',
  locked_label: PFX + 'locked.label',
  lock_action:  PFX + 'lock.action',
  unlock_action: PFX + 'unlock.action',
} satisfies Record<string, string>;

export type PeriodI18n = { [K in keyof typeof PERIOD_I18N_KEYS]: Signal<string> };

export const PeriodStore = signalStore(
  withState({}),
  withProps(() => ({
    periodService: inject(PeriodService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PERIOD_I18N_KEYS),
    periodsResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.periodService.list(id),
    }),
  })),
  withComputed(store => ({
    periods: computed(() => store.periodsResource.value() ?? []),
    isLoading: computed(() => store.periodsResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
  })),
  withMethods(store => ({
    async lock(period: PeriodModel): Promise<void> {
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.lock(period, user);
      store.periodsResource.reload();
    },
    async unlock(period: PeriodModel): Promise<void> {
      const user = store.currentUser();
      if (!user) return;
      await store.periodService.unlock(period, user);
      store.periodsResource.reload();
    },
    async create(year: number, month = 0): Promise<void> {
      const tenantId = store.appStore.tenantId();
      const accountingTenantId = store.accountingStore.accountingTenantId();
      const period = new PeriodModel(tenantId, accountingTenantId, year, month);
      await store.periodService.create(period, store.currentUser());
      store.periodsResource.reload();
    },
  }))
);
```

- [ ] **Step 3: Create `libs/finance/period/feature/src/lib/period-list.ts`**

```ts
import { Component, inject } from '@angular/core';
import { IonBadge, IonButton, IonContent, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';

import { PeriodStore } from './period.store';

@Component({
  selector: 'bk-period-list',
  standalone: true,
  imports: [
    IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
    IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon,
    SvgIconPipe,
  ],
  providers: [PeriodStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (store.isLoading()) {
          <p>Loading...</p>
        } @else if (store.periods().length === 0) {
          <p>{{ store.i18n.empty() }}</p>
        } @else {
          <ion-list>
            @for (period of store.periods(); track period.bkey) {
              <ion-item>
                <ion-label>
                  <h3>{{ period.year }}{{ period.month > 0 ? '-' + period.month : '' }}</h3>
                </ion-label>
                @if (period.isLocked) {
                  <ion-badge slot="end" color="warning">{{ store.i18n.locked_label() }}</ion-badge>
                  @if (!store.isReadOnly()) {
                    <ion-button slot="end" fill="clear" (click)="store.unlock(period)">
                      <ion-icon src="{{ 'lock-open' | svgIcon }}" />
                    </ion-button>
                  }
                } @else {
                  @if (!store.isReadOnly()) {
                    <ion-button slot="end" fill="clear" (click)="store.lock(period)">
                      <ion-icon src="{{ 'lock-closed' | svgIcon }}" />
                    </ion-button>
                  }
                }
              </ion-item>
            }
          </ion-list>
        }
      </ion-content>
    </ion-page>
  `,
})
export class PeriodList {
  protected readonly store = inject(PeriodStore);
}
```

- [ ] **Step 4: Update `libs/finance/period/feature/src/index.ts`**

```ts
export * from './lib/period.store';
export * from './lib/period-list';
```

- [ ] **Step 5: Add missing constructors to models**

`BookingModel` and `PeriodModel` need constructors that accept `tenantId` and `accountingTenantId`. Verify these exist in `libs/shared/models/src/lib/booking.model.ts` and `libs/shared/models/src/lib/period.model.ts`. If not, add:

In `booking.model.ts` add:
```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
}
```

In `period.model.ts` add:
```ts
constructor(tenantId: string, accountingTenantId: string, year: number, month = 0) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
  this.year = year;
  this.month = month;
  this.bkey = `${accountingTenantId}-${year}${month > 0 ? '-' + String(month).padStart(2, '0') : ''}`;
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/finance/period/feature/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add libs/finance/period/feature/src/ libs/shared/models/src/lib/period.model.ts libs/shared/models/src/lib/booking.model.ts
git commit -m "feat(period): PeriodStore and PeriodList with lock/unlock actions"
```

---

### Task 13: Bexio CF adaptations — shared.ts + journal.ts + other CFs

**Files:**
- Modify: `apps/functions/src/bexio/shared.ts`
- Modify: `apps/functions/src/bexio/journal.ts`
- Modify: `apps/functions/src/bexio/account.ts`
- Modify: `apps/functions/src/bexio/invoice.ts`
- Modify: `apps/functions/src/bexio/bill.ts`

- [ ] **Step 1: Remove `toStoreDate` from `apps/functions/src/bexio/shared.ts`**

Delete the `toStoreDate` function entirely — it violates CLAUDE.md (never write custom date helpers):

```ts
// DELETE this block:
// /** Convert Bexio date "YYYY-MM-DD" to StoreDate "YYYYMMDD". Returns '' for null/empty. */
// export function toStoreDate(bexioDate: string | null | undefined): string { ... }
```

The file `shared.ts` should now contain only the secret + constant exports:

```ts
import { defineSecret } from 'firebase-functions/params';

export const bexioApiKey = defineSecret('BEXIO_APIKEY');
export const bexioUserId = defineSecret('BEXIO_USER_ID');
export const bexioTenantId = defineSecret('BEXIO_TENANT_ID');
export const bexioDefaultTaxId = defineSecret('BEXIO_DEFAULT_TAX_ID');

export const BEXIO_BASE = 'https://api.bexio.com/2.0';
export const BEXIO_BASE_V3 = 'https://api.bexio.com/3.0';
export const BEXIO_BASE_V4 = 'https://api.bexio.com/4.0';
```

- [ ] **Step 2: Rewrite `persistJournalEntries` in `apps/functions/src/bexio/journal.ts`**

Replace the import of `toStoreDate` with `convertDateFormatToString` and `DateFormat`. Replace the write target from `journallogs` to `bookings` + `booking-lines`. The new function:

```ts
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';
import { bexioApiKey, bexioTenantId, BEXIO_BASE_V3 } from './shared';
// (remove: toStoreDate from import)

async function persistJournalEntries(entries: BexioJournalEntry[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const BATCH_SIZE = 50; // 3 docs per entry: lower than before

  const accountMap = await loadAccountNumberMap(db);

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const entry of chunk) {
      const bkey = String(entry.id);
      const amountCents = Math.round(parseFloat(entry.amount) * 100);
      const dateStr = entry.date
        ? convertDateFormatToString(entry.date.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate)
        : '';
      const debitAccount = entry.debit_account_id != null
        ? (accountMap.get(String(entry.debit_account_id).padStart(4, '0')) ?? String(entry.debit_account_id))
        : '';
      const creditAccount = entry.credit_account_id != null
        ? (accountMap.get(String(entry.credit_account_id).padStart(4, '0')) ?? String(entry.credit_account_id))
        : '';

      // BookingModel header in 'bookings'
      batch.set(db.collection('bookings').doc(bkey), {
        tenants: [tenantId],
        isArchived: false,
        index: `d:${dateStr} no:${bkey}`,
        tags: '',
        notes: '',
        title: entry.description ?? '',
        date: dateStr,
        bookingNo: bkey,
        periodKey: '',
        documentKey: '',
        status: 'posted',
        accountingTenantId: tenantId,
      }, { merge: true });

      // BookingLineModel debit in 'booking-lines'
      batch.set(db.collection('booking-lines').doc(`${bkey}-dr`), {
        tenants: [tenantId],
        isArchived: false,
        bookingKey: bkey,
        accountKey: debitAccount,
        debitAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
        creditAmount: null,
        amountFx: null,
        exchangeRateKey: '',
        vatCodeKey: '',
        accountingTenantId: tenantId,
      }, { merge: true });

      // BookingLineModel credit in 'booking-lines'
      batch.set(db.collection('booking-lines').doc(`${bkey}-cr`), {
        tenants: [tenantId],
        isArchived: false,
        bookingKey: bkey,
        accountKey: creditAccount,
        debitAmount: null,
        creditAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
        amountFx: null,
        exchangeRateKey: '',
        vatCodeKey: '',
        accountingTenantId: tenantId,
      }, { merge: true });
    }

    await batch.commit();
    logger.info(`persistJournalEntries: committed chunk ${Math.floor(i / BATCH_SIZE) + 1}`);
  }

  await db.collection('config').doc('bexioSync').set({ lastJournalSyncedAt: nowStr }, { merge: true });
}
```

- [ ] **Step 3: Add `accountingTenantId` to `syncBexioAccounts` in `apps/functions/src/bexio/account.ts`**

Find the document write loop and add `accountingTenantId: bexioTenantId.value()` to every object written to Firestore. Also replace any `toStoreDate()` calls with `convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate)` and import `convertDateFormatToString, DateFormat` from `@bk2/shared-util-core`.

- [ ] **Step 4: Add `accountingTenantId` to `syncBexioInvoices` in `apps/functions/src/bexio/invoice.ts`**

Same pattern: add `accountingTenantId: bexioTenantId.value()` to every written document. Replace `toStoreDate` with `convertDateFormatToString`.

- [ ] **Step 5: Add `accountingTenantId` to `syncBexioBills` in `apps/functions/src/bexio/bill.ts`**

Same pattern.

- [ ] **Step 6: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production
```

Expected: successful build, no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add apps/functions/src/bexio/
git commit -m "feat(bexio-cf): adapt journal CF to write bookings+booking-lines; add accountingTenantId to all CFs; replace toStoreDate with convertDateFormatToString"
```

---

### Task 14: Build + type-check verification

- [ ] **Step 1: Type-check all new libs**

```bash
npx tsc --noEmit -p libs/finance/accounting/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/accounting/feature/tsconfig.json
npx tsc --noEmit -p libs/finance/booking/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/booking/feature/tsconfig.json
npx tsc --noEmit -p libs/finance/booking/util/tsconfig.json
npx tsc --noEmit -p libs/finance/period/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/period/feature/tsconfig.json
```

Expected: all clean

- [ ] **Step 2: Run booking util tests**

```bash
pnpm run test finance-booking-util
```

Expected: 5 tests passing

- [ ] **Step 3: Build accounting libs**

```bash
pnpm nx build finance-accounting-data-access
pnpm nx build finance-accounting-feature
pnpm nx build finance-booking-util
pnpm nx build finance-booking-data-access
pnpm nx build finance-booking-feature
pnpm nx build finance-period-data-access
pnpm nx build finance-period-feature
```

Expected: all succeed without errors

- [ ] **Step 4: Verify scs-app compiles**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: Plan 1 complete — accounting foundation + core bookkeeping"
```

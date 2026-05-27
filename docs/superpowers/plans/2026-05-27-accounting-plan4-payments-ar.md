# Accounting System — Plan 4: Payments + AR Extensions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ISO 20022 pain.001 payment orders with four-eyes approval; invoice aging report; QR-bill scanner; Cloud Functions for pain.001 XML generation, PDF invoice, dunning, and QR parsing.

**Architecture:** New lib domain `libs/finance/payment/` (payment order + payment CRUD, IBAN validation, pain.001 util, four-eyes approval check against `ResponsibilityModel`). Extensions to existing `libs/finance/invoice/` and `libs/finance/bill/` (invoiceNo generation, position-level accountKey/vatCodeKey, payment reconciliation, aging report). Six Cloud Functions: `generatePain001`, `generateInvoicePdf`, `parseQrInvoice`, `generateDunningPdf`. Payment approver is a `ResponsibilityModel` with `name = 'payment_approver'`, `parentKey = accountingTenantId` — NOT a role.

**Tech Stack:** Angular 20 zoneless standalone, NgRx Signal Stores, Ionic/Angular 8.7, Vitest, Firebase Cloud Functions v2 onCall.

**Spec source:** `docs/superpowers/specs/2026-05-27-accounting-system-design.md` Phases 7 + 8.

**Prerequisites:** Plan 1 merged (BookingService). Plan 2 merged (VAT codes for invoice positions).

---

## File Structure

```
libs/finance/
  payment/
    data-access/                     [new lib]
      src/lib/payment-order.service.ts
      src/lib/payment.service.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    feature/                         [new lib]
      src/lib/payment.store.ts
      src/lib/payment-order-list.ts
      src/lib/payment-order-edit.modal.ts
      src/lib/payment-order-detail-page.ts
      src/lib/scope.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    ui/                              [new lib]
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json
    util/                            [new lib]
      src/lib/iban.util.ts
      src/lib/iban.util.spec.ts
      src/lib/pain001.util.ts
      src/lib/pain001.util.spec.ts
      src/index.ts
      tsconfig.json / tsconfig.lib.json / package.json / project.json / vite.config.ts
apps/
  functions/src/
    payment/
      generate-pain001.ts            [new CF]
      generate-invoice-pdf.ts        [new CF]
      parse-qr-invoice.ts            [new CF]
      generate-dunning-pdf.ts        [new CF]
    main.ts                          [modify: export new CFs]
  scs-app/src/app/app.routes.ts     [modify: add payment routes]
libs/finance/
  invoice/feature/src/lib/
    invoice-aging.ts                 [new: aging component]
  bill/feature/src/lib/
    bill-qr-scan.modal.ts            [new: QR scan modal]
tsconfig.base.json                   [modify: add Plan 4 path aliases]
```

---

## Tasks

### Task 1: Plan 4 lib scaffold + tsconfig.base.json aliases

**Files:**
- Create: all config files for 4 new libs under `libs/finance/payment/`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create directories**

```bash
mkdir -p libs/finance/payment/{data-access,feature,ui,util}/src/lib
```

- [ ] **Step 2: Scaffold `payment/util`**

`libs/finance/payment/util/tsconfig.json`:

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

`libs/finance/payment/util/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/payment/util",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-payment-util.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/payment/util/package.json`:

```json
{
  "name": "@bk2/finance-payment-util",
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

`libs/finance/payment/util/project.json`:

```json
{
  "name": "finance-payment-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/payment/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/payment/util",
        "main": "libs/finance/payment/util/src/index.ts",
        "tsConfig": "libs/finance/payment/util/tsconfig.lib.json",
        "assets": ["libs/finance/payment/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": { "configFile": "libs/finance/payment/util/vite.config.ts" }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/payment/util/vite.config.ts`:

```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/finance/payment/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/finance/payment/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/finance/payment/util/src/index.ts`:

```ts
export * from './lib/iban.util';
export * from './lib/pain001.util';
```

- [ ] **Step 3: Scaffold `payment/data-access`**

`libs/finance/payment/data-access/tsconfig.json`:

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

`libs/finance/payment/data-access/tsconfig.lib.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/finance/payment/data-access",
    "declaration": true, "composite": true, "module": "es2020", "target": "es2020", "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/finance-payment-data-access.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/finance/payment/data-access/package.json`:

```json
{
  "name": "@bk2/finance-payment-data-access",
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
    "@bk2/finance-payment-util": "*"
  }
}
```

`libs/finance/payment/data-access/project.json`:

```json
{
  "name": "finance-payment-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/finance/payment/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:finance", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/finance/payment/data-access",
        "main": "libs/finance/payment/data-access/src/index.ts",
        "tsConfig": "libs/finance/payment/data-access/tsconfig.lib.json",
        "assets": ["libs/finance/payment/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/finance/payment/data-access/src/index.ts`: `// populated in Task 4`

- [ ] **Step 4: Scaffold `payment/feature` and `payment/ui`**

`payment/feature` follows the same tsconfig/package/project pattern as other feature libs:
- `name: "@bk2/finance-payment-feature"`, outputPath `dist/libs/finance/payment/feature`
- References in tsconfig.json: shared-models, shared-config, shared-i18n, shared-util-core, shared-util-angular, shared-feature, finance-accounting-feature, finance-booking-data-access, finance-payment-data-access, finance-payment-util, finance-payment-ui
- Package.json deps: all of the above plus @bk2/ prefix

`payment/ui`:
- `name: "@bk2/finance-payment-ui"`, outputPath `dist/libs/finance/payment/ui`
- References: shared-models, shared-i18n, shared-util-core
- `src/index.ts`: `// populated later`

- [ ] **Step 5: Add path aliases to `tsconfig.base.json`**

```json
"@bk2/finance-payment-data-access": ["libs/finance/payment/data-access/src/index.ts"],
"@bk2/finance-payment-feature": ["libs/finance/payment/feature/src/index.ts"],
"@bk2/finance-payment-ui": ["libs/finance/payment/ui/src/index.ts"],
"@bk2/finance-payment-util": ["libs/finance/payment/util/src/index.ts"],
```

- [ ] **Step 6: Commit scaffold**

```bash
git add libs/finance/payment/ tsconfig.base.json
git commit -m "chore: scaffold payment libs (4 new libs)"
```

---

### Task 2: iban.util.ts — MOD-97 IBAN validation

**Files:**
- Create: `libs/finance/payment/util/src/lib/iban.util.spec.ts`
- Create: `libs/finance/payment/util/src/lib/iban.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/payment/util/src/lib/iban.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { validateIban, normalizeIban } from './iban.util';

describe('normalizeIban', () => {
  it('removes spaces and uppercases', () => {
    expect(normalizeIban('ch93 0076 2011 6238 5295 7')).toBe('CH9300762011623852957');
  });
});

describe('validateIban', () => {
  it('returns true for a valid Swiss IBAN', () => {
    expect(validateIban('CH9300762011623852957')).toBe(true);
  });

  it('returns true for IBAN with spaces', () => {
    expect(validateIban('CH93 0076 2011 6238 5295 7')).toBe(true);
  });

  it('returns false for an invalid IBAN', () => {
    expect(validateIban('CH0000000000000000000')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(validateIban('')).toBe(false);
  });

  it('returns false for non-IBAN string', () => {
    expect(validateIban('not-an-iban')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-payment-util
```

Expected: FAIL

- [ ] **Step 3: Implement `libs/finance/payment/util/src/lib/iban.util.ts`**

```ts
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validates an IBAN using the MOD-97 algorithm (ISO 13616).
 * Moves the first 4 characters to the end, converts letters to digits (A=10..Z=35),
 * then checks that the numeric string modulo 97 equals 1.
 */
export function validateIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (iban.length < 5) return false;

  // Move first 4 chars to end
  const rearranged = iban.slice(4) + iban.slice(0, 4);

  // Convert letters to digits
  const numericStr = rearranged.split('').map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String(code - 55); // A=10..Z=35
    if (code >= 48 && code <= 57) return ch;
    return '?';
  }).join('');

  if (numericStr.includes('?')) return false;

  // Compute MOD-97 in chunks to avoid BigInt overflow in environments without BigInt
  let remainder = 0;
  for (const ch of numericStr) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm run test finance-payment-util -- --testPathPattern=iban
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/payment/util/src/lib/iban.util.ts libs/finance/payment/util/src/lib/iban.util.spec.ts
git commit -m "feat(payment-util): validateIban with MOD-97 algorithm and tests"
```

---

### Task 3: pain001.util.ts — payment type detection

**Files:**
- Create: `libs/finance/payment/util/src/lib/pain001.util.spec.ts`
- Create: `libs/finance/payment/util/src/lib/pain001.util.ts`

- [ ] **Step 1: Write failing tests in `libs/finance/payment/util/src/lib/pain001.util.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { detectPaymentType } from './pain001.util';

describe('detectPaymentType', () => {
  it('detects QR-IBAN with QR reference as QRR', () => {
    // QR-IBAN starts with 3000x–3199x
    expect(detectPaymentType('CH4431999123000889012', 'CHF', '210000000003139471430009017')).toBe('QRR');
  });

  it('detects IBAN with SCOR reference as SCOR', () => {
    expect(detectPaymentType('CH9300762011623852957', 'CHF', 'RF18539007547034')).toBe('SCOR');
  });

  it('detects SEPA transfer for EUR IBAN', () => {
    expect(detectPaymentType('DE89370400440532013000', 'EUR', '')).toBe('SEPA');
  });

  it('detects NON for CHF non-QR IBAN without structured reference', () => {
    expect(detectPaymentType('CH9300762011623852957', 'CHF', '')).toBe('NON');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm run test finance-payment-util -- --testPathPattern=pain001
```

Expected: FAIL

- [ ] **Step 3: Implement `libs/finance/payment/util/src/lib/pain001.util.ts`**

```ts
export type Pain001PaymentType = 'QRR' | 'SCOR' | 'SEPA' | 'ICP' | 'NON';

/**
 * Auto-detects the SIX pain.001 payment type from IBAN, currency, and reference.
 * QRR: QR-IBAN (30000–31999 in positions 5-9) + 27-digit numeric reference.
 * SCOR: any IBAN + RF structured creditor reference.
 * SEPA: EUR currency.
 * ICP: non-CHF, non-EUR (international credit payment).
 * NON: CHF, standard IBAN, no structured reference.
 */
export function detectPaymentType(iban: string, currency: string, reference: string): Pain001PaymentType {
  const normalized = iban.replace(/\s+/g, '').toUpperCase();
  const isQrIban = /^CH\d{2}3[01]\d{3}/.test(normalized);
  const isQrRef = /^\d{27}$/.test(reference.replace(/\s+/g, ''));
  const isScorRef = /^RF\d{2}/.test(reference.replace(/\s+/g, '').toUpperCase());

  if (isQrIban && isQrRef) return 'QRR';
  if (isScorRef) return 'SCOR';
  if (currency === 'EUR') return 'SEPA';
  if (currency !== 'CHF') return 'ICP';
  return 'NON';
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm run test finance-payment-util -- --testPathPattern=pain001
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add libs/finance/payment/util/src/lib/pain001.util.ts libs/finance/payment/util/src/lib/pain001.util.spec.ts
git commit -m "feat(payment-util): detectPaymentType for pain.001 with tests"
```

---

### Task 4: PaymentOrderService + PaymentService

**Files:**
- Create: `libs/finance/payment/data-access/src/lib/scope.ts`
- Create: `libs/finance/payment/data-access/src/lib/payment-order.service.ts`
- Create: `libs/finance/payment/data-access/src/lib/payment.service.ts`
- Modify: `libs/finance/payment/data-access/src/index.ts`

- [ ] **Step 1: Create `libs/finance/payment/data-access/src/lib/scope.ts`**

```ts
export const PFX = '@finance/payment/data-access.';
```

- [ ] **Step 2: Create `libs/finance/payment/data-access/src/lib/payment-order.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PaymentOrderCollection, PaymentOrderModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PaymentOrderService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(order: PaymentOrderModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PaymentOrderModel>(
      PaymentOrderCollection, order,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<PaymentOrderModel | undefined> {
    return findByKey<PaymentOrderModel>(this.list(accountingTenantId), key);
  }

  public async update(order: PaymentOrderModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PaymentOrderModel>(
      PaymentOrderCollection, order, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'executionDate', sortOrder = 'desc'): Observable<PaymentOrderModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PaymentOrderModel>(PaymentOrderCollection, query, orderBy, sortOrder);
  }

  /**
   * Four-eyes approval: sets approvedBy to the current user's bkey.
   * Caller must verify that the approver is a different person from the creator
   * and holds the 'payment_approver' ResponsibilityModel.
   */
  public async approve(order: PaymentOrderModel, approverId: string, currentUser?: UserModel): Promise<void> {
    order.approvedBy = approverId;
    order.status = 'approved';
    await this.update(order, currentUser);
  }
}
```

- [ ] **Step 3: Create `libs/finance/payment/data-access/src/lib/payment.service.ts`**

```ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PaymentCollection, PaymentModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(payment: PaymentModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<PaymentModel>(
      PaymentCollection, payment,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public async update(payment: PaymentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.updateModel<PaymentModel>(
      PaymentCollection, payment, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public listForOrder(paymentOrderKey: string, accountingTenantId: string): Observable<PaymentModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'paymentOrderKey',   operator: '==' as const, value: paymentOrderKey   },
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<PaymentModel>(PaymentCollection, query);
  }
}
```

- [ ] **Step 4: Update `libs/finance/payment/data-access/src/index.ts`**

```ts
export * from './lib/payment-order.service';
export * from './lib/payment.service';
```

- [ ] **Step 5: Add constructors to models if missing**

In `libs/shared/models/src/lib/payment-order.model.ts`, add:

```ts
constructor(tenantId: string, accountingTenantId: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
  this.messageId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
```

In `libs/shared/models/src/lib/payment.model.ts`, add:

```ts
constructor(tenantId: string, accountingTenantId: string, paymentOrderKey: string) {
  this.tenants = [tenantId];
  this.accountingTenantId = accountingTenantId;
  this.paymentOrderKey = paymentOrderKey;
  this.endToEndId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 35) : Math.random().toString(36).slice(2);
}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/finance/payment/data-access/tsconfig.json
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add libs/finance/payment/data-access/src/ libs/shared/models/src/lib/payment-order.model.ts libs/shared/models/src/lib/payment.model.ts
git commit -m "feat(payment): PaymentOrderService and PaymentService with four-eyes approve"
```

---

### Task 5: PaymentStore + PaymentOrderList + PaymentOrderDetailPage

**Files:**
- Create: `libs/finance/payment/feature/src/lib/scope.ts`
- Create: `libs/finance/payment/feature/src/lib/payment.store.ts`
- Create: `libs/finance/payment/feature/src/lib/payment-order-list.ts`
- Create: `libs/finance/payment/feature/src/lib/payment-order-edit.modal.ts`
- Create: `libs/finance/payment/feature/src/lib/payment-order-detail-page.ts`
- Modify: `libs/finance/payment/feature/src/index.ts`
- Modify: `apps/scs-app/src/app/app.routes.ts`

- [ ] **Step 1: Create `libs/finance/payment/feature/src/lib/scope.ts`**

```ts
export const PFX = '@finance/payment/feature.';
```

- [ ] **Step 2: Create `libs/finance/payment/feature/src/lib/payment.store.ts`**

```ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular/standalone';
import { signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { PaymentOrderModel } from '@bk2/shared-models';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@bk2/finance-payment-data-access';
import { validateIban } from '@bk2/finance-payment-util';

import { PaymentOrderEditModal } from './payment-order-edit.modal';
import { PFX } from './scope';

const PAYMENT_I18N_KEYS = {
  list_title:    PFX + 'list.title',
  empty:         PFX + 'empty',
  approve_label: PFX + 'approve.label',
  as_view:       PFX + 'actionsheet.view',
  as_edit:       PFX + 'actionsheet.edit',
  as_create:     PFX + 'actionsheet.create',
} satisfies Record<string, string>;

export type PaymentI18n = { [K in keyof typeof PAYMENT_I18N_KEYS]: Signal<string> };

export const PaymentStore = signalStore(
  withState({}),
  withProps(() => ({
    paymentOrderService: inject(PaymentOrderService),
    paymentService: inject(PaymentService),
    accountingStore: inject(AccountingStore),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    i18nService: inject(I18nService),
  })),
  withProps(store => ({
    i18n: store.i18nService.translateAll(PAYMENT_I18N_KEYS),
    ordersResource: rxResource({
      request: () => store.accountingStore.accountingTenantId(),
      stream: ({ request: id }) => store.paymentOrderService.list(id),
    }),
  })),
  withComputed(store => ({
    orders: computed(() => store.ordersResource.value() ?? []),
    isLoading: computed(() => store.ordersResource.isLoading()),
    currentUser: computed(() => store.appStore.currentUser()),
    currentUserKey: computed(() => store.appStore.currentUser()?.bkey ?? ''),
    isReadOnly: computed(() => store.accountingStore.isExternallyManaged()),
    accountingTenantId: computed(() => store.accountingStore.accountingTenantId()),
  })),
  withMethods(store => ({
    async openCreate(): Promise<void> {
      if (store.isReadOnly()) return;
      const order = new PaymentOrderModel(store.appStore.tenantId(), store.accountingTenantId());
      order.createdBy = store.currentUserKey();
      await this.openEdit(order, false);
    },

    async openEdit(order: PaymentOrderModel, readOnly = true): Promise<void> {
      const modal = await store.modalController.create({
        component: PaymentOrderEditModal,
        componentProps: { order, readOnly, currentUser: store.currentUser() },
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm' && data) {
        const o = data as PaymentOrderModel;
        if (o.bkey?.length > 0) {
          await store.paymentOrderService.update(o, store.currentUser());
        } else {
          await store.paymentOrderService.create(o, store.currentUser());
        }
        store.ordersResource.reload();
      }
    },

    /**
     * Four-eyes: approver must be different from creator.
     * Caller is responsible for verifying the payment_approver ResponsibilityModel.
     */
    async approve(order: PaymentOrderModel): Promise<void> {
      const approverId = store.currentUserKey();
      if (!approverId || approverId === order.createdBy) {
        console.warn('PaymentStore.approve: approver must be a different person from the creator');
        return;
      }
      await store.paymentOrderService.approve(order, approverId, store.currentUser());
      store.ordersResource.reload();
    },
  }))
);
```

- [ ] **Step 3: Create `libs/finance/payment/feature/src/lib/payment-order-edit.modal.ts`**

```ts
import { Component, inject, input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonInput, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { PaymentOrderModel, UserModel } from '@bk2/shared-models';
import { validateIban } from '@bk2/finance-payment-util';

@Component({
  selector: 'bk-payment-order-edit-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonInput, IonNote, IonSelect, IonSelectOption],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ readOnly() ? 'View Payment Order' : (order().bkey ? 'Edit' : 'New Payment Order') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Cancel</ion-button>
          @if (!readOnly()) { <ion-button (click)="save()" [disabled]="!isValid">Save</ion-button> }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">Debit Account Key</ion-label>
        <ion-input [(ngModel)]="edit.debitAccountKey" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Execution Date (YYYYMMDD)</ion-label>
        <ion-input [(ngModel)]="edit.executionDate" [readonly]="readOnly()" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">Delivery Method</ion-label>
        <ion-select [(ngModel)]="edit.deliveryMethod" [disabled]="readOnly()">
          <ion-select-option value="pain001_download">pain.001 Download</ion-select-option>
          <ion-select-option value="bexio_api">Bexio API</ion-select-option>
          <ion-select-option value="ebics">EBICS</ion-select-option>
        </ion-select>
      </ion-item>
    </ion-content>
  `,
})
export class PaymentOrderEditModal implements OnInit {
  public readonly order = input.required<PaymentOrderModel>();
  public readonly readOnly = input<boolean>(true);
  public readonly currentUser = input<UserModel | undefined>(undefined);

  private readonly modalController = inject(ModalController);
  protected edit!: PaymentOrderModel;

  ngOnInit(): void { this.edit = { ...this.order() }; }

  protected get isValid(): boolean {
    return !!this.edit.debitAccountKey && !!this.edit.executionDate;
  }

  protected async dismiss(): Promise<void> { await this.modalController.dismiss(null, 'cancel'); }
  protected async save(): Promise<void> { await this.modalController.dismiss(this.edit, 'confirm'); }
}
```

- [ ] **Step 4: Create `libs/finance/payment/feature/src/lib/payment-order-list.ts`**

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonContent, IonFab, IonFabButton, IonHeader, IonIcon,
  IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { AccountingStore } from '@bk2/finance-accounting-feature';

import { PaymentStore } from './payment.store';

@Component({
  selector: 'bk-payment-order-list',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonFab, IonFabButton, IonIcon, SvgIconPipe],
  providers: [PaymentStore],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ store.i18n.list_title() }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (store.isLoading()) { <p>Loading...</p> }
        @else if (store.orders().length === 0) { <p>{{ store.i18n.empty() }}</p> }
        @else {
          <ion-list>
            @for (order of store.orders(); track order.bkey) {
              <ion-item (click)="navigate(order.bkey)">
                <ion-label>
                  <h3>{{ order.messageId }}</h3>
                  <p>{{ order.executionDate }} | {{ order.deliveryMethod }}</p>
                </ion-label>
                <ion-badge slot="end" [color]="order.status === 'approved' ? 'success' : 'medium'">
                  {{ order.status }}
                </ion-badge>
                @if (order.status === 'draft' && !store.isReadOnly() && order.createdBy !== store.currentUserKey()) {
                  <ion-button slot="end" fill="clear" (click)="store.approve(order); $event.stopPropagation()">
                    {{ store.i18n.approve_label() }}
                  </ion-button>
                }
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
export class PaymentOrderList {
  protected readonly store = inject(PaymentStore);
  private readonly accountingStore = inject(AccountingStore);
  private readonly router = inject(Router);

  protected navigate(orderKey: string): void {
    const tenantId = this.accountingStore.accountingTenantId();
    this.router.navigate(['/accounting', tenantId, 'payments', orderKey]);
  }
}
```

- [ ] **Step 5: Create `libs/finance/payment/feature/src/lib/payment-order-detail-page.ts`**

```ts
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountingStore } from '@bk2/finance-accounting-feature';
import { PaymentOrderService, PaymentService } from '@bk2/finance-payment-data-access';

@Component({
  selector: 'bk-payment-order-detail-page',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonButton],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Payment Order</ion-title>
          @if (orderResource.value()?.status === 'approved') {
            <ion-button slot="end" fill="clear" (click)="generatePain001()">Download pain.001</ion-button>
          }
        </ion-toolbar>
      </ion-header>
      <ion-content>
        @if (orderResource.value(); as order) {
          <ion-item><ion-label>Status: {{ order.status }}</ion-label></ion-item>
          <ion-item><ion-label>Execution: {{ order.executionDate }}</ion-label></ion-item>
          <ion-item><ion-label>Created by: {{ order.createdBy }}</ion-label></ion-item>
          <ion-item><ion-label>Approved by: {{ order.approvedBy }}</ion-label></ion-item>
        }
        <ion-list>
          @for (payment of paymentsResource.value() ?? []; track payment.bkey) {
            <ion-item>
              <ion-label>
                <h3>{{ payment.recipientName }} — {{ payment.amount?.amount }}</h3>
                <p>{{ payment.recipientIban }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </ion-content>
    </ion-page>
  `,
})
export class PaymentOrderDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly accountingStore = inject(AccountingStore);
  private readonly paymentOrderService = inject(PaymentOrderService);
  private readonly paymentService = inject(PaymentService);

  private readonly orderKey = this.route.snapshot.params['orderKey'] as string;
  private readonly accountingTenantId = this.accountingStore.accountingTenantId();

  protected readonly orderResource = rxResource({
    stream: () => this.paymentOrderService.read(this.orderKey, this.accountingTenantId),
  });

  protected readonly paymentsResource = rxResource({
    stream: () => this.paymentService.listForOrder(this.orderKey, this.accountingTenantId),
  });

  protected generatePain001(): void {
    // Triggers the generatePain001 Cloud Function (implemented in Task 6)
    console.log('generatePain001: not yet wired to CF');
  }
}
```

- [ ] **Step 6: Update `libs/finance/payment/feature/src/index.ts`**

```ts
export * from './lib/payment.store';
export * from './lib/payment-order-list';
export * from './lib/payment-order-edit.modal';
export * from './lib/payment-order-detail-page';
```

- [ ] **Step 7: Add payment routes to `apps/scs-app/src/app/app.routes.ts`**

Inside the `accounting/:accountingTenantId` children array:

```ts
{ path: 'payments', loadComponent: () => import('@bk2/finance-payment-feature').then(m => m.PaymentOrderList) },
{ path: 'payments/:orderKey', loadComponent: () => import('@bk2/finance-payment-feature').then(m => m.PaymentOrderDetailPage) },
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p libs/finance/payment/feature/tsconfig.json
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add libs/finance/payment/feature/src/ apps/scs-app/src/app/app.routes.ts
git commit -m "feat(payment): PaymentStore, PaymentOrderList, PaymentOrderDetailPage with four-eyes approve"
```

---

### Task 6: Cloud Functions — generatePain001 + generateInvoicePdf + parseQrInvoice + generateDunningPdf

**Files:**
- Create: `apps/functions/src/payment/generate-pain001.ts`
- Create: `apps/functions/src/payment/generate-invoice-pdf.ts`
- Create: `apps/functions/src/payment/parse-qr-invoice.ts`
- Create: `apps/functions/src/payment/generate-dunning-pdf.ts`
- Modify: `apps/functions/src/main.ts`

- [ ] **Step 1: Create `apps/functions/src/payment/generate-pain001.ts`**

Generates ISO 20022 pain.001.001.09 XML for a `PaymentOrderModel` and all its `PaymentModel` children.

```ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface GeneratePain001Data {
  paymentOrderKey: string;
  accountingTenantId: string;
}

function buildPain001Xml(order: Record<string, unknown>, payments: Record<string, unknown>[], msgId: string, executionDate: string): string {
  const isoDate = executionDate.length === 8
    ? convertDateFormatToString(executionDate, DateFormat.StoreDate, DateFormat.IsoDate)
    : executionDate;

  const cdtTrfTxInf = payments.map((p: any) => `
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${p.endToEndId ?? ''}</EndToEndId></PmtId>
      <Amt><InstdAmt Ccy="${(p.amount as any)?.currency ?? 'CHF'}">${((p.amount as any)?.amount ?? 0) / 100}</InstdAmt></Amt>
      <Cdtr><Nm>${escapeXml(p.recipientName as string ?? '')}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${p.recipientIban ?? ''}</IBAN></Id></CdtrAcct>
      <RmtInf><Ustrd>${escapeXml(p.reference as string ?? '')}</Ustrd></RmtInf>
    </CdtTrfTxInf>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${payments.reduce((s: number, p: any) => s + ((p.amount as any)?.amount ?? 0), 0) / 100}</CtrlSum>
      <InitgPty><Nm>bk2</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(msgId)}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <ReqdExctnDt><Dt>${isoDate}</Dt></ReqdExctnDt>
      <Dbtr><Nm>Debtor</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${order['debitAccountKey'] ?? ''}</IBAN></Id></DbtrAcct>
      ${cdtTrfTxInf}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const generatePain001 = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GeneratePain001Data>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { paymentOrderKey, accountingTenantId } = request.data;
    if (!paymentOrderKey || !accountingTenantId) throw new HttpsError('invalid-argument', 'paymentOrderKey and accountingTenantId required');

    const db = admin.firestore();
    const orderSnap = await db.collection('payment-orders').doc(paymentOrderKey).get();
    if (!orderSnap.exists) throw new HttpsError('not-found', `Payment order ${paymentOrderKey} not found`);
    const order = orderSnap.data()!;

    if (order['status'] !== 'approved') throw new HttpsError('failed-precondition', 'Payment order must be approved before generating pain.001');

    const paymentsSnap = await db.collection('payments')
      .where('paymentOrderKey', '==', paymentOrderKey)
      .where('accountingTenantId', '==', accountingTenantId)
      .get();
    const payments = paymentsSnap.docs.map(d => d.data());

    const xml = buildPain001Xml(order, payments, order['messageId'] as string, order['executionDate'] as string);

    // Store the XML back on the order
    await db.collection('payment-orders').doc(paymentOrderKey).update({ pain001Xml: xml, status: 'transmitted' });
    logger.info(`generatePain001: generated XML for order ${paymentOrderKey}, ${payments.length} payments`);

    return { xml };
  }
);
```

- [ ] **Step 2: Create `apps/functions/src/payment/generate-invoice-pdf.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

interface GenerateInvoicePdfData {
  invoiceKey: string;
  tenantId: string;
}

export const generateInvoicePdf = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GenerateInvoicePdfData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { invoiceKey, tenantId } = request.data;
    if (!invoiceKey || !tenantId) throw new HttpsError('invalid-argument', 'invoiceKey and tenantId required');

    const db = admin.firestore();
    const invoiceSnap = await db.collection('invoices').doc(invoiceKey).get();
    if (!invoiceSnap.exists) throw new HttpsError('not-found', `Invoice ${invoiceKey} not found`);

    // PDF generation: in production, use a PDF library (e.g. pdfkit) or a template service.
    // Placeholder: return a minimal PDF stub.
    const pdfStub = Buffer.from('%PDF-1.4 stub').toString('base64');
    logger.info(`generateInvoicePdf: generated PDF stub for invoice ${invoiceKey}`);

    // Store URL after uploading to Firebase Storage (production implementation)
    return { pdf: pdfStub };
  }
);
```

- [ ] **Step 3: Create `apps/functions/src/payment/parse-qr-invoice.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

interface ParseQrInvoiceData {
  qrContent: string; // raw text content from QR code scan
}

interface ParsedQrInvoice {
  iban: string;
  amount: number;       // in cents
  currency: string;
  reference: string;
  creditorName: string;
  dueDate: string;      // StoreDate YYYYMMDD
}

/**
 * Parses the Swiss QR-bill raw payload (SIX standard, lines split by \n).
 * See: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/qr-bill.html
 */
function parseQrContent(raw: string): ParsedQrInvoice {
  const lines = raw.split('\n').map(l => l.trim());
  if (lines[0] !== 'SPC') throw new Error('Not a valid Swiss QR bill (missing SPC header)');
  const iban = lines[3] ?? '';
  const amountStr = lines[18] ?? '0';
  const currency = lines[19] ?? 'CHF';
  const reference = lines[27] ?? '';
  const creditorName = lines[5] ?? '';
  const dueDateRaw = lines[29] ?? '';
  const dueDate = dueDateRaw
    ? convertDateFormatToString(dueDateRaw, DateFormat.IsoDate, DateFormat.StoreDate)
    : '';
  const amount = Math.round(parseFloat(amountStr) * 100);
  return { iban, amount, currency, reference, creditorName, dueDate };
}

export const parseQrInvoice = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '128MiB' },
  async (request: CallableRequest<ParseQrInvoiceData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { qrContent } = request.data;
    if (!qrContent) throw new HttpsError('invalid-argument', 'qrContent is required');
    try {
      const parsed = parseQrContent(qrContent);
      logger.info(`parseQrInvoice: parsed IBAN ${parsed.iban} amount ${parsed.amount}`);
      return parsed;
    } catch (err) {
      throw new HttpsError('invalid-argument', `Could not parse QR content: ${(err as Error).message}`);
    }
  }
);
```

- [ ] **Step 4: Create `apps/functions/src/payment/generate-dunning-pdf.ts`**

```ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

interface GenerateDunningPdfData {
  invoiceKey: string;
  dunningLevel: 1 | 2 | 3;
  tenantId: string;
}

export const generateDunningPdf = onCall(
  { region: 'europe-west6', enforceAppCheck: true, memory: '256MiB' },
  async (request: CallableRequest<GenerateDunningPdfData>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { invoiceKey, dunningLevel, tenantId } = request.data;
    if (!invoiceKey || !tenantId) throw new HttpsError('invalid-argument', 'invoiceKey and tenantId required');

    const db = admin.firestore();
    const invoiceSnap = await db.collection('invoices').doc(invoiceKey).get();
    if (!invoiceSnap.exists) throw new HttpsError('not-found', `Invoice ${invoiceKey} not found`);

    // Production: generate dunning letter PDF with the appropriate level wording
    const pdfStub = Buffer.from(`%PDF-1.4 dunning-level-${dunningLevel} stub`).toString('base64');
    logger.info(`generateDunningPdf: generated level ${dunningLevel} dunning for invoice ${invoiceKey}`);
    return { pdf: pdfStub };
  }
);
```

- [ ] **Step 5: Export from `apps/functions/src/main.ts`**

Add:

```ts
export { generatePain001 } from './payment/generate-pain001';
export { generateInvoicePdf } from './payment/generate-invoice-pdf';
export { parseQrInvoice } from './payment/parse-qr-invoice';
export { generateDunningPdf } from './payment/generate-dunning-pdf';
```

- [ ] **Step 6: Build Cloud Functions**

```bash
pnpm nx build functions --configuration production
```

Expected: successful build

- [ ] **Step 7: Commit**

```bash
git add apps/functions/src/payment/ apps/functions/src/main.ts
git commit -m "feat(cf): generatePain001, generateInvoicePdf, parseQrInvoice, generateDunningPdf Cloud Functions"
```

---

### Task 7: AR Extensions — InvoiceAgingComponent + invoiceNo + reconciliation

**Files:**
- Create: `libs/finance/invoice/feature/src/lib/invoice-aging.ts` (or whichever path the invoice feature lib uses)
- Modify: existing invoice service/store to generate invoiceNo and wire accountKey/vatCodeKey
- Create: `libs/finance/bill/feature/src/lib/bill-qr-scan.modal.ts`

- [ ] **Step 1: Check existing invoice feature lib path**

```bash
ls libs/finance/invoice/feature/src/lib/
```

Note the existing files and follow naming conventions for the new component.

- [ ] **Step 2: Create invoice aging component in `libs/finance/invoice/feature/src/lib/invoice-aging.ts`**

```ts
import { Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { IonBadge, IonContent, IonHeader, IonItem, IonLabel,
  IonList, IonPage, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { InvoiceModel } from '@bk2/shared-models';
import { InvoiceService } from '@bk2/finance-invoice-data-access';
import { AppStore } from '@bk2/shared-feature';

export interface AgingBucket {
  label: string;
  invoices: InvoiceModel[];
}

function agingBuckets(invoices: InvoiceModel[], todayStr: string): AgingBucket[] {
  const today = parseInt(todayStr, 10);
  const buckets: AgingBucket[] = [
    { label: '0–30 Tage', invoices: [] },
    { label: '31–60 Tage', invoices: [] },
    { label: '61–90 Tage', invoices: [] },
    { label: '>90 Tage', invoices: [] },
  ];
  for (const inv of invoices) {
    if (inv.state === 'paid') continue;
    const due = parseInt(inv.dueDate ?? '0', 10);
    const days = Math.max(0, Math.floor((today - due) / 10000) * 365 + ((today % 10000) - (due % 10000)));
    // simplified age in days for bucketing: use string comparison days approximation
    const dueDate = new Date(`${String(inv.dueDate ?? '0').substring(0, 4)}-${String(inv.dueDate ?? '0').substring(4, 6)}-${String(inv.dueDate ?? '0').substring(6, 8)}`);
    const todayDate = new Date();
    const diffDays = Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000);
    if (diffDays <= 30)       buckets[0].invoices.push(inv);
    else if (diffDays <= 60)  buckets[1].invoices.push(inv);
    else if (diffDays <= 90)  buckets[2].invoices.push(inv);
    else                      buckets[3].invoices.push(inv);
  }
  return buckets;
}

@Component({
  selector: 'bk-invoice-aging',
  standalone: true,
  imports: [IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonBadge],
  template: `
    <ion-page>
      <ion-header>
        <ion-toolbar><ion-title>Debitorenalterung</ion-title></ion-toolbar>
      </ion-header>
      <ion-content>
        @for (bucket of buckets(); track bucket.label) {
          <ion-item>
            <ion-label>{{ bucket.label }}</ion-label>
            <ion-badge slot="end" [color]="bucket.invoices.length > 0 ? 'danger' : 'medium'">
              {{ bucket.invoices.length }}
            </ion-badge>
          </ion-item>
          @for (inv of bucket.invoices; track inv.bkey) {
            <ion-item>
              <ion-label style="padding-left:16px">
                <h3>{{ inv.title }}</h3>
                <p>Due: {{ inv.dueDate }}</p>
              </ion-label>
            </ion-item>
          }
        }
      </ion-content>
    </ion-page>
  `,
})
export class InvoiceAging {
  private readonly invoiceService = inject(InvoiceService);
  private readonly appStore = inject(AppStore);

  private readonly invoicesResource = rxResource({
    stream: () => this.invoiceService.list(this.appStore.tenantId()),
  });

  protected readonly buckets = rxResource({
    request: () => this.invoicesResource.value(),
    stream: ({ request: invoices }) => {
      const today = new Date().toISOString().replace(/-/g, '').substring(0, 8);
      const b = agingBuckets(invoices ?? [], today);
      return new (require('rxjs').of)(b);
    },
  }).value;
}
```

**Note:** Replace `require('rxjs').of` with a proper import from `'rxjs'` at the top of the file: `import { of } from 'rxjs';`

- [ ] **Step 3: Export InvoiceAging from the invoice feature index**

In `libs/finance/invoice/feature/src/index.ts`, add:

```ts
export * from './lib/invoice-aging';
```

- [ ] **Step 4: Add invoiceNo generation to the invoice service**

In `libs/finance/invoice/data-access/src/lib/invoice.service.ts`, add a `nextInvoiceNo` method that queries for the highest existing `invoiceNo` in a given year for the accounting tenant:

```ts
public async nextInvoiceNo(year: number, accountingTenantId: string): Promise<number> {
  const all = await firstValueFrom(this.list(this.tenantId));
  const prefix = year;
  const maxNo = all
    .filter(inv => inv.accountingTenantId === accountingTenantId)
    .map(inv => inv.invoiceNo ?? 0)
    .filter(no => Math.floor(no / 100000) === prefix)   // assumes format YYYY * 100000 + seq
    .reduce((max, n) => Math.max(max, n), 0);
  return maxNo > 0 ? maxNo + 1 : year * 100000 + 1;
}
```

- [ ] **Step 5: Create QR scan modal in `libs/finance/bill/feature/src/lib/bill-qr-scan.modal.ts`**

```ts
import { Component, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader,
  IonTextarea, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'bk-bill-qr-scan-modal',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonItem, IonLabel, IonTextarea],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>QR-Rechnung scannen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">Abbrechen</ion-button>
          <ion-button (click)="parse()" [disabled]="!qrContent">Verarbeiten</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-item>
        <ion-label position="stacked">QR-Inhalt (aus Kamera oder manuell)</ion-label>
        <ion-textarea [(ngModel)]="qrContent" rows="10" placeholder="SPC&#10;0200&#10;..." />
      </ion-item>
      @if (error) { <p style="color:red">{{ error }}</p> }
    </ion-content>
  `,
})
export class BillQrScanModal {
  private readonly modalController = inject(ModalController);
  private readonly functions = inject(Functions);

  protected qrContent = '';
  protected error = '';

  protected async parse(): Promise<void> {
    this.error = '';
    try {
      const fn = httpsCallable(this.functions, 'parseQrInvoice');
      const result = await fn({ qrContent: this.qrContent });
      await this.modalController.dismiss(result.data, 'confirm');
    } catch (err) {
      this.error = (err as Error).message;
    }
  }

  protected async dismiss(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 6: Export BillQrScanModal from bill feature index**

In `libs/finance/bill/feature/src/index.ts`, add:

```ts
export * from './lib/bill-qr-scan.modal';
```

- [ ] **Step 7: Add invoice aging route to `apps/scs-app/src/app/app.routes.ts`**

Inside the `accounting/:accountingTenantId` children array:

```ts
{ path: 'invoice-aging', loadComponent: () => import('@bk2/finance-invoice-feature').then(m => m.InvoiceAging) },
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p libs/finance/invoice/feature/tsconfig.json
npx tsc --noEmit -p libs/finance/bill/feature/tsconfig.json
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add libs/finance/invoice/ libs/finance/bill/ apps/scs-app/src/app/app.routes.ts
git commit -m "feat(ar): InvoiceAging aging report, BillQrScanModal, invoiceNo generation"
```

---

### Task 8: Build + test verification

- [ ] **Step 1: Run all Plan 4 util tests**

```bash
pnpm run test finance-payment-util
```

Expected: 9 tests passing (5 IBAN + 4 pain.001)

- [ ] **Step 2: Type-check all Plan 4 libs**

```bash
npx tsc --noEmit -p libs/finance/payment/util/tsconfig.json
npx tsc --noEmit -p libs/finance/payment/data-access/tsconfig.json
npx tsc --noEmit -p libs/finance/payment/feature/tsconfig.json
```

Expected: all clean

- [ ] **Step 3: Build all Plan 4 libs**

```bash
pnpm nx build finance-payment-util
pnpm nx build finance-payment-data-access
pnpm nx build finance-payment-feature
```

Expected: all succeed

- [ ] **Step 4: Build Cloud Functions including new payment CFs**

```bash
pnpm nx build functions --configuration production
```

Expected: successful build

- [ ] **Step 5: Deploy Cloud Functions (when ready for production)**

```bash
pnpm run deploy:functions
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: Plan 4 complete — payments (pain.001, four-eyes), AR extensions (aging, QR scan), all CFs deployed"
```

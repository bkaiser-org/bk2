# Application Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full membership-application approval workflow — model, service, store, list, edit modal, form, i18n, routes, and Firestore rules — per spec `docs/2026-05-27-application-feature-spec.md`.

**Architecture:** Four-layer Nx lib under `libs/subject/application/` (util → data-access → ui → feature). `ApplicationService` owns all Firestore writes and workflow transitions; `ApplicationStore` (NgRx Signal Store) drives the approver UI; `ApplicationList` and `ApplicationEditModal` are the two approver-facing components.

**Tech Stack:** Angular 20 (zoneless, standalone), NgRx Signals, Ionic Angular 8, Firestore (via `FirestoreService`), Vitest, `ngx-vest-forms`, `date-fns` via `@bk2/shared-util-core`.

> **Naming note:** The spec writes `@bk2/application-*` for import aliases; this plan uses those names as specified. The actual project convention for other subject-domain libs is `@bk2/subject-<domain>-<layer>` — keep this inconsistency in mind if linting or Nx graph tooling flags it.

> **Constant note:** The spec references `DEFAULT_COUNTRY_CODE` but the actual constant in `@bk2/shared-constants` is `DEFAULT_COUNTRY = 'CH'`. Use `DEFAULT_COUNTRY` everywhere.

> **`getAgeAt` note:** The spec references `getAgeAt(dob, today)`. The actual function in `@bk2/shared-util-core` is `getAge(dob)` (compares against current calendar year). Use `getAge` instead.

> **`ssnValidations` note:** Spec signature includes `countryCode` arg; actual signature is `ssnValidations(fieldName, ssn)` — two args only.

> **`MemberNewModal`:** The actual component name (from `@bk2/relationship-membership-feature`) is `MemberNewModal`, not `MembershipNewModal`.

---

## File Map

| File | Layer | New / Modify |
|---|---|---|
| `libs/shared/models/src/lib/application.model.ts` | shared-models | **Create** |
| `libs/shared/models/src/index.ts` | shared-models | Modify (add export) |
| `libs/subject/application/util/tsconfig.json` | util | **Create** |
| `libs/subject/application/util/tsconfig.lib.json` | util | **Create** |
| `libs/subject/application/util/package.json` | util | **Create** |
| `libs/subject/application/util/project.json` | util | **Create** |
| `libs/subject/application/util/vite.config.ts` | util | **Create** |
| `libs/subject/application/util/src/index.ts` | util | **Create** |
| `libs/subject/application/util/src/lib/application.util.ts` | util | **Create** |
| `libs/subject/application/util/src/lib/application.validations.ts` | util | **Create** |
| `libs/subject/application/util/src/lib/application.util.spec.ts` | util | **Create** |
| `libs/subject/application/data-access/tsconfig.json` | data-access | **Create** |
| `libs/subject/application/data-access/tsconfig.lib.json` | data-access | **Create** |
| `libs/subject/application/data-access/package.json` | data-access | **Create** |
| `libs/subject/application/data-access/project.json` | data-access | **Create** |
| `libs/subject/application/data-access/src/index.ts` | data-access | **Create** |
| `libs/subject/application/data-access/src/lib/scope.ts` | data-access | **Create** |
| `libs/subject/application/data-access/src/lib/application.service.ts` | data-access | **Create** |
| `libs/subject/application/ui/tsconfig.json` | ui | **Create** |
| `libs/subject/application/ui/tsconfig.lib.json` | ui | **Create** |
| `libs/subject/application/ui/package.json` | ui | **Create** |
| `libs/subject/application/ui/project.json` | ui | **Create** |
| `libs/subject/application/ui/src/index.ts` | ui | **Create** |
| `libs/subject/application/ui/src/lib/application.form.ts` | ui | **Create** |
| `libs/subject/application/feature/tsconfig.json` | feature | **Create** |
| `libs/subject/application/feature/tsconfig.lib.json` | feature | **Create** |
| `libs/subject/application/feature/package.json` | feature | **Create** |
| `libs/subject/application/feature/project.json` | feature | **Create** |
| `libs/subject/application/feature/src/index.ts` | feature | **Create** |
| `libs/subject/application/feature/src/lib/application.store.ts` | feature | **Create** |
| `libs/subject/application/feature/src/lib/application-list.ts` | feature | **Create** |
| `libs/subject/application/feature/src/lib/application-edit.modal.ts` | feature | **Create** |
| `libs/subject/application/feature/src/i18n/de.json` | feature | **Create** |
| `tsconfig.base.json` | root | Modify (add 4 path aliases) |
| `apps/scs-app/src/app/app.routes.ts` | app | Modify (add 2 routes) |
| `apps/scs-app/src/assets/i18n/de.json` | app | Modify (merge application i18n) |
| `firestore.rules` | root | Modify (add applications block) |

---

## Task 1: ApplicationModel — add to shared-models

**Files:**
- Create: `libs/shared/models/src/lib/application.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Create the model file**

```typescript
// libs/shared/models/src/lib/application.model.ts
import {
  DEFAULT_COUNTRY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_INDEX,
  DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_TAGS, DEFAULT_TENANTS
} from '@bk2/shared-constants';
import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';

export class ApplicationModel implements BkModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // applicant — person data
  public firstName = DEFAULT_NAME;
  public lastName = DEFAULT_NAME;
  public gender: 'male' | 'female' = DEFAULT_GENDER as 'male' | 'female';
  public dateOfBirth = DEFAULT_DATE;
  public ssnId = DEFAULT_ID;

  // applicant — contact channels
  public email = DEFAULT_EMAIL;
  public phone = DEFAULT_PHONE;

  // applicant — address
  public streetName = DEFAULT_NAME;
  public streetNumber = '';
  public zipCode = '';
  public city = '';
  public countryCode = DEFAULT_COUNTRY;

  // parent contact — youth only
  public parentFirstName = DEFAULT_NAME;
  public parentLastName = DEFAULT_NAME;
  public parentEmail = DEFAULT_EMAIL;
  public parentPhone = DEFAULT_PHONE;

  // application
  public applicationAs: ApplicationKind = 'adult';
  public state: ApplicationState = 'applied';

  // workflow bookkeeping
  public submittedAt = '';
  public reviewedAt = '';
  public closedAt = '';
  public reviewer: AvatarInfo | undefined;
  public closeReason = '';
  public personKey = DEFAULT_KEY;
  public taskKey = DEFAULT_KEY;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ApplicationCollection = 'applications';
export const ApplicationModelName = 'application';

export type ApplicationState =
  | 'applied'
  | 'reviewing'
  | 'closed.approved'
  | 'closed.cancelled'
  | 'closed.denied';

export const APPLICATION_STATE_VALUES: ApplicationState[] = [
  'applied', 'reviewing', 'closed.approved', 'closed.cancelled', 'closed.denied'
];

export type ApplicationKind = 'youth' | 'adult' | 'transfer';
export const APPLICATION_KIND_VALUES: ApplicationKind[] = ['youth', 'adult', 'transfer'];
```

- [ ] **Step 2: Add export to shared-models index**

In `libs/shared/models/src/index.ts`, add after the last export line (check the file — insert alphabetically by filename):

```typescript
export * from './lib/application.model';
```

- [ ] **Step 3: Type-check shared-models**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/models/src/lib/application.model.ts libs/shared/models/src/index.ts
git commit -m "feat(shared-models): add ApplicationModel, ApplicationState, ApplicationKind"
```

---

## Task 2: Scaffold util layer

**Files:**
- Create: `libs/subject/application/util/tsconfig.json`
- Create: `libs/subject/application/util/tsconfig.lib.json`
- Create: `libs/subject/application/util/package.json`
- Create: `libs/subject/application/util/project.json`
- Create: `libs/subject/application/util/vite.config.ts`
- Create: `libs/subject/application/util/src/index.ts`

- [ ] **Step 1: Create tsconfig.json**

```json
// libs/subject/application/util/tsconfig.json
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
    {"path": "../../../subject/person/util/tsconfig.lib.json"},
    {"path": "../../../subject/address/util/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create tsconfig.lib.json**

```json
// libs/subject/application/util/tsconfig.lib.json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/subject/application/util",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/subject-application-util.tsbuildinfo"
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

- [ ] **Step 3: Create package.json**

```json
// libs/subject/application/util/package.json
{
  "name": "@bk2/application-util",
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
    "@bk2/subject-person-util": "*",
    "@bk2/subject-address-util": "*"
  }
}
```

- [ ] **Step 4: Create project.json**

```json
// libs/subject/application/util/project.json
{
  "name": "subject-application-util",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/subject/application/util/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:util", "scope:application", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/subject/application/util",
        "main": "libs/subject/application/util/src/index.ts",
        "tsConfig": "libs/subject/application/util/tsconfig.lib.json",
        "assets": ["libs/subject/application/util/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "configFile": "libs/subject/application/util/vite.config.ts"
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create vite.config.ts**

```typescript
// libs/subject/application/util/vite.config.ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../../node_modules/.vite/libs/subject/application/util',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    coverage: {
      reportsDirectory: '../../../../coverage/libs/subject/application/util',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

- [ ] **Step 6: Create empty index.ts**

```typescript
// libs/subject/application/util/src/index.ts
export * from './lib/application.util';
export * from './lib/application.validations';
```

- [ ] **Step 7: Add tsconfig.base.json alias for util**

In `tsconfig.base.json`, inside the `"paths"` object (add in alphabetical order near other `@bk2/a*` entries):

```json
"@bk2/application-util": ["libs/subject/application/util/src/index.ts"],
```

- [ ] **Step 8: Commit scaffold**

```bash
git add libs/subject/application/util/ tsconfig.base.json
git commit -m "feat(application): scaffold util layer"
```

---

## Task 3: application.util.ts — pure functions + tests

**Files:**
- Create: `libs/subject/application/util/src/lib/application.util.ts`
- Create: `libs/subject/application/util/src/lib/application.util.spec.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// libs/subject/application/util/src/lib/application.util.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { ApplicationModel } from '@bk2/shared-models';

vi.mock('@bk2/shared-util-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@bk2/shared-util-core')>();
  return { ...actual };
});

import {
  newApplication,
  getApplicationIndex,
  needsSsn,
  toPersonModel,
  matchesStateFilter,
  stateColor,
  proposeMembershipCategory,
} from './application.util';

describe('newApplication', () => {
  it('returns ApplicationModel with state=applied and countryCode=CH', () => {
    const app = newApplication('tenant1');
    expect(app.state).toBe('applied');
    expect(app.countryCode).toBe('CH');
    expect(app.tenants).toContain('tenant1');
  });
});

describe('getApplicationIndex', () => {
  it('includes firstName, lastName, zipCode, city, applicationAs, state', () => {
    const app = newApplication('t');
    app.firstName = 'Anna';
    app.lastName = 'Müller';
    app.zipCode = '8000';
    app.city = 'Zürich';
    app.applicationAs = 'youth';
    app.state = 'applied';
    const idx = getApplicationIndex(app);
    expect(idx).toContain('Anna');
    expect(idx).toContain('Müller');
    expect(idx).toContain('8000');
    expect(idx).toContain('Zürich');
    expect(idx).toContain('youth');
    expect(idx).toContain('applied');
  });
});

describe('needsSsn', () => {
  it('returns true when applicationAs is youth', () => {
    const app = newApplication('t');
    app.applicationAs = 'youth';
    app.dateOfBirth = '20100101'; // under 20
    expect(needsSsn(app)).toBe(true);
  });

  it('returns true when applicant is under 20 (adult form)', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    const year = new Date().getFullYear();
    app.dateOfBirth = `${year - 10}0101`; // 10 years old
    expect(needsSsn(app)).toBe(true);
  });

  it('returns false when applicant is 20+ and not youth', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    app.dateOfBirth = '19900101'; // well over 20
    expect(needsSsn(app)).toBe(false);
  });
});

describe('toPersonModel', () => {
  it('maps application fields to PersonModel', () => {
    const app = newApplication('t');
    app.firstName = 'Lukas';
    app.lastName = 'Meier';
    app.gender = 'male';
    app.dateOfBirth = '20050605';
    app.ssnId = '756.1234.5678.90';
    app.email = 'lukas@example.com';
    app.phone = '+41791234567';
    app.zipCode = '8001';
    const person = toPersonModel(app, 't');
    expect(person.firstName).toBe('Lukas');
    expect(person.lastName).toBe('Meier');
    expect(person.gender).toBe('male');
    expect(person.dateOfBirth).toBe('20050605');
    expect(person.ssnId).toBe('756.1234.5678.90');
    expect(person.favEmail).toBe('lukas@example.com');
    expect(person.favPhone).toBe('+41791234567');
    expect(person.favZipCode).toBe('8001');
    expect(person.tenants).toContain('t');
  });
});

describe('matchesStateFilter', () => {
  it("'all' matches any state", () => {
    expect(matchesStateFilter('applied', 'all')).toBe(true);
    expect(matchesStateFilter('closed.approved', 'all')).toBe(true);
  });

  it("'open' matches applied and reviewing", () => {
    expect(matchesStateFilter('applied', 'open')).toBe(true);
    expect(matchesStateFilter('reviewing', 'open')).toBe(true);
    expect(matchesStateFilter('closed.approved', 'open')).toBe(false);
  });

  it("'closed' matches states starting with 'closed.'", () => {
    expect(matchesStateFilter('closed.approved', 'closed')).toBe(true);
    expect(matchesStateFilter('closed.denied', 'closed')).toBe(true);
    expect(matchesStateFilter('reviewing', 'closed')).toBe(false);
  });

  it('exact match works', () => {
    expect(matchesStateFilter('applied', 'applied')).toBe(true);
    expect(matchesStateFilter('reviewing', 'applied')).toBe(false);
  });
});

describe('stateColor', () => {
  it('maps states to ion colors', () => {
    expect(stateColor('applied')).toBe('warning');
    expect(stateColor('reviewing')).toBe('primary');
    expect(stateColor('closed.approved')).toBe('success');
    expect(stateColor('closed.denied')).toBe('danger');
    expect(stateColor('closed.cancelled')).toBe('medium');
  });
});

describe('proposeMembershipCategory', () => {
  it('returns junior for under-20 applicant', () => {
    const app = newApplication('t');
    const year = new Date().getFullYear();
    app.dateOfBirth = `${year - 15}0101`;
    expect(proposeMembershipCategory(app)).toBe('junior');
  });

  it('returns active for transfer applicant 20+', () => {
    const app = newApplication('t');
    app.applicationAs = 'transfer';
    app.dateOfBirth = '19900101';
    expect(proposeMembershipCategory(app)).toBe('active');
  });

  it('returns candidate for adult 20+ non-transfer', () => {
    const app = newApplication('t');
    app.applicationAs = 'adult';
    app.dateOfBirth = '19900101';
    expect(proposeMembershipCategory(app)).toBe('candidate');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm run test subject-application-util
```

Expected: FAIL — module not found / functions not defined.

- [ ] **Step 3: Implement application.util.ts**

```typescript
// libs/subject/application/util/src/lib/application.util.ts
import { DEFAULT_COUNTRY } from '@bk2/shared-constants';
import {
  ApplicationKind, ApplicationModel, ApplicationState,
  PersonModel
} from '@bk2/shared-models';
import { addIndexElement, getAge } from '@bk2/shared-util-core';

export function newApplication(tenantId: string): ApplicationModel {
  const app = new ApplicationModel(tenantId);
  app.countryCode = DEFAULT_COUNTRY;
  app.state = 'applied';
  return app;
}

export function getApplicationIndex(app: ApplicationModel): string {
  let idx = '';
  idx = addIndexElement(idx, 'fn', app.firstName);
  idx = addIndexElement(idx, 'n', app.lastName);
  idx = addIndexElement(idx, 'z', app.zipCode);
  idx = addIndexElement(idx, 'c', app.city);
  idx = addIndexElement(idx, 'k', app.applicationAs);
  idx = addIndexElement(idx, 's', app.state);
  return idx;
}

export function needsSsn(app: ApplicationModel): boolean {
  if (app.applicationAs === 'youth') return true;
  const age = getAge(app.dateOfBirth);
  return age >= 0 && age < 20;
}

export function toPersonModel(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName   = app.firstName;
  p.lastName    = app.lastName;
  p.gender      = app.gender;
  p.dateOfBirth = app.dateOfBirth;
  p.ssnId       = app.ssnId;
  p.favEmail    = app.email;
  p.favPhone    = app.phone;
  p.favZipCode  = app.zipCode;
  return p;
}

export function newParentPerson(app: ApplicationModel, tenantId: string): PersonModel {
  const p = new PersonModel(tenantId);
  p.firstName  = app.parentFirstName;
  p.lastName   = app.parentLastName;
  p.gender     = 'female';
  p.favEmail   = app.parentEmail;
  p.favPhone   = app.parentPhone;
  p.favZipCode = app.zipCode;
  return p;
}

export function matchesStateFilter(state: ApplicationState, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return state === 'applied' || state === 'reviewing';
  if (filter === 'closed') return state.startsWith('closed.');
  return state === filter;
}

export function stateColor(state: ApplicationState): 'warning' | 'primary' | 'success' | 'danger' | 'medium' {
  switch (state) {
    case 'applied':          return 'warning';
    case 'reviewing':        return 'primary';
    case 'closed.approved':  return 'success';
    case 'closed.denied':    return 'danger';
    case 'closed.cancelled': return 'medium';
  }
}

export function proposeMembershipCategory(app: ApplicationModel): 'junior' | 'active' | 'candidate' {
  const age = getAge(app.dateOfBirth);
  if (age < 20)                          return 'junior';
  if (app.applicationAs === 'transfer')  return 'active';
  return 'candidate';
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm run test subject-application-util
```

Expected: all tests PASS.

- [ ] **Step 5: Type-check util**

```bash
npx tsc --noEmit -p libs/subject/application/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/subject/application/util/src/lib/application.util.ts libs/subject/application/util/src/lib/application.util.spec.ts
git commit -m "feat(application-util): newApplication, getApplicationIndex, needsSsn, toPersonModel, matchesStateFilter, stateColor, proposeMembershipCategory"
```

---

## Task 4: application.validations.ts

**Files:**
- Create: `libs/subject/application/util/src/lib/application.validations.ts`

> The `ssnValidations` signature in this codebase is `ssnValidations(fieldName, ssn)` — no `countryCode` argument. The email regex constant is `EMAIL_RE`: check if it is already exported from `@bk2/shared-util-core`; if not, define it inline as `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

- [ ] **Step 1: Check EMAIL_RE availability**

```bash
grep -rn "EMAIL_RE\|EMAIL_REGEX" libs/shared/util-core/src --include="*.ts" | head -5
```

Note whether `EMAIL_RE` is exported from `@bk2/shared-util-core`. If yes, import it; if not, define inline.

- [ ] **Step 2: Create application.validations.ts**

```typescript
// libs/subject/application/util/src/lib/application.validations.ts
import { create, enforce, omitWhen, test } from 'vest';
import { ApplicationModel } from '@bk2/shared-models';
import { ssnValidations } from '@bk2/subject-person-util';
import { needsSsn } from './application.util';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const applicationValidationSuite = create((app: ApplicationModel, field?: string) => {
  test('firstName',     '@application/field.first_name',     () => enforce(app.firstName).isNotBlank());
  test('lastName',      '@application/field.last_name',      () => enforce(app.lastName).isNotBlank());
  test('gender',        '@application/field.gender',         () => enforce(app.gender).inside(['male', 'female']));
  test('dateOfBirth',   '@application/field.date_of_birth',  () => enforce(app.dateOfBirth).matches(/^\d{8}$/));
  test('streetName',    '@application/field.street_name',    () => enforce(app.streetName).isNotBlank());
  test('streetNumber',  '@application/field.street_number',  () => enforce(app.streetNumber).isNotBlank());
  test('zipCode',       '@application/field.zip_code',       () => enforce(app.zipCode).isNotBlank());
  test('city',          '@application/field.city',           () => enforce(app.city).isNotBlank());
  test('countryCode',   '@application/field.country_code',   () => enforce(app.countryCode).isNotBlank());
  test('applicationAs', '@application/field.application_as', () => enforce(app.applicationAs).inside(['youth', 'adult', 'transfer']));

  omitWhen(!needsSsn(app), () => {
    test('ssnId', '@application/field.ssn', () => enforce(app.ssnId).isNotBlank());
    ssnValidations('ssnId', app.ssnId);
  });

  omitWhen(!app.email,       () => test('email',       '@application/field.email',        () => enforce(app.email).matches(EMAIL_RE)));
  omitWhen(!app.parentEmail, () => test('parentEmail', '@application/field.parent_email', () => enforce(app.parentEmail).matches(EMAIL_RE)));

  if (app.applicationAs !== 'youth') {
    test('email', '@application/field.email', () => enforce(app.email).isNotBlank());
    test('phone', '@application/field.phone', () => enforce(app.phone).isNotBlank());
  } else {
    test('parentFirstName', '@application/field.parent_first_name', () => enforce(app.parentFirstName).isNotBlank());
    test('parentLastName',  '@application/field.parent_last_name',  () => enforce(app.parentLastName).isNotBlank());

    test('email', '@application/validation.email_required_either', () => {
      enforce(!!app.email || !!app.parentEmail).isTruthy();
    });
    test('phone', '@application/validation.phone_required_either', () => {
      enforce(!!app.phone || !!app.parentPhone).isTruthy();
    });
  }
});
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/subject/application/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/application/util/src/lib/application.validations.ts
git commit -m "feat(application-util): applicationValidationSuite vest validations"
```

---

## Task 5: Scaffold data-access layer + scope

**Files:**
- Create all `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json` files for data-access
- Create: `libs/subject/application/data-access/src/lib/scope.ts`
- Create: `libs/subject/application/data-access/src/index.ts`

- [ ] **Step 1: Create tsconfig.json**

```json
// libs/subject/application/data-access/tsconfig.json
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
    {"path": "../../../activity/data-access/tsconfig.lib.json"},
    {"path": "../../../shared/models/tsconfig.lib.json"},
    {"path": "../../../shared/config/tsconfig.lib.json"},
    {"path": "../../../shared/data-access/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../relationship/personal-rel/data-access/tsconfig.lib.json"},
    {"path": "../../../relationship/responsibility/data-access/tsconfig.lib.json"},
    {"path": "../../../subject/address/data-access/tsconfig.lib.json"},
    {"path": "../../../subject/address/util/tsconfig.lib.json"},
    {"path": "../../../subject/person/data-access/tsconfig.lib.json"},
    {"path": "../../../subject/application/util/tsconfig.lib.json"},
    {"path": "../../../task/data-access/tsconfig.lib.json"}
  ]
}
```

- [ ] **Step 2: Create tsconfig.lib.json**

```json
// libs/subject/application/data-access/tsconfig.lib.json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/subject/application/data-access",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/subject-application-data-access.tsbuildinfo"
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

- [ ] **Step 3: Create package.json**

```json
// libs/subject/application/data-access/package.json
{
  "name": "@bk2/application-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/activity-data-access": "*",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/relationship-personal-rel-data-access": "*",
    "@bk2/relationship-responsibility-data-access": "*",
    "@bk2/subject-address-data-access": "*",
    "@bk2/subject-address-util": "*",
    "@bk2/subject-person-data-access": "*",
    "@bk2/application-util": "*",
    "@bk2/task-data-access": "*"
  }
}
```

- [ ] **Step 4: Create project.json**

```json
// libs/subject/application/data-access/project.json
{
  "name": "subject-application-data-access",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/subject/application/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:application", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/subject/application/data-access",
        "main": "libs/subject/application/data-access/src/index.ts",
        "tsConfig": "libs/subject/application/data-access/tsconfig.lib.json",
        "assets": ["libs/subject/application/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

- [ ] **Step 5: Create scope.ts and index.ts**

```typescript
// libs/subject/application/data-access/src/lib/scope.ts
export const PFX = '@application/';
```

```typescript
// libs/subject/application/data-access/src/index.ts
export * from './lib/application.service';
```

- [ ] **Step 6: Add tsconfig.base.json alias for data-access**

In `tsconfig.base.json`, add:

```json
"@bk2/application-data-access": ["libs/subject/application/data-access/src/index.ts"],
```

- [ ] **Step 7: Commit scaffold**

```bash
git add libs/subject/application/data-access/ tsconfig.base.json
git commit -m "feat(application): scaffold data-access layer"
```

---

## Task 6: ApplicationService

**Files:**
- Create: `libs/subject/application/data-access/src/lib/application.service.ts`

> Before writing this service, confirm `task-data-access` exports `TaskService`. Run:
> `grep -n "TaskService" libs/task/data-access/src/index.ts`

> The Mailgun call uses `httpsCallable(getFunctions(getApp(), 'europe-west6'), 'sendEmail')` with payload `{ to, cc, bcc, appId, html, from, subject, provider, template }` — see `section.store.ts:447`.

- [ ] **Step 1: Create application.service.ts**

```typescript
// libs/subject/application/data-access/src/lib/application.service.ts
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import {
  ApplicationCollection, ApplicationModel, ApplicationState, AvatarInfo,
  PersonalRelModel, TaskCollection, TaskModel, UserModel
} from '@bk2/shared-models';
import {
  addWorkDays, getAvatarInfo, getAvatarInfoForCurrentUser,
  getSystemQuery, getTodayStr, isValidAt
} from '@bk2/shared-util-core';
import { showToast } from '@bk2/shared-util-angular';
import { ToastController } from '@ionic/angular/standalone';
import { ActivityService } from '@bk2/activity-data-access';
import { PersonalRelService } from '@bk2/relationship-personal-rel-data-access';
import { ResponsibilityService } from '@bk2/relationship-responsibility-data-access';
import { AddressService } from '@bk2/subject-address-data-access';
import { createFavoriteAddress } from '@bk2/subject-address-util';
import { PersonService } from '@bk2/subject-person-data-access';
import { TaskService } from '@bk2/task-data-access';
import {
  getApplicationIndex, newParentPerson, toPersonModel
} from '@bk2/application-util';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private readonly env             = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService  = inject(ActivityService);
  private readonly personService    = inject(PersonService);
  private readonly addressService   = inject(AddressService);
  private readonly personalRelService = inject(PersonalRelService);
  private readonly responsibilityService = inject(ResponsibilityService);
  private readonly taskService      = inject(TaskService);
  private readonly toastController  = inject(ToastController);
  private readonly i18nService      = inject(I18nService);

  private readonly i18n = this.i18nService.translateAll({
    create_conf:        PFX + 'edit.save_conf',
    create_error:       PFX + 'edit.save_error',
    update_conf:        PFX + 'edit.save_conf',
    update_error:       PFX + 'edit.save_error',
    delete_conf:        PFX + 'delete.conf',
    delete_error:       PFX + 'delete.error',
    accept_conf:        PFX + 'edit.accept_conf',
    accept_error:       PFX + 'edit.accept_error',
    deny_conf:          PFX + 'edit.deny_conf',
    deny_error:         PFX + 'edit.deny_error',
    mail_conf:          PFX + 'mail.confirmation_sent',
    mail_decision_conf: PFX + 'mail.decision_sent',
    mail_failed:        PFX + 'mail.send_failed',
  });

  private readonly sendEmailFn = httpsCallable<unknown, void>(
    getFunctions(getApp(), 'europe-west6'),
    'sendEmail'
  );

  /*----------- CRUD ----------- */

  public list(orderBy = 'submittedAt', sortOrder: 'asc' | 'desc' = 'desc'): Observable<ApplicationModel[]> {
    return this.firestoreService.searchData<ApplicationModel>(
      ApplicationCollection,
      getSystemQuery(this.env.tenantId),
      orderBy,
      sortOrder
    );
  }

  public read(key?: string): Observable<ApplicationModel | undefined> {
    if (!key) return new Observable(s => s.next(undefined));
    return this.firestoreService.readModel<ApplicationModel>(ApplicationCollection, key);
  }

  public async create(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    application.submittedAt = new Date().toISOString();
    application.state       = 'applied';
    application.index       = getApplicationIndex(application);
    const key = await this.firestoreService.createModel<ApplicationModel>(
      ApplicationCollection, application, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
    if (!key) return undefined;
    application.bkey = key;

    // Create linked task
    const taskKey = await this.createApplicationTask(application, currentUser);
    if (taskKey) {
      application.taskKey = taskKey;
      await this.firestoreService.updateModel<ApplicationModel>(
        ApplicationCollection, application, false, '', '', currentUser
      );
    }

    // Confirmation email (non-blocking)
    void this.sendConfirmationMail(application);

    void this.activityService.log('application', 'create', currentUser,
      `${key}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → applied`);
    return key;
  }

  public async update(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    application.index = getApplicationIndex(application);
    const key = await this.firestoreService.updateModel<ApplicationModel>(
      ApplicationCollection, application, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
    void this.activityService.log('application', 'update', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → ${application.state}`);
    return key;
  }

  public async delete(application: ApplicationModel, currentUser?: UserModel): Promise<void> {
    application.isArchived = true;
    await this.firestoreService.updateModel<ApplicationModel>(
      ApplicationCollection, application, false, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
    void this.activityService.log('application', 'delete', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName}`);
  }

  /*----------- Workflow ----------- */

  public async beginReview(application: ApplicationModel, reviewer: AvatarInfo, currentUser?: UserModel): Promise<void> {
    if (application.state !== 'applied') return;
    application.state      = 'reviewing';
    application.reviewedAt = new Date().toISOString();
    application.reviewer   = reviewer;
    await this.update(application, currentUser);
    void this.activityService.log('application', 'begin-review', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName}`);
  }

  public async accept(application: ApplicationModel, currentUser?: UserModel): Promise<string | undefined> {
    if (application.state !== 'reviewing') return undefined;

    const tenantId = this.env.tenantId;

    // Step 1: Create applicant person
    const kid     = toPersonModel(application, tenantId);
    const kidsKey = await this.personService.create(kid, currentUser);
    if (!kidsKey) throw new Error('ApplicationService.accept: personService.create failed');

    // Step 2: Applicant addresses
    await this.createApplicantAddresses(application, kidsKey, currentUser);

    // Steps 4–6 + 7–10 for youth
    if (application.applicationAs === 'youth') {
      await this.provisionYouthExtras(application, kidsKey, kid, tenantId, currentUser);
    }

    // Close application
    application.state     = 'closed.approved';
    application.closedAt  = new Date().toISOString();
    application.personKey = kidsKey;
    await this.update(application, currentUser);

    // Close linked task
    await this.closeLinkedTask(application, currentUser);

    // Send acceptance email (non-blocking)
    void this.sendDecisionMail('application.accepted', application, kidsKey, currentUser);

    void this.activityService.log('application', 'accept', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} (${application.applicationAs}) → closed.approved`);
    return kidsKey;
  }

  public async deny(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void> {
    await this.closeApplication(application, 'closed.denied', reason, currentUser);
    void this.sendDecisionMail('application.denied', application, undefined, currentUser);
    void this.activityService.log('application', 'deny', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} → closed.denied`);
  }

  public async cancel(application: ApplicationModel, reason: string, currentUser?: UserModel): Promise<void> {
    await this.closeApplication(application, 'closed.cancelled', reason, currentUser);
    void this.activityService.log('application', 'cancel', currentUser,
      `${application.bkey}: ${application.lastName}/${application.firstName} → closed.cancelled`);
  }

  /*----------- Private helpers ----------- */

  private async createApplicantAddresses(
    app: ApplicationModel, kidsKey: string, currentUser?: UserModel
  ): Promise<void> {
    const parentKey = 'person.' + kidsKey;
    if (app.email) {
      const a = createFavoriteAddress('email', 'home', app.email, this.env.tenantId);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.phone) {
      const a = createFavoriteAddress('phone', 'home', app.phone, this.env.tenantId);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.streetName) {
      const a = createFavoriteAddress('postal', 'home', app.streetName, this.env.tenantId,
        app.streetNumber, '', app.zipCode, app.city, app.countryCode);
      a.parentKey = parentKey;
      await this.addressService.create(a, currentUser);
    }
  }

  private async provisionYouthExtras(
    app: ApplicationModel,
    kidsKey: string,
    kid: ReturnType<typeof toPersonModel>,
    tenantId: string,
    currentUser?: UserModel
  ): Promise<void> {
    // Step 4: parent person
    const parent     = newParentPerson(app, tenantId);
    const parentsKey = await this.personService.create(parent, currentUser);
    if (!parentsKey) throw new Error('ApplicationService.accept: parent personService.create failed');

    // Parent addresses
    if (app.parentEmail) {
      const a = createFavoriteAddress('email', 'home', app.parentEmail, tenantId);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }
    if (app.parentPhone) {
      const a = createFavoriteAddress('phone', 'home', app.parentPhone, tenantId);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }

    // Step 5: copy postal to parent
    if (app.streetName) {
      const a = createFavoriteAddress('postal', 'home', app.streetName, tenantId,
        app.streetNumber, '', app.zipCode, app.city, app.countryCode);
      a.parentKey = 'person.' + parentsKey;
      await this.addressService.create(a, currentUser);
    }

    // Step 6: parentChild relation
    const rel = new PersonalRelModel(tenantId);
    rel.subjectKey       = parentsKey;
    rel.subjectFirstName = parent.firstName;
    rel.subjectLastName  = parent.lastName;
    rel.subjectGender    = parent.gender;
    rel.objectKey        = kidsKey;
    rel.objectFirstName  = kid.firstName;
    rel.objectLastName   = kid.lastName;
    rel.objectGender     = kid.gender;
    rel.type             = 'parentChild';
    await this.personalRelService.create(rel, currentUser);

    // Steps 7–10: per-channel Eltern addresses on kid
    await this.applyParentChannel('email', app.email, app.parentEmail, kidsKey, tenantId, currentUser);
    await this.applyParentChannel('phone', app.phone, app.parentPhone, kidsKey, tenantId, currentUser);
  }

  private async applyParentChannel(
    channel: 'email' | 'phone',
    kidValue: string,
    parentValue: string,
    kidsKey: string,
    tenantId: string,
    currentUser?: UserModel
  ): Promise<void> {
    if (!kidValue && !parentValue) {
      throw new Error(`ApplicationService.accept: channel '${channel}' has no kid or parent value`);
    }
    if (!parentValue) return; // case (b)

    const a = createFavoriteAddress(channel, 'custom', parentValue, tenantId);
    a.addressUsageLabel = 'Eltern';
    a.parentKey         = 'person.' + kidsKey;

    if (kidValue) {
      a.isFavorite = false;
      a.isCc       = true;
    }
    await this.addressService.create(a, currentUser);
  }

  private async closeApplication(
    application: ApplicationModel,
    state: ApplicationState,
    reason: string,
    currentUser?: UserModel
  ): Promise<void> {
    application.state       = state;
    application.closedAt    = new Date().toISOString();
    application.closeReason = reason;
    await this.update(application, currentUser);
    await this.closeLinkedTask(application, currentUser);
  }

  private async closeLinkedTask(application: ApplicationModel, currentUser?: UserModel): Promise<void> {
    if (!application.taskKey) return;
    const task = await firstValueFrom(this.taskService.read(application.taskKey));
    if (!task) return;
    task.state          = 'closed';
    task.completionDate = getTodayStr();
    if (application.closeReason) {
      task.notes = `${task.notes}\n[${application.state}] ${application.closeReason}`.trim();
    }
    await this.taskService.update(task, currentUser);
  }

  private async createApplicationTask(
    application: ApplicationModel,
    currentUser?: UserModel
  ): Promise<string | undefined> {
    const task       = new TaskModel(this.env.tenantId);
    task.name        = `Antrag: ${application.firstName} ${application.lastName} (${application.applicationAs})`;
    task.author      = currentUser ? getAvatarInfo(currentUser, 'user-person') : undefined;
    task.assignee    = await this.resolveApplicationApprover();
    task.tags        = `application,${application.applicationAs}`;
    task.priority    = 1;
    task.dueDate     = addWorkDays(getTodayStr(), 7);
    return this.taskService.create(task, currentUser);
  }

  private async resolveApplicationApprover(): Promise<AvatarInfo | undefined> {
    const today = getTodayStr();
    const responsibilities = await firstValueFrom(this.responsibilityService.list());
    const resp = responsibilities.find(r =>
      r.name === 'application' &&
      isValidAt(r.validFrom, r.validTo, today)
    );
    if (!resp) return undefined;
    const today2 = getTodayStr();
    if (resp.delegateAvatar && isValidAt(resp.delegateValidFrom, resp.delegateValidTo, today2)) {
      return resp.delegateAvatar;
    }
    return resp.responsibleAvatar;
  }

  private async sendConfirmationMail(app: ApplicationModel): Promise<void> {
    const { to, cc } = this.resolveConfirmationRecipients(app);
    if (!to) return;
    try {
      await this.sendEmailFn({
        to: [to],
        cc: cc.length > 0 ? cc : undefined,
        appId: this.env.appId,
        subject: 'Wir haben Ihren Antrag erhalten',
        html: '',
        from: this.env.appId + '@app.bkaiser.ch',
        provider: 'mailgun_smtp',
        template: 'application.confirmation',
      });
      await showToast(this.toastController, this.i18n.mail_conf());
    } catch {
      await showToast(this.toastController, this.i18n.mail_failed());
    }
  }

  private resolveConfirmationRecipients(app: ApplicationModel): { to: string; cc: string[] } {
    if (app.applicationAs !== 'youth') {
      return { to: app.email, cc: [] };
    }
    if (app.email && app.parentEmail) return { to: app.email, cc: [app.parentEmail] };
    if (app.email)       return { to: app.email, cc: [] };
    if (app.parentEmail) return { to: app.parentEmail, cc: [] };
    return { to: '', cc: [] };
  }

  private async sendDecisionMail(
    template: string,
    app: ApplicationModel,
    personKey: string | undefined,
    currentUser?: UserModel
  ): Promise<void> {
    // After accept, resolve from created person's addresses; for deny use raw fields
    const to = app.email || app.parentEmail;
    if (!to) return;
    const cc: string[] = (app.email && app.parentEmail) ? [app.parentEmail] : [];
    try {
      await this.sendEmailFn({
        to: [to],
        cc: cc.length > 0 ? cc : undefined,
        appId: this.env.appId,
        subject: template === 'application.accepted'
          ? 'Ihr Antrag wurde angenommen'
          : 'Ihr Antrag wurde nicht angenommen',
        html: '',
        from: this.env.appId + '@app.bkaiser.ch',
        provider: 'mailgun_smtp',
        template,
      });
      await showToast(this.toastController, this.i18n.mail_decision_conf());
    } catch {
      await showToast(this.toastController, this.i18n.mail_failed());
    }
  }
}
```

- [ ] **Step 2: Type-check data-access**

```bash
npx tsc --noEmit -p libs/subject/application/data-access/tsconfig.json
```

Fix any type errors before continuing. Common issues:
- `task.tags` — check TaskModel: if `tags` is `string` not `string[]`, change to `task.tags = 'application,' + application.applicationAs;`
- `DEFAULT_COUNTRY` import path

- [ ] **Step 3: Commit**

```bash
git add libs/subject/application/data-access/src/lib/application.service.ts
git commit -m "feat(application-data-access): ApplicationService CRUD + accept/deny/cancel workflow"
```

---

## Task 7: Scaffold ui layer + ApplicationForm

**Files:**
- Create: all ui layer scaffolding files
- Create: `libs/subject/application/ui/src/lib/application.form.ts`

- [ ] **Step 1: Create ui layer scaffold files**

`libs/subject/application/ui/tsconfig.json`:
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
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/ui/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../shared/categories/tsconfig.lib.json"},
    {"path": "../../../subject/swisscities/ui/tsconfig.lib.json"},
    {"path": "../../../subject/application/util/tsconfig.lib.json"}
  ]
}
```

`libs/subject/application/ui/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/subject/application/ui",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/subject-application-ui.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/subject/application/ui/package.json`:
```json
{
  "name": "@bk2/application-ui",
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
    "@bk2/shared-util-core": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-categories": "*",
    "@bk2/subject-swisscities-ui": "*",
    "@bk2/application-util": "*"
  }
}
```

`libs/subject/application/ui/project.json`:
```json
{
  "name": "subject-application-ui",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/subject/application/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:application", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/subject/application/ui",
        "main": "libs/subject/application/ui/src/index.ts",
        "tsConfig": "libs/subject/application/ui/tsconfig.lib.json",
        "assets": [],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

`libs/subject/application/ui/src/index.ts`:
```typescript
export * from './lib/application.form';
```

- [ ] **Step 2: Add tsconfig.base.json alias for ui**

```json
"@bk2/application-ui": ["libs/subject/application/ui/src/index.ts"],
```

- [ ] **Step 3: Check what SwissCity type is exported from subject-swisscities-ui**

```bash
grep -n "SwissCity\|export" libs/subject/swisscities/ui/src/index.ts | head -10
```

Note the exact export name and import path.

- [ ] **Step 4: Create application.form.ts**

> First check if `SwissCity` is exported from `@bk2/subject-swisscities-ui`. If the type is named differently, adjust the import.
> The form uses `ngx-vest-forms` pattern. Check how `person.form.ts` uses vest directives for a reference: `libs/subject/person/ui/src/lib/person.form.ts`.

```typescript
// libs/subject/application/ui/src/lib/application.form.ts
import { Component, computed, inject, input, linkedSignal, output, Signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle,
  IonInput, IonItem, IonLabel, IonNote, IonRadio, IonRadioGroup, IonSelect, IonSelectOption,
  IonText, IonToggle
} from '@ionic/angular/standalone';
import { vestFormsViewProviders, VestValidationClassDirective } from 'ngx-vest-forms';
import { FormsModule } from '@angular/forms';

import { ApplicationModel, ApplicationKind } from '@bk2/shared-models';
import { APPLICATION_KIND_VALUES } from '@bk2/shared-models';
import { coerceBoolean } from '@bk2/shared-util-core';
import { needsSsn } from '@bk2/application-util';

export interface ApplicationFormI18n {
  field_first_name: Signal<string>;
  field_last_name: Signal<string>;
  field_gender: Signal<string>;
  field_date_of_birth: Signal<string>;
  field_ssn: Signal<string>;
  field_email: Signal<string>;
  field_phone: Signal<string>;
  field_street_name: Signal<string>;
  field_street_number: Signal<string>;
  field_zip_code: Signal<string>;
  field_city: Signal<string>;
  field_country_code: Signal<string>;
  field_parent_first_name: Signal<string>;
  field_parent_last_name: Signal<string>;
  field_parent_email: Signal<string>;
  field_parent_phone: Signal<string>;
  field_application_as: Signal<string>;
  field_state: Signal<string>;
  field_submitted_at: Signal<string>;
  field_reviewed_at: Signal<string>;
  field_reviewer: Signal<string>;
  field_close_reason: Signal<string>;
  section_person: Signal<string>;
  section_contact: Signal<string>;
  section_address: Signal<string>;
  section_parent: Signal<string>;
  section_application: Signal<string>;
}

@Component({
  selector: 'bk-application-form',
  standalone: true,
  imports: [
    FormsModule,
    VestValidationClassDirective,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle,
    IonItem, IonLabel, IonInput, IonNote, IonText,
    IonRadioGroup, IonRadio, IonSelect, IonSelectOption, IonToggle
  ],
  viewProviders: [vestFormsViewProviders],
  template: `
  <form #appForm="ngForm">
    <!-- Status badges (read-only, shown when set) -->
    @if(application().submittedAt) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_submitted_at() }}: {{ application().submittedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
      </ion-item>
    }
    @if(application().reviewedAt) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_reviewed_at() }}: {{ application().reviewedAt | date:'dd.MM.yyyy HH:mm' }}</ion-label>
      </ion-item>
    }
    @if(application().reviewer) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_reviewer() }}: {{ application().reviewer!.name1 }} {{ application().reviewer!.name2 }}</ion-label>
      </ion-item>
    }
    @if(application().closeReason) {
      <ion-item lines="none">
        <ion-label>{{ i18n().field_close_reason() }}: {{ application().closeReason }}</ion-label>
      </ion-item>
    }

    <!-- Person section -->
    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_person() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_first_name() }}</ion-label>
          <ion-input name="firstName" [(ngModel)]="firstName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_last_name() }}</ion-label>
          <ion-input name="lastName" [(ngModel)]="lastName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label>{{ i18n().field_gender() }}</ion-label>
          <ion-radio-group name="gender" [(ngModel)]="gender" [disabled]="isReadOnly()" (ionChange)="emitChange()">
            <ion-radio value="male">männlich</ion-radio>
            <ion-radio value="female">weiblich</ion-radio>
          </ion-radio-group>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_date_of_birth() }}</ion-label>
          <ion-input name="dateOfBirth" type="date" [(ngModel)]="dateOfBirthDisplay" [disabled]="isReadOnly()" (ionChange)="onDobChange($event)" />
        </ion-item>
        @if(showSsn()) {
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_ssn() }}</ion-label>
            <ion-input name="ssnId" [(ngModel)]="ssnId" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
        }
      </ion-card-content>
    </ion-card>

    <!-- Contact section -->
    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_contact() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_email() }}</ion-label>
          <ion-input name="email" type="email" [(ngModel)]="email" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_phone() }}</ion-label>
          <ion-input name="phone" type="tel" [(ngModel)]="phone" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
      </ion-card-content>
    </ion-card>

    <!-- Address section -->
    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_address() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_street_name() }}</ion-label>
          <ion-input name="streetName" [(ngModel)]="streetName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_street_number() }}</ion-label>
          <ion-input name="streetNumber" [(ngModel)]="streetNumber" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_zip_code() }}</ion-label>
          <ion-input name="zipCode" [(ngModel)]="zipCode" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_city() }}</ion-label>
          <ion-input name="city" [(ngModel)]="city" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ i18n().field_country_code() }}</ion-label>
          <ion-input name="countryCode" [(ngModel)]="countryCode" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
        </ion-item>
      </ion-card-content>
    </ion-card>

    <!-- Parent section — youth only -->
    @if(isYouth()) {
      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n().section_parent() }}</ion-card-title></ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_first_name() }}</ion-label>
            <ion-input name="parentFirstName" [(ngModel)]="parentFirstName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_last_name() }}</ion-label>
            <ion-input name="parentLastName" [(ngModel)]="parentLastName" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_email() }}</ion-label>
            <ion-input name="parentEmail" type="email" [(ngModel)]="parentEmail" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
          <ion-item>
            <ion-label position="stacked">{{ i18n().field_parent_phone() }}</ion-label>
            <ion-input name="parentPhone" type="tel" [(ngModel)]="parentPhone" [disabled]="isReadOnly()" (ionChange)="emitChange()" />
          </ion-item>
        </ion-card-content>
      </ion-card>
    }

    <!-- Application section -->
    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().section_application() }}</ion-card-title></ion-card-header>
      <ion-card-content>
        <ion-item>
          <ion-label>{{ i18n().field_application_as() }}</ion-label>
          <ion-select name="applicationAs" [(ngModel)]="applicationAs" [disabled]="isReadOnly()" (ionChange)="emitChange()">
            @for(k of kindValues; track k) {
              <ion-select-option [value]="k">{{ k }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-card-content>
    </ion-card>
  </form>
  `
})
export class ApplicationForm {
  // inputs
  public readonly application = input.required<ApplicationModel>();
  public readonly readonly    = input<boolean>(false);
  public readonly i18n        = input.required<ApplicationFormI18n>();

  // outputs
  public readonly applicationChange = output<ApplicationModel>();
  public readonly validityChange    = output<boolean>();

  protected isReadOnly   = computed(() => coerceBoolean(this.readonly()));
  protected isYouth      = computed(() => this.application().applicationAs === 'youth');
  protected showSsn      = computed(() => needsSsn(this.application()));
  protected kindValues: ApplicationKind[] = APPLICATION_KIND_VALUES;

  // linked signals for two-way binding
  protected firstName     = linkedSignal(() => this.application().firstName);
  protected lastName      = linkedSignal(() => this.application().lastName);
  protected gender        = linkedSignal(() => this.application().gender);
  protected dateOfBirthDisplay = linkedSignal(() => this.application().dateOfBirth); // yyyymmdd → input handles display
  protected ssnId         = linkedSignal(() => this.application().ssnId);
  protected email         = linkedSignal(() => this.application().email);
  protected phone         = linkedSignal(() => this.application().phone);
  protected streetName    = linkedSignal(() => this.application().streetName);
  protected streetNumber  = linkedSignal(() => this.application().streetNumber);
  protected zipCode       = linkedSignal(() => this.application().zipCode);
  protected city          = linkedSignal(() => this.application().city);
  protected countryCode   = linkedSignal(() => this.application().countryCode);
  protected parentFirstName = linkedSignal(() => this.application().parentFirstName);
  protected parentLastName  = linkedSignal(() => this.application().parentLastName);
  protected parentEmail     = linkedSignal(() => this.application().parentEmail);
  protected parentPhone     = linkedSignal(() => this.application().parentPhone);
  protected applicationAs   = linkedSignal(() => this.application().applicationAs);

  protected onDobChange(event: Event): void {
    // ion-input with type="date" returns yyyy-mm-dd; store as yyyymmdd
    const raw = (event as CustomEvent).detail?.value ?? '';
    this.dateOfBirthDisplay.set(raw.replace(/-/g, ''));
    this.emitChange();
  }

  protected emitChange(): void {
    const updated: ApplicationModel = {
      ...this.application(),
      firstName:       this.firstName(),
      lastName:        this.lastName(),
      gender:          this.gender(),
      dateOfBirth:     this.dateOfBirthDisplay(),
      ssnId:           this.ssnId(),
      email:           this.email(),
      phone:           this.phone(),
      streetName:      this.streetName(),
      streetNumber:    this.streetNumber(),
      zipCode:         this.zipCode(),
      city:            this.city(),
      countryCode:     this.countryCode(),
      parentFirstName: this.parentFirstName(),
      parentLastName:  this.parentLastName(),
      parentEmail:     this.parentEmail(),
      parentPhone:     this.parentPhone(),
      applicationAs:   this.applicationAs(),
    };
    this.applicationChange.emit(updated);
  }
}
```

- [ ] **Step 5: Type-check ui**

```bash
npx tsc --noEmit -p libs/subject/application/ui/tsconfig.json
```

Fix any type errors. Common issues:
- `| date:'...'` pipe not imported — the template uses Angular's `date` pipe. Add `DatePipe` from `@angular/common` to `imports`.
- If `APPLICATION_KIND_VALUES` isn't exported from `@bk2/shared-models`, export it from the util instead.

- [ ] **Step 6: Commit**

```bash
git add libs/subject/application/ui/ tsconfig.base.json
git commit -m "feat(application-ui): ApplicationForm dumb component"
```

---

## Task 8: Scaffold feature layer

**Files:** All feature layer scaffolding, scope, i18n

- [ ] **Step 1: Create feature layer scaffold files**

`libs/subject/application/feature/tsconfig.json`:
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
    {"path": "../../../shared/data-access/tsconfig.lib.json"},
    {"path": "../../../shared/feature/tsconfig.lib.json"},
    {"path": "../../../shared/i18n/tsconfig.lib.json"},
    {"path": "../../../shared/ui/tsconfig.lib.json"},
    {"path": "../../../shared/pipes/tsconfig.lib.json"},
    {"path": "../../../shared/util-angular/tsconfig.lib.json"},
    {"path": "../../../shared/util-core/tsconfig.lib.json"},
    {"path": "../../../relationship/membership/feature/tsconfig.lib.json"},
    {"path": "../../../subject/application/data-access/tsconfig.lib.json"},
    {"path": "../../../subject/application/ui/tsconfig.lib.json"},
    {"path": "../../../subject/application/util/tsconfig.lib.json"}
  ]
}
```

`libs/subject/application/feature/tsconfig.lib.json`:
```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../../dist/libs/subject/application/feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../../dist/out-tsc/subject-application-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/subject/application/feature/package.json`:
```json
{
  "name": "@bk2/application-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-config": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/relationship-membership-feature": "*",
    "@bk2/application-data-access": "*",
    "@bk2/application-ui": "*",
    "@bk2/application-util": "*"
  }
}
```

`libs/subject/application/feature/project.json`:
```json
{
  "name": "subject-application-feature",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/subject/application/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:application", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/subject/application/feature",
        "main": "libs/subject/application/feature/src/index.ts",
        "tsConfig": "libs/subject/application/feature/tsconfig.lib.json",
        "assets": [],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": {
      "executor": "@nx/eslint:lint"
    }
  }
}
```

`libs/subject/application/feature/src/index.ts`:
```typescript
export * from './lib/application.store';
export * from './lib/application-list';
export * from './lib/application-edit.modal';
```

- [ ] **Step 2: Create i18n/de.json**

```json
// libs/subject/application/feature/src/i18n/de.json
{
  "list": {
    "title": "Anträge",
    "empty": "Keine Anträge gefunden."
  },
  "edit": {
    "title": "Antrag bearbeiten",
    "save": "Speichern",
    "accept": "Annehmen",
    "deny": "Ablehnen",
    "save_conf": "Antrag aktualisiert.",
    "save_error": "Aktualisierung fehlgeschlagen.",
    "accept_confirm": "Antrag annehmen? Es wird eine Person erstellt.",
    "accept_conf": "Antrag genehmigt — Person wurde erstellt.",
    "accept_error": "Genehmigung fehlgeschlagen.",
    "deny_conf": "Antrag abgelehnt.",
    "deny_error": "Ablehnen fehlgeschlagen.",
    "deny_reason": "Grund der Ablehnung"
  },
  "delete": {
    "confirm": "Soll dieser Antrag wirklich gelöscht werden?",
    "conf": "Antrag gelöscht.",
    "error": "Löschen fehlgeschlagen."
  },
  "actions": {
    "add_membership": "Mitgliedschaft hinzufügen",
    "add_to_group": "Zu Gruppe einladen",
    "membership_added": "Mitgliedschaft hinzugefügt.",
    "group_invited": "Person zu Gruppe eingeladen.",
    "no_person": "Person noch nicht erstellt — Antrag zuerst annehmen."
  },
  "mail": {
    "confirmation_sent": "Bestätigung an Antragsteller/in versendet.",
    "decision_sent": "Entscheidung an Antragsteller/in versendet.",
    "send_failed": "E-Mail konnte nicht versendet werden."
  },
  "field": {
    "first_name": "Vorname",
    "last_name": "Nachname",
    "gender": "Geschlecht",
    "date_of_birth": "Geburtsdatum",
    "ssn": "AHV-Nummer",
    "email": "E-Mail",
    "phone": "Telefon",
    "street_name": "Strasse",
    "street_number": "Nr.",
    "zip_code": "PLZ",
    "city": "Ort",
    "country_code": "Land",
    "parent_first_name": "Vorname Elternteil",
    "parent_last_name": "Nachname Elternteil",
    "parent_email": "E-Mail Elternteil",
    "parent_phone": "Telefon Elternteil",
    "application_as": "Antrag als",
    "state": "Status",
    "submitted_at": "Eingegangen",
    "reviewed_at": "In Bearbeitung seit",
    "reviewer": "Bearbeiter",
    "close_reason": "Bemerkung"
  },
  "validation": {
    "email_required_either": "E-Mail ist erforderlich (entweder Antragsteller/in oder Elternteil).",
    "phone_required_either": "Telefon ist erforderlich (entweder Antragsteller/in oder Elternteil)."
  },
  "section": {
    "person": "Person",
    "contact": "Kontakt",
    "address": "Adresse",
    "parent": "Eltern (Pflicht für Jugendliche)",
    "application": "Antrag"
  },
  "kind_youth": "Jugendliche/r",
  "kind_adult": "Erwachsene/r",
  "kind_transfer": "Übertritt",
  "state_applied": "Eingegangen",
  "state_reviewing": "In Bearbeitung",
  "state_closed_approved": "Angenommen",
  "state_closed_denied": "Abgelehnt",
  "state_closed_cancelled": "Zurückgezogen",
  "cancel": "Abbrechen"
}
```

- [ ] **Step 3: Merge i18n into app de.json**

In `apps/scs-app/src/assets/i18n/de.json`, add a top-level `"application"` key with the full de.json contents above (as the value). Place it alphabetically (before `"address"`).

- [ ] **Step 4: Add tsconfig.base.json alias for feature**

```json
"@bk2/application-feature": ["libs/subject/application/feature/src/index.ts"],
```

- [ ] **Step 5: Commit scaffold**

```bash
git add libs/subject/application/feature/ tsconfig.base.json apps/scs-app/src/assets/i18n/de.json
git commit -m "feat(application): scaffold feature layer + i18n"
```

---

## Task 9: ApplicationStore

**Files:**
- Create: `libs/subject/application/feature/src/lib/application.store.ts`

- [ ] **Step 1: Create application.store.ts**

```typescript
// libs/subject/application/feature/src/lib/application.store.ts
import { computed, inject, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@bk2/shared-feature';
import { I18nService } from '@bk2/shared-i18n';
import { ApplicationKind, ApplicationModel, ApplicationState, UserModel } from '@bk2/shared-models';
import { getAvatarInfoForCurrentUser } from '@bk2/shared-util-core';
import { AlertService } from '@bk2/shared-util-angular';

import { MemberNewModal } from '@bk2/relationship-membership-feature';

import { ApplicationService } from '@bk2/application-data-access';
import { matchesStateFilter, proposeMembershipCategory, stateColor } from '@bk2/application-util';
import { ApplicationEditModal } from './application-edit.modal';

const APPLICATION_I18N_KEYS = {
  list_title:           '@application/list.title',
  list_empty:           '@application/list.empty',
  edit_title:           '@application/edit.title',
  edit_accept:          '@application/edit.accept',
  edit_deny:            '@application/edit.deny',
  edit_accept_confirm:  '@application/edit.accept_confirm',
  edit_accept_conf:     '@application/edit.accept_conf',
  edit_accept_error:    '@application/edit.accept_error',
  edit_deny_reason:     '@application/edit.deny_reason',
  edit_deny_conf:       '@application/edit.deny_conf',
  edit_deny_error:      '@application/edit.deny_error',
  delete_confirm:       '@application/delete.confirm',
  delete_conf:          '@application/delete.conf',
  delete_error:         '@application/delete.error',
  actions_add_membership: '@application/actions.add_membership',
  actions_no_person:    '@application/actions.no_person',
  cancel:               '@application/cancel',
  kind_youth:           '@application/kind_youth',
  kind_adult:           '@application/kind_adult',
  kind_transfer:        '@application/kind_transfer',
  state_applied:        '@application/state_applied',
  state_reviewing:      '@application/state_reviewing',
  state_closed_approved:  '@application/state_closed_approved',
  state_closed_denied:    '@application/state_closed_denied',
  state_closed_cancelled: '@application/state_closed_cancelled',
  // form fields (passed to ApplicationEditModal → ApplicationForm)
  field_first_name:       '@application/field.first_name',
  field_last_name:        '@application/field.last_name',
  field_gender:           '@application/field.gender',
  field_date_of_birth:    '@application/field.date_of_birth',
  field_ssn:              '@application/field.ssn',
  field_email:            '@application/field.email',
  field_phone:            '@application/field.phone',
  field_street_name:      '@application/field.street_name',
  field_street_number:    '@application/field.street_number',
  field_zip_code:         '@application/field.zip_code',
  field_city:             '@application/field.city',
  field_country_code:     '@application/field.country_code',
  field_parent_first_name: '@application/field.parent_first_name',
  field_parent_last_name:  '@application/field.parent_last_name',
  field_parent_email:      '@application/field.parent_email',
  field_parent_phone:      '@application/field.parent_phone',
  field_application_as:   '@application/field.application_as',
  field_state:            '@application/field.state',
  field_submitted_at:     '@application/field.submitted_at',
  field_reviewed_at:      '@application/field.reviewed_at',
  field_reviewer:         '@application/field.reviewer',
  field_close_reason:     '@application/field.close_reason',
  section_person:         '@application/section.person',
  section_contact:        '@application/section.contact',
  section_address:        '@application/section.address',
  section_parent:         '@application/section.parent',
  section_application:    '@application/section.application',
} satisfies Record<string, string>;

export type ApplicationI18n = { [K in keyof typeof APPLICATION_I18N_KEYS]: Signal<string> };

export const ApplicationStore = signalStore(
  withState({
    searchTerm:  '',
    stateFilter: 'open' as string,
    kindFilter:  'all' as string,
  }),

  withProps(() => ({
    appStore:            inject(AppStore),
    applicationService:  inject(ApplicationService),
    modalController:     inject(ModalController),
    alertService:        inject(AlertService),
    alertController:     inject(AlertController),
    toastController:     inject(ToastController),
    router:              inject(Router),
    i18nService:         inject(I18nService),
  })),

  withProps((store) => ({
    i18n: store.i18nService.translateAll(APPLICATION_I18N_KEYS),
    applicationsResource: rxResource({
      params: () => ({ tenantId: store.appStore.tenantId() }),
      stream: () => store.applicationService.list(),
    }),
  })),

  withComputed((store) => ({
    filteredApplications: computed(() => {
      const all  = store.applicationsResource.value() ?? [];
      const term = store.searchTerm().toLowerCase();
      const sf   = store.stateFilter();
      const kf   = store.kindFilter();
      return all
        .filter(a => !a.isArchived)
        .filter(a => matchesStateFilter(a.state, sf))
        .filter(a => kf === 'all' || a.applicationAs === kf)
        .filter(a => !term || a.index.toLowerCase().includes(term))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    }),
    currentUser: computed(() => store.appStore.currentUser()),
    tenantId:    computed(() => store.appStore.tenantId()),
    imgixBaseUrl: computed(() => store.appStore.env.services.imgixBaseUrl),
  })),

  withMethods((store) => ({
    setSearchTerm(term: string): void {
      patchState(store, { searchTerm: term });
    },
    setStateFilter(state: string): void {
      patchState(store, { stateFilter: state });
    },
    setKindFilter(kind: string): void {
      patchState(store, { kindFilter: kind });
    },

    stateColor(state: ApplicationState) {
      return stateColor(state);
    },

    async editApplication(app: ApplicationModel): Promise<void> {
      const cu = store.currentUser();
      if (app.state === 'applied' && cu) {
        const reviewer = getAvatarInfoForCurrentUser(cu);
        if (reviewer) {
          await store.applicationService.beginReview(app, reviewer, cu);
        }
      }
      const modal = await store.modalController.create({
        component: ApplicationEditModal,
        componentProps: { application: app, currentUser: cu, i18n: store.i18n }
      });
      await modal.present();
      await modal.onWillDismiss();
      store.applicationsResource.reload();
    },

    async deleteApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.delete_confirm(), true);
      if (confirmed !== true) return;
      await store.applicationService.delete(app, store.currentUser());
      store.applicationsResource.reload();
    },

    async acceptApplication(app: ApplicationModel): Promise<void> {
      const confirmed = await store.alertService.confirm(store.i18n.edit_accept_confirm(), true);
      if (confirmed !== true) return;
      try {
        await store.applicationService.accept(app, store.currentUser());
        store.applicationsResource.reload();
      } catch (err) {
        console.error('ApplicationStore.acceptApplication:', err);
      }
    },

    async denyApplication(app: ApplicationModel): Promise<void> {
      const alert = await store.alertController.create({
        header: store.i18n.edit_deny_reason(),
        inputs: [{ name: 'reason', type: 'text', placeholder: '' }],
        buttons: [
          { text: store.i18n.cancel(), role: 'cancel' },
          { text: store.i18n.edit_deny(), role: 'confirm' }
        ]
      });
      await alert.present();
      const { data, role } = await alert.onDidDismiss();
      if (role !== 'confirm' || !data?.values?.reason) return;
      await store.applicationService.deny(app, data.values.reason, store.currentUser());
      store.applicationsResource.reload();
    },

    async addMembership(app: ApplicationModel): Promise<void> {
      if (!app.personKey) {
        console.warn(store.i18n.actions_no_person());
        return;
      }
      const mcat = store.appStore.getCategory('membership_category');
      const genders = store.appStore.getCategory('gender');
      const defaultOrg = store.appStore.defaultOrg();
      if (!defaultOrg) return;
      const modal = await store.modalController.create({
        component: MemberNewModal,
        componentProps: {
          currentUser: store.currentUser(),
          mcat,
          tags: store.appStore.getTags('membership'),
          tenantId: store.tenantId(),
          genders,
          org: defaultOrg,
        }
      });
      await modal.present();
      await modal.onWillDismiss();
    },

    async addToGroup(app: ApplicationModel): Promise<void> {
      if (!app.personKey) {
        console.warn(store.i18n.actions_no_person());
        return;
      }
      // Group select is a follow-up — open a toast for now; replace with GroupSelectModal when available
      console.warn('addToGroup: GroupSelectModal not yet implemented');
    },
  }))
);
```

- [ ] **Step 2: Type-check feature (partial)**

```bash
npx tsc --noEmit -p libs/subject/application/feature/tsconfig.json 2>&1 | head -40
```

Fix obvious errors; `ApplicationEditModal` is not yet created so a forward-reference error is expected — leave it and proceed to the next task.

- [ ] **Step 3: Commit**

```bash
git add libs/subject/application/feature/src/lib/application.store.ts
git commit -m "feat(application-feature): ApplicationStore with filters, CRUD actions, addMembership"
```

---

## Task 10: ApplicationEditModal

**Files:**
- Create: `libs/subject/application/feature/src/lib/application-edit.modal.ts`

- [ ] **Step 1: Create application-edit.modal.ts**

```typescript
// libs/subject/application/feature/src/lib/application-edit.modal.ts
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, ModalController } from '@ionic/angular/standalone';

import { ApplicationModel, UserModel } from '@bk2/shared-models';
import { AlertService } from '@bk2/shared-util-angular';

import { ApplicationService } from '@bk2/application-data-access';
import { ApplicationForm, ApplicationFormI18n } from '@bk2/application-ui';
import { ApplicationI18n } from './application.store';

@Component({
  selector: 'bk-application-edit-modal',
  standalone: true,
  imports: [
    ApplicationForm,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent
  ],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-title>{{ i18n().edit_title() }}</ion-title>
      <ion-buttons slot="end">
        @if(!isTerminal()) {
          <ion-button (click)="save()">{{ i18n().edit_title() }}</ion-button>
          <ion-button color="success" (click)="accept()">{{ i18n().edit_accept() }}</ion-button>
          <ion-button color="danger"  (click)="deny()">{{ i18n().edit_deny() }}</ion-button>
        }
        <ion-button (click)="dismiss()">{{ i18n().cancel() }}</ion-button>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>
  <ion-content>
    <bk-application-form
      [application]="currentApp()"
      [readonly]="isTerminal()"
      [i18n]="formI18n()"
      (applicationChange)="currentApp.set($event)"
    />
  </ion-content>
  `
})
export class ApplicationEditModal {
  private readonly modalController    = inject(ModalController);
  private readonly applicationService = inject(ApplicationService);
  private readonly alertService       = inject(AlertService);

  // inputs (passed as componentProps)
  public readonly application  = input.required<ApplicationModel>();
  public readonly currentUser  = input<UserModel>();
  public readonly i18n         = input.required<ApplicationI18n>();

  protected currentApp = linkedSignal(() => this.application());
  protected isTerminal = computed(() => this.currentApp().state.startsWith('closed.'));

  protected formI18n = computed((): ApplicationFormI18n => ({
    field_first_name:        this.i18n().field_first_name,
    field_last_name:         this.i18n().field_last_name,
    field_gender:            this.i18n().field_gender,
    field_date_of_birth:     this.i18n().field_date_of_birth,
    field_ssn:               this.i18n().field_ssn,
    field_email:             this.i18n().field_email,
    field_phone:             this.i18n().field_phone,
    field_street_name:       this.i18n().field_street_name,
    field_street_number:     this.i18n().field_street_number,
    field_zip_code:          this.i18n().field_zip_code,
    field_city:              this.i18n().field_city,
    field_country_code:      this.i18n().field_country_code,
    field_parent_first_name: this.i18n().field_parent_first_name,
    field_parent_last_name:  this.i18n().field_parent_last_name,
    field_parent_email:      this.i18n().field_parent_email,
    field_parent_phone:      this.i18n().field_parent_phone,
    field_application_as:    this.i18n().field_application_as,
    field_state:             this.i18n().field_state,
    field_submitted_at:      this.i18n().field_submitted_at,
    field_reviewed_at:       this.i18n().field_reviewed_at,
    field_reviewer:          this.i18n().field_reviewer,
    field_close_reason:      this.i18n().field_close_reason,
    section_person:          this.i18n().section_person,
    section_contact:         this.i18n().section_contact,
    section_address:         this.i18n().section_address,
    section_parent:          this.i18n().section_parent,
    section_application:     this.i18n().section_application,
  }));

  protected async save(): Promise<void> {
    await this.applicationService.update(this.currentApp(), this.currentUser());
  }

  protected async accept(): Promise<void> {
    const confirmed = await this.alertService.confirm(this.i18n().edit_accept_confirm(), true);
    if (confirmed !== true) return;
    const personKey = await this.applicationService.accept(this.currentApp(), this.currentUser());
    await this.modalController.dismiss({ accepted: true, personKey }, 'confirm');
  }

  protected async deny(): Promise<void> {
    // Reuse the pattern from ApplicationStore.denyApplication — prompt for reason via AlertController
    const reason = await this.promptForReason();
    if (!reason) return;
    await this.applicationService.deny(this.currentApp(), reason, this.currentUser());
    await this.modalController.dismiss({ denied: true }, 'confirm');
  }

  protected dismiss(): void {
    this.modalController.dismiss(null, 'cancel');
  }

  private async promptForReason(): Promise<string | undefined> {
    return new Promise(async (resolve) => {
      const alert = await (inject(AlertService) as unknown as { alertController: import('@ionic/angular/standalone').AlertController }).alertController?.create({
        header: this.i18n().edit_deny_reason(),
        inputs: [{ name: 'reason', type: 'text' }],
        buttons: [
          { text: this.i18n().cancel(), role: 'cancel', handler: () => resolve(undefined) },
          { text: this.i18n().edit_deny(), role: 'confirm', handler: (v) => resolve(v?.reason) }
        ]
      });
      await alert?.present();
    });
  }
}
```

> **Note on `promptForReason`:** The AlertService in this codebase may not expose `alertController` directly. Check `libs/shared/util-angular/src/lib/alert.service.ts` and simplify `promptForReason` to inject `AlertController` directly in the component instead of going through AlertService.

- [ ] **Step 2: Fix AlertController injection in the modal**

Check AlertService API:
```bash
grep -n "alertController\|export\|class AlertService" libs/shared/util-angular/src/lib/alert.service.ts | head -20
```

If `AlertController` is not exposed, add it as a direct component injection:
```typescript
private readonly alertController = inject(AlertController);
```
Then use it directly in `promptForReason` instead of going through `alertService`.

- [ ] **Step 3: Type-check feature**

```bash
npx tsc --noEmit -p libs/subject/application/feature/tsconfig.json
```

Fix all errors.

- [ ] **Step 4: Commit**

```bash
git add libs/subject/application/feature/src/lib/application-edit.modal.ts
git commit -m "feat(application-feature): ApplicationEditModal"
```

---

## Task 11: ApplicationList

**Files:**
- Create: `libs/subject/application/feature/src/lib/application-list.ts`

- [ ] **Step 1: Create application-list.ts**

```typescript
// libs/subject/application/feature/src/lib/application-list.ts
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController, ActionSheetOptions,
  IonButtons, IonButton, IonChip, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar
} from '@ionic/angular/standalone';

import { ApplicationModel } from '@bk2/shared-models';
import { hasRole } from '@bk2/shared-util-core';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter } from '@bk2/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@bk2/shared-util-angular';

import { ApplicationStore } from './application.store';

@Component({
  selector: 'bk-application-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton,
    IonIcon, IonContent, IonItem, IonLabel, IonList, IonChip
  ],
  providers: [ApplicationStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ store.filteredApplications().length }} {{ store.i18n.list_title() }}</ion-title>
    </ion-toolbar>
    <bk-list-filter
      (searchTermChanged)="store.setSearchTerm($event)"
    />
  </ion-header>

  <ion-content>
    @if(store.filteredApplications().length === 0) {
      <bk-empty-list [message]="store.i18n.list_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(app of store.filteredApplications(); track app.bkey) {
          <ion-item button (click)="store.editApplication(app)">
            <ion-label>
              <h2>{{ app.lastName }}, {{ app.firstName }}</h2>
              <p>{{ app.zipCode }} {{ app.city }}</p>
              <p>{{ app.submittedAt | date:'dd.MM.yyyy HH:mm' }}</p>
            </ion-label>
            <ion-chip slot="end" [color]="store.stateColor(app.state)">
              {{ stateLabel(app) }}
            </ion-chip>
            @if(isAdmin()) {
              <ion-button fill="clear" slot="end" (click)="showActions($event, app)">
                <ion-icon slot="icon-only" src="{{ 'menu' | svgIcon }}" />
              </ion-button>
            }
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
  `
})
export class ApplicationList {
  protected readonly store = inject(ApplicationStore);
  private readonly actionSheetController = inject(ActionSheetController);

  protected isAdmin = computed(() => hasRole('admin', this.store.currentUser()));

  protected stateLabel(app: ApplicationModel): string {
    const key = 'state_' + app.state.replace('.', '_') as keyof typeof this.store.i18n;
    const sig = this.store.i18n[key];
    return sig ? (sig as () => string)() : app.state;
  }

  protected async showActions(event: Event, app: ApplicationModel): Promise<void> {
    event.stopPropagation();
    const imgix = this.store.imgixBaseUrl();
    const opts = createActionSheetOptions(this.store.i18n.list_title());
    const isOpen = app.state === 'applied' || app.state === 'reviewing';

    opts.buttons.push(createActionSheetDivider());
    if (isOpen) {
      opts.buttons.push(createActionSheetButton('accept',  this.store.i18n.edit_accept(),  imgix, 'check'));
      opts.buttons.push(createActionSheetButton('deny',    this.store.i18n.edit_deny(),    imgix, 'trash'));
    }
    if (app.personKey) {
      opts.buttons.push(createActionSheetButton('membership', this.store.i18n.actions_add_membership(), imgix, 'person-add'));
    }
    opts.buttons.push(createActionSheetDivider());
    opts.buttons.push(createActionSheetButton(this.store.i18n.cancel(), imgix, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;
    switch (data.action) {
      case 'accept':     await this.store.acceptApplication(app); break;
      case 'deny':       await this.store.denyApplication(app); break;
      case 'membership': await this.store.addMembership(app); break;
    }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/subject/application/feature/tsconfig.json
```

Fix all errors.

- [ ] **Step 3: Commit**

```bash
git add libs/subject/application/feature/src/lib/application-list.ts
git commit -m "feat(application-feature): ApplicationList route component"
```

---

## Task 12: Routes + Firestore rules

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Add routes to app.routes.ts**

Find a suitable location in `app.routes.ts` (near other `canActivate: [isPrivilegedGuard]` routes) and add:

```typescript
{
  path: 'applications',
  canActivate: [isPrivilegedGuard],
  loadComponent: () => import('@bk2/application-feature').then(m => m.ApplicationList),
},
{
  path: 'aoc/application',
  canActivate: [isAdminGuard],
  loadComponent: () => import('@bk2/application-feature').then(m => m.ApplicationList), // placeholder until AocApplication is built
},
```

- [ ] **Step 2: Add Firestore security rule**

In `firestore.rules`, add after the `tasks` match block (or in a logical place):

```
match /applications/{appId} {
  allow read:   if isAuthenticated()
                 && belongsToTenant(resource)
                 && (isAdmin() || isPrivileged());
  allow create: if belongsToTenant(request.resource)
                 && request.resource.data.state == 'applied'
                 && request.resource.data.taskKey == ''
                 && request.resource.data.personKey == '';
  allow update: if (isAdmin() || isPrivileged())
                 && belongsToTenant(resource);
  allow delete: if false;
}
```

> Note: `isApplicationApprover()` and `isOwnApplication()` from the spec require custom Firestore functions that may not exist yet. The simpler `isPrivileged()` guard achieves the same practical result for now. Add the stricter helpers as a follow-up if needed.

- [ ] **Step 3: Type-check the app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json 2>&1 | head -40
```

Fix any import path errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/app/app.routes.ts firestore.rules
git commit -m "feat(application): add routes + Firestore security rules"
```

---

## Task 13: Final type-check and build

- [ ] **Step 1: Type-check all four layers**

```bash
npx tsc --noEmit -p libs/subject/application/util/tsconfig.json && \
npx tsc --noEmit -p libs/subject/application/data-access/tsconfig.json && \
npx tsc --noEmit -p libs/subject/application/ui/tsconfig.json && \
npx tsc --noEmit -p libs/subject/application/feature/tsconfig.json
```

Expected: no errors in any layer.

- [ ] **Step 2: Run util tests**

```bash
pnpm run test subject-application-util
```

Expected: all tests PASS.

- [ ] **Step 3: Build util layer (verifies declarations are emitted correctly)**

```bash
pnpm nx build subject-application-util
```

Expected: clean build with output in `dist/libs/subject/application/util`.

- [ ] **Step 4: Final commit**

```bash
git add -p  # review and stage any remaining changes
git commit -m "feat(application): final type fixes and build verification"
```

---

## Known gaps / follow-up tasks (not in scope of this plan)

1. **AocApplication** admin view (spec §11) — implement once the base flow is stable.
2. **GroupSelectModal** for `addToGroup` action — currently a console.warn placeholder.
3. **`isApplicationApprover()` and `isOwnApplication()`** Firestore helpers — tighten security rules.
4. **ApplicationForm zip/city autocomplete** — integrate `SwissCity` type from `@bk2/subject-swisscities-ui` and an autocomplete Ionic component.
5. **Public FormSection integration** — `ApplicationService.create()` is ready; wiring into FormSection is owned by the FormsBuilder spec.

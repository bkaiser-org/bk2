# i18n Per-Module Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic i18n JSON files into per-lib-layer scoped files backed by Firestore, with runtime tenant overrides, while keeping all existing translations and `@domain.key` template references unchanged.

**Architecture:** Firestore `i18nDefault` is the source of truth; an explicit `export-i18n` script writes static JSON files into each lib's `src/i18n/` folder (committed to git). Transloco scopes lazy-load those files. After login, `I18nOverrideService` fetches tenant-specific overrides from Firestore `i18nTenantOverride` and merges them via `TranslocoService.setTranslation()`.

**Tech Stack:** Angular 20, `@jsverse/transloco`, NgRx Signal Stores, Firebase Admin SDK (export script only), Firestore, Vitest, Ionic Angular, pnpm/Nx.

---

## File Map

**New files:**
| Path | Responsibility |
|------|---------------|
| `libs/shared/models/src/lib/i18n-default.model.ts` | Firestore model for default translations |
| `libs/shared/models/src/lib/i18n-tenant-override.model.ts` | Firestore model for tenant overrides |
| `libs/shared/i18n/src/lib/i18n-override.service.ts` | Runtime tenant override merge |
| `libs/shared/i18n/src/lib/i18n-override.service.spec.ts` | Tests for override service |
| `scripts/export-i18n.ts` | Firestore → static JSON export script |
| `scripts/tsconfig.json` | ts-node config for scripts |
| `libs/chat/feature/src/i18n/de.json` | Seed scoped file (proof of concept) |
| `libs/chat/feature/src/i18n/en.json` | Seed scoped file (proof of concept) |
| `libs/i18n/feature/project.json` | Nx project config for new lib |
| `libs/i18n/feature/tsconfig.json` | TypeScript config (noEmit) |
| `libs/i18n/feature/tsconfig.lib.json` | TypeScript config (build output) |
| `libs/i18n/feature/package.json` | npm package definition |
| `libs/i18n/feature/src/index.ts` | Public API barrel |
| `libs/i18n/feature/src/lib/i18n-default.store.ts` | Signal store for default CMS |
| `libs/i18n/feature/src/lib/i18n-default-list.ts` | List component for defaults |
| `libs/i18n/feature/src/lib/i18n-default-edit.modal.ts` | Edit modal for defaults |
| `libs/i18n/feature/src/lib/i18n-override.store.ts` | Signal store for override CMS |
| `libs/i18n/feature/src/lib/i18n-override-list.ts` | List component for overrides |
| `libs/i18n/feature/src/lib/i18n-override-edit.modal.ts` | Edit modal for overrides |

**Modified files:**
| Path | Change |
|------|--------|
| `libs/shared/models/src/index.ts` | Export two new models |
| `libs/shared/i18n/src/lib/i18n.service.ts` | Add scoped key handling |
| `libs/shared/i18n/src/lib/i18n.service.spec.ts` | Add scoped key tests |
| `libs/shared/i18n/src/index.ts` | Export `I18nOverrideService` |
| `apps/scs-app/project.json` | Add asset glob for `chat/feature` i18n |
| `apps/scs-app/src/app/app.config.ts` | Init `I18nOverrideService` on bootstrap |
| `apps/scs-app/src/app/app.routes.ts` | Add `/i18n/defaults` and `/i18n/overrides` routes |
| `apps/scs-app/src/assets/i18n/de.json` | Add labels for the new CMS screens |
| `package.json` | Add `export-i18n` npm script |
| `tsconfig.base.json` | Add `@bk2/i18n-feature` path alias |

---

## Task 1: Data Models

**Files:**
- Create: `libs/shared/models/src/lib/i18n-default.model.ts`
- Create: `libs/shared/models/src/lib/i18n-tenant-override.model.ts`
- Modify: `libs/shared/models/src/index.ts`

- [ ] **Step 1: Create `i18n-default.model.ts`**

```typescript
// libs/shared/models/src/lib/i18n-default.model.ts
import { DEFAULT_KEY } from '@bk2/shared-constants';
import { BkModel } from './base.model';

export class I18nDefaultModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public module = DEFAULT_KEY;
  public key = DEFAULT_KEY;
  public de = DEFAULT_KEY;
  public en = DEFAULT_KEY;
  public fr = DEFAULT_KEY;
  public es = DEFAULT_KEY;
  public it = DEFAULT_KEY;
  public isHtml = false;
  public isArchived = false;
}

export const I18nDefaultCollection = 'i18nDefault';
export const I18nDefaultModelName = 'i18nDefault';
```

- [ ] **Step 2: Create `i18n-tenant-override.model.ts`**

```typescript
// libs/shared/models/src/lib/i18n-tenant-override.model.ts
import { DEFAULT_KEY } from '@bk2/shared-constants';
import { BkModel } from './base.model';

export class I18nTenantOverrideModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenantId = DEFAULT_KEY;
  public tenants: string[] = [];
  public module = DEFAULT_KEY;
  public key = DEFAULT_KEY;
  public de = DEFAULT_KEY;
  public en = DEFAULT_KEY;
  public fr = DEFAULT_KEY;
  public es = DEFAULT_KEY;
  public it = DEFAULT_KEY;
  public isHtml = false;
  public isArchived = false;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.tenants = [tenantId];
  }
}

export const I18nTenantOverrideCollection = 'i18nTenantOverride';
export const I18nTenantOverrideModelName = 'i18nTenantOverride';
```

- [ ] **Step 3: Export both models from `shared-models` barrel**

Add to `libs/shared/models/src/index.ts` (after the existing `website-content` exports, follow the alphabetical section pattern):

```typescript
export * from './lib/i18n-default.model';
export * from './lib/i18n-tenant-override.model';
```

- [ ] **Step 4: Type-check**

```sh
npx tsc --noEmit -p libs/shared/models/tsconfig.json
```
Expected: no errors.

- [ ] **Step 5: Commit**

```sh
git add libs/shared/models/src/lib/i18n-default.model.ts \
        libs/shared/models/src/lib/i18n-tenant-override.model.ts \
        libs/shared/models/src/index.ts
git commit -m "feat(i18n): add I18nDefaultModel and I18nTenantOverrideModel"
```

---

## Task 2: Extend I18nService for Scoped Keys

Keys of the form `@chat/feature.fields.reconnecting` contain a Transloco scope path (`chat/feature`) before the first dot. The service must load the scope file before translating.

**Files:**
- Modify: `libs/shared/i18n/src/lib/i18n.service.ts`
- Modify: `libs/shared/i18n/src/lib/i18n.service.spec.ts`

- [ ] **Step 1: Write failing tests for scoped keys**

Add to the `describe('I18nService')` block in `libs/shared/i18n/src/lib/i18n.service.spec.ts`:

```typescript
// Add 'load' to the mock at the top of the file — replace the existing vi.mock block:
vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {
    setActiveLang = vi.fn();
    getActiveLang = vi.fn(() => 'de');
    selectTranslate = vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`));
    load = vi.fn(() => of({}));
  },
  getBrowserLang: vi.fn(() => 'de'),
  HashMap: Object,
}));

// Also update beforeEach to include load:
beforeEach(() => {
  const mockTranslocoService = {
    setActiveLang: vi.fn(),
    getActiveLang: vi.fn(() => 'de'),
    selectTranslate: vi.fn((key, arg) => of(`translated:${key}${arg ? ':' + JSON.stringify(arg) : ''}`)),
    load: vi.fn(() => of({})),
  };
  service = new I18nService(mockTranslocoService as any);
});

// New test cases:
it('should translate scoped key by loading the scope file first', () => {
  const results: string[] = [];
  service.translate('@chat/feature.fields.reconnecting').subscribe(v => results.push(v));
  expect(results).toEqual(['translated:chat/feature.fields.reconnecting']);
});

it('should translate scoped key with argument', () => {
  const results: string[] = [];
  service.translate('@chat/feature.fields.count', { n: 3 }).subscribe(v => results.push(v));
  expect(results).toEqual(['translated:chat/feature.fields.count:{"n":3}']);
});

it('should not call load for legacy root keys', () => {
  const loadSpy = vi.spyOn((service as any).translocoService, 'load');
  service.translate('@chat.fields.reconnecting').subscribe();
  expect(loadSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```sh
pnpm run test shared-i18n
```
Expected: new test cases FAIL ("load is not a function" or similar).

- [ ] **Step 3: Update `i18n.service.ts` to handle scoped keys**

Replace the `translate` method in `libs/shared/i18n/src/lib/i18n.service.ts`:

```typescript
import { switchMap } from 'rxjs/operators';
// (add switchMap to the existing rxjs import if not already there)

public translate(key: string | null | undefined, argument?: HashMap): Observable<string> {
  if (!key || key.length === 0) return of('');
  if (!key.startsWith('@')) return of(key);

  const translationKey = key.substring(1);
  const dotIndex = translationKey.indexOf('.');
  const prefix = dotIndex === -1 ? translationKey : translationKey.substring(0, dotIndex);

  if (prefix.includes('/')) {
    const lang = this.translocoService.getActiveLang();
    return this.translocoService.load(`${prefix}/${lang}`).pipe(
      switchMap(() => this.translocoService.selectTranslate(translationKey, argument ?? {}))
    );
  }

  return this.translocoService.selectTranslate(translationKey, argument ?? {});
}
```

Add `switchMap` to the rxjs import at the top of the file if it is not already imported:
```typescript
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
```

- [ ] **Step 4: Run tests to verify they pass**

```sh
pnpm run test shared-i18n
```
Expected: all tests PASS.

- [ ] **Step 5: Type-check**

```sh
npx tsc --noEmit -p libs/shared/i18n/tsconfig.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```sh
git add libs/shared/i18n/src/lib/i18n.service.ts \
        libs/shared/i18n/src/lib/i18n.service.spec.ts
git commit -m "feat(i18n): support scoped translation keys with @scope/path.key format"
```

---

## Task 3: Export Script and npm Script

The script reads `i18nDefault` from Firestore and writes static JSON files.

**Files:**
- Create: `scripts/tsconfig.json`
- Create: `scripts/export-i18n.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `scripts/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2020",
    "esModuleInterop": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 2: Create `scripts/export-i18n.ts`**

```typescript
// scripts/export-i18n.ts
// Run: source ./apps/scs-app/.env && ts-node -P scripts/tsconfig.json scripts/export-i18n.ts
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const LANGS = ['de', 'en', 'fr', 'es', 'it'];

admin.initializeApp({ projectId: process.env['FIREBASE_PROJECT_ID'] });

async function exportI18n(): Promise<void> {
  const db = admin.firestore();
  const snap = await db.collection('i18nDefault')
    .where('isArchived', '==', false)
    .get();

  // Group by module → language → flat key/value pairs
  const byModule = new Map<string, Map<string, Record<string, string>>>();
  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, string | boolean>;
    const { module, key } = d as { module: string; key: string };
    if (!byModule.has(module)) byModule.set(module, new Map());
    const langMap = byModule.get(module)!;
    for (const lang of LANGS) {
      if (!langMap.has(lang)) langMap.set(lang, {});
      const value = d[lang] as string | undefined;
      if (value) langMap.get(lang)![key] = value;
    }
  }

  for (const [module, langMap] of byModule) {
    for (const [lang, flatKeys] of langMap) {
      const nested = toNested(flatKeys);
      const outputPath = module === 'app'
        ? path.join('apps', 'scs-app', 'src', 'assets', 'i18n', 'app', `${lang}.json`)
        : path.join('libs', module, 'src', 'i18n', `${lang}.json`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(nested, null, 2) + '\n', 'utf-8');
      console.log(`Written: ${outputPath}`);
    }
  }
}

function toNested(flat: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [dotKey, value] of Object.entries(flat)) {
    const parts = dotKey.split('.');
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cursor[parts[i]]) cursor[parts[i]] = {};
      cursor = cursor[parts[i]] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;
  }
  return result;
}

exportI18n().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Add npm script to `package.json`**

Add under `"scripts"` in the root `package.json`:

```json
"export-i18n": "source ./apps/scs-app/.env && ts-node -P scripts/tsconfig.json scripts/export-i18n.ts"
```

- [ ] **Step 4: Verify script compiles (no runtime yet)**

```sh
npx tsc --noEmit -P scripts/tsconfig.json
```
Expected: no errors (firebase-admin types must be available; it is already a dev dependency in functions — if not in root, add `"firebase-admin": "*"` to root `devDependencies`).

- [ ] **Step 5: Commit**

```sh
git add scripts/tsconfig.json scripts/export-i18n.ts package.json
git commit -m "feat(i18n): add export-i18n script to generate per-module JSON from Firestore"
```

---

## Task 4: Wire Transloco Scope for chat/feature (Proof of Concept)

This wires the asset glob and shows how a lib component declares its scope. `chat/feature` is the first example; repeat for every other lib as translations are added.

**Files:**
- Modify: `apps/scs-app/project.json`
- Create: `libs/chat/feature/src/i18n/de.json`
- Create: `libs/chat/feature/src/i18n/en.json`

- [ ] **Step 1: Add asset glob in `apps/scs-app/project.json`**

Inside the `"assets"` array of the `"build"` options (after the existing `scs-website` entry), add:

```json
{
  "glob": "*.json",
  "input": "libs/chat/feature/src/i18n",
  "output": "./i18n/chat/feature"
}
```

- [ ] **Step 2: Create seed i18n files for chat/feature**

`libs/chat/feature/src/i18n/de.json` (empty scope stub, populated later by export script):

```json
{}
```

`libs/chat/feature/src/i18n/en.json`:

```json
{}
```

- [ ] **Step 3: Build scs-app and verify the files are copied**

```sh
pnpm nx build scs-app --configuration development 2>&1 | tail -5
ls dist/apps/scs-app/browser/i18n/chat/feature/
```
Expected: `de.json` and `en.json` present.

- [ ] **Step 4: Document the scope declaration pattern**

When a component in `libs/chat/feature/` needs scoped translations, add this to the component decorator:

```typescript
import { TRANSLOCO_SCOPE } from '@jsverse/transloco';

@Component({
  // ...
  providers: [{ provide: TRANSLOCO_SCOPE, useValue: 'chat/feature' }],
})
```

Template usage:
```html
{{ '@chat/feature.fields.reconnecting' | translate | async }}
```

No action needed in the component body — scope loading is automatic.

- [ ] **Step 5: Commit**

```sh
git add apps/scs-app/project.json \
        libs/chat/feature/src/i18n/de.json \
        libs/chat/feature/src/i18n/en.json
git commit -m "feat(i18n): add Transloco scope asset glob for chat/feature"
```

---

## Task 5: I18nOverrideService

After login, fetches tenant overrides from Firestore and merges them into the active Transloco translation store.

**Files:**
- Create: `libs/shared/i18n/src/lib/i18n-override.service.ts`
- Create: `libs/shared/i18n/src/lib/i18n-override.service.spec.ts`
- Modify: `libs/shared/i18n/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `libs/shared/i18n/src/lib/i18n-override.service.spec.ts`:

```typescript
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetTranslation = vi.fn();
const mockGetActiveLang = vi.fn(() => 'de');
const mockLangChanges$ = of('de');
const mockLoad = vi.fn(() => of({}));

vi.mock('@jsverse/transloco', () => ({
  TranslocoService: class {},
}));

vi.mock('@bk2/shared-models', () => ({
  I18nTenantOverrideCollection: 'i18nTenantOverride',
}));

import { I18nOverrideService } from './i18n-override.service';

function makeService(overrides: unknown[] = []) {
  const translocoService = {
    getActiveLang: mockGetActiveLang,
    setTranslation: mockSetTranslation,
    langChanges$: mockLangChanges$,
    load: mockLoad,
  };
  const firestoreService = {
    searchData: vi.fn(() => of(overrides)),
  };
  const appStore = {
    currentUser: vi.fn(() => ({ bkey: 'u1' })),
    env: { tenantId: 'scs' },
  };
  const svc = new I18nOverrideService(
    translocoService as any,
    firestoreService as any,
    appStore as any,
  );
  return { svc, translocoService, firestoreService };
}

describe('I18nOverrideService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const { svc } = makeService();
    expect(svc).toBeDefined();
  });

  it('should call setTranslation for a scoped override', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledWith(
      { 'fields.reconnecting': 'Verbindet…' },
      'de',
      { merge: true, scope: 'chat/feature' },
    );
  });

  it('should call setTranslation for a legacy (root) override', () => {
    const override = { module: 'chat', key: 'fields.reconnecting', de: 'Verbindet…', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).toHaveBeenCalledWith(
      { 'chat.fields.reconnecting': 'Verbindet…' },
      'de',
      { merge: true },
    );
  });

  it('should skip overrides with no value for the requested language', () => {
    const override = { module: 'chat/feature', key: 'fields.reconnecting', de: '', isArchived: false };
    const { svc } = makeService([override]);
    svc.applyOverrides('de');
    expect(mockSetTranslation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```sh
pnpm run test shared-i18n
```
Expected: FAIL — `I18nOverrideService` not found.

- [ ] **Step 3: Create `i18n-override.service.ts`**

```typescript
// libs/shared/i18n/src/lib/i18n-override.service.ts
import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@bk2/shared-models';

@Injectable({ providedIn: 'root' })
export class I18nOverrideService {
  private readonly translocoService: TranslocoService;
  private readonly firestoreService: FirestoreService;
  private readonly appStore: InstanceType<typeof AppStore>;

  constructor(
    translocoService: TranslocoService,
    firestoreService: FirestoreService,
    appStore: InstanceType<typeof AppStore>,
  ) {
    this.translocoService = translocoService;
    this.firestoreService = firestoreService;
    this.appStore = appStore;
  }

  public init(): void {
    const lang = this.translocoService.getActiveLang();
    if (this.appStore.currentUser()) {
      this.applyOverrides(lang);
    }
    this.translocoService.langChanges$.subscribe((newLang: string) => {
      if (this.appStore.currentUser()) {
        this.applyOverrides(newLang);
      }
    });
  }

  public applyOverrides(lang: string): void {
    const tenantId = this.appStore.env.tenantId;
    firstValueFrom(
      this.firestoreService.searchData<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection,
        [
          { key: 'tenantId', operator: '==', value: tenantId },
          { key: 'isArchived', operator: '==', value: false },
        ],
        'module',
        'asc',
      )
    ).then(overrides => {
      for (const override of overrides) {
        const value = (override as Record<string, unknown>)[lang] as string | undefined;
        if (!value) continue;

        const isScoped = override.module.includes('/');
        if (isScoped) {
          this.translocoService.setTranslation(
            { [override.key]: value },
            lang,
            { merge: true, scope: override.module },
          );
        } else {
          this.translocoService.setTranslation(
            { [`${override.module}.${override.key}`]: value },
            lang,
            { merge: true },
          );
        }
      }
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```sh
pnpm run test shared-i18n
```
Expected: all tests PASS.

- [ ] **Step 5: Export from `shared-i18n` barrel**

Add to `libs/shared/i18n/src/index.ts`:

```typescript
export * from './lib/i18n-override.service';
```

- [ ] **Step 6: Type-check**

```sh
npx tsc --noEmit -p libs/shared/i18n/tsconfig.json
```
Expected: no errors.

- [ ] **Step 7: Commit**

```sh
git add libs/shared/i18n/src/lib/i18n-override.service.ts \
        libs/shared/i18n/src/lib/i18n-override.service.spec.ts \
        libs/shared/i18n/src/index.ts
git commit -m "feat(i18n): add I18nOverrideService for runtime tenant translation overrides"
```

---

## Task 6: Bootstrap I18nOverrideService in scs-app

**Files:**
- Modify: `apps/scs-app/src/app/app.config.ts`

- [ ] **Step 1: Add I18nOverrideService init to the bootstrap listener**

In `apps/scs-app/src/app/app.config.ts`, add an `APP_BOOTSTRAP_LISTENER` that calls `overrideService.init()`. Add after the existing `APP_BOOTSTRAP_LISTENER` entries:

```typescript
// At the top, add import:
import { I18nOverrideService } from '@bk2/shared-i18n';

// In the providers array, add:
{
  provide: APP_BOOTSTRAP_LISTENER,
  useFactory: (platformId: object) => {
    const overrideService = inject(I18nOverrideService);
    return () => {
      if (!isBrowser(platformId)) return;
      overrideService.init();
    };
  },
  deps: [PLATFORM_ID],
  multi: true,
},
```

- [ ] **Step 2: Type-check**

```sh
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```sh
git add apps/scs-app/src/app/app.config.ts
git commit -m "feat(i18n): initialise I18nOverrideService on app bootstrap"
```

---

## Task 7: Create libs/i18n/feature Lib Scaffold

**Files:**
- Create: `libs/i18n/feature/project.json`
- Create: `libs/i18n/feature/tsconfig.json`
- Create: `libs/i18n/feature/tsconfig.lib.json`
- Create: `libs/i18n/feature/package.json`
- Create: `libs/i18n/feature/src/index.ts`
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Create `libs/i18n/feature/project.json`**

```json
{
  "name": "i18n-feature",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/i18n/feature/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:feature", "scope:i18n", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/i18n/feature",
        "main": "libs/i18n/feature/src/index.ts",
        "tsConfig": "libs/i18n/feature/tsconfig.lib.json",
        "assets": ["libs/i18n/feature/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

- [ ] **Step 2: Create `libs/i18n/feature/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["vitest", "node"],
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
    { "path": "../../shared/models/tsconfig.lib.json" },
    { "path": "../../shared/constants/tsconfig.lib.json" },
    { "path": "../../shared/util-angular/tsconfig.lib.json" },
    { "path": "../../shared/util-core/tsconfig.lib.json" },
    { "path": "../../shared/feature/tsconfig.lib.json" },
    { "path": "../../shared/data-access/tsconfig.lib.json" },
    { "path": "../../shared/i18n/tsconfig.lib.json" },
    { "path": "../../shared/ui/tsconfig.lib.json" },
    { "path": "../../shared/pipes/tsconfig.lib.json" }
  ]
}
```

- [ ] **Step 3: Create `libs/i18n/feature/tsconfig.lib.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc/libs/i18n-feature",
    "declaration": true,
    "composite": true,
    "module": "es2020",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/i18n-feature.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `libs/i18n/feature/package.json`**

```json
{
  "name": "@bk2/i18n-feature",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-models": "*",
    "@bk2/shared-constants": "*",
    "@bk2/shared-util-angular": "*",
    "@bk2/shared-util-core": "*",
    "@bk2/shared-feature": "*",
    "@bk2/shared-data-access": "*",
    "@bk2/shared-i18n": "*",
    "@bk2/shared-ui": "*",
    "@bk2/shared-pipes": "*"
  }
}
```

- [ ] **Step 5: Create `libs/i18n/feature/src/index.ts`** (empty barrel for now)

```typescript
// Public API — populated in Tasks 8 and 9
```

- [ ] **Step 6: Add path alias to `tsconfig.base.json`**

In the `"paths"` section of `tsconfig.base.json`, add:

```json
"@bk2/i18n-feature": ["libs/i18n/feature/src/index.ts"]
```

- [ ] **Step 7: Type-check**

```sh
npx tsc --noEmit -p libs/i18n/feature/tsconfig.json
```
Expected: no errors (empty lib).

- [ ] **Step 8: Commit**

```sh
git add libs/i18n/feature/ tsconfig.base.json
git commit -m "feat(i18n): scaffold libs/i18n/feature lib"
```

---

## Task 8: I18nDefault CMS Components

**Files:**
- Create: `libs/i18n/feature/src/lib/i18n-default.store.ts`
- Create: `libs/i18n/feature/src/lib/i18n-default-list.ts`
- Create: `libs/i18n/feature/src/lib/i18n-default-edit.modal.ts`
- Modify: `libs/i18n/feature/src/index.ts`

- [ ] **Step 1: Create `i18n-default.store.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-default.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nDefaultCollection, I18nDefaultModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';

export type I18nDefaultState = { searchTerm: string };
const initialState: I18nDefaultState = { searchTerm: '' };

export const I18nDefaultStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({ fbUser: store.appStore.fbUser() }),
      stream: ({ params }) => {
        if (!params.fbUser) return of([] as I18nDefaultModel[]);
        return store.firestoreService.searchData<I18nDefaultModel>(
          I18nDefaultCollection,
          [{ key: 'isArchived', operator: '==', value: false }],
          'module',
          'asc',
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.contentResource.isLoading()),
    filteredItems: computed(() => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.contentResource.value() ?? []) as I18nDefaultModel[];
      return term
        ? all.filter(i => i.module.toLowerCase().includes(term) || i.key.toLowerCase().includes(term) || i.de.toLowerCase().includes(term))
        : all;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void { patchState(store, { searchTerm: term }); },

    async createItem(): Promise<void> {
      const module = await bkPrompt(store.alertController, '@i18n.default.module.prompt', '');
      if (!module) return;
      const key = await bkPrompt(store.alertController, '@i18n.default.key.prompt', '');
      if (!key) return;
      const item = new I18nDefaultModel();
      item.module = module.trim();
      item.key = key.trim();
      await store.firestoreService.createModel<I18nDefaultModel>(
        I18nDefaultCollection, item, '@i18n.default.operation.create', store.appStore.currentUser(),
      );
    },

    async saveItem(item: I18nDefaultModel): Promise<void> {
      await store.firestoreService.updateModel<I18nDefaultModel>(
        I18nDefaultCollection, item, false, '@i18n.default.operation.update', store.appStore.currentUser(),
      );
    },

    async deleteItem(item: I18nDefaultModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nDefaultModel>(
        I18nDefaultCollection, item, '@i18n.default.operation.delete', store.appStore.currentUser(),
      );
    },
  })),
);
```

- [ ] **Step 2: Create `i18n-default-edit.modal.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-default-edit.modal.ts
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonInput, IonItem,
  IonLabel, IonTextarea, IonToggle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { I18nDefaultModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-i18n-default-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe,
    HeaderComponent,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonTextarea, IonToggle,
  ],
  template: `
    <bk-header title="@i18n.default.edit.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.default.module.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().module" (ionInput)="onInput($event, 'module')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.default.key.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().key" (ionInput)="onInput($event, 'key')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">DE</ion-label>
        <ion-textarea [value]="formData().de" (ionInput)="onInput($event, 'de')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">EN</ion-label>
        <ion-textarea [value]="formData().en" (ionInput)="onInput($event, 'en')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">FR</ion-label>
        <ion-textarea [value]="formData().fr" (ionInput)="onInput($event, 'fr')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">ES</ion-label>
        <ion-textarea [value]="formData().es" (ionInput)="onInput($event, 'es')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">IT</ion-label>
        <ion-textarea [value]="formData().it" (ionInput)="onInput($event, 'it')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggle($event)" />
        <ion-label>{{ '@i18n.default.isHtml.label' | translate | async }}</ion-label>
      </ion-item>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ '@general.operation.cancel' | translate | async }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ '@general.operation.save' | translate | async }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class I18nDefaultEditModal {
  private readonly modalController = inject(ModalController);
  public item = input.required<I18nDefaultModel>();
  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as I18nDefaultModel);
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

  protected onInput(event: Event, field: keyof I18nDefaultModel): void {
    this.formData.update(d => ({ ...d, [field]: (event as CustomEvent).detail.value ?? '' }));
  }

  protected onToggle(event: Event): void {
    this.formData.update(d => ({ ...d, isHtml: (event as CustomEvent).detail.checked }));
  }

  protected async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  protected cancel(): void { this.modalController.dismiss(null, 'cancel'); }
}
```

- [ ] **Step 3: Create `i18n-default-list.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-default-list.ts
import { AsyncPipe, SlicePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController, ActionSheetOptions, ModalController,
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonContent, IonIcon, IonItem,
  IonLabel, IonList, IonSearchbar, IonToolbar,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { I18nDefaultModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { I18nDefaultStore } from './i18n-default.store';
import { I18nDefaultEditModal } from './i18n-default-edit.modal';

@Component({
  selector: 'bk-i18n-default-list',
  standalone: true,
  imports: [
    AsyncPipe, SlicePipe, FormsModule, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge, IonChip,
  ],
  providers: [I18nDefaultStore],
  template: `
    <bk-header title="@i18n.default.title" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar
          [value]="store.searchTerm()"
          [placeholder]="('@general.operation.search.placeholder' | translate | async) ?? ''"
          (ionInput)="onSearch($event)"
          debounce="300" />
        <ion-buttons slot="end">
          <ion-button (click)="store.createItem()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ '@i18n.default.list.title' | translate | async }}
            <ion-badge color="medium">{{ store.filteredItems().length }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="inset">
            @for (item of store.filteredItems(); track item.bkey) {
              <ion-item (click)="showActions(item)" button>
                <ion-icon slot="start" src="{{ 'globe' | svgIcon }}" />
                <ion-label>
                  <h3>{{ item.module }} · {{ item.key }}</h3>
                  <p>{{ item.de | slice:0:80 }}</p>
                </ion-label>
                @if (item.isHtml) { <ion-chip slot="end" color="primary">HTML</ion-chip> }
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class I18nDefaultList {
  protected readonly store = inject(I18nDefaultStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    this.store.setSearchTerm((event as CustomEvent).detail.value ?? '');
  }

  protected async showActions(item: I18nDefaultModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('i18n.default.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('i18n.default.delete', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;
    if (data.action === 'i18n.default.edit') await this.openEditModal(item);
    if (data.action === 'i18n.default.delete') await this.store.deleteItem(item);
  }

  private async openEditModal(item: I18nDefaultModel): Promise<void> {
    const modal = await this.modalController.create({
      component: I18nDefaultEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<I18nDefaultModel>();
    if (role === 'confirm' && data) await this.store.saveItem(data);
  }
}
```

- [ ] **Step 4: Export from barrel**

Replace the content of `libs/i18n/feature/src/index.ts`:

```typescript
export * from './lib/i18n-default.store';
export * from './lib/i18n-default-list';
export * from './lib/i18n-default-edit.modal';
```

- [ ] **Step 5: Type-check**

```sh
npx tsc --noEmit -p libs/i18n/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```sh
git add libs/i18n/feature/src/
git commit -m "feat(i18n): add I18nDefault CMS store, list, and edit modal"
```

---

## Task 9: I18nTenantOverride CMS Components

**Files:**
- Create: `libs/i18n/feature/src/lib/i18n-override.store.ts`
- Create: `libs/i18n/feature/src/lib/i18n-override-list.ts`
- Create: `libs/i18n/feature/src/lib/i18n-override-edit.modal.ts`
- Modify: `libs/i18n/feature/src/index.ts`

- [ ] **Step 1: Create `i18n-override.store.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-override.store.ts
import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { of } from 'rxjs';

import { FirestoreService } from '@bk2/shared-data-access';
import { AppStore } from '@bk2/shared-feature';
import { I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@bk2/shared-models';
import { bkPrompt } from '@bk2/shared-util-angular';

export type I18nOverrideState = { searchTerm: string };
const initialState: I18nOverrideState = { searchTerm: '' };

export const I18nOverrideStore = signalStore(
  withState(initialState),
  withProps(() => ({
    appStore: inject(AppStore),
    firestoreService: inject(FirestoreService),
    alertController: inject(AlertController),
    modalController: inject(ModalController),
  })),
  withProps(store => ({
    contentResource: rxResource({
      params: () => ({
        fbUser: store.appStore.fbUser(),
        tenantId: store.appStore.env.tenantId,
      }),
      stream: ({ params }) => {
        if (!params.fbUser || !params.tenantId) return of([] as I18nTenantOverrideModel[]);
        return store.firestoreService.searchData<I18nTenantOverrideModel>(
          I18nTenantOverrideCollection,
          [
            { key: 'tenantId', operator: '==', value: params.tenantId },
            { key: 'isArchived', operator: '==', value: false },
          ],
          'module',
          'asc',
        );
      },
    }),
  })),
  withComputed(store => ({
    isLoading: computed(() => store.contentResource.isLoading()),
    filteredItems: computed(() => {
      const term = store.searchTerm().toLowerCase().trim();
      const all = (store.contentResource.value() ?? []) as I18nTenantOverrideModel[];
      return term
        ? all.filter(i => i.module.toLowerCase().includes(term) || i.key.toLowerCase().includes(term))
        : all;
    }),
  })),
  withMethods(store => ({
    setSearchTerm(term: string): void { patchState(store, { searchTerm: term }); },

    async createItem(): Promise<void> {
      const module = await bkPrompt(store.alertController, '@i18n.override.module.prompt', '');
      if (!module) return;
      const key = await bkPrompt(store.alertController, '@i18n.override.key.prompt', '');
      if (!key) return;
      const item = new I18nTenantOverrideModel(store.appStore.env.tenantId);
      item.module = module.trim();
      item.key = key.trim();
      await store.firestoreService.createModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, '@i18n.override.operation.create', store.appStore.currentUser(),
      );
    },

    async saveItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.updateModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, false, '@i18n.override.operation.update', store.appStore.currentUser(),
      );
    },

    async deleteItem(item: I18nTenantOverrideModel): Promise<void> {
      await store.firestoreService.deleteModel<I18nTenantOverrideModel>(
        I18nTenantOverrideCollection, item, '@i18n.override.operation.delete', store.appStore.currentUser(),
      );
    },
  })),
);
```

- [ ] **Step 2: Create `i18n-override-edit.modal.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-override-edit.modal.ts
import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonInput, IonItem,
  IonLabel, IonTextarea, IonToggle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { I18nTenantOverrideModel } from '@bk2/shared-models';
import { deepEqual, safeStructuredClone } from '@bk2/shared-util-core';

@Component({
  selector: 'bk-i18n-override-edit-modal',
  standalone: true,
  imports: [
    AsyncPipe, FormsModule, TranslatePipe, HeaderComponent,
    IonContent, IonToolbar, IonButtons, IonButton,
    IonItem, IonLabel, IonInput, IonTextarea, IonToggle,
  ],
  template: `
    <bk-header title="@i18n.override.edit.title" [isModal]="true" />
    <ion-content class="ion-padding">
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.override.module.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().module" (ionInput)="onInput($event, 'module')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">{{ '@i18n.override.key.label' | translate | async }}</ion-label>
        <ion-input [value]="formData().key" (ionInput)="onInput($event, 'key')" />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">DE</ion-label>
        <ion-textarea [value]="formData().de" (ionInput)="onInput($event, 'de')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">EN</ion-label>
        <ion-textarea [value]="formData().en" (ionInput)="onInput($event, 'en')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">FR</ion-label>
        <ion-textarea [value]="formData().fr" (ionInput)="onInput($event, 'fr')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">ES</ion-label>
        <ion-textarea [value]="formData().es" (ionInput)="onInput($event, 'es')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-label position="stacked">IT</ion-label>
        <ion-textarea [value]="formData().it" (ionInput)="onInput($event, 'it')" autoGrow />
      </ion-item>
      <ion-item>
        <ion-toggle [checked]="formData().isHtml" (ionChange)="onToggle($event)" />
        <ion-label>{{ '@i18n.override.isHtml.label' | translate | async }}</ion-label>
      </ion-item>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">{{ '@general.operation.cancel' | translate | async }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button [disabled]="!isDirty()" (click)="save()" color="primary">
            {{ '@general.operation.save' | translate | async }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-content>
  `,
})
export class I18nOverrideEditModal {
  private readonly modalController = inject(ModalController);
  public item = input.required<I18nTenantOverrideModel>();
  protected formData = linkedSignal(() => safeStructuredClone(this.item()) ?? {} as I18nTenantOverrideModel);
  protected isDirty = computed(() => !deepEqual(this.formData(), safeStructuredClone(this.item())));

  protected onInput(event: Event, field: keyof I18nTenantOverrideModel): void {
    this.formData.update(d => ({ ...d, [field]: (event as CustomEvent).detail.value ?? '' }));
  }

  protected onToggle(event: Event): void {
    this.formData.update(d => ({ ...d, isHtml: (event as CustomEvent).detail.checked }));
  }

  protected async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  protected cancel(): void { this.modalController.dismiss(null, 'cancel'); }
}
```

- [ ] **Step 3: Create `i18n-override-list.ts`**

```typescript
// libs/i18n/feature/src/lib/i18n-override-list.ts
import { AsyncPipe, SlicePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ActionSheetController, ActionSheetOptions, ModalController,
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonContent, IonIcon, IonItem,
  IonLabel, IonList, IonSearchbar, IonToolbar,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { HeaderComponent } from '@bk2/shared-ui';
import { I18nTenantOverrideModel } from '@bk2/shared-models';
import { createActionSheetButton, createActionSheetOptions } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { I18nOverrideStore } from './i18n-override.store';
import { I18nOverrideEditModal } from './i18n-override-edit.modal';

@Component({
  selector: 'bk-i18n-override-list',
  standalone: true,
  imports: [
    AsyncPipe, SlicePipe, FormsModule, TranslatePipe, SvgIconPipe,
    HeaderComponent,
    IonContent, IonToolbar, IonSearchbar, IonButtons, IonButton, IonIcon,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonBadge,
  ],
  providers: [I18nOverrideStore],
  template: `
    <bk-header title="@i18n.override.title" />
    <ion-content>
      <ion-toolbar>
        <ion-searchbar
          [value]="store.searchTerm()"
          [placeholder]="('@general.operation.search.placeholder' | translate | async) ?? ''"
          (ionInput)="onSearch($event)"
          debounce="300" />
        <ion-buttons slot="end">
          <ion-button (click)="store.createItem()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ '@i18n.override.list.title' | translate | async }}
            <ion-badge color="medium">{{ store.filteredItems().length }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="inset">
            @for (item of store.filteredItems(); track item.bkey) {
              <ion-item (click)="showActions(item)" button>
                <ion-icon slot="start" src="{{ 'globe' | svgIcon }}" />
                <ion-label>
                  <h3>{{ item.module }} · {{ item.key }}</h3>
                  <p>{{ item.de | slice:0:80 }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class I18nOverrideList {
  protected readonly store = inject(I18nOverrideStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);

  protected onSearch(event: Event): void {
    this.store.setSearchTerm((event as CustomEvent).detail.value ?? '');
  }

  protected async showActions(item: I18nTenantOverrideModel): Promise<void> {
    const base = this.store.appStore.env.services.imgixBaseUrl;
    const options: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    options.buttons.push(createActionSheetButton('i18n.override.edit', base, 'edit'));
    options.buttons.push(createActionSheetButton('i18n.override.delete', base, 'trash'));
    options.buttons.push(createActionSheetButton('cancel', base, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;
    if (data.action === 'i18n.override.edit') await this.openEditModal(item);
    if (data.action === 'i18n.override.delete') await this.store.deleteItem(item);
  }

  private async openEditModal(item: I18nTenantOverrideModel): Promise<void> {
    const modal = await this.modalController.create({
      component: I18nOverrideEditModal,
      componentProps: { item },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<I18nTenantOverrideModel>();
    if (role === 'confirm' && data) await this.store.saveItem(data);
  }
}
```

- [ ] **Step 4: Update barrel to export override components**

Append to `libs/i18n/feature/src/index.ts`:

```typescript
export * from './lib/i18n-override.store';
export * from './lib/i18n-override-list';
export * from './lib/i18n-override-edit.modal';
```

- [ ] **Step 5: Type-check**

```sh
npx tsc --noEmit -p libs/i18n/feature/tsconfig.json
```
Expected: no errors.

- [ ] **Step 6: Commit**

```sh
git add libs/i18n/feature/src/
git commit -m "feat(i18n): add I18nTenantOverride CMS store, list, and edit modal"
```

---

## Task 10: Routes and i18n Labels

**Files:**
- Modify: `apps/scs-app/src/app/app.routes.ts`
- Modify: `apps/scs-app/src/assets/i18n/de.json`

- [ ] **Step 1: Add i18n routes to `app.routes.ts`**

In `apps/scs-app/src/app/app.routes.ts`, add a new route block alongside the existing `aoc` block (import guards already present in the file):

```typescript
{
  path: 'i18n',
  canActivate: [isAdminGuard],
  children: [
    {
      path: 'defaults',
      canActivate: [isAdminGuard],
      loadComponent: () => import('@bk2/i18n-feature').then(m => m.I18nDefaultList),
    },
    {
      path: 'overrides',
      canActivate: [isPrivilegedGuard],
      loadComponent: () => import('@bk2/i18n-feature').then(m => m.I18nOverrideList),
    },
  ],
},
```

- [ ] **Step 2: Add German labels to `de.json`**

Add an `i18n` section to `apps/scs-app/src/assets/i18n/de.json` (alongside the existing top-level keys):

```json
"i18n": {
  "default": {
    "title": "Übersetzungen",
    "edit": { "title": "Übersetzung bearbeiten" },
    "list": { "title": "Alle Standardübersetzungen" },
    "module": { "label": "Modul", "prompt": "Modul (z.B. chat/feature)" },
    "key": { "label": "Schlüssel", "prompt": "Schlüssel (z.B. fields.reconnecting)" },
    "isHtml": { "label": "HTML-Inhalt" },
    "operation": {
      "create": "Übersetzung erstellt",
      "update": "Übersetzung gespeichert",
      "delete": "Übersetzung gelöscht"
    }
  },
  "override": {
    "title": "Überschreibungen",
    "edit": { "title": "Überschreibung bearbeiten" },
    "list": { "title": "Alle Überschreibungen" },
    "module": { "label": "Modul", "prompt": "Modul (z.B. chat/feature)" },
    "key": { "label": "Schlüssel", "prompt": "Schlüssel" },
    "isHtml": { "label": "HTML-Inhalt" },
    "operation": {
      "create": "Überschreibung erstellt",
      "update": "Überschreibung gespeichert",
      "delete": "Überschreibung gelöscht"
    }
  }
}
```

- [ ] **Step 3: Type-check and build**

```sh
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

```sh
pnpm nx serve scs-app
```

Navigate to `/i18n/defaults` — verify the list loads (empty) and the "add" button works.
Navigate to `/i18n/overrides` — verify the list loads and the "add" button works.

- [ ] **Step 5: Commit**

```sh
git add apps/scs-app/src/app/app.routes.ts \
        apps/scs-app/src/assets/i18n/de.json
git commit -m "feat(i18n): add /i18n/defaults and /i18n/overrides admin routes with labels"
```

---

## Self-Review Checklist

- **Spec § 1 (Firestore data model):** Tasks 1 covers both `i18nDefault` and `i18nTenantOverride` models. ✅
- **Spec § 2 (export script + Nx integration):** Task 3 covers script + npm script. Asset glob per lib: Task 4 shows the pattern for `chat/feature`; repeat for each new lib. ✅
- **Spec § 3 (Transloco scope integration):** Task 2 (I18nService), Task 4 (asset glob + scope provider pattern). ✅
- **Spec § 4 (runtime tenant overrides):** Task 5 (service), Task 6 (bootstrap init). ✅
- **Spec § 5 (CMS editor components):** Tasks 8 and 9 cover both list+modal pairs. ✅
- **Spec § 6 (backward compat):** No existing files modified except additive i18n labels. Existing `@domain.key` format unchanged. ✅
- **Placeholder scan:** No TBD/TODO in task code. ✅
- **Type consistency:** `I18nDefaultModel`/`I18nTenantOverrideModel` named consistently across Tasks 1, 8, 9. `I18nDefaultStore`/`I18nOverrideStore` used consistently in their respective list components. `I18nDefaultCollection`/`I18nTenantOverrideCollection` constants used in stores and service. ✅

# Cookie Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GDPR-compliant cookie consent as a shared Nx library (`libs/consent/`) so every app in the monorepo gets the same implementation without duplication.

**Architecture:** Two-layer lib: `data-access` holds `ConsentService` (localStorage + RxJS) and `AnalyticsLoaderService` (lazy Firebase Analytics); `ui` holds `CookieBanner` (fixed bottom overlay). Each app wires them up via `bk-root.ts` and `app.config.ts`. No app-level service files are created.

**Tech Stack:** Angular 20 zoneless standalone, Ionic 8.7, RxJS BehaviorSubject, Firebase Analytics (dynamic import), Vitest + jsdom + TestBed for unit tests.

---

## Cleanup before starting

Before Task 1 begins, delete untracked files left over from a previous session:

```bash
rm -f apps/scs-app/src/app/services/consent.service.ts \
      apps/scs-app/src/app/services/consent.service.spec.ts \
      apps/scs-app/test-setup.ts \
      apps/scs-app/vite.config.ts \
      apps/scs-app/src/__mocks__/ionic-stub.ts
rmdir apps/scs-app/src/app/services 2>/dev/null || true
rmdir apps/scs-app/src/__mocks__ 2>/dev/null || true
```

---

## File Map

### Create new — libs/consent/data-access/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `test-setup.ts`, `vite.config.ts`
- `src/lib/scope.ts`, `src/index.ts`
- `src/lib/consent.service.ts`
- `src/lib/consent.service.spec.ts`
- `src/lib/analytics-loader.service.ts`

### Create new — libs/consent/ui/
- `tsconfig.json`, `tsconfig.lib.json`, `package.json`, `project.json`
- `src/lib/scope.ts`, `src/index.ts`
- `src/lib/cookie-banner.ts`

### Modify existing
- `tsconfig.base.json` — add `@bk2/consent-data-access` and `@bk2/consent-ui` path aliases
- `apps/scs-app/src/app/app.config.ts` — add `APP_BOOTSTRAP_LISTENER` for `AnalyticsLoaderService`
- `apps/scs-app/src/app/bk-root.ts` — import `CookieBanner`, add to template; add "Cookie-Einstellungen" link in menu

---

## Task 1: Library scaffold + ConsentService

**Files:**
- Create: all `libs/consent/data-access/` files

This is the most important task — it creates the lib infrastructure and the core service with full TDD.

- [ ] **Step 1.1: Cleanup previous session artefacts**

```bash
rm -f apps/scs-app/src/app/services/consent.service.ts \
      apps/scs-app/src/app/services/consent.service.spec.ts \
      apps/scs-app/test-setup.ts \
      apps/scs-app/vite.config.ts \
      apps/scs-app/src/__mocks__/ionic-stub.ts
rmdir apps/scs-app/src/app/services 2>/dev/null || true
rmdir apps/scs-app/src/__mocks__ 2>/dev/null || true
```

- [ ] **Step 1.2: Create lib scaffold**

`libs/consent/data-access/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
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
    { "path": "../../shared/util-core/tsconfig.lib.json" }
  ]
}
```

`libs/consent/data-access/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/consent/data-access",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/consent-data-access.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/consent/data-access/package.json`:
```json
{
  "name": "@bk2/consent-data-access",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-util-core": "*"
  }
}
```

`libs/consent/data-access/project.json`:
```json
{
  "name": "consent-data-access",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/consent/data-access/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:data-access", "scope:consent", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/consent/data-access",
        "main": "libs/consent/data-access/src/index.ts",
        "tsConfig": "libs/consent/data-access/tsconfig.lib.json",
        "assets": ["libs/consent/data-access/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/{projectRoot}"],
      "options": {
        "configFile": "libs/consent/data-access/vite.config.ts"
      }
    }
  }
}
```

`libs/consent/data-access/test-setup.ts`:
```ts
import '@angular/compiler';
```

`libs/consent/data-access/vite.config.ts`:
```ts
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { defineConfig, mergeConfig } from 'vite';
import sharedTestConfig from '../../../vitest.shared';

const libraryConfig = defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/consent/data-access',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    setupFiles: ['./test-setup.ts'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/consent/data-access',
      provider: 'v8' as const,
    },
  },
});

export default mergeConfig(libraryConfig, sharedTestConfig);
```

`libs/consent/data-access/src/lib/scope.ts`:
```ts
export const PFX = '@consent/data-access.';
```

`libs/consent/data-access/src/index.ts`:
```ts
export * from './lib/consent.service';
export * from './lib/analytics-loader.service';
```

Placeholder `libs/consent/data-access/src/lib/analytics-loader.service.ts` (real impl in Task 2):
```ts
// placeholder — implemented in Task 2
export {};
```

- [ ] **Step 1.3: Add path aliases to tsconfig.base.json**

In the `paths` object add (alphabetical order, after `@bk2/category-*` entries or wherever `consent` fits):
```json
"@bk2/consent-data-access": ["libs/consent/data-access/src/index.ts"],
"@bk2/consent-ui": ["libs/consent/ui/src/index.ts"],
```

- [ ] **Step 1.4: Write failing tests**

Create `libs/consent/data-access/src/lib/consent.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConsentService, CONSENT_KEY, DEFAULT_CONSENT, ConsentState } from './consent.service';

function makeBrowserService(): ConsentService {
  TestBed.configureTestingModule({
    providers: [
      ConsentService,
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  return TestBed.inject(ConsentService);
}

describe('ConsentService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('initial state', () => {
    it('defaults to decided=false when no stored consent', () => {
      const s = makeBrowserService();
      expect(s.needsBanner()).toBe(true);
      expect(s.getState().decided).toBe(false);
    });

    it('always has necessary=true', () => {
      const s = makeBrowserService();
      expect(s.getState().necessary).toBe(true);
    });

    it('defaults analytics and marketing to false', () => {
      const s = makeBrowserService();
      expect(s.hasAnalyticsConsent()).toBe(false);
      expect(s.hasMarketingConsent()).toBe(false);
    });

    it('loads persisted state on construction', () => {
      const stored: ConsentState = {
        necessary: true, analytics: true, marketing: false, decided: true, timestamp: 123,
      };
      localStorage.setItem(CONSENT_KEY, JSON.stringify(stored));
      const s = makeBrowserService();
      expect(s.hasAnalyticsConsent()).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('treats malformed localStorage value as default', () => {
      localStorage.setItem(CONSENT_KEY, 'not-valid-json{{{');
      const s = makeBrowserService();
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
    });
  });

  describe('acceptAll()', () => {
    it('sets analytics and marketing true, decided true', () => {
      const s = makeBrowserService();
      s.acceptAll();
      expect(s.getState().analytics).toBe(true);
      expect(s.getState().marketing).toBe(true);
      expect(s.getState().decided).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('persists to localStorage', () => {
      const s = makeBrowserService();
      s.acceptAll();
      const raw = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
      expect(raw.analytics).toBe(true);
      expect(raw.decided).toBe(true);
    });

    it('emits updated state on consent$', async () => {
      const s = makeBrowserService();
      s.acceptAll();
      const emitted = await firstValueFrom(s.consent$);
      expect(emitted.analytics).toBe(true);
    });
  });

  describe('rejectAll()', () => {
    it('sets analytics and marketing false, decided true', () => {
      const s = makeBrowserService();
      s.rejectAll();
      expect(s.getState().analytics).toBe(false);
      expect(s.getState().marketing).toBe(false);
      expect(s.getState().decided).toBe(true);
      expect(s.needsBanner()).toBe(false);
    });

    it('persists to localStorage', () => {
      const s = makeBrowserService();
      s.rejectAll();
      const raw = JSON.parse(localStorage.getItem(CONSENT_KEY)!);
      expect(raw.decided).toBe(true);
      expect(raw.analytics).toBe(false);
    });
  });

  describe('setCustom()', () => {
    it('allows opting into analytics only', () => {
      const s = makeBrowserService();
      s.setCustom({ analytics: true, marketing: false });
      expect(s.hasAnalyticsConsent()).toBe(true);
      expect(s.hasMarketingConsent()).toBe(false);
      expect(s.needsBanner()).toBe(false);
    });

    it('always enforces necessary=true even if caller passes false', () => {
      const s = makeBrowserService();
      s.setCustom({ necessary: false } as Partial<ConsentState>);
      expect(s.getState().necessary).toBe(true);
    });

    it('sets decided=true', () => {
      const s = makeBrowserService();
      s.setCustom({ analytics: false, marketing: false });
      expect(s.getState().decided).toBe(true);
    });
  });

  describe('reset()', () => {
    it('resets to default state and shows banner again', () => {
      const s = makeBrowserService();
      s.acceptAll();
      s.reset();
      expect(s.getState()).toEqual(DEFAULT_CONSENT);
      expect(s.needsBanner()).toBe(true);
    });

    it('clears localStorage on reset', () => {
      const s = makeBrowserService();
      s.acceptAll();
      s.reset();
      expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    });
  });

  describe('SSR safety (non-browser)', () => {
    it('returns default state without touching localStorage', () => {
      TestBed.configureTestingModule({
        providers: [ConsentService, { provide: PLATFORM_ID, useValue: 'server' }],
      });
      const s = TestBed.inject(ConsentService);
      expect(s.needsBanner()).toBe(true);
      expect(localStorage.getItem(CONSENT_KEY)).toBeNull();
    });
  });
});
```

- [ ] **Step 1.5: Run tests — confirm fail**

```bash
pnpm nx test consent-data-access 2>&1 | tail -10
```

Expected: FAIL — `ConsentService` not found.

- [ ] **Step 1.6: Implement ConsentService**

Create `libs/consent/data-access/src/lib/consent.service.ts`:
```ts
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { isBrowser } from '@bk2/shared-util-core';

export const CONSENT_KEY = 'cookie_consent_v1';

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  decided: boolean;
  timestamp?: number;
}

export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  decided: false,
};

@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly subject = new BehaviorSubject<ConsentState>(this.load());

  readonly consent$ = this.subject.asObservable();

  getState(): ConsentState {
    return this.subject.getValue();
  }

  needsBanner(): boolean {
    return !this.subject.getValue().decided;
  }

  hasAnalyticsConsent(): boolean {
    return this.subject.getValue().analytics;
  }

  hasMarketingConsent(): boolean {
    return this.subject.getValue().marketing;
  }

  acceptAll(): void {
    this.apply({ analytics: true, marketing: true, decided: true });
  }

  rejectAll(): void {
    this.apply({ analytics: false, marketing: false, decided: true });
  }

  setCustom(partial: Partial<Omit<ConsentState, 'necessary' | 'decided' | 'timestamp'>>): void {
    this.apply({ ...partial, decided: true });
  }

  reset(): void {
    this.subject.next(DEFAULT_CONSENT);
    if (isBrowser(this.platformId)) {
      localStorage.removeItem(CONSENT_KEY);
    }
  }

  private apply(patch: Partial<ConsentState>): void {
    const next: ConsentState = {
      ...this.subject.getValue(),
      ...patch,
      necessary: true,
      timestamp: Date.now(),
    };
    this.subject.next(next);
    this.persist(next);
  }

  private load(): ConsentState {
    if (!isBrowser(this.platformId)) return DEFAULT_CONSENT;
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (!raw) return DEFAULT_CONSENT;
      const parsed = JSON.parse(raw) as Partial<ConsentState>;
      return { ...DEFAULT_CONSENT, ...parsed, necessary: true };
    } catch {
      return DEFAULT_CONSENT;
    }
  }

  private persist(state: ConsentState): void {
    if (!isBrowser(this.platformId)) return;
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  }
}
```

- [ ] **Step 1.7: Run tests — confirm pass**

```bash
pnpm nx test consent-data-access 2>&1 | tail -10
```

Expected: 16 tests PASS.

- [ ] **Step 1.8: Commit**

```bash
git add libs/consent/data-access/ tsconfig.base.json
git commit -m "feat(consent): scaffold consent/data-access lib with ConsentService and unit tests"
```

---

## Task 2: AnalyticsLoaderService

**Files:**
- Modify: `libs/consent/data-access/src/lib/analytics-loader.service.ts` (replace placeholder)

- [ ] **Step 2.1: Implement AnalyticsLoaderService**

Replace `libs/consent/data-access/src/lib/analytics-loader.service.ts`:
```ts
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isBrowser } from '@bk2/shared-util-core';
import { ConsentService } from './consent.service';

type FirebaseAnalytics = import('firebase/analytics').Analytics;

@Injectable({ providedIn: 'root' })
export class AnalyticsLoaderService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly consentService = inject(ConsentService);
  private analytics: FirebaseAnalytics | undefined;

  init(): void {
    if (!isBrowser(this.platformId)) return;
    this.consentService.consent$.subscribe(state => {
      if (state.analytics) {
        void this.enableAnalytics();
      } else {
        void this.disableAnalytics();
      }
    });
  }

  private async enableAnalytics(): Promise<void> {
    try {
      const { getAnalytics, isSupported, setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      if (!(await isSupported())) return;
      const { getApp } = await import('firebase/app');
      if (!this.analytics) {
        this.analytics = getAnalytics(getApp());
      }
      setAnalyticsCollectionEnabled(this.analytics, true);
    } catch {
      // analytics is non-essential — fail silently
    }
  }

  private async disableAnalytics(): Promise<void> {
    if (!this.analytics) return;
    try {
      const { setAnalyticsCollectionEnabled } = await import('firebase/analytics');
      setAnalyticsCollectionEnabled(this.analytics, false);
    } catch {
      // analytics is non-essential — fail silently
    }
  }
}
```

- [ ] **Step 2.2: Run tests — confirm no regressions**

```bash
pnpm nx test consent-data-access 2>&1 | tail -5
```

Expected: 16 tests PASS.

- [ ] **Step 2.3: Commit**

```bash
git add libs/consent/data-access/src/lib/analytics-loader.service.ts
git commit -m "feat(consent): add AnalyticsLoaderService — lazy Firebase Analytics after consent"
```

---

## Task 3: UI layer scaffold + CookieBanner

**Files:**
- Create: all `libs/consent/ui/` files

- [ ] **Step 3.1: Create ui lib scaffold**

`libs/consent/ui/tsconfig.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
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
    { "path": "../../shared/util-core/tsconfig.lib.json" },
    { "path": "../data-access/tsconfig.lib.json" }
  ]
}
```

`libs/consent/ui/tsconfig.lib.json`:
```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/consent/ui",
    "declaration": true,
    "composite": true,
    "module": "preserve",
    "target": "es2020",
    "types": [],
    "tsBuildInfoFile": "../../../dist/out-tsc/consent-ui.tsbuildinfo",
    "moduleResolution": "bundler",
    "lib": ["dom", "es2022"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.spec.ts", "**/*.spec2.ts", "**/test-setup.ts", "vite.config.ts"]
}
```

`libs/consent/ui/package.json`:
```json
{
  "name": "@bk2/consent-ui",
  "version": "0.0.1",
  "main": "./src/index.js",
  "types": "./src/index.d.ts",
  "sideEffects": false,
  "private": true,
  "dependencies": {
    "tslib": "^2.8.1",
    "@bk2/shared-util-core": "*",
    "@bk2/consent-data-access": "*"
  }
}
```

`libs/consent/ui/project.json`:
```json
{
  "name": "consent-ui",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/consent/ui/src",
  "prefix": "bk",
  "projectType": "library",
  "tags": ["type:ui", "scope:consent", "platform:mobile", "platform:web"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "outputs": ["{options.outputPath}"],
      "options": {
        "outputPath": "dist/libs/consent/ui",
        "main": "libs/consent/ui/src/index.ts",
        "tsConfig": "libs/consent/ui/tsconfig.lib.json",
        "assets": ["libs/consent/ui/*.md"],
        "updateBuildableProjectDepsInPackageJson": false
      }
    },
    "lint": { "executor": "@nx/eslint:lint" }
  }
}
```

`libs/consent/ui/src/lib/scope.ts`:
```ts
export const PFX = '@consent/ui.';
```

`libs/consent/ui/src/index.ts`:
```ts
export * from './lib/cookie-banner';
```

- [ ] **Step 3.2: Implement CookieBanner**

Create `libs/consent/ui/src/lib/cookie-banner.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonItem, IonLabel, IonList, IonToggle,
} from '@ionic/angular/standalone';

import { ConsentService } from '@bk2/consent-data-access';

@Component({
  selector: 'bk-cookie-banner',
  standalone: true,
  imports: [FormsModule, IonButton, IonItem, IonLabel, IonList, IonToggle],
  styles: [`
    .cookie-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      background: var(--ion-background-color, #fff);
      border-top: 2px solid var(--ion-color-medium, #92949c);
      padding: 16px;
      box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.18);
    }
    .banner-text {
      margin: 0 0 12px;
      font-size: 14px;
      line-height: 1.5;
    }
    .banner-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .banner-actions ion-button {
      flex: 1 1 auto;
      min-width: 140px;
    }
    .preferences-section {
      margin-top: 12px;
      border-top: 1px solid var(--ion-border-color, #e0e0e0);
      padding-top: 8px;
    }
  `],
  template: `
    @if (needsBanner()) {
      <div class="cookie-banner" role="dialog" aria-label="Cookie-Einstellungen" aria-live="polite">
        <p class="banner-text">
          Wir verwenden Cookies und ähnliche Technologien. Notwendige Cookies sind immer aktiv.
          Analytische Cookies helfen uns, die App zu verbessern — nur mit Ihrer Zustimmung.
        </p>

        <div class="banner-actions">
          <ion-button expand="block" color="primary" (click)="acceptAll()">
            Alle akzeptieren
          </ion-button>
          <ion-button expand="block" color="primary" fill="outline" (click)="rejectAll()">
            Nur notwendige
          </ion-button>
          <ion-button expand="block" color="medium" fill="outline" (click)="toggleCustomize()">
            Anpassen
          </ion-button>
        </div>

        @if (showCustomize()) {
          <div class="preferences-section">
            <ion-list lines="none">
              <ion-item>
                <ion-label>
                  <h3>Notwendig</h3>
                  <p>Authentifizierung, Sitzung, Sicherheit</p>
                </ion-label>
                <ion-toggle [checked]="true" [disabled]="true" slot="end" />
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>Analyse</h3>
                  <p>Firebase Analytics — hilft uns, die App zu verbessern</p>
                </ion-label>
                <ion-toggle
                  [checked]="analyticsToggle()"
                  (ionChange)="analyticsToggle.set($event.detail.checked)"
                  slot="end"
                />
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>Marketing</h3>
                  <p>Aktuell keine Marketing-Dienste aktiv</p>
                </ion-label>
                <ion-toggle
                  [checked]="marketingToggle()"
                  (ionChange)="marketingToggle.set($event.detail.checked)"
                  slot="end"
                />
              </ion-item>
            </ion-list>
            <ion-button expand="block" color="primary" (click)="saveCustom()">
              Einstellungen speichern
            </ion-button>
          </div>
        }
      </div>
    }
  `,
})
export class CookieBanner {
  private readonly consentService = inject(ConsentService);

  protected readonly needsBanner = toSignal(
    this.consentService.consent$.pipe(map(s => !s.decided)),
    { initialValue: true },
  );
  protected readonly showCustomize = signal(false);
  protected readonly analyticsToggle = signal(false);
  protected readonly marketingToggle = signal(false);

  protected acceptAll(): void {
    this.consentService.acceptAll();
    this.showCustomize.set(false);
  }

  protected rejectAll(): void {
    this.consentService.rejectAll();
    this.showCustomize.set(false);
  }

  protected toggleCustomize(): void {
    const opening = !this.showCustomize();
    if (opening) {
      const state = this.consentService.getState();
      this.analyticsToggle.set(state.analytics);
      this.marketingToggle.set(state.marketing);
    }
    this.showCustomize.set(opening);
  }

  protected saveCustom(): void {
    this.consentService.setCustom({
      analytics: this.analyticsToggle(),
      marketing: this.marketingToggle(),
    });
    this.showCustomize.set(false);
  }
}
```

- [ ] **Step 3.3: Type-check ui layer**

```bash
npx tsc --noEmit -p libs/consent/ui/tsconfig.json 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3.4: Commit**

```bash
git add libs/consent/ui/
git commit -m "feat(consent): add consent/ui lib with CookieBanner component"
```

---

## Task 4: Wire up in scs-app

**Files:**
- Modify: `apps/scs-app/src/app/app.config.ts`
- Modify: `apps/scs-app/src/app/bk-root.ts`

Read both files before making any changes.

- [ ] **Step 4.1: Add AnalyticsLoaderService bootstrap to app.config.ts**

Add these imports at the top of `apps/scs-app/src/app/app.config.ts`:
```ts
import { AnalyticsLoaderService } from '@bk2/consent-data-access';
```

`Injector` is already imported from `@angular/core`. Add a new `APP_BOOTSTRAP_LISTENER` provider after the Matrix chat block (before the closing `]` of `providers`):

```ts
    // Initialize Analytics only after consent is granted.
    // firebase/analytics is NOT in the initial bundle — lazily imported by AnalyticsLoaderService.
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object, injector: Injector) => {
        return () => {
          if (isBrowser(platformId)) {
            injector.get(AnalyticsLoaderService).init();
          }
        };
      },
      deps: [PLATFORM_ID, Injector],
      multi: true,
    },
```

`isBrowser` is already imported in `app.config.ts` from `@bk2/shared-util-angular`. `PLATFORM_ID` is already imported from `@angular/core`.

- [ ] **Step 4.2: Add CookieBanner and cookie settings to bk-root.ts**

Add this import:
```ts
import { CookieBanner } from '@bk2/consent-ui';
import { ConsentService } from '@bk2/consent-data-access';
```

Add `CookieBanner` to the `@Component` `imports` array.

Inject `ConsentService` in the class:
```ts
protected readonly consentService = inject(ConsentService);
```

Add `openCookieSettings()` method to the class:
```ts
protected openCookieSettings(): void {
  this.consentService.reset();
}
```

In the template, place `<bk-cookie-banner />` as the **first child inside `<ion-app>`**, before `<ion-split-pane>`:
```html
<ion-app>
  <bk-cookie-banner />
  <ion-split-pane contentId="main" [disabled]="!showMenu()">
    ...
  </ion-split-pane>
</ion-app>
```

Inside `<ion-content>` (the left menu), add a "Cookie settings" item at the bottom, after the existing `bk-auth-info` block:
```html
  <ion-item lines="none" button detail="false" (click)="openCookieSettings()">
    <ion-label color="medium" style="font-size: 13px;">Cookie-Einstellungen</ion-label>
  </ion-item>
```

- [ ] **Step 4.3: Type-check**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json 2>&1 | head -30
```

Expected: no errors. Fix any that appear before committing.

- [ ] **Step 4.4: Run tests**

```bash
pnpm nx test consent-data-access 2>&1 | tail -5
```

Expected: 16 tests PASS.

- [ ] **Step 4.5: Commit**

```bash
git add apps/scs-app/src/app/app.config.ts \
        apps/scs-app/src/app/bk-root.ts
git commit -m "feat(consent): wire CookieBanner and AnalyticsLoaderService into scs-app"
```

---

## Task 5: Acceptance criteria verification

- [ ] **Step 5.1: Run all tests**

```bash
pnpm nx test consent-data-access 2>&1 | tail -5
```

Expected: 16 PASS.

- [ ] **Step 5.2: Manual checklist**

Serve the app:
```bash
pnpm nx serve scs-app
```

In a fresh browser profile (or after clearing all site data in DevTools → Application → Clear site data):

- [ ] Banner appears at the bottom on first visit (decided=false)
- [ ] "Alle akzeptieren" and "Nur notwendige" are same size (both `expand="block"`)
- [ ] "Alle akzeptieren" hides the banner; localStorage shows `decided:true, analytics:true`
- [ ] "Nur notwendige" hides the banner; localStorage shows `decided:true, analytics:false`
- [ ] "Anpassen" expands inline preferences; "Einstellungen speichern" hides the banner
- [ ] After dismissal, page refresh does NOT show banner again
- [ ] "Cookie-Einstellungen" in left menu calls `reset()` and banner reappears
- [ ] DevTools → Network shows NO `firebase/analytics` requests until analytics consent granted

---

## Self-Review: Spec Coverage

| Spec Requirement | Task |
|---|---|
| `ConsentService` persists under `cookie_consent_v1` | Task 1 |
| `consent$` Observable | Task 1 |
| `acceptAll()`, `rejectAll()`, `setCustom()`, `reset()` | Task 1 |
| `hasAnalyticsConsent()`, `hasMarketingConsent()`, `needsBanner()`, `getState()` | Task 1 |
| `necessary: true` always enforced | Task 1 |
| `timestamp` on state changes | Task 1 (`apply()` sets `Date.now()`) |
| SSR safety (`isBrowser` guards) | Task 1 + Task 2 |
| Firebase Analytics NOT in initial bundle (dynamic import) | Task 2 |
| `setAnalyticsCollectionEnabled(false)` on consent withdrawal | Task 2 |
| `isSupported()` guard for Capacitor/SSR | Task 2 |
| Banner: fixed bottom, z-index 10000 | Task 3 |
| Three equal-weight actions (Accept/Reject/Customize) | Task 3 |
| No pre-ticked boxes (analytics/marketing default off) | Task 3 |
| Per-category toggles in Customize section | Task 3 |
| Banner reactive to consent state changes | Task 3 (`toSignal(consent$)`) |
| Banner rendered globally from app root | Task 4 |
| "Cookie settings" link reachable from menu | Task 4 |
| Shared lib — same code for all apps | All tasks (lives in `libs/consent/`) |

**Out of scope:** Full-screen PreferencesModal, Firestore sync of consent records, Google Consent Mode v2, geo-aware banner, re-prompt interval.

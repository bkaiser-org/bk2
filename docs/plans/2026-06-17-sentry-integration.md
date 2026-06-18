# Sentry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture unhandled JS errors, promise rejections, router/HTTP context, and pseudonymous user/tenant context from the `scs-app` and `test-app` Angular/Ionic apps into a DSG-compliant EU Sentry project, with readable production stack traces via source-map upload on deploy.

**Architecture:** Pure DSG-scrubbing helpers live in `@bk2/shared-util-core`; Sentry option-building, the `beforeSend` gate, the HTTP-breadcrumb interceptor, and pseudonymous context helpers live in `@bk2/shared-util-angular`; a `SentryContextService` in `@bk2/shared-feature` reacts to `AppStore` auth signals. Each app initializes Sentry first (a side-effect `init-sentry.ts` imported at the top of `main.ts`) and wires the `ErrorHandler`, router `TraceService`, interceptor, and context service in `app.config.ts`. Config flows through the generated `environment.ts` via a new `sentry` block on `BkEnvironment` populated by `set-env.js`. Source maps are uploaded with `@sentry/cli` before the manual Firebase deploy and excluded from the deployed artifact.

**Tech Stack:** Angular 21 (standalone, zoneless), Ionic 8, `@sentry/angular@10.56.0` (already installed), `@sentry/cli@3.5.0` (already installed), Nx `@angular/build:application`, Vitest, Firebase Hosting (manual deploy).

**Decisions locked for this plan:** `@sentry/angular` only (no `@sentry/capacitor` — native crash layer deferred to a future Phase 3); apps in scope are `scs-app` + `test-app` (the websites use `nx:run-commands`, not Angular); Phases 1 + 2 only (errors/context/scrubbing + source maps on the manual deploy — there is no CI). **No new dependency is installed** — both `@sentry/angular` and `@sentry/cli` are already in `package.json`.

**Release name convention:** `<tenantId>@<package.json version>`, e.g. `scs@6.4.58` for `scs-app`, `test@6.4.58` for `test-app`. `tenantId` is the app folder name minus the `-app` suffix (matches `set-env.js`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `libs/shared/util-core/src/lib/sentry-redact.util.ts` | Pure `redactSensitive()` (AHV/IBAN/email) + `stripPii()` (URL query) | Create |
| `libs/shared/util-core/src/lib/sentry-redact.util.spec.ts` | Unit tests for redaction/stripPii | Create |
| `libs/shared/util-core/src/index.ts` | Export the new util | Modify |
| `libs/shared/util-angular/src/lib/sentry.ts` | `SentryConfig`, `beforeSend`, `buildSentryOptions`, `httpBreadcrumbInterceptor`, `setSentryUser`/`clearSentryUser` | Create |
| `libs/shared/util-angular/src/lib/sentry.spec.ts` | Unit tests for `beforeSend` + `buildSentryOptions` | Create |
| `libs/shared/util-angular/src/index.ts` | Export the new module | Modify |
| `libs/shared/feature/src/lib/sentry-context.service.ts` | Effect on `AppStore` → set/clear pseudonymous context | Create |
| `libs/shared/feature/src/index.ts` | Export `SentryContextService` | Modify |
| `libs/shared/config/src/lib/env.ts` | Add optional `sentry` block to `BkEnvironment` | Modify |
| `set-env.js` | Emit the `sentry` block into generated `environment.ts` | Modify |
| `apps/scs-app/src/init-sentry.ts` | `Sentry.init()` side-effect module | Create |
| `apps/scs-app/src/main.ts` | Import `./init-sentry` first | Modify |
| `apps/scs-app/src/app/app.config.ts` | ErrorHandler, TraceService, interceptor, context init | Modify |
| `apps/test-app/src/init-sentry.ts` | `Sentry.init()` side-effect module | Create |
| `apps/test-app/src/main.ts` | Import `./init-sentry` first | Modify |
| `apps/test-app/src/app/app.config.ts` | ErrorHandler, TraceService, interceptor, context init | Modify |
| `apps/scs-app/project.json` / `apps/test-app/project.json` | Hidden source maps in `production` config | Modify |
| `firebase.json` | Add `**/*.map` to `ignore` for both app sites | Modify |
| `scripts/sentry-sourcemaps.mjs` | Inject debug IDs + create/upload/finalize release | Create |
| `package.json` | `sentry:sourcemaps` script | Modify |

---

## PHASE 1 — Errors, Context & Scrubbing

### Task 1: Add the `sentry` config block to `BkEnvironment` and `set-env.js`

**Files:**
- Modify: `libs/shared/config/src/lib/env.ts`
- Modify: `set-env.js`

- [ ] **Step 1: Add the optional `sentry` block to the interface**

In `libs/shared/config/src/lib/env.ts`, add a top-level optional `sentry` property to `BkEnvironment` (after the `services` block, before the closing brace):

```typescript
export interface BkEnvironment {
  production: boolean;
  useEmulators: boolean;
  tenantId: string;
  appId: string; // human-readable app identifier for per-app branding (e.g. 'scs', 'test')
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  },
  services: {
    matrixHomeserver: string;
    appcheckRecaptchaEnterpriseKey: string;
    gmapKey: string;
    nxCloudAccessToken: string;
    imgixBaseUrl: string;
    fcmVapidKey?: string; // Web Push VAPID key (Firebase Console → Project Settings → Cloud Messaging)
  },
  sentry?: {
    dsn: string;                                        // EU (DE) project DSN, e.g. https://...ingest.de.sentry.io/...
    environment: 'development' | 'staging' | 'production';
    release: string;                                    // '<tenantId>@<package.json version>'
    tracesSampleRate: number;                           // 0 in dev, 0.1 in prod
    enabled: boolean;                                   // false in dev / when no DSN
  }
}
```

- [ ] **Step 2: Read the Sentry DSN + package version in `set-env.js`**

In `set-env.js`, after the `servicesConfig.fcmVapidKey` assignment (~line 94), add:

```javascript
// Sentry configuration (optional — app runs without it). DSN is public/non-secret.
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const isProd = process.env.NODE_ENV === 'production';
// Release name = '<tenantId>@<package.json version>' (tenantId derived below from project name).
const appVersion = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
```

> Note: `tenantId` is already computed at line 99 (`const tenantId = projectName.replace(/-app$/, '')`). The block below references it; it is in scope inside `generateEnvFileContent`.

- [ ] **Step 3: Emit the `sentry` block in the generated env file**

In `set-env.js` `generateEnvFileContent(isProduction)`, add the `sentry` block to the returned template literal, immediately after the closing `},` of the `services` object and before the final `};`:

```javascript
  services: {
    matrixHomeserver: 'matrix.bkchat.etke.host',
    appcheckRecaptchaEnterpriseKey: '${servicesConfig.appcheckRecaptchaEnterpriseKey}',
    gmapKey: '${servicesConfig.gmapKey}',
    nxCloudAccessToken: '${servicesConfig.nxCloudAccessToken}',
    imgixBaseUrl: '${servicesConfig.imgixBaseUrl}',
    fcmVapidKey: '${servicesConfig.fcmVapidKey}',
  },
  sentry: {
    dsn: '${sentryDsn}',
    environment: '${isProduction ? 'production' : 'development'}',
    release: '${tenantId}@${appVersion}',
    tracesSampleRate: ${isProduction ? 0.1 : 0},
    enabled: ${isProduction && sentryDsn !== '' ? true : false},
  },
```

Do **not** add the DSN to `checkRequiredSettings()` — Sentry is optional and the app must build/run without it.

- [ ] **Step 4: Regenerate one env file and verify the block appears**

Run (loads scs-app env vars then regenerates `environment.ts`):

```bash
cd /Users/bruno/proj/bkaiser/bk2
source ./apps/scs-app/.env && NX_TASK_TARGET_PROJECT=scs-app ts-node ./set-env.js
grep -A6 "sentry:" apps/scs-app/src/environments/environment.ts
```

Expected: a `sentry:` block with `dsn`, `environment: 'development'` (local, NODE_ENV unset), `release: 'scs@6.4.58'`, `tracesSampleRate: 0`, `enabled: false`.

- [ ] **Step 5: Type-check shared-config**

Run: `npx tsc --noEmit -p libs/shared/config/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/config/src/lib/env.ts set-env.js
git commit -m "feat(sentry): add optional sentry config to BkEnvironment + set-env.js"
```

---

### Task 2: Pure DSG redaction helpers (TDD)

**Files:**
- Create: `libs/shared/util-core/src/lib/sentry-redact.util.ts`
- Test: `libs/shared/util-core/src/lib/sentry-redact.util.spec.ts`
- Modify: `libs/shared/util-core/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared/util-core/src/lib/sentry-redact.util.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { redactSensitive, stripPii } from './sentry-redact.util';

describe('redactSensitive', () => {
  it('redacts a Swiss AHV number', () => {
    expect(redactSensitive('user 756.1234.5678.90 failed')).toBe('user [AHV] failed');
  });

  it('redacts an IBAN', () => {
    expect(redactSensitive('iban CH93 0076 2011 6238 5295 7 here')).toBe('iban [IBAN] here');
  });

  it('redacts an email address', () => {
    expect(redactSensitive('contact john.doe@example.com now')).toBe('contact [EMAIL] now');
  });

  it('redacts multiple kinds in one string', () => {
    const out = redactSensitive('756.1234.5678.90 / a@b.ch');
    expect(out).toContain('[AHV]');
    expect(out).toContain('[EMAIL]');
  });

  it('returns undefined unchanged', () => {
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  it('leaves clean text untouched', () => {
    expect(redactSensitive('nothing sensitive here')).toBe('nothing sensitive here');
  });
});

describe('stripPii', () => {
  it('removes the query string from a URL', () => {
    expect(stripPii('/api/persons/abc?token=secret&id=42')).toBe('/api/persons/abc');
  });

  it('returns a URL without query unchanged', () => {
    expect(stripPii('/api/persons/abc')).toBe('/api/persons/abc');
  });

  it('handles empty input', () => {
    expect(stripPii('')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm run test shared-util-core -- sentry-redact`
Expected: FAIL — cannot resolve `./sentry-redact.util`.

- [ ] **Step 3: Write the implementation**

Create `libs/shared/util-core/src/lib/sentry-redact.util.ts`:

```typescript
/**
 * Pure DSG/privacy redaction helpers for Sentry payloads.
 * These are a safety net — the real defence is never capturing PII in the first place.
 */

const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // AHV-Nummer  756.XXXX.XXXX.XX
  [/\b756\.\d{4}\.\d{4}\.\d{2}\b/g, '[AHV]'],
  // IBAN (CH/LI and general, allows spaced groups)
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, '[IBAN]'],
  // E-Mail
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
];

/** Replace AHV numbers, IBANs and emails inside an arbitrary string. */
export function redactSensitive(input?: string): string | undefined {
  if (!input) return input;
  return PATTERNS.reduce((s, [re, repl]) => s.replace(re, repl), input);
}

/** Drop the query string from a URL so identifiers in params never enter a breadcrumb. */
export function stripPii(url: string): string {
  if (!url) return url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}
```

- [ ] **Step 4: Export from the index**

In `libs/shared/util-core/src/index.ts`, add (alphabetically near the others):

```typescript
export * from './lib/sentry-redact.util';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm run test shared-util-core -- sentry-redact`
Expected: PASS (all cases green).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p libs/shared/util-core/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/util-core/src/lib/sentry-redact.util.ts libs/shared/util-core/src/lib/sentry-redact.util.spec.ts libs/shared/util-core/src/index.ts
git commit -m "feat(sentry): add pure DSG redaction helpers (redactSensitive, stripPii)"
```

---

### Task 3: Sentry options, beforeSend, interceptor & context helpers (TDD where pure)

**Files:**
- Create: `libs/shared/util-angular/src/lib/sentry.ts`
- Test: `libs/shared/util-angular/src/lib/sentry.spec.ts`
- Modify: `libs/shared/util-angular/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/shared/util-angular/src/lib/sentry.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/angular';
import { beforeSend, buildSentryOptions, SentryConfig } from './sentry';

const cfg: SentryConfig = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/2',
  environment: 'production',
  release: 'scs@1.2.3',
  tracesSampleRate: 0.1,
  enabled: true,
};

describe('buildSentryOptions', () => {
  it('passes through dsn, environment, release and enabled', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.dsn).toBe(cfg.dsn);
    expect(o.environment).toBe('production');
    expect(o.release).toBe('scs@1.2.3');
    expect(o.enabled).toBe(true);
  });

  it('never auto-attaches PII and always installs beforeSend', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.sendDefaultPii).toBe(false);
    expect(o.beforeSend).toBe(beforeSend);
  });
});

describe('beforeSend', () => {
  it('drops development events entirely', () => {
    const event = { environment: 'development', message: 'boom' } as ErrorEvent;
    expect(beforeSend(event, {})).toBeNull();
  });

  it('redacts the message of a production event', () => {
    const event = { environment: 'production', message: 'fail for a@b.ch' } as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.message).toBe('fail for [EMAIL]');
  });

  it('redacts exception values and breadcrumb messages', () => {
    const event = {
      environment: 'production',
      exception: { values: [{ value: 'AHV 756.1234.5678.90' }] },
      breadcrumbs: [{ message: 'iban CH93 0076 2011 6238 5295 7' }],
    } as unknown as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.exception?.values?.[0].value).toContain('[AHV]');
    expect(out?.breadcrumbs?.[0].message).toContain('[IBAN]');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm run test shared-util-angular -- sentry`
Expected: FAIL — cannot resolve `./sentry`.

- [ ] **Step 3: Write the implementation**

Create `libs/shared/util-angular/src/lib/sentry.ts`:

```typescript
import { HttpInterceptorFn } from '@angular/common/http';
import { addBreadcrumb, setTag, setUser } from '@sentry/angular';
import type { BrowserOptions, ErrorEvent, EventHint } from '@sentry/angular';
import { redactSensitive, stripPii } from '@bk2/shared-util-core';
import { catchError } from 'rxjs';

/** Sentry configuration as emitted into environment.ts by set-env.js. */
export interface SentryConfig {
  dsn: string;
  environment: 'development' | 'staging' | 'production';
  release: string;
  tracesSampleRate: number;
  enabled: boolean;
}

/** Final scrubbing gate — runs on every event before it leaves the client. */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Backstop: never send development noise (enabled:false already prevents this in dev).
  if (event.environment === 'development') return null;

  if (event.message) event.message = redactSensitive(event.message);
  event.exception?.values?.forEach((v) => { v.value = redactSensitive(v.value); });
  event.breadcrumbs?.forEach((b) => { b.message = redactSensitive(b.message); });

  return event;
}

/** One options object shared by every app, guaranteeing identical behaviour. */
export function buildSentryOptions(
  cfg: SentryConfig,
  integrations: BrowserOptions['integrations'],
): BrowserOptions {
  return {
    dsn: cfg.dsn,
    environment: cfg.environment,
    enabled: cfg.enabled,
    release: cfg.release,

    integrations,

    tracesSampleRate: cfg.tracesSampleRate,
    tracePropagationTargets: [
      /^https:\/\/[^/]*\.cloudfunctions\.net/,
      /^https:\/\/firestore\.googleapis\.com/,
    ],

    // DSG: do NOT auto-attach IP / headers / cookies.
    sendDefaultPii: false,

    beforeSend,
  };
}

/**
 * Attaches failed HTTP calls as breadcrumbs (not separate issues, which would flood the
 * dashboard). The URL query string is stripped so identifiers never enter a breadcrumb.
 */
export const httpBreadcrumbInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err) => {
      addBreadcrumb({
        category: 'http',
        level: 'error',
        message: `${req.method} ${stripPii(req.urlWithParams)} → ${err?.status ?? '?'}`,
      });
      throw err;
    }),
  );

/** Set pseudonymous user/tenant/role context. id MUST be a Firebase UID, never an email. */
export function setSentryUser(id: string, tenant: string, roles: readonly string[]): void {
  setUser({ id });
  setTag('mandant', tenant);
  setTag('role', roles.join(','));
}

/** Clear all user context (call on logout). */
export function clearSentryUser(): void {
  setUser(null);
}
```

- [ ] **Step 4: Export from the index**

In `libs/shared/util-angular/src/index.ts`, add:

```typescript
export * from './lib/sentry';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm run test shared-util-angular -- sentry`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p libs/shared/util-angular/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/util-angular/src/lib/sentry.ts libs/shared/util-angular/src/lib/sentry.spec.ts libs/shared/util-angular/src/index.ts
git commit -m "feat(sentry): add options builder, beforeSend gate, http breadcrumb interceptor & context helpers"
```

---

### Task 4: `SentryContextService` reacting to `AppStore` auth state

**Files:**
- Create: `libs/shared/feature/src/lib/sentry-context.service.ts`
- Modify: `libs/shared/feature/src/index.ts`

> `AppStore` (in this same lib) exposes `fbUser()` (Firebase user, has `.uid` — pseudonymous), `tenantId()` (string), and `roles()` (string[] computed from `currentUser().roles ?? []`). We use `fbUser().uid` as the Sentry user id — never the email.

- [ ] **Step 1: Create the service**

Create `libs/shared/feature/src/lib/sentry-context.service.ts`:

```typescript
import { effect, inject, Injectable } from '@angular/core';
import { clearSentryUser, setSentryUser } from '@bk2/shared-util-angular';
import { AppStore } from './app.store';

/**
 * Pushes pseudonymous user/tenant/role context into Sentry whenever the AppStore auth
 * state changes. Instantiate once after bootstrap (see app.config.ts). No PII (no email,
 * no name) is ever sent — only the Firebase UID, tenant id and roles.
 */
@Injectable({ providedIn: 'root' })
export class SentryContextService {
  private readonly appStore = inject(AppStore);

  constructor() {
    effect(() => {
      const uid = this.appStore.fbUser()?.uid;
      if (uid) {
        setSentryUser(uid, this.appStore.tenantId(), this.appStore.roles());
      } else {
        clearSentryUser();
      }
    });
  }
}
```

- [ ] **Step 2: Export from the index**

In `libs/shared/feature/src/index.ts`, add (near the other store/service exports):

```typescript
export * from './lib/sentry-context.service';
```

- [ ] **Step 3: Verify the `AppStore` signal names**

Run:

```bash
grep -nE "fbUser|tenantId:|roles:" libs/shared/feature/src/lib/app.store.ts | head
```

Expected: `fbUser` is a state/prop signal, `tenantId` is a state signal, `roles` is a computed signal. If any name differs, adjust the service accordingly before continuing.

- [ ] **Step 4: Type-check shared-feature**

Run: `npx tsc --noEmit -p libs/shared/feature/tsconfig.json`
Expected: no errors. (If it reports that `@bk2/shared-util-angular` is not referenced, add it to `libs/shared/feature/tsconfig.json` `references` and to `package.json` dependencies — it is almost certainly already present.)

- [ ] **Step 5: Commit**

```bash
git add libs/shared/feature/src/lib/sentry-context.service.ts libs/shared/feature/src/index.ts
git commit -m "feat(sentry): add SentryContextService driven by AppStore auth signals"
```

---

### Task 5: Wire Sentry into `scs-app`

**Files:**
- Create: `apps/scs-app/src/init-sentry.ts`
- Modify: `apps/scs-app/src/main.ts:1` (first import)
- Modify: `apps/scs-app/src/app/app.config.ts`

> **Why a separate `init-sentry.ts`:** ES module imports are evaluated before any statement in `main.ts`. `app.config.ts` runs `initializeApp(firebase)` as an import side-effect. Importing `./init-sentry` as the very first line of `main.ts` guarantees `Sentry.init()` runs before any other module side-effect, so even early errors are captured.

- [ ] **Step 1: Create the init module**

Create `apps/scs-app/src/init-sentry.ts`:

```typescript
import * as Sentry from '@sentry/angular';
import { buildSentryOptions } from '@bk2/shared-util-angular';
import { environment } from './environments/environment';

// Initialize Sentry before anything else. No-op when no sentry config / DSN is present
// (e.g. local dev), so the app always boots even without monitoring.
if (environment.sentry?.dsn) {
  Sentry.init(
    buildSentryOptions(environment.sentry, [Sentry.browserTracingIntegration()]),
  );
}
```

- [ ] **Step 2: Import it first in `main.ts`**

In `apps/scs-app/src/main.ts`, add as the very first line (before the `bootstrapApplication` import):

```typescript
import './init-sentry';
```

- [ ] **Step 3: Wire providers in `app.config.ts`**

In `apps/scs-app/src/app/app.config.ts`:

1. Add imports near the top:

```typescript
import { ApplicationConfig, APP_BOOTSTRAP_LISTENER, ErrorHandler, importProvidersFrom, inject, Injector, isDevMode, PLATFORM_ID, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import * as Sentry from '@sentry/angular';
import { httpBreadcrumbInterceptor } from '@bk2/shared-util-angular';
import { SentryContextService } from '@bk2/shared-feature';
```

> Note: `APP_BOOTSTRAP_LISTENER`, `inject`, `Injector`, `isDevMode`, `PLATFORM_ID`, `provideZonelessChangeDetection`, `importProvidersFrom` are already imported on the existing line 2 — merge `ErrorHandler` and `provideAppInitializer` into that existing import instead of duplicating. `AppStore` is already imported. The `provideHttpClient` import on line 1 must gain `withInterceptors`.

2. Replace the existing `provideHttpClient(),` (line 71) with:

```typescript
    provideHttpClient(withInterceptors([httpBreadcrumbInterceptor])),
```

3. Add these three providers inside the `providers` array (e.g. right after `provideHttpClient(...)`):

```typescript
    // Sentry: route uncaught Angular errors through Sentry's ErrorHandler.
    { provide: ErrorHandler, useValue: Sentry.createErrorHandler({ showDialog: false }) },
    // Sentry: record router navigations as spans.
    { provide: Sentry.TraceService, deps: [Router] },
    provideAppInitializer(() => { inject(Sentry.TraceService); }),
```

4. Add a new `APP_BOOTSTRAP_LISTENER` provider inside the `providers` array (alongside the existing ones) to start the pseudonymous-context effect in the browser only:

```typescript
    // Sentry: start pushing pseudonymous user/tenant/role context after bootstrap (browser only).
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: (platformId: object) => {
        const sentryContext = inject(SentryContextService);
        return () => {
          if (!isBrowser(platformId)) return;
          // touch the service so its effect is created
          void sentryContext;
        };
      },
      deps: [PLATFORM_ID],
      multi: true,
    },
```

> `Router` is already imported on line 3 (`@angular/router`). `isBrowser` is already imported on line 8.

- [ ] **Step 4: Type-check the app**

Run: `npx tsc --noEmit -p apps/scs-app/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Build the app to confirm it compiles end-to-end**

Run: `pnpm nx build scs-app`
Expected: build succeeds (env must be generated first — run the `set-env.js` command from Task 1 Step 4 if `environment.ts` is missing).

- [ ] **Step 6: Commit**

```bash
git add apps/scs-app/src/init-sentry.ts apps/scs-app/src/main.ts apps/scs-app/src/app/app.config.ts
git commit -m "feat(sentry): wire Sentry init, ErrorHandler, router tracing, interceptor & context into scs-app"
```

---

### Task 6: Wire Sentry into `test-app`

**Files:**
- Create: `apps/test-app/src/init-sentry.ts`
- Modify: `apps/test-app/src/main.ts`
- Modify: `apps/test-app/src/app/app.config.ts`

> Mirror Task 5 exactly for `test-app`. Read `apps/test-app/src/app/app.config.ts` and `apps/test-app/src/main.ts` first — they may differ slightly from `scs-app` (e.g. fewer providers). Apply the same four edits, adapting import-merging to whatever is already imported there.

- [ ] **Step 1: Create the init module**

Create `apps/test-app/src/init-sentry.ts` with identical content to `apps/scs-app/src/init-sentry.ts`:

```typescript
import * as Sentry from '@sentry/angular';
import { buildSentryOptions } from '@bk2/shared-util-angular';
import { environment } from './environments/environment';

// Initialize Sentry before anything else. No-op when no sentry config / DSN is present
// (e.g. local dev), so the app always boots even without monitoring.
if (environment.sentry?.dsn) {
  Sentry.init(
    buildSentryOptions(environment.sentry, [Sentry.browserTracingIntegration()]),
  );
}
```

- [ ] **Step 2: Import it first in `main.ts`**

In `apps/test-app/src/main.ts`, add as the very first line:

```typescript
import './init-sentry';
```

- [ ] **Step 3: Wire providers in `app.config.ts`**

Apply the same four edits as Task 5 Step 3 to `apps/test-app/src/app/app.config.ts`:
1. add the Sentry/interceptor/context imports (merge with existing `@angular/core` import);
2. wrap the HTTP client with `withInterceptors([httpBreadcrumbInterceptor])`;
3. add the `ErrorHandler`, `Sentry.TraceService` and `provideAppInitializer(() => { inject(Sentry.TraceService); })` providers;
4. add the `APP_BOOTSTRAP_LISTENER` that injects `SentryContextService` (guarded with `isBrowser`).

If `test-app`'s config lacks `isBrowser`/`PLATFORM_ID`/`Router` imports, add them (`isBrowser` from `@bk2/shared-util-angular`, `Router` from `@angular/router`).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p apps/test-app/tsconfig.app.json`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `pnpm nx build test-app`
Expected: build succeeds (generate `test-app` env first if needed: `source ./apps/test-app/.env && NX_TASK_TARGET_PROJECT=test-app ts-node ./set-env.js`).

- [ ] **Step 6: Commit**

```bash
git add apps/test-app/src/init-sentry.ts apps/test-app/src/main.ts apps/test-app/src/app/app.config.ts
git commit -m "feat(sentry): wire Sentry into test-app"
```

---

### Task 7: Manual verification of Phase 1 (T1–T4, T7)

**Files:** none (runtime verification). Requires a real EU Sentry project DSN set in `apps/scs-app/.env` as `NEXT_PUBLIC_SENTRY_DSN` and a production-mode local run, OR a temporary `enabled: true` override.

> Phase 1 events only flow when `enabled: true` (production builds with a DSN). To verify locally without deploying, temporarily generate the env with `NODE_ENV=production` and a real DSN. **Do not commit** the generated `environment.ts` (it is git-ignored).

- [ ] **Step 1: Generate a production env with a DSN (temporary, local)**

```bash
cd /Users/bruno/proj/bkaiser/bk2
export NEXT_PUBLIC_SENTRY_DSN="https://<key>@o<org>.ingest.de.sentry.io/<project>"
source ./apps/scs-app/.env && NODE_ENV=production NX_TASK_TARGET_PROJECT=scs-app ts-node ./set-env.js
grep -A6 "sentry:" apps/scs-app/src/environments/environment.ts
```

Expected: `environment: 'production'`, `enabled: true`, the DSN present.

- [ ] **Step 2: Add a hidden dev-only test trigger**

Temporarily add a button to a dev/debug page (or run in the browser console after the app loads):

```typescript
// T1 — throw inside Angular's zone (caught by Sentry.createErrorHandler)
throw new Error('Sentry T1 test error');
// T2 — unhandled promise rejection
Promise.reject(new Error('Sentry T2 unhandled rejection'));
// T4 — sensitive data must be redacted
throw new Error('leak 756.1234.5678.90 CH93 0076 2011 6238 5295 7 john@doe.ch');
```

- [ ] **Step 3: Verify in the Sentry dashboard**

| Check | Expected |
|---|---|
| T1 | Issue appears; stack trace present (readable after Phase 2 source maps) |
| T2 | Captured as an unhandled rejection |
| T3 | Trigger a failing HTTP request, then an error → the failed call shows as an `http` breadcrumb with the URL **query string stripped** |
| T4 | The AHV, IBAN and email in the T4 error are shown as `[AHV]`, `[IBAN]`, `[EMAIL]` |
| T7 | Regenerate env **without** `NODE_ENV=production` (dev) → throw an error → **nothing** reaches Sentry (`enabled:false` + `beforeSend` drop) |

- [ ] **Step 4: Remove the temporary trigger and regenerate a dev env**

Remove the test button/snippet. Regenerate the local dev env so no DSN/production config lingers:

```bash
source ./apps/scs-app/.env && NX_TASK_TARGET_PROJECT=scs-app ts-node ./set-env.js
```

No commit (env files are git-ignored; the temporary trigger must not be committed).

---

## PHASE 2 — Source Maps & Releases (manual Firebase deploy)

> There is no CI. Source-map upload runs locally as part of the deploy ritual (see the `firebase-deploy` skill): build prod → upload maps → deploy. Maps are emitted **hidden** and excluded from the deployed artifact.

### Task 8: Emit hidden production source maps and keep them out of the deploy

**Files:**
- Modify: `apps/scs-app/project.json`
- Modify: `apps/test-app/project.json`
- Modify: `firebase.json`

- [ ] **Step 1: Add hidden source maps to the `production` build config**

In `apps/scs-app/project.json`, inside `targets.build.configurations.production`, add a `sourceMap` key (alongside `budgets`, `optimization`, `outputHashing`):

```json
        "sourceMap": {
          "scripts": true,
          "styles": false,
          "hidden": true,
          "vendor": true
        }
```

`hidden: true` strips the `//# sourceMappingURL=` comment from shipped JS, so browsers never request maps; `@sentry/cli` associates them via injected debug IDs instead.

- [ ] **Step 2: Repeat for `test-app`**

Apply the identical `sourceMap` block to `apps/test-app/project.json` `targets.build.configurations.production`.

- [ ] **Step 3: Exclude maps from the deployed artifact**

In `firebase.json`, add `"**/*.map"` to the `ignore` array of the `scs-app-54aef` and `test-app-54aef` hosting entries:

```json
  "ignore": [
    "firebase.json",
    "**/.*",
    "**/node_modules/**",
    "**/*.map"
  ]
```

- [ ] **Step 4: Verify maps are emitted on a production build**

```bash
cd /Users/bruno/proj/bkaiser/bk2
source ./apps/scs-app/.env && NODE_ENV=production NX_TASK_TARGET_PROJECT=scs-app ts-node ./set-env.js
pnpm nx build scs-app --configuration production
ls dist/apps/scs-app/browser/*.map | head
```

Expected: one or more `*.map` files present in the build output.

- [ ] **Step 5: Commit**

```bash
git add apps/scs-app/project.json apps/test-app/project.json firebase.json
git commit -m "build(sentry): emit hidden prod source maps and exclude them from hosting deploy"
```

---

### Task 9: `@sentry/cli` source-map upload script + npm wiring

**Files:**
- Create: `scripts/sentry-sourcemaps.mjs`
- Modify: `package.json`

> Requires these env vars at deploy time (DSN aside, these are secrets — never commit): `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (from the EU-region account). The release name is derived from `package.json` `version` and the app's `tenantId`, matching the `release` baked into `environment.ts` by `set-env.js`.

- [ ] **Step 1: Create the upload script**

Create `scripts/sentry-sourcemaps.mjs`:

```javascript
#!/usr/bin/env node
// Inject debug IDs, create a Sentry release, upload source maps, and finalize.
// Usage: node scripts/sentry-sourcemaps.mjs <app>   (default: scs-app)
// Requires env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const app = process.argv[2] || 'scs-app';
const tenantId = app.replace(/-app$/, '');
const version = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const release = `${tenantId}@${version}`;
const dir = `./dist/apps/${app}/browser`;

for (const v of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
  if (!process.env[v]) {
    console.error(`ERROR: ${v} is not set. Source maps cannot be uploaded.`);
    process.exit(1);
  }
}
if (!existsSync(dir)) {
  console.error(`ERROR: build output not found at ${dir}. Run a production build first.`);
  process.exit(1);
}

const cli = (args) => execFileSync('npx', ['sentry-cli', ...args], { stdio: 'inherit' });

console.log(`Uploading source maps for release ${release} from ${dir}`);
cli(['sourcemaps', 'inject', dir]);
cli(['releases', 'new', release]);
cli(['sourcemaps', 'upload', '--release', release, dir]);
cli(['releases', 'finalize', release]);
console.log(`Done. Release ${release} finalized.`);
```

- [ ] **Step 2: Add npm scripts**

In `package.json` `scripts`, add:

```json
    "sentry:sourcemaps": "node scripts/sentry-sourcemaps.mjs scs-app",
    "sentry:sourcemaps:test": "node scripts/sentry-sourcemaps.mjs test-app"
```

- [ ] **Step 3: Dry-run the script's guards**

Run (without the secrets, to confirm the guard fires cleanly):

```bash
node scripts/sentry-sourcemaps.mjs scs-app
```

Expected: exits with `ERROR: SENTRY_AUTH_TOKEN is not set.` (proves the script runs and validates inputs).

- [ ] **Step 4: Document the deploy order**

The deploy ritual (run after setting `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` and a production env with a real DSN):

```bash
pnpm nx build scs-app --configuration production   # emits hidden maps
pnpm run sentry:sourcemaps                          # inject + upload + finalize release
# then deploy hosting per the firebase-deploy skill (maps excluded via firebase.json ignore)
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sentry-sourcemaps.mjs package.json
git commit -m "build(sentry): add sentry-cli source-map upload script and npm wiring"
```

- [ ] **Step 6: Verify T5 (release/map coupling) after a real deploy**

After a production deploy with maps uploaded, confirm a captured error shows a stack trace resolved to original `.ts`. To prove the coupling, build once with a deliberately wrong release name (e.g. edit the script's `release` temporarily) → maps fail to resolve → confirms release/map matching is required. Revert the change afterward.

---

## Out of Scope (future phases, per spec)

- **Phase 3 — Native:** install `@sentry/capacitor` (+ `@sentry/cocoa`/`@sentry/android`), switch `main.ts` to the `Sentry.init(capacitorOptions, SentryAngular.init)` form, add dSYM upload for the iOS project (`apps/scs-app/ios`), `npx cap sync`. Validate `Sentry.nativeCrash()` (T6).
- **Phase 4 — Backend:** `@sentry/node` in Cloud Functions, frontend↔backend trace stitching.
- Session Replay stays **off** (spec D2).

## Appendix — Environment / deploy variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | `apps/<app>/.env` (build) | DSN injected into `environment.ts` by `set-env.js` (public, non-secret) |
| `SENTRY_AUTH_TOKEN` | deploy shell (secret) | source-map upload auth |
| `SENTRY_ORG` | deploy shell | org slug (EU account) |
| `SENTRY_PROJECT` | deploy shell | project slug |

# Spec: Sentry Integration (Angular / Ionic / Firebase)

| | |
|---|---|
| **Status** | Reviewed — open decisions resolved |
| **Scope** | Error & crash monitoring across Web/PWA, Capacitor WebView, and native iOS/Android |
| **Stack** | Angular 21 (standalone), Ionic, Capacitor, Firebase |
| **Out of scope** | Domain/business event logging (stays in Firestore + AOC), uptime monitoring, log aggregation |
| **Owner** | — |
| **Version** | 0.2 |

> **Resolved decisions (v0.2):** The web app is a **Capacitor PWA**, so a **single `@sentry/capacitor` entrypoint** serves web and native (D1). Release identity is sourced from **`package.json` `version`** (OQ2). **EU (DE) managed region**, no self-hosting required — no client contract demands stricter residency (D3 / OQ3). Sibling SDK version pairing **confirmed and pinned** (OQ4). Event retention period **reviewed and acceptable** under DSG (OQ5). Session Replay stays **off** (D2); backend monitoring **deferred to Phase 4** (D4); **one project, environment tags** (D5).

---

## 1. Goals & Non-Goals

### Goals
- Capture **unhandled JS errors and promise rejections** in the Angular app (Web/PWA and WebView) with stack traces resolved to original TypeScript.
- Capture **native crashes** (iOS signals/`NSException`, Android ANRs, NDK, watchdog/OOM terminations) once native builds ship.
- Provide **issue grouping, breadcrumbs, release health, and alerting** without building any of it ourselves.
- Be **DSG-compliant**: EU data residency, no unintended PII, explicit scrubbing of Swiss-sensitive data.
- Single configuration model that works identically across dev / staging / prod and across deployment targets.

### Non-Goals
- Replacing the existing Firestore-based domain/audit logging surfaced in the AOC. Sentry is for *technical faults*; business-relevant events (failed Swissdec submissions, archiving outcomes, audit records) remain in Firestore by design.
- Performance/APM as a primary objective. Tracing is enabled at a low sample rate for context only.

---

## 2. Architecture

Because the web app is itself a **Capacitor PWA**, a single SDK (`@sentry/capacitor`) is used for every build. On the web it runs the JavaScript/Angular path; on device it additionally activates the native crash layer. Three runtime layers are covered:

```
┌─────────────────────────────────────────────────────────────┐
│  Single Capacitor PWA codebase, one @sentry/capacitor init    │
├─────────────────────────────────────────────────────────────┤
│  Web / browser:                                               │
│    WebView (Angular) ──► @sentry/angular path (JS, tracing)   │
│    native features ──► no-op off-device                       │
├─────────────────────────────────────────────────────────────┤
│  Native iOS / Android (Capacitor):                            │
│    WebView (Angular) ──► @sentry/angular path (JS layer)      │
│    Native shell      ──► @sentry/capacitor                    │
│                          ├─ @sentry/cocoa   (iOS)            │
│                          └─ @sentry/android (Android)        │
└─────────────────────────────────────────────────────────────┘
```

Key consequence: almost all application logic runs in the **WebView**, so the `@sentry/angular` path catches the bulk of real errors. `@sentry/capacitor` adds the native crash layer that a WebView SDK structurally cannot see.

---

## 3. Packages & Version Pinning

| Package | Role | Notes |
|---|---|---|
| `@sentry/capacitor` | Primary SDK for **all** builds | Bridges to native iOS/Android SDKs; pulls `@sentry/cocoa` + `@sentry/android` transitively |
| `@sentry/angular` | Sibling framework SDK | Provides `init`, `createErrorHandler`, `TraceService`, integrations (replaces deprecated `@sentry/angular-ivy`) |
| `@sentry/cli` | CI | Source-map upload, release management |

**Version pinning is mandatory and confirmed.** `@sentry/capacitor` declares an *exact* peer dependency on the sibling JS SDK; a mismatch breaks the build. Pin exact versions (no `^`):

```jsonc
// package.json — pinned, exact
"@sentry/angular":   "<pinned>",   // exact, matches capacitor peer dep
"@sentry/capacitor": "<pinned>"    // exact
```

Re-verify the required pairing on every future upgrade:

```bash
npm info @sentry/capacitor peerDependencies
```

Platform minimums: Capacitor SDK supports Angular 14+ (we are on 21) and iOS 12+.

---

## 4. Configuration Model

DSN, environment, and sampling come from Angular environment files (never hard-coded, never committed for prod).

```typescript
// environments/environment.ts (prod shown)
export const environment = {
  production: true,
  sentry: {
    // DSN belongs to a project in the EU (DE / Frankfurt) data region:
    //   o<org>.ingest.de.sentry.io/<project>
    dsn: '<INJECTED_AT_BUILD>',
    environment: 'production',          // 'development' | 'staging' | 'production'
    tracesSampleRate: 0.1,              // 10% of transactions
    replaysSessionSampleRate: 0.0,      // Replay off (see §11)
    replaysOnErrorSampleRate: 0.0,      // Replay off (see §11)
    enabled: true,                      // false in local dev (see §6)
  },
};
```

> **DSG / data residency (resolved):** The Sentry project is provisioned in the **EU (DE / Frankfurt) region**, chosen at project creation and immutable afterward. A signed AVV/DPA with Sentry is a prerequisite for processing any user-linked data. Self-hosting was evaluated and **not adopted** — no client contract requires residency stricter than EU-managed.

---

## 5. Shared Init Options

One options object guarantees identical behaviour across web and native. Define it once.

```typescript
// monitoring/sentry-options.ts
import type { CapacitorOptions } from '@sentry/capacitor';
import { environment } from '../environments/environment';
import { beforeSend } from './sentry-scrubbing';

export function buildSentryOptions(
  integrations: CapacitorOptions['integrations'],
): CapacitorOptions {
  return {
    dsn: environment.sentry.dsn,
    environment: environment.sentry.environment,
    enabled: environment.sentry.enabled,

    // Release & build identity (set by CI from package.json, see §10)
    release: import.meta.env?.NG_APP_SENTRY_RELEASE,  // "kmu-app@<package.json version>"
    dist:    import.meta.env?.NG_APP_BUILD_NUMBER,    // CI build number

    integrations,

    // Performance
    tracesSampleRate: environment.sentry.tracesSampleRate,
    tracePropagationTargets: [
      /^https:\/\/[^/]*\.cloudfunctions\.net/,
      /^https:\/\/firestore\.googleapis\.com/,
    ],

    // DSG: do NOT auto-attach IP / headers / cookies
    sendDefaultPii: false,

    // Native watchdog/OOM terminations
    enableWatchdogTerminationTracking: true,

    // Final scrubbing gate (see §11)
    beforeSend,
  };
}
```

---

## 6. SDK Initialization (single entrypoint)

Because the PWA is a Capacitor build, there is **one** `main.ts`. Initialization happens **before** `bootstrapApplication`, with the Angular SDK's `init` forwarded as the second argument.

```typescript
// main.ts
import * as Sentry from '@sentry/capacitor';
import * as SentryAngular from '@sentry/angular';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { buildSentryOptions } from './monitoring/sentry-options';

Sentry.init(
  buildSentryOptions([
    SentryAngular.browserTracingIntegration(),
  ]),
  // Forward the sibling framework init:
  SentryAngular.init,
);

bootstrapApplication(AppComponent, appConfig);
```

On the web target, `@sentry/capacitor` runs the JS/Angular path and native features are inert; on device the native crash layer activates automatically. No build-time `fileReplacements` switching is required.

### Local development
Set `enabled: false` (or a separate `environment: 'development'` with `tracesSampleRate: 0`) so local noise never reaches the prod project and never consumes event quota. `beforeSend` also drops any `development` event as a backstop (§11b).

---

## 7. ErrorHandler & Router Tracing (app.config.ts)

Standalone providers wire Sentry's `ErrorHandler` and the router `TraceService` (both from the sibling `@sentry/angular`).

```typescript
// app/app.config.ts
import { ApplicationConfig, ErrorHandler, inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import * as Sentry from '@sentry/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... existing providers

    {
      provide: ErrorHandler,
      useValue: Sentry.createErrorHandler({ showDialog: false }),
    },
    {
      provide: Sentry.TraceService,
      deps: [Router],
    },
    provideAppInitializer(() => {
      inject(Sentry.TraceService);   // instantiate so router spans are recorded
    }),
  ],
};
```

`createErrorHandler` wraps Angular's global error path, so any uncaught error in a component, service, effect, or template lands in Sentry automatically with a full breadcrumb trail.

---

## 8. HTTP Error Context (Interceptor)

HTTP errors are attached as **breadcrumbs**, not reported as separate issues (which would duplicate and flood the dashboard).

```typescript
// monitoring/http-breadcrumb.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { catchError } from 'rxjs';
import { addBreadcrumb } from '@sentry/angular';

export const httpBreadcrumbInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err) => {
      addBreadcrumb({
        category: 'http',
        level: 'error',
        message: `${req.method} ${stripPii(req.urlWithParams)} → ${err.status}`,
      });
      throw err;
    }),
  );
```

`stripPii` must remove any query-string identifiers before they enter a breadcrumb. Never put personal data in URLs in the first place (consistent with existing platform rules).

---

## 9. User & Tenant Context (Multi-Mandant)

Set **pseudonymous** context on login; clear it on logout. No names, no emails.

```typescript
// on login
Sentry.setUser({ id: pseudonymousUserId });         // Firebase UID or a hash — NOT email
Sentry.setTag('mandant', mandantId);                 // tenant
Sentry.setTag('role', role);                         // e.g. 'admin' | 'hr' | 'accounting'

// on logout
Sentry.setUser(null);
```

Tags enable filtering issues by tenant and by module without exposing identity. Active module (`accounting`, `payroll`, `hr`, …) can be set as an additional tag on navigation for faster triage.

---

## 10. Release & Source-Map Management (CI)

**Source of truth for the release name is `package.json` `version`.** Without source maps, Angular's minified prod output produces unreadable stack traces.

### Web / WebView (debug IDs)

After `ng build` (esbuild application builder), in CI:

```bash
# Release name derived from package.json version
export SENTRY_RELEASE="kmu-app@$(node -p "require('./package.json').version")"

# 1. Inject debug IDs into bundles + maps
npx sentry-cli sourcemaps inject ./dist/app/browser

# 2. Create the release and upload maps
npx sentry-cli releases new "$SENTRY_RELEASE"
npx sentry-cli sourcemaps upload \
  --release "$SENTRY_RELEASE" \
  ./dist/app/browser
npx sentry-cli releases finalize "$SENTRY_RELEASE"
```

The same `package.json` version is injected into the app build as `NG_APP_SENTRY_RELEASE` so client events carry a matching `release`.

> **Important:** Source maps are uploaded to Sentry and **not** shipped to the public web server / app bundle. Confirm the Angular build emits maps for upload while excluding them from the deployed artifact.

CI needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (org/project from the EU-region account).

### Native symbolication

| Platform | Mechanism |
|---|---|
| **Android** | Sentry Android Gradle plugin uploads ProGuard/R8 mappings and native (NDK) symbols on release builds. |
| **iOS** | Upload **dSYM** files via the Sentry build phase / `sentry-cli debug-files upload`. |

The `release` (from `package.json`) and `dist` (CI build number) must match across web and native builds for a given app version so events correlate.

---

## 11. DSG / Privacy Hardening

Crash payloads on an accounting/payroll/HR platform can inadvertently contain highly sensitive data (AHV numbers, IBANs, salary figures, names).

### 11a. Defaults
- `sendDefaultPii: false` (no IP, cookies, or request headers attached automatically).
- Enable Sentry server-side **Data Scrubbing** / **Sensitive Data** filters in project settings as a second line of defence.
- **Event retention:** reviewed against DSG and **accepted** for the configured period; redaction (below) keeps the residual risk within that window acceptable.

### 11b. Client-side `beforeSend` scrubbing

```typescript
// monitoring/sentry-scrubbing.ts
import type { ErrorEvent, EventHint } from '@sentry/angular';

const PATTERNS: Array<[RegExp, string]> = [
  // AHV-Nummer  756.XXXX.XXXX.XX
  [/\b756\.\d{4}\.\d{4}\.\d{2}\b/g, '[AHV]'],
  // IBAN (CH/LI and general)
  [/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g, '[IBAN]'],
  // E-Mail
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]'],
];

function redact(input?: string): string | undefined {
  if (!input) return input;
  return PATTERNS.reduce((s, [re, repl]) => s.replace(re, repl), input);
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Drop development noise entirely
  if (event.environment === 'development') return null;

  if (event.message) event.message = redact(event.message);
  event.exception?.values?.forEach((v) => { v.value = redact(v.value); });
  event.breadcrumbs?.forEach((b) => { b.message = redact(b.message); });

  return event;
}
```

> Regexes are a safety net, not a substitute for not capturing PII in the first place.

### 11c. Session Replay (D2 — off)
Session Replay remains **disabled** (`replaysSessionSampleRate: 0`). For a financial/HR app, replays risk capturing sensitive screen content. Any future enablement requires aggressive masking (`maskAllText: true`, `blockAllMedia: true`) and a fresh DSG review.

---

## 12. Optional Module: Cloud Functions Backend (`@sentry/node`) — Phase 4

Backend logic in Cloud Functions (archiving, aggregation, PDF generation, Swissdec submission) can report to the **same Sentry org** (separate project) via `@sentry/node`, giving end-to-end visibility and letting `tracePropagationTargets` (§5) stitch frontend → function traces. Same DSG rules apply (EU region project, scrubbing). **Deferred to Phase 4 (D4).**

---

## 13. Testing & Verification

| # | Check | Expected |
|---|---|---|
| T1 | Throw a test error in a component | Issue appears, stack trace resolved to original `.ts` |
| T2 | Reject an un-awaited promise | Captured as unhandled rejection |
| T3 | Failing HTTP call then error | Failed call visible as a breadcrumb, URL PII-stripped |
| T4 | Error containing a fake AHV number + IBAN + email | All three redacted in the Sentry event |
| T5 | Build with wrong release name | Maps fail to resolve → confirms release/map coupling works |
| T6 | (Native) `Sentry.nativeCrash()` test | Native crash report appears with symbolication |
| T7 | Dev environment error | **Not** sent (dropped by `beforeSend`) |

Wire the native crash trigger behind a hidden dev-only control.

---

## 14. Rollout Plan

- **Phase 1 — Capacitor PWA, errors only.** Install `@sentry/capacitor` + `@sentry/angular`, single `main.ts`, `ErrorHandler`, scrubbing, EU project, free tier. No tracing, no replay. Validate T1–T5, T7.
- **Phase 2 — CI source maps + releases.** Add `sentry-cli` upload (release from `package.json`), release health, alerting rules (Slack/email). Confirm readable prod stack traces.
- **Phase 3 — Native.** Add native symbolication (Gradle plugin / dSYM), `npx cap sync`. Validate T6 on real devices.
- **Phase 4 — Backend (optional).** `@sentry/node` in Cloud Functions; connect frontend↔backend traces.
- **Continuous — tuning.** Inbound filters, sampling, spending cap / rate limits, quota review to control event volume/cost.

---

## 15. Cost Posture (reference)

Event-based billing; manage volume deliberately. Free Developer tier (5K errors/mo, 1 viewer) is sufficient for Phases 1–2 on low traffic. Move to Team (~50K errors/mo, unlimited viewers) when a second person needs dashboard access or volume grows. Keep `tracesSampleRate` at 0.1, set a **spending cap**, and use inbound filters + `beforeSend` drops to avoid quota burn during error storms. (Verify current pricing at sign-up.) See the Error Monitoring documentation for the full billing breakdown.

---

## 16. Decisions (resolved)

| ID | Decision | Resolution |
|---|---|---|
| **D1** | One vs separate web/native entrypoints | **Single `@sentry/capacitor` entrypoint** (PWA is Capacitor) |
| **D2** | Session Replay on/off | **Off** |
| **D3** | EU managed vs self-hosted | **EU (DE / Frankfurt) managed** |
| **D4** | Backend monitoring scope | **Deferred to Phase 4** |
| **D5** | Project-per-env vs env tags | **One project, environment tags** |

## 17. Open Questions (resolved)

1. PWA build type → **Capacitor PWA.** Single entrypoint; no `fileReplacements` switching.
2. Release/version source → **`package.json` `version`**, injected into both client build and CI source-map upload.
3. Residency stricter than EU-managed → **No** such contract; EU-managed adopted, self-hosting not required.
4. Exact compatible sibling SDK versions → **Confirmed and pinned exact.** Re-verify on upgrades via `npm info … peerDependencies`.
5. DSG retention period → **Reviewed and acceptable.**

---

## Appendix A — Environment / CI variables

| Variable | Where | Purpose |
|---|---|---|
| `NG_APP_SENTRY_DSN` | build | DSN injected into env file |
| `NG_APP_SENTRY_RELEASE` | build | Release identifier `kmu-app@<package.json version>` |
| `NG_APP_BUILD_NUMBER` | build | `dist` value (CI build number) |
| `SENTRY_AUTH_TOKEN` | CI secret | sourcemap/dSYM upload auth |
| `SENTRY_ORG` | CI | org slug (EU account) |
| `SENTRY_PROJECT` | CI | project slug |

## Appendix B — Install

```bash
# Phase 1 — single SDK set for the Capacitor PWA (match versions to peer dependency)
npm install --save-exact @sentry/capacitor @sentry/angular
npm install --save-dev @sentry/cli

# Phase 3 — native symbolication, then sync
npx cap sync
```

# Sentry Setup & Secrets — Configuration Guide

**Date:** 2026-06-17
**Status:** Active reference (Phase 1 + 2 implemented for `scs-app`)
**Related:** [`2026-06-06-spec-sentry-integration.md`](2026-06-06-spec-sentry-integration.md) (the what/why), [`superpowers/plans/2026-06-17-sentry-integration.md`](superpowers/plans/2026-06-17-sentry-integration.md) (the implementation plan)

This is the operator-facing companion to the Sentry spec: **where to find each Sentry value, what it is, and where to feed it.** None of these are Firebase Functions secrets in Phase 1+2 — see the table below.

---

## 1. The four values you need

| Value | Our env var | What it is | Secret? |
|---|---|---|---|
| **DSN** | `NEXT_PUBLIC_SENTRY_DSN` | *Public* ingest key — lets the browser **send** events. Safe to ship in the client bundle. | No (public) |
| **Org slug** | `SENTRY_ORG` | Your organization's short name. | No |
| **Project slug** | `SENTRY_PROJECT` | The project's short name. | No |
| **Auth token** | `SENTRY_AUTH_TOKEN` | *Private* API credential `sentry-cli` uses to **upload source maps** & create releases. | **Yes** — never commit |

> **The auth token is NOT derivable from the DSN.** They are unrelated: the DSN only authorizes *sending* events; the auth token authorizes the *management API*. You create the auth token separately (see §2.4).

---

## 2. Where to find each in the Sentry UI

### 2.1 DSN
Settings → **Projects** → *your project* → **Client Keys (DSN)**.
Format: `https://<key>@o<orgid>.ingest.<region>.sentry.io/<projectid>`

### 2.2 Org slug (`SENTRY_ORG`)
Visible in the URL: `sentry.io/organizations/<org-slug>/`, or Settings → **Organization** → general settings → "slug".

### 2.3 Project slug (`SENTRY_PROJECT`)
Settings → **Projects** → the short name in the project list (or project settings → Name).

### 2.4 Auth token (`SENTRY_AUTH_TOKEN`)
Settings → **Auth Tokens** (Organization Auth Tokens) → **Create New Token**.
Use an **Organization Auth Token** — it carries the right scopes for releases/source-map upload (`project:releases`, `org:read`) automatically. (User Auth Tokens under Settings → Account also work but are tied to your account.)
The token is shown **once** at creation — copy it immediately.

---

## 3. Where each value goes (NOT Firebase secrets)

In Phase 1+2 there is **nothing** to `firebase functions:secrets:set`. The split is:

### 3.1 DSN → app build env
Add to `apps/scs-app/.env` (git-ignored):

```sh
NEXT_PUBLIC_SENTRY_DSN="https://<key>@o<orgid>.ingest.de.sentry.io/<projectid>"
```

`set-env.js` reads it and bakes it (plus the derived `release` and `enabled`/`tracesSampleRate`) into the git-ignored `environment.ts` `sentry` block. The app only sends events when built with `NODE_ENV=production` **and** a DSN is present.

### 3.2 Auth token / org / project → deploy shell env
These are plain environment variables in whatever terminal runs the source-map upload — **not** committed, **not** Firebase secrets:

```sh
export SENTRY_AUTH_TOKEN="sntrys_..."
export SENTRY_ORG="your-org-slug"
export SENTRY_PROJECT="your-project-slug"
```

> Firebase Functions secrets only become relevant in **Phase 4** (the deferred `@sentry/node` backend monitoring). There is nothing to set for Phase 1+2.

---

## 4. Region & CSP

The CSP `connect-src` in [`firebase.json`](../firebase.json) (scs-app site) currently allowlists **`https://*.ingest.de.sentry.io`** (EU / Frankfurt region). **Confirm your DSN host matches** when you provision the project:

- EU region → `*.ingest.de.sentry.io` ✅ already allowed.
- US region → `*.ingest.us.sentry.io` / `*.ingest.sentry.io` → the CSP must be updated, or the browser will silently block every event in production.

The spec mandates the **EU (DE / Frankfurt)** region (immutable after project creation) for DSG compliance.

---

## 5. Production source-map upload (Phase 2)

After exporting the three deploy vars (§3.2):

```sh
pnpm nx build scs-app --configuration production   # emits hidden source maps
pnpm sentry:sourcemaps                              # inject debug IDs + upload + finalize release
firebase deploy --only hosting:scs-app-54aef        # maps excluded via firebase.json **/*.map ignore
```

The release name is `scs@<package.json version>` — identical in the client config and the upload script, so events resolve to readable stack traces.

---

## 6. ⚠️ `set-env.js` is git-ignored

`set-env.js` and `environment.ts` are **git-ignored** (repo rule). The Sentry config plumbing (reading `NEXT_PUBLIC_SENTRY_DSN`, emitting the `sentry` block) lives only in the **local** `set-env.js`. Any other dev/CI/deploy machine that regenerates `environment.ts` must reproduce these `set-env.js` additions, or the generated env will have **no** `sentry` block and Sentry will silently no-op.

The lines to reproduce in `set-env.js`:

```javascript
// near the other NEXT_PUBLIC_* reads:
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const appVersion = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;

// inside generateEnvFileContent(isProduction), after the services block:
  sentry: {
    dsn: '${sentryDsn}',
    environment: '${isProduction ? 'production' : 'development'}',
    release: '${tenantId}@${appVersion}',
    tracesSampleRate: ${isProduction ? 0.1 : 0},
    enabled: ${isProduction && sentryDsn !== ''},
  },
```

---

## 7. Quick local verification (Phase 1)

Events only flow with `enabled: true` (production + DSN). To test locally without deploying:

```sh
export NEXT_PUBLIC_SENTRY_DSN="https://...ingest.de.sentry.io/..."
source ./apps/scs-app/.env && NODE_ENV=production NX_TASK_TARGET_PROJECT=scs-app ts-node ./set-env.js
grep -A6 "sentry:" apps/scs-app/src/environments/environment.ts   # expect enabled: true, environment: 'production'
```

Then throw a test error in the app and confirm it appears in the Sentry dashboard (a sensitive string like `756.1234.5678.90` / an IBAN / an email should arrive **redacted** as `[AHV]` / `[IBAN]` / `[EMAIL]`). Regenerate a dev env afterwards (drop `NODE_ENV=production`).

---

## 8. What you can do with Sentry (typical use cases)

Sentry is for **technical faults** — business/audit events stay in Firestore + AOC (see the spec's non-goals). Day-to-day, you'd use it to:

1. **Triage production errors.** Each unique error is grouped into an **Issue** with: how often it fires, how many users/tenants it affects, when it was first/last seen, and the full stack trace. You stop hearing "the app crashed sometimes" and start seeing "this `TypeError` hit 12 users across 3 mandants since the last deploy."
2. **Read the real stack trace.** With source maps uploaded (§5), a minified prod error resolves to the original `.ts` file and line — click straight to the offending code.
3. **Filter by tenant / role / module.** We set pseudonymous tags `mandant`, `role` (and you can add an active-module tag). Filter Issues by `mandant:acme-gmbh` to see only one customer's errors, or by `role:accounting` to scope to a module. The user is a Firebase UID only — no name/email.
4. **Follow the breadcrumb trail.** Each event carries the lead-up: route navigations, and **failed HTTP calls** (URL query-stripped) recorded by our interceptor — so you can reconstruct what the user did before the crash without a screen recording (Session Replay is intentionally off).
5. **Get alerted.** Configure alert rules to notify you (email, **Slack**, PagerDuty, etc.) when a *new* issue appears, an error **spikes** above a threshold, or a previously-resolved issue **regresses**. This is the main reason to have Sentry: you find out before the customer calls.
6. **Track release health.** Tag events with the `scs@<version>` release; Sentry shows crash-free session/user rates per release, so a bad deploy is obvious immediately and you can compare versions.
7. **Workflow on issues.** Assign, comment, **resolve**, **ignore/mute**, or "resolve in next release" — and get pinged automatically if it comes back. Issues can be linked to GitHub/Jira.
8. **Performance context (low priority here).** Tracing is on at a 10% sample rate for *context only* — you can see slow transactions/spans, but APM is not the goal.
9. **Native crashes** — iOS signal/ANR/watchdog crashes. **Deferred to Phase 3** (needs `@sentry/capacitor`), not active today.

---

## 9. Accessing the data: dashboard vs API

**You do not have to log into the UI to get at the data — Sentry has a full REST Web API.** Both paths are available:

### 9.1 Dashboard (interactive)

The web UI at `sentry.io` is where you'll do most triage, filtering, alert configuration, and release-health review. Best for humans investigating.

### 9.2 REST API (programmatic)

Sentry exposes a REST API (docs: <https://docs.sentry.io/api/>). Authenticate with a **Bearer auth token** (an Org/User Auth Token — the same *kind* you create in §2.4, but for reading data give it scopes like `event:read`, `project:read`, `org:read`; keep upload/release tokens separate). Base URL is `https://sentry.io/api/0/`.

> **EU region:** because our project is in the EU region, region-scoped endpoints may require the EU API host (e.g. `https://<region>.sentry.io/api/0/`) rather than `sentry.io`. Confirm the exact host in your org's API settings / the docs before scripting.

Representative calls (replace `<org>`/`<project>`/token):

```sh
# List unresolved issues for a project
curl -H "Authorization: Bearer $SENTRY_API_TOKEN" \
  "https://sentry.io/api/0/projects/<org>/<project>/issues/?query=is:unresolved"

# Fetch events for one issue
curl -H "Authorization: Bearer $SENTRY_API_TOKEN" \
  "https://sentry.io/api/0/issues/<issue-id>/events/"

# List releases
curl -H "Authorization: Bearer $SENTRY_API_TOKEN" \
  "https://sentry.io/api/0/organizations/<org>/releases/"
```

Good reasons to use the API: scripted/scheduled error reports, exporting issues into another system, CI gates ("fail the build if a new high-severity issue appeared in this release"), or feeding a custom dashboard. The API is rate-limited.

### 9.3 Push instead of pull (webhooks / integrations)

For "tell me when something happens" you usually don't poll the API — you configure **alert rules** and **integrations** (Slack, email, PagerDuty, generic **webhooks**, GitHub/Jira) so Sentry pushes to you. `sentry-cli` (already a dev dependency) is a thin CLI over the same API, used here for release/source-map management.

---

## 10. Privacy & DSG: how we handle personal data

This is an accounting / payroll / HR platform, so crash payloads can inadvertently contain highly sensitive data (AHV numbers, IBANs, salary figures, names, emails). We treat Sentry as a processor of **technical fault data only** and defend privacy in **layers**, so no single failure leaks PII. The first rule still governs: *don't capture PII in the first place* — the scrubbing below is a safety net, not a license to log personal data.

### 10.1 No PII attached by default

`buildSentryOptions` sets **`sendDefaultPii: false`** ([sentry.ts](../libs/shared/util-angular/src/lib/sentry.ts)). Sentry therefore does **not** auto-attach the client IP address, cookies, or request headers to events.

### 10.2 Pseudonymous user/tenant context — never identity

`SentryContextService` ([sentry-context.service.ts](../libs/shared/feature/src/lib/sentry-context.service.ts)) sets only:

- **user id = the Firebase UID** (an opaque pseudonym) — **never** email or name;
- tags `mandant` (tenant id) and `role` (role keys).

On logout the context is cleared (`clearSentryUser()` → `setUser(null)`). This lets you filter/triage by tenant and role without exposing who the person is.

### 10.3 Client-side scrubbing gate (`beforeSend`)

Every event passes through `beforeSend` ([sentry.ts](../libs/shared/util-angular/src/lib/sentry.ts)) **before it leaves the browser**. It runs `redactSensitive()` ([sentry-redact.util.ts](../libs/shared/util-core/src/lib/sentry-redact.util.ts)) over the event **message**, every **exception value**, and every **breadcrumb message**, replacing:

| Pattern | Replaced with |
| --- | --- |
| Swiss AHV number `756.XXXX.XXXX.XX` | `[AHV]` |
| IBAN (CH/LI + general) | `[IBAN]` |
| E-mail address | `[EMAIL]` |

The IBAN regex is deliberately broad — for a DSG backstop, **over-redaction is the safe direction**. `beforeSend` also **drops every `development`-environment event** outright (belt-and-braces with `enabled:false` in dev), so local noise and dev data never reach the project.

### 10.4 No PII in URLs (HTTP breadcrumbs)

Failed HTTP calls are recorded as breadcrumbs by `httpBreadcrumbInterceptor`, which runs `stripPii()` to **drop the URL query string** before it's stored — consistent with the platform rule of never putting personal data in URLs in the first place.

### 10.5 Session Replay is OFF

`replaysSessionSampleRate`/`replaysOnErrorSampleRate` are `0`. We do **not** record screen content — replays on a financial/HR app would capture sensitive fields. Any future enablement requires aggressive masking (`maskAllText`, `blockAllMedia`) and a fresh DSG review.

### 10.6 EU data residency

The Sentry project is provisioned in the **EU (DE / Frankfurt) region** (immutable after creation); the CSP only allows the `*.ingest.de.sentry.io` ingest host (§4). A signed **AVV/DPA** with Sentry is a prerequisite before processing any user-linked data.

### 10.7 Server-side second line of defence

Enable Sentry's project-level **Data Scrubbing / Sensitive Data** filters (Settings → Security & Privacy) as a second layer — Sentry scrubs known sensitive field patterns server-side even if something slips past `beforeSend`. **Event retention** has been reviewed against DSG and accepted for the configured period; the redaction above keeps residual risk within that window acceptable.

### 10.8 Summary of layers

1. `sendDefaultPii: false` — no IP/cookies/headers.
2. Pseudonymous context — Firebase UID only, no name/email.
3. `beforeSend` redaction (AHV/IBAN/email) + drop dev events.
4. URL query stripping on HTTP breadcrumbs.
5. Session Replay off.
6. EU region + AVV/DPA.
7. Sentry server-side data scrubbing + reviewed retention.

> Business-relevant/audit events (failed Swissdec submissions, archiving outcomes, audit records) intentionally stay in **Firestore + AOC**, not Sentry — Sentry never becomes the system of record for personal or business data.

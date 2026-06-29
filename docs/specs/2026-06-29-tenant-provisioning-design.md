# Tenant Provisioning (app-first) — Design

**Date:** 2026-06-29
**Type:** design
**State:** awaiting implementation

## Purpose

Give an admin a fast, repeatable, low-error way to set up a **new tenant app** in the
shared Firebase project. Today this is undocumented tribal knowledge spread across the
Firebase console, hand-edited `.env` files, hand-structured Nx app folders, and a manually
created `app-config/{tenantId}` document. This design replaces that with one guided runbook
plus a real scaffolding engine.

This is **app-first**: website (`TENANT-web`) scaffolding is gathered-but-deferred to a
follow-up spec.

## Audit of the original request

The original ask ("admin should be able to quickly set up a new app and/or website") was the
right backbone but conflated two different worlds and left the largest pieces undefined:

- **Two kinds of work were merged into one linear flow.** *Data setup* (the
  `app-config/{tenantId}` Firestore doc — pure CRUD, `AppConfigService` already exists) is
  unrelated to *build/infra setup* (register a Firebase Web App + AppCheck key, write the
  git-ignored `.env`, scaffold an Nx app, run `set-env.js`). They live in different worlds and
  must be sequenced deliberately, not treated as one form.
- **App and website are not symmetric.** A website (`scs-website`, …) is static HTML with no
  Firebase and no AppConfig, so "ask all the app-config fields" does not apply to it. Resolved
  by deferring website scaffolding.
- **"generate TENANT-app" had no mechanism.** There was no Nx generator; apps were
  hand-structured. This design makes the generator + template a first-class deliverable.
- **AppCheck cannot be fully scripted.** The reCAPTCHA Enterprise key is created in the
  GCP/Firebase console. The runbook marks each step `[auto]` vs `[manual]`.
- **"insert the firebase config and keys" never said where.** It must be the git-ignored
  `.env`, never committed (project hard rule). Made explicit.
- **No idempotency, validation, or success criteria.** Added.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What artifact? | A **Claude Code skill** (`provision-tenant`) — a guided runbook I run *with* the admin. |
| How to scaffold the app? | Derive an **app template from `scs-app`** and build an **Nx generator** that consumes it. (`test-app` was deleted — ignore it.) |
| Website handling? | **Defer.** Gather website info, but scaffold only the app for now. |
| Firebase topology? | **New Web App in the shared project.** All tenants share one Firebase project/Firestore/rules/functions; isolation stays via the `tenants[]` field. A new tenant = new Web App registration + new reCAPTCHA key. |
| Minimal app baseline? | **CMS-minimal.** The template is an *empty but functional* app: bootstrap + auth (login/logout) + CMS page/section + menu + profile, with **all domain feature libs stripped**. Welcome/public/private content are real CMS pages. Domain features (finance, membership, resources, …) are layered in later as per-use-case building blocks (okr/kring). |

## Components

Two deliverables, built in this order:

### A. App template (CMS-minimal, derived from `scs-app`)

`tools/templates/app/` is a **CMS-minimal** app derived from `scs-app`: the full bootstrap and
auth shell, the CMS content mechanism, and nothing domain-specific. It is empty but functional —
it builds, deploys, lets a user log in/out, and renders CMS-driven public/private pages.

**Kept (the irreducible functional shell):**

- Bootstrap from `main.ts` / `app.config.ts`: Firebase init, AppCheck, `provideIonicAngular` +
  `IonicRouteStrategy`, router, zoneless change detection, HTTP, Transloco/i18n, Service Worker,
  Sentry, `AppStore`.
- Shell `bk-root` with the `<ion-router-outlet>` **always mounted** and navigation gated by
  `isAppReadyGuard` (never `@if`-gated — avoids the Ionic StackController crash).
- `@bk2/auth-feature` (login, password reset/confirm, guards, logout via menu →
  `AuthService`), `@bk2/profile-feature`, `@bk2/cms-page-feature`, `@bk2/cms-section-feature`,
  `@bk2/cms-menu-feature`, and `@bk2/subject-person` / `@bk2/subject-group` (auth/profile
  reference `PersonModel`).

**Stripped:** all domain feature libs and their routes — finance, membership/relationships,
resource, geo (trip/location/flighttracker), document, task, forms, activity, calevent, quiz,
chat (deferred), aoc, esign, pdf-template, etc.

**Route inventory (minimal):**

- `'' → public/welcome` (redirect)
- `public/:id` (+ `:contextMenuName`) → `PageDispatcher` — public CMS pages (welcome, one
  sample public page)
- `auth/login`, `auth/pwdreset`, `auth/confirm`
- `private/:id` (+ `:contextMenuName`) → `PageDispatcher` behind `isAuthenticatedGuard` — one
  sample private page
- `**` → `ErrorPage` (404)
- all feature routes wrapped by `canActivateChild: [isAppReadyGuard]`

**Tokens / exclusions:** tenant-specific literals replaced by tokens — `__tenantId__`,
`__appName__`, Capacitor `appId`/`appName`, Sentry release tag, app titles/URLs. The git-ignored
`.env` and generated `environment.ts` are **excluded** (produced by `set-env.js` at build time).

The template is the single source of truth for "what a new minimal app looks like." When the
`scs-app` shell changes meaningfully, the template is updated to match.

### B. Nx app generator

A local Nx generator (`@nx/devkit` Tree API + EJS `.template` files) in a `tools/` plugin:

```sh
nx g @bk2/tools:app --tenantId=acme --appName="Acme"
```

- Emits `apps/acme-app/` from the template: token substitution, a correct `project.json`
  (name, tags `type:app, platform:mobile, platform:web`), Capacitor IDs, and a **placeholder
  `.env`** (key names only, no secret values).
- Supports `--dry-run`.
- **Idempotent:** refuses to overwrite an existing `apps/{tenantId}-app` unless `--force`.

The generator is independently runnable and testable (run it → get an app that builds), which is
why it is built and verified before the skill.

### C. The `provision-tenant` skill (the runbook)

Ordered steps. `[auto]` = the skill performs it (incl. Firebase MCP); `[manual]` = the skill
guides, the admin clicks.

1. **Gather identity** `[auto-prompt]`
   - `tenantId`: validate `^[a-z][a-z0-9-]+$`, and that `app-config/{tenantId}` does **not**
     already exist (unless this is an intentional re-run/resume).
   - app display name; type (`app` | `website` | `both`). For `website`/`both`, record the
     website intent but **defer** its scaffolding.
2. **Register Firebase Web App** `[auto]` — `firebase_create_app` in the shared project, then
   `firebase_get_sdk_config` to retrieve the web config object.
3. **AppCheck / reCAPTCHA** `[manual]` — guide the admin to create a reCAPTCHA Enterprise key
   and register AppCheck for the new Web App in the console; the admin pastes the site key back.
4. **AppConfig document** `[auto]`
   - If `app-config/{tenantId}` already exists, load it as **defaults** (re-run safe);
     otherwise seed defaults from the `AppConfig` model.
   - Prompt for the meaningful fields (operator info, DPO, app titles/URLs, privacy/display
     defaults), each pre-filled with a sensible default.
   - Write to `app-config/{tenantId}` via `AppConfigService` / Firestore MCP.
5. **Scaffold app** `[auto]` — run the Component-B generator (`nx g @bk2/tools:app …`).
6. **Seed starter content** `[auto]` — because the minimal app is CMS-driven, write the
   tenant's starter Firestore content so the routes resolve to something: a `welcome` page, one
   sample public page, one sample private page (`PageModel`s, scoped via `tenants: [tenantId]`),
   plus a minimal menu doc. Re-run safe (skip/update existing).
7. **Write `.env`** `[auto, git-ignored]`
   - Clone an existing tenant's `.env` for the **shared** integration keys (imgix base URL,
     Google Maps key, FCM VAPID key, Sentry DSN — all project-wide in the shared Firebase
     project).
   - Overwrite **only** `FIREBASE_WEBAPP_CONFIG` and `NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY` with
     the new tenant's values.
   - **Never committed.**
8. **Generate environment & verify** `[auto]`
   - `source ./apps/{tenantId}-app/.env && ts-node ./set-env.js`
   - `pnpm nx build {tenantId}-app` to confirm it compiles.
9. **First admin user** `[manual / app]` — a new tenant is unusable until one user can log in.
   **Select-or-create at three independent levels**, since persons and users are shared across
   tenants via their `tenants[]` array (reuse = *append* the tenantId, not duplicate):
   (a) Firebase identity (`uid`) — reuse via `getUidByEmail` or create via `createFirebaseUser`;
   (b) `persons/{personKey}` (`PersonModel`) — select existing (append tenant) or create;
   (c) `users/{uid}` (`UserModel`, doc id = `uid`, `personKey`, `tenants` incl. tenantId,
   `roles: { admin: true }`) — reuse (append tenant + role) or create via `createUserFromPerson`.
   Caveat: `UserModel.roles` are **global** across the user's tenants. *(Added during
   implementation — the original step list stopped at the build; a tenant needs an admin, and the
   operator wanted to reuse existing persons/users.)*

## Security & idempotency

- **Secrets only ever land in the git-ignored `.env`.** The skill never writes a key into a
  tracked file and never commits one (project hard rule).
- **Resume-safe.** Re-running on a partially-provisioned tenant detects an existing Web App,
  AppConfig doc, or `apps/{tenantId}-app` folder and resumes/updates rather than duplicating.
  The generator's `--force` is required to overwrite an existing app folder.
- **Validation.** `tenantId` format and uniqueness checked up front; build verification (step 7)
  is the success criterion.

## Out of scope (this spec)

- Website (`TENANT-web`) scaffolding / a website generator.
- Creating a **new** Firebase project (we always use the shared project).
- Deploying Firestore/Storage rules, functions, or composite indexes for the tenant.
- Per-tenant Sentry projects (the shared DSN is reused).

Each of these is a candidate follow-up spec.

### Planned future direction (not this spec)

The minimal app is the stable Phase-0 base. A later enhancement adds **per-use-case building
blocks**: the skill (or follow-up generators) grafts domain feature libs + their routes + seed
content onto the scaffolded shell for a given use case (e.g. an `okr` block, a `kring` block).
The CMS-minimal base is designed precisely so these blocks are additive — they bring their own
feature libs and CMS pages without the base having to be rebuilt.

## Affected / referenced building blocks

- `libs/shared/models/src/lib/app-config.model.ts` — `AppConfig` model + collection
  `app-config/{tenantId}`.
- `libs/shared/data-access/src/lib/app-config.service.ts` — `create/read/update/list`.
- `libs/shared/config/src/lib/env.ts` — `BkEnvironment` structure.
- `set-env.js` (root) — generates `environment.ts` from `.env`; derives `tenantId` from the
  Nx project name (`{tenantId}-app`).
- `apps/scs-app/` — template source.

## Build order

1. **Component A + B** — app template + Nx generator, verified by scaffolding a throwaway tenant
   and building it.
2. **Component C** — the `provision-tenant` skill, which orchestrates Firebase MCP + AppConfig +
   `.env` + the generator.

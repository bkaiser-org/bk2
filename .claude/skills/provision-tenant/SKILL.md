---
name: provision-tenant
description: Use when setting up a brand-new tenant app — registering a new Firebase Web App, creating its app-config, scaffolding the TENANT-app project, seeding starter CMS content, writing the .env, and creating the first admin user. Covers the full "spin up a new tenant" runbook on the shared Firebase project.
---

# Provision a New Tenant (app-first)

Guided runbook to stand up a **new tenant app** in the **shared** Firebase project
(`bkaiser-org`). A new tenant = a new Firebase **Web App** registration + reCAPTCHA key + an
`app-config/{tenantId}` doc + a scaffolded `apps/{tenantId}-app` (CMS-minimal) + seeded starter
content + a git-ignored `.env` + a first admin user. Tenant isolation stays via the `tenants[]`
field on every model.

**Source design:** [`docs/specs/2026-06-29-tenant-provisioning-design.md`](../../../docs/specs/2026-06-29-tenant-provisioning-design.md).
The app scaffold is produced by the **`@bk2/tools:app` Nx generator** (template at
`tools/src/generators/app/files/`).

**Run this on a dev machine** with the repo, `firebase`/`gcloud` access, and the Firebase MCP
available. The operator must already be an admin (shared project) so they can create users.

`[auto]` = you (the agent) do it · `[manual]` = you guide the operator, they click in a console.

## Steps

### 1. Gather identity `[auto-prompt]`
Ask for and validate:
- **tenantId** — lowercase, `^[a-z][a-z0-9-]+$`. Confirm `app-config/{tenantId}` does **not**
  already exist (Firestore MCP `firestore_get_document app-config/{tenantId}`); if it does, this
  is a re-run — load it as defaults (step 4) instead of failing.
- **appName** — human display name (e.g. `Acme`).
- **type** — `app` | `website` | `both`. Website scaffolding is **deferred**; for `website`/`both`
  record the intent but only scaffold the app.

### 2. Register the Firebase Web App `[auto]`
Use the Firebase MCP in the shared project `bkaiser-org`. **Check for an existing app first** —
Firebase Web App display names are NOT unique, so calling `firebase_create_app` twice silently
creates a duplicate app with a different `appId`. Be resume-safe:
- `firebase_list_apps` (platform WEB) → look for one whose displayName is `{tenantId}-app`.
  - **If found:** reuse its `appId` (do NOT create another). Confirm with the operator it is the
    intended app.
  - **If not found:** `firebase_create_app` — platform `WEB`, displayName `{tenantId}-app` →
    returns the new `appId`.
- `firebase_get_sdk_config` (platform WEB, that `appId`) → returns the web config object
  (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`,
  `measurementId`). Keep it for step 7.

### 3. AppCheck / reCAPTCHA `[manual]`
Guide the operator in the Firebase / Google Cloud console:
- Create a **reCAPTCHA Enterprise** key (or reuse the project key) for the new Web App.
- Register **App Check** for the app with the ReCaptcha Enterprise provider.
- Operator pastes the **site key** back. Keep it for step 7 (`NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY`).

### 4. AppConfig document `[auto]`
Collection **`app-config`**, **doc id = tenantId** (`AppConfigCollection`, `libs/shared/models/.../app-config.model.ts`).
- If `app-config/{tenantId}` exists, load it as defaults (re-run safe); else start from
  `new AppConfig(tenantId)` (the constructor seeds tenant URLs + sensible defaults).
- Prompt for the meaningful fields, each pre-filled with a default: operator info
  (`opName/opEmail/opStreet/opZipCode/opCity/opCountryCode/opWebUrl`), DPO (`dpoName/dpoEmail`),
  app titles/URLs (`appTitle/appSubtitle/appDomain/rootUrl/loginUrl/passwordResetUrl/logoUrl`),
  and display/privacy defaults (`locale` default `de-ch`, `nameDisplay`, `avatarUsage`, the
  `show*` privacy flags). Skip the rest (they have defaults).
- Write it: `appConfigService.create(appConfig, tenantId)` (or Firestore MCP
  `firestore_update_document app-config/{tenantId}`). Ensure the doc's `tenantId` equals the id.

### 5. Scaffold the app `[auto]`
```sh
pnpm nx g @bk2/tools:app --tenantId={tenantId} --appName="{appName}"   # add --dry-run to preview
```
Creates `apps/{tenantId}-app/` (CMS-minimal: bootstrap + auth + cms-page/section/menu + profile;
domain features stripped). Refuses to overwrite an existing app dir unless `--force`.

### 6. Seed starter content `[auto]`
The minimal app is CMS-driven, so the routes need content. Write tenant-scoped docs
(`tenants: [tenantId]` on every doc) to the shared default database:
- **`pages/welcome`** — `PageModel`, **doc id MUST be `welcome`** (PageDispatcher resolves the
  route param against `bkey`, and `bkey` = doc id). `type: 'content'`, `isPrivate: false`,
  `name: 'welcome'`. This satisfies `'' → public/welcome`.
- Optionally **`pages/{publicId}`** (`isPrivate: false`) and **`pages/{privateId}`**
  (`isPrivate: true`) as sample public/private pages.
- Optionally a **`menuItems`** doc (collection `menuItems`, `MenuItemModel`). NOTE: menus are
  looked up by their **`name`** field (not `bkey`) — set `name` to whatever the shell's `Menu`
  requests, and use i18n keys for `label`. Confirm the requested menu name from the running shell
  if unsure; the app is functional without a menu, so this is optional for a first boot.

Page/menu model factories don't exist — instantiate `new PageModel(tenantId)` /
`new MenuItemModel(tenantId)` and set the fields, or write the docs directly via Firestore MCP
(use `firestore_update_document pages/welcome` to control the doc id).

### 7. Write `.env` `[auto, git-ignored — NEVER commit]`
The `config`/build target reads `FIREBASE_WEBAPP_CONFIG` from the environment, so the app needs a
`.env` before it can build.
- Clone an existing tenant's `.env` for the **shared** integration keys (these are project-wide
  in the shared Firebase project): `cp apps/scs-app/.env apps/{tenantId}-app/.env`. Shared keys:
  `NEXT_PUBLIC_IMGIX_BASE_URL`, `NEXT_PUBLIC_SVC_GMAP_KEY`, `FCM_VAPID_KEY`,
  `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_NX_CLOUD_ACCESS_TOKEN`.
- **Overwrite only** `FIREBASE_WEBAPP_CONFIG` (step 2's SDK config as relaxed JSON) and
  `NEXT_PUBLIC_FIREBASE_RECAPTCHA_KEY` (step 3's site key) with the new tenant's values.
- **Never** write a key into a tracked file or commit `.env`. See the **`firebase-deploy`** skill
  for the environment-generation contract.

### 8. Generate environment & verify the build `[auto]`
```sh
set -a; . ./apps/{tenantId}-app/.env; set +a
NX_TASK_TARGET_PROJECT={tenantId}-app ts-node ./set-env.js     # writes environment.ts (git-ignored)
pnpm nx build {tenantId}-app                                   # success = the tenant app is sound
```

### 9. First admin user
A new tenant is unusable until one user can log in as admin. **REQUIRED BACKGROUND:** the
**`tenant-model`** skill (`users/{uid}` is single-tenant, persons are shared, roles model) and the
**`address-model`** skill (favorite email → `person.favEmail` replication).

**Who does what.** You (the agent) act through the **Firebase MCP** (Firestore reads/writes,
`auth_get_users`) and the shell — you **cannot** open the app's modals or call its Angular services.
So you write the Firestore docs directly via MCP (which correctly stamps `tenants: [tenantId]` for
the *new* tenant); the **operator** creates the Firebase **auth account** (no MCP create-user tool,
and the new tenant has no admin to do it in-app yet). Ask the operator for the **email**.

**9.0 Probe the email `[auto, MCP]`** — "does it exist / right tenant?":
- `auth_get_users` (by email) → Firebase account? (`uid` or none).
- If `uid`: `firestore_get_document users/{uid}` → a `UserModel`, and **which tenant** (`tenants[]`)?
  - this tenant → already provisioned (re-run); confirm `roles.admin`, done.
  - a **different** tenant → ⚠️ conflict (a uid is single-tenant) — use a different admin email.
  - none → create below.

**A. Firebase auth account `[manual]`** — only if the probe found no `uid`. Operator creates it
(Firebase console → Authentication → Add user, or AOC → AdminOps from an existing admin session — the
account is project-global). Re-run `auth_get_users` → `uid`. Operator sets the password via reset.

**B. Person + favorite email `[auto, MCP]`** — ask the operator for **firstName / lastName /
gender** (`'male'`|`'female'`), then create automatically (operator adds further attributes later):
- `firestore_add_document persons` → `{ firstName, lastName, gender, tenants:[tenantId],
  isArchived:false }` → note the `personKey`.
- `firestore_add_document addresses` → `{ addressChannel:'email', email:<the email>,
  isFavorite:true, parentKey:personKey, tenants:[tenantId], isArchived:false }`. A DB-triggered CF
  replicates this into `person.favEmail` — **don't set `favEmail` directly** (see **`address-model`**).
- (If the probe linked an existing person, reuse its `personKey`; append the tenant if missing.)

**C. Single-tenant admin user `[auto, MCP]`** — `firestore_update_document users/{uid}` (doc id =
uid): `{ loginEmail:<email>, personKey, firstName, lastName, tenants:[tenantId],
roles:{ admin:true }, isArchived:false }`.

> **Caveat — direct MCP writes bypass the service layer** (`personService`/`addressService`/
> `userService` populate search `index`/derived fields). Records work for login + admin and self-heal
> on the first in-app save.

## Quick reference

| What | Collection | Doc id / lookup | Model |
|---|---|---|---|
| App config | `app-config` | id = `tenantId` | `new AppConfig(tenantId)` |
| Welcome page | `pages` | id = `bkey` = `welcome` | `new PageModel(tenantId)`, `type:'content'`, `isPrivate:false` |
| Menu item | `menuItems` | looked up by `name` field | `new MenuItemModel(tenantId)` |
| Person | `persons` | id = `personKey` (**shared** across tenants) | `{ firstName, lastName, gender, tenants:[tenantId] }` |
| Favorite email | `addresses` | linked by `parentKey` = personKey | `{ addressChannel:'email', email, isFavorite:true, parentKey }` → CF sets `person.favEmail` |
| Admin user | `users` | id = `uid` (**single-tenant**, one per Firebase identity) | `{ loginEmail, personKey, tenants:[tenantId], roles:{admin:true} }` |

Every doc carries `tenants: [tenantId]` (set by each model's constructor). Persons are shared across
tenants (reuse = append the tenantId); users are single-tenant (one `users/{uid}` per identity). See
the **`tenant-model`** skill. No model factory functions exist — instantiate the class with `tenantId`.

## Out of scope (separate work)
- **Website** (`TENANT-web`) scaffolding — deferred.
- A **new Firebase project** per tenant — always use the shared `bkaiser-org`.
- Deploying the tenant to hosting — use the **`release`** / **`firebase-deploy`** skills.
- Per-use-case **building blocks** (okr/kring domain features grafted onto the shell) — planned
  future direction.

## Common mistakes
- Calling `firebase_create_app` without checking first — display names aren't unique, so a re-run
  creates a **duplicate** Web App (new `appId`, new reCAPTCHA, drifted `.env`). Always
  `firebase_list_apps` first and reuse the existing `{tenantId}-app` (step 2).
- Committing `.env` / `environment.ts` / `firebase-config.js` — they are git-ignored; never commit
  secrets (project hard rule).
- Seeding the welcome page with an auto-generated doc id — the route `public/welcome` only
  resolves if the `pages` doc **id is `welcome`** (bkey = doc id).
- Building before the `.env` exists — `set-env.js` needs `FIREBASE_WEBAPP_CONFIG` in the
  environment first.
- Forgetting `roles: { admin: true }` or `bkey = uid` on the first user — the operator then can't
  log in/administer the new tenant.
- Binding an email's existing `users/{uid}` to a second tenant — a user is single-tenant and the doc
  id is the uid, so reusing the uid would clobber the other tenant's user. Use a different admin
  email (see the **`tenant-model`** skill).
- Duplicating a **person** instead of appending the tenantId — persons are shared documents
  (`tenants` is `array-contains`-queried); a second doc fragments the identity.
- Setting `person.favEmail` directly — it's replicated from the favorite `email` address by a CF.
  Create the favorite address instead (see the **`address-model`** skill).

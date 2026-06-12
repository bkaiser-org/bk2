# Security Review Report — bk2

**Date:** 2026-06-11
**Scope:** Full source tree — Firestore/Storage rules, Cloud Functions (`apps/functions/src`), client apps (`apps/scs-app`, `apps/test-app`, `libs/`), secrets hygiene, dependency audit.
**Method:** Four parallel review passes (rules, functions, client/web, secrets+supply-chain), consolidated and deduplicated.
**Status of findings:** Static review, updated 2026-06-11 with production-rules verification: the owner confirmed the deployed Firestore ruleset is identical to the committed `firestore.rules`, and the key rules behaviors were empirically confirmed against the Firestore emulator (see "Production rules verification" below).

---

## Act-now summary (do these first)

1. **Revoke the credentials committed in `e2e/.auth-state.json`** (C-4). A live Firebase refresh token for an admin-claimed user and a Matrix access token are in git. Until revoked, anyone with repo access can mint admin ID tokens indefinitely.
2. **Fix and deploy Firestore rules** (C-1, C-2, M-8). **Confirmed live in production** (owner-confirmed ruleset + emulator probes): the catch-all gives every authenticated user read/write on the whole database, `persons` is world-readable without login, and unauthenticated `sessions` updates succeed.
3. **Lock down the Matrix admin callables** (C-5). Any logged-in user can currently delete/rename any chat room, deactivate any Matrix account, and enumerate all rooms.
4. **Disable or rewrite the OIDC bridge** (C-3). It issues unsigned tokens, never validates `client_secret`, and has reflected XSS + open redirect in the consent page.

---

## Severity overview

| Severity | Count | IDs |
|---|---|---|
| Critical | 5 | C-1 … C-5 |
| High | 7 | H-1, H-3 … H-8 |
| Medium | 11 | M-1 … M-11 |
| Low | 4 | L-1 … L-4 |
| Info | 5 | I-1 … I-5 |

(H-2 was reclassified to M-11 after production verification — see below.)

---

## Production rules verification (2026-06-11)

The owner confirmed the deployed Firestore ruleset is byte-identical to the committed `firestore.rules`. The file was loaded into the local Firestore emulator and probed with unauthenticated REST requests (404 = rules allowed, document absent; 403 = rules denied):

| Probe (unauthenticated) | Result | Meaning |
|---|---|---|
| GET `pages/x` | 404 | Public CMS read works as written |
| GET `persons/x` | 404 | **C-2 confirmed: persons readable with no login** |
| GET `memberships/x` | 403 | Catch-all denies unauthenticated (any *authenticated* user gets full read/write per the rule text — C-1) |
| CREATE `applications` (valid intended shape) | 403 | Undefined `belongsToTenant()` errors → fail-closed; anonymous applications silently broken (M-11) |
| CREATE `sessions` (valid shape) | 200 | Anonymous session create works as intended |
| UPDATE `sessions` with forged `userKey` | 200 | **M-8 confirmed: anyone on the internet can rewrite session docs** |

Two conclusions: (1) undefined function references do **not** block rules deployment — they error at evaluation time and the affected rule denies (fail-closed); the earlier hypothesis that production runs an older, unknown ruleset is withdrawn. (2) The Critical rules findings describe live production behavior, not theoretical risk.

---

## Remediation status (running log)

Updated as fixes land. "Pending deploy" = code committed to `main` but not yet pushed to production infrastructure.

| ID | Title | Status | Evidence / commit |
|---|---|---|---|
| **C-4** | Live admin credentials in `e2e/.auth-state.json` | ✅ **Resolved** | Matrix token logged out; Firebase user `bruno@test.ch` deleted (refresh token now `400 USER_NOT_FOUND`); file untracked + gitignored — commit `4acf8344` |
| **C-1** | Firestore catch-all → full cross-tenant access + self-escalation | ✅ **DEPLOYED (2026-06-12)** | Rules rewritten (default-deny + per-collection + `get()`-based authz); 27/27 emulator tests — commit `00eaa53f`, deployed `firebase deploy --only firestore:rules` |
| **C-2** | `persons` world-readable without auth | ✅ **DEPLOYED (2026-06-12)** | `persons` now auth + same-tenant; anon get/list → 403 — commit `00eaa53f` |
| **M-8** | `sessions` updatable unauthenticated (forge `userKey`) | ✅ **DEPLOYED (2026-06-12)** | Update rule blocks `userKey` forging; heartbeat preserved — commit `00eaa53f` |
| **M-11** | `applications` rules call undefined helpers (broken flow, no CI) | ✅ **DEPLOYED (2026-06-12)** | Real `get()` helpers; anonymous application create works; rules test harness added (CI wiring still TODO) — commit `00eaa53f` |
| **C-5** | Matrix admin callables lack authorization | ✅ **DEPLOYED (2026-06-12)** | Role/membership checks from user doc on all admin/group callables — commit `9c1bcc75` |
| **C-3** | OIDC bridge insecure (unsigned tokens, no `client_secret`, XSS/redirect) | ✅ **DEPLOYED (2026-06-12)** | Bridge functions removed — commit `858e02d0`. ⚠ verify the 6 `oidc*` functions are deleted in the project; client cleanup (route/component) ships with the app build |
| **H-1** | Storage rules catch-all | ✅ **DEPLOYED (2026-06-12)** | Tenant-scoped per-prefix rules + size cap + default-deny; 21 emulator tests — commit `f3020843` |
| **H-2** | → reclassified to **M-11** | ↪ Moved | Production verification showed the undefined rule helpers fail-closed (not a deploy blocker) — see M-11 |
| **H-3** | Stored XSS via CMS iframe/video URLs | ✅ **Fixed, pending app build** | `getSafeEmbedUrl` host/scheme allowlist before trusting editor URLs; 7 tests — commit `e5bba4bc` |
| **H-4** | Custom auth token logged to Cloud Logging | ✅ **DEPLOYED (2026-06-12)** | Logs only the target uid now — commit `7850f0d6` (purge pre-deploy tokens from existing logs) |
| **H-5** | esign callables cross-tenant by guessing `esignId` | ✅ **Fixed, pending deploy** | owner/tenant authz on the 3 by-id callables; `send-document` tenant fix; `scan-predefined` path scoping — commit `bba877c8` |
| **H-6** | `getMatrixCredentials` no App Check, 30-day tokens | ✅ **Fixed, pending deploy** | `enforceAppCheck` on all matrix callables; token 30d→7d — commit `5ffa1682` |
| **H-7** | 4 critical dependency advisories (protobufjs RCE, …) | ✅ **Done** | pnpm overrides → 0 critical (protobufjs 7.6.4, fast-xml-parser 4.5.6, basic-ftp 5.3.1, vitest 3.2.6) — commit `2040c91c` |
| **H-8** | `xlsx` 0.18.5 unfixable via npm | ✅ **Done** | `xlsx` removed; export replaced with in-house CSV writer (semicolon/BOM/RFC-4180), 13 tests — commit `4b22d04b` |
| **M-2** | Matrix creds persist in localStorage after logout | ✅ **Fixed, pending deploy** | `logout()` clears matrix_* keys; `clearStoredCredentials()` completed — commit `1d683621` |
| **M-1** | RAG markdown rendered with sanitizer bypass | ✅ **Fixed, pending app build** | dropped `bypassSecurityTrustHtml`; Angular sanitizes the `[innerHTML]` — commit `e5df6dc3` |
| **M-6** | Admin functions authorize via never-set claims | ✅ **Fixed, pending deploy** | `checkAdminRole` reads `users/{uid}.roles.admin` (legacy claim still accepted) — commit `d2c6ea9d` |
| **M-10** | `firebase-functions: "latest"`; CLI in prod deps | ✅ **Done** | pinned `^7.0.5`; firebase-tools → devDeps — commit `21378fb8` |
| **M-3** | Unauthenticated password-reset enumeration/abuse | ✅ **Fixed, pending deploy** | generic success on unknown account (no enumeration); drop caller templateVariables — commit `d52681fb` |
| **M-9** | `set-env.js` tracked despite "never commit" rule | ✅ **Done** | `git rm --cached` + gitignored; history-clean (env-var plumbing only) — commit `4b730403` |
| **M-4** | PDF raw-HTML sanitizer is regex-only | ✅ **Fixed, pending deploy** | sanitize-html allowlist + Puppeteer network-block in raw mode — commit `63627ed1` |
| **M-5, M-7** | (see sections below) | ⬜ Open | — |
| **L-1…L-4, I-1…I-5** | (see sections below) | ⬜ Open | — |

**Firestore rules (C-1/C-2/M-8/M-11): ✅ DEPLOYED 2026-06-12.** Post-deploy verification to run on the live app:
1. ~~`./firestore-rules-tests/run.sh`~~ → done (`27 passed`). ~~`firebase deploy --only firestore:rules`~~ → done.
2. Smoke-test the live app: load lists (persons, members, calendar), create/edit a record, open chat, submit an anonymous membership application.
3. Watch production client logs for `permission-denied` — the likeliest culprit is a collection classified read-only (`write: if false`) that actually has a client write path; flip it to `isPrivileged() && belongsToTenant(request.resource.data)`, re-test, and redeploy.

**Deployed so far:** Firestore rules (C-1, C-2, M-8, M-11), Cloud Functions (C-3, C-5, H-4), and Storage rules (H-1). H-7 dependency overrides are effective in the repo (no deploy needed). **Still pending deploy:** a Cloud Functions redeploy for H-5 (esign authz) and the client app build (M-2 logout cleanup, C-3 route/component removal).

---

## Critical

### C-1 — Firestore catch-all grants every authenticated user full DB read/write — *DEPLOYED (2026-06-12)*
**Fix applied:** `firestore.rules` rewritten — catch-all removed, replaced with a default-deny and explicit per-collection rules. Authorization derives from the caller's `users/{uid}` doc via `get()` (roles map + tenants array), since custom claims are never minted (M-6). Tenant isolation now enforced server-side; users cannot edit their own `roles`/`tenants`/`personKey`; `users/{uid}/fcmTokens` is owner-only. Validated against the Firestore emulator with 27 authenticated multi-tenant probes (anon / tenant-A user / tenant-B admin / ownership / list-queries) — all pass; the app's `getSystemQuery` (`array-contains tenantId`) list shape is permitted while unfiltered and cross-tenant queries are denied. **Deployed 2026-06-12** via `firebase deploy --only firestore:rules`.
**Original location:** `firestore.rules:124-126`
**Confirmed live in production** (owner-confirmed ruleset, emulator-verified behavior). `match /{document=**} { allow read, write: if request.auth != null; }` at the root. Firestore rules are OR-ed — if any rule allows, access is granted — so this single block voids every restriction above it. Any logged-in user from any tenant can: write their own `users/{uid}.roles` / `tenants` / `personKey` (instant self-promotion to admin), read/write all tenants' `persons`, `addresses`, `memberships`, `invoices`, etc., and write to collections with explicit `allow write: if false` rules (`_rateLimits`, `esignAudit`, `stats_*`, `docGenerations`) — the deny rules are dead code while the catch-all exists. Tenant isolation is currently a client-side query convention only.
**Fix:** Delete the catch-all; write explicit per-collection rules with tenant-membership and ownership checks; deny by default. See "Rules rewrite plan" below.

### C-2 — `persons` collection world-readable without authentication — *DEPLOYED (2026-06-12)*
**Fix applied:** `persons` is now `read: if tenantRead()` (authenticated + same-tenant), no longer `read: if true`. Emulator-verified: anonymous get and anonymous list of `persons` both return 403; same-tenant authenticated reads succeed; cross-tenant reads denied. **Deployed 2026-06-12.**
**Original location:** `firestore.rules:38-41`
`allow get, list: if true` exposes the entire persons collection — across all tenants — to anyone on the internet, no login required. Person records are the PII core of the app. This is a reportable data leak (GDPR-relevant), not CMS content. **Confirmed live in production**; emulator probe verified the unauthenticated read is allowed by this ruleset.
**Fix:** Require `request.auth != null` plus tenant membership; gate `list` on tenant filter.

### C-3 — OIDC bridge is fundamentally insecure (multiple compounding flaws) — *DEPLOYED (2026-06-12)*
**Location:** `apps/functions/src/oidc-bridge/index.ts` (multiple)
- `createIdToken` (~L527-551) returns an **unsigned** base64 JSON blob (the code itself comments "NOT SECURE"); anyone can forge an id_token for any user.
- The token endpoint (~L416-445) destructures `client_secret` but **never validates it** (acknowledged TODO in `libs/chat/feature/src/lib/OIDC_BRIDGE_SETUP.md`); an intercepted/guessed auth code can be exchanged by anyone.
- The authorize page interpolates `client_id`/`redirect_uri`/`state` **raw into inline HTML/JS** (~L104, 185-191) → reflected XSS in the bridge origin, which holds the Firebase session.
- `redirect_uri` is not checked against an allowlist and is later fed to `window.location.href` carrying the fresh auth code (~L334-340) → textbook OIDC open redirect / code exfiltration.
- Error handler writes `error.message` via `innerHTML` (~L343).
- Auth codes live in a per-instance in-memory `Map` (L27) — no PKCE, breaks across instances.
**Impact:** If Matrix (or anything else) trusts this IdP: full account takeover of Matrix SSO for any user. The functions were also directly reachable at public `cloudfunctions.net` URLs, so the reflected XSS / unsigned-token / open-redirect issues were exploitable regardless of homeserver configuration.

**Fix applied (2026-06-12) — deleted the bridge.** Investigation confirmed it was the abandoned "Approach 2": the app authenticates Matrix via token exchange (`getMatrixCredentials`), nothing initiates an OIDC login, and the only client remnant (`MatrixOidcCallback`) wrote `matrix_login_token` / `matrix_needs_token_exchange` that **nothing read** (so this also closes **M-2**). Removed: `apps/functions/src/oidc-bridge/` + its 6 exports in `main.ts`; the `MatrixOidcCallback` component + its barrel export; the `/auth/matrix-callback` route; `OIDC_BRIDGE_SETUP.md`. `auth-feature` builds clean; functions `main.ts` type-checks with no oidc refs. Commit `858e02d0`.

**Deployed 2026-06-12** (`firebase deploy --only functions`). Remaining verification:
1. ⚠ **Confirm the 6 functions are actually gone** — `firebase functions:list` should show no `oidcDiscovery`, `oidcAuthorize`, `oidcCallback`, `oidcExchange`, `oidcToken`, `oidcUserInfo`. If the deploy's "delete?" prompt was declined, delete them explicitly: `firebase functions:delete oidcDiscovery oidcAuthorize oidcCallback oidcExchange oidcToken oidcUserInfo --region europe-west6`.
2. Remove any stale OIDC provider config from the Matrix homeserver (`homeserver.yaml` at etke.host), if present.
3. Client cleanup (the `/auth/matrix-callback` route + `MatrixOidcCallback` component) ships with the next app build — cosmetic; the security-critical functions are already removed.

### C-4 — Live credentials committed to git: `e2e/.auth-state.json` — *RESOLVED (2026-06-11)*
**Location:** `e2e/.auth-state.json` (added in commit `b15fe1be`, 2026-04-27; single commit, never modified)
Contained real session material for the production project `bkaiser-org`, all belonging to the single Playwright test user `owner_test` / bruno@test.ch: a Firebase **refresh token** (refresh tokens do not expire; combined with the public web API key they mint fresh ID tokens indefinitely), an ID token whose payload carries the custom claim **`"admin": true`**, and a long-lived **Matrix access token** (`syt_…`) for `@deqshtq6ig5xn2ydtkpt:bkchat.etke.host`.
**Exposure confirmed:** the GitHub repo `bkaiser-org/bk2` is **public** (verified via API). The admin refresh token was publicly reachable for ~45 days (2026-04-27 → 2026-06-11) and was verified still live during this review (it minted a fresh ID token). Must be treated as compromised.

**Remediation status:**
- ✅ **Matrix access token invalidated** — `POST /_matrix/client/v3/logout` returned 200; the token is dead.
- ✅ **Firebase user deleted** — `bruno@test.ch` / `owner_test` deleted in Firebase Console. **Verified:** the leaked refresh token now returns `400 USER_NOT_FOUND` from `securetoken.googleapis.com` — it can no longer mint ID tokens. Deletion was chosen over password rotation because the account is a disposable test user and the App-Check-gated REST endpoints blocked self-service rotation anyway.
- ✅ **Git hygiene** — `git rm --cached e2e/.auth-state.json` (working copy also removed); added `e2e/.auth-state.json`, `e2e/.env`, `**/.auth-state.json` to `.gitignore`; stale rotation-attempt `e2e/.env` deleted; temp verification creds wiped.
- ◻️ **History rewrite** — optional / not done. The credential is now dead, so a BFG/`git filter-repo` rewrite is cosmetic; do it only if you want the secret blob gone from existing public clones. The commit is `b15fe1be`.
- ◻️ **Follow-up** — regenerate e2e auth state from a *non-admin* dedicated test user, write it only to the now-gitignored path, and never grant that account the `admin` claim. (Ties to M-6: the `admin` claim was set out-of-band — no `setCustomUserClaims` in the repo.)

### C-5 — Matrix admin callables lack authorization (any user, any room, any account) — *DEPLOYED (2026-06-12)*
**Location:** `apps/functions/src/matrix-simple/index.ts`
Previously every callable checked only `request.auth?.uid` (is logged in), with no role/membership check, while acting with the privileged `MATRIX_ADMIN_TOKEN`. Any authenticated user could purge or rename any chat room, deactivate any Matrix account, kick any member, and enumerate all rooms/members installation-wide.

**Fix applied:** added user-doc-based authorization (matching the C-1 rules model — claims are never minted, so `roles` is read from `users/{uid}`). Two helpers were added (`requireRole`, `requireProvisionedUser`) and applied per function:

| Function | New requirement | Rationale |
|---|---|---|
| `deleteMatrixRoom`, `deactivateMatrixUser`, `renameMatrixRoom`, `addMatrixRoomAlias`, `listMatrixRooms`, `getRoomDetails`, `getAllMembersFromRoom`, `getMemberDetails` | role `admin` | All invoked from the AOC (Admin Operations Center) store, whose route is `isAdminGuard` |
| `invitePersonToGroupRoom`, `kickPersonFromGroupRoom` | role `admin` \| `memberAdmin` \| `groupAdmin` | Invoked from `membership.store` on membership create/end (membership-admin context) |
| `provisionMatrixUser` | provisioned user (has `users/{uid}` doc) | Part of the normal direct-chat flow |
| `getMatrixCredentials`, `requestGroupRoomAccess`, `getRoomByName`, `syncFirebaseProfileToMatrix`, `sendCallNotification` | unchanged (self-service; `requestGroupRoomAccess` already enforces group membership/visibility) | Act on the caller's own behalf |

**Verification:** `tsc --noEmit` reports `matrix-simple/index.ts` clean; `pnpm nx build functions --configuration production` succeeds. (The functions build initially failed on unrelated pre-existing top-level imports of `handlebars`/`puppeteer`/`html-to-docx`, which also caused a gen2 cold-start OOM on the 128 MiB functions — fixed separately by lazy-loading those deps and marking them esbuild-`external`, commit `dfc49fe4`.) **Deployed 2026-06-12** via `firebase deploy --only functions`.

**Deferred (tracked under H-6):** App Check enforcement was NOT added here — adding `enforceAppCheck`/`consumeAppCheckToken` across these callables (and `getMatrixCredentials`) is a separate, independently-verifiable change with its own breakage risk, kept out of this authorization fix.
**Also out of scope (new follow-up):** `matrixPushGateway` (an `onRequest` HTTP endpoint, not a callable) should be reviewed separately to confirm it verifies a shared secret from the Matrix homeserver.

---

## High

### H-1 — Storage rules: single catch-all, any authenticated user can read/overwrite/delete every object — *DEPLOYED (2026-06-12)*
**Location:** `storage.rules`
`match /{allPaths=**} { allow read, write: if request.auth != null; }` was the only rule — no tenant scoping, no size constraints. Any authenticated user could download all stored documents (signed contracts, invoices, member photos), replace them, or delete the bucket contents.
**Fix applied:** rewrote `storage.rules` with default-deny + explicit per-prefix, tenant-scoped rules. Authorization derives from the caller's `users/{uid}` doc via `firestore.get()` (same model as `firestore.rules`):
- `tenant/{tenantId}/**`, `tenants/{tenantId}/**` (esign), and the bare `{tenantId}/{modelType}/{key}/documents/**` path → read/write/delete restricted to members of that tenant; writes size-capped at 25 MB.
- `forms/{formKey}/**` → authenticated create (size-capped), privileged update/delete.
- `logo/**` → public read (non-sensitive brand assets, also served via imgix), privileged write.
- `generated-docs[-ephemeral]/{tenantId}/**` → tenant read, `write:false` (Cloud Functions write via Admin SDK, bypassing rules; served by signed URL).

Validated with 21 emulator probes (`firestore-rules-tests/storage.test.py`): tenant isolation across all three prefixes, public `logo`, function-owned paths, default-deny — all pass. Note: imgix serves display images via GCS/IAM, which bypasses Storage rules, so image rendering is unaffected — only the app's direct `getDownloadURL`/`listAll` calls are governed. Commit `f3020843`. **Deployed 2026-06-12** via `firebase deploy --only storage`.

**Deferred to Phase 2:** a content-type allowlist (the report's original suggestion). It risks blocking legitimate uploads whose browser-inferred MIME type is empty, and cannot be exercised in the Storage emulator (which doesn't populate `request.resource.contentType`). The app already restricts document MIME types client-side, and Storage serves cross-origin, so the residual risk is low. M-9 (client-side-only MIME restriction) therefore remains open — re-introduce a per-prefix allowlist once the exact MIME set is confirmed against real SDK uploads in staging.

### H-3 — Stored XSS via CMS iframe/video sections (sanitizer bypass on editor-supplied URLs) — *FIXED, pending app build (2026-06-12)*
**Location:** `libs/cms/section/feature/src/lib/iframe-section.ts`, `libs/cms/section/feature/src/lib/video-section.ts`
Both called `bypassSecurityTrustResourceUrl()` on a URL taken verbatim from the section's DB `properties.url` (iframe) / `baseUrl + url` (video), rendered to every visitor — an editor (or anyone who can write sections) could set a `javascript:` / `data:text/html` URL → stored XSS against all page viewers.
**Fix applied:** new `getSafeEmbedUrl()` in `@bk2/shared-util-core` returns the URL only when it is an `https:` URL on an allowlisted host (youtube / youtube-nocookie / vimeo / openstreetmap, matching the CSP `frame-src`), else `null`. Both components validate before trusting; an invalid URL renders an empty iframe. Unit-tested (7 cases incl. `javascript:`/`data:`/`http:`/look-alike-host rejection). Since the allowlist already matches what the CSP permits, no legitimate embed is lost. Commit `e5bba4bc`. Ships with the next app build. (Related M-1 — RAG markdown bypass — remains open.)

### H-4 — Custom auth token written to Cloud Logging — *DEPLOYED (2026-06-12)*
**Location:** `apps/functions/src/auth/index.ts:39`
`createCustomToken` logged the full custom token. Custom tokens exchange for a full session of the impersonated user; anyone with log read access (broad GCP IAM, log sinks) gets impersonation capability.
**Fix applied:** the log line now records only the target uid, not the token. Commit `7850f0d6`. **Deployed 2026-06-12.** Note: tokens minted before this deploy may still be present in existing Cloud Logging history — consider purging those log entries.

### H-5 — esign callables: cross-tenant access by guessing `esignId` — *FIXED, pending deploy (2026-06-12)*
**Location:** `apps/functions/src/esign/esign-delete.ts`, `esign-get-document-details.ts`, `esign-resend-invitation.ts`
Authenticated-only but never compared the record's `tenantId`/`ownerUserId` to the caller — any authenticated user could read signing details, resend invitations, or destroy another tenant's signature workflow (incl. stored signed PDFs) by guessing the document id.
**Fix applied:** added `assertEsignAccess(uid, record)` in `esign/shared.ts` (authorizes the record `ownerUserId` or a member of the record's `tenant`) and applied it after the record load in all three by-id callables. Also: `esign-send-document` now derives `tenantId` from the caller's user doc instead of the never-minted `token.tenantId` claim (records previously stored an empty tenant); `esign-scan-predefined`'s client-supplied `storagePath` (downloaded via Admin SDK, bypassing Storage rules) is now restricted to the caller's tenant prefix. Owner-based access keeps legacy empty-tenant records reachable by their owner. `esignArchiveSigned` is an `onDocumentUpdated` trigger (not user-callable) — no change. Functions build verified. Commit `bba877c8`. **Not yet deployed** (`firebase deploy --only functions`).

### H-6 — `getMatrixCredentials`: no App Check, 30-day tokens — *FIXED, pending deploy (2026-06-12)*
**Location:** `apps/functions/src/matrix-simple/index.ts`
The uid→Matrix mapping is sound (derived from the verified token), but without `enforceAppCheck` a stolen/replayed Firebase ID token from outside the app yielded a 30-day chat credential.
**Fix applied:** added `enforceAppCheck: true` to all matrix-simple callables (15 secrets-based + `sendCallNotification`); the app already attaches App Check tokens, and other callables enforce it in prod. `matrixPushGateway` (an `onRequest` endpoint called by the Matrix homeserver) is intentionally left unenforced. Shortened the minted Matrix access-token validity from 30 days to 7 days — the client re-fetches credentials on each init, so the leak window shrinks with no UX cost. Functions build verified. Commit `5ffa1682`. **Not yet deployed** (`firebase deploy --only functions`).

### H-7 — Dependency audit: 4 critical advisories on production paths — *FIXED (2026-06-12)*
**Location:** dependency tree (was 4 critical / 79 high / 41 moderate / 6 low)
- **protobufjs** < 7.5.5 — arbitrary code execution (GHSA-xq3m-2v4x-88gg), 39 paths via `firebase`, `firebase-admin`, `@google/genai`
- **fast-xml-parser** < 4.5.4 — entity bypass (GHSA-m7jm-9gc2-mpf2), via `firebase-admin` → `@google-cloud/storage`
- **basic-ftp** < 5.2.0 — path traversal (GHSA-5rq4-664w-9x2c), via `firebase-tools`
- **vitest** < 3.2.6 — file read/exec via UI server (GHSA-5xrq-8626-4rwp), dev-tooling exposure only
**Fix applied:** added `pnpm.overrides` forcing protobufjs `^7.5.5`, fast-xml-parser `^4.5.4`, basic-ftp `^5.2.0`, and vitest/@vitest/ui/@vitest/coverage-v8 `^3.2.6`. `pnpm install` resolved protobufjs 7.6.4, fast-xml-parser 4.5.6, basic-ftp 5.3.1, vitest 3.2.6; `pnpm audit --prod` now reports **0 critical** (was 4). Commit `2040c91c`. (Effective immediately — no deploy needed; ships with the next functions/app build.) Remaining high/moderate advisories — node-forge, axios, node-tar, jws, `@modelcontextprotocol/sdk`, and **H-8** (xlsx) — are tracked separately.

### H-8 — `xlsx` 0.18.5: two High advisories, unfixable via npm — *FIXED (2026-06-12)*
**Location:** root `package.json` (was `"xlsx": "^0.18.5"`, prod dependency)
Prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS. SheetJS no longer publishes patched builds to npm — no semver update could ever fix this.
**Fix applied:** rather than chase a patched SheetJS build, the dependency was **removed** entirely. It was used only for export (no xlsx reading anywhere) — a single `exportXlsx(string[][], fileName, sheetName)`. Replaced with an in-house `exportCsv` in `download.util.ts`: semicolon-delimited (opens directly in Excel de-CH), UTF-8 BOM (correct umlauts), RFC-4180 quoting, CRLF, downloaded via `Blob` + `saveAs` (works on mobile, unlike `XLSX.writeFile`). Pure helpers `rowsToCsv()`/`toCsvFileName()` are unit-tested (13 green tests); all ~10 callers updated. `pnpm audit --prod` no longer reports the SheetJS advisories. CSV imports cleanly into Excel, Numbers, and Google Sheets. Commit `4b22d04b`. (Ships with the next app build.)

---

## Medium

### M-1 — RAG answers rendered with sanitizer bypass — *FIXED, pending app build (2026-06-12)*
**Location:** `libs/cms/section/feature/src/lib/rag-section.ts` (rendered via `[innerHTML]`)
`bypassSecurityTrustHtml(marked.parse(markdown))` disabled Angular's sanitizer — prompt/corpus injection in a RAG answer → XSS in the answer bubble.
**Fix applied:** dropped the bypass — `toHtml()` returns the parsed-markdown string and the template binds it via `[innerHTML]`, so Angular's `DomSanitizer` strips scripts / event handlers / `javascript:` URLs while keeping markdown's safe formatting. No new dependency; removed the now-unused `DomSanitizer`/`SafeHtml`. Commit `e5df6dc3`. Ships with the next app build.

### M-2 — Matrix credentials persist in localStorage after logout — *FIXED, pending deploy (2026-06-12)*
**Location:** `libs/auth/data-access/src/lib/auth.service.ts`, `libs/chat/data-access/src/lib/matrix-chat.service.ts`
`logout()` previously called only Firebase `signOut`, leaving the Matrix token in localStorage — next user on a shared device could resume the chat session; any XSS could exfiltrate a live token.
**Fix applied:** `AuthService.logout()` now clears the `matrix_*` keys (access token, user/device/homeserver, avatar cache, and the obsolete `matrix_login_token`) after a successful `signOut`. Done inline rather than via `MatrixChatService` to avoid an `auth-data-access → chat-data-access` dependency; `MatrixChatService.clearStoredCredentials()` was extended to the same key set for its own callers. The `matrix_login_token` writer was already removed by C-3. Commit `1d683621`; `auth-data-access` and `chat-data-access` build clean. **Pending deploy** (ship in the next app build).

### M-3 — Unauthenticated password-reset email path is an abuse primitive — *FIXED, pending deploy (2026-06-12)*
**Location:** `apps/functions/src/auth/index.ts` (`sendEmail`, `scs_password_reset` branch)
With `template === 'scs_password_reset'` auth is skipped. Re-assessed against the code: `generatePasswordResetLink` already throws `auth/user-not-found` for unregistered addresses, so a link is only ever generated for a real account (no "email any address"), and `from`/`subject`/`html` are derived from `getAppEmailConfig(appId)` (no phishing-content injection). The genuine residual was **account enumeration** — the link call sat outside `try`, so registered → success vs unregistered → error let a caller probe which addresses are accounts.
**Fix applied:** wrapped `generatePasswordResetLink` in try/catch and return the same generic `{ success: true }` (without sending) when no account exists — removing the oracle; also stopped echoing caller-supplied `templateVariables` into the email (only controlled `url`/`email`/`app_name` are passed). Commit `d52681fb`. **Not yet deployed** (`firebase deploy --only functions`). **Follow-up (optional):** a per-recipient rate limit to bound mailbombing of a known account (lower severity — bounded to registered users).

### M-4 — PDF raw-HTML "sanitizer" is a regex strip of `<script>` only — *FIXED, pending deploy (2026-06-12)*
**Location:** `apps/functions/src/pdf/sanitize.ts`, `apps/functions/src/pdf/generate-document.ts`
Puppeteer `setContent` still executed `<img onerror>`, `<iframe>`, `<link>`, `<style>` `url()` etc. and fired outbound requests → SSRF/exfiltration from the function's network (admin/contentAdmin-gated, which bounded exposure).
**Fix applied (both halves of the recommendation):** (1) replaced the regex with `sanitize-html` using a document-oriented allowlist — keeps rich formatting + inline styles, drops `script`/`iframe`/`object`/`embed`/`form`/`base`/`link`/`meta` and event handlers, limits schemes to `https`/`data`/`mailto`; imported dynamically and esbuild-`external` so cold start stays lean. (2) In raw-HTML mode, Puppeteer request interception aborts every non-`data:` request, so any residual `url()` cannot reach the network; template/asset mode keeps network for its server-signed asset URLs. `sanitizeHtml` is now async. Functions build verified; `sanitize-html ^2.13.0` resolves cloud-side via `generatePackageJson`. Commit `63627ed1`. **Not yet deployed** (`firebase deploy --only functions`).

### M-5 — Mailtrap webhook accepts unauthenticated POSTs
**Location:** `apps/functions/src/email/index.ts:25`
No signature/secret verification; anyone can flood `emailEvents` with forged delivery/bounce telemetry (cost + integrity).
**Fix:** Verify Mailtrap's HMAC signing secret before persisting.

### M-6 — Role model split-brain: rules check custom claims; app checks Firestore roles — *FIXED, pending deploy (2026-06-12)*
**Location:** `apps/functions/src/auth/index.ts`, `libs/shared/util-functions/src/lib/general.util.ts`
The auth admin callables gated on `checkAdminUser` (`request.auth.token.admin`) and `checkAdminClaim` (`customClaims.admin`). No function mints these claims, so the basis was unauditable and out of sync with the app (client guards and Firestore rules authorize from `users/{uid}.roles`). The Firestore-rules half of this split-brain was already eliminated by the C-1 rewrite (rules now use `get()` on the user doc).
**Fix applied:** replaced both helpers with a single `checkAdminRole()` that reads `users/{uid}.roles.admin` (source of truth) while still accepting a legacy `admin` custom claim, so already-provisioned admins are not locked out; updated all call sites. Functions build verified. Commit `d2c6ea9d`. **Not yet deployed** (`firebase deploy --only functions`). Follow-up: once confirmed, the legacy-claim fallback can be dropped.

### M-7 — Public unauthenticated read of `orgs`, `resources`, `tags` across all tenants
**Location:** `firestore.rules:30-45`
Unlike `pages`/`sections`/`menuItems` (defensible pre-login CMS bootstrap), these are operational club data, and none of the public reads are tenant-scoped.
**Fix:** Require auth (and tenant) for `orgs`/`resources`/`tags`; for CMS collections decide deliberately whether full public exposure is intended.

### M-8 — `sessions` docs updatable without authentication — *DEPLOYED (2026-06-12)*
**Fix applied:** the `sessions` update rule now requires the tenant to be unchanged AND either `userKey` unchanged (anonymous heartbeat / end-session) or `userKey` set to the authenticated caller's own uid (login upgrade) — so an anonymous client can no longer forge an arbitrary `userKey`. Emulator-verified: anonymous PATCH forging `userKey` → 403; anonymous heartbeat (userKey unchanged) → 200. **Deployed 2026-06-12.**
**Original location:** `firestore.rules:113-122`
Update rule has no `request.auth` check and no field whitelist — anyone on the internet can rewrite session docs (forge `userKey`, flip `isActive`, stuff junk). The pre-auth `create` rule does constrain `isActive == true`, `userKey == ''`, and `tenants.size() == 1`, but has no field whitelist or size cap beyond that (spam vector). **Empirically confirmed:** an unauthenticated PATCH setting `userKey: "forged-user"` on an existing session returned 200 in the emulator probe.
**Fix:** Whitelist mutable fields via `affectedKeys()`; bind sessions to `request.auth.uid` once upgraded; cap size.

### M-9 — `set-env.js` is tracked in git despite the project's "never commit" rule — *FIXED (2026-06-12)*
**Location:** repo root; `.gitignore` lacked an entry
Full history scanned: no secrets ever present (env-var plumbing only — token fields are `'${servicesConfig.…}'` template placeholders interpolated from `process.env` at runtime), so nothing leaked — but the guardrail was missing; a future edit embedding a key would be silently committed.
**Fix applied:** `git rm --cached set-env.js` (working copy kept) and added `set-env.js` / `**/set-env.js` to `.gitignore` next to `environment.ts`/`.env`/`firebase-config.js`. Commit `4b730403`. **Operational note:** the script is now provisioned locally/per-deploy like `environment.ts` — ensure CI generates or supplies `set-env.js` (a fresh clone no longer contains it).

### M-10 — Supply-chain hygiene: `firebase-functions: "latest"`, CLI/test tooling in prod deps — *FIXED (2026-06-12)*
**Location:** root `package.json`
`"latest"` is non-reproducible and auto-adopts any release including a compromised one. `firebase-tools` (a CLI) sat in `dependencies`. `matrix-js-sdk` pinned to a pre-release (`40.3.0-rc.0`).
**Fix applied:** pinned `firebase-functions` to `^7.0.5`; moved `firebase-tools` to `devDependencies`. `pnpm install` clean, functions build verified. Commit `21378fb8`. **Follow-up (not done):** move `matrix-js-sdk` to a stable release — a test-heavier change deferred on its own.

### M-11 (was H-2) — `applications` rules call four undefined functions — *DEPLOYED (2026-06-12)*
**Fix applied (as part of the C-1 rewrite):** the undefined helpers are gone; `applications` now uses real `get()`-based role helpers. `create` is shape-constrained (`state=='applied'`, empty `taskKey`/`personKey`, single tenant) and allows the anonymous membership-application flow to actually work; `read`/`update` require `isPrivileged()` + tenant. Note: rules CI still does not exist — adding emulator-based rules tests to CI remains a follow-up (a 27-case harness was used for this change and can be committed).
**Original location:** `firestore.rules:101-109`
The `applications` block calls `isAuthenticated()`, `belongsToTenant()`, `isAdmin()`, `isPrivileged()` — none are defined in the file. Production verification showed this does **not** block deployment: unknown function calls error at evaluation time and the affected rule denies (fail-closed). Consequences: (a) the intended **anonymous membership-application flow is silently broken** — the emulator probe with the exact valid shape the rule is written to allow returned 403; (b) for authenticated users the entire block is moot because the catch-all (C-1) grants access anyway, which is why the breakage went unnoticed; (c) the ruleset shipped with no validation step that would have caught an undefined function.
**Fix:** Define the four helpers as part of the rules rewrite (C-1) and add rules validation (emulator-based rules tests + deploy) to CI.

---

## Low

### L-1 — CSP neutralized by `unsafe-inline` + `unsafe-eval` in `script-src`
**Location:** `firebase.json:78` (scs-app), `:122` (test-app)
Any injected inline script executes freely, so CSP provides no XSS backstop for H-3/M-1. `'unsafe-eval'` should be unnecessary for Angular (uses `'wasm-unsafe-eval'`, already present); the Tailwind CDN script is itself an external-script dependency requiring eval.
**Fix:** Drop `'unsafe-eval'`; replace Tailwind CDN with precompiled CSS; migrate inline scripts to hashes/nonces, then drop `'unsafe-inline'`.

### L-2 — CSP missing hardening directives
**Location:** `firebase.json:78, 122`
No `object-src 'none'`, `base-uri 'self'`, or `frame-ancestors 'none'` (clickjacking).
**Fix:** Add all three to both CSPs.

### L-3 — `target="_blank"` on user/DB-controlled URLs without `rel="noopener"`
**Location:** `libs/chat/ui/src/lib/matrix-message-list.ts:404-409` (other users' location links), `libs/calevent/feature/src/lib/calevent-view.modal.ts:102` (DB `url`)
Reverse-tabnabbing; the Matrix `maps_link` is attacker-controlled and should also be validated as http(s).
**Fix:** Add `rel="noopener noreferrer"`; validate scheme.

### L-4 — Public API CORS reflects any origin
**Location:** `apps/functions/src/publicApi/index.ts:13` (`corsLib({ origin: true })`)
No credentials involved, content is public; impact limited to cross-origin contact-form spam (already honeypot-protected).
**Fix:** Restrict to known site origins.

---

## Info

- **I-1** — OIDC callback state check bypassable when `state` omitted (`libs/auth/feature/src/lib/matrix-oidc-callback.ts:89`): require `storedState` to exist and match. (Becomes moot if the OIDC bridge is deleted per C-3.)
- **I-2** — FCM service workers pin Firebase **12.7.0** from gstatic while the app uses **12.8.0** (`apps/*/src/firebase-messaging-sw.js:4-5`). Keep in lockstep; `importScripts` has no SRI, trust rests on the gstatic origin (acceptable).
- **I-3** — Hardcoded Firebase web API key fallback in `oidc-bridge/index.ts:298`. Web API keys are public-by-design; the issue is the silent fallback — fail fast instead.
- **I-4** — esign webhook is correctly HMAC-verified with `timingSafeEqual` (good), but `events: arrayUnion` grows unbounded and stores payloads verbatim — cap or trim.
- **I-5** — Editor-authored section HTML (`article`, `chart`, `table`, `button`, `news`, editor, Matrix `formatted_body`) uses plain `[innerHTML]` → Angular's default sanitizer applies. These high-traffic paths are correctly defended; the risk concentrates in the explicit bypass sites (H-3, M-1).

---

## Rules rewrite plan (companion to C-1/C-2/H-1/M-8/M-11)

Removing the catch-all will fail-closed every collection without an explicit rule. Plan the rewrite collection-by-collection against the `FirestoreService` call sites:

1. Helper functions: `isSignedIn()`, `belongsToTenant(tenantId)` (via `request.auth.token.tenantId` claim **or** `get()` on the caller's user doc — per the M-6 decision), `isAdmin()`, `isPrivileged()`.
2. `users/{uid}`: read own doc; update own doc **except** `roles`, `tenants`, `personKey` (use `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`); admin full.
3. `users/{uid}/fcmTokens/{token}`: `request.auth.uid == uid` only.
4. Tenant collections (`persons`, `addresses`, `memberships`, `comments`, `calevents`, `reservations`, `tasks`, `invoices`, …): read/write requires auth + tenant membership; writes additionally role-gated where the UI implies it.
5. Keep the existing explicit deny-alls (`_rateLimits`, `esignAudit`, `stats_*`, `docGenerations`) — they become effective once the catch-all is gone.
6. CMS public bootstrap (`pages`, `sections`, `menuItems`, `categories`, `app-config`, `app-version`): deliberate public read, ideally constrained to public page types.
7. Validate with the rules emulator + unit tests; wire `firebase deploy --only firestore:rules` into CI.

---

## Verified clean

- No `eval`/`new Function`/`document.write` in app code; no unguarded `postMessage` listeners.
- Secrets in Cloud Functions consistently via `defineSecret`/Secret Manager; no hardcoded secrets in functions.
- Admin auth functions correctly chain App Check → auth → admin checks; PDF/forms rate limiters keyed on server-derived values.
- Replication triggers are Firestore-event-driven (not externally invokable) and stay within matching docs.
- 3,011 tracked files scanned for secret patterns: only C-4 (real) and I-3 (public-by-design) found; no `environment.ts`, `.env`, `firebase-config.js`, or service-account files tracked now or ever in history.
- No git/http dependencies; no install-time scripts in root `package.json`.
- Email contact form output is HTML-escaped; nodemailer fields structured (no header injection).

---

## Suggested remediation order

| Phase | Items | Effort |
|---|---|---|
| **Immediately (this week)** | C-4 revoke tokens; C-1/C-2/M-8 rules fix & deploy (incl. M-11 helper definitions); C-5 Matrix callable authz; C-3 disable OIDC bridge | Rules rewrite is the big one; the rest are small |
| **Short-term** | H-1 storage rules; H-3 iframe/video URL allowlist; H-4 token logging; H-5 esign tenant check; H-6 App Check; H-7 dependency overrides | Mostly localized changes |
| **Hardening** | H-8 xlsx replacement; M-1…M-10; L-1…L-4 | Schedule into normal sprints |

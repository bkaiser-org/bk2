# Pending & Deferred Functionality

**Purpose:** A single reference of all functionality that the specs in [`docs/done/`](done/) describe as
deferred, out of scope, postponed to a follow-up project, or otherwise not yet implemented.
Use it to plan follow-up work. Each entry links back to its source spec.

**Last compiled:** 2026-06-12 (from the 16 specs in `docs/done/`).

> Legend: 🔴 not started / explicitly out of scope · 🟡 partially done, work remaining ·
> 🚀 fixed in code, awaiting deploy/app build · ❓ open question / decision needed.

---

## 1. PDF Generator — [`2026-05-25-pdf-generator-spezifikation.md`](done/2026-05-25-pdf-generator-spezifikation.md)

All original open points are resolved. Remaining deferrals are explicit non-goals of the iteration:

- 🔴 **WYSIWYG template editing** — only an HTML/Handlebars source editor with preview ships; no visual editor (§1.3).
- 🔴 **Client-side document generation** — intentionally excluded (privacy, layout consistency, template protection) (§1.3).
- 🔴 **Integrated email dispatch in the CF** — sending stays client-side over the existing Mailgun transport (§1.3, §8.4).
- 🔴 **Electronic signature (DeepSign)** — flagged as a follow-up project; see spec 02 (§1.3, §11.1).

## 2. DeepSign E-Signature — [`2026-05-25-deepsign-integration-spec.md`](done/2026-05-25-deepsign-integration-spec.md)

Out of scope for **v1** (§1):

- 🔴 Hash signing.
- 🔴 Company seals.
- 🔴 Ad-hoc signee/observer management via API.
- 🔴 Manual placement of signature fields (relies on embedded Text Field Patterns only).
- 🔴 Batch upload and attachments.
- 🔴 Non-PDF MIME types (DOCX/XLSX) — only `application/pdf` accepted in v1 (§9).

## 3. Accounting / Buchhaltung — [`2026-05-27-buchhaltungssystem-spezifikation.md`](done/2026-05-27-buchhaltungssystem-spezifikation.md)

Explicit follow-up projects ("Folgeprojekt") and open points (§1, §3, §7):

- 🔴 **Lohnbuchhaltung (payroll)** — separate scope; see spec 11.
- 🔴 **Kostenrechnung** (cost centres / cost objects) — Folgeprojekt; cost-centre report filter also deferred (§3, report filters).
- 🔴 **EBICS direct connection** — Folgeprojekt; expansion stage (T / T+S / TS) still undecided. `PaymentOrderModel.deliveryMethod` already reserves `'ebics'`; Phase 7 ships only `pain001_download`.
- 🔴 **Bexio Payments API direct upload** (`deliveryMethod = 'bexio_api'`) — later expansion stage.
- 🔴 **Supplier-invoice platform integration** (eBill, Peppol BIS Billing 3.0) — Folgeprojekt.
- 🔴 **Lagerbuchhaltung** (inventory accounting) — out of scope.
- 🔴 **Multi-mandant consolidation** (consolidated balance across accounting mandates) — Folgeprojekt.
- 🔴 **Sozialabgaben configuration** (Card §3.8.7) — separate spec, depends on payroll being in scope.
- 🟡 **Invoice templates (layout, logo) for PDF generation** — detailed design still outstanding.
- 🟡 **Migration `journallogs` → `bookings`** and rename `BookingJournalModel` → `BookingModel` — must be performed before implementation start.
- 🟡 **CF adjustments for the Journal feature** — flagged as part of Phase 2 (Core Bookkeeping) (§ note at L75).

## 4. Expense Feature — [`2026-05-25-expense-feature-spezifikation.md`](done/2026-05-25-expense-feature-spezifikation.md)

Out of scope this iteration (§1.2) and open points (§9):

- 🔴 **Approval-workflow module** — no dedicated approval step before booking creation.
- 🔴 **Travel-expense flat rates** (mileage, per-diem) — Folgeprojekt.
- 🔴 **Credit-card integration.**
- ❓ Auto-payout to employee from the liability (pain.001 generation)?
- ❓ VAT handling for foreign receipts without Swiss VAT — default behaviour undecided.
- ❓ Multiple currencies within a single expense (e.g. EUR receipt, CHF form value)?
- ❓ OCR learning loop — feed manual corrections back to improve recognition?
- ❓ Duplicate-receipt behaviour (same content hash): warn or block?

## 5. CMS Implementation — [`2026-05-25-cms-review.md`](done/2026-05-25-cms-review.md) · impl spec [`2026-05-26-cms-improvements-spec.md`](2026-05-26-cms-improvements-spec.md)

The improvements spec (§4–§18) was implemented (2026-06-13/14). All HIGH/MEDIUM/LOW workstreams
landed in code; only the items below remain. **Not yet committed or deployed.**

### Done 🟢 (in code, awaiting commit)

- 🟢 **Store error state (§4)** — `withErrorState()` feature in `@bk2/shared-feature`; `MenuStore`/`PageStore`/`SectionStore` expose `isError`/`errorMessage`/`clearError`, wrap mutations + stream `catchError`; `<bk-error-banner>` in list/edit views.
- 🟢 **Calendar & Chart edit UI (§5/§6)** — `bk-calendar-config` / `bk-chart-config`; `cal`/`chart` cases wired; renderers honor `section.properties`.
- 🟢 **Files & Links removed (§7, Path B)** — deleted from `section.model.ts` (no prod data; approved).
- 🟢 **Tests (§8)** — service + store specs (Firestore-mock scaffold + TestBed), 15 section-validation specs, registry/tokenizer/menu-cycle/menu-token specs; plus fixed pre-existing `@angular/compiler` JIT test-setups (section/page/menu util).
- 🟢 **Vest in `SectionForm` (§9)** — per-type suite registry; form runs the active suite, emits `valid`, shows `bk-error-note`; `SectionEditModal` gates save on dirty **and** valid.
- 🟢 **Pagination (§10)** — Ionic `ion-infinite-scroll` on `PageList`/`MenuList`; `searchByKeys(limit)`. `SectionAllList` cursor-pagination intentionally skipped (admin-only).
- 🟢 **Circular-menu guard (§11)** — `Menu` threads depth/visited-keys; admin placeholder + `debugData` warning; depth cap 8.
- 🟢 **Export (§12)** — `PageStore`/`SectionStore` `export()` produce JSON + CSV (filtered) via existing download helpers.
- 🟢 **Loading skeletons (§13)** — `BkListSkeleton` in `@bk2/shared-ui`; used in all three list views.
- 🟢 **Search index (§14)** — `buildSearchTokens` tokenizer (HTML-strip/deaccent/stop-words); `getSectionIndex`/`getPageIndex` index title/subTitle.
- 🟢 **`@VERSION@` cleanup (§18)** — `menu-tokens` registry + `expandMenuTokens`; documented in `MENU.md`.
- 🟢 **member-age/cat config UI (§16)** — `bk-member-config` (orgId, chartType, sortOrder, +categoryFilter); cases wired; `createSection`/`narrowSection` cases added; stores honor `sortOrder`/`categoryFilter` (`applyCatRowConfig`). *Schema extended (approved): `chartType?`/`sortOrder?` + `categoryFilter?`.*
- 🟢 **RAG config UI (§15)** — `bk-rag-config` (model, storeName, systemPrompt, documentScope, maxTokens); case wired; `RAG_SECTION_SHAPE` + factory case added. *Schema extended (approved): literals → string + optional fields.*

### Remaining follow-ups

- 🟡 **§16 `chartType='bar'` rendering** — the field is editable/stored, but `member-age`/`member-cat` sections still render a **table**; a bar-chart view needs echarts in those renderers (like `chart-section`).
- 🔴 **§15 RAG Cloud Function** — `model`/`systemPrompt`/`maxTokens` are editable/saved, but `queryRag` only consumes `storeName`; passing the new fields through (and applying them) is backend work (needs `deploy:functions`).
- 🟡 **§14 reindex backfill** — `getSectionIndex`/`getPageIndex` enrich on next save; a one-shot `apps/functions/src/tools/reindex-cms.ts` to recompute existing docs' indices was **not** written (operational, run-after-deploy).
- 🟡 **§17 blog-layout visual smoke test** — all six layouts are implemented + wired (verified statically; documented in `PAGE.md`), but a visual smoke test + screenshots of each layout with sample data still needs the **running app**.
- 🟡 **`SectionEditModal` stale comment** — see the shared scVestForm-comment cleanup nit in §11 (LOW).

## 6. Trip Feature — [`2026-05-25-trip-feature-spec.md`](done/2026-05-25-trip-feature-spec.md)

Out of scope this iteration (§1.2) and open questions (§17):

- 🔴 **Multi-stop trip recording** — single destination per trip only.
- 🔴 **Automated distance calculation from GPS tracks.**
- 🔴 **Guest management** beyond adding a non-member person as a participant.
- ❓ Add `kiosk` to `RoleName`/`Roles` — confirm before implementing (model change).
- ❓ Add `flagged: boolean` field to `TripModel` — confirm before implementing (model change).
- ❓ Notification mechanism for `trip_responsibility`: Firestore task document or Cloud Function call?
- ❓ Map library for `LocationSelect`: Leaflet or Google Maps? (See spec 15 — resolved there.)
- ❓ `dev_responsibility`: `ResponsibilityModel` or hardcoded admin contact?
- ❓ Should `aoc/trip` also be accessible to `trip_responsibility`, not only admin?

## 7. Trip Statistics (Firestore) — [`2026-05-25-trip-stats-firestore-spec.md`](done/2026-05-25-trip-stats-firestore-spec.md)

Open questions (§8):

- ❓ Exact set of `COUNTING_STATES` — should `open` (and `open.rev`) count toward live YTD numbers?
- ❓ May the kiosk edit an `open` trip in place, or must every revision use the `.rev` postfix?
- ❓ Audit log of state transitions — only latest `deletedAt`/`deletedBy` kept; a `/trips/{id}/history` subcollection could capture every transition if full audit is required.

## 8. Forms Builder — [`2026-05-27-forms-builder-spec.md`](done/2026-05-27-forms-builder-spec.md)

Out of scope for **v1** (§1, §16) and later implementation phases (§18):

- 🔴 **Multi-page / multi-step forms** — data model reserves a future `pageIndex`; editor/renderer treat all fields as one page in v1.
- 🔴 **Generic third-party integrations** (Zapier, Salesforce, …) — URL target is the escape hatch.
- 🔴 **Inbound email parsing / non-HTTP submission channels.**
- 🔴 **Conditional-logic editor for `visibleIf`** — data structure exists, no UI in v1.
- 🔴 **A/B testing / form-completion analytics.**
- 🔴 **Server-side e-signature flows** — uses existing client-side DeepSign.
- 🟡 **Phasing remainder** — later phases ship: URL target + submission CF + audit + CSV export (P2); spam protection (P3); CAPTCHA + encrypted file upload (P4); approval workflow + email notifications (P5); PDF export single/batch + PDF-form template fill (P6).
- 🟡 **Encrypted file-upload key derivation** — PBKDF2 chosen; exact parameters to be confirmed with security review before implementing §9.2.

## 9. Application Feature — [`2026-05-27-application-feature-spec.md`](done/2026-05-27-application-feature-spec.md)

Out of scope this iteration (§1.2):

- 🔴 **Public submission page** — rendered by FormSection/FormsBuilder, built later (spec 09).
- 🔴 **Anonymous CAPTCHA / rate-limiting** — handled by FormsBuilder spam protection.
- 🔴 **Document upload** (e.g. parental-consent PDF) — follow-up task after acceptance.
- 🔴 **Payment collection at application time.**
- 🔴 **Multi-tenant cross-club transfer flows** beyond the single `applicationAs = 'transfer'` marker.
- 🔴 **Automatic account creation** — approvers open accounts manually via the finance feature.
- 🟡 **Per-membership-category responsibility routing** — generic `application` responsibility for now; per-kind split can be added later.

## 10. Lohnbuchhaltung (Payroll) — [`2026-05-28-spec-lohnbuchhaltung.md`](2026-05-28-spec-lohnbuchhaltung.md)

*(Spec lives in `docs/`, not `docs/done/` — listed here because spec 03 defers payroll to it.)*
Status: dependent on payroll being taken into scope; drives the deferred Sozialabgaben config in spec 03.

## 11. Vest → Signal Forms Migration — [`2026-06-12-vest-to-signal-forms-migration-spec.md`](done/2026-06-12-vest-to-signal-forms-migration-spec.md)

**✅ Done (completed 2026-06-12).** The phased migration shipped in full; all five phases are complete:

- 🟢 **Phase 0** — `vest-bridge.ts` (`validateVestTree`) landed in `@bk2/shared-util-angular`, with dev warnings and improved type safety.
- 🟢 **Phases 1–3** — every form migrated to Angular Signal Forms (`@angular/forms/signals`) across all domains (subject, relationship, cms, geo, calevent, document, resource, task, finance, user, profile, application, ownership, category, folder, chat, auth, trip). Forms now bind via `[control]`/`form(...)` and reuse the existing Vest suites through `validateVestTree`.
- 🟢 **Phase 4** — `ngx-vest-forms` dependency removed from `package.json`/`pnpm-lock.yaml` (commit `da3c328b`); `vestFormsViewProviders` removed from all `shared/ui` components; no `scVestForm` directive or `validationConfig` remains in source.

The four open questions (§5.2 async Signal Forms API, §5.4 `FieldTree` array indexing, `warn()` forms, whole-suite performance) were all resolved in the course of completing Phases 3–4 — async suites and form-array forms are migrated and live.

- 🟡 **Cleanup nit (LOW)** — ~29 edit-modal files still carry a stale `// This destroys and recreates the <form scVestForm> → Vest fully resets` comment referencing the removed directive. Harmless; update the comment text when next touching those files.

## 12. LocationSelect — Free-text route — [`2026-06-11-spec-location-select-custom.md`](done/2026-06-11-spec-location-select-custom.md)

- ❓ **Recently-used / promoted free-text routes** — caching frequently-used custom routes or promoting them into the `locations` collection is explicitly out of scope for this spec (§9).

## 13. LocationSelect — Map view — [`2026-06-12-spec-location-select-map.md`](done/2026-06-12-spec-location-select-map.md)

- 🟡 **Marker clustering** (`leaflet.markercluster`) — deferred until a tenant exceeds the threshold (§ marker handling).

## 14. PWA Caching — [`2026-06-12-spec-pwa-caching.md`](done/2026-06-12-spec-pwa-caching.md)

Explicit out-of-scope items and follow-ups:

- 🔴 **`test-app` and the static websites** — out of scope this iteration (§scope).
- 🔴 **Imgix `dataGroup` caching** — only helps true-offline use; out of scope (long HTTP cache already covers reload-warm) (§ images).
- 🔴 **Dedicated bundle-size spec** — §10 recommendations remain informational only; a separate spec is out of scope.
- 🟡 **Multi-tab IndexedDB manager** — kept as an option for a future desktop-multi-tab use case; gate behind `isSafariBrowser` when needed (§7).
- 🟡 **`IndexedDBCryptoStore` for Matrix E2EE device keys** — file as a follow-up if/when E2EE is enabled (§ Matrix).
- 🟡 **Force-reload-on-every-build strategy** — revisit in a follow-up if needed; swap-in is small.
- 🟡 **Bundle-size investigations** — diagnosed, not yet validated; treated as a backlog of investigations (confirm `matrix-js-sdk` chunk doesn't pull `crypto-js`, etc.).

## 15. Security Review — [`2026-06-11-security-report.md`](done/2026-06-11-security-report.md)

Most Critical/High findings are deployed. Remaining work (as of 2026-06-12):

### Awaiting deploy / app build 🚀
- **H-5** esign tenant authz, **H-6** App Check + 7-day Matrix tokens, **M-3** password-reset enumeration fix, **M-4** PDF raw-HTML sanitizer, **M-5** Mailtrap webhook HMAC, **M-6** `checkAdminRole` — all need a **Cloud Functions redeploy** (`pnpm run deploy:functions`).
  - **M-5 deploy prerequisite:** `firebase functions:secrets:set MAILTRAP_WEBHOOK_SECRET`.
  - **M-7(b) deploy prerequisites:** redeploy rules + functions; optionally set `PUBLIC_API_ALLOWED_ORIGINS` / `PUBLIC_API_ALLOWED_TENANTS`; add a `_rateLimits.expiresAt` TTL policy.
- **H-3** CMS iframe/video URL allowlist, **M-1** RAG markdown sanitizer, **M-2** Matrix-creds logout cleanup, **C-3** client route/component removal — ship with the **next app build**.
- **L-2** CSP hardening directives, **L-3** `rel=noopener`, **L-4** public-API CORS allowlist — ship on next hosting/app deploy.

### Deferred / open 🔴🟡
- **C-3 verification** — confirm the 6 `oidc*` functions are actually deleted in the project; remove stale OIDC provider config from the Matrix homeserver.
- **C-4 follow-up** — optional git-history rewrite (secret already dead); regenerate e2e auth state from a non-admin test user.
- **C-5 / H-6 — App Check on `matrix-simple` callables** was applied under H-6; the separate **`matrixPushGateway` shared-secret review** remains a new follow-up.
- **H-1 / M-9 — Storage content-type allowlist** deferred to Phase 2; M-9 (client-side-only MIME restriction) remains open until the exact MIME set is confirmed against real SDK uploads in staging.
- **M-7(a) — Per-collection write RBAC** done for CMS content only; RBAC for the remaining collections is **not pursued** (needs write-call-site analysis + domain confirmation).
- **M-10 follow-up** — move `matrix-js-sdk` from the pre-release to a stable release (test-heavier change, deferred).
- **M-11 / rules CI** — emulator-based Firestore-rules tests exist (27-case harness) but are **not yet wired into CI**.
- **L-1 — CSP `unsafe-inline` + `unsafe-eval`** in `script-src` — **DEFERRED, blocked by `/web`**: requires migrating `scs-website` off the Tailwind Play CDN and inline scripts (or per-path CSP split) first.
- **Info items I-1…I-5** — OIDC callback state check (moot if bridge gone); FCM SW Firebase version lockstep; hardcoded API-key fallback fail-fast; cap/trim unbounded esign `events` array; (I-5 already-defended `[innerHTML]` paths — no action).
- **Post-deploy verification** — smoke-test the live app and watch production logs for `permission-denied` after the rules rewrite (a read-only-classified collection with a real client write path needs flipping to privileged write).

## 16. vCard Export — [`2026-06-12-spec-vcard-export.md`](done/2026-06-12-spec-vcard-export.md)

The feature is **implemented** (`apps/functions/src/vcard/`, `libs/vcard/util`, `libs/vcard/feature`, person/org list + store entry points) for tiers 1 & 2. Outstanding:

- 🟢 **§11 open item resolved** — the avatar source is concrete in code (`IMGIX_BASE = https://bkaiser.imgix.net`, server-side fetch + base64 in the `vcardExport` callable); no longer a placeholder.
- 🟡 **Tier 3 (memberAdmin multi-select) — no UI** — the callable already enforces the 100-record cap server-side, but nothing in the selection-mode context menu wires to it (§5, §6.2). Single-target tiers 1 & 2 ship; multi-select export is deferred.
- 🟡 **`orgLinks` (parent/child orgs) omitted** — org cards still emit their `WorkRel`-linked persons, but the parent/child organization links (§3.2, §5) are not generated.
- 🟡 **Registered read-model projection (§7) not added** — the spec's denormalized favorite-contact projection for the `registered` role doesn't exist; the callable instead enforces favorites-only for tier 1 itself (defence in depth), which is functionally correct but skips the read-path part of the design.
- 🟢 **Country names — English form by design** — `ADR` emits the English country name (e.g. "Switzerland") via `countries-list`, matching the spec's §3.3 example. `i18n-iso-countries` has no locale registered server-side, so localized country names are not produced (acceptable per the spec example; note if German names are later wanted).
- 🔴 **vCard 4.0 profile** (native `RELATED` / `KIND:org`) — explicit non-goal (§2.1, §2). 3.0 + `X-AB*` is the chosen encoding because iCloud rejects 4.0; only revisit if broad non-Apple fidelity ever becomes a priority.
- 🔴 **Per-platform export profiles** — intentionally not built; the single 3.0 `.vcf` is treated as cross-platform for all *values* (only some *labels* soften on non-Google Android) (§2.1).

## 17. Matrix Chat Audit — [`2026-06-12-matrix-chat-audit.md`](done/2026-06-12-matrix-chat-audit.md)

The symptom fixes (S1–S5), SEC-1/2, SEC-3/4, ARCH-1 and the C-*/P-* hygiene batch are done (mostly client-side, shipping with the app). Remaining work:

### Awaiting deploy 🚀

- **SEC-3 provisioning gate** (`requireMatrixLocalpart` in the matrix callables) — needs **`pnpm run deploy:functions`** to activate.
- **S3 push gateway** — the Firebase Hosting rewrite (`/_matrix/push/v1/notify` → `matrixPushGateway`) needs **`firebase deploy --only hosting:scs-app-54aef`**; until then Synapse accepts the pusher URL but POSTs hit the SPA catch-all and no chat push notifications arrive.

### Deferred / open 🔴🟡❓

- 🟡 **S1 / S2 — duplicate-identity data migration** — the UI now hides the service/bot accounts, but `@bruno` is still *joined* to ~71 rooms (old force-join artifacts) and holds its own DMs, and UID-based duplicate accounts (`@gp8bkee…`, `@scheduler` mapping to 3 DM rooms) still exist. Consolidating "one Matrix account per person" — removing `@bruno` from rooms, migrating/closing its DMs, merging UID-accounts into their `personKey` accounts — is a deliberate per-person data migration, not yet run.
- 🔴 **ARCH-2 — split the 1837-line `MatrixChatService`** into `MatrixSessionService` / `MatrixRoomService` / `MatrixMessageService` / `MatrixCallService`. Deferred as a separate refactor (no test coverage today); do once behavior is stabilized. Would also enable unit testing of this logic.
- 🟡 **ARCH-4 — client-side identity-by-convention** — the four CFs' groupId→alias→room derivation is unified (`resolveGroupRoom` + `groupRoomAliasLocalpart`, `matrixRoomId` persisted), but the **client-side** personKey→localpart / homeserver derivation is still duplicated across the service/store/init.
- 🟡 **ARCH-5 — CF helper extraction** — `resolveGroupRoom`/`ensureMatrixUserExists` extracted; an `ensureAdminInRoom(roomId)` helper for the repeated make-admin/force-join block is still open.
- 🔴 **C-5 — scroll-back pagination** — `loadMessagesForRoom` paginates once; no infinite scroll for older history. A UI feature (new service method + `ion-infinite-scroll` + scroll-anchoring on prepend) needing in-app verification.
- 🔴 **P-3 — `sendCallNotification`** runs sequential Firestore queries per callee; parallelize with `Promise.all`.
- 🔴 **P-4 — `matrixPushGateway`** sends FCM sequentially per device; use `sendEachForMulticast` (as `sendCallNotification` already does).
- 🟡 **P-5 remainder — stop `clearStores()` on routine disconnect** — the IndexedDB persistent store is in place, but clearing on every disconnect still forces a near-full re-sync. Cannot land safely until the store `dbName` is user-scoped (currently fixed `bk2-matrix` → cross-user leak on shared devices); it is the E2EE Step-1 prerequisite.
- 🔴 **P-6 — `listMatrixRooms`** fetches all rooms (≤1000) then filters by joined set (admin-only; acceptable for now).
- 🔴 **SEC-5 — notification & enumeration vectors** — `sendCallNotification` doesn't verify the caller shares a room with the callees; `provisionMatrixUser` lets any provisioned user create an account for any personKey; `getRoomByName` resolves any room via the admin search API. Scope/verify each server-side.
- ❓ **SEC-6 — role source of truth** — cross-check `firestore.rules` actually prevents users writing their own `users/{uid}.roles` field (the `requireRole` CF gate trusts it).
- 🔴 **S5 follow-up — group bkeys** — human-readable bkeys with spaces/hyphens are sanitised for aliases and made non-load-bearing via `matrixRoomId`; auto-generating/masking bkeys at creation would remove the special-char fragility at the source (touches group-creation UX + cross-DB foreign-key migration).
- 🔴 **E2EE by default (§9)** — a large multi-step project (Steps 0–8: device-bound tokens via JWT login, persistent stores, client crypto init, encrypt new rooms, key backup/recovery, migrate existing rooms). Depends on SEC-1 (done), item 6 (SEC-3/4, done) and the P-5 store remainder; realistic scope ~1 focused week, not started.

## 18. QR Payment Reference & Bank Reconciliation — [`2026-06-17-qr-payment-reference-reconciliation-spec.md`](2026-06-17-qr-payment-reference-reconciliation-spec.md)

New spec, decisions locked. QR slips currently print **without a structured reference**, so reconciliation is fully manual. Plan: add an (optional, per-invoice) reference to the slip, then auto-match incoming bank credits.

- 🔴 **Phase 0 — foundation (ships now, no QR-IBAN needed)** — add `InvoiceModel.paymentReference`, an `isQrIban` classifier + QRR reference generator (pure utils), and dual-IBAN slip logic. With no QR-IBAN configured, slips stay `NON`/regular-IBAN — safe no-op that unblocks invoicing.
- ✅ **D1 — reference type** — QRR now; SCOR later (generator takes a `type` param).
- ✅ **D2 — schema change** — `paymentReference: string` on `InvoiceModel` approved.
- 🟡 **D3 — QR-IBAN procurement** — owner to request a QR-IBAN from ZKB; document it in the spec when obtained. Not a blocker.
- 🟢 **Reference need is derived from the IBAN** — a QR-IBAN's IID is `30000–31999`; `isQrIban()` decides QRR vs `NON`, so no `qrIban` field and no manual flag.
- 🔴 **Phase 1 — QRR live** — once QR-IBAN configured, referenced slips render QRR; validate on ZKB's ISO-20022 test platform.
- 🔴 **Phase 2 — camt reconciliation** — new `reconcileCamt` callable parses uploaded ZKB camt.054/053, matches on `paymentReference`, marks invoices paid. Free, no API.
- ✅ **D4 — banking integration (phased)** — start manual-camt; **Phase 3** optionally swaps the upload for a **DeepPay** fetch (DeepCloud REST API → 120+ banks incl. ZKB) reusing the same matcher. EBICS/bLink are alternatives.

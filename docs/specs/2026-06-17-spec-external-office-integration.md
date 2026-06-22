# spec-external-office-integration.md

**Status:** Draft for review
**Owner:** bk2
**Related specs:** (links) `forms-builder-spec.md`, `deepsign-integration-spec.md` (webhook HMAC pattern), `spec-gebuev-archivierung.md` (immutable archival)

---

## 1. Goal & non-goals

### Goal

Let a bk2 client connect a document environment they **own and subscribe to themselves** — ONLYOFFICE DocSpace, Microsoft 365, or Google Workspace — so that:

1. Documents are **edited in the client's own environment**, on their storage, under their licence.
2. bk2 holds a **stable reference** back to the editable source plus one or more **immutable snapshots** (e.g. a specific PDF version) imported into bk2 storage.
3. Snapshots can be **shared with other bk2 users** through bk2's native permission model.
4. A user can jump from bk2 **back into the source environment to edit**, after which bk2 can re-import a new snapshot.
5. bk2 stays aware of upstream changes via **change notifications** (webhooks).

### Non-goals

- bk2 **never hosts or embeds a document editor**. No Document Server, no WOPI host, no editor iframe. This keeps the ONLYOFFICE AGPL / licensing obligation entirely on the client side (their subscription settles it) and keeps bk2 a pure API peer.
- bk2 is **not** the system of record for live editing. The source environment is.
- No real-time co-editing inside bk2.

### Licensing rationale (why this shape)

Because each client runs their own DocSpace / M365 / Workspace tenant, bk2 is never the operator or integrator of the editor. For ONLYOFFICE specifically, this means bk2 carries **no AGPL Section 13 source-disclosure obligation** and needs **no ONLYOFFICE Developer licence** — the client's own subscription covers it.

---

## 2. Core architecture

Two concepts must stay strictly separate:

- **Editable source** — lives in the client's environment. Mutable. Identified by an `ExternalDocRef`.
- **Immutable snapshot** — a frozen copy (bytes + checksum) imported into bk2 storage (GCS / Firebase Storage) at a point in time. This is the thing bk2 shares. It never changes when the upstream source is edited.

```
Client's environment            bk2 (your SaaS)
(DocSpace / M365 / GWS)
  ┌──────────────────┐          ┌─────────────────────────┐
  │ Editable source   │  (1) edit │ ExternalDocRef (link)    │
  │ + storage/versions│◀─────────│ instanceUrl + fileId      │
  │                   │  (2) pull │ DocumentSnapshot (frozen) │
  │                   │─────────▶│ in GCS, checksum, version │
  │                   │ (3) webhook                          │
  │                   │─────────▶│ Cloud Function receiver    │
  └──────────────────┘          └─────────────┬─────────────┘
                                    (4) share  │ (bk2-native)
                                               ▼
                                       Other bk2 users
```

### Cross-tenant editing constraint (important)

The editable source lives in the **owner's** tenant. A different bk2 user generally cannot edit it directly. Three honest options, picked per share:

- **A — view-only snapshot (default):** recipient sees the frozen snapshot only; editing stays with the owner.
- **B — grant access upstream:** owner shares the source file/room in their own environment (DocSpace room invite / Graph sharing link / Drive permission). Surfaced in bk2 as an explicit "open in owner's space" action.
- **C — fork:** recipient imports the snapshot into *their own* connected environment to edit a separate copy.

Default to **A**, offer **B** as an explicit action. **C** is phase 2+.

---

## 3. Provider-driver abstraction

A single abstraction with one driver per provider. Server-side pieces (token handling, pull, webhook verification, watch lifecycle) run in **Cloud Functions**. The Angular app only triggers actions (via callable functions) and renders link/snapshot UI.

```ts
export type ProviderType = 'docspace' | 'msgraph' | 'gdrive' | 'apple-manual';

/** Reference to the editable source in the owner's environment. */
export interface ExternalDocRef {
  provider: ProviderType;
  connectionId: string;        // → ProviderConnection (owner's auth)
  fileId: string;              // provider-native id (or upload id for apple-manual)
  containerId?: string;        // roomId (docspace) | driveId/folderId (graph/gdrive)
  instanceBaseUrl?: string;    // docspace only
  upstreamVersionTag?: string; // etag / version / sequence — used to detect change
  mimeType: string;
  title: string;
}

/** Per-tenant / per-user authorization, stored server-side only. */
export interface ProviderConnection {
  id: string;
  provider: ProviderType;
  ownerOrgId: string;          // bk2 org that owns this connection
  instanceBaseUrl?: string;    // docspace portal URL
  // Secrets are NOT stored in Firestore in plaintext — see §7.
  tokenRef: string;            // pointer into Secret Manager
  scopes: string[];
  expiresAt?: number;
  status: 'active' | 'expired' | 'revoked';
}

/** Frozen, shareable copy held by bk2. */
export interface DocumentSnapshot {
  id: string;
  refId: string;               // → ExternalDocRef
  storagePath: string;         // gs://… in bk2 storage
  mimeType: string;            // usually application/pdf
  checksum: string;            // sha256
  upstreamVersionTag?: string; // version this snapshot was taken from
  importedAt: number;
  importedByUserId: string;
}

/** Persisted handle for a change-notification subscription. */
export interface WatchHandle {
  id: string;
  refId: string;
  provider: ProviderType;
  externalSubscriptionId: string; // provider's subscription/channel id
  resourceId?: string;            // gdrive X-Goog-Resource-Id
  clientState: string;            // shared secret for verification
  expiresAt: number;              // renewal deadline
  callbackUrl: string;
}

export interface SnapshotBytes {
  bytes: Uint8Array;
  mimeType: string;
  upstreamVersionTag?: string;
}

export interface WebhookVerification {
  ok: boolean;
  affectedFileIds: string[];   // may be empty → caller runs a delta query
  needsDeltaQuery: boolean;
}

/** Implemented once per provider, server-side. */
export interface ExternalDocProvider {
  readonly type: ProviderType;

  // --- OAuth / connect ---
  buildAuthorizeUrl(state: string, redirectUri: string, instanceBaseUrl?: string): string;
  exchangeCode(code: string, redirectUri: string, instanceBaseUrl?: string): Promise<ProviderConnection>;
  refreshToken(conn: ProviderConnection): Promise<ProviderConnection>;
  revoke(conn: ProviderConnection): Promise<void>;

  // --- Deep link into the provider's own editor ---
  resolveEditUrl(ref: ExternalDocRef, conn: ProviderConnection): Promise<string>;

  // --- Pull current bytes (optionally converted, e.g. to PDF) ---
  pullSnapshot(
    ref: ExternalDocRef,
    conn: ProviderConnection,
    opts?: { exportMime?: string },
  ): Promise<SnapshotBytes>;

  // --- Change notifications ---
  watch(ref: ExternalDocRef, conn: ProviderConnection, callbackUrl: string): Promise<WatchHandle>;
  renewWatch(handle: WatchHandle, conn: ProviderConnection): Promise<WatchHandle>;
  stopWatch(handle: WatchHandle, conn: ProviderConnection): Promise<void>;

  // --- Inbound webhook verification ---
  verifyWebhook(req: RawWebhookRequest, handle?: WatchHandle): WebhookVerification;
}
```

`apple-manual` implements a degenerate driver: `buildAuthorizeUrl`/`watch`/`renewWatch` throw `UnsupportedOperationError`; `resolveEditUrl` returns the iCloud share link if present (else null); `pullSnapshot` returns the last manually-uploaded bytes. See §5.4.

---

## 4. Capability matrix

| Capability | DocSpace | Microsoft Graph (M365) | Google (GWS) | Apple |
|---|---|---|---|---|
| Auth | OAuth 2.0 app per portal; scopes `Files & Folders`, `Rooms` | OAuth via Entra ID; delegated, least-priv read scope | OAuth 2.0 client (Cloud project) | none for docs |
| File reference | `instanceUrl` + `fileId` (+ `roomId`) | `driveItem` id (+ `driveId`) | `fileId` | n/a |
| Edit deep-link | DocSpace editor URL | Office-on-the-web URL (`webUrl`) | `…/d/{id}/edit` | iCloud share link (UI only) |
| Pull a version | REST `/api/2.0/…` download / convert | Graph content download (`.docx` is native binary) | `files.export` (Docs→PDF/docx); `files.get?alt=media` for binaries | iWork Doc Export API (PDF) only |
| Change notify | Webhook, HMAC-SHA256 `x-docspace-signature-256` | Subscription→webhook; **folder-level only** + delta query | `files.watch` / `changes.watch` channel (can watch single file) | none |
| Notify verification | HMAC signature | `clientState` + validation-token handshake | `X-Goog-Channel-Token` + `X-Goog-Resource-State` | n/a |
| Subscription lifetime | persistent (managed in portal) | ~30 days, renew | files ≤ 1 day / changes ≤ 1 week, renew | n/a |
| Sharing | DocSpace rooms | Graph sharing links | Drive permissions | share link (UI) |

---

## 5. Per-provider implementation notes

### 5.1 ONLYOFFICE DocSpace (`docspace`)

- **Connect:** client registers bk2 as an OAuth app under DocSpace → Developer Tools (set allowed origins, scopes `Files & Folders` read[/write], `Rooms`). Alternatively a per-tenant API key / developer token for server-to-server.
- **resolveEditUrl:** deep-link to the DocSpace editor for `fileId` on `instanceBaseUrl`. User authenticates in their own portal. (Do **not** use the JS SDK `api.js` frame — that reintroduces embedding.)
- **pullSnapshot:** REST `/api/2.0/…` download; use ONLYOFFICE conversion to PDF when `exportMime = application/pdf`.
- **watch / verifyWebhook:** portal webhook → bk2 receiver. Verify HMAC-SHA256 from header `x-docspace-signature-256` (`sha256=…`). Respect retry policy (≤5 attempts, exp backoff; 410 removes; disabled after ~3 days of failures) — return 2xx fast.
- **Note:** requires the client to run **DocSpace**, not bare Docs. Bare Docs has no portal/OAuth/rooms/webhooks and would force bk2 to integrate the editor itself (licensing regression) — reject that config.

### 5.2 Microsoft 365 / Graph (`msgraph`)

- **Connect:** Entra ID app, delegated OAuth, least-privileged read scope on `Files`/`Sites`.
- **resolveEditUrl:** use the `driveItem.webUrl` (opens Office on the web).
- **pullSnapshot:** download item content directly (a `.docx` in OneDrive/SharePoint is a real binary — no export step). PDF conversion available via Graph format conversion (`?format=pdf`).
- **watch:** `POST /subscriptions`. **Folder-level only** — subscribe to the root or a subfolder, not an individual file. On notification, run a **delta query** to find what actually changed, then match against tracked `fileId`s. `verifyWebhook` validates the `clientState` set at subscription time; first registration requires the validation-token handshake (echo plain-text token, ≤10s, 200 text/plain).
- **renewWatch:** `driveItem` subscriptions last ~30 days max — scheduled renewal required.
- **Caveat:** consumer OneDrive vs OneDrive for Business / SharePoint differ (security webhooks, root-only subscription on Business).

### 5.3 Google Workspace (`gdrive`)

- **Connect:** OAuth 2.0 client in a Google Cloud project; Drive API enabled.
- **resolveEditUrl:** `https://docs.google.com/document/d/{fileId}/edit` (or sheet/slide equivalents).
- **pullSnapshot:** native Google formats are **not** downloadable raw — use `files.export` (→ PDF or docx). Non-Google binaries use `files.get?alt=media`.
- **watch:** `files.watch` (single file — preferred here) or `changes.watch`. Channel `type: web_hook`, HTTPS `address`. `verifyWebhook` checks the `X-Goog-Channel-Token` we set and reads `X-Goog-Resource-State`.
- **renewWatch:** short lifetimes — files ≤ 1 day, changes ≤ 1 week (default 1 hour). A renewal scheduler is **mandatory**, not optional.
- **Alternative:** Google Workspace Events API delivering Drive events over Cloud Pub/Sub — consider if per-channel renewal churn becomes painful.

### 5.4 Apple iWork / iCloud (`apple-manual`) — degraded

No official integration surface: no third-party OAuth file API, no stable file reference, no change notifications, no programmatic editor deep-link. The only official API is **iWork Document Exporting** (Apple Developer Program; converts Pages/Numbers/Keynote → PDF, but takes a supplied document — it cannot reach into a user's iCloud). Unofficial reverse-engineered iCloud libraries hit Apple's internal endpoints, are personal-use only, and are not ToS-safe for a commercial SaaS.

**Therefore:** support Apple only as **manual upload**. The user exports a PDF/docx in Pages and uploads it to bk2. `ExternalDocRef.fileId` = bk2 upload id; `resolveEditUrl` returns the iCloud share link if the user pasted one, else null; no `watch`. Round-trip editing is manual (re-upload).

---

## 6. Cloud Functions (backend)

All secret-bearing operations are server-side.

- `oauthStart` (callable): returns provider authorize URL + signed `state`.
- `oauthCallback` (HTTPS): exchanges `code`, creates `ProviderConnection`, stores token in Secret Manager.
- `importSnapshot` (callable): `pullSnapshot` → write immutable copy to GCS → create `DocumentSnapshot` + checksum → update `ExternalDocRef.upstreamVersionTag`.
- `webhookDocspace`, `webhookMsgraph`, `webhookGdrive` (HTTPS): per-provider receivers. Verify, then enqueue a sync task. Return 2xx immediately (Graph wants 202; Google/DocSpace fast 200).
- `syncWorker` (task/queue): on verified change, mark affected `ExternalDocRef` as "newer upstream available" and/or auto-import per config.
- `renewWatches` (scheduled): renew M365 (~30d) and Google (≤1d/≤1wk) subscriptions before expiry; recreate on failure; reconcile with a delta query to avoid missed changes during gaps.
- `revokeConnection` (callable): `revoke` + stop watches + mark connection revoked.

---

## 7. Security

- **Tokens** in Secret Manager (or KMS-encrypted), never plaintext in Firestore; `ProviderConnection.tokenRef` is a pointer only.
- **Webhook verification per provider** (HMAC for DocSpace; `clientState`+validation token for Graph; `X-Goog-Channel-Token` for Google). Reject unverified payloads; treat them as potentially hostile.
- **Callable functions** gated by Firebase Auth + App Check.
- **Scope minimization** — request read-only unless write-back is actually used.
- **No PII / tokens in URL query strings**; deep-links carry only opaque file ids.
- **Tenant isolation** — an `ExternalDocRef` is only resolvable by users in its `ownerOrgId` (plus snapshot-share grants).

---

## 8. Sequence flows

**Connect:** user picks provider → `oauthStart` → consent in provider → `oauthCallback` stores `ProviderConnection`.

**Link a document:** user selects a file in the provider (picker or pasted link) → bk2 stores `ExternalDocRef` → optional `watch`.

**Edit round-trip:** bk2 "Edit" → `resolveEditUrl` opens provider editor in new tab → user edits & saves upstream → (webhook or manual) → bk2 flags / re-imports.

**Import version:** `importSnapshot` → frozen `DocumentSnapshot` in GCS.

**Share:** bk2-native sharing of the snapshot (option A); "open in owner's space" (option B).

---

## 9. Open questions

1. **Snapshot trigger:** auto-import on every webhook, or only on explicit user "import this version"? (Default: manual import; webhook only flags "newer available".)
2. **Version identity:** store the provider's native version/etag as `upstreamVersionTag`, or always snapshot-on-import and treat bk2 snapshots as the only versions of record?
3. **File-picker UX:** native provider pickers (Graph/Google file pickers, DocSpace room browse) vs. paste-a-link. Per provider?
4. **Cross-tenant option B** mechanics: do we trigger upstream sharing via API on the owner's behalf, or just hand off to the provider's own share UI?
5. **GeBüV overlap:** when a snapshot must be retained for compliance, does it flow into the existing WORM archival (`spec-gebuev-archivierung.md`) automatically?
6. **Write-back:** is editing strictly upstream-only (read scopes), or will bk2 ever push a document into the provider (write scopes)? Affects scope requests and risk surface.

---

## 10. Rollout phases

- **Phase 1:** one provider end-to-end (recommend **Google** — single-file `files.watch` is the simplest watch model — or **DocSpace** if a client is already lined up). `ExternalDocRef` + `DocumentSnapshot` + manual import + view-only sharing (option A).
- **Phase 2:** add the second provider; introduce webhook-driven "newer available" flags + `renewWatches` scheduler.
- **Phase 3:** third provider; cross-tenant option B; Apple manual-upload fallback.
- **Phase 4:** optional write-back; fork (option C); GeBüV archival hook.

---

## 11. Out of scope

Real-time co-editing in bk2; hosting any editor/Document Server; acting as a WOPI host; Apple programmatic round-trip (not feasible).

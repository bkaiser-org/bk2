# Matrix Chat Implementation — Audit Report

**Date:** 2026-06-12
**Scope:** `libs/chat/*` (data-access, feature, ui, util), `apps/functions/src/matrix/`, `apps/functions/src/matrix-simple/`
**Trigger:** reported inconsistencies (duplicate users, duplicate DM rooms, pusher 400, log noise, access denied for a group member)

---

## 1. Executive Summary

The implementation is functionally rich (messages, polls, threads, reactions, receipts, WebRTC calls, push), but it has **one structural root problem that explains most of the reported symptoms**: *Matrix room and user identity is derived by convention (name / alias / personKey string matching) in three different, mutually inconsistent ways, instead of being stored once as a fact.* On top of that, the admin account that owns `MATRIX_ADMIN_TOKEN` is a personal account that gets force-joined into every room, which pollutes member lists and the DM-repair heuristic.

| # | Reported symptom | Root cause | Severity |
| --- | --- | --- | --- |
| S1 | Two users: `@bruno (Matrix Admin)` and `@kaiser` | Admin token belongs to a personal account; CFs force-join it into every room | Medium |
| S2 | Two `@bruno (Matrix Admin)` direct chats | `repairDmRoomsAccountData()` misclassifies any 2-member room (you + admin) as a DM | High |
| S3 | `POST /pushers/set 400` | Pusher `data.url` must end in `/_matrix/push/v1/notify` — Synapse rejects anything else | Medium |
| S4 | Periodic "No message subject found" warnings | Expected behavior logged at `warn` level for every message in a not-yet-opened room | Low (noise) |
| S5 | Member gets access denied for room `!GXmh…` | Room lookup by alias/name is inconsistent across CFs → duplicate rooms / failed force-joins | High |

Additionally, the audit found a **critical security gap**: group rooms are created with `preset: 'public_chat'`, which makes the Cloud-Function authorization check *advisory only* — any provisioned Matrix user can self-join any group room client-side (see Finding SEC-1, this is also the likely full story behind S5).

---

## 2. Symptom Analysis (root causes)

### S1 — Two Matrix users for one person

Evidence:

- `MATRIX_ADMIN_TOKEN` belongs to a *personal* admin account (`@bruno`, display name "Matrix Admin"). The code itself acknowledges this: *"the MATRIX_ADMIN_TOKEN may belong to a regular user, not a dedicated service account"* ([matrix-simple/index.ts:452](../apps/functions/src/matrix-simple/index.ts#L452)).
- Every group-room CF (`requestGroupRoomAccess`, `invitePersonToGroupRoom`, `kickPersonFromGroupRoom`, `renameMatrixRoom`) runs `whoami` + `make_room_admin` / admin-join to get this account **into the room** before it can invite/kick. So `@bruno` accumulates membership in every room and shows up in every member list.
- Your app account is provisioned separately as `@<personKey>:<server>` (`@kaiser…`) by `getMatrixCredentials` ([matrix-simple/index.ts:108-252](../apps/functions/src/matrix-simple/index.ts#L108-L252)).

So there genuinely are two accounts, by design — the problem is that the admin account is (a) a personal account and (b) visible everywhere.

There is also a **third, latent identity scheme**: the legacy module [apps/functions/src/matrix/index.ts](../apps/functions/src/matrix/index.ts) derives user IDs from the **Firebase UID** and — worse — uses `matrix.bkchat.etke.host` (with the `matrix.` prefix) as the server name, while everything else strips the prefix (`bkchat.etke.host`). These three functions (`ensureMatrixUser`, `ensureGroupRoom`, `syncUserProfileToMatrix`) are still exported in [main.ts:79-82](../apps/functions/src/main.ts#L79-L82) but have **no client callers**. If they were ever called in the past, they are the origin of stray UID-based accounts.

**Recommendation:**

1. Create a dedicated, clearly-named service account (e.g. `@bk2-bot:bkchat.etke.host`) and rotate `MATRIX_ADMIN_TOKEN` to it. Keep `@bruno` as a human admin account only.
2. Filter the bot/admin user out of member lists, read receipts, and `notifyCallees()` in the client (one constant, checked in `updateRoomsList()` / `buildAndEmitReceipts()`).
3. Delete `apps/functions/src/matrix/` and its three exports — dead code with a conflicting identity scheme.

### S2 — Duplicate "Matrix Admin" direct chats

`repairDmRoomsAccountData()` ([matrix-chat.service.ts:1069-1105](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L1069-L1105)) runs on every `PREPARED` sync and marks **every joined room with exactly 2 joined members** as a DM in `m.direct`. The exclusions (name starts with `!!`, alias starts with `#group_`) do not cover:

- group rooms created client-side via `createGroupRoom()` — these get **no alias** at all ([matrix-chat.service.ts:1443-1459](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L1443-L1459));
- any room where, right now, only *you and the admin account* happen to be joined (other members invited but not yet joined, or kicked).

Each such room becomes a DM keyed to `@bruno` → the room list renders it with the other member's display name: "Matrix Admin". Two such rooms ⇒ two "Matrix Admin" direct chats. (`m.direct` allows multiple room IDs per user, and `updateRoomsList()` renders each one.)

A second duplicate-DM mechanism exists in `createDirectRoom()`: `findExistingDirectRoom()` ([matrix-chat.service.ts:1357-1379](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L1357-L1379)) skips rooms that aren't in the local cache yet. If a DM is created before the initial sync completes (or from a second device with fresh storage — note `clearStores()` on every disconnect), a second DM room with the same person is created.

**Recommendation:**

1. In `repairDmRoomsAccountData()`, never classify a room as DM when the *other* member is the admin/bot account, and skip rooms that have any `m.room.name` state or any invited-but-not-joined members (a real group signal). Better: only repair rooms whose member state event carries `is_direct: true`.
2. One-time cleanup: remove the wrong `m.direct` entries (account data) for affected users.
3. In `createDirectRoom()`, wait for `PREPARED` before deciding to create, and/or ask the server (`GET /joined_rooms` + member check, or keep a `dmRooms` map in Firestore) instead of trusting the possibly-cold local cache.

> **Status: FIXED (2026-06-12), client-only — ships with the app, no deploy.**
>
> The single robust discriminator turned out to be simpler than "exclude the admin account": **a DM never has an `m.room.name` state event; every group room does.** (The admin account isn't configured client-side anyway, and S1 will rename it, so keying off the name is both sufficient and future-proof — a named room the admin was force-joined into can never be a DM.)
>
> - `isDirectRoom()` now returns `false` for any room with an `m.room.name`, *before* consulting `m.direct` or the `is_direct` fallback. This alone fixes the reported render: a group room `@bruno` was force-joined into (others pending/left) can no longer appear as a "Matrix Admin" DM, even if `m.direct` still carries a stale entry. New `roomHasName()` helper (reads the state event, not the SDK-synthesised `room.name`, which is non-empty for DMs).
> - `repairDmRoomsAccountData()` reworked into a two-way **reconcile**: a PRUNE pass drops `m.direct` entries whose synced room is clearly a group (has a name / `#group_` alias / >2 joined members), self-healing prior misclassifications on the next sync for every user; the ADD pass registers only genuine DM-shaped rooms (2 joined members **and** no name). Not-yet-synced rooms are left untouched (absence ≠ deleted).
> - `createDirectRoom()` now `await`s `waitForSync()` (PREPARED/SYNCING, 8 s cap) before find-or-create, closing the cold-cache race that produced a second DM room with the same person.
>
> **Verified against live `m.direct`:** every current entry for `@kaiser` (5 rooms) and `@bruno` (6) is a no-name 2-member room → all correctly kept, **zero false prunes**. The data currently holds no named-room misclassifications, so the fix is primarily preventive + a robust render guard; it self-heals any that appear later.
>
> **Out of scope for S2 (belongs to S1 / identity consolidation):** the `m.direct` entries are keyed under **UID-based duplicate accounts** (`@gp8bkee…` etc.) rather than the persons' `personKey` accounts, and one peer (`@scheduler`) maps to 3 separate DM rooms. These are genuine 2-member DMs (correctly kept), but the duplicate *counterpart identity* and duplicate-real-DM collapse require S1 (one Matrix account per person) — not safe to auto-merge here. One of the UID-keyed rooms (`!Ekhj5…`) is also the source of the recurring S4 "No message subject" warning.

The pusher is registered with

```ts
data: { url: 'https://europe-west6-bkaiser-org.cloudfunctions.net/matrixPushGateway' }
```

([matrix-initialization.service.ts:105-116](../libs/chat/feature/src/lib/matrix-initialization.service.ts#L105-L116)). The Matrix spec/Synapse **require the HTTP pusher URL to end with `/_matrix/push/v1/notify`**; Synapse rejects anything else with 400 (`Invalid value for 'url'`). The push gateway has therefore *never* been registered, and background push for chat messages has never worked (you may not have noticed because `sendCallNotification` pushes via FCM directly).

**Recommendation:** register the pusher with

```text
https://europe-west6-bkaiser-org.cloudfunctions.net/matrixPushGateway/_matrix/push/v1/notify
```

`onRequest` functions receive sub-paths, so [matrixPushGateway](../apps/functions/src/matrix-simple/index.ts#L1561) will be invoked unchanged (optionally check `req.path` for safety). Also add a `format` (e.g. `'event_id_only'` is *not* desired here — keep full format, so simply omit) and consider `append: false` semantics (current value is fine — replaces other pushers with the same app_id+pushkey).

### S4 — "No message subject found for room …" warnings

[handleNewMessage()](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L629-L686) fires for *every* live timeline message in *every* joined room. The `messages$` subject only exists for rooms the user has actually opened, so each incoming message in any other room logs a `console.warn`. This is normal operation, not an error — at most a `debugMessage`.

**Recommendation:** drop the warning (or route through `debugMessage`). No functional change needed; the room-list preview is handled separately via `roomsUpdateTrigger$`.

### S5 — Member gets "access denied" for room `!GXmh…`

The CFs locate a group's room in three steps: canonical alias → Synapse name search (`r.name === groupId`) → **create a new room**. This chain breaks in several documented ways:

1. **Alias derivation is inconsistent.** `requestGroupRoomAccess` sanitizes the alias localpart (`group_${groupId.toLowerCase().replace(/[^a-z0-9._~-]/g,'_')}`, [matrix-simple/index.ts:391](../apps/functions/src/matrix-simple/index.ts#L391)), but `invitePersonToGroupRoom`, `kickPersonFromGroupRoom` and `renameMatrixRoom` use the **raw** `#group_${groupId}` ([:652](../apps/functions/src/matrix-simple/index.ts#L652), [:760](../apps/functions/src/matrix-simple/index.ts#L760), [:856](../apps/functions/src/matrix-simple/index.ts#L856)). Any groupId containing uppercase or special characters resolves to *different aliases in different functions*.
2. **Name search breaks after rename.** Fallback matching requires `room.name === groupId`. As soon as `renameMatrixRoom` gives the room a friendly name, the name search can never match again.
3. When both lookups fail, the function **creates a fresh room**. Result: two (or more) rooms for the same group; members are split across them. A user joined in room A is "not a member" of room B and vice versa — exactly the reported behavior for `!GXmhXU…`.
4. For *old* rooms created with the former `private_chat` preset, the admin bootstrap (`make_room_admin` → invite → admin force-join) can fail (e.g. no joined local member with enough power), in which case step 6 throws `Room access denied for group …` ([matrix-simple/index.ts:495-507](../apps/functions/src/matrix-simple/index.ts#L495-L507)) even for legitimate members.
5. The Firestore membership check itself only filters `relIsLast == true` — it does **not** check that the membership is still active (no end-date / state check), so the gate is loose in the other direction too.

**Recommendation (this is the most important fix):**

1. **Store the Matrix `roomId` on the group document** (`groups/{groupId}.matrixRoomId`) when the room is first created, and resolve rooms exclusively by that field. Delete the alias/name-search fallback chain. This kills the duplicate-room class of bugs permanently. (Schema change — flagging per the hard rule; it is one additive field.)
2. Extract a single shared `resolveGroupRoom(groupId)` helper used by all four CFs; until (1) lands, at least use the *same sanitized* alias everywhere.
3. One-time cleanup: enumerate `#group_*` rooms, merge/purge duplicates (`deleteMatrixRoom` exists already), and verify `!GXmh…` vs. its duplicate.
4. Tighten the membership query (check active date range / membership state, not just `relIsLast`).

> **Status: FIXED & DEPLOYED (2026-06-12).**
>
> - **Schema:** added `matrixRoomId: string` to `GroupModel`. The field round-trips safely — group reads spread the full Firestore doc (`collectionData(..., { idField: 'bkey' })`) and the client `update()` uses `updateDoc` (field-merge), so it is never clobbered on group edits. CFs write it via the admin SDK (bypasses rules).
> - **Single resolver:** new module-local `resolveGroupRoom(groupId, …)` in `matrix-simple` resolves in order — (1) `groups/{id}.matrixRoomId` (verified still present), (2) sanitised canonical alias, (3) admin name-search, (4) create — and **persists the resolved/created room ID back to the group doc** so every CF converges on one room and lookups become O(1). All four CFs (`requestGroupRoomAccess`, `invitePersonToGroupRoom`, `kickPersonFromGroupRoom`, `renameMatrixRoom`) now call it; the divergent per-CF alias derivation (some used raw `#group_<bkey>`) is gone, replaced by the single `groupRoomAliasLocalpart()` helper. Provisioning duplication collapsed into `ensureMatrixUserExists()`.
> - **Authorization change (rec #4, revised per product owner):** the active-membership tightening was **not** applied. Group chats legitimately include non-members and past-members (e.g. training-course participants), so the only access requirement for `requestGroupRoomAccess` is now **being a provisioned system user** (`users/{uid}` exists) — the previous member-OR-visibility-role hard denial was removed. SEC-1 (invite-only rooms) still prevents non-system Matrix accounts from reaching any room, so this does not re-open the SEC-1 hole. This was in fact the real cause of the reported "Dienstags 4-er" access-denied: that group has `visibility: 'registered'` and the reporter failed the old member/role gate before room resolution even ran.
> - **Cleanup (live):** the reported `!GXmh…` is **"Dienstags 4-er"** (group bkey `Dienstags 4-er`, display name "4X-Dienstag"); it exists and was created by a legacy UID-based account with no alias. Relinked: `matrixRoomId` set on the group doc and a directory alias `#group_dienstags_4-er` added (verified resolving). The **2 confirmed spurious twins** (no-alias "Schlüsselverwaltung" / "Trainer" rooms, duplicates of `#group_resourceAdmin` / `#group_trainer`) were purged; `matrixRoomId` set on `groups/resourceAdmin` and `groups/trainer` to their canonical rooms. Post-cleanup scan: **0 duplicate group rooms remain**. The many other no-alias rooms (Signal-bridge experiments under `@signalbot`, DMs, test rooms) were intentionally left untouched.
> - **Follow-up (not done):** group bkeys are human-readable strings with spaces/hyphens (e.g. `Dienstags 4-er`). `groupRoomAliasLocalpart()` sanitises them safely for aliases, and `matrixRoomId` makes alias derivation non-load-bearing — but auto-generating or masking group bkeys at creation would remove the special-char fragility at the source. Tracked as a separate change (touches group-creation UX and would require migrating bkeys used as foreign keys across the DB).

---

## 3. Security Findings

### SEC-1 (Critical): group rooms are effectively public on the homeserver

`requestGroupRoomAccess` and `invitePersonToGroupRoom` create rooms with `preset: 'public_chat'` ([matrix-simple/index.ts:438](../apps/functions/src/matrix-simple/index.ts#L438), [:685](../apps/functions/src/matrix-simple/index.ts#L685)) so the admin API can force-join users. `public_chat` sets `join_rule: public` and `history_visibility: shared`. Consequence: **any user with an account on the homeserver can `joinRoom()` any group room directly via the SDK and read its full history**, bypassing the Firestore membership/visibility check entirely. The CF authorization is decorative. This may also be how the "wrong" users end up in rooms.

**Fix:** create rooms with `join_rule: invite` (`preset: 'private_chat'`) **plus** an `initial_state` power level that gives the service account PL 100, and join members via *invite + admin force-join* (the invite makes force-join work on invite-only rooms — the code already does invite-then-join in steps 5–6, so the public preset is unnecessary). Then migrate existing rooms: set `m.room.join_rules` to `invite` on every `#group_*` room (admin script or one-off CF).

> **Status: FIXED & DEPLOYED (2026-06-12).** Both CF creation sites switched to `preset: 'private_chat'`; `invitePersonToGroupRoom` now invites before force-joining (belt-and-braces — see verification below); the dead client self-join path (`MatrixChatStore.ensureRoomExists`) was removed. Functions deployed to `europe-west6`. All 17 existing public `#group_*` rooms were migrated to `join_rule: invite` via the Synapse admin API and verified — 0 group rooms remain publicly joinable (only the two federated `etke.cc` service rooms are still public, which is intentional and outside our control).
>
> **Live end-to-end verification (on the migrated invite-only `#group_scs`, with a throwaway user that was created, joined, kicked, and erased):**
>
> - Regular client self-join by a non-member → blocked (room is invite-only, no longer in the public directory). ✅ This is the bypass SEC-1 closes.
> - **Synapse admin force-join of a non-member with no pending invite → HTTP 200 (joined).** The admin `/join` endpoint auto-invites + joins because the admin account is already a room member with invite power. So invite-only rooms do **not** lock out the CF member-join flow.
>
> **Correction to the original code rationale:** the old comment claimed `public_chat` was required because "private/invite rooms block this [admin force-join]." That is false — the live test proves admin force-join works on invite-only rooms as long as the admin is in the room first (which the CF already ensures via its `make_room_admin`/admin-join step). The public preset was never necessary. The explicit invite I added to `invitePersonToGroupRoom` is therefore redundant-but-harmless and kept only for parity with `requestGroupRoomAccess`.
>
> **Deploy footnote (unrelated to SEC-1, fixed in passing):** the `deploy:functions` script failed three ways before succeeding — (1) six orphaned `oidc*` functions from the removed OIDC bridge were still in prod and blocked non-interactive deploys (deleted); (2) the workspace `packageManager` pin had been bumped to `pnpm@11.6.0`, which the `nodejs20` Cloud Build runtime can't run (`node:sqlite` error) — the script now rewrites the *deployed artifact's* pin to `pnpm@10.33.2` post-build; (3) the dist `pnpm install --prod` was purging the workspace `node_modules` — now isolated with `--ignore-workspace`. The stale `pnpm.overrides` block in `package.json` (ignored by pnpm 11; already mirrored in `pnpm-workspace.yaml`) was also removed.

### SEC-2 (High): `matrixPushGateway` is unauthenticated

[matrixPushGateway](../apps/functions/src/matrix-simple/index.ts#L1561-L1634) accepts any POST and forwards `title`/`body` to any FCM token in the payload. An attacker who obtains/guesses an FCM token can push arbitrary spoofed notifications to your users; even without tokens it is an open relay endpoint.
**Fix:** require a shared secret (path segment or header) configured in Synapse's pusher `data.url` and verify it in the function; optionally validate `app_id === 'bkaiser.scs.chat'` and cap notification body length.

### SEC-3 (High): `getMatrixCredentials` has no AppCheck and no provisioning gate

Unlike the legacy module (which sets `enforceAppCheck: true`), nothing in `matrix-simple` enforces AppCheck, and `getMatrixCredentials` does not call `requireProvisionedUser`. Any Firebase-authenticated identity (if signup is reachable) receives a Matrix account and a **30-day** access token; on `personKey` lookup failure it silently falls back to a **UID-based localpart** ([matrix-simple/index.ts:40-48](../apps/functions/src/matrix-simple/index.ts#L40-L48)) — a second avenue for duplicate accounts (S1).
**Fix:** add `enforceAppCheck: true` to all matrix-simple callables; require a `users/{uid}` doc with a `personKey` in `getMatrixCredentials` (fail loudly instead of falling back to UID); shorten token validity (e.g. 7 days) — refresh already works via the `M_UNKNOWN_TOKEN` → re-auth path.

### SEC-4 (Medium): token lifecycle

- 30-day access tokens live in `localStorage` (XSS-readable; you already have CSP, keep it strict).
- `clearStoredCredentials()` never calls `/logout`, so every re-auth **accumulates valid tokens server-side** (each admin `/login` call mints a new one; `MatrixChatStore.getMatrixToken` and `MatrixInitializationService.getMatrixCredentials` can both mint on the same day).
**Fix:** call `client.logout()` before clearing credentials where the token is still valid; deduplicate the two credential-fetch paths (see ARCH-1) so only one token is minted.

### SEC-5 (Medium): notification & enumeration vectors

- `sendCallNotification` lets any authenticated user push "incoming call" notifications with an arbitrary `callerName` to arbitrary Matrix user IDs — no check that the caller shares a room with the callees. Verify room membership server-side (room state via admin API) before sending.
- `provisionMatrixUser` lets any provisioned user create a Matrix account for **any** personKey; `getRoomByName` lets any authenticated user resolve any room ID via the *admin* search API. Both are enumeration/squatting aids — scope them (e.g. `provisionMatrixUser` only for persons the caller may chat with; `getRoomByName` behind a role).

### SEC-6 (Note): role source of truth

`requireRole` reads `users/{uid}.roles` from Firestore. This is only as strong as the Firestore rules preventing users from writing their own `roles` field — worth a cross-check in `firestore.rules` (the recent security-report work touched adjacent areas).

---

## 4. Correctness Findings (beyond the symptoms)

| ID | Finding | Location |
| --- | --- | --- |
| C-1 | `rooms` `distinctUntilChanged` comparator only compares `roomId`/`unreadCount`/`lastMessage.timestamp` — room **renames, avatar changes and typing updates are swallowed** until an unrelated field changes. | [matrix-chat.service.ts:70-78](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L70-L78) |
| C-2 | `updateRoomsList()` is `async` and triggered concurrently (debounce only batches the trigger); two overlapping runs can emit out of order (older list last). Guard with an in-flight flag or serialize via `exhaustMap`. | [matrix-chat.service.ts:902](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L902) |
| C-3 | `getMessagesForRoom()` retry heuristic re-loads whenever the subject is empty — an actually-empty room re-paginates on every subscription. Track "loaded" state separately from "empty". | [matrix-chat.service.ts:498-508](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L498-L508) |
| C-4 | Edits arriving *before* the original message is in the list are dropped (`applyMessageEdit` returns when the original isn't found) — message shows stale text until reload. | [matrix-chat.service.ts:733-749](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L733-L749) |
| C-5 | `loadMessagesForRoom` paginates only when `< 20` events and only **once** — no scroll-back pagination for older history; users can never read past ~50 events. | [matrix-chat.service.ts:567-576](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L567-L576) |
| C-6 | `computePollTally`/`isPollEnded` scan only the live timeline — poll votes outside the loaded window silently disappear from the tally. Use the SDK relations API instead. | [matrix-chat.service.ts:778-834](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L778-L834) |
| C-7 | `reportMessage` finds the support channel by `name === 'support'` — same name-as-identity fragility as S5. | [matrix-chat.store.ts:679](../libs/chat/feature/src/lib/matrix-chat.store.ts#L679) |
| C-8 | `currentRoom` falls back to matching `roomId` against a room **name** (`r.name?.toLowerCase() === roomId.toLowerCase()`) — works by accident for aliases, but conflates the two ID spaces in yet another place. | [matrix-chat.store.ts:196-197](../libs/chat/feature/src/lib/matrix-chat.store.ts#L196-L197) |
| C-9 | The store's `isMatrixInitialized` is only patched by `initializeMatrix()`; when `MatrixInitializationService` initializes first, the store relies on the `withState` factory snapshot — if the store is instantiated *before* early init completes, the flag stays `false` until the component path re-initializes. Drive this from a service-level observable instead of two write paths. | [matrix-chat.store.ts:36-41](../libs/chat/feature/src/lib/matrix-chat.store.ts#L36-L41) |

---

## 5. Architecture Findings

**ARCH-1 — Two parallel initialization/credential paths.** `MatrixInitializationService.getMatrixCredentials()` and `MatrixChatStore.getMatrixToken()` are near-duplicates (same caching, same validation, same CF call), and both `startEarlyInitialization()` and the component `effect` in [matrix-chat.ts:572-578](../libs/chat/feature/src/lib/matrix-chat.ts#L572-L578) can race to initialize. Consolidate into **one** `ensureInitialized()` on the service (idempotent, promise-cached); store and init service both call it.

**ARCH-2 — `MatrixChatService` is a 1 740-line god service** (auth/storage, sync, rooms, messages, media cache, polls, receipts, typing, WebRTC, pushers, CF bridging). Split along existing seams: `MatrixSessionService` (client lifecycle + credentials), `MatrixRoomService`, `MatrixMessageService` (incl. polls/reactions), `MatrixCallService`. This also untangles testing — there are currently no unit tests for any of this logic (`libs/chat/util` has tests; data-access does not).

**ARCH-3 — Legacy module `apps/functions/src/matrix/`** is dead but deployed (3 callable endpoints with a conflicting identity scheme, one of which — `ensureGroupRoom` — can still create rooms with the *unsanitized* alias and UID-based invitees). Delete the module and its `main.ts` exports.

**ARCH-4 — Identity by convention.** personKey→localpart, groupId→alias, name→room are each re-derived in 6+ places (client + 4 CFs) with slightly different rules (lowercasing, sanitizing, `matrix.` stripping). Centralize: one shared helper in `@bk2/shared-util-core` for the client, one module-local helper for CFs — and persist `matrixRoomId` on groups (see S5) so derivation is only needed at creation time. **Partially done 2026-06-12** (see S5 status): the four CFs' groupId→alias→room derivation is unified behind `resolveGroupRoom()` + `groupRoomAliasLocalpart()`, and `matrixRoomId` is persisted. The *client-side* personKey→localpart / homeserver derivation is still duplicated and remains open.

**ARCH-5 — CF code duplication.** The provision-user block and the find-room block are copy-pasted 3–4× inside `matrix-simple/index.ts` (~1 600 lines). Extract `ensureMatrixUser(personKey)`, `resolveGroupRoom(groupId)`, `ensureAdminInRoom(roomId)` helpers; the file shrinks by roughly a third and the S5 inconsistency becomes impossible.

---

## 6. Performance Findings

| ID | Finding | Impact |
| --- | --- | --- |
| P-1 | `_mediaCache` blob URLs are unbounded and only revoked on `disconnect()` — long sessions in image-heavy rooms leak memory. Add an LRU cap (e.g. 200 entries, revoke evicted). | Medium |
| P-2 | `updateRoomsList()` rebuilds the full room array — including a `members` array per room via `room.getMembers()` — on every debounced event. With many rooms/members this is O(rooms × members) every 300 ms under activity; the `members` field is only consumed for DM detection/name. Compute members lazily for the selected room only. | Medium |
| P-3 | `sendCallNotification` performs sequential Firestore queries per callee (`users` where personKey + `fcmTokens` subcollection). Parallelize with `Promise.all`. | Low |
| P-4 | `matrixPushGateway` sends FCM messages sequentially per device; use `sendEachForMulticast` as `sendCallNotification` already does. | Low |
| P-5 | Every disconnect calls `clearStores()`, discarding the sync cache → every app start is a *full* initial sync. Consider `IndexedDBStore` persistence to make restarts incremental (also reduces the S2 cold-cache window). | Medium |
| P-6 | `listMatrixRooms` with `personKey` fetches **all** rooms (≤1000) then filters by the user's joined set; the per-room admin endpoint would be O(joined). Admin-only, so acceptable for now. | Low |

---

## 7. Prioritized Action Plan

1. ~~**SEC-1** — switch group-room creation to invite-only + migrate existing rooms' join rules.~~ **Done 2026-06-12** (CF code change + migration of 17 rooms; see status note under SEC-1).
2. ~~**S5 / ARCH-4** — persist `matrixRoomId` on the group doc; single `resolveGroupRoom()`; unify alias sanitization; clean up duplicate rooms (incl. `!GXmh…`).~~ **Done 2026-06-12** (CF code + schema deployed; 2 twins purged, "Dienstags 4-er" relinked, 0 duplicates remain; authz revised to system-user gate per product owner — see S5 status note).
3. ~~**S2** — fix `repairDmRoomsAccountData()` heuristic; clean `m.direct` account data.~~ **Done 2026-06-12** (client-only: `isDirectRoom()` name-guard + two-way `m.direct` reconcile + `createDirectRoom` sync guard; self-heals on next sync. Duplicate *identities* deferred to S1 — see S2 status note).
4. **S3** — append `/_matrix/push/v1/notify` to the pusher URL; add gateway shared-secret (**SEC-2**) in the same step since the URL changes anyway. *(Medium)*
5. **S1** — dedicated service account for `MATRIX_ADMIN_TOKEN`; hide it in the UI; delete `apps/functions/src/matrix/`. *(Medium)*
6. **SEC-3/4** — AppCheck on all matrix callables, provisioning gate + no UID fallback in `getMatrixCredentials`, server-side logout on credential clear. *(Medium)*
7. **ARCH-1/2, C-1…C-9, P-1/P-2/P-5** — consolidation and hygiene, best done as a follow-up refactor once behavior is stabilized. *(Ongoing)*
8. **E2EE by default** — see Section 9. Depends on items 1 (invite-only rooms), 6 (auth rework) and P-5 (persistent stores); do not start it before those land. *(Large)*

---

## 8. Verification Notes

- All findings are from static analysis of the current working tree (commit `3ccb6600` + local modifications). No live Synapse/Firestore state was inspected; the S2/S5 cleanup steps require checking actual room state via the existing admin CFs (`listMatrixRooms`, `getRoomDetails`, `getAllMembersFromRoom`).
- The S3 diagnosis (pusher URL suffix requirement) matches Synapse's documented HTTP-pusher validation and fully explains a 400 on `/pushers/set` with otherwise well-formed parameters; confirm by re-registering with the corrected URL and checking `GET /_matrix/client/v3/pushers`.

---

## 9. Enabling End-to-End Encryption (E2EE) by Default — Step-by-Step

Current state: **no crypto anywhere**. `createClient()` is called without a crypto setup, no `m.room.encryption` state is ever sent, and — critically — the auth flow is incompatible with E2EE as-is. matrix-js-sdk is at `40.3.0-rc.0`, which bundles Rust crypto (`@matrix-org/matrix-sdk-crypto-wasm` is a transitive dependency), so **no new npm dependency is required**.

> **What E2EE buys you here:** message content becomes unreadable to Synapse/etke.host (and to your own admin CFs). What it does *not* protect against: a compromised client, or whoever holds the recovery key (see Step 6). Room *names, topics, membership and state* stay unencrypted by design.

### Step 0 — Prerequisite: device-bound access tokens (blocker)

`getMatrixCredentials` mints tokens via the Synapse **admin** endpoint `/_synapse/admin/v1/users/<id>/login`. These "puppet" tokens are **not associated with a device**, and the client fabricates `deviceId: firebase_<uid>`. E2EE requires a real server-side device per browser/app install (device keys are uploaded under it). Two problems:

1. A deviceless token cannot upload device keys → `initRustCrypto()`/`/keys/upload` fails.
2. Even if it could, `firebase_<uid>` is the *same* for all of a user's browsers — two devices sharing one device identity corrupts each other's crypto state.

Verify the blocker empirically: `GET /_matrix/client/v3/account/whoami` with a current token — if the response has no `device_id`, the token is deviceless.

**Fix — switch the CF to a real login flow.** Recommended: Synapse **JWT login** (clean, no password management):

1. Generate a strong random secret; store it as `MATRIX_JWT_SECRET` via `firebase functions:secrets:set`, and ask etke.host to add to `homeserver.yaml`:

   ```yaml
   jwt_config:
     enabled: true
     secret: "<same secret>"
     algorithm: "HS256"
   ```

2. In `getMatrixCredentials`, after the existing Firestore/role checks and user provisioning, **stop calling the admin login API**. Instead mint a short-lived JWT (`sub: <localpart>`, `exp: now+60s`, HS256 with the shared secret) and return it to the client.
3. The client exchanges it itself: `POST /_matrix/client/v3/login` with `{ type: 'org.matrix.login.jwt', token: <jwt> }`. The response contains a **real `access_token` + server-assigned `device_id`** — store both in localStorage as today.
4. On re-login from the same browser, pass the stored `device_id` in the login body so the device is *reused* instead of creating a new one each time (prevents device proliferation and re-verification storms).

(Alternative if you don't want a server config change: CF resets a random password via the admin API and the client does an `m.login.password` login. Works, but you're now managing shadow passwords — JWT is cleaner.)

This step also resolves SEC-4's token-accumulation issue, since real devices can be enumerated and `/logout` works normally.

### Step 1 — Persist the stores (undo `clearStores()` on disconnect)

[disconnect()](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L254-L271) calls `client.clearStores()` on every disconnect. With E2EE this would **destroy the local Megolm key store** — every reconnect loses the ability to decrypt history until backup restore. Change:

- Only clear stores on *logout of a different user* (compare stored `matrix_user_id`), never on routine disconnect/token refresh.
- Let Rust crypto use its default IndexedDB store (it does automatically in browsers). This also fixes P-5 (full re-sync on every start).

### Step 2 — Initialize crypto in the client

In [initialize()](../libs/chat/data-access/src/lib/matrix-chat.service.ts#L148-L198), between `createClient()` and `startClient()`:

```ts
this.client = createClient({
  baseUrl: url,
  accessToken: config.accessToken,
  userId: config.userId,
  deviceId: config.deviceId,        // now the REAL device_id from Step 0
  timelineSupport: true,
  useAuthorizationHeader: true,
});
await this.client.initRustCrypto(); // loads the WASM module, opens IndexedDB crypto store
this.setupEventHandlers();
await this.client.startClient({ initialSyncLimit: 10 });
```

Bundle-size note (FMP < 1 s budget): the crypto WASM is ~3–4 MB but is loaded **dynamically** by `initRustCrypto()` — it does not enter the initial chunk. Since Matrix init already runs post-login in the background (`MatrixInitializationService`), first paint is unaffected; expect ~1–2 s extra one-time cost before the chat is ready on first use.

### Step 3 — Handle asynchronous decryption in the timeline

Encrypted events arrive as `m.room.encrypted` and decrypt *asynchronously*. Three places in `MatrixChatService` must adapt:

1. **Live timeline** — in `setupEventHandlers()`, add:

   ```ts
   this.client.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => {
     const room = this.client?.getRoom(event.getRoomId() ?? '');
     if (room) this.handleNewMessage(event, room);   // dedupes by eventId already
     this.roomsUpdateTrigger$.next();
   });
   ```

   `handleNewMessage`'s existing replace-by-eventId logic makes this idempotent. After decryption, `event.getType()`/`getContent()` return the clear type/content, so `mapEventToMessage`, polls, reactions and edits work unchanged.
2. **Initial load** — in `loadMessagesForRoom()`, call `await this.client.decryptEventIfNeeded(event)` (or filter on the *clear* type after awaiting decryption) before mapping; otherwise freshly loaded rooms show empty until the Decrypted events trickle in.
3. **Room-list preview** — `updateRoomsList()`'s last-message scan checks `EventType.RoomMessage`; still-encrypted events would be skipped (fine) but add a fallback label (e.g. "🔒 Nachricht") for `m.room.encrypted` so the preview isn't stale, and rely on the `Decrypted` handler above to refresh it.

### Step 4 — Create all new rooms encrypted

Add the encryption state explicitly at every creation site (don't rely on server defaults alone):

```ts
const ENCRYPTION_STATE = {
  type: 'm.room.encryption',
  state_key: '',
  content: { algorithm: 'm.megolm.v1.aes-sha2' },
};
```

- Client: `createDirectRoom()` and `createGroupRoom()` → `opts.initial_state = [ENCRYPTION_STATE]`.
- CFs: the two `createRoom` bodies in `requestGroupRoomAccess` and `invitePersonToGroupRoom` → add the same object to `initial_state`.
- **Hard dependency on SEC-1:** Synapse refuses (and it would be pointless) to default-encrypt publicly-joinable rooms. The `preset: 'public_chat'` → invite-only migration must land first.
- Belt-and-braces server default (ask etke.host): `encryption_enabled_by_default_for_room_type: invite` in `homeserver.yaml`, so rooms created by any other client are encrypted too.

### Step 5 — Migrate existing rooms (irreversible)

Enabling encryption on a room is a one-way switch. After SEC-1's join-rule migration and Steps 0–4 are deployed and verified:

1. New admin CF (admin-role gated, like `deleteMatrixRoom`): for each room, `PUT /_matrix/client/v3/rooms/<id>/state/m.room.encryption` with `{ "algorithm": "m.megolm.v1.aes-sha2" }` using the service-account token (it is a member of every room — for once that helps).
2. Order: pilot one test room → group rooms → DMs.
3. Messages sent *before* the switch remain plaintext and readable; everything after is encrypted.

### Step 6 — Key backup & recovery (don't skip this)

Without backup, a user who clears browser storage or gets a new phone **permanently loses all encrypted history**. Setup, once per user after `initRustCrypto()`:

```ts
const crypto = this.client.getCrypto()!;
await crypto.bootstrapCrossSigning({});        // first upload needs no UIA on current Synapse (MSC3967)
await crypto.bootstrapSecretStorage({
  setupNewSecretStorage: true,
  createSecretStorageKey: async () => recoveryKeyInfo,  // generated via crypto.createRecoveryKeyFromPassphrase()
});
await crypto.resetKeyBackup();                  // enables server-side Megolm key backup
```

On every subsequent login/new device: restore with the recovery key (`crypto.bootstrapSecretStorage({})` + backup restore), then history decrypts.

**Custody decision (the real product question):**

- **Option A — user-held recovery key** (true E2EE): show the generated key once with "store this safely" UX. Strongest guarantee; guaranteed support burden when club members lose it.
- **Option B — recovery key escrowed in Firestore** (`users/{uid}.matrixRecoveryKey`, readable only by the owner per rules): login on any device is fully automatic and invisible. This protects against a Synapse/etke.host breach but **not** against a Firebase breach or yourselves — document that honestly.

For this app's audience, Option B is the pragmatic recommendation; you can offer Option A as an opt-in "paranoid mode" later.

### Step 7 — Knock-on effects to account for

| Area | Effect | Action |
| --- | --- | --- |
| Force-join flow | Megolm keys are shared with members when the *sender's client* sees them join — works. But **history from before a member joined is never shared** (MSC3061 shared-history applies on *invite*, and your admin force-join bypasses the inviter's client). | Accept "newcomers see no old messages" as the product behavior, or restore Megolm keys from backup is N/A (backup is per-user). Document it. |
| Push gateway | Encrypted events reach `matrixPushGateway` without `content.body`. | Already handled — falls back to "Neue Nachricht". Optionally switch the pusher to `event_id_only` format. |
| Admin CFs | `getRoomDetails` / `getAllMembersFromRoom` / rename / delete operate on **state** — unaffected. Synapse admin can no longer read message *content* (that's the point). | None. |
| Report-message feature | Works — the reporter's client sends the *decrypted* body to the support room. | Make the support room encrypted too. |
| Video calls | `m.call.*` signaling is encrypted in encrypted rooms; the SDK handles it transparently. | Test once. |
| Unverified devices | js-sdk default encrypts to all devices of all members without blocking on verification. | Keep the default; device verification UX is a later, optional hardening step. |
| `clearStoredCredentials()` on token expiry | Currently nukes localStorage and re-logins; with Step 0's device reuse + Step 1's persistent stores this becomes a cheap re-auth instead of a crypto reset. | Covered by Steps 0–1. |

### Step 8 — Rollout order & test checklist

Order: **Step 0 (auth) → 1 (stores) → 2–3 (client crypto) deployed dark → 4 (new rooms encrypted) → 6 (backup) → 5 (migrate existing) →** monitoring.

Minimum test matrix before migrating real rooms:

- [ ] two browsers, same user: both decrypt new messages; second browser restores history via recovery key
- [ ] two different users in one encrypted group room (incl. one force-joined via CF *after* messages were sent — verify the expected "no old history" behavior)
- [ ] token expiry → re-login reuses the device and history stays decryptable
- [ ] logout/login cycle does not wipe the crypto store for the same user
- [ ] push notification arrives for an encrypted message (generic body)
- [ ] poll create/vote/end, reactions, edits, redactions, file/image send in an encrypted room
- [ ] video call in an encrypted DM
- [ ] Element (web) as a second client decrypts the same rooms — good independent verification

**Effort estimate:** Step 0 is the bulk (CF + login flow + etke.host coordination); Steps 1–4 are mostly localized to `MatrixChatService`; Step 6's escrow needs a small Firestore-rules addition. Realistic scope: a focused week, *after* the Section 7 items 1–6 are done.

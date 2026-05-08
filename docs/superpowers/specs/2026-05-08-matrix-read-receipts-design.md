# Matrix Read Receipts — Implementation Design

**Date:** 2026-05-08
**Status:** Approved

## Overview

Implement Element-style read receipts in the Matrix chat frontend: small user avatars displayed below each message to show who has read it. Tapping the avatar strip opens an Ionic popover with reader names and timestamps.

**Scope:**

- Display `m.read` receipts per message (main timeline only, no threads)
- Room-level sending only — keep existing `markRoomAsRead` (no per-message IntersectionObserver)
- New standalone `bk-matrix-read-receipt-strip` component (not reusing `bk-avatar-display`)
- No user setting for disabling receipts

---

## 1. Data Model

**File:** `libs/shared/models/src/lib/chat.model.ts`

Add one new interface. No changes to `MatrixMessage`.

```typescript
export interface MatrixReadReceipt {
  userId: string;
  displayName: string;
  avatarUrl?: string;  // HTTP URL resolved via mxcUrlToHttp (18×18 crop)
  ts: number;          // epoch ms
}
```

Export it from `libs/shared/models/src/index.ts` alongside the existing chat model exports.

---

## 2. Service Layer

**File:** `libs/chat/data-access/src/lib/matrix-chat.service.ts`

### 2.1 New private state

```typescript
private readonly receipts$ = new Map<string, BehaviorSubject<Map<string, MatrixReadReceipt[]>>>();
```

Keyed by `roomId`. Each value is a `BehaviorSubject` emitting `Map<eventId, MatrixReadReceipt[]>` — the set of users whose current read receipt points exactly to that `eventId`.

### 2.2 New public method

```typescript
public getReadReceiptsForRoom(roomId: string): Observable<Map<string, MatrixReadReceipt[]>>
```

- Lazily creates the `BehaviorSubject` on first call (same pattern as `messages$`)
- Immediately calls `buildAndEmitReceipts` so the first emission is populated
- Returns `subject.asObservable()`

### 2.3 New private method

```typescript
private buildAndEmitReceipts(room: Room): void
```

Algorithm:

1. Get current user ID; skip if unavailable
2. Iterate `room.getMembers()`; skip current user and non-`join` members
3. For each member call `room.getReadReceiptForUserId(userId)` — returns `{ eventId, data: { ts } } | null`
4. Resolve avatar: `this.client.mxcUrlToHttp(member.getMxcAvatarUrl(), 18, 18, 'crop', true)` (profile avatars are publicly accessible; no auth fetch needed)
5. Group into `Map<eventId, MatrixReadReceipt[]>`
6. Emit on the room's subject (no-op if subject doesn't exist yet)

### 2.4 Updated event handlers

**`RoomEvent.Receipt` handler** (currently at line 357):

```typescript
this.client.on(RoomEvent.Receipt, (_event, room) => {
  this.roomsUpdateTrigger$.next();
  if (room) this.buildAndEmitReceipts(room);  // ← add
});
```

**`ClientEvent.Sync` — PREPARED branch**: after `updateRoomsList()`, call `buildAndEmitReceipts` for each room that already has an active subject in `receipts$` (i.e. rooms the user has opened in this session). Rooms with no subject are skipped — `getReadReceiptsForRoom` will trigger the build on first subscription.

### 2.5 Cleanup

In `disconnect()`: clear `receipts$` (call `.clear()`) alongside `messages$` and `_mediaCache`.

---

## 3. Store Layer

**File:** `libs/chat/feature/src/lib/matrix-chat.store.ts`

### 3.1 New `rxResource` in `withProps`

```typescript
receiptsResource: rxResource({
  params: () => ({
    currentRoomId: store.currentRoomId(),
    isMatrixInitialized: store.isMatrixInitialized(),
  }),
  stream: ({ params }) => {
    const { currentRoomId, isMatrixInitialized } = params;
    if (!currentRoomId || !isMatrixInitialized) return of(new Map());
    return store.matrixService.getReadReceiptsForRoom(currentRoomId);
  },
}),
```

### 3.2 New computed signal in `withComputed`

```typescript
receiptsByEventId: computed(() =>
  state.receiptsResource.value() ?? new Map<string, MatrixReadReceipt[]>()
),
```

No new store methods — receipts are read-only derived state.

---

## 4. New UI Component

**File:** `libs/chat/ui/src/lib/matrix-read-receipt-strip.ts`

```text
selector: bk-matrix-read-receipt-strip
```

### Inputs

- `receipts = input<MatrixReadReceipt[]>([])` — already-resolved receipt list for one message

### Visual

- Up to 4 circular avatars (18×18 px), stacked horizontally with `margin-left: -4px` overlap
- Initial-letter fallback circle if `avatarUrl` is absent (colored by a hash of `userId`)
- `+N` pill after the avatars if `receipts.length > 4`
- Flushed right, below the message timestamp, inside `.message-content`
- Only rendered when `receipts.length > 0`

### Interaction

- On tap: opens `IonPopover` (Ionic standalone) listing each reader:
  - 18px avatar or initial
  - Display name
  - Timestamp: `"Gelesen HH:mm"` (German locale, `de-DE`)
- Popover dismisses on backdrop tap

### Accessibility

Host element: `role="img"` with `[attr.aria-label]` computed as:

- 1 reader: `"Gelesen von Alice"`
- 2 readers: `"Gelesen von Alice, Bob"`
- 3+: `"Gelesen von Alice, Bob (+N weitere)"`

### Imports

Only Ionic standalone: `IonPopover`, `IonAvatar`, `IonList`, `IonItem`, `IonLabel`. No dependency on `bk-avatar-display` or `AvatarPipe`.

---

## 5. Message List & Feature Wiring

### 5.1 `MatrixMessageList` (`libs/chat/ui/src/lib/matrix-message-list.ts`)

**New input:**

```typescript
receiptsByEventId = input<Map<string, MatrixReadReceipt[]>>(new Map());
```

**Template change** — after `.message-timestamp` div, inside each non-notice message row (both regular messages and image batch rows):

```html
@if (receiptsByEventId().get(item.eventId); as receipts) {
  <bk-matrix-read-receipt-strip [receipts]="receipts" />
}
```

Add `MatrixReadReceiptStrip` to the component's `imports` array.

### 5.2 Feature component (`libs/chat/feature/src/lib/matrix-chat.ts`)

Pass the new signal to the message list:

```html
<bk-matrix-message-list
  ...
  [receiptsByEventId]="store.receiptsByEventId()"
/>
```

### 5.3 Exports

- Add `MatrixReadReceiptStrip` to `libs/chat/ui/src/index.ts`
- Add `MatrixReadReceipt` to `libs/shared/models/src/index.ts`

---

## 6. Edge Cases

| Situation | Behaviour |
| --- | --- |
| Current user's own receipt | Skipped in `buildAndEmitReceipts` |
| Member with no avatar | Initial letter shown in colored fallback circle |
| Member not `join` | Skipped |
| No receipts for a message | Strip not rendered (empty `@if` guard) |
| Room with 0 other members | Empty map emitted — no strips shown |
| Disconnect / room switch | `receipts$` cleared on disconnect; `rxResource` re-subscribes on room change |
| `mxcUrlToHttp` returns null | `avatarUrl` left `undefined`; initial fallback renders |

---

## 7. Files Changed

| File | Change |
| --- | --- |
| `libs/shared/models/src/lib/chat.model.ts` | Add `MatrixReadReceipt` interface |
| `libs/shared/models/src/index.ts` | Export `MatrixReadReceipt` |
| `libs/chat/data-access/src/lib/matrix-chat.service.ts` | `receipts$` map, `getReadReceiptsForRoom`, `buildAndEmitReceipts`, updated `RoomEvent.Receipt` and PREPARED handlers, `disconnect` cleanup |
| `libs/chat/feature/src/lib/matrix-chat.store.ts` | `receiptsResource`, `receiptsByEventId` computed |
| `libs/chat/ui/src/lib/matrix-read-receipt-strip.ts` | New component |
| `libs/chat/ui/src/index.ts` | Export new component |
| `libs/chat/ui/src/lib/matrix-message-list.ts` | New input, strip rendered per message |
| `libs/chat/feature/src/lib/matrix-chat.ts` | Wire `receiptsByEventId` to message list |

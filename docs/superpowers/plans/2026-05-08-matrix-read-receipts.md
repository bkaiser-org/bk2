# Matrix Read Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display Element-style read receipt avatars below each message in the Matrix chat, populated from `m.read` ephemeral events received during sync.

**Architecture:** A per-room `BehaviorSubject<Map<eventId, MatrixReadReceipt[]>>` in `MatrixChatService` is rebuilt whenever `RoomEvent.Receipt` fires. The store wraps it in an `rxResource` and exposes a `receiptsByEventId` computed signal. A new `bk-matrix-read-receipt-strip` component renders up to 4 circular avatars per message; tapping opens an Ionic popover with reader details.

**Tech Stack:** Angular 20 signals, NgRx Signal Store, `matrix-js-sdk` (`Room.getReadReceiptForUserId`), Ionic Angular standalone (`IonPopover`), Vitest for utility tests.

---

## File Map

| File | Action |
| --- | --- |
| `libs/shared/models/src/lib/chat.model.ts` | Add `MatrixReadReceipt` interface |
| `libs/chat/util/src/lib/chat.util.ts` | Add `buildReceiptAriaLabel`, `hashUserIdToColor`, `formatReceiptTime` |
| `libs/chat/util/src/lib/chat.util.spec.ts` | New — unit tests for the three functions above |
| `libs/chat/data-access/src/lib/matrix-chat.service.ts` | Add `receipts$`, `getReadReceiptsForRoom`, `buildAndEmitReceipts`; update `RoomEvent.Receipt` and PREPARED handlers; clear on `disconnect` |
| `libs/chat/feature/src/lib/matrix-chat.store.ts` | Add `receiptsResource` in `withProps`; add `receiptsByEventId` in `withComputed` |
| `libs/chat/ui/src/lib/matrix-read-receipt-strip.ts` | New — `bk-matrix-read-receipt-strip` component |
| `libs/chat/ui/src/index.ts` | Export `MatrixReadReceiptStrip` |
| `libs/chat/ui/src/lib/matrix-message-list.ts` | Add `receiptsByEventId` input; render strip per message |
| `libs/chat/feature/src/lib/matrix-chat.ts` | Add `receiptsByEventId()` computed; pass to main message list only |

---

## Task 1: Add `MatrixReadReceipt` type and utility functions (TDD)

**Files:**

- Modify: `libs/shared/models/src/lib/chat.model.ts`
- Modify: `libs/chat/util/src/lib/chat.util.ts`
- Create: `libs/chat/util/src/lib/chat.util.spec.ts`

- [ ] **Step 1.1: Add `MatrixReadReceipt` to the shared model**

In `libs/shared/models/src/lib/chat.model.ts`, add after the `MatrixMessage` interface:

```typescript
export interface MatrixReadReceipt {
  userId: string;
  displayName: string;
  avatarUrl?: string;  // HTTP URL (18×18 crop via mxcUrlToHttp), may be undefined
  ts: number;          // epoch ms from the receipt event
}
```

No change to `libs/shared/models/src/index.ts` — it already does `export * from './lib/chat.model'`.

- [ ] **Step 1.2: Write failing tests for the three utility functions**

Create `libs/chat/util/src/lib/chat.util.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildReceiptAriaLabel, hashUserIdToColor, formatReceiptTime } from './chat.util';

describe('buildReceiptAriaLabel', () => {
  it('returns empty string for no receipts', () => {
    expect(buildReceiptAriaLabel([])).toBe('');
  });

  it('returns single name for one receipt', () => {
    expect(buildReceiptAriaLabel([{ displayName: 'Alice' }])).toBe('Gelesen von Alice');
  });

  it('returns two names for two receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
    ])).toBe('Gelesen von Alice, Bob');
  });

  it('returns overflow notation for three or more receipts', () => {
    expect(buildReceiptAriaLabel([
      { displayName: 'Alice' },
      { displayName: 'Bob' },
      { displayName: 'Carol' },
    ])).toBe('Gelesen von Alice, Bob (+1 weitere)');
  });

  it('counts overflow correctly for five receipts', () => {
    const receipts = ['Alice','Bob','Carol','Dave','Eve'].map(n => ({ displayName: n }));
    expect(buildReceiptAriaLabel(receipts)).toBe('Gelesen von Alice, Bob (+3 weitere)');
  });
});

describe('hashUserIdToColor', () => {
  it('returns a hex color string', () => {
    expect(hashUserIdToColor('@alice:example.org')).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('returns a consistent color for the same userId', () => {
    const userId = '@alice:example.org';
    expect(hashUserIdToColor(userId)).toBe(hashUserIdToColor(userId));
  });

  it('returns a value from the fixed palette (one of 8 colors)', () => {
    const COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];
    expect(COLORS).toContain(hashUserIdToColor('@alice:example.org'));
  });
});

describe('formatReceiptTime', () => {
  it('includes "Gelesen" prefix', () => {
    expect(formatReceiptTime(1700000000000)).toContain('Gelesen');
  });

  it('includes HH:mm time pattern', () => {
    expect(formatReceiptTime(1700000000000)).toMatch(/\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 1.3: Run tests to confirm they fail**

```bash
pnpm run test chat-util
```

Expected: test runner reports failures because `buildReceiptAriaLabel`, `hashUserIdToColor`, `formatReceiptTime` are not yet exported.

- [ ] **Step 1.4: Implement the three functions**

In `libs/chat/util/src/lib/chat.util.ts`, add at the end of the file:

```typescript
const RECEIPT_COLORS = ['#e57373','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#ffb74d'];

export function buildReceiptAriaLabel(receipts: Array<{ displayName: string }>): string {
  if (receipts.length === 0) return '';
  if (receipts.length === 1) return `Gelesen von ${receipts[0].displayName}`;
  if (receipts.length === 2) return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName}`;
  return `Gelesen von ${receipts[0].displayName}, ${receipts[1].displayName} (+${receipts.length - 2} weitere)`;
}

export function hashUserIdToColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return RECEIPT_COLORS[Math.abs(hash) % RECEIPT_COLORS.length];
}

export function formatReceiptTime(ts: number): string {
  return `Gelesen ${new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
```

- [ ] **Step 1.5: Run tests to confirm they pass**

```bash
pnpm run test chat-util
```

Expected: all tests pass.

- [ ] **Step 1.6: Type-check**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/chat/util/tsconfig.json
```

Expected: no errors.

- [ ] **Step 1.7: Commit**

```bash
git add libs/shared/models/src/lib/chat.model.ts \
        libs/chat/util/src/lib/chat.util.ts \
        libs/chat/util/src/lib/chat.util.spec.ts
git commit -m "feat(chat): add MatrixReadReceipt type and receipt utility functions"
```

---

## Task 2: Add receipt state and methods to `MatrixChatService`

**Files:**

- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts`

- [ ] **Step 2.1: Add the `receipts$` map and import `MatrixReadReceipt`**

At the top of `libs/chat/data-access/src/lib/matrix-chat.service.ts`, update the models import (currently line 10):

```typescript
import { MatrixConfig, MatrixMessage, MatrixReadReceipt, MatrixRoom, TypingNotification } from '@bk2/shared-models';
```

Add the `receipts$` field in the class body, after the `typingByRoom` declaration (currently around line 37):

```typescript
private readonly receipts$ = new Map<string, BehaviorSubject<Map<string, MatrixReadReceipt[]>>>();
```

- [ ] **Step 2.2: Add `getReadReceiptsForRoom` public method**

Add this method after `getMessagesForRoom` (around line 451):

```typescript
public getReadReceiptsForRoom(roomId: string): Observable<Map<string, MatrixReadReceipt[]>> {
  if (!this.receipts$.has(roomId)) {
    this.receipts$.set(roomId, new BehaviorSubject<Map<string, MatrixReadReceipt[]>>(new Map()));
    const room = this.client?.getRoom(roomId);
    if (room) this.buildAndEmitReceipts(room);
  }
  return this.receipts$.get(roomId)!.asObservable();
}
```

- [ ] **Step 2.3: Add `buildAndEmitReceipts` private method**

Add this method directly after `getReadReceiptsForRoom`:

```typescript
private buildAndEmitReceipts(room: Room): void {
  const currentUserId = this.getCurrentUserId();
  if (!currentUserId || !this.client) return;
  const subject = this.receipts$.get(room.roomId);
  if (!subject) return;

  const result = new Map<string, MatrixReadReceipt[]>();
  for (const member of room.getMembers()) {
    if (member.userId === currentUserId) continue;
    if (member.membership !== 'join') continue;
    const receipt = room.getReadReceiptForUserId(member.userId);
    if (!receipt) continue;
    const mxcUrl = (member as any)?.getMxcAvatarUrl?.() as string | undefined;
    const avatarUrl = mxcUrl
      ? (this.client.mxcUrlToHttp(mxcUrl, 18, 18, 'crop', true) ?? undefined)
      : undefined;
    const entry: MatrixReadReceipt = {
      userId: member.userId,
      displayName: member.rawDisplayName || member.userId.split(':')[0].substring(1),
      avatarUrl,
      ts: receipt.data.ts,
    };
    const list = result.get(receipt.eventId) ?? [];
    list.push(entry);
    result.set(receipt.eventId, list);
  }
  subject.next(result);
}
```

- [ ] **Step 2.4: Update `RoomEvent.Receipt` handler**

Find the existing handler (currently around line 357):

```typescript
// before:
this.client.on(RoomEvent.Receipt, () => {
  this.roomsUpdateTrigger$.next();
});

// after:
this.client.on(RoomEvent.Receipt, (_event: MatrixEvent, room: Room) => {
  this.roomsUpdateTrigger$.next();
  if (room) this.buildAndEmitReceipts(room);
});
```

- [ ] **Step 2.5: Update PREPARED sync handler**

Find the PREPARED branch in `ClientEvent.Sync` (currently around line 261). Update the `.then()` callback:

```typescript
// before:
this.repairDmRoomsAccountData().then(() => this.updateRoomsList());

// after:
this.repairDmRoomsAccountData().then(() => {
  this.updateRoomsList();
  for (const [roomId] of this.receipts$) {
    const room = this.client?.getRoom(roomId);
    if (room) this.buildAndEmitReceipts(room);
  }
});
```

- [ ] **Step 2.6: Clear receipts in `disconnect`**

In the `disconnect()` method, add `this.receipts$.clear();` alongside the other cleanup calls. Place it after `this.typingByRoom.clear();` (currently around line 228):

```typescript
this.typingByRoom.clear();
this.receipts$.clear();  // ← add
```

- [ ] **Step 2.7: Type-check**

```bash
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 2.8: Commit**

```bash
git add libs/chat/data-access/src/lib/matrix-chat.service.ts
git commit -m "feat(chat): add read receipt state and methods to MatrixChatService"
```

---

## Task 3: Wire receipts into `MatrixChatStore`

**Files:**

- Modify: `libs/chat/feature/src/lib/matrix-chat.store.ts`

- [ ] **Step 3.1: Add `MatrixReadReceipt` to the models import**

Update the models import (currently around line 11):

```typescript
// before:
import { MatrixAuthToken, MatrixMessage, MatrixRoom, MatrixUser, ROOM_SHAPE } from '@bk2/shared-models';

// after:
import { MatrixAuthToken, MatrixMessage, MatrixReadReceipt, MatrixRoom, MatrixUser, ROOM_SHAPE } from '@bk2/shared-models';
```

- [ ] **Step 3.2: Add `receiptsResource` in `withProps`**

In the second `withProps` block (the one that uses `store`), add after the `typingResource` declaration:

```typescript
receiptsResource: rxResource({
  params: () => ({
    currentRoomId: store.currentRoomId(),
    isMatrixInitialized: store.isMatrixInitialized(),
  }),
  stream: ({ params }) => {
    const { currentRoomId, isMatrixInitialized } = params;
    if (!currentRoomId || !isMatrixInitialized) return of(new Map<string, MatrixReadReceipt[]>());
    return store.matrixService.getReadReceiptsForRoom(currentRoomId);
  },
}),
```

- [ ] **Step 3.3: Add `receiptsByEventId` computed signal**

In the first `withComputed` block, add after the `isMessagesLoading` computed:

```typescript
receiptsByEventId: computed(() =>
  state.receiptsResource.value() ?? new Map<string, MatrixReadReceipt[]>()
),
```

- [ ] **Step 3.4: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3.5: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.store.ts
git commit -m "feat(chat): expose receiptsByEventId signal in MatrixChatStore"
```

---

## Task 4: Create `bk-matrix-read-receipt-strip` component

**Files:**

- Create: `libs/chat/ui/src/lib/matrix-read-receipt-strip.ts`
- Modify: `libs/chat/ui/src/index.ts`

- [ ] **Step 4.1: Create the component**

Create `libs/chat/ui/src/lib/matrix-read-receipt-strip.ts`:

```typescript
import { Component, computed, input, signal } from '@angular/core';
import { IonAvatar, IonItem, IonLabel, IonList, IonPopover } from '@ionic/angular/standalone';

import { MatrixReadReceipt } from '@bk2/shared-models';
import { buildReceiptAriaLabel, hashUserIdToColor, formatReceiptTime } from '@bk2/chat-util';

@Component({
  selector: 'bk-matrix-read-receipt-strip',
  standalone: true,
  imports: [IonPopover, IonList, IonItem, IonLabel, IonAvatar],
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
  },
  styles: [`
    :host {
      display: flex;
      justify-content: flex-end;
      margin-top: 2px;
    }

    .receipt-strip {
      display: flex;
      align-items: center;
      cursor: pointer;
    }

    .receipt-avatar {
      width: 18px;
      height: 18px;
      margin-left: -4px;
      border-radius: 50%;
      overflow: hidden;
      border: 1px solid var(--ion-background-color, #fff);
      flex-shrink: 0;
    }

    .receipt-avatar:first-child {
      margin-left: 0;
    }

    .receipt-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .receipt-initial {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 600;
      color: #fff;
    }

    .receipt-overflow {
      font-size: 0.65rem;
      color: var(--ion-color-medium);
      margin-left: 3px;
    }

    .popover-avatar-img {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
    }

    .popover-initial {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: #fff;
    }

    .popover-name {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .popover-time {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    <div class="receipt-strip" (click)="openPopover($event)">
      @for (r of visibleReceipts(); track r.userId) {
        <div class="receipt-avatar">
          @if (r.avatarUrl) {
            <img [src]="r.avatarUrl" [alt]="r.displayName" />
          } @else {
            <div class="receipt-initial" [style.background-color]="color(r.userId)">
              {{ r.displayName.charAt(0).toUpperCase() }}
            </div>
          }
        </div>
      }
      @if (overflowCount() > 0) {
        <span class="receipt-overflow">+{{ overflowCount() }}</span>
      }
    </div>

    <ion-popover
      [isOpen]="popoverOpen()"
      [event]="popoverEvent()"
      (didDismiss)="popoverOpen.set(false)"
    >
      <ng-template>
        <ion-list lines="none">
          @for (r of receipts(); track r.userId) {
            <ion-item>
              <ion-avatar slot="start">
                @if (r.avatarUrl) {
                  <img [src]="r.avatarUrl" [alt]="r.displayName" class="popover-avatar-img" />
                } @else {
                  <div class="popover-initial" [style.background-color]="color(r.userId)">
                    {{ r.displayName.charAt(0).toUpperCase() }}
                  </div>
                }
              </ion-avatar>
              <ion-label>
                <p class="popover-name">{{ r.displayName }}</p>
                <p class="popover-time">{{ formatTime(r.ts) }}</p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      </ng-template>
    </ion-popover>
  `,
})
export class MatrixReadReceiptStrip {
  public receipts = input<MatrixReadReceipt[]>([]);

  protected readonly popoverOpen = signal(false);
  protected readonly popoverEvent = signal<Event | undefined>(undefined);

  protected readonly visibleReceipts = computed(() => this.receipts().slice(0, 4));
  protected readonly overflowCount = computed(() => Math.max(0, this.receipts().length - 4));
  protected readonly ariaLabel = computed(() => buildReceiptAriaLabel(this.receipts()));

  protected openPopover(event: Event): void {
    this.popoverEvent.set(event);
    this.popoverOpen.set(true);
  }

  protected color(userId: string): string {
    return hashUserIdToColor(userId);
  }

  protected formatTime(ts: number): string {
    return formatReceiptTime(ts);
  }
}
```

- [ ] **Step 4.2: Export from `libs/chat/ui/src/index.ts`**

Add the new export at the end of `libs/chat/ui/src/index.ts`:

```typescript
export * from './lib/matrix-read-receipt-strip';
```

- [ ] **Step 4.3: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4.4: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-read-receipt-strip.ts \
        libs/chat/ui/src/index.ts
git commit -m "feat(chat): add bk-matrix-read-receipt-strip component"
```

---

## Task 5: Update `MatrixMessageList` to render receipt strips

**Files:**

- Modify: `libs/chat/ui/src/lib/matrix-message-list.ts`

- [ ] **Step 5.1: Add `MatrixReadReceipt` to models import and add `MatrixReadReceiptStrip` to imports**

In `libs/chat/ui/src/lib/matrix-message-list.ts`:

Update the models import (currently line 6):

```typescript
// before:
import { MatrixMessage } from '@bk2/shared-models';

// after:
import { MatrixMessage, MatrixReadReceipt } from '@bk2/shared-models';
```

Add `MatrixReadReceiptStrip` to the component imports array and to the top-level import statement. The component already imports from `@bk2/chat-ui` — but since `MatrixReadReceiptStrip` is in the same `chat-ui` library, import it directly:

```typescript
import { MatrixReadReceiptStrip } from './matrix-read-receipt-strip';
```

Add `MatrixReadReceiptStrip` to the `imports` array in the `@Component` decorator.

- [ ] **Step 5.2: Add `receiptsByEventId` input**

In the component class body, after the existing inputs, add:

```typescript
receiptsByEventId = input<Map<string, MatrixReadReceipt[]>>(new Map());
```

- [ ] **Step 5.3: Add receipt strip to regular message rows**

In the template, find the `.message-timestamp` div inside the regular message row (the `@else` branch, around line 431):

```html
<!-- before: -->
<div class="message-timestamp">{{ formatTime(item.timestamp) }}</div>

<!-- after: -->
<div class="message-timestamp">{{ formatTime(item.timestamp) }}</div>
@if (receiptsByEventId().get(item.eventId); as receipts) {
  <bk-matrix-read-receipt-strip [receipts]="receipts" />
}
```

- [ ] **Step 5.4: Add receipt strip to image batch rows**

Find the `.message-timestamp` div inside the image batch row (the `@if (isBatch(item))` branch, around line 346):

```html
<!-- before: -->
<div class="message-timestamp">
  {{ item.messages.length > 1 ? item.messages.length + ' Bilder · ' : '' }}{{ formatTime(item.timestamp) }}
</div>

<!-- after: -->
<div class="message-timestamp">
  {{ item.messages.length > 1 ? item.messages.length + ' Bilder · ' : '' }}{{ formatTime(item.timestamp) }}
</div>
@if (receiptsByEventId().get(item.eventId); as receipts) {
  <bk-matrix-read-receipt-strip [receipts]="receipts" />
}
```

Note: for image batches use `item.eventId` which resolves to `item.messages[0].eventId` via the `ImageBatchGroup.eventId` getter — verify this is the correct event ID for the batch. If `ImageBatchGroup` does not expose `eventId` directly, use `item.messages[0].eventId`.

- [ ] **Step 5.5: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5.6: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-list.ts
git commit -m "feat(chat): render read receipt strip per message in MatrixMessageList"
```

---

## Task 6: Wire `receiptsByEventId` into the feature component

**Files:**

- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

- [ ] **Step 6.1: Add `receiptsByEventId` computed signal**

In `libs/chat/feature/src/lib/matrix-chat.ts`, find the existing computed signals near the bottom of the class (around line 538). Add:

```typescript
protected readonly receiptsByEventId = computed(() => this.store.receiptsByEventId());
```

- [ ] **Step 6.2: Pass to the main message list**

Find the first `<bk-matrix-message-list>` element (around line 358) — the main timeline one. Add the input binding:

```html
<bk-matrix-message-list
  [messages]="messages()"
  [currentUserId]="matrixUserId()"
  [homeserverUrl]="homeserverUrl()"
  [typingUsers]="typingUsers()"
  [threadReplyCounts]="threadReplyCounts()"
  [receiptsByEventId]="receiptsByEventId()"
  (messageClicked)="onMessageClicked($event)"
  (imageClicked)="onImageClicked($event)"
  (fileClicked)="onFileClicked($event)"
  (reactionClicked)="onReactionClicked($event)"
  (threadClicked)="onThreadClicked($event)"
  (pollVoteClicked)="onPollVoteClicked($event)"
  (pollEndClicked)="onPollEndClicked($event)"
/>
```

Do **not** add `[receiptsByEventId]` to the second `<bk-matrix-message-list>` (the thread panel around line 439) — receipts are main-timeline only per the spec.

- [ ] **Step 6.3: Type-check all affected libs**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
```

Expected: no errors in any lib.

- [ ] **Step 6.4: Run all chat util tests**

```bash
pnpm run test chat-util
```

Expected: all tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "feat(chat): wire receiptsByEventId to main message list in MatrixChatOverview"
```

---

## Self-Review Checklist (already run — issues fixed inline)

- `MatrixReadReceipt` defined in Task 1, used consistently in Tasks 2–6 ✓
- `buildAndEmitReceipts` no-ops if subject not in `receipts$` map (safe to call from PREPARED handler) ✓
- `getReadReceiptsForRoom` creates the subject before calling `buildAndEmitReceipts` ✓
- Thread message list does NOT receive `receiptsByEventId` (spec: main timeline only) ✓
- Image batch rows use `item.eventId` — note in Step 5.4 to verify the getter ✓
- `of` already imported in the store file (`import { of, switchMap } from 'rxjs'`) ✓
- `receipts$.clear()` in `disconnect()` mirrors the `_mediaCache` and `typingByRoom` cleanup pattern ✓

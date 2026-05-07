# Chat Image Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a thumbnail preview strip in the composer before sending, batch multiple drag-dropped images into one bubble in the message list, and open a navigable lightbox when a thumbnail is clicked.

**Architecture:** `groupMessages()` (pure function in `chat-util`) collapses consecutive same-sender image events within 5 s into `ImageBatchGroup` objects; the message list renders these as a flex-wrap grid; `MatrixMessageInput` receives `pendingImages` as an input and queues images before sending; `matrix-chat.ts` drives the signal and opens an `ImageLightboxModal` on click.

**Tech Stack:** Angular 20 signals, `linkedSignal`, Ionic standalone modals, `@bk2/shared-util-angular` `downloadToBrowser`

---

## File Map

| File | Action |
|------|--------|
| `libs/chat/util/src/lib/group-messages.util.ts` | **Create** — `ImageBatchGroup`, `MessageOrBatch`, `groupMessages()` |
| `libs/chat/util/src/lib/group-messages.util.spec.ts` | **Create** — unit tests |
| `libs/chat/util/src/index.ts` | **Modify** — export new util |
| `libs/chat/ui/src/lib/matrix-message-list.ts` | **Modify** — import grouping, update template + output type |
| `libs/chat/ui/src/lib/image-lightbox.modal.ts` | **Create** — lightbox Ionic modal |
| `libs/chat/ui/src/index.ts` | **Modify** — export lightbox modal |
| `libs/chat/ui/src/lib/matrix-message-input.ts` | **Modify** — `pendingImages` input, thumbnail strip, new outputs |
| `libs/chat/feature/src/lib/matrix-chat.ts` | **Modify** — `pendingImages` signal, drop/queue handlers, lightbox opener |

---

## Task 1 — `groupMessages()` utility

**Files:**
- Create: `libs/chat/util/src/lib/group-messages.util.ts`
- Create: `libs/chat/util/src/lib/group-messages.util.spec.ts`
- Modify: `libs/chat/util/src/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `libs/chat/util/src/lib/group-messages.util.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { groupMessages, ImageBatchGroup } from './group-messages.util';
import { MatrixMessage } from '@bk2/shared-models';

let idSeq = 0;
function msg(overrides: Partial<MatrixMessage> = {}): MatrixMessage {
  return {
    eventId: `evt-${++idSeq}`,
    roomId: 'room1',
    sender: '@alice:server',
    senderName: 'Alice',
    senderAvatar: undefined,
    body: 'image.jpg',
    timestamp: 1000,
    type: 'm.image',
    content: { msgtype: 'm.image', url: 'mxc://example/abc' },
    mediaUrl: 'blob:url',
    isRedacted: false,
    isEdited: false,
    ...overrides,
  };
}

describe('groupMessages', () => {
  it('wraps a single image in a batch of one', () => {
    const result = groupMessages([msg()]);
    expect((result[0] as ImageBatchGroup).kind).toBe('image-batch');
    expect((result[0] as ImageBatchGroup).messages).toHaveLength(1);
  });

  it('groups two images from the same sender within 5 s', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 5000 })]);
    expect(result).toHaveLength(1);
    expect((result[0] as ImageBatchGroup).messages).toHaveLength(2);
  });

  it('splits images from the same sender more than 5 s apart', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 7000 })]);
    expect(result).toHaveLength(2);
  });

  it('does not group images from different senders', () => {
    const result = groupMessages([
      msg({ sender: '@alice:server', timestamp: 1000 }),
      msg({ sender: '@bob:server', timestamp: 1001 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('passes non-image messages through unchanged', () => {
    const m = msg({ type: 'm.text', content: { msgtype: 'm.text', body: 'hello' } });
    const result = groupMessages([m]);
    expect(result).toHaveLength(1);
    expect('kind' in result[0]).toBe(false);
    expect(result[0]).toBe(m);
  });

  it('groups m.file with image mimetype', () => {
    const m = msg({ type: 'm.file', content: { msgtype: 'm.file', info: { mimetype: 'image/png' } } });
    const result = groupMessages([m]);
    expect((result[0] as ImageBatchGroup).kind).toBe('image-batch');
  });

  it('does not group m.file with non-image mimetype', () => {
    const m = msg({ type: 'm.file', content: { msgtype: 'm.file', info: { mimetype: 'application/pdf' } } });
    const result = groupMessages([m]);
    expect('kind' in result[0]).toBe(false);
  });

  it('updates batch timestamp to the last image in the group', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 3000 })]);
    expect((result[0] as ImageBatchGroup).timestamp).toBe(3000);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm nx test chat-util --testFile=libs/chat/util/src/lib/group-messages.util.spec.ts
```

Expected: fail with "Cannot find module './group-messages.util'"

- [ ] **Step 3: Implement `group-messages.util.ts`**

Create `libs/chat/util/src/lib/group-messages.util.ts`:

```typescript
import { MatrixMessage } from '@bk2/shared-models';

export interface ImageBatchGroup {
  kind: 'image-batch';
  messages: MatrixMessage[];
  sender: string;
  senderName: string;
  senderAvatar: string | undefined;
  timestamp: number;
}

export type MessageOrBatch = MatrixMessage | ImageBatchGroup;

function isImageMessage(msg: MatrixMessage): boolean {
  if (msg.type === 'm.image') return true;
  if (msg.type === 'm.file' && (msg.content?.info?.mimetype as string | undefined)?.startsWith('image/')) return true;
  return false;
}

export function groupMessages(messages: MatrixMessage[]): MessageOrBatch[] {
  const result: MessageOrBatch[] = [];
  for (const msg of messages) {
    if (isImageMessage(msg)) {
      const last = result[result.length - 1];
      if (
        last &&
        'kind' in last &&
        last.kind === 'image-batch' &&
        last.sender === msg.sender &&
        msg.timestamp - last.timestamp <= 5000
      ) {
        last.messages.push(msg);
        last.timestamp = msg.timestamp;
      } else {
        result.push({
          kind: 'image-batch',
          messages: [msg],
          sender: msg.sender,
          senderName: msg.senderName,
          senderAvatar: msg.senderAvatar,
          timestamp: msg.timestamp,
        });
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm nx test chat-util --testFile=libs/chat/util/src/lib/group-messages.util.spec.ts
```

Expected: all 8 tests pass

- [ ] **Step 5: Export from `chat-util` index**

Add to `libs/chat/util/src/index.ts`:
```typescript
export * from './lib/group-messages.util';
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/chat/util/tsconfig.json
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add libs/chat/util/src/lib/group-messages.util.ts \
        libs/chat/util/src/lib/group-messages.util.spec.ts \
        libs/chat/util/src/index.ts
git commit -m "feat(chat): add groupMessages() utility for image batch grouping"
```

---

## Task 2 — Update `MatrixMessageList`

**Files:**
- Modify: `libs/chat/ui/src/lib/matrix-message-list.ts`

- [ ] **Step 1: Add CSS for image batch grid**

In the `styles: [...]` array of `MatrixMessageList`, append these rules after the existing `.message-image` rule:

```css
.image-batch-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.image-batch-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  cursor: pointer;
}
```

- [ ] **Step 2: Update imports and output type**

At the top of the file, add the import:
```typescript
import { groupMessages, ImageBatchGroup, MessageOrBatch } from '@bk2/chat-util';
```

Change the `imageClicked` output declaration (line 472):
```typescript
// Before:
imageClicked = output<MatrixMessage>();
// After:
imageClicked = output<{ message: MatrixMessage; group: MatrixMessage[] }>();
```

- [ ] **Step 3: Update `groupedMessages` computed**

Replace the existing `groupedMessages` computed (lines 481–507) with:

```typescript
groupedMessages = computed(() => {
  const messages = this.messages();
  const groups: { date: string; messages: MessageOrBatch[] }[] = [];

  let currentDate = '';
  let currentGroup: MatrixMessage[] = [];

  for (const message of messages) {
    const messageDate = this.formatDate(message.timestamp);
    if (messageDate !== currentDate) {
      if (currentGroup.length > 0) {
        groups.push({ date: currentDate, messages: groupMessages(currentGroup) });
      }
      currentDate = messageDate;
      currentGroup = [message];
    } else {
      currentGroup.push(message);
    }
  }
  if (currentGroup.length > 0) {
    groups.push({ date: currentDate, messages: groupMessages(currentGroup) });
  }
  return groups;
});
```

- [ ] **Step 4: Add helper methods**

Add these protected methods to the class body (after `isOwnMessage`):

```typescript
protected isBatch(item: MessageOrBatch): item is ImageBatchGroup {
  return 'kind' in item;
}

protected trackItem(item: MessageOrBatch): string {
  return this.isBatch(item) ? `batch-${item.sender}-${item.timestamp}` : item.eventId;
}

protected shouldHideAvatarForItem(item: MessageOrBatch, index: number, items: MessageOrBatch[]): boolean {
  const sender = item.sender;
  if (sender === this.currentUserId()) return true;
  if (index === 0) return false;
  const prev = items[index - 1];
  return prev.sender === sender && item.timestamp - prev.timestamp < 60000;
}

protected shouldShowSenderForItem(item: MessageOrBatch, index: number, items: MessageOrBatch[]): boolean {
  if (index === 0) return true;
  return items[index - 1].sender !== item.sender;
}
```

Note: both `MatrixMessage` and `ImageBatchGroup` have `.sender` and `.timestamp` at the top level, so these work for both types without casting.

- [ ] **Step 5: Update the template**

Replace the inner `@for` loop in the template. The current template at lines 298–450 iterates `@for (message of dayGroup.messages; track message.eventId)`. Replace that entire block with:

```html
@for (item of dayGroup.messages; track trackItem(item); let i = $index) {
  @if (isBatch(item)) {
    <!-- Image batch bubble -->
    <div class="message-row" [class.own-message]="item.sender === currentUserId()">
      <ion-avatar
        class="message-avatar"
        [class.hidden]="shouldHideAvatarForItem(item, i, dayGroup.messages)"
      >
        @if (item.senderAvatar) {
          <img [src]="item.senderAvatar" [alt]="item.senderName" />
        } @else {
          <div>{{ item.senderName.charAt(0) }}</div>
        }
      </ion-avatar>
      <div class="message-content">
        @if (item.sender !== currentUserId() && shouldShowSenderForItem(item, i, dayGroup.messages)) {
          <div class="message-sender">{{ item.senderName }}</div>
        }
        <div class="message-bubble">
          <div class="image-batch-grid">
            @for (msg of item.messages; track msg.eventId) {
              @if (msg.mediaUrl) {
                <img
                  [src]="msg.mediaUrl"
                  [alt]="msg.body"
                  class="image-batch-thumb"
                  (click)="imageClicked.emit({ message: msg, group: item.messages }); $event.stopPropagation()"
                />
              }
            }
          </div>
        </div>
        <div class="message-timestamp">
          {{ item.messages.length > 1 ? item.messages.length + ' Bilder · ' : '' }}{{ formatTime(item.timestamp) }}
        </div>
      </div>
    </div>
  } @else {
    @if (item.type === 'm.notice') {
      <div class="notice-row">
        <div class="notice-bubble">{{ item.body }} · {{ formatTime(item.timestamp) }}</div>
      </div>
    } @else {
      <div class="message-row" [class.own-message]="isOwnMessage(item)">
        <ion-avatar
          class="message-avatar"
          [class.hidden]="shouldHideAvatarForItem(item, i, dayGroup.messages)"
        >
          @if (item.senderAvatar) {
            <img [src]="item.senderAvatar" [alt]="item.senderName" />
          } @else {
            <div>{{ item.senderName.charAt(0) }}</div>
          }
        </ion-avatar>
        <div class="message-content">
          @if (!isOwnMessage(item) && shouldShowSenderForItem(item, i, dayGroup.messages)) {
            <div class="message-sender">{{ item.senderName }}</div>
          }
          <div
            class="message-bubble"
            [class.edited]="item.isEdited"
            [class.redacted]="item.isRedacted"
            (click)="messageClicked.emit(item)"
          >
            @if (item.isRedacted) {
              <p class="message-text">Message deleted</p>
            } @else {
              @switch (item.type) {
                @case ('m.text') {
                  @if (item.content.formatted_body) {
                    <p class="message-text" [innerHTML]="item.content.formatted_body"></p>
                  } @else {
                    <p class="message-text">{{ item.body }}</p>
                  }
                }
                @case ('m.file') {
                  @if (isAudioFile(item) && item.mediaUrl) {
                    <audio controls class="message-audio" [src]="item.mediaUrl" (click)="$event.stopPropagation()"></audio>
                  } @else {
                    <div class="message-file" (click)="fileClicked.emit(item); $event.stopPropagation()">
                      <ion-icon src="{{'document' | svgIcon}}"></ion-icon>
                      <span>{{ item.body }}</span>
                    </div>
                  }
                }
                @case ('m.location') {
                  <a
                    [href]="item.content.info?.maps_link || getGoogleMapsUrl(item)"
                    target="_blank"
                    class="message-location-map"
                    (click)="$event.stopPropagation()"
                  >
                    @if (getOsmTileData(item); as td) {
                      <div class="location-tile-wrapper">
                        <img [src]="td.url" [style.left.px]="td.offsetX" [style.top.px]="td.offsetY" alt="Karte" class="location-tile-img" />
                        <span class="location-pin">📍</span>
                      </div>
                    }
                    <div class="location-map-label">
                      <ion-icon src="{{'location' | svgIcon}}"></ion-icon>
                      <span>{{ item.body }}</span>
                    </div>
                  </a>
                }
                @case ('org.matrix.msc3381.poll.start') {
                  <bk-poll-message
                    [message]="item"
                    [currentUserId]="currentUserId() ?? ''"
                    (voteClicked)="pollVoteClicked.emit($event)"
                    (endPollClicked)="pollEndClicked.emit($event)"
                  />
                }
                @default {
                  <p class="message-text">{{ item.body }}</p>
                }
              }
            }
          </div>
          <div class="message-timestamp">{{ formatTime(item.timestamp) }}</div>
          @if (item.reactions && item.reactions.size > 0) {
            <div class="message-reactions">
              @for (reaction of getReactions(item); track reaction.emoji) {
                <ion-chip class="reaction-chip" (click)="reactionClicked.emit({ messageId: item.eventId, emoji: reaction.emoji })">
                  {{ reaction.emoji }} {{ reaction.count }}
                </ion-chip>
              }
            </div>
          }
          @if (threadReplyCounts().get(item.eventId); as replyCount) {
            <div class="thread-indicator" (click)="threadClicked.emit(item.eventId)">
              <ion-icon src="{{'chatbox' | svgIcon}}"></ion-icon>
              {{ replyCount }} {{ replyCount === 1 ? 'Antwort' : 'Antworten' }}
            </div>
          }
        </div>
      </div>
    }
  }
}
```

Note: The `m.image` case is intentionally removed from the switch — all images now flow through the batch path. The `m.file` case retains only audio and document rendering.

Also remove the old `shouldHideAvatar` and `shouldShowSender` methods (they are replaced by `shouldHideAvatarForItem` and `shouldShowSenderForItem`).

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Fix any errors before continuing.

- [ ] **Step 7: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-list.ts
git commit -m "feat(chat): add image batch grouping and grid rendering in message list"
```

---

## Task 3 — `ImageLightboxModal`

**Files:**
- Create: `libs/chat/ui/src/lib/image-lightbox.modal.ts`
- Modify: `libs/chat/ui/src/index.ts`

- [ ] **Step 1: Create the modal component**

Create `libs/chat/ui/src/lib/image-lightbox.modal.ts`:

```typescript
import { Component, computed, inject, input, linkedSignal } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader,
  IonIcon, IonTitle, IonToolbar, ModalController
} from '@ionic/angular/standalone';
import { downloadToBrowser } from '@bk2/shared-util-angular';
import { SvgIconPipe } from '@bk2/shared-pipes';

export interface LightboxImage {
  mediaUrl: string;
  filename: string;
}

@Component({
  selector: 'bk-image-lightbox-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    SvgIconPipe
  ],
  styles: [`
    ion-content { --background: #000; }
    .lightbox-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    ion-title { color: #fff; font-size: 0.9rem; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        @if (images().length > 1) {
          <ion-buttons slot="start">
            <ion-button [disabled]="currentIndex() === 0" (click)="prev()">
              <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
            </ion-button>
          </ion-buttons>
        }
        <ion-title>
          {{ currentImage().filename }}
          @if (images().length > 1) { ({{ currentIndex() + 1 }}/{{ images().length }}) }
        </ion-title>
        <ion-buttons slot="end">
          @if (images().length > 1) {
            <ion-button [disabled]="currentIndex() === images().length - 1" (click)="next()">
              <ion-icon slot="icon-only" name="chevron-forward"></ion-icon>
            </ion-button>
          }
          <ion-button (click)="download()">
            <ion-icon slot="icon-only" name="download-outline"></ion-icon>
          </ion-button>
          <ion-button (click)="close()">
            <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <img class="lightbox-img" [src]="currentImage().mediaUrl" [alt]="currentImage().filename" />
    </ion-content>
  `
})
export class ImageLightboxModal {
  private readonly modalController = inject(ModalController);

  images = input.required<LightboxImage[]>();
  initialIndex = input.required<number>();

  protected currentIndex = linkedSignal(() => this.initialIndex());
  protected currentImage = computed(() => this.images()[this.currentIndex()]);

  protected prev(): void {
    if (this.currentIndex() > 0) this.currentIndex.set(this.currentIndex() - 1);
  }

  protected next(): void {
    if (this.currentIndex() < this.images().length - 1) this.currentIndex.set(this.currentIndex() + 1);
  }

  protected async download(): Promise<void> {
    await downloadToBrowser(this.currentImage().mediaUrl);
  }

  protected async close(): Promise<void> {
    await this.modalController.dismiss();
  }
}
```

- [ ] **Step 2: Export from chat-ui index**

Add to `libs/chat/ui/src/index.ts`:
```typescript
export * from './lib/image-lightbox.modal';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add libs/chat/ui/src/lib/image-lightbox.modal.ts \
        libs/chat/ui/src/index.ts
git commit -m "feat(chat): add ImageLightboxModal with back/forward navigation"
```

---

## Task 4 — Update `MatrixMessageInput`

**Files:**
- Modify: `libs/chat/ui/src/lib/matrix-message-input.ts`

- [ ] **Step 1: Add CSS for the thumbnail preview strip**

In the `styles: [...]` array, append after the `.file-input` rule:

```css
/* ── Pending image thumbnails ──────────────────────── */
.pending-images-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--ion-color-light-shade);
  border-bottom: 1px solid var(--ion-border-color, #dedede);
}

.pending-thumb-wrapper {
  position: relative;
  flex-shrink: 0;
}

.pending-thumb {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}

.pending-thumb-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  --padding-start: 0;
  --padding-end: 0;
  width: 20px;
  height: 20px;
  margin: 0;
}
```

- [ ] **Step 2: Add inputs and outputs**

In the class body, after `fileAccept = input<string>('*/*');`, add:

```typescript
pendingImages = input<File[]>([]);

fileQueued = output<File>();
removeImage = output<number>();
filesSent = output<File[]>();
```

- [ ] **Step 3: Add the object URL cache and helper**

In the class body, after the `private savedCursorPos` declaration, add:

```typescript
private readonly _objectUrlCache = new Map<File, string>();

protected getObjectUrl(file: File): string {
  if (!this._objectUrlCache.has(file)) {
    this._objectUrlCache.set(file, URL.createObjectURL(file));
  }
  return this._objectUrlCache.get(file)!;
}

private revokeObjectUrls(): void {
  for (const url of this._objectUrlCache.values()) {
    URL.revokeObjectURL(url);
  }
  this._objectUrlCache.clear();
}
```

- [ ] **Step 4: Update `canSend` and `sendMessage`**

Replace `canSend`:
```typescript
canSend = computed(() => {
  return (this.messageText().trim().length > 0 || this.pendingImages().length > 0) && !this.disabled();
});
```

Replace `sendMessage()`:
```typescript
sendMessage(): void {
  const files = this.pendingImages();
  if (files.length > 0) {
    this.filesSent.emit([...files]);
    this.revokeObjectUrls();
  }
  const text = this.messageText().trim();
  if (text) {
    this.messageSent.emit(text);
    this.messageText.set('');
    this.typing.emit(false);
    const key = this.draftKey();
    if (key) localStorage.removeItem(key);
  }
}
```

- [ ] **Step 5: Update `onFileSelected` to route images to the queue**

Replace the existing `onFileSelected`:
```typescript
onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    if (file.type.startsWith('image/')) {
      this.fileQueued.emit(file);
    } else {
      this.fileSent.emit(file);
    }
    input.value = '';
  }
}
```

- [ ] **Step 6: Add the thumbnail strip to the template**

Inside the `@if (!isRecording())` block, add the thumbnail strip as the **first** element (before the reply-preview strip):

```html
<!-- Pending image thumbnails strip -->
@if (pendingImages().length > 0) {
  <div class="pending-images-strip">
    @for (file of pendingImages(); track file; let i = $index) {
      <div class="pending-thumb-wrapper">
        <img [src]="getObjectUrl(file)" [alt]="file.name" class="pending-thumb" />
        <ion-button
          fill="clear"
          size="small"
          color="danger"
          class="pending-thumb-remove"
          (click)="removeImage.emit(i)"
        >
          <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
        </ion-button>
      </div>
    }
  </div>
}
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

- [ ] **Step 8: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-input.ts
git commit -m "feat(chat): add pending image queue with thumbnail preview strip to message input"
```

---

## Task 5 — Wire everything in `matrix-chat.ts`

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

- [ ] **Step 1: Add imports**

Add `signal` to the existing Angular import (it may already be there).

Add to the Ionic imports line:
```typescript
import { ImageLightboxModal, LightboxImage } from '@bk2/chat-ui';
```

- [ ] **Step 2: Add `pendingImages` signal**

In the class body, near the other signal declarations (e.g., after `isDragOver`), add:
```typescript
protected pendingImages = signal<File[]>([]);
```

- [ ] **Step 3: Update `onDrop` to queue images**

Replace the existing `onDrop` method:
```typescript
protected async onDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  this.isDragOver.set(false);
  if (!this.currentRoomId()) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (!files.length) return;

  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  const otherFiles = files.filter(f => !f.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    this.pendingImages.update(prev => [...prev, ...imageFiles]);
  }

  if (otherFiles.length > 0) {
    const results = await Promise.allSettled(otherFiles.map(f => this.store.sendFile(f)));
    const failures = results.filter(r => r.status === 'rejected').length;
    if (failures > 0) {
      await showToast(this.toastController, `${failures} Datei(en) konnten nicht gesendet werden`);
    }
  }
}
```

- [ ] **Step 4: Add queue management handlers**

Add these methods to the class:

```typescript
protected onFileQueued(file: File): void {
  this.pendingImages.update(prev => [...prev, file]);
}

protected onRemoveImage(index: number): void {
  this.pendingImages.update(prev => prev.filter((_, i) => i !== index));
}

protected async onFilesSent(files: File[]): Promise<void> {
  this.pendingImages.set([]);
  const results = await Promise.allSettled(files.map(f => this.store.sendFile(f)));
  const failures = results.filter(r => r.status === 'rejected').length;
  if (failures > 0) {
    await showToast(this.toastController, `${failures} Bild(er) konnten nicht gesendet werden`);
  }
}

protected async onThreadFileQueued(file: File): Promise<void> {
  const threadId = this.store.selectedThreadId();
  if (!threadId) return;
  try {
    await this.store.sendFile(file, threadId);
  } catch (error) {
    console.error('Failed to send thread image:', error);
  }
}
```

- [ ] **Step 5: Update `onImageClicked` to open the lightbox**

Replace the existing `onImageClicked`:
```typescript
async onImageClicked(event: { message: MatrixMessage; group: MatrixMessage[] }): Promise<void> {
  const images: LightboxImage[] = event.group.map(m => ({
    mediaUrl: m.mediaUrl ?? m.content?.url ?? '',
    filename: m.body,
  }));
  const initialIndex = event.group.indexOf(event.message);
  const modal = await this.modalController.create({
    component: ImageLightboxModal,
    componentProps: { images, initialIndex },
    cssClass: 'fullscreen-modal',
  });
  await modal.present();
}
```

- [ ] **Step 6: Update the main message input bindings in the template**

Find the main `<bk-matrix-message-input>` block (around line 375) and add the new bindings:

```html
<bk-matrix-message-input
  [roomId]="currentRoomId()"
  [typingUsers]="typingUsers()"
  [replyToMessage]="replyToMessage()"
  [pendingImages]="pendingImages()"
  (messageSent)="onMessageSent($event)"
  (fileSent)="onFileSent($event)"
  (fileQueued)="onFileQueued($event)"
  (removeImage)="onRemoveImage($event)"
  (filesSent)="onFilesSent($event)"
  (locationSent)="onLocationSent()"
  (surveyRequested)="onSurveyRequested()"
  (videoCallStarted)="onVideoCallStarted()"
  (typing)="onTyping($event)"
  (cancelReplyClicked)="onCancelReply()"
/>
```

Also update the thread `<bk-matrix-message-input>` block (around line 450) to add the thread image queuing:

```html
<bk-matrix-message-input
  [typingUsers]="[]"
  (messageSent)="onThreadMessageSent($event)"
  (fileSent)="onThreadFileSent($event)"
  (fileQueued)="onThreadFileQueued($event)"
  (typing)="onTyping($event)"
  (surveyRequested)="onSurveyRequested()"
/>
```

- [ ] **Step 7: Add `MatrixMessage` type import if not present**

`MatrixMessage` must be imported for the updated `onImageClicked` signature:
```typescript
import { MatrixMessage } from '@bk2/shared-models';
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Fix any errors before continuing.

- [ ] **Step 9: Add `fullscreen-modal` CSS to the app's global styles (if not present)**

Check `apps/scs-app/src/global.scss` for a `.fullscreen-modal` class. If missing, add:

```scss
.fullscreen-modal {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
}
```

- [ ] **Step 10: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.ts \
        apps/scs-app/src/global.scss
git commit -m "feat(chat): wire image queuing, lightbox, and batch send in matrix-chat"
```

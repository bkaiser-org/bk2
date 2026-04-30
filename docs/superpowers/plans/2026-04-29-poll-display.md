# Poll Display & Voting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render MSC3381 poll events as interactive cards in the Matrix chat message list, with live vote tallying, vote changing, and poll ending by the creator.

**Architecture:** Extend `MatrixMessage` with poll fields (`pollAnswers`, `pollVotes`, `myVoteAnswerId`, `pollEnded`). `MatrixChatService` computes the tally on load and refreshes it live from `RoomEvent.Timeline`. A new standalone `PollMessageComponent` renders the card; events bubble up through `MatrixMessageList` → `MatrixChat` → `MatrixChatStore` → service.

**Tech Stack:** Angular 20 signals, `matrix-js-sdk`, NgRx Signal Store, Ionic Angular standalone, Transloco (de), Vitest

---

## File Map

| Action | File |
|--------|------|
| Modify | `libs/shared/models/src/lib/chat.model.ts` |
| Modify | `libs/chat/data-access/src/lib/matrix-chat.service.ts` |
| Modify | `libs/chat/feature/src/lib/matrix-chat.store.ts` |
| Create | `libs/chat/ui/src/lib/poll-message.component.ts` |
| Modify | `libs/chat/ui/src/index.ts` |
| Modify | `libs/chat/ui/src/lib/matrix-message-list.ts` |
| Modify | `libs/chat/feature/src/lib/matrix-chat.ts` |
| Modify | `libs/chat/ui/src/lib/poll-create.form.ts` |
| Modify | `libs/chat/feature/src/lib/poll-create.modal.ts` |
| Modify | `apps/scs-app/src/assets/i18n/de.json` |

---

## Task 1: Extend MatrixMessage and simplify MatrixPollData

**Files:**
- Modify: `libs/shared/models/src/lib/chat.model.ts`
- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts:14-18`
- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts:928-946`
- Modify: `libs/chat/ui/src/lib/poll-create.form.ts`
- Modify: `libs/chat/feature/src/lib/poll-create.modal.ts:37`

- [ ] **Step 1: Add poll fields to MatrixMessage**

In `libs/shared/models/src/lib/chat.model.ts`, replace the `MatrixMessage` interface:

```typescript
export interface MatrixMessage {
  eventId: string;
  roomId: string;
  sender: string;
  senderName: string;
  senderAvatar?: string;
  body: string;
  timestamp: number;
  type: string;
  content: any;
  mediaUrl?: string;
  relatesTo?: {
    eventId: string;
    relationType: string;
  };
  reactions?: Map<string, Set<string>>;
  isRedacted: boolean;
  isEdited: boolean;
  // Poll fields — only populated on org.matrix.msc3381.poll.start messages
  pollAnswers?: Array<{ id: string; body: string }>;
  pollVotes?: Record<string, number>;   // answerId → vote count
  myVoteAnswerId?: string;
  pollEnded?: boolean;
}
```

- [ ] **Step 2: Remove `kind` from MatrixPollData**

In `libs/chat/data-access/src/lib/matrix-chat.service.ts`, replace lines 14-18:

```typescript
export interface MatrixPollData {
  question: string;
  answers: string[];   // min 2, max 20
}
```

- [ ] **Step 3: Update sendPoll() to hardcode disclosed**

In `libs/chat/data-access/src/lib/matrix-chat.service.ts`, replace the `sendPoll()` method (line 925-946):

```typescript
  /**
   * Send a poll (MSC3381) — always disclosed
   */
  async sendPoll(roomId: string, data: MatrixPollData): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const answers = data.answers.map((body, i) => ({
      id: String(i + 1),
      'org.matrix.msc3381.poll.answer': { msgtype: 'm.text', body }
    }));
    const fallback = `${data.question}\n${data.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;

    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.start' as any, {
      'org.matrix.msc3381.poll': {
        question: { msgtype: 'm.text', body: data.question },
        kind: 'org.matrix.msc3381.poll.disclosed',
        max_selections: 1,
        answers
      },
      body: fallback
    } as any);
  }
```

- [ ] **Step 4: Remove kind selector from PollCreateForm**

Replace the entire `libs/chat/ui/src/lib/poll-create.form.ts`:

```typescript
import { AsyncPipe } from '@angular/common';
import { Component, OnInit, effect, input, output, signal } from '@angular/core';
import { IonItem, IonInput, IonList } from '@ionic/angular/standalone';

import { AnyCharacterMask } from '@bk2/shared-config';
import { TranslatePipe } from '@bk2/shared-i18n';
import { StringsComponent } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';

@Component({
  selector: 'bk-poll-create-form',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    StringsComponent,
    IonItem, IonInput, IonList
  ],
  template: `
    <ion-list>
      <!-- Question -->
      <ion-item>
        <ion-input
          [label]="'@chat.survey.questionLabel' | translate | async"
          labelPlacement="floating"
          [placeholder]="'@chat.survey.questionPlaceholder' | translate | async"
          [value]="question()"
          (ionInput)="question.set($any($event).detail.value ?? '')"
          [maxlength]="255"
          [counter]="true"
          inputMode="text"
          type="text"
        />
      </ion-item>

      <!-- Answers via bk-strings -->
      <bk-strings
        [(strings)]="answers"
        title="@chat.survey.answers"
        addLabel="@chat.survey.addAnswer"
        [readOnly]="false"
        [mask]="anyCharMask"
        [maxLength]="100"
      />
    </ion-list>
  `
})
export class PollCreateForm implements OnInit {
  public formData = input.required<MatrixPollData>();
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

  protected readonly anyCharMask = AnyCharacterMask;

  protected question = signal('');
  protected answers = signal<string[]>([]);

  constructor() {
    effect(() => {
      const data: MatrixPollData = {
        question: this.question(),
        answers: this.answers()
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }

  ngOnInit(): void {
    this.question.set(this.formData().question);
    this.answers.set([...this.formData().answers]);
  }
}
```

- [ ] **Step 5: Remove kind from PollCreateModal initial value**

In `libs/chat/feature/src/lib/poll-create.modal.ts`, replace line 37:

```typescript
  protected formData = signal<MatrixPollData>({ question: '', answers: [] });
```

- [ ] **Step 6: Type-check both libs**

```bash
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/models/src/lib/chat.model.ts \
        libs/chat/data-access/src/lib/matrix-chat.service.ts \
        libs/chat/ui/src/lib/poll-create.form.ts \
        libs/chat/feature/src/lib/poll-create.modal.ts
git commit -m "feat: extend MatrixMessage with poll fields; simplify MatrixPollData (remove kind)"
```

---

## Task 2: Service — computePollTally, isPollEnded helpers, and mapEventToMessage

**Files:**
- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts`

- [ ] **Step 1: Add computePollTally and isPollEnded private helpers**

Add the following two methods to `MatrixChatService` immediately before the `refreshMessageReactions()` method (before line 615):

```typescript
  /**
   * Scan the room timeline for all poll.response events referencing pollEventId.
   * Deduplicates by sender — only the highest getOriginServerTs() per sender counts.
   * Returns vote counts per answerId and the current user's voted answerId.
   */
  private computePollTally(
    pollEventId: string,
    room: Room
  ): { pollVotes: Record<string, number>; myVoteAnswerId: string | undefined } {
    const currentUserId = this.getCurrentUserId();
    const latestByUser = new Map<string, { answerId: string; ts: number }>();

    for (const event of room.getLiveTimeline().getEvents()) {
      if (event.getType() !== 'org.matrix.msc3381.poll.response') continue;
      const relatesTo = event.getContent()?.['m.relates_to'];
      if (relatesTo?.event_id !== pollEventId) continue;
      const sender = event.getSender();
      if (!sender) continue;
      const answerId: string | undefined =
        event.getContent()?.['org.matrix.msc3381.poll.response']?.answers?.[0];
      if (!answerId) continue;
      const ts = event.getOriginServerTs();
      const prev = latestByUser.get(sender);
      if (!prev || ts > prev.ts) {
        latestByUser.set(sender, { answerId, ts });
      }
    }

    const pollVotes: Record<string, number> = {};
    let myVoteAnswerId: string | undefined;
    for (const [sender, { answerId }] of latestByUser) {
      pollVotes[answerId] = (pollVotes[answerId] ?? 0) + 1;
      if (sender === currentUserId) myVoteAnswerId = answerId;
    }
    return { pollVotes, myVoteAnswerId };
  }

  /** Returns true if a poll.end event referencing pollEventId exists in the room timeline. */
  private isPollEnded(pollEventId: string, room: Room): boolean {
    return room.getLiveTimeline().getEvents().some(event => {
      if (event.getType() !== 'org.matrix.msc3381.poll.end') return false;
      return event.getContent()?.['m.relates_to']?.event_id === pollEventId;
    });
  }
```

- [ ] **Step 2: Update mapEventToMessage() to populate pollAnswers and fix type for poll events**

In `libs/chat/data-access/src/lib/matrix-chat.service.ts`, replace the `mapEventToMessage()` method (line 549-572):

```typescript
  private mapEventToMessage(event: MatrixEvent, room: Room): MatrixMessage {
    const sender = room.getMember(event.getSender()!);
    const content = event.getContent();
    const relatesTo = content['m.relates_to'];
    const eventType = event.getType();

    let pollAnswers: Array<{ id: string; body: string }> | undefined;
    if (eventType === 'org.matrix.msc3381.poll.start') {
      const rawAnswers = content['org.matrix.msc3381.poll']?.answers;
      if (Array.isArray(rawAnswers)) {
        pollAnswers = rawAnswers.map((a: any) => ({
          id: String(a.id),
          body: a['org.matrix.msc3381.poll.answer']?.body ?? String(a.id)
        }));
      }
    }

    return {
      eventId: event.getId()!,
      roomId: room.roomId,
      sender: event.getSender()!,
      senderName: sender?.name || event.getSender()!,
      senderAvatar: undefined,
      body: content.body || '',
      timestamp: event.getTs(),
      type: content.msgtype ?? eventType,
      content: content,
      relatesTo: (relatesTo?.event_id && relatesTo?.rel_type) ? {
        eventId: relatesTo.event_id as string,
        relationType: relatesTo.rel_type as string
      } : undefined,
      reactions: this.getReactionsForEvent(event, room),
      isRedacted: event.isRedacted(),
      isEdited: !!relatesTo && relatesTo.rel_type === RelationType.Replace,
      pollAnswers,
    };
  }
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/data-access/src/lib/matrix-chat.service.ts
git commit -m "feat: add computePollTally, isPollEnded helpers; populate pollAnswers in mapEventToMessage"
```

---

## Task 3: Service — loadMessagesForRoom poll.start support, live timeline handlers, sendPollResponse, sendPollEnd

**Files:**
- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts`

- [ ] **Step 1: Update loadMessagesForRoom() filter to include poll.start**

In `loadMessagesForRoom()` (around line 452-471), replace the `.filter()` block:

```typescript
      const messages = await Promise.all(
        allEvents
          .filter(e => {
            // Include regular room messages (excluding edit events)
            if (e.getType() === EventType.RoomMessage) {
              const rel = e.getContent()?.['m.relates_to'];
              return !(rel?.rel_type === RelationType.Replace && rel?.event_id);
            }
            // Include poll start events
            if (e.getType() === 'org.matrix.msc3381.poll.start') return true;
            return false;
          })
          .map(async e => {
            const msg = this.mapEventToMessage(e, room);
            const mxcUrl = msg.content.url ?? msg.content.file?.url;
            const senderMember = room.getMember(e.getSender()!);
            const senderAvatarMxc = (senderMember as any)?.getMxcAvatarUrl?.() as string | undefined;
            const senderAvatar = senderAvatarMxc ? await this.resolveMediaUrl(senderAvatarMxc) : undefined;

            // Attach poll tally and ended flag for poll.start events
            if (e.getType() === 'org.matrix.msc3381.poll.start') {
              const eventId = e.getId()!;
              const { pollVotes, myVoteAnswerId } = this.computePollTally(eventId, room);
              const pollEnded = this.isPollEnded(eventId, room);
              return { ...msg, senderAvatar: senderAvatar || undefined, pollVotes, myVoteAnswerId, pollEnded };
            }

            if ((msg.type === 'm.image' || msg.type === 'm.file' || msg.type === 'm.audio') && mxcUrl) {
              return { ...msg, senderAvatar: senderAvatar || undefined, mediaUrl: await this.resolveMediaUrl(mxcUrl) };
            }
            return { ...msg, senderAvatar: senderAvatar || undefined };
          })
      );
```

- [ ] **Step 2: Add refreshPollTally and markPollEnded private helpers**

Add these two methods after `refreshMessageReactions()` (after line 627):

```typescript
  /** Re-compute poll tally and update the poll message in the BehaviorSubject. */
  private refreshPollTally(pollEventId: string, room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === pollEventId);
    if (idx < 0) return;
    const { pollVotes, myVoteAnswerId } = this.computePollTally(pollEventId, room);
    const updated = [...msgs];
    updated[idx] = { ...msgs[idx], pollVotes, myVoteAnswerId };
    subject.next(updated);
  }

  /** Mark a poll message as ended in the BehaviorSubject. */
  private markPollEnded(pollEventId: string, room: Room): void {
    const subject = this.messages$.get(room.roomId);
    if (!subject) return;
    const msgs = subject.value ?? [];
    const idx = msgs.findIndex(m => m.eventId === pollEventId);
    if (idx < 0) return;
    const updated = [...msgs];
    updated[idx] = { ...msgs[idx], pollEnded: true };
    subject.next(updated);
  }
```

- [ ] **Step 3: Update RoomEvent.Timeline handler to handle poll events**

In the `RoomEvent.Timeline` handler (line 269-283), replace the entire handler body:

```typescript
    this.client.on(RoomEvent.Timeline, (event: MatrixEvent, room: Room | undefined, toStartOfTimeline: boolean | undefined) => {
      if (toStartOfTimeline) return;
      if (!room) return;

      const eventType = event.getType();

      if (eventType === EventType.RoomMessage) {
        const relatesTo = event.getContent()?.['m.relates_to'];
        if (relatesTo?.rel_type === RelationType.Replace && relatesTo?.event_id) {
          this.applyMessageEdit(relatesTo.event_id as string, event, room);
        } else {
          this.handleNewMessage(event, room);
        }
      } else if (eventType === 'm.reaction') {
        const targetId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
        if (targetId) this.refreshMessageReactions(targetId, room);
      } else if (eventType === 'org.matrix.msc3381.poll.start') {
        this.handleNewMessage(event, room);
      } else if (eventType === 'org.matrix.msc3381.poll.response') {
        const pollEventId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
        if (pollEventId) this.refreshPollTally(pollEventId, room);
      } else if (eventType === 'org.matrix.msc3381.poll.end') {
        const pollEventId = event.getContent()?.['m.relates_to']?.event_id as string | undefined;
        if (pollEventId) this.markPollEnded(pollEventId, room);
      }
    });
```

- [ ] **Step 4: Add sendPollResponse and sendPollEnd public methods**

Add after `sendPoll()` (after line 946):

```typescript
  /**
   * Send a poll vote response (MSC3381)
   */
  async sendPollResponse(roomId: string, pollEventId: string, answerId: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.response' as any, {
      'org.matrix.msc3381.poll.response': { answers: [answerId] },
      'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId }
    } as any);
  }

  /**
   * End a poll (MSC3381) — only the poll creator should call this
   */
  async sendPollEnd(roomId: string, pollEventId: string): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.end' as any, {
      'org.matrix.msc3381.poll.end': {},
      'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId },
      body: 'The poll has ended.'
    } as any);
  }
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/chat/data-access/src/lib/matrix-chat.service.ts
git commit -m "feat: poll.start in message load, live tally refresh, sendPollResponse, sendPollEnd"
```

---

## Task 4: MatrixChatStore — sendPollResponse and endPoll methods

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.store.ts:531`

- [ ] **Step 1: Add sendPollResponse and endPoll after sendPoll()**

In `libs/chat/feature/src/lib/matrix-chat.store.ts`, add after the closing `},` of `sendPoll()` (after line 531):

```typescript
      /**
       * Vote on a poll (MSC3381)
       */
      async sendPollResponse(pollEventId: string, answerId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;
        try {
          await store.matrixService.sendPollResponse(roomId, pollEventId, answerId);
        } catch (error) {
          console.error('MatrixChatStore.sendPollResponse: Failed to send poll response:', error);
          throw error;
        }
      },

      /**
       * End a poll (MSC3381) — only the creator should call this
       */
      async endPoll(pollEventId: string): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) return;
        try {
          await store.matrixService.sendPollEnd(roomId, pollEventId);
        } catch (error) {
          console.error('MatrixChatStore.endPoll: Failed to end poll:', error);
          throw error;
        }
      },
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.store.ts
git commit -m "feat: add sendPollResponse and endPoll to MatrixChatStore"
```

---

## Task 5: Create PollMessageComponent

**Files:**
- Create: `libs/chat/ui/src/lib/poll-message.component.ts`
- Modify: `libs/chat/ui/src/index.ts`

- [ ] **Step 1: Create the component file**

Create `libs/chat/ui/src/lib/poll-message.component.ts`:

```typescript
import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { IonButton, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { MatrixMessage } from '@bk2/shared-models';

@Component({
  selector: 'bk-poll-message',
  standalone: true,
  imports: [AsyncPipe, TranslatePipe, SvgIconPipe, IonList, IonItem, IonLabel, IonButton, IonIcon],
  styles: [`
    .poll-question {
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 0.95rem;
    }
    .answer-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .answer-row.ended {
      cursor: default;
      opacity: 0.8;
    }
    .radio-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 1.5px solid var(--ion-color-medium);
      flex-shrink: 0;
    }
    .radio-dot.voted {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
    }
    .answer-text {
      flex: 1;
      font-size: 0.9rem;
    }
    .answer-text.voted {
      color: var(--ion-color-primary);
      font-weight: 600;
    }
    .answer-stats {
      font-size: 0.8rem;
      color: var(--ion-color-medium);
      white-space: nowrap;
    }
    .answer-stats.voted {
      color: var(--ion-color-primary);
    }
    .poll-footer {
      font-size: 0.78rem;
      color: var(--ion-color-medium);
      padding: 6px 10px 0;
    }
    .end-button {
      margin-top: 8px;
      --padding-start: 10px;
      --padding-end: 10px;
    }
  `],
  template: `
    <div class="poll-question">{{ message().body }}</div>

    @for (answer of message().pollAnswers ?? []; track answer.id) {
      <div
        class="answer-row"
        [class.ended]="message().pollEnded"
        (click)="onAnswerClick(answer.id)"
      >
        <div class="radio-dot" [class.voted]="answer.id === message().myVoteAnswerId"></div>
        <span class="answer-text" [class.voted]="answer.id === message().myVoteAnswerId">
          {{ answer.body }}
        </span>
        <span class="answer-stats" [class.voted]="answer.id === message().myVoteAnswerId">
          @if (isUndisclosed()) {
            —
          } @else {
            {{ voteCount(answer.id) }} · {{ votePercent(answer.id) }}%
          }
        </span>
      </div>
    }

    <div class="poll-footer">
      @if (message().pollEnded) {
        {{ '@chat.survey.ended' | translate | async }}
      } @else {
        {{ totalVotes() }} {{ '@chat.survey.totalVotes' | translate | async }}
        @if (message().myVoteAnswerId) {
          · {{ '@chat.survey.voted' | translate | async }}
        }
      }
    </div>

    @if (!message().pollEnded && message().sender === currentUserId()) {
      <ion-button
        fill="clear"
        size="small"
        color="medium"
        class="end-button"
        (click)="onEndPoll(); $event.stopPropagation()"
      >
        {{ '@chat.survey.end' | translate | async }}
      </ion-button>
    }
  `
})
export class PollMessageComponent {
  public message = input.required<MatrixMessage>();
  public currentUserId = input.required<string>();

  public voteClicked = output<{ pollEventId: string; answerId: string }>();
  public endPollClicked = output<{ pollEventId: string }>();

  protected readonly totalVotes = computed(() => {
    const votes = this.message().pollVotes ?? {};
    return Object.values(votes).reduce((sum, n) => sum + n, 0);
  });

  protected readonly isUndisclosed = computed(() => {
    const kind: string | undefined =
      this.message().content?.['org.matrix.msc3381.poll']?.kind;
    return typeof kind === 'string' && kind.endsWith('.undisclosed');
  });

  protected voteCount(answerId: string): number {
    return this.message().pollVotes?.[answerId] ?? 0;
  }

  protected votePercent(answerId: string): number {
    const total = this.totalVotes();
    if (total === 0) return 0;
    return Math.round((this.voteCount(answerId) / total) * 100);
  }

  protected onAnswerClick(answerId: string): void {
    if (this.message().pollEnded) return;
    if (this.isUndisclosed()) return;
    if (!(this.message().pollAnswers?.length)) return;
    this.voteClicked.emit({ pollEventId: this.message().eventId, answerId });
  }

  protected onEndPoll(): void {
    this.endPollClicked.emit({ pollEventId: this.message().eventId });
  }
}
```

- [ ] **Step 2: Export from index.ts**

In `libs/chat/ui/src/index.ts`, add the export:

```typescript
export * from './lib/matrix-message-input';
export * from './lib/matrix-message-list';
export * from './lib/matrix-room-list';
export * from './lib/room-edit.form';
export * from './lib/poll-create.form';
export * from './lib/poll-message.component';
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/ui/src/lib/poll-message.component.ts libs/chat/ui/src/index.ts
git commit -m "feat: add PollMessageComponent with vote display and end-poll button"
```

---

## Task 6: MatrixMessageList — add poll rendering

**Files:**
- Modify: `libs/chat/ui/src/lib/matrix-message-list.ts`

- [ ] **Step 1: Add PollMessageComponent import and two new outputs**

In `libs/chat/ui/src/lib/matrix-message-list.ts`:

1. Add `PollMessageComponent` to the component's `imports` array.
2. Add two outputs after line 466 (`threadClicked = output<string>()`):

```typescript
  pollVoteClicked = output<{ pollEventId: string; answerId: string }>();
  pollEndClicked = output<{ pollEventId: string }>();
```

- [ ] **Step 2: Add @case block for poll.start in the message @switch**

In the `@switch (message.type)` block (after line 333), add a new case after the last `@case` and before the `@default` (or closing `@switch`):

```html
@case ('org.matrix.msc3381.poll.start') {
  <bk-poll-message
    [message]="message"
    [currentUserId]="currentUserId() ?? ''"
    (voteClicked)="pollVoteClicked.emit($event)"
    (endPollClicked)="pollEndClicked.emit($event)"
  />
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm nx build chat-ui --skip-nx-cache
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-list.ts
git commit -m "feat: render poll.start events as PollMessageComponent in MatrixMessageList"
```

---

## Task 7: MatrixChat — wire poll outputs

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

- [ ] **Step 1: Add onPollVoteClicked and onPollEndClicked handler methods**

In `libs/chat/feature/src/lib/matrix-chat.ts`, add the following two methods in the class body (e.g., after the existing `onSurveyRequested()` method):

```typescript
  protected async onPollVoteClicked(e: { pollEventId: string; answerId: string }): Promise<void> {
    try {
      await this.store.sendPollResponse(e.pollEventId, e.answerId);
    } catch (error) {
      console.error('MatrixChat: Failed to send poll response:', error);
    }
  }

  protected async onPollEndClicked(e: { pollEventId: string }): Promise<void> {
    try {
      await this.store.endPoll(e.pollEventId);
    } catch (error) {
      console.error('MatrixChat: Failed to end poll:', error);
    }
  }
```

- [ ] **Step 2: Wire the outputs on the main message list (line ~320-331)**

In the main `bk-matrix-message-list` (inside the `@if (currentRoom())` block), add the two output bindings:

```html
<bk-matrix-message-list
  [messages]="messages()"
  [currentUserId]="matrixUserId()"
  [homeserverUrl]="homeserverUrl()"
  [typingUsers]="typingUsers()"
  [threadReplyCounts]="threadReplyCounts()"
  (messageClicked)="onMessageClicked($event)"
  (imageClicked)="onImageClicked($event)"
  (fileClicked)="onFileClicked($event)"
  (reactionClicked)="onReactionClicked($event)"
  (threadClicked)="onThreadClicked($event)"
  (pollVoteClicked)="onPollVoteClicked($event)"
  (pollEndClicked)="onPollEndClicked($event)"
/>
```

- [ ] **Step 3: Wire the outputs on the thread panel message list (line ~384-394)**

In the thread panel `bk-matrix-message-list`, add the same two bindings:

```html
<bk-matrix-message-list
  [messages]="threadMessages()"
  [currentUserId]="matrixUserId()"
  [homeserverUrl]="homeserverUrl()"
  [typingUsers]="[]"
  (messageClicked)="onMessageClicked($event)"
  (imageClicked)="onImageClicked($event)"
  (fileClicked)="onFileClicked($event)"
  (reactionClicked)="onReactionClicked($event)"
  (threadClicked)="onThreadClicked($event)"
  (pollVoteClicked)="onPollVoteClicked($event)"
  (pollEndClicked)="onPollEndClicked($event)"
/>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "feat: wire pollVoteClicked and pollEndClicked from MatrixMessageList to store"
```

---

## Task 8: i18n + end-to-end type-check

**Files:**
- Modify: `apps/scs-app/src/assets/i18n/de.json`

- [ ] **Step 1: Add new i18n keys and remove obsolete ones**

In `apps/scs-app/src/assets/i18n/de.json`, inside the `"chat"` → `"survey"` object:

Add these keys:
```json
"totalVotes": "Stimmen gesamt",
"voted": "Du hast abgestimmt",
"ended": "Umfrage beendet",
"end": "Umfrage beenden"
```

Remove these keys (no longer referenced after removing the kind selector):
- `"kind"`
- `"open"`
- `"closed"`
- `"openDescription"`
- `"closedDescription"`

- [ ] **Step 2: End-to-end type-check**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors.

- [ ] **Step 3: Build verification**

```bash
pnpm nx build chat-data-access --skip-nx-cache
pnpm nx build chat-ui --skip-nx-cache
pnpm nx build chat-feature --skip-nx-cache
```

Expected: all three build cleanly with no artifacts in `libs/`.

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/assets/i18n/de.json
git commit -m "feat: add poll display i18n keys; remove obsolete kind/open/closed keys"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|---|---|
| `pollAnswers`, `pollVotes`, `myVoteAnswerId`, `pollEnded` on `MatrixMessage` | Task 1 |
| Remove `kind` from `MatrixPollData`; hardcode disclosed | Tasks 1, 3 |
| `computePollTally()` private helper | Task 2 |
| `isPollEnded()` private helper | Task 2 |
| `mapEventToMessage()` populates `pollAnswers`; uses `event.getType()` as fallback | Task 2 |
| `loadMessagesForRoom()` includes `poll.start` with tally and `pollEnded` | Task 3 |
| `refreshPollTally()` and `markPollEnded()` private methods | Task 3 |
| `RoomEvent.Timeline` branches for `poll.response` and `poll.end` | Task 3 |
| `sendPollResponse()` and `sendPollEnd()` public methods | Task 3 |
| `MatrixChatStore.sendPollResponse()` and `endPoll()` | Task 4 |
| `PollMessageComponent` with radio-row card, percentages, footer, end button | Task 5 |
| Undisclosed polls: hide per-answer counts, no voting | Task 5 |
| `MatrixMessageList` outputs + `@case ('org.matrix.msc3381.poll.start')` block | Task 6 |
| `MatrixChat` handlers + bindings on both `bk-matrix-message-list` usages | Task 7 |
| i18n keys: `totalVotes`, `voted`, `ended`, `end` | Task 8 |
| Remove obsolete `kind`, `open`, `closed`, `openDescription`, `closedDescription` | Tasks 1, 8 |
| Remove kind selector from `PollCreateForm` and modal | Task 1 |

All spec requirements covered.

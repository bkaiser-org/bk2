# Poll Display & Voting — Design Spec

**Date:** 2026-04-29
**Feature:** MSC3381 poll display, voting, and live tally in the Matrix chat message list
**Status:** Approved

---

## Overview

Render `org.matrix.msc3381.poll.start` events in the message list as interactive poll cards. Users tap an answer to vote; the tally updates live as other room members vote. Voting sends an `org.matrix.msc3381.poll.response` event. Vote changes are allowed at any time.

Also simplifies poll creation by removing the `kind` selector — all polls are `disclosed` (open). The `undisclosed` option is removed from the UI and data model.

---

## Architecture

```
PollMessageComponent (chat-ui)
  └─ voteClicked = output<{ pollEventId: string; answerId: string }>()

MatrixMessageList (chat-ui)
  └─ pollVoteClicked = output<{ pollEventId: string; answerId: string }>()

MatrixChat (chat-feature)
  └─ onPollVoteClicked(e) → store.sendPollResponse(e.pollEventId, e.answerId)

MatrixChatStore (chat-feature)
  └─ sendPollResponse(pollEventId, answerId)
       └─ chatService.sendPollResponse(roomId, pollEventId, answerId)

MatrixChatService (chat-data-access)
  └─ sendPollResponse(roomId, pollEventId, answerId)
       └─ client.sendEvent('org.matrix.msc3381.poll.response', ...)
  └─ loadMessagesForRoom() — now includes poll.start events with computed tally
  └─ RoomEvent.Timeline handler — processes incoming poll.response events
  └─ computePollTally(pollEventId, room) — shared helper
```

---

## MSC3381 Poll Response Event Shape

```json
{
  "type": "org.matrix.msc3381.poll.response",
  "content": {
    "org.matrix.msc3381.poll.response": {
      "answers": ["1"]
    },
    "m.relates_to": {
      "rel_type": "m.reference",
      "event_id": "$pollStartEventId"
    }
  }
}
```

`answers` is always a single-element array (`max_selections: 1`). Multiple-choice support is out of scope.

---

## Data Model Changes

### `libs/shared/models/src/lib/chat.model.ts`

Extend `MatrixMessage` with three optional fields (only populated on `poll.start` messages):

```typescript
pollAnswers?: Array<{ id: string; body: string }>;
pollVotes?: Record<string, number>;   // answerId → vote count
myVoteAnswerId?: string;              // current user's latest voted answer ID
```

### `libs/chat/data-access/src/lib/matrix-chat.service.ts`

Remove `kind` from `MatrixPollData`. `sendPoll()` hardcodes `org.matrix.msc3381.poll.disclosed`:

```typescript
export interface MatrixPollData {
  question: string;
  answers: string[];   // min 2, max 20
}
```

---

## Vote Tally Algorithm

`computePollTally(pollEventId: string, room: Room, currentUserId: string)` scans the room's live timeline for all events of type `org.matrix.msc3381.poll.response` where `content['m.relates_to'].event_id === pollEventId`. It deduplicates by sender — only the response with the highest `getOriginServerTs()` per sender counts (handles vote changes). Returns `{ pollVotes: Record<string, number>, myVoteAnswerId: string | undefined }`.

Called:
- Once per `poll.start` event during `loadMessagesForRoom()` to build the initial tally.
- On each incoming `org.matrix.msc3381.poll.response` from the live `RoomEvent.Timeline` handler to refresh the referenced poll message in place.

---

## Files

### Modified: `libs/shared/models/src/lib/chat.model.ts`

Add optional poll fields to `MatrixMessage` (see Data Model section above).

### Modified: `libs/chat/data-access/src/lib/matrix-chat.service.ts`

1. **`MatrixPollData`** — remove `kind` field.
2. **`sendPoll()`** — remove `kind` parameter; hardcode `org.matrix.msc3381.poll.disclosed`.
3. **`sendPollResponse(roomId, pollEventId, answerId)`** — new method:

```typescript
async sendPollResponse(roomId: string, pollEventId: string, answerId: string): Promise<void> {
  if (!this.client) throw new Error('Client not initialized');
  await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.response' as any, {
    'org.matrix.msc3381.poll.response': { answers: [answerId] },
    'm.relates_to': { rel_type: 'm.reference', event_id: pollEventId }
  } as any);
}
```

4. **`computePollTally(pollEventId, room, currentUserId)`** — private helper that scans the timeline, deduplicates by sender, and returns `{ pollVotes, myVoteAnswerId }`.

5. **`loadMessagesForRoom()`** — broaden the event filter to also include `org.matrix.msc3381.poll.start`. For each such event, call `computePollTally()` and attach the result to the mapped message.

6. **`mapEventToMessage()`** — when event type is `org.matrix.msc3381.poll.start`, populate `pollAnswers` from `content['org.matrix.msc3381.poll'].answers`.

7. **`RoomEvent.Timeline` handler** — add a branch for `org.matrix.msc3381.poll.response`: find the referenced poll message in the room's subject, call `computePollTally()`, and update that message in place (same pattern as `refreshMessageReactions()`).

### Modified: `libs/chat/feature/src/lib/matrix-chat.store.ts`

Add method after `sendPoll()`:

```typescript
async sendPollResponse(pollEventId: string, answerId: string): Promise<void> {
  const roomId = store.currentRoomId();
  if (!roomId) return;
  await store.matrixService.sendPollResponse(roomId, pollEventId, answerId);
}
```

### New: `libs/chat/ui/src/lib/poll-message.component.ts`

Standalone component `PollMessageComponent` (`bk-poll-message`):

- **Input:** `message = input.required<MatrixMessage>()`
- **Output:** `voteClicked = output<{ pollEventId: string; answerId: string }>()`
- **Template:** `ion-list` with one `ion-item` per answer:
  - Radio dot: filled + `color="primary"` if `answer.id === message().myVoteAnswerId`, otherwise outlined
  - Answer body text
  - Right-aligned `count · percentage` (percentage = `Math.round(votes / total * 100)`, `0` when total is 0)
- **Footer item:** `{total} Stimmen gesamt` + `· Du hast abgestimmt` when `myVoteAnswerId` is set
- **Tap handler:** emits `voteClicked` with `{ pollEventId: message().eventId, answerId: answer.id }` — fires even if already voted, enabling vote changes
- Exported from `libs/chat/ui/src/index.ts`

For `undisclosed` polls received from other clients (`content['org.matrix.msc3381.poll'].kind` ends with `.undisclosed`): show question and answers but replace per-answer counts with `—` and show only total vote count in the footer. No voting allowed (answers are non-interactive).

### Modified: `libs/chat/ui/src/lib/matrix-message-list.ts`

Add import of `PollMessageComponent`. In the `@switch (message.type)` block, add:

```html
@case ('org.matrix.msc3381.poll.start') {
  <bk-poll-message
    [message]="message"
    (voteClicked)="pollVoteClicked.emit($event)"
  />
}
```

Add output: `pollVoteClicked = output<{ pollEventId: string; answerId: string }>()`.

### Modified: `libs/chat/feature/src/lib/matrix-chat.ts`

Add handler:

```typescript
async onPollVoteClicked(e: { pollEventId: string; answerId: string }): Promise<void> {
  try {
    await this.store.sendPollResponse(e.pollEventId, e.answerId);
  } catch (error) {
    console.error('MatrixChat: Failed to send poll response:', error);
  }
}
```

Bind on both `bk-matrix-message-list` usages in the template:

```html
(pollVoteClicked)="onPollVoteClicked($event)"
```

### Modified: `libs/chat/ui/src/lib/poll-create.form.ts`

Remove:
- `kind` `linkedSignal` and `kindDescription` `computed`
- `IonSelect`, `IonSelectOption`, `IonNote` from imports and component `imports` array
- The kind `ion-item` and description `ion-item` from the template
- `kind` from the emitted `MatrixPollData` in the `effect()`

### Modified: `apps/scs-app/src/assets/i18n/de.json`

Add to the `chat.survey` section:

| Key | Value |
|---|---|
| `@chat.survey.totalVotes` | `Stimmen gesamt` |
| `@chat.survey.voted` | `Du hast abgestimmt` |

Also remove `@chat.survey.kind`, `@chat.survey.open`, `@chat.survey.closed`, `@chat.survey.openDescription`, `@chat.survey.closedDescription` from `de.json` (no longer referenced).

---

## Poll Card Visual Design

Radio-row style (Option C with percentages). Each answer row:

```
● Answer text                    5 · 50%
```

- Filled radio dot + primary colour + bold text = user's current vote
- Empty radio dot = not selected
- Right side: `{count} · {percent}%`

Footer: `{total} Stimmen gesamt [ · Du hast abgestimmt]`

For `undisclosed` polls from other clients:
```
○ Answer text                    —
```
Footer: `{total} Stimmen gesamt` (no breakdown, no voting)

---

## Validation

- A vote requires `pollAnswers` to be non-empty (guard against malformed events)
- `percentage` computed as `total === 0 ? 0 : Math.round((count / total) * 100)`
- Percentages may not sum to exactly 100% due to rounding — acceptable

---

## Out of Scope

- Ending a poll (`org.matrix.msc3381.poll.end`)
- Multiple-choice polls (`max_selections > 1`)
- Showing per-voter identity (who voted for what)
- Thread-aware poll voting (uses active room's `roomId`)

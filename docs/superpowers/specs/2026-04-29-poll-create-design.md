# Poll / Survey Creation — Design Spec

**Date:** 2026-04-29  
**Feature:** MSC3381 poll creation from the Matrix chat message input  
**Status:** Approved

---

## Overview

Add a "Umfrage erstellen" (create survey) action to the existing `showActions()` action sheet in `MatrixMessageInput`. Tapping it opens a modal where the user picks the poll kind, types a question, and adds answer options. On confirm the modal emits the data, the feature layer sends an `org.matrix.msc3381.poll.start` event to the Matrix room.

---

## Architecture

Layer separation follows the existing `room-edit` pattern:

```
MatrixMessageInput (ui)
  └─ surveyRequested = output<void>()

matrix-chat.ts (feature)
  └─ onSurveyRequested()
       ├─ opens PollCreateModal via ModalController
       └─ on confirm → chatService.sendPoll(roomId, data)

MatrixChatService (data-access)
  └─ sendPoll(roomId, MatrixPollData)
       └─ client.sendEvent('org.matrix.msc3381.poll.start', …)
```

---

## Data Model

Defined as an exported interface in `libs/chat/data-access/src/lib/matrix-chat.service.ts`, re-exported from `libs/chat/data-access/src/index.ts`:

```ts
export interface MatrixPollData {
  kind: 'disclosed' | 'undisclosed';
  question: string;
  answers: string[];   // min 2, max 20
}
```

Not stored in Firestore — sent directly as a Matrix event.

---

## MSC3381 Event Shape

```json
{
  "type": "org.matrix.msc3381.poll.start",
  "content": {
    "org.matrix.msc3381.poll": {
      "question": { "msgtype": "m.text", "body": "<question>" },
      "kind": "org.matrix.msc3381.poll.disclosed",
      "max_selections": 1,
      "answers": [
        { "id": "1", "org.matrix.msc3381.poll.answer": { "msgtype": "m.text", "body": "<answer 1>" } },
        { "id": "2", "org.matrix.msc3381.poll.answer": { "msgtype": "m.text", "body": "<answer 2>" } }
      ]
    },
    "body": "<question>\n1. <answer 1>\n2. <answer 2>"
  }
}
```

Answer `id` values are `String(index + 1)`. The `body` fallback is plain-text for clients that don't support MSC3381.

---

## Files

### New: `libs/chat/ui/src/lib/poll-create.form.ts`

Standalone Angular component `PollCreateForm` (`bk-poll-create-form`):

- **Poll kind** — `IonSelect` with two options:
  - `disclosed` → label `@chat.survey.open`
  - `undisclosed` → label `@chat.survey.closed`
- **Kind description** — `IonNote` below the select, switches text based on kind
- **Question** — `IonInput` floating label `@chat.survey.questionLabel`, placeholder `@chat.survey.questionPlaceholder`, maxlength 255
- **Answers** — `bk-strings` component:
  - `title="@chat.survey.answers"`
  - `addLabel="@chat.survey.addAnswer"`
  - `[readOnly]="false"`
  - `mask` overridden to `AllTextMask` (allows any characters, not lowercase-only)
  - `maxLength` set to 100
- **Inputs:** `formData = model.required<MatrixPollData>()`
- **Outputs:** `valid = output<boolean>()` — true when `question.trim().length > 0 && answers.length >= 2`

### New: `libs/chat/feature/src/lib/poll-create.modal.ts`

Standalone modal component `PollCreateModal` (`bk-poll-create-modal`):

- Injected: `ModalController`
- `bk-header` with title `@chat.survey.title`, `[isModal]="true"`
- `bk-change-confirmation` shown when `formValid()` is true — OK label translates to `@chat.survey.create`, Cancel to `@cancel`
- `ion-content` wrapping `bk-poll-create-form`
- `formData` signal initialised to `{ kind: 'disclosed', question: '', answers: [] }`
- `save()` → `modalController.dismiss(formData(), 'confirm')`
- `cancel()` → `modalController.dismiss(null, 'cancel')`

### Modified: `libs/chat/data-access/src/lib/matrix-chat.service.ts`

New method:

```ts
async sendPoll(roomId: string, data: MatrixPollData): Promise<void> {
  const answers = data.answers.map((body, i) => ({
    id: String(i + 1),
    'org.matrix.msc3381.poll.answer': { msgtype: 'm.text', body }
  }));
  const fallback = `${data.question}\n${data.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
  await this.client.sendEvent(roomId, 'org.matrix.msc3381.poll.start' as any, {
    'org.matrix.msc3381.poll': {
      question: { msgtype: 'm.text', body: data.question },
      kind: `org.matrix.msc3381.poll.${data.kind}`,
      max_selections: 1,
      answers
    },
    body: fallback
  });
}
```

### Modified: `libs/chat/feature/src/lib/matrix-chat.ts`

- Bind `(surveyRequested)="onSurveyRequested()"` on both main and thread `bk-matrix-message-input`
- New method `onSurveyRequested()`:
  - Creates `PollCreateModal` via `ModalController`
  - Passes current `roomId`
  - On `confirm` dismiss → calls `chatService.sendPoll(roomId, data)`

### Modified: `libs/chat/ui/src/lib/matrix-message-input.ts`

- Add `surveyRequested = output<void>()`
- In `addActionSheetButtons()`: push `createActionSheetButton('chat.attachment.survey', …, 'poll')`
- In `executeActions()` switch: case `'chat.attachment.survey'` → `this.surveyRequested.emit()`

---

## i18n Keys (`apps/scs-app/src/assets/i18n/de.json`)

| Key | Value |
|-----|-------|
| `@chat.attachment.survey` | `Umfrage erstellen` |
| `@chat.survey.title` | `Umfrage erstellen` |
| `@chat.survey.kind` | `Abstimmungsart` |
| `@chat.survey.open` | `Offene Umfrage` |
| `@chat.survey.closed` | `Geheime Umfrage` |
| `@chat.survey.openDescription` | `Abstimmende können die Ergebnisse nach Stimmabgabe sehen` |
| `@chat.survey.closedDescription` | `Die Ergebnisse werden erst nach Abschluss der Umfrage sichtbar` |
| `@chat.survey.questionLabel` | `Frage oder Thema` |
| `@chat.survey.questionPlaceholder` | `Schreibe etwas ...` |
| `@chat.survey.answers` | `Antwortmöglichkeiten erstellen` |
| `@chat.survey.addAnswer` | `Antwortmöglichkeit verfassen` |
| `@chat.survey.create` | `Umfrage erstellen` |

---

## Masks

Need an `AllTextMask` constant (or equivalent) in `@bk2/shared-config` that allows any character — `{ mask: /^.{0,100}$/ }`. Check if one exists before adding.

---

## Validation

- Question: required, non-empty after trim
- Answers: minimum 2, maximum 20
- "Umfrage erstellen" button disabled until both conditions are met (controlled by `formValid` signal in the modal)

---

## Out of Scope

- Displaying poll results / vote responses in the message list
- Ending a poll (`org.matrix.msc3381.poll.end`)
- Multiple-choice polls (`max_selections > 1`)
- Thread-aware poll sending (uses active room's `roomId`)

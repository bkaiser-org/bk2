# Poll / Survey Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Umfrage erstellen" action to the Matrix chat message input that sends an MSC3381 poll event to the room via a modal form using `bk-strings` for answer options.

**Architecture:** Feature-layer modal (`PollCreateModal`) is opened by `matrix-chat.ts` when `MatrixMessageInput` emits `surveyRequested`. The form component (`PollCreateForm`) lives in `chat-ui`, the modal in `chat-feature`. `MatrixChatStore` delegates to `MatrixChatService.sendPoll()` which fires `org.matrix.msc3381.poll.start` via `client.sendEvent()`.

**Tech Stack:** Angular 20 signals, NgRx Signal Store, Ionic Angular standalone, `matrix-js-sdk`, `bk-strings` (StringsComponent), Transloco i18n, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Modify | `libs/chat/data-access/src/lib/matrix-chat.service.ts` |
| Modify | `libs/chat/data-access/src/index.ts` |
| Modify | `libs/chat/feature/src/lib/matrix-chat.store.ts` |
| Create | `libs/chat/ui/src/lib/poll-create.form.ts` |
| Modify | `libs/chat/ui/src/index.ts` |
| Create | `libs/chat/feature/src/lib/poll-create.modal.ts` |
| Modify | `libs/chat/ui/src/lib/matrix-message-input.ts` |
| Modify | `libs/chat/feature/src/lib/matrix-chat.ts` |
| Modify | `apps/scs-app/src/assets/i18n/de.json` |

---

## Task 1: Add `MatrixPollData` interface and `sendPoll()` to the service

**Files:**
- Modify: `libs/chat/data-access/src/lib/matrix-chat.service.ts`
- Modify: `libs/chat/data-access/src/index.ts`

- [ ] **Step 1: Add the `MatrixPollData` interface**

Open `libs/chat/data-access/src/lib/matrix-chat.service.ts`. After the existing imports block, add the interface before the `@Injectable` decorator:

```typescript
export interface MatrixPollData {
  kind: 'disclosed' | 'undisclosed';
  question: string;
  answers: string[];   // min 2, max 20
}
```

- [ ] **Step 2: Add `sendPoll()` method to `MatrixChatService`**

In the same file, add this method after `sendLocation()` (around line 940):

```typescript
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
        kind: `org.matrix.msc3381.poll.${data.kind}`,
        max_selections: 1,
        answers
      },
      body: fallback
    } as any);
  }
```

- [ ] **Step 3: Export `MatrixPollData` from the data-access barrel**

Open `libs/chat/data-access/src/index.ts`. It currently reads:

```typescript
export * from './lib/matrix-chat.service';
```

This already re-exports everything from the service file, so `MatrixPollData` is automatically exported. Verify with:

```bash
grep "MatrixPollData" libs/chat/data-access/src/lib/matrix-chat.service.ts
```

Expected output:
```
export interface MatrixPollData {
```

- [ ] **Step 4: Type-check the data-access layer**

```bash
npx tsc --noEmit -p libs/chat/data-access/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/chat/data-access/src/lib/matrix-chat.service.ts
git commit -m "feat(chat): add MatrixPollData interface and sendPoll() to MatrixChatService"
```

---

## Task 2: Add `sendPoll()` to `MatrixChatStore`

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.store.ts`

- [ ] **Step 1: Add `sendPoll()` to the store's `withMethods` block**

Open `libs/chat/feature/src/lib/matrix-chat.store.ts`. Find the `sendLocation()` method and add `sendPoll()` directly after it, following the identical pattern:

```typescript
      /**
       * Send a poll (MSC3381)
       */
      async sendPoll(data: MatrixPollData): Promise<void> {
        const roomId = store.currentRoomId();
        if (!roomId) {
          console.warn('MatrixChatStore.sendPoll: No room selected');
          return;
        }
        try {
          await store.matrixService.sendPoll(roomId, data);
          debugMessage(`MatrixChatStore.sendPoll: Sent poll "${data.question}" to room ${roomId}`, store.currentUser());
        } catch (error) {
          console.error('MatrixChatStore.sendPoll: Failed to send poll:', error);
          throw error;
        }
      },
```

- [ ] **Step 2: Import `MatrixPollData` at the top of the store file**

The store imports from `@bk2/chat-data-access`. Check the existing import line:

```bash
grep "chat-data-access\|MatrixChatService" libs/chat/feature/src/lib/matrix-chat.store.ts | head -5
```

Add `MatrixPollData` to whichever import brings in `MatrixChatService`. For example, if it reads:

```typescript
import { MatrixChatService } from '@bk2/chat-data-access';
```

Change it to:

```typescript
import { MatrixChatService, MatrixPollData } from '@bk2/chat-data-access';
```

- [ ] **Step 3: Type-check the feature layer**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.store.ts
git commit -m "feat(chat): add sendPoll() to MatrixChatStore"
```

---

## Task 3: Create `PollCreateForm` component

**Files:**
- Create: `libs/chat/ui/src/lib/poll-create.form.ts`

`PollCreateForm` owns the three-part poll form: kind select, question input, and answer list. It derives validity locally and notifies the parent via outputs whenever data or validity changes.

Note: `bk-strings` calls `.toLowerCase()` internally on every answer — poll answers will be stored and sent in lowercase. This is an accepted trade-off from choosing option A (reuse `bk-strings` as-is).

- [ ] **Step 1: Create the form component file**

Create `libs/chat/ui/src/lib/poll-create.form.ts` with the following content:

```typescript
import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, output } from '@angular/core';
import {
  IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonNote, IonList
} from '@ionic/angular/standalone';

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
    IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonNote, IonList
  ],
  template: `
    <ion-list>
      <!-- Poll kind -->
      <ion-item>
        <ion-select
          [label]="'@chat.survey.kind' | translate | async"
          labelPlacement="floating"
          [value]="kind()"
          (ionChange)="kind.set($event.detail.value)"
          interface="popover"
        >
          <ion-select-option value="disclosed">{{ '@chat.survey.open' | translate | async }}</ion-select-option>
          <ion-select-option value="undisclosed">{{ '@chat.survey.closed' | translate | async }}</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item lines="none">
        <ion-note>{{ kindDescription() | translate | async }}</ion-note>
      </ion-item>

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
export class PollCreateForm {
  public formData = input.required<MatrixPollData>();
  public formDataChange = output<MatrixPollData>();
  public valid = output<boolean>();

  protected readonly anyCharMask = AnyCharacterMask;

  protected kind = linkedSignal(() => this.formData().kind);
  protected question = linkedSignal(() => this.formData().question);
  protected answers = linkedSignal(() => [...this.formData().answers]);

  protected kindDescription = computed(() =>
    this.kind() === 'disclosed'
      ? '@chat.survey.openDescription'
      : '@chat.survey.closedDescription'
  );

  constructor() {
    effect(() => {
      const data: MatrixPollData = {
        kind: this.kind(),
        question: this.question(),
        answers: this.answers()
      };
      this.formDataChange.emit(data);
      this.valid.emit(data.question.trim().length > 0 && data.answers.length >= 2);
    });
  }
}
```

- [ ] **Step 2: Export from the ui barrel**

Open `libs/chat/ui/src/index.ts` and add:

```typescript
export * from './lib/poll-create.form';
```

- [ ] **Step 3: Type-check the ui layer**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/ui/src/lib/poll-create.form.ts libs/chat/ui/src/index.ts
git commit -m "feat(chat): add PollCreateForm component"
```

---

## Task 4: Create `PollCreateModal` component

**Files:**
- Create: `libs/chat/feature/src/lib/poll-create.modal.ts`

The modal wraps `PollCreateForm`, shows the confirm toolbar only when the form is valid, and dismisses with the poll data on save.

- [ ] **Step 1: Create the modal file**

Create `libs/chat/feature/src/lib/poll-create.modal.ts`:

```typescript
import { Component, inject, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { MatrixPollData } from '@bk2/chat-data-access';
import { PollCreateForm } from '@bk2/chat-ui';

@Component({
  selector: 'bk-poll-create-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, PollCreateForm,
    IonContent
  ],
  template: `
    <bk-header title="@chat.survey.title" [isModal]="true" />
    @if (formValid()) {
      <bk-change-confirmation
        [showCancel]="true"
        okLabel="@chat.survey.create"
        (cancelClicked)="cancel()"
        (okClicked)="save()"
      />
    }
    <ion-content class="ion-no-padding">
      <bk-poll-create-form
        [formData]="formData()"
        (formDataChange)="formData.set($event)"
        (valid)="formValid.set($event)"
      />
    </ion-content>
  `
})
export class PollCreateModal {
  private readonly modalController = inject(ModalController);

  protected formData = signal<MatrixPollData>({ kind: 'disclosed', question: '', answers: [] });
  protected formValid = signal(false);

  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }
}
```

- [ ] **Step 2: Export from the feature barrel**

Open `libs/chat/feature/src/index.ts` and add:

```typescript
export * from './lib/poll-create.modal';
```

- [ ] **Step 3: Type-check the feature layer**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/chat/feature/src/lib/poll-create.modal.ts libs/chat/feature/src/index.ts
git commit -m "feat(chat): add PollCreateModal component"
```

---

## Task 5: Add `surveyRequested` output and action button to `MatrixMessageInput`

**Files:**
- Modify: `libs/chat/ui/src/lib/matrix-message-input.ts`

- [ ] **Step 1: Add the `surveyRequested` output**

Open `libs/chat/ui/src/lib/matrix-message-input.ts`. Find the outputs section (the group with `messageSent`, `fileSent`, `locationSent`, etc.) and add:

```typescript
  surveyRequested = output<void>();
```

- [ ] **Step 2: Add the survey button to `addActionSheetButtons()`**

Find the `addActionSheetButtons()` method. It currently ends with:

```typescript
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.position', this.imgixBaseUrl, 'location'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
```

Insert the survey button before `cancel`:

```typescript
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.position', this.imgixBaseUrl, 'location'));
    actionSheetOptions.buttons.push(createActionSheetButton('chat.attachment.survey', this.imgixBaseUrl, 'poll'));
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
```

- [ ] **Step 3: Handle the survey case in `executeActions()`**

Find the `switch (data.action)` block in `executeActions()`. Add a case after `'chat.attachment.position'`:

```typescript
        case 'chat.attachment.survey':
          this.surveyRequested.emit();
          break;
```

- [ ] **Step 4: Type-check the ui layer**

```bash
npx tsc --noEmit -p libs/chat/ui/tsconfig.json
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add libs/chat/ui/src/lib/matrix-message-input.ts
git commit -m "feat(chat): add surveyRequested output and action button to MatrixMessageInput"
```

---

## Task 6: Wire modal presentation in `matrix-chat.ts`

**Files:**
- Modify: `libs/chat/feature/src/lib/matrix-chat.ts`

- [ ] **Step 1: Import `ModalController` and `PollCreateModal`**

Open `libs/chat/feature/src/lib/matrix-chat.ts`. The existing Ionic import line is:

```typescript
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, ToastController, ActionSheetOptions, ActionSheetController } from '@ionic/angular/standalone';
```

Add `ModalController` to it:

```typescript
import { IonCard, IonCardContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonBadge, ToastController, ActionSheetOptions, ActionSheetController, ModalController } from '@ionic/angular/standalone';
```

Import `PollCreateModal` — add this line after the existing chat imports:

```typescript
import { PollCreateModal } from './poll-create.modal';
```

Import `MatrixPollData` — add to the existing `@bk2/shared-models` import or as a separate line:

```typescript
import { MatrixPollData } from '@bk2/chat-data-access';
```

- [ ] **Step 2: Inject `ModalController`**

Find the injection block (around line 438):

```typescript
  private readonly store = inject(MatrixChatStore);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly toastController = inject(ToastController);
  private actionSheetController = inject(ActionSheetController);
```

Add:

```typescript
  private readonly modalController = inject(ModalController);
```

- [ ] **Step 3: Add `onSurveyRequested()` handler**

Find `onLocationSent()` and add the new handler directly after it:

```typescript
  async onSurveyRequested(): Promise<void> {
    const modal = await this.modalController.create({
      component: PollCreateModal
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<MatrixPollData>();
    if (role === 'confirm' && data) {
      try {
        await this.store.sendPoll(data);
      } catch (error) {
        console.error('MatrixChat: Failed to send poll:', error);
      }
    }
  }
```

- [ ] **Step 4: Bind the output in the template**

Find the main `bk-matrix-message-input` in the template (the one with `(locationSent)`):

```html
<bk-matrix-message-input
  [roomId]="currentRoomId()"
  [typingUsers]="typingUsers()"
  [replyToMessage]="replyToMessage()"
  (messageSent)="onMessageSent($event)"
  (fileSent)="onFileSent($event)"
  (locationSent)="onLocationSent()"
  (videoCallStarted)="onVideoCallStarted()"
  (typing)="onTyping($event)"
  (cancelReplyClicked)="onCancelReply()"
/>
```

Add `(surveyRequested)="onSurveyRequested()"`:

```html
<bk-matrix-message-input
  [roomId]="currentRoomId()"
  [typingUsers]="typingUsers()"
  [replyToMessage]="replyToMessage()"
  (messageSent)="onMessageSent($event)"
  (fileSent)="onFileSent($event)"
  (locationSent)="onLocationSent()"
  (videoCallStarted)="onVideoCallStarted()"
  (typing)="onTyping($event)"
  (cancelReplyClicked)="onCancelReply()"
  (surveyRequested)="onSurveyRequested()"
/>
```

Also add it to the thread input (the second `bk-matrix-message-input`):

```html
<bk-matrix-message-input
  [typingUsers]="[]"
  (messageSent)="onThreadMessageSent($event)"
  (fileSent)="onThreadFileSent($event)"
  (typing)="onTyping($event)"
  (surveyRequested)="onSurveyRequested()"
/>
```

- [ ] **Step 5: Type-check the feature layer**

```bash
npx tsc --noEmit -p libs/chat/feature/tsconfig.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add libs/chat/feature/src/lib/matrix-chat.ts
git commit -m "feat(chat): wire PollCreateModal in matrix-chat.ts"
```

---

## Task 7: Add i18n translations

**Files:**
- Modify: `apps/scs-app/src/assets/i18n/de.json`

- [ ] **Step 1: Add the action sheet key**

Open `apps/scs-app/src/assets/i18n/de.json`. Find the `actionsheet.chat.attachment` section (currently around line 1927):

```json
"attachment": {
  "image": "Photo oder Video",
  "file": "Datei",
  "position": "Position senden"
},
```

Add the survey entry:

```json
"attachment": {
  "image": "Photo oder Video",
  "file": "Datei",
  "position": "Position senden",
  "survey": "Umfrage erstellen"
},
```

- [ ] **Step 2: Add the `chat.survey` section**

Find the `chat` top-level section (around line 2483). Inside the `chat` object, find the `fields` property and add a `survey` sibling object before it:

```json
"survey": {
  "title": "Umfrage erstellen",
  "kind": "Abstimmungsart",
  "open": "Offene Umfrage",
  "closed": "Geheime Umfrage",
  "openDescription": "Abstimmende können die Ergebnisse nach Stimmabgabe sehen",
  "closedDescription": "Die Ergebnisse werden erst nach Abschluss der Umfrage sichtbar",
  "questionLabel": "Frage oder Thema",
  "questionPlaceholder": "Schreibe etwas ...",
  "answers": "Antwortmöglichkeiten erstellen",
  "addAnswer": "Antwortmöglichkeit verfassen",
  "create": "Umfrage erstellen"
},
```

- [ ] **Step 3: Validate JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/scs-app/src/assets/i18n/de.json','utf8')); console.log('valid')"
```

Expected output: `valid`

- [ ] **Step 4: Commit**

```bash
git add apps/scs-app/src/assets/i18n/de.json
git commit -m "feat(chat): add i18n translations for poll creation"
```

---

## Task 8: End-to-end type-check and smoke test

- [ ] **Step 1: Full type-check of the app**

```bash
npx tsc --noEmit -p apps/scs-app/tsconfig.app.json
```

Expected: no errors.

- [ ] **Step 2: Build the chat-ui library**

```bash
pnpm nx build chat-ui --skip-nx-cache
```

Expected: `Successfully ran target build for project chat-ui`

- [ ] **Step 3: Build the chat-feature library**

```bash
pnpm nx build chat-feature --skip-nx-cache
```

Expected: `Successfully ran target build for project chat-feature`

- [ ] **Step 4: Verify no build artifacts in source tree**

```bash
find libs/chat -name "*.js" -o -name "*.d.ts" | grep -v node_modules
```

Expected: no output (empty).

- [ ] **Step 5: Manual smoke test checklist**

Serve the app:
```bash
pnpm nx serve scs-app
```

1. Open the chat view and navigate into any room.
2. Tap the **+** (add attachment) button → the action sheet should show a fourth item: **"Umfrage erstellen"**.
3. Tap "Umfrage erstellen" → the `PollCreateModal` opens with title "Umfrage erstellen".
4. The "Umfrage erstellen" confirmation button must **not** be visible yet (form invalid).
5. Change kind to "Geheime Umfrage" → description note updates to the closed text.
6. Type a question → still no confirm button (need ≥ 2 answers).
7. Add two answers via the `bk-strings` add-input → confirm button **appears**.
8. Tap "Umfrage erstellen" → modal dismisses.
9. Check the Matrix room in another client (e.g., Element Web) — the poll event should appear as an interactive poll.
10. Tap "Abbrechen" at any point → modal dismisses without sending.

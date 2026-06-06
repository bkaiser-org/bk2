# Schedule Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "find a common date" scheduling poll to group calendars — author proposes dates, members respond, author picks one winner and it's announced in the group Matrix chat.

**Architecture:** Extend `CalEventModel` with a `state` field (`proposed`/`provisional`/`definitive`); proposed dates share a `seriesId` — no new Firestore collection. Two new modals (create-schedule, response-table) plus store operations and action-sheet extensions.

**Tech Stack:** Angular 20 signals, NgRx Signal Store, Ionic Angular, Firestore batch writes, `ion-datetime` multi-select, FullCalendar, MatrixChatStore.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `libs/shared/models/src/lib/calEvent.model.ts` | Modify | Add `state` field |
| `libs/calevent/util/src/lib/calevent.util.ts` | Modify | Add 3 utility functions |
| `libs/calevent/util/src/lib/calevent.util.spec.ts` | Modify | Tests for new utilities |
| `libs/calevent/feature/src/lib/schedule-new.modal.ts` | Create | Create-schedule modal (Screen A) |
| `libs/calevent/feature/src/lib/schedule-table.modal.ts` | Create | Response-table modal (Screen B) |
| `libs/calevent/feature/src/lib/calevent.store.ts` | Modify | Add `schedule()` and `closeSchedule()` |
| `libs/calevent/feature/src/lib/calevent-list.component.ts` | Modify | Action sheet items, popover handler, badge, Matrix send |
| `libs/calevent/feature/src/lib/calevent-list.component.scss` | Modify | CSS for `state-proposed` and `state-provisional` |
| `apps/scs-app/src/assets/i18n/de.json` | Modify | Add `schedule` translation section |

---

## Task 1: Add `state` field to CalEventModel

**Files:**
- Modify: `libs/shared/models/src/lib/calEvent.model.ts`

- [ ] **Step 1: Add the field**

  In `calEvent.model.ts`, add one line after the `isOpen` field (around line where `attendees` is declared):

  ```typescript
  public state: 'proposed' | 'provisional' | 'definitive' = 'definitive';
  ```

  The full block around it becomes:

  ```typescript
  public isOpen = false;
  public attendees: Attendee[] = [];
  public state: 'proposed' | 'provisional' | 'definitive' = 'definitive';
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit -p libs/shared/models/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add libs/shared/models/src/lib/calEvent.model.ts
  git commit -m "feat(models): add state field to CalEventModel"
  ```

---

## Task 2: Add utility functions (TDD)

**Files:**
- Modify: `libs/calevent/util/src/lib/calevent.util.ts`
- Modify: `libs/calevent/util/src/lib/calevent.util.spec.ts`

- [ ] **Step 1: Write failing tests**

  Append to `calevent.util.spec.ts`:

  ```typescript
  import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';
  import { isSchedulePoll, getCalEventCssClass, formatScheduleCloseMessage } from './calevent.util';

  describe('isSchedulePoll', () => {
    it('returns true when at least one event has state proposed', () => {
      const e1 = new CalEventModel('t1');
      const e2 = new CalEventModel('t1');
      e1.state = 'proposed';
      expect(isSchedulePoll([e1, e2])).toBe(true);
    });

    it('returns false when no events are proposed', () => {
      const e = new CalEventModel('t1');
      e.state = 'definitive';
      expect(isSchedulePoll([e])).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(isSchedulePoll([])).toBe(false);
    });
  });

  describe('getCalEventCssClass', () => {
    it('returns state-proposed for proposed', () => {
      expect(getCalEventCssClass('proposed')).toBe('state-proposed');
    });

    it('returns state-provisional for provisional', () => {
      expect(getCalEventCssClass('provisional')).toBe('state-provisional');
    });

    it('returns empty string for definitive', () => {
      expect(getCalEventCssClass('definitive')).toBe('');
    });
  });

  describe('formatScheduleCloseMessage', () => {
    it('formats message with event name and date', () => {
      const msg = formatScheduleCloseMessage('Vereins-Ausflug', '20250622');
      expect(msg).toContain('✅ Vereins-Ausflug');
      expect(msg).toContain('Termin:');
    });

    it('appends author message when provided', () => {
      const msg = formatScheduleCloseMessage('Ausflug', '20250622', 'Freue mich!');
      expect(msg).toContain('Freue mich!');
    });

    it('omits blank author message', () => {
      const msg = formatScheduleCloseMessage('Ausflug', '20250622', '  ');
      expect(msg.split('\n')).toHaveLength(2);
    });
  });
  ```

- [ ] **Step 2: Run tests — verify they fail**

  ```bash
  pnpm run test calevent-util
  ```

  Expected: FAIL — `isSchedulePoll is not a function` (or similar).

- [ ] **Step 3: Implement utility functions**

  Append to `libs/calevent/util/src/lib/calevent.util.ts`:

  ```typescript
  export function isSchedulePoll(events: CalEventModel[]): boolean {
    return events.some(e => e.state === 'proposed');
  }

  export function getCalEventCssClass(state: 'proposed' | 'provisional' | 'definitive'): string {
    if (state === 'proposed') return 'state-proposed';
    if (state === 'provisional') return 'state-provisional';
    return '';
  }

  export function formatScheduleCloseMessage(
    eventName: string,
    startDate: string,
    authorMessage?: string
  ): string {
    const date = convertDateFormatToString(startDate, DateFormat.storeDate, DateFormat.viewDateLong);
    const lines = [`✅ ${eventName}`, `Termin: ${date}`];
    if (authorMessage?.trim()) lines.push(authorMessage.trim());
    return lines.join('\n');
  }
  ```

  Add missing import at the top of the file if not already present:

  ```typescript
  import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';
  ```

- [ ] **Step 4: Run tests — verify they pass**

  ```bash
  pnpm run test calevent-util
  ```

  Expected: all tests PASS.

- [ ] **Step 5: Type-check**

  ```bash
  npx tsc --noEmit -p libs/calevent/util/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add libs/calevent/util/src/lib/calevent.util.ts libs/calevent/util/src/lib/calevent.util.spec.ts
  git commit -m "feat(calevent-util): add schedule poll utility functions"
  ```

---

## Task 3: Add i18n keys

**Files:**
- Modify: `apps/scs-app/src/assets/i18n/de.json`

- [ ] **Step 1: Add `schedule` and `actionsheet` entries**

  In `de.json`, add a top-level `"schedule"` section and extend `"actionsheet"` with new keys. Find the `"actionsheet"` object and add:

  ```json
  "calevent.viewSchedule": "Abstimmung anzeigen",
  "calevent.closeSchedule": "Diesen Termin wählen & Abstimmung schliessen"
  ```

  Add a new top-level `"schedule"` section (place it alphabetically):

  ```json
  "schedule": {
    "title": "Termin finden",
    "topic": "Thema / Titel",
    "description": "Beschreibung (optional)",
    "dates": "Terminvorschläge",
    "addDate": "+ Termin",
    "confirmDates": "{{count}} Tage übernehmen",
    "invite": "Mitglieder einladen",
    "tableTitle": "Terminabstimmung",
    "pendingCount": "{{count}} noch nicht geantwortet",
    "closeTitle": "Abstimmung schliessen",
    "closeMessage": "{{date}} wird als definitiver Termin gewählt. Alle anderen Vorschläge werden entfernt.",
    "optionalMessage": "Optionale Nachricht an die Gruppe...",
    "confirm": "Bestätigen"
  }
  ```

  Also add to the `"menu"` section (or wherever menu item labels live):

  ```json
  "schedule": "Terminabstimmung starten"
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add apps/scs-app/src/assets/i18n/de.json
  git commit -m "feat(i18n): add schedule poll translation keys"
  ```

---

## Task 4: Create ScheduleNewModal

**Files:**
- Create: `libs/calevent/feature/src/lib/schedule-new.modal.ts`

- [ ] **Step 1: Create the modal file**

  ```typescript
  import { Component, inject, signal, computed } from '@angular/core';
  import {
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonInput, IonTextarea,
    IonChip, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
    ModalController,
  } from '@ionic/angular/standalone';
  import { TranslocoPipe } from '@jsverse/transloco';
  import { SvgIconPipe } from '@bk2/shared-pipes';

  @Component({
    selector: 'bk-schedule-new-modal',
    standalone: true,
    imports: [
      IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
      IonContent, IonItem, IonLabel, IonInput, IonTextarea,
      IonChip, IonIcon, IonDatetime, IonDatetimeButton, IonModal,
      TranslocoPipe, SvgIconPipe,
    ],
    template: `
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ '@schedule.title' | transloco }}</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="cancel()">{{ '@cancel' | transloco }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <ion-item>
          <ion-label position="stacked">{{ '@schedule.topic' | transloco }}</ion-label>
          <ion-input
            [value]="name()"
            (ionInput)="name.set($any($event.target).value)"
            required
          />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ '@schedule.description' | transloco }}</ion-label>
          <ion-textarea
            [value]="description()"
            (ionInput)="description.set($any($event.target).value)"
            rows="2"
          />
        </ion-item>

        <ion-item lines="none">
          <ion-label>{{ '@schedule.dates' | transloco }}</ion-label>
        </ion-item>

        <div class="date-chips">
          @for (date of selectedDates(); track date) {
            <ion-chip (click)="removeDate(date)">
              {{ formatDate(date) }}
              <ion-icon src="{{ 'cancel-circle' | svgIcon }}" />
            </ion-chip>
          }
          <ion-chip id="open-date-picker" color="primary" outline>
            {{ '@schedule.addDate' | transloco }}
          </ion-chip>
        </div>

        <ion-modal trigger="open-date-picker" [keepContentsMounted]="true">
          <ng-template>
            <ion-datetime
              presentation="date"
              [multiple]="true"
              [value]="selectedDates()"
              (ionChange)="onDatetimeChange($event)"
            />
            <ion-button expand="block" (click)="confirmDates()">
              {{ '@schedule.confirmDates' | transloco: { count: pendingDates().length } }}
            </ion-button>
          </ng-template>
        </ion-modal>

        <ion-button
          expand="block"
          [disabled]="!canSubmit()"
          (click)="submit()"
          class="ion-margin-top"
        >
          {{ '@schedule.invite' | transloco }}
        </ion-button>
      </ion-content>
    `,
  })
  export class ScheduleNewModal {
    private readonly modalCtrl = inject(ModalController);

    protected readonly name = signal('');
    protected readonly description = signal('');
    protected readonly selectedDates = signal<string[]>([]);
    protected readonly pendingDates = signal<string[]>([]);

    protected readonly canSubmit = computed(
      () => this.name().trim().length > 0 && this.selectedDates().length > 0
    );

    protected formatDate(isoDate: string): string {
      const d = new Date(isoDate);
      return d.toLocaleDateString('de-CH', { weekday: 'short', day: '2-digit', month: '2-digit' });
    }

    protected onDatetimeChange(event: CustomEvent): void {
      const val = event.detail.value;
      this.pendingDates.set(Array.isArray(val) ? val : val ? [val] : []);
    }

    protected confirmDates(): void {
      this.selectedDates.set([...this.pendingDates()].sort());
      // close the inner modal
      const modal = document.querySelector('ion-modal[trigger="open-date-picker"]') as HTMLIonModalElement;
      modal?.dismiss();
    }

    protected removeDate(date: string): void {
      this.selectedDates.update(dates => dates.filter(d => d !== date));
    }

    protected cancel(): void {
      this.modalCtrl.dismiss(null, 'cancel');
    }

    protected submit(): void {
      this.modalCtrl.dismiss({
        name: this.name().trim(),
        description: this.description().trim(),
        dates: this.selectedDates(),
      }, 'confirm');
    }
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/schedule-new.modal.ts
  git commit -m "feat(calevent): add ScheduleNewModal for creating schedule polls"
  ```

---

## Task 5: Create ScheduleTableModal

**Files:**
- Create: `libs/calevent/feature/src/lib/schedule-table.modal.ts`

- [ ] **Step 1: Create the modal file**

  ```typescript
  import { Component, inject, input, computed } from '@angular/core';
  import {
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonAvatar, IonLabel, ModalController,
  } from '@ionic/angular/standalone';
  import { TranslocoPipe } from '@jsverse/transloco';
  import { CalEventStore } from './calevent.store';

  @Component({
    selector: 'bk-schedule-table-modal',
    standalone: true,
    imports: [
      IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
      IonContent, IonAvatar, IonLabel, TranslocoPipe,
    ],
    template: `
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ '@schedule.tableTitle' | transloco }}</ion-title>
          <ion-buttons slot="end">
            <ion-button (click)="close()">{{ '@close' | transloco }}</ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <div class="schedule-table-wrapper">
          <table class="schedule-table">
            <thead>
              <tr>
                <th class="member-col"></th>
                @for (event of proposedEvents(); track event.bkey) {
                  <th class="date-col">
                    <div>{{ formatDayName(event.startDate) }}</div>
                    <div class="date-sub">{{ formatShortDate(event.startDate) }}</div>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (member of members(); track member.key) {
                <tr [class.my-row]="member.key === currentUserKey()">
                  <td>
                    <div class="member-cell">
                      <ion-avatar class="small-avatar">
                        <div class="initials">{{ initials(member.firstName, member.lastName) }}</div>
                      </ion-avatar>
                      <span class="member-name">{{ member.firstName }} {{ member.lastName }}</span>
                    </div>
                  </td>
                  @for (event of proposedEvents(); track event.bkey) {
                    <td
                      [class.tappable]="member.key === currentUserKey()"
                      (click)="member.key === currentUserKey() ? toggleResponse(event.bkey) : null"
                    >
                      {{ responseIcon(member.key, event.bkey) }}
                    </td>
                  }
                </tr>
              }
              <tr class="count-row">
                <td>Zusagen</td>
                @for (event of proposedEvents(); track event.bkey) {
                  <td [class.best]="isBestDate(event.bkey)">
                    {{ acceptanceCount(event.bkey) }}{{ isBestDate(event.bkey) ? ' ★' : '' }}
                  </td>
                }
              </tr>
            </tbody>
          </table>
        </div>
        @if (pendingCount() > 0) {
          <p class="pending-hint">
            {{ '@schedule.pendingCount' | transloco: { count: pendingCount() } }}
          </p>
        }
      </ion-content>
    `,
    styles: [`
      .schedule-table-wrapper { overflow-x: auto; }
      .schedule-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .schedule-table th, .schedule-table td { border: 1px solid var(--ion-color-light-shade); padding: 6px; text-align: center; }
      .member-col { min-width: 120px; text-align: left; }
      .member-cell { display: flex; align-items: center; gap: 8px; }
      .small-avatar { width: 28px; height: 28px; }
      .initials { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: var(--ion-color-primary); color: white; font-size: 10px; font-weight: 700; border-radius: 50%; }
      .member-name { font-size: 12px; }
      .date-sub { font-size: 10px; color: var(--ion-color-medium); }
      .my-row td { background: var(--ion-color-light); }
      .tappable { cursor: pointer; }
      .count-row td { background: var(--ion-color-light-shade); font-weight: 600; }
      .count-row td.best { color: var(--ion-color-success); }
      .pending-hint { font-size: 12px; color: var(--ion-color-medium); font-style: italic; padding: 8px 0; }
    `],
  })
  export class ScheduleTableModal {
    private readonly modalCtrl = inject(ModalController);
    protected readonly store = inject(CalEventStore);

    readonly seriesId = input.required<string>();

    protected readonly proposedEvents = computed(() =>
      this.store.calEvents().filter(e => e.seriesId === this.seriesId() && e.state === 'proposed')
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
    );

    protected readonly invitations = computed(() =>
      this.store.invitations().filter(inv =>
        this.proposedEvents().some(e => e.bkey === inv.caleventKey)
      )
    );

    protected readonly members = computed(() => {
      const seen = new Set<string>();
      const result: { key: string; firstName: string; lastName: string }[] = [];
      // put current user first
      const myKey = this.currentUserKey();
      for (const inv of this.invitations()) {
        if (!seen.has(inv.inviteeKey)) {
          seen.add(inv.inviteeKey);
          if (inv.inviteeKey === myKey) result.unshift({ key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName });
          else result.push({ key: inv.inviteeKey, firstName: inv.inviteeFirstName, lastName: inv.inviteeLastName });
        }
      }
      return result;
    });

    protected readonly currentUserKey = computed(() => this.store.currentUser()?.personKey ?? '');

    protected readonly pendingCount = computed(() => {
      const totalExpected = this.members().length * this.proposedEvents().length;
      const responded = this.invitations().filter(inv => inv.state !== 'invited').length;
      return Math.max(0, totalExpected - responded);
    });

    protected formatDayName(storeDate: string): string {
      const d = this.parseDateStr(storeDate);
      return d.toLocaleDateString('de-CH', { weekday: 'short' });
    }

    protected formatShortDate(storeDate: string): string {
      const d = this.parseDateStr(storeDate);
      return `${d.getDate()}.${d.getMonth() + 1}`;
    }

    private parseDateStr(storeDate: string): Date {
      return new Date(
        +storeDate.substring(0, 4),
        +storeDate.substring(4, 6) - 1,
        +storeDate.substring(6, 8)
      );
    }

    protected initials(first: string, last: string): string {
      return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
    }

    protected responseIcon(memberKey: string, eventBkey: string): string {
      const inv = this.invitations().find(i => i.inviteeKey === memberKey && i.caleventKey === eventBkey);
      if (!inv || inv.state === 'invited') return '–';
      if (inv.state === 'accepted') return '✓';
      return '✗';
    }

    protected acceptanceCount(eventBkey: string): number {
      return this.invitations().filter(i => i.caleventKey === eventBkey && i.state === 'accepted').length;
    }

    protected isBestDate(eventBkey: string): boolean {
      const counts = this.proposedEvents().map(e => this.acceptanceCount(e.bkey));
      const max = Math.max(...counts);
      return max > 0 && this.acceptanceCount(eventBkey) === max;
    }

    protected toggleResponse(eventBkey: string): void {
      const inv = this.invitations().find(
        i => i.inviteeKey === this.currentUserKey() && i.caleventKey === eventBkey
      );
      if (!inv) return;
      const next = inv.state === 'accepted' ? 'declined' : 'accepted';
      this.store.changeInvitationState(inv, next);
    }

    protected close(): void {
      this.modalCtrl.dismiss();
    }
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/schedule-table.modal.ts
  git commit -m "feat(calevent): add ScheduleTableModal for schedule poll responses"
  ```

---

## Task 6: Add `schedule()` and `closeSchedule()` to the store

**Files:**
- Modify: `libs/calevent/feature/src/lib/calevent.store.ts`

- [ ] **Step 1: Add imports at the top of the file**

  Add to the existing imports:

  ```typescript
  import { ScheduleNewModal } from './schedule-new.modal';
  import { generateRandomString } from '@bk2/shared-util-core';
  ```

  (`generateRandomString` may already be imported — check and skip if so.)

- [ ] **Step 2: Add `schedule()` method**

  Add after the `add()` method:

  ```typescript
  async schedule(): Promise<void> {
    if (!store.isGroupCalendar()) return;
    const modal = await store.modalController.create({
      component: ScheduleNewModal,
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<{ name: string; description: string; dates: string[] }>();
    if (role !== 'confirm' || !data) return;

    const seriesId = generateRandomString(18);
    let index = 0;
    for (const isoDate of data.dates) {
      const startDate = isoDate.replace(/-/g, '').substring(0, 8); // ISO → yyyyMMdd
      const calevent = new CalEventModel(store.tenantId());
      calevent.bkey = seriesId + index.toString().padStart(2, '0');
      calevent.seriesId = seriesId;
      calevent.name = data.name;
      calevent.description = data.description;
      calevent.state = 'proposed';
      calevent.isOpen = false;
      calevent.startDate = startDate;
      calevent.fullDay = true;
      calevent.durationMinutes = 1440;
      calevent.calendars = [store.calendarName()];
      calevent.responsiblePersons = store.currentUser()
        ? [{ bkey: store.currentUser()!.personKey, name1: store.currentUser()!.firstName, name2: store.currentUser()!.lastName, url: '' }]
        : [];
      calevent.index = getCaleventIndex(calevent);
      await store.calEventService.create(calevent, store.currentUser());
      await store.inviteGroupMembers(calevent, false);
      index++;
    }
  }
  ```

  Add the `CalEventModel` import if not already present:

  ```typescript
  import { CalEventModel } from '@bk2/shared-models';
  ```

  Add the `getCaleventIndex` import if not already present:

  ```typescript
  import { getCaleventIndex } from '@bk2/calevent-util';
  ```

- [ ] **Step 3: Add `closeSchedule()` method**

  Add after `schedule()`:

  ```typescript
  async closeSchedule(selectedEvent: CalEventModel): Promise<void> {
    const seriesId = selectedEvent.seriesId;
    const batch = store.firestoreService.getBatch();

    // 1. Promote selected event to definitive and decouple from series
    const selectedRef = doc(store.firestoreService.firestore, `calevents/${selectedEvent.bkey}`);
    batch.update(selectedRef, { state: 'definitive', seriesId: '' });

    // 2. Archive all other proposed events in the same series
    const others = store.calEvents().filter(
      e => e.seriesId === seriesId && e.bkey !== selectedEvent.bkey && e.state === 'proposed'
    );
    for (const other of others) {
      const ref = doc(store.firestoreService.firestore, `calevents/${other.bkey}`);
      batch.update(ref, { isArchived: true });
    }

    await batch.commit();
  }
  ```

  Add import if not already present:

  ```typescript
  import { doc } from 'firebase/firestore';
  ```

- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/calevent.store.ts
  git commit -m "feat(calevent): add schedule() and closeSchedule() to CalEventStore"
  ```

---

## Task 7: Update `calevent-list.component.ts`

**Files:**
- Modify: `libs/calevent/feature/src/lib/calevent-list.component.ts`

- [ ] **Step 1: Add imports**

  Add to the imports at the top:

  ```typescript
  import { MatrixChatStore } from '@bk2/chat-feature';
  import { MatrixChatService } from '@bk2/chat-data-access';
  import { ScheduleTableModal } from './schedule-table.modal';
  import { formatScheduleCloseMessage, getCalEventCssClass } from '@bk2/calevent-util';
  ```

  If `@bk2/chat-feature` or `@bk2/chat-data-access` are not in `libs/calevent/feature/package.json`, add them:

  ```json
  "@bk2/chat-feature": "*",
  "@bk2/chat-data-access": "*"
  ```

  And add to `libs/calevent/feature/tsconfig.json` references if needed.

- [ ] **Step 2: Inject MatrixChatStore and MatrixChatService**

  In the component class, add:

  ```typescript
  private readonly matrixChatStore = inject(MatrixChatStore);
  private readonly matrixChatService = inject(MatrixChatService);
  ```

- [ ] **Step 3: Handle `'schedule'` in `onPopoverDismiss`**

  In `onPopoverDismiss`, add a new case alongside `'add'`, `'exportRaw'`, `'exportIcs'`:

  ```typescript
  case 'schedule':
    this.store.schedule();
    break;
  ```

- [ ] **Step 4: Add action sheet items for proposed events**

  In `addActionSheetButtons()`, before the download ICS divider, add:

  ```typescript
  if (calevent.state === 'proposed') {
    actionSheetOptions.buttons.push(
      createActionSheetButton('calevent.viewSchedule', this.imgixBaseUrl, 'list')
    );
    if (this.canChange(calevent)) {
      actionSheetOptions.buttons.push(
        createActionSheetButton('calevent.closeSchedule', this.imgixBaseUrl, 'lock-closed')
      );
    }
  }
  ```

- [ ] **Step 5: Handle the new action sheet actions**

  In the `showActions` method where the action sheet result is handled (look for `(ionActionSheetDidDismiss)` or the `.onDidDismiss()` handler), add:

  ```typescript
  case 'calevent.viewSchedule':
    await this.openScheduleTable(calevent);
    break;

  case 'calevent.closeSchedule':
    await this.confirmCloseSchedule(calevent);
    break;
  ```

- [ ] **Step 6: Add `openScheduleTable()` method**

  ```typescript
  private async openScheduleTable(calevent: CalEventModel): Promise<void> {
    const modal = await this.modalController.create({
      component: ScheduleTableModal,
      componentProps: { seriesId: calevent.seriesId },
    });
    await modal.present();
  }
  ```

- [ ] **Step 7: Add `confirmCloseSchedule()` method**

  ```typescript
  private async confirmCloseSchedule(calevent: CalEventModel): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translocoService.translate('@schedule.closeTitle'),
      message: this.translocoService.translate('@schedule.closeMessage', {
        date: new Date(
          +calevent.startDate.substring(0, 4),
          +calevent.startDate.substring(4, 6) - 1,
          +calevent.startDate.substring(6, 8)
        ).toLocaleDateString('de-CH', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
      }),
      inputs: [{ name: 'authorMessage', type: 'textarea', placeholder: this.translocoService.translate('@schedule.optionalMessage') }],
      buttons: [
        { text: this.translocoService.translate('@cancel'), role: 'cancel' },
        {
          text: this.translocoService.translate('@schedule.confirm'),
          handler: async (data: { authorMessage: string }) => {
            const seriesId = calevent.seriesId;
            await this.store.closeSchedule(calevent);
            // send Matrix notification after Firestore batch resolves
            const message = formatScheduleCloseMessage(calevent.name, calevent.startDate, data.authorMessage);
            const groupId = this.store.groupCalendarId();
            if (groupId) {
              const { roomId } = await this.matrixChatStore.requestGroupRoomAccess(groupId);
              await this.matrixChatService.sendMessage(roomId, message);
            }
          },
        },
      ],
    });
    await alert.present();
  }
  ```

  Add `AlertController` and `TranslocoService` injections if not already present:

  ```typescript
  private readonly alertController = inject(AlertController);
  private readonly translocoService = inject(TranslocoService);
  ```

  Add imports:

  ```typescript
  import { AlertController } from '@ionic/angular/standalone';
  import { TranslocoService } from '@jsverse/transloco';
  ```

- [ ] **Step 8: Update FullCalendar event rendering for CSS class + badge**

  Find where `convertCalEventToFullCalendar` is called in the FullCalendar options setup (look for `events:` array mapping in the component). Replace the mapping with:

  ```typescript
  events: this.store.filteredCalEvents()?.map(e => ({
    ...convertCalEventToFullCalendar(e),
    classNames: [getCalEventCssClass(e.state)].filter(Boolean),
    extendedProps: {
      bkey: e.bkey,
      state: e.state,
      seriesId: e.seriesId,
      acceptanceCount: this.store.invitations().filter(inv => inv.caleventKey === e.bkey && inv.state === 'accepted').length,
      invitedCount: this.store.invitations().filter(inv => inv.caleventKey === e.bkey).length,
    },
  })) ?? []
  ```

  Add `eventContent` to the FullCalendar options to render a badge on proposed events:

  ```typescript
  eventContent: (arg) => {
    if (arg.event.extendedProps['state'] === 'proposed') {
      const acc = arg.event.extendedProps['acceptanceCount'];
      const tot = arg.event.extendedProps['invitedCount'];
      return { html: `<div class="fc-event-title">${arg.event.title} <span class="accept-badge">${acc}/${tot}</span></div>` };
    }
    return true; // default rendering
  },
  ```

- [ ] **Step 9: Type-check**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/calevent-list.component.ts
  git commit -m "feat(calevent): add schedule poll actions to calevent list"
  ```

---

## Task 8: Add CSS for state-based color coding

**Files:**
- Modify: `libs/calevent/feature/src/lib/calevent-list.component.scss`

- [ ] **Step 1: Add state CSS classes**

  Append to the end of `calevent-list.component.scss`:

  ```scss
  // Schedule poll state colours
  .state-proposed {
    --fc-event-bg-color: #1e2d45;
    --fc-event-border-color: #3d5a80;
    --fc-event-text-color: #7ba7d6;
  }

  .state-provisional {
    --fc-event-bg-color: #2a2010;
    --fc-event-border-color: #7a5a10;
    --fc-event-text-color: #c89a30;
  }

  // Badge on proposed FullCalendar events
  .fc-event .accept-badge {
    display: inline-block;
    background: rgba(61, 90, 128, 0.6);
    border-radius: 4px;
    padding: 0 4px;
    font-size: 0.75em;
    margin-left: 4px;
    vertical-align: middle;
  }

  // List view: left border for state
  ion-item.state-proposed {
    border-left: 3px solid #3d5a80;
  }

  ion-item.state-provisional {
    border-left: 3px solid #7a5a10;
  }
  ```

- [ ] **Step 2: Apply state class to list view items**

  In `calevent-list.component.ts`, find where `ion-item` is rendered for list items (the `@for` loop over `filteredCalEvents()`). Add a `[class]` binding:

  ```html
  <ion-item [class]="getCalEventCssClass(calevent.state)" ...>
  ```

  Add the helper call in the template — `getCalEventCssClass` is already imported in the component via `@bk2/calevent-util`.

  Make it available in the template:

  ```typescript
  protected readonly getCalEventCssClass = getCalEventCssClass;
  ```

- [ ] **Step 3: Type-check and visual check**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Then serve the app and verify proposed events appear with blue colour:

  ```bash
  pnpm nx serve scs-app
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/calevent-list.component.scss libs/calevent/feature/src/lib/calevent-list.component.ts
  git commit -m "feat(calevent): add state-based color coding for proposed/provisional events"
  ```

---

## Task 9: Add `schedule` menu item to Firestore (data migration)

This task adds the context menu entry that triggers the schedule poll. Menu items are stored in Firestore (`menuItems` collection).

- [ ] **Step 1: Insert the schedule menu item document**

  Use the Firebase console or a seed script. Create a document in the `menuItems` collection:

  ```json
  {
    "name": "schedule",
    "label": "@menu.schedule",
    "icon": "calendar-number",
    "action": "schedule",
    "roleNeeded": "privileged",
    "tenants": ["<your-tenant-id>"],
    "isArchived": false,
    "tags": [],
    "description": "",
    "url": "",
    "menuItems": [],
    "data": []
  }
  ```

- [ ] **Step 2: Add the new document key to the `c-calevents` menu**

  Find the `c-calevents` document in the `menuItems` collection. Add the bkey of the schedule document to its `menuItems` array.

- [ ] **Step 3: Verify in app**

  Open a group calendar. Click the context menu button (⋮). Confirm "Terminabstimmung starten" appears in the menu.

- [ ] **Step 4: Commit (if you wrote a seed script)**

  ```bash
  git add <seed-script-path>
  git commit -m "chore: add schedule menu item seed for calevent context menu"
  ```

---

## Self-Review Checklist

Run this after completing all tasks before reporting done.

```bash
# Full type check across all changed libs
npx tsc --noEmit -p libs/shared/models/tsconfig.json
npx tsc --noEmit -p libs/calevent/util/tsconfig.json
npx tsc --noEmit -p libs/calevent/feature/tsconfig.json

# All calevent tests
pnpm run test calevent-util

# Build check
pnpm nx build calevent-feature
pnpm nx build shared-models
```

# Quick-Entry Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@` (person select) and `//` (date+time pick) inline triggers to the calevent quick-entry textarea, backed by a shared `QuickEntryService` reusable for future task quick-entry.

**Architecture:** `QuickEntryService` (in `@bk2/shared-util-angular`) handles trigger detection and token replacement as pure string methods. A new `DateTimeSelectModal` (in `@bk2/shared-ui`) wraps `ion-datetime` with `presentation="date-time"`. `calevent-list.component.ts` wires everything: an `(ionInput)` handler opens the appropriate modal and writes the token back into the textarea; the existing `quickEntry()` save method reads the updated `parseEventString()` result (which now parses `@Name` and `dd.MM.yyyy,HHmm` tokens) and maps the selected person to `AvatarInfo`.

**Tech Stack:** Angular 20 signals, Ionic `IonDatetime`, Vitest, `@bk2/shared-util-core` date utilities.

---

## File Map

| File | Action |
|------|--------|
| `libs/shared/util-core/src/lib/type.util.ts` | Modify — rewrite `parseEventString` with token-based parsing, remove `type` from return |
| `libs/shared/util-core/src/lib/type.util.spec.ts` | Modify — add `parseEventString` tests |
| `libs/shared/util-angular/src/lib/quick-entry.service.ts` | **Create** — `detectTrigger`, `replaceToken` |
| `libs/shared/util-angular/src/lib/quick-entry.service.spec.ts` | **Create** — unit tests for service |
| `libs/shared/util-angular/src/index.ts` | Modify — export `QuickEntryService` |
| `libs/shared/ui/src/lib/date-time-select.modal.ts` | **Create** — `ion-datetime` with `presentation="date-time"` |
| `libs/shared/ui/src/index.ts` | Modify — export `DateTimeSelectModalComponent` |
| `libs/calevent/feature/src/lib/calevent-list.component.ts` | Modify — `(ionInput)` handler, person signal, updated `quickEntry()` |

---

## Task 1: Update `parseEventString` — tests first

**Files:**
- Modify: `libs/shared/util-core/src/lib/type.util.spec.ts`
- Modify: `libs/shared/util-core/src/lib/type.util.ts`

- [ ] **Step 1: Add failing tests for the new `parseEventString` behavior**

  Open `libs/shared/util-core/src/lib/type.util.spec.ts`. Add `parseEventString` to the import at line 13 and add this describe block before the closing `});` of the outer `describe('type.util', ...)`:

  ```typescript
  import {
    // ... existing imports ...
    parseEventString,
  } from './type.util';
  ```

  Add this describe block at the end of `describe('type.util', () => {`:

  ```typescript
  describe('parseEventString', () => {
    it('extracts date token and name from text', () => {
      const result = parseEventString('Team Meeting 30.01.2026');
      expect(result.startDate).toBe('20260130');
      expect(result.startTime).toBe('');
      expect(result.name).toBe('Team Meeting');
      expect(result.location).toBe('');
    });

    it('extracts date+time token and name from text', () => {
      const result = parseEventString('Team Meeting 30.01.2026,1830');
      expect(result.startDate).toBe('20260130');
      expect(result.startTime).toBe('1830');
      expect(result.name).toBe('Team Meeting');
    });

    it('strips @person token from name', () => {
      const result = parseEventString('@Maria Muster Team Meeting 30.01.2026');
      expect(result.name).toBe('Team Meeting');
      expect(result.startDate).toBe('20260130');
    });

    it('strips @person token wherever it appears', () => {
      const result = parseEventString('Team Meeting @Maria Muster 30.01.2026,1830');
      expect(result.name).toBe('Team Meeting');
      expect(result.startDate).toBe('20260130');
      expect(result.startTime).toBe('1830');
    });

    it('returns empty fields for text with no tokens', () => {
      const result = parseEventString('Team Meeting');
      expect(result.startDate).toBe('');
      expect(result.startTime).toBe('');
      expect(result.name).toBe('Team Meeting');
      expect(result.location).toBe('');
    });

    it('returns all empty for empty input', () => {
      const result = parseEventString('');
      expect(result.startDate).toBe('');
      expect(result.startTime).toBe('');
      expect(result.name).toBe('');
      expect(result.location).toBe('');
    });
  });
  ```

- [ ] **Step 2: Run tests — expect the new tests to fail**

  ```bash
  pnpm run test shared-util-core
  ```

  Expected: new `parseEventString` tests fail because the current implementation uses the old `//type` format.

- [ ] **Step 3: Rewrite `parseEventString` in `type.util.ts`**

  Add this import at the top of `libs/shared/util-core/src/lib/type.util.ts` (after the existing imports):

  ```typescript
  import { convertDateFormatToString, DateFormat } from './date.util';
  ```

  Replace the entire `parseEventString` function (lines 618–645) with:

  ```typescript
  export function parseEventString(input: string): {
    startDate: string;
    startTime: string;
    name: string;
    location: string;
  } {
    if (!input) return { startDate: '', startTime: '', name: '', location: '' };

    // Extract dd.MM.yyyy or dd.MM.yyyy,HHmm token (modal-produced)
    const dateTimeMatch = input.match(/\b(\d{2}\.\d{2}\.\d{4})(?:,(\d{4}))?\b/);
    let startDate = '';
    let startTime = '';
    if (dateTimeMatch) {
      startDate = convertDateFormatToString(dateTimeMatch[1], DateFormat.ViewDate, DateFormat.StoreDate, false);
      startTime = dateTimeMatch[2] ?? '';
    }

    // Strip date+time and @person tokens; remainder is the event name
    const name = input
      .replace(/\b\d{2}\.\d{2}\.\d{4}(?:,\d{4})?\b/, '')
      .replace(/@\S[^@]*/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { startDate, startTime, name, location: '' };
  }
  ```

- [ ] **Step 4: Run all util-core tests — all must pass**

  ```bash
  pnpm run test shared-util-core
  ```

  Expected: all tests pass, including the new `parseEventString` suite.

- [ ] **Step 5: Type-check util-core**

  ```bash
  npx tsc --noEmit -p libs/shared/util-core/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add libs/shared/util-core/src/lib/type.util.ts libs/shared/util-core/src/lib/type.util.spec.ts
  git commit -m "feat: rewrite parseEventString with token-based parsing, remove type field"
  ```

---

## Task 2: Create `QuickEntryService`

**Files:**
- Create: `libs/shared/util-angular/src/lib/quick-entry.service.ts`
- Create: `libs/shared/util-angular/src/lib/quick-entry.service.spec.ts`
- Modify: `libs/shared/util-angular/src/index.ts`

- [ ] **Step 1: Write the failing spec**

  Create `libs/shared/util-angular/src/lib/quick-entry.service.spec.ts`:

  ```typescript
  import { describe, expect, it, beforeEach } from 'vitest';
  import { QuickEntryService } from './quick-entry.service';

  describe('QuickEntryService', () => {
    let service: QuickEntryService;

    beforeEach(() => {
      service = new QuickEntryService();
    });

    describe('detectTrigger', () => {
      it('returns "person" when text ends with @', () => {
        expect(service.detectTrigger('Team Meeting @')).toBe('person');
      });

      it('returns "person" when text is just @', () => {
        expect(service.detectTrigger('@')).toBe('person');
      });

      it('returns "date" when text ends with //', () => {
        expect(service.detectTrigger('Team Meeting //')).toBe('date');
      });

      it('returns "date" when text is just //', () => {
        expect(service.detectTrigger('//')).toBe('date');
      });

      it('returns null for regular text', () => {
        expect(service.detectTrigger('Team Meeting')).toBeNull();
      });

      it('returns null for empty string', () => {
        expect(service.detectTrigger('')).toBeNull();
      });

      it('returns null when @ is not at the end', () => {
        expect(service.detectTrigger('@Maria Muster Meeting')).toBeNull();
      });

      it('returns null when // is not at the end', () => {
        expect(service.detectTrigger('Meeting 30.01.2026 notes')).toBeNull();
      });
    });

    describe('replaceToken', () => {
      it('replaces trailing @ with person name token', () => {
        expect(service.replaceToken('Team Meeting @', '@', '@Maria Muster'))
          .toBe('Team Meeting @Maria Muster');
      });

      it('replaces trailing // with date token', () => {
        expect(service.replaceToken('Meeting //', '//', '30.01.2026'))
          .toBe('Meeting 30.01.2026');
      });

      it('replaces trailing // with date+time token', () => {
        expect(service.replaceToken('Meeting //', '//', '30.01.2026,1830'))
          .toBe('Meeting 30.01.2026,1830');
      });

      it('replaces last occurrence when trigger appears multiple times', () => {
        expect(service.replaceToken('foo @ bar @', '@', '@Anna'))
          .toBe('foo @ bar @Anna');
      });

      it('returns text unchanged when trigger not found', () => {
        expect(service.replaceToken('Meeting', '@', '@Anna')).toBe('Meeting');
      });
    });
  });
  ```

- [ ] **Step 2: Run the spec — expect it to fail**

  ```bash
  pnpm run test shared-util-angular
  ```

  Expected: FAIL — `QuickEntryService` not found.

- [ ] **Step 3: Create the service**

  Create `libs/shared/util-angular/src/lib/quick-entry.service.ts`:

  ```typescript
  import { Injectable } from '@angular/core';

  @Injectable({ providedIn: 'root' })
  export class QuickEntryService {

    public detectTrigger(text: string): 'person' | 'date' | null {
      if (text.endsWith('@')) return 'person';
      if (text.endsWith('//')) return 'date';
      return null;
    }

    public replaceToken(text: string, trigger: '@' | '//', replacement: string): string {
      const lastIndex = text.lastIndexOf(trigger);
      if (lastIndex === -1) return text;
      return text.substring(0, lastIndex) + replacement + text.substring(lastIndex + trigger.length);
    }
  }
  ```

- [ ] **Step 4: Run tests — all must pass**

  ```bash
  pnpm run test shared-util-angular
  ```

  Expected: all tests pass.

- [ ] **Step 5: Export from the lib index**

  Open `libs/shared/util-angular/src/index.ts` and add:

  ```typescript
  export * from './lib/quick-entry.service';
  ```

- [ ] **Step 6: Type-check**

  ```bash
  npx tsc --noEmit -p libs/shared/util-angular/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add libs/shared/util-angular/src/lib/quick-entry.service.ts libs/shared/util-angular/src/lib/quick-entry.service.spec.ts libs/shared/util-angular/src/index.ts
  git commit -m "feat: add QuickEntryService with detectTrigger and replaceToken"
  ```

---

## Task 3: Create `DateTimeSelectModal`

**Files:**
- Create: `libs/shared/ui/src/lib/date-time-select.modal.ts`
- Modify: `libs/shared/ui/src/index.ts`

- [ ] **Step 1: Create the modal**

  Create `libs/shared/ui/src/lib/date-time-select.modal.ts`:

  ```typescript
  import { AsyncPipe } from '@angular/common';
  import { Component, inject, input, viewChild } from '@angular/core';
  import { IonContent, IonDatetime, ModalController } from '@ionic/angular/standalone';

  import { TranslatePipe } from '@bk2/shared-i18n';
  import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

  import { HeaderComponent } from './header.component';

  @Component({
    selector: 'bk-date-time-select-modal',
    standalone: true,
    imports: [
      TranslatePipe, AsyncPipe,
      HeaderComponent,
      IonContent, IonDatetime
    ],
    template: `
      <bk-header [title]="headerTitle()" [isModal]="true" />
      <ion-content class="ion-padding">
        <ion-datetime
          #datetimePicker
          min="1900-01-01T00:00:00" max="2100-12-31T23:59:59"
          presentation="date-time"
          [value]="isoDateTime()"
          locale="de-ch"
          firstDayOfWeek="1"
          [showDefaultButtons]="true"
          doneText="{{'@general.operation.change.ok' | translate | async}}"
          cancelText="{{'@general.operation.change.cancel' | translate | async}}"
          size="cover"
          [preferWheel]="false"
          style="height: 480px; --padding-start: 0;"
          (ionCancel)="cancel()"
          (ionChange)="onDateTimeChange($event)"
        />
      </ion-content>
    `,
  })
  export class DateTimeSelectModalComponent {
    private readonly modalController = inject(ModalController);
    protected readonly datetimePicker = viewChild.required<IonDatetime>('datetimePicker');

    public isoDateTime = input(getTodayStr(DateFormat.IsoDate) + 'T08:00:00');
    public headerTitle = input('@general.operation.select.date');

    protected async onDateTimeChange(event: any): Promise<void> {
      const selected = event.detail.value || this.datetimePicker().value || this.isoDateTime();
      const isoStr = Array.isArray(selected) ? selected[0] : selected;
      await this.modalController.dismiss(isoStr, 'confirm');
    }

    protected async cancel(): Promise<boolean> {
      return await this.modalController.dismiss(null, 'cancel');
    }
  }
  ```

  > **Note on time vs full-day:** `presentation="date-time"` always returns a full ISO string. The component calling this modal treats `HH:mm === '00:00'` as full-day (token `dd.MM.yyyy`); any other time as timed (token `dd.MM.yyyy,HHmm`).

- [ ] **Step 2: Export from the lib index**

  Open `libs/shared/ui/src/index.ts` and add the export after `date-select.modal`:

  ```typescript
  export * from './lib/date-time-select.modal';
  ```

- [ ] **Step 3: Type-check**

  ```bash
  npx tsc --noEmit -p libs/shared/ui/tsconfig.json
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add libs/shared/ui/src/lib/date-time-select.modal.ts libs/shared/ui/src/index.ts
  git commit -m "feat: add DateTimeSelectModal for quick-entry date+time picking"
  ```

---

## Task 4: Wire triggers in `calevent-list.component.ts`

**Files:**
- Modify: `libs/calevent/feature/src/lib/calevent-list.component.ts`

- [ ] **Step 1: Update imports**

  In `libs/calevent/feature/src/lib/calevent-list.component.ts`, update the existing `@bk2/shared-models` import to add `AvatarInfo` and `PersonModel`:

  ```typescript
  import { AvatarInfo, CalEventModel, PersonModel, RoleName } from '@bk2/shared-models';
  ```

  Add `QuickEntryService` to the `@bk2/shared-util-angular` import:

  ```typescript
  import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions, error, isBrowser, QuickEntryService } from '@bk2/shared-util-angular';
  ```

  Add `signal` to the Angular core import (it may already be there — add only if missing):

  ```typescript
  import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, effect, inject, input, linkedSignal, OnInit, PLATFORM_ID, signal, viewChild } from '@angular/core';
  ```

- [ ] **Step 2: Add the service injection and state**

  In the component class body, after the existing injected services (around line 201 where `modalController` is injected), add:

  ```typescript
  private readonly quickEntryService = inject(QuickEntryService);
  private selectedQuickEntryPerson = signal<PersonModel | null>(null);
  private isSettingQuickEntryValue = false;
  ```

- [ ] **Step 3: Add `(ionInput)` to the quick-entry textarea in the template**

  Find this line in the template (around line 107):

  ```html
  <ion-textarea #bkQuickEntry 
    (keyup.enter)="quickEntry(bkQuickEntry)"
  ```

  Add `(ionInput)` directly after `(keyup.enter)`:

  ```html
  <ion-textarea #bkQuickEntry 
    (keyup.enter)="quickEntry(bkQuickEntry)"
    (ionInput)="onQuickEntryInput(bkQuickEntry)"
  ```

- [ ] **Step 4: Add `onQuickEntryInput` method**

  Add this method to the component class, after `protected clear(bkQuickEntry: IonTextarea)`:

  ```typescript
  protected async onQuickEntryInput(textarea: IonTextarea): Promise<void> {
    if (this.isSettingQuickEntryValue) return;
    const value = textarea.value ?? '';
    const trigger = this.quickEntryService.detectTrigger(value);
    if (!trigger) return;

    if (trigger === 'person') {
      const { PersonSelectModalComponent } = await import('@bk2/shared-feature');
      const modal = await this.modalController.create({
        component: PersonSelectModalComponent,
        cssClass: 'list-modal',
        componentProps: {
          selectedTag: '',
          currentUser: this.currentUser(),
        },
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<PersonModel>();
      this.isSettingQuickEntryValue = true;
      if (role === 'confirm' && data) {
        this.selectedQuickEntryPerson.set(data);
        textarea.value = this.quickEntryService.replaceToken(value, '@', `@${data.firstName} ${data.lastName}`);
      } else {
        textarea.value = value.slice(0, -1); // remove stray '@'
      }
      this.isSettingQuickEntryValue = false;
    }

    if (trigger === 'date') {
      const { DateTimeSelectModalComponent } = await import('@bk2/shared-ui');
      const modal = await this.modalController.create({
        component: DateTimeSelectModalComponent,
      });
      await modal.present();
      const { data, role } = await modal.onWillDismiss<string>();
      this.isSettingQuickEntryValue = true;
      if (role === 'confirm' && data) {
        const datePart = data.substring(0, 10); // 'yyyy-MM-dd'
        const viewDate = convertDateFormatToString(datePart, DateFormat.IsoDate, DateFormat.ViewDate);
        const timePart = data.length >= 16 ? data.substring(11, 16) : '00:00'; // 'HH:mm'
        const token = timePart === '00:00'
          ? viewDate
          : `${viewDate},${timePart.replace(':', '')}`;
        textarea.value = this.quickEntryService.replaceToken(value, '//', token);
      } else {
        textarea.value = value.slice(0, -2); // remove stray '//'
      }
      this.isSettingQuickEntryValue = false;
    }
  }
  ```

- [ ] **Step 5: Update `quickEntry()` save method**

  Replace the existing `quickEntry()` method body. The only changes are:
  1. Remove `calevent.type = parts.type || '';`
  2. Add person handling before `await this.store.quickEntry(calevent)`.

  The full updated method:

  ```typescript
  protected async quickEntry(bkQuickEntry: IonTextarea): Promise<void> {
    const calevent = new CalEventModel(this.store.tenantId());
    const calname = this.store.calendarName();
    if (!calname || calname === '') {
      error(undefined, 'CalEventListComponent.quickEntry: missing calendar name');
      return;
    }
    calevent.calendars = [calname];
    const parts = parseEventString(bkQuickEntry.value?.trim() ?? '');
    if (!parts.startDate || parts.startDate === '') {
      error(undefined, 'CalEventListComponent.quickEntry: startDate is mandatory in quick entry');
      return;
    }
    calevent.startDate = parts.startDate;
    if (parts.startTime && parts.startTime.length === 4) {
      calevent.startTime = parts.startTime.substring(0, 2) + ':' + parts.startTime.substring(2, 4);
      calevent.endDate = calevent.startDate;
    } else {
      calevent.endDate = calevent.startDate;
      calevent.startTime = '';
      calevent.fullDay = true;
      calevent.durationMinutes = 1440;
    }
    calevent.name = parts.name || '';
    calevent.locationKey = parts.location || '';
    const person = this.selectedQuickEntryPerson();
    if (person) {
      const avatarInfo: AvatarInfo = {
        key: person.bkey,
        name1: person.firstName,
        name2: person.lastName,
        modelType: 'person',
        type: person.gender,
        subType: '',
        label: `${person.firstName} ${person.lastName}`,
      };
      calevent.responsiblePersons = [avatarInfo];
      this.selectedQuickEntryPerson.set(null);
    }
    await this.store.quickEntry(calevent);
    bkQuickEntry.value = '';
    if (!this.isListView()) this.navigateCalendarTo(calevent.startDate);
  }
  ```

- [ ] **Step 6: Type-check the calevent feature**

  ```bash
  npx tsc --noEmit -p libs/calevent/feature/tsconfig.json
  ```

  Expected: no errors. If `signal` is already in the Angular core import, no change needed there. If there are import errors for `DateTimeSelectModalComponent` or `PersonSelectModalComponent`, confirm the `@bk2/shared-ui` and `@bk2/shared-feature` libs are listed in `libs/calevent/feature/tsconfig.json` references.

- [ ] **Step 7: Commit**

  ```bash
  git add libs/calevent/feature/src/lib/calevent-list.component.ts
  git commit -m "feat: add @ and // quick-entry triggers to calevent list"
  ```

---

## Spec Coverage Self-Check

| Spec requirement | Covered by |
|---|---|
| `@` typed → person modal opens | Task 4 Step 4 (`onQuickEntryInput`, trigger=`'person'`) |
| Person name inserted as `@Full Name` token | Task 4 Step 4 (`replaceToken` call) |
| Only one person | Task 4 Step 5 (`responsiblePersons = [avatarInfo]`, not push) |
| Save maps name to `AvatarInfo` | Task 4 Step 5 (uses `selectedQuickEntryPerson` signal) |
| `//` typed → date+time modal opens | Task 4 Step 4 (trigger=`'date'`) |
| Date+time inserted as `dd.MM.yyyy,HHmm` or `dd.MM.yyyy` | Task 4 Step 4 (`convertDateFormatToString` + time logic) |
| Midnight time → full-day token (no time) | Task 4 Step 4 (`timePart === '00:00'` check) |
| Save maps token to `startDate`+`startTime` | Task 1 (`parseEventString`) + Task 4 Step 5 |
| `type` removed from quick entry | Task 1 (no `type` in return) + Task 4 Step 5 (no `calevent.type`) |
| `QuickEntryService` in `shared/util-angular` | Task 2 |
| `detectTrigger` unit tested | Task 2 Step 1 |
| `replaceToken` unit tested | Task 2 Step 1 |
| `parseEventString` unit tested | Task 1 Step 1 |
| `!!` deferred | Not in plan (by design) |

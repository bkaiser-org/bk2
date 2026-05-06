# members-accordion memberType filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privileged-only `IonSelect` to the `bk-members-accordion` header that filters the displayed member list by `memberModelType` (`'person' | 'org' | 'group'`), defaulting to `'person'`.

**Architecture:** Single-file change in `MembersAccordionComponent`. A local `signal` holds the selected type; a `filteredMembers` computed re-filters `store.members()` by `memberModelType`. The select is rendered directly inside the existing `ion-item slot="header"` using `IonSelect`/`IonSelectOption` (avoids the nested `ion-item` problem that `bk-string-select` would cause). Visibility is gated with `@if(hasRole('privileged'))`.

**Tech Stack:** Angular 20 signals, NgRx Signal Store, Ionic Angular standalone components, TypeScript strict.

---

### Task 1: Add filter state and filtered-members computed

**Files:**
- Modify: `libs/relationship/membership/feature/src/lib/members-accordion.component.ts`

- [ ] **Step 1: Add `memberTypes` constant and `selectedMemberType` signal to the component class**

In the class body, after the existing `protected isoDate` signal, add:

```ts
protected readonly memberTypes: ('person' | 'org' | 'group')[] = ['person', 'org', 'group'];
protected selectedMemberType = signal<'person' | 'org' | 'group'>('person');
```

- [ ] **Step 2: Replace the `members` computed alias with `filteredMembers`**

Replace:
```ts
protected members = computed(() => this.store.members());
```

With:
```ts
protected filteredMembers = computed(() =>
  this.store.members().filter(m => m.memberModelType === this.selectedMemberType())
);
```

---

### Task 2: Update imports and template

**Files:**
- Modify: `libs/relationship/membership/feature/src/lib/members-accordion.component.ts`

- [ ] **Step 1: Add `IonSelect` and `IonSelectOption` to the Ionic import line**

The current Ionic import line is:
```ts
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';
```

Replace it with:
```ts
import { ActionSheetController, ActionSheetOptions, IonAccordion, IonButton, IonIcon, IonImg, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonThumbnail } from '@ionic/angular/standalone';
```

- [ ] **Step 2: Add `IonSelect` and `IonSelectOption` to the component `imports` array**

The current imports array in `@Component`:
```ts
imports: [
  TranslatePipe, RellogPipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe,
  EmptyListComponent,
  IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton, IonImg, IonThumbnail
],
```

Replace with:
```ts
imports: [
  TranslatePipe, RellogPipe, AsyncPipe, SvgIconPipe, AvatarPipe, FullNamePipe,
  EmptyListComponent,
  IonAccordion, IonItem, IonLabel, IonIcon, IonList, IonButton, IonImg, IonThumbnail,
  IonSelect, IonSelectOption
],
```

- [ ] **Step 3: Add the memberType select to the header `ion-item`**

Current header item:
```html
<ion-item slot="header" [color]="color()">
  <ion-label>{{ title() | translate | async }}</ion-label>
  @if(!isReadOnly()) {
    <ion-button fill="clear" (click)="add()" size="default">
      <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
    </ion-button>
  }
</ion-item>
```

Replace with:
```html
<ion-item slot="header" [color]="color()">
  <ion-label>{{ title() | translate | async }}</ion-label>
  @if(hasRole('privileged')) {
    <ion-select
      interface="popover"
      [value]="selectedMemberType()"
      (ionChange)="selectedMemberType.set($event.detail.value)"
      style="max-width: 120px">
      @for(type of memberTypes; track type) {
        <ion-select-option [value]="type">{{ type }}</ion-select-option>
      }
    </ion-select>
  }
  @if(!isReadOnly()) {
    <ion-button fill="clear" (click)="add()" size="default">
      <ion-icon color="secondary" slot="icon-only" src="{{'add-circle' | svgIcon }}" />
    </ion-button>
  }
</ion-item>
```

- [ ] **Step 4: Update the `@for` loop to use `filteredMembers()`**

Current `@for` line:
```html
@for(member of members(); track $index) {
```

Replace with:
```html
@for(member of filteredMembers(); track $index) {
```

Also update the empty-list guard:
```html
@if(members().length === 0) {
```
Replace with:
```html
@if(filteredMembers().length === 0) {
```

---

### Task 3: Type-check and commit

**Files:**
- Modify: `libs/relationship/membership/feature/src/lib/members-accordion.component.ts`

- [ ] **Step 1: Run the type-checker**

```bash
npx tsc --noEmit -p libs/relationship/membership/feature/tsconfig.json
```

Expected: no output (clean).

- [ ] **Step 2: Commit**

```bash
git add libs/relationship/membership/feature/src/lib/members-accordion.component.ts
git commit -m "feat: add privileged memberType filter to bk-members-accordion"
```
